import React, { useState, useEffect } from 'react';
import { Home } from './tabs/Home';
import { PitScouting } from './tabs/PitScouting';
import { AllianceStrategy } from './tabs/AllianceStrategy';
import { RawData } from './tabs/RawData';
import { EventMatchScouting } from './tabs/EventMatchScouting';
import { SyncIndicator } from './components/SyncIndicator';
import { SettingsModal } from './components/SettingsModal';
import { FaceIdCaptureModal } from './components/FaceIdCaptureModal';
import { UserProfileLoadModal } from './components/UserProfileLoadModal';
import { ToastProvider, showToast } from './components/Toast';
import { syncManager } from './lib/sync';
import { faceid } from './lib/faceid';
import {
  getProfiles,
  getActiveProfile,
  createProfile,
  setActiveProfileId,
  hydrateProfilesFromSupabase,
} from './lib/competitionProfiles';
import { tba } from './lib/tba';
import { supabase, uploadFaceIdSnapshot } from './lib/supabase';
import { CompetitionProfile, TBAEvent } from './types';
import { Settings, ClipboardList, Target, Database, Clipboard } from 'lucide-react';

type Location = 'home' | 'event';
type EventTab = 'pit' | 'match' | 'strategy' | 'raw';
type FaceIdMode = 'train' | 'test';
type UserAuthType = 'password' | 'faceid';

type UserProfile = {
  id: string;
  name: string;
  authType: UserAuthType;
  passwordHash?: string;
  passwordSalt?: string;
  faceIdName?: string;
  createdAt: number;
};

const USER_PROFILES_KEY = 'global:userProfiles';
const ACTIVE_USER_PROFILE_ID_KEY = 'global:activeUserProfileId';
const ADMIN_PIN = 'bazinga';
const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_HASH_ITERATIONS = 600000;
const USER_PROFILES_TABLE = 'admin_user_profiles';
const USER_PROFILE_STATE_TABLE = 'admin_user_state';
const GLOBAL_USER_PROFILE_STATE_ID = 'global';

const STRICT_FACE_ID_POLICY = {
  threshold: 0.27,
  minMargin: 0.06,
  minConfidence: 0.85,
  qualityFloor: 0.35,
  embeddingModel: 'face-api.js@tiny-face-detector-v1',
};

type UserProfileRow = {
  id: string;
  name: string;
  auth_type: UserAuthType;
  password_hash: string | null;
  password_salt: string | null;
  face_id_name: string | null;
  created_at: string;
};

type UserProfileStateRow = {
  id: string;
  active_user_profile_id: string | null;
};

function getLegacyStoredUserProfiles(): UserProfile[] {
  try {
    const raw = localStorage.getItem(USER_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserProfile[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((profile) => profile && typeof profile.id === 'string' && typeof profile.name === 'string');
  } catch {
    return [];
  }
}

function mapUserProfileRow(row: UserProfileRow): UserProfile {
  const createdAtTimestamp = Date.parse(row.created_at);
  return {
    id: row.id,
    name: row.name,
    authType: row.auth_type,
    passwordHash: row.password_hash || undefined,
    passwordSalt: row.password_salt || undefined,
    faceIdName: row.face_id_name || undefined,
    createdAt: Number.isNaN(createdAtTimestamp) ? Date.now() : createdAtTimestamp,
  };
}

function mapUserProfileToRow(profile: UserProfile) {
  return {
    id: profile.id,
    name: profile.name,
    auth_type: profile.authType,
    password_hash: profile.passwordHash || null,
    password_salt: profile.passwordSalt || null,
    face_id_name: profile.faceIdName || null,
    created_at: new Date(profile.createdAt).toISOString(),
  };
}

async function saveStoredUserProfiles(profiles: UserProfile[]): Promise<void> {
  // Creation and updates are supported through this flow.
  // Full profile deletion is not currently part of the product behavior.
  if (profiles.length === 0) {
    return;
  }

  const rows = profiles.map(mapUserProfileToRow);
  const { error } = await supabase.from(USER_PROFILES_TABLE).upsert(rows, { onConflict: 'id' });
  if (error) {
    throw new Error(error.message || 'Failed to save user profiles');
  }
}

async function getStoredUserProfiles(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from(USER_PROFILES_TABLE)
    .select('id, name, auth_type, password_hash, password_salt, face_id_name, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to load user profiles');
  }

  const rows = (data || []) as UserProfileRow[];
  if (rows.length > 0) {
    return rows.map(mapUserProfileRow);
  }

  const legacyProfiles = getLegacyStoredUserProfiles();
  if (legacyProfiles.length > 0) {
    await saveStoredUserProfiles(legacyProfiles);
    localStorage.removeItem(USER_PROFILES_KEY);
    return legacyProfiles;
  }

  return [];
}

async function getStoredActiveUserProfileId(): Promise<string | null> {
  const { data, error } = await supabase
    .from(USER_PROFILE_STATE_TABLE)
    .select('id, active_user_profile_id')
    .eq('id', GLOBAL_USER_PROFILE_STATE_ID)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load active user profile');
  }

  const row = data as UserProfileStateRow | null;
  if (row) {
    return row.active_user_profile_id;
  }

  const legacyActiveId = localStorage.getItem(ACTIVE_USER_PROFILE_ID_KEY);
  if (!legacyActiveId) {
    return null;
  }

  await setStoredActiveUserProfileId(legacyActiveId);
  localStorage.removeItem(ACTIVE_USER_PROFILE_ID_KEY);
  return legacyActiveId;
}

