import React, { useState, useEffect } from 'react';
import { Home } from './tabs/Home';
import { PitScouting } from './tabs/PitScouting';
import { AllianceStrategy } from './tabs/AllianceStrategy';
import { RawData } from './tabs/RawData';
import { EventMatchScouting } from './tabs/EventMatchScouting';
import { AdminMatchCleanup } from './tabs/AdminMatchCleanup';
import { MatchScoutingCoverage } from './tabs/MatchScoutingCoverage';
import { SyncIndicator } from './components/SyncIndicator';
import { SettingsModal } from './components/SettingsModal';
import { FaceIdCaptureModal } from './components/FaceIdCaptureModal';
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
import { supabase, uploadFaceIdSnapshot, setScoutBanState } from './lib/supabase';
import { CompetitionProfile, TBAEvent, UserRole } from './types';
import { Settings, ClipboardList, Target, Database, Clipboard, Shield, LayoutGrid, LogOut } from 'lucide-react';

type Location = 'home' | 'event';
type EventTab = 'pit' | 'match' | 'strategy' | 'raw' | 'admin' | 'coverage';
type FaceIdMode = 'train' | 'test';
type UserAuthType = 'password' | 'faceid';

type UserProfile = {
  id: string;
  name: string;
  role: UserRole;
  authType: UserAuthType;
  passwordHash?: string;
  passwordSalt?: string;
  faceIdName?: string;
  bannedAt?: string | null;
  bannedReason?: string | null;
  bannedByProfileId?: string | null;
  createdAt: number;
};

const USER_PROFILES_KEY = 'global:userProfiles';
const LEGACY_ACTIVE_USER_PROFILE_ID_KEY = 'global:activeUserProfileId';
const ACTIVE_USER_PROFILE_ID_KEY = 'device:activeUserProfileId';
const ADMIN_PIN = 'bazinga';
const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_HASH_ITERATIONS = 600000;
const USER_PROFILES_TABLE = 'admin_user_profiles';

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
  role: UserRole;
  auth_type: UserAuthType;
  password_hash: string | null;
  password_salt: string | null;
  face_id_name: string | null;
  banned_at: string | null;
  banned_reason: string | null;
  banned_by_profile_id: string | null;
  created_at: string;
};