async function setStoredActiveUserProfileId(profileId: string): Promise<void> {
  const { error } = await supabase.from(USER_PROFILE_STATE_TABLE).upsert(
    {
      id: GLOBAL_USER_PROFILE_STATE_ID,
      active_user_profile_id: profileId,
    },
    { onConflict: 'id' }
  );

  if (error) {
    throw new Error(error.message || 'Failed to set active user profile');
  }
}

async function clearStoredActiveUserProfileId(): Promise<void> {
  const { error } = await supabase.from(USER_PROFILE_STATE_TABLE).upsert(
    {
      id: GLOBAL_USER_PROFILE_STATE_ID,
      active_user_profile_id: null,
    },
    { onConflict: 'id' }
  );

  if (error) {
    throw new Error(error.message || 'Failed to clear active user profile');
  }
}

function normalizeProfileNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function generateUserProfileId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `user-${crypto.randomUUID()}`;
  }
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (!hex || hex.length % 2 !== 0) {
    console.warn('Invalid hex input while decoding bytes');
    return new Uint8Array();
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    const value = Number.parseInt(hex.slice(index, index + 2), 16);
    if (!Number.isFinite(value)) {
      console.warn('Invalid hex pair while decoding bytes');
      return new Uint8Array();
    }
    bytes[index / 2] = value;
  }
  return bytes;
}

async function hashPasswordLegacy(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(new Uint8Array(digest));
}

async function hashPassword(value: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey('raw', encoder.encode(value), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );

  return {
    hash: bytesToHex(new Uint8Array(derived)),
    salt: bytesToHex(saltBytes),
  };
}

async function verifyPassword(profile: UserProfile, candidatePassword: string): Promise<boolean> {
  if (!profile.passwordHash) {
    return false;
  }

  if (!profile.passwordSalt) {
    const legacyHash = await hashPasswordLegacy(candidatePassword);
    return legacyHash === profile.passwordHash;
  }

  const encoder = new TextEncoder();
  const saltBytes = hexToBytes(profile.passwordSalt);
  if (saltBytes.length === 0) {
    console.warn('Invalid password salt for profile', profile.id);
    return false;
  }

  const passwordKey = await crypto.subtle.importKey('raw', encoder.encode(candidatePassword), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );

  return bytesToHex(new Uint8Array(derived)) === profile.passwordHash;
}

export default function App() {
  const [location, setLocation] = useState<Location>('home');
  const [activeTab, setActiveTab] = useState<EventTab>('pit');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [profiles, setProfiles] = useState<CompetitionProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<CompetitionProfile | null>(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [isUserProfileLoadModalOpen, setIsUserProfileLoadModalOpen] = useState(false);
  const [faceIdMode, setFaceIdMode] = useState<FaceIdMode | null>(null);
  const [isFaceIdBusy, setIsFaceIdBusy] = useState(false);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [signedInUserProfileId, setSignedInUserProfileId] = useState<string | null>(null);
  const [pendingFaceIdAction, setPendingFaceIdAction] = useState<
    | { type: 'create-faceid'; name: string; faceIdName: string }
    | { type: 'load-faceid'; profileId: string; profileName: string; faceIdName: string }
    | null
  >(null);

  useEffect(() => {
    syncManager.start();
    return () => syncManager.stop();
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadProfiles = async () => {
      const cachedProfiles = getProfiles();
      const cachedActiveProfile = getActiveProfile();

      if (!isCancelled) {
        setProfiles(cachedProfiles);
        setActiveProfile(cachedActiveProfile);
      }

      try {
        await hydrateProfilesFromSupabase();
      } catch (error) {
        console.error('Failed to hydrate profiles from Supabase:', error);
      }

      if (isCancelled) {
        return;
      }

      const loadedProfiles = getProfiles();
      const loadedActiveProfile = getActiveProfile();

      setProfiles(loadedProfiles);
      setActiveProfile(loadedActiveProfile);

      if (loadedActiveProfile) {
        // Keep legacy keys in sync so existing tabs and storage-backed flows keep working.
        setActiveProfileId(loadedActiveProfile.id);
      }

      try {
        const loadedUserProfiles = await getStoredUserProfiles();
        const loadedSignedInUserProfileId = await getStoredActiveUserProfileId();
        setUserProfiles(loadedUserProfiles);
        if (loadedSignedInUserProfileId && loadedUserProfiles.some((profile) => profile.id === loadedSignedInUserProfileId)) {
          setSignedInUserProfileId(loadedSignedInUserProfileId);
        } else {
          setSignedInUserProfileId(null);
          await clearStoredActiveUserProfileId();
        }
      } catch (error) {
        console.error('Failed to load admin user profiles:', error);
        setUserProfiles([]);
        setSignedInUserProfileId(null);
      }

      setIsLoadingProfiles(false);
    };

    void loadProfiles();

    return () => {
      isCancelled = true;
    };
  }, []);

  const refreshProfiles = () => {
    setProfiles(getProfiles());
    setActiveProfile(getActiveProfile());
  };

  const refreshUserProfiles = async () => {
    try {
      const loaded = await getStoredUserProfiles();
      setUserProfiles(loaded);
      if (signedInUserProfileId && !loaded.some((profile) => profile.id === signedInUserProfileId)) {
        setSignedInUserProfileId(null);
        await clearStoredActiveUserProfileId();
      }
    } catch (error) {
      console.error('Failed to refresh admin user profiles:', error);
      setSignedInUserProfileId(null);
    }
  };

  const signedInUserProfile = userProfiles.find((profile) => profile.id === signedInUserProfileId) || null;

  const handleSignOutUserProfile = async () => {
    setSignedInUserProfileId(null);
    await clearStoredActiveUserProfileId();
    showToast('Signed out');
  };

  const handleCreatePasswordUserProfile = async (params: {
    pin: string;
    name: string;
    password: string;
  }) => {
    if (isFaceIdBusy) {
      return;
    }

    if (params.pin.trim() !== ADMIN_PIN) {
      showToast('Invalid admin pin');
      return;
    }

    const name = params.name.trim();
    if (!name) {
      return;
    }

    const normalizedNameKey = normalizeProfileNameKey(name);
    const exists = userProfiles.some((profile) => normalizeProfileNameKey(profile.name) === normalizedNameKey);
    if (exists) {
      showToast('A profile with that name already exists');
      return;
    }

    const trimmedPassword = params.password.trim();
    if (!trimmedPassword) {
      showToast('Password is required');
      return;
    }
    if (trimmedPassword.length < MIN_PASSWORD_LENGTH) {
      showToast(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    const { hash, salt } = await hashPassword(trimmedPassword);
    const nextProfile: UserProfile = {
      id: generateUserProfileId(),
      name,
      authType: 'password',
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: Date.now(),
    };
    const nextProfiles = [...userProfiles, nextProfile];
    await saveStoredUserProfiles(nextProfiles);
    await setStoredActiveUserProfileId(nextProfile.id);
    setUserProfiles(nextProfiles);
    setSignedInUserProfileId(nextProfile.id);
    setIsUserProfileLoadModalOpen(false);
    showToast(`Created and signed into ${name}`);
  };

  const handleCreateFaceIdUserProfile = async (params: {
    pin: string;
    name: string;
    faceIdName: string;
  }) => {
    if (isFaceIdBusy) {
      return;
    }

    if (params.pin.trim() !== ADMIN_PIN) {
      showToast('Invalid admin pin');
      return;
    }

    const name = params.name.trim();
    if (!name) {
      return;
    }

    const normalizedNameKey = normalizeProfileNameKey(name);
    const exists = userProfiles.some((profile) => normalizeProfileNameKey(profile.name) === normalizedNameKey);
    if (exists) {
      showToast('A profile with that name already exists');
      return;
    }

    const faceIdName = params.faceIdName.trim();
    if (!faceIdName) {
      return;
    }

    setPendingFaceIdAction({ type: 'create-faceid', name, faceIdName });
    setIsUserProfileLoadModalOpen(false);
    setIsSettingsOpen(false);
    setFaceIdMode('test');
  };

  const handleLoadUserProfile = async (params: { profileId: string; password?: string }) => {
    if (isFaceIdBusy) {
      return;
    }

    if (userProfiles.length === 0) {
      showToast('No profiles available to load');
      return;
    }

    const selectedProfile = userProfiles.find((profile) => profile.id === params.profileId);
    if (!selectedProfile) {
      showToast('Invalid profile selection');
      return;
    }

    if (selectedProfile.authType === 'password') {
      const passwordMatches = await verifyPassword(selectedProfile, params.password || '');
      if (!passwordMatches) {
        showToast('Incorrect password');
        return;
      }

      await setStoredActiveUserProfileId(selectedProfile.id);
      setSignedInUserProfileId(selectedProfile.id);
      setIsUserProfileLoadModalOpen(false);
      showToast(`Signed into ${selectedProfile.name}`);
      return;
    }

    setPendingFaceIdAction({
      type: 'load-faceid',
      profileId: selectedProfile.id,
      profileName: selectedProfile.name,
      faceIdName: selectedProfile.faceIdName || selectedProfile.name,
    });
    setIsUserProfileLoadModalOpen(false);
    setIsSettingsOpen(false);
    setFaceIdMode('test');
  };

  const handleSelectProfile = (profileId: string) => {
    setActiveProfileId(profileId);
    refreshProfiles();
    setLocation('event');
    setActiveTab('pit');
  };

  const handleGoHome = () => {
    setLocation('home');
  };

  const handleCreateProfile = async () => {
    const rawEventKey = window.prompt('Enter TBA event key (example: 2026paphi):', '') || '';
    const eventKey = rawEventKey.trim().toLowerCase();

    if (!eventKey) {
      return;
    }

    setIsCreatingProfile(true);
    try {
      const [teams, eventInfo] = await Promise.all([
        tba.fetchTeams(eventKey),
        tba.fetchEvent(eventKey).catch(() => null as TBAEvent | null),
      ]);

      await createProfile({ eventKey, eventInfo, teams });
      refreshProfiles();
      setLocation('event');
      setActiveTab('pit');
      showToast(`Saved profile for ${eventInfo?.name || eventKey.toUpperCase()}`);
    } catch {
      showToast('Failed to create profile. Check event key and try again.');
    } finally {
      setIsCreatingProfile(false);
    }
  };

  const renderPage = () => {
    if (isLoadingProfiles) {
      return (
        <div className="max-w-5xl mx-auto rounded-2xl border border-slate-700 bg-slate-800/40 p-8 text-slate-300">
          Loading competition profiles...
        </div>
      );
    }

    if (location === 'home') {
      return (
        <Home
          profiles={profiles}
          activeProfile={activeProfile}
          isCreatingProfile={isCreatingProfile}
          onCreateProfile={handleCreateProfile}
          onSelectProfile={handleSelectProfile}
        />
      );
    }

    switch (activeTab) {
      case 'pit':
        return <PitScouting activeProfile={activeProfile} />;
      case 'match':
        return <EventMatchScouting activeProfile={activeProfile} />;
      case 'strategy':
        return <AllianceStrategy eventKey={activeProfile?.eventKey || ''} profileId={activeProfile?.id || null} />;
      case 'raw':
        return <RawData eventKey={activeProfile?.eventKey || ''} profileId={activeProfile?.id || null} />;
      default:
        return <PitScouting activeProfile={activeProfile} />;
    }
  };

  useEffect(() => {
    if (!activeProfile && location === 'event') {
      setLocation('home');
    }
  }, [activeProfile, location]);

  const handleFaceIdComplete = async (payload: {
    mode: FaceIdMode;
    personName: string;
    embedding: number[];
    acceptedFrames: number;
    qualityScore: number;
    snapshots: Blob[];
  }) => {
    setIsFaceIdBusy(true);
    try {
      if (payload.mode === 'train') {
        const personName = (pendingFaceIdAction?.type === 'create-faceid'
          ? pendingFaceIdAction.name
          : payload.personName).trim();
        if (!personName) {
          showToast('Name is required for Face ID training');
          return;
        }
        const scopeKey = activeProfile?.eventKey || 'global';
        const snapshotBlobs = payload.snapshots.slice(0, 5);
        const uploadTasks = snapshotBlobs.map((blob, index) => {
          const file = new File([blob], `faceid-${Date.now()}-${index + 1}.jpg`, { type: 'image/jpeg' });
          return uploadFaceIdSnapshot(scopeKey, personName, file);
        });

        const uploads = await Promise.all(uploadTasks);
        const photoUrls = uploads.map((entry) => entry.publicUrl);

        const enrollment = await faceid.train({
          personName,
          embedding: payload.embedding,
          photoUrls,
          embeddingModel: 'face-api.js@tiny-face-detector-v1',
          acceptedFrames: payload.acceptedFrames,
          qualityScore: payload.qualityScore,
          eventKey: activeProfile?.eventKey || null,
          profileId: activeProfile?.id || null,
        });

        if (pendingFaceIdAction?.type === 'create-faceid') {
          const nextProfile: UserProfile = {
            id: generateUserProfileId(),
            name: pendingFaceIdAction.name,
            authType: 'faceid',
            faceIdName: pendingFaceIdAction.faceIdName,
            createdAt: Date.now(),
          };
          const nextProfiles = [...userProfiles, nextProfile];
          await saveStoredUserProfiles(nextProfiles);
          await setStoredActiveUserProfileId(nextProfile.id);
          setUserProfiles(nextProfiles);
          setSignedInUserProfileId(nextProfile.id);
          showToast(`Created and signed into ${nextProfile.name}`);
        } else {
          showToast(`Face ID trained for ${enrollment.personName}`);
        }
      } else {
        const result = await faceid.verify({
          embedding: payload.embedding,
          threshold: STRICT_FACE_ID_POLICY.threshold,
          minMargin: STRICT_FACE_ID_POLICY.minMargin,
          minConfidence: STRICT_FACE_ID_POLICY.minConfidence,
          qualityFloor: STRICT_FACE_ID_POLICY.qualityFloor,
          embeddingModel: STRICT_FACE_ID_POLICY.embeddingModel,
          eventKey: activeProfile?.eventKey || null,
          profileId: activeProfile?.id || null,
        });

        if (pendingFaceIdAction?.type === 'create-faceid') {
          const expectedName = pendingFaceIdAction.faceIdName.toLowerCase();
          const matchedName = (result.name || '').toLowerCase();
          if (result.matched && matchedName === expectedName) {
            const nextProfile: UserProfile = {
              id: generateUserProfileId(),
              name: pendingFaceIdAction.name,
              authType: 'faceid',
              faceIdName: pendingFaceIdAction.faceIdName,
              createdAt: Date.now(),
            };
            const nextProfiles = [...userProfiles, nextProfile];
            await saveStoredUserProfiles(nextProfiles);
            await setStoredActiveUserProfileId(nextProfile.id);
            setUserProfiles(nextProfiles);
            setSignedInUserProfileId(nextProfile.id);
            showToast(`Created and signed into ${nextProfile.name}`);
          } else {
            showToast('Face ID did not match the profile name');
          }
        } else if (pendingFaceIdAction?.type === 'load-faceid') {
          const expectedName = pendingFaceIdAction.faceIdName.toLowerCase();
          const matchedName = (result.name || '').toLowerCase();
          if (result.matched && matchedName === expectedName) {
            await setStoredActiveUserProfileId(pendingFaceIdAction.profileId);
            setSignedInUserProfileId(pendingFaceIdAction.profileId);
            showToast(`Signed into ${pendingFaceIdAction.profileName}`);
          } else {
            showToast('Face ID did not match selected profile');
          }
        } else if (result.matched && result.name) {
          showToast(`High-confidence match: ${result.name}`);
        } else if (result.decision === 'borderline') {
          if (result.decisionReason === 'too_close_to_second_best') {
            showToast('Borderline match. Too close to another enrolled face. Run test again with better lighting.');
          } else {
            showToast('Borderline match. Run test again to confirm identity.');
          }
        } else {
          showToast('No strict Face ID match found');
        }
      }
    } finally {
      setIsFaceIdBusy(false);
      setPendingFaceIdAction(null);
      setFaceIdMode(null);
      await refreshUserProfiles();
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-blue-500/30">
      <nav className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-inner shadow-white/20">
              <span className="text-white font-bold font-mono text-sm">26</span>
            </div>
            <span className="font-bold text-lg hidden sm:block tracking-tight text-white">REBUILT Scout</span>
          </div>

          {location === 'event' && activeProfile ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => setActiveTab('pit')}
                className={`p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'pit'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                <span className="hidden md:block">Pit</span>
              </button>
              <button
                onClick={() => setActiveTab('match')}
                className={`p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'match'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Clipboard className="w-4 h-4" />
                <span className="hidden md:block">Match</span>
              </button>
              <button
                onClick={() => setActiveTab('strategy')}
                className={`p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'strategy'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Target className="w-4 h-4" />
                <span className="hidden md:block">Strategy</span>
              </button>
              <button
                onClick={() => setActiveTab('raw')}
                className={`p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'raw'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Database className="w-4 h-4" />
                <span className="hidden md:block">Raw</span>
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center text-sm text-slate-400">
              <span>Create or select an event folder to start scouting.</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            {activeProfile && (
              <div className="hidden lg:flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs">
                <span className="text-slate-400">Selected:</span>
                <span className="text-white font-mono uppercase">{activeProfile.eventKey}</span>
              </div>
            )}
            <SyncIndicator />
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="p-4 sm:p-6 lg:p-8">{renderPage()}</main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        activeProfile={activeProfile}
        onBackToEvents={handleGoHome}
        onOpenLoadProfileFlow={() => setIsUserProfileLoadModalOpen(true)}
        onSignOutUserProfile={() => {
          void handleSignOutUserProfile();
        }}
        signedInUserProfile={
          signedInUserProfile
            ? { name: signedInUserProfile.name, authType: signedInUserProfile.authType }
            : null
        }
        isProfileActionBusy={isFaceIdBusy}
      />

      <UserProfileLoadModal
        isOpen={isUserProfileLoadModalOpen}
        onClose={() => setIsUserProfileLoadModalOpen(false)}
        profiles={userProfiles}
        isBusy={isFaceIdBusy}
        onCreatePasswordProfile={(payload) => {
          void handleCreatePasswordUserProfile(payload);
        }}
        onCreateFaceIdProfile={(payload) => {
          void handleCreateFaceIdUserProfile(payload);
        }}
        onLoadProfile={(payload) => {
          void handleLoadUserProfile(payload);
        }}
      />

      {faceIdMode && (
        <FaceIdCaptureModal
          isOpen={Boolean(faceIdMode)}
          mode={faceIdMode}
          onClose={() => setFaceIdMode(null)}
          onComplete={handleFaceIdComplete}
        />
      )}
      <ToastProvider />
    </div>
  );
}