function getLegacyStoredUserProfiles(): UserProfile[] {
  try {
    const raw = localStorage.getItem(USER_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserProfile[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((profile) => profile && typeof profile.id === 'string' && typeof profile.name === 'string')
      .map((profile) => ({
        ...profile,
        role: profile.role === 'scout' ? 'scout' : 'admin',
      }));
  } catch {
    return [];
  }
}

function mapUserProfileRow(row: UserProfileRow): UserProfile {
  const createdAtTimestamp = Date.parse(row.created_at);
  return {
    id: row.id,
    name: row.name,
    role: row.role || 'admin',
    authType: row.auth_type,
    passwordHash: row.password_hash || undefined,
    passwordSalt: row.password_salt || undefined,
    faceIdName: row.face_id_name || undefined,
    bannedAt: row.banned_at,
    bannedReason: row.banned_reason,
    bannedByProfileId: row.banned_by_profile_id,
    createdAt: Number.isNaN(createdAtTimestamp) ? Date.now() : createdAtTimestamp,
  };
}

function mapUserProfileToRow(profile: UserProfile) {
  return {
    id: profile.id,
    name: profile.name,
    role: profile.role,
    auth_type: profile.authType,
    password_hash: profile.passwordHash || null,
    password_salt: profile.passwordSalt || null,
    face_id_name: profile.faceIdName || null,
    banned_at: profile.bannedAt || null,
    banned_reason: profile.bannedReason || null,
    banned_by_profile_id: profile.bannedByProfileId || null,
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
    .select('id, name, role, auth_type, password_hash, password_salt, face_id_name, banned_at, banned_reason, banned_by_profile_id, created_at')
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
  const activeId = localStorage.getItem(ACTIVE_USER_PROFILE_ID_KEY);
  if (activeId) {
    return activeId;
  }

  const legacyActiveId = localStorage.getItem(LEGACY_ACTIVE_USER_PROFILE_ID_KEY);
  if (!legacyActiveId) {
    return null;
  }

  localStorage.setItem(ACTIVE_USER_PROFILE_ID_KEY, legacyActiveId);
  localStorage.removeItem(LEGACY_ACTIVE_USER_PROFILE_ID_KEY);
  return legacyActiveId;
}

async function setStoredActiveUserProfileId(profileId: string): Promise<void> {
  localStorage.setItem(ACTIVE_USER_PROFILE_ID_KEY, profileId);
}

async function clearStoredActiveUserProfileId(): Promise<void> {
  localStorage.removeItem(ACTIVE_USER_PROFILE_ID_KEY);
  localStorage.removeItem(LEGACY_ACTIVE_USER_PROFILE_ID_KEY);
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
  const normalizedSaltBytes = Uint8Array.from(saltBytes);
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey('raw', encoder.encode(value), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: normalizedSaltBytes,
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );

  return {
    hash: bytesToHex(new Uint8Array(derived)),
    salt: bytesToHex(normalizedSaltBytes),
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
  const normalizedSaltBytes = Uint8Array.from(saltBytes);
  if (normalizedSaltBytes.length === 0) {
    console.warn('Invalid password salt for profile', profile.id);
    return false;
  }

  const passwordKey = await crypto.subtle.importKey('raw', encoder.encode(candidatePassword), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: normalizedSaltBytes,
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
  const [faceIdMode, setFaceIdMode] = useState<FaceIdMode | null>(null);
  const [isFaceIdBusy, setIsFaceIdBusy] = useState(false);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [signedInUserProfileId, setSignedInUserProfileId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authRole, setAuthRole] = useState<UserRole>('scout');
  const [authName, setAuthName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authSignupType, setAuthSignupType] = useState<UserAuthType>('password');
  const [authFaceIdName, setAuthFaceIdName] = useState('');
  const [selectedLoginProfileId, setSelectedLoginProfileId] = useState<string>('');
  const [pendingFaceIdAction, setPendingFaceIdAction] = useState<
    | { type: 'create-faceid'; name: string; faceIdName: string; role: UserRole }
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
        const matchedProfile = loadedUserProfiles.find((profile) => profile.id === loadedSignedInUserProfileId);
        if (matchedProfile && !matchedProfile.bannedAt) {
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
      if (signedInUserProfileId) {
        const active = loaded.find((profile) => profile.id === signedInUserProfileId);
        if (!active || active.bannedAt) {
          setSignedInUserProfileId(null);
          await clearStoredActiveUserProfileId();
        }
      }
    } catch (error) {
      console.error('Failed to refresh admin user profiles:', error);
      setSignedInUserProfileId(null);
    }
  };

  const signedInUserProfile = userProfiles.find((profile) => profile.id === signedInUserProfileId) || null;
  const isAdminSignedIn = signedInUserProfile?.role === 'admin';
  const isScoutSignedIn = signedInUserProfile?.role === 'scout';
  const loginProfiles = userProfiles.filter((profile) => {
    if (profile.role !== authRole) {
      return false;
    }
    if (profile.role === 'scout' && profile.bannedAt) {
      return false;
    }
    return true;
  });

  useEffect(() => {
    if (authMode !== 'login') {
      return;
    }
    if (loginProfiles.length === 0) {
      setSelectedLoginProfileId('');
      return;
    }
    if (!loginProfiles.some((profile) => profile.id === selectedLoginProfileId)) {
      setSelectedLoginProfileId(loginProfiles[0].id);
    }
  }, [authMode, loginProfiles, selectedLoginProfileId]);

  const resetAuthInputs = () => {
    setAuthName('');
    setAuthPassword('');
    setAuthPin('');
    setAuthFaceIdName('');
  };

  const handleSignOutUserProfile = async () => {
    setSignedInUserProfileId(null);
    await clearStoredActiveUserProfileId();
    resetAuthInputs();
    setAuthMode('login');
    showToast('Signed out');
  };

  const handleCreatePasswordUserProfile = async (params: {
    role: UserRole;
    pin?: string;
    name: string;
    password: string;
  }) => {
    if (isFaceIdBusy) {
      return;
    }

    if (params.role === 'admin' && (params.pin || '').trim() !== ADMIN_PIN) {
      showToast('Invalid admin invite PIN');
      return;
    }

    const name = params.name.trim();
    if (!name) {
      showToast('Name is required');
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
      role: params.role,
      authType: 'password',
      passwordHash: hash,
      passwordSalt: salt,
      bannedAt: null,
      bannedReason: null,
      bannedByProfileId: null,
      createdAt: Date.now(),
    };
    const nextProfiles = [...userProfiles, nextProfile];
    await saveStoredUserProfiles(nextProfiles);
    await setStoredActiveUserProfileId(nextProfile.id);
    setUserProfiles(nextProfiles);
    setSignedInUserProfileId(nextProfile.id);
    resetAuthInputs();
    showToast(`Created and signed into ${name}`);
  };

  const handleCreateFaceIdUserProfile = async (params: {
    role: UserRole;
    pin?: string;
    name: string;
    faceIdName: string;
  }) => {
    if (isFaceIdBusy) {
      return;
    }

    if (params.role !== 'admin') {
      showToast('Face ID is only available for admin profiles');
      return;
    }

    if ((params.pin || '').trim() !== ADMIN_PIN) {
      showToast('Invalid admin invite PIN');
      return;
    }

    const name = params.name.trim();
    if (!name) {
      showToast('Name is required');
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
      showToast('Face ID name is required');
      return;
    }

    setPendingFaceIdAction({ type: 'create-faceid', name, faceIdName, role: 'admin' });
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

    if (selectedProfile.role !== authRole) {
      showToast('Selected profile does not match role filter');
      return;
    }

    if (selectedProfile.role === 'scout' && selectedProfile.bannedAt) {
      showToast(selectedProfile.bannedReason || 'This scout profile is banned');
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
      resetAuthInputs();
      showToast(`Signed into ${selectedProfile.name}`);
      return;
    }

    if (selectedProfile.role !== 'admin') {
      showToast('Only admins can use Face ID');
      return;
    }

    setPendingFaceIdAction({
      type: 'load-faceid',
      profileId: selectedProfile.id,
      profileName: selectedProfile.name,
      faceIdName: selectedProfile.faceIdName || selectedProfile.name,
    });
    setIsSettingsOpen(false);
    setFaceIdMode('test');
  };

  const handleSelectProfile = (profileId: string) => {
    if (!isAdminSignedIn) {
      showToast('Only admins can choose the global event');
      return;
    }
    setActiveProfileId(profileId);
    refreshProfiles();
    setLocation('event');
    setActiveTab('pit');
  };

  const handleGoHome = () => {
    setLocation('home');
  };

  const handleCreateProfile = async () => {
    if (!isAdminSignedIn) {
      showToast('Only admins can create competition profiles');
      return;
    }

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

  const handleBanScout = async (scoutProfileId: string) => {
    if (!isAdminSignedIn || !signedInUserProfile) {
      showToast('Only admins can ban scouts');
      return;
    }

    try {
      await setScoutBanState({
        scoutProfileId,
        banned: true,
        bannedBy: signedInUserProfile.id,
        reason: `Banned by ${signedInUserProfile.name}`,
      });
      await refreshUserProfiles();
      showToast('Scout banned and kicked');
    } catch (error) {
      console.error('Failed to ban scout:', error);
      showToast('Failed to ban scout');
    }
  };

  const handleUnbanScout = async (scoutProfileId: string) => {
    if (!isAdminSignedIn) {
      showToast('Only admins can unban scouts');
      return;
    }

    try {
      await setScoutBanState({
        scoutProfileId,
        banned: false,
      });
      await refreshUserProfiles();
      showToast('Scout unbanned');
    } catch (error) {
      console.error('Failed to unban scout:', error);
      showToast('Failed to unban scout');
    }
  };

  const selectedLoginProfile = loginProfiles.find((profile) => profile.id === selectedLoginProfileId) || null;

  const handleLoginSubmit = async () => {
    if (!selectedLoginProfileId) {
      showToast('Choose a profile first');
      return;
    }

    if (selectedLoginProfile?.authType === 'faceid') {
      await handleLoadUserProfile({ profileId: selectedLoginProfileId });
      return;
    }

    await handleLoadUserProfile({ profileId: selectedLoginProfileId, password: authPassword });
  };

  const handleSignupSubmit = async () => {
    if (authRole === 'admin' && authSignupType === 'faceid') {
      await handleCreateFaceIdUserProfile({
        role: 'admin',
        pin: authPin,
        name: authName,
        faceIdName: authFaceIdName || authName,
      });
      return;
    }

    await handleCreatePasswordUserProfile({
      role: authRole,
      pin: authRole === 'admin' ? authPin : undefined,
      name: authName,
      password: authPassword,
    });
  };

  const renderPage = () => {
    if (isLoadingProfiles) {
      return (
        <div className="max-w-5xl mx-auto rounded-2xl border border-slate-700 bg-slate-800/40 p-8 text-slate-300">
          Loading competition profiles...
        </div>
      );
    }

    if (!signedInUserProfile) {
      return null;
    }

    if (location === 'home') {
      if (!isAdminSignedIn) {
        return (
          <div className="max-w-4xl mx-auto rounded-2xl border border-slate-700 bg-slate-800/40 p-8 text-slate-300">
            Waiting for an admin to select the active event profile. Scouts cannot change the global event.
          </div>
        );
      }

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
        return isAdminSignedIn ? (
          <PitScouting activeProfile={activeProfile} />
        ) : (
          <EventMatchScouting
            activeProfile={activeProfile}
            isAdminScout={isAdminSignedIn}
            adminProfileId={signedInUserProfile?.id || null}
            scoutProfileId={isScoutSignedIn ? signedInUserProfile.id : null}
          />
        );
      case 'match':
        return (
          <EventMatchScouting
            activeProfile={activeProfile}
            isAdminScout={isAdminSignedIn}
            adminProfileId={signedInUserProfile?.id || null}
            scoutProfileId={isScoutSignedIn ? signedInUserProfile.id : null}
          />
        );
      case 'strategy':
        return <AllianceStrategy eventKey={activeProfile?.eventKey || ''} profileId={activeProfile?.id || null} />;
      case 'raw':
        return <RawData eventKey={activeProfile?.eventKey || ''} profileId={activeProfile?.id || null} scope="global" />;
      case 'admin':
        return isAdminSignedIn ? (
          <AdminMatchCleanup
            eventKey={activeProfile?.eventKey || ''}
            scoutProfiles={userProfiles.filter((profile) => profile.role === 'scout')}
            onBanScout={handleBanScout}
            onUnbanScout={handleUnbanScout}
          />
        ) : (
          <EventMatchScouting
            activeProfile={activeProfile}
            isAdminScout={isAdminSignedIn}
            adminProfileId={signedInUserProfile?.id || null}
            scoutProfileId={isScoutSignedIn ? signedInUserProfile.id : null}
          />
        );
      case 'coverage':
        return isAdminSignedIn ? (
          <MatchScoutingCoverage eventKey={activeProfile?.eventKey || ''} />
        ) : (
          <EventMatchScouting
            activeProfile={activeProfile}
            isAdminScout={isAdminSignedIn}
            adminProfileId={signedInUserProfile?.id || null}
            scoutProfileId={isScoutSignedIn ? signedInUserProfile.id : null}
          />
        );
      default:
        return isAdminSignedIn ? (
          <PitScouting activeProfile={activeProfile} />
        ) : (
          <EventMatchScouting
            activeProfile={activeProfile}
            isAdminScout={isAdminSignedIn}
            adminProfileId={signedInUserProfile?.id || null}
            scoutProfileId={isScoutSignedIn ? signedInUserProfile.id : null}
          />
        );
    }
  };

  useEffect(() => {
    if (!activeProfile && location === 'event') {
      setLocation('home');
    }
  }, [activeProfile, location]);

  useEffect(() => {
    if (!signedInUserProfile && activeTab === 'admin') {
      setActiveTab('pit');
    }
    if (!signedInUserProfile && activeTab === 'coverage') {
      setActiveTab('pit');
    }
    if (isScoutSignedIn && activeTab === 'admin') {
      setActiveTab('match');
    }
    if (isScoutSignedIn && activeTab === 'coverage') {
      setActiveTab('match');
    }
    if (isScoutSignedIn && activeTab === 'pit') {
      setActiveTab('match');
    }
  }, [signedInUserProfile, isScoutSignedIn, activeTab]);

  useEffect(() => {
    if (isScoutSignedIn) {
      setLocation('event');
    }
  }, [isScoutSignedIn]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshUserProfiles();
    }, 15000);

    const onFocus = () => {
      void refreshUserProfiles();
    };

    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [signedInUserProfileId]);

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
            role: pendingFaceIdAction.role,
            authType: 'faceid',
            faceIdName: pendingFaceIdAction.faceIdName,
            bannedAt: null,
            bannedReason: null,
            bannedByProfileId: null,
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
              role: pendingFaceIdAction.role,
              authType: 'faceid',
              faceIdName: pendingFaceIdAction.faceIdName,
              bannedAt: null,
              bannedReason: null,
              bannedByProfileId: null,
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
      {!signedInUserProfile && !isLoadingProfiles ? (
        <main className="min-h-screen flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-800/50 p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Sign in to Scout</h1>
              <p className="text-sm text-slate-300">
                Login is required. Scouts use name + password only. Admins can use password or Face ID.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-700 p-1 bg-slate-900/60">
              <button
                onClick={() => {
                  setAuthMode('login');
                  setAuthPassword('');
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  authMode === 'login' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                Login
              </button>
              <button
                onClick={() => {
                  setAuthMode('signup');
                  setAuthPassword('');
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  authMode === 'signup' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                Sign Up
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-700 p-1 bg-slate-900/60">
              <button
                onClick={() => {
                  setAuthRole('scout');
                  setAuthSignupType('password');
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  authRole === 'scout' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                Scout
              </button>
              <button
                onClick={() => setAuthRole('admin')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  authRole === 'admin' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                Admin
              </button>
            </div>

            {authMode === 'login' ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-300">
                  Profile
                  <select
                    value={selectedLoginProfileId}
                    onChange={(event) => setSelectedLoginProfileId(event.target.value)}
                    className="mt-1 w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
                  >
                    <option value="">Select profile...</option>
                    {loginProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} ({profile.authType})
                      </option>
                    ))}
                  </select>
                </label>

                {selectedLoginProfile?.authType === 'password' && (
                  <label className="block text-sm font-medium text-slate-300">
                    Password
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                      className="mt-1 w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
                    />
                  </label>
                )}

                <button
                  onClick={() => {
                    void handleLoginSubmit();
                  }}
                  disabled={isFaceIdBusy}
                  className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectedLoginProfile?.authType === 'faceid' ? 'Login with Face ID' : 'Login'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-300">
                  Name
                  <input
                    type="text"
                    value={authName}
                    onChange={(event) => setAuthName(event.target.value)}
                    className="mt-1 w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
                  />
                </label>

                {authRole === 'admin' && (
                  <label className="block text-sm font-medium text-slate-300">
                    Admin Invite PIN
                    <input
                      type="password"
                      value={authPin}
                      onChange={(event) => setAuthPin(event.target.value)}
                      className="mt-1 w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
                    />
                  </label>
                )}

                {authRole === 'admin' && (
                  <label className="block text-sm font-medium text-slate-300">
                    Auth Type
                    <select
                      value={authSignupType}
                      onChange={(event) => setAuthSignupType(event.target.value as UserAuthType)}
                      className="mt-1 w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
                    >
                      <option value="password">Password</option>
                      <option value="faceid">Face ID</option>
                    </select>
                  </label>
                )}

                {(authRole === 'scout' || authSignupType === 'password') && (
                  <label className="block text-sm font-medium text-slate-300">
                    Password
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                      className="mt-1 w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
                    />
                  </label>
                )}

                {authRole === 'admin' && authSignupType === 'faceid' && (
                  <label className="block text-sm font-medium text-slate-300">
                    Face ID Name
                    <input
                      type="text"
                      value={authFaceIdName}
                      onChange={(event) => setAuthFaceIdName(event.target.value)}
                      placeholder={authName || 'Face ID profile name'}
                      className="mt-1 w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
                    />
                  </label>
                )}

                <button
                  onClick={() => {
                    void handleSignupSubmit();
                  }}
                  disabled={isFaceIdBusy}
                  className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {authRole === 'admin' ? 'Create Admin Account' : 'Create Scout Account'}
                </button>
              </div>
            )}
          </div>
        </main>
      ) : (
        <>
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
              {isAdminSignedIn && (
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
              )}
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
              {isAdminSignedIn && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                    activeTab === 'admin'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span className="hidden md:block">Admin</span>
                </button>
              )}
              {isAdminSignedIn && (
                <button
                  onClick={() => setActiveTab('coverage')}
                  className={`p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                    activeTab === 'coverage'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden md:block">Coverage</span>
                </button>
              )}
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
            {signedInUserProfile && (
              <button
                onClick={() => {
                  void handleSignOutUserProfile();
                }}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs border border-slate-700 text-slate-200 rounded-lg hover:border-slate-500"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            )}
            <SyncIndicator />
            {isAdminSignedIn && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="p-4 sm:p-6 lg:p-8">{renderPage()}</main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        activeProfile={activeProfile}
        onBackToEvents={handleGoHome}
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
        </>
      )}

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
