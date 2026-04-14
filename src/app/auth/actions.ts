import React from 'react';
import { showToast } from '../../components/Toast';
import { UserRole } from '../../types';
import { ADMIN_PIN, ADMIN_SIGNUP_ENABLED, MIN_PASSWORD_LENGTH } from '../constants';
import { hashPassword, verifyPassword } from './passwordCrypto';
import {
  clearStoredActiveUserProfileId,
  generateUserProfileId,
  normalizeProfileNameKey,
  saveStoredUserProfiles,
  setStoredActiveUserProfileId,
} from './profileStorage';
import { FaceIdMode, PendingFaceIdAction, UserProfile } from '../types';

type ProfileStateSetters = {
  setUserProfiles: React.Dispatch<React.SetStateAction<UserProfile[]>>;
  setSignedInUserProfileId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setFaceIdMode: React.Dispatch<React.SetStateAction<FaceIdMode | null>>;
  setPendingFaceIdAction: React.Dispatch<React.SetStateAction<PendingFaceIdAction>>;
};

export async function signOutUserProfile(params: {
  resetAuthInputs: () => void;
  setAuthMode: React.Dispatch<React.SetStateAction<'login' | 'signup'>>;
} & Pick<ProfileStateSetters, 'setSignedInUserProfileId'>): Promise<void> {
  const { setSignedInUserProfileId, resetAuthInputs, setAuthMode } = params;
  setSignedInUserProfileId(null);
  await clearStoredActiveUserProfileId();
  resetAuthInputs();
  setAuthMode('login');
  showToast('Signed out');
}

export async function createPasswordUserProfile(params: {
  role: UserRole;
  pin?: string;
  name: string;
  password: string;
  isFaceIdBusy: boolean;
  userProfiles: UserProfile[];
} & Pick<ProfileStateSetters, 'setUserProfiles' | 'setSignedInUserProfileId'> & {
    resetAuthInputs: () => void;
  }): Promise<void> {
  const {
    role,
    pin,
    name: rawName,
    password,
    isFaceIdBusy,
    userProfiles,
    setUserProfiles,
    setSignedInUserProfileId,
    resetAuthInputs,
  } = params;

  if (isFaceIdBusy) {
    return;
  }

  if (role === 'admin' && !ADMIN_SIGNUP_ENABLED) {
    showToast('New admin account creation is disabled');
    return;
  }

  if (role === 'admin' && (pin || '').trim() !== ADMIN_PIN) {
    showToast('Invalid admin invite PIN');
    return;
  }

  const name = rawName.trim();
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

  const trimmedPassword = password.trim();
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
    role,
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
}

export async function createFaceIdUserProfile(params: {
  role: UserRole;
  pin?: string;
  name: string;
  faceIdName: string;
  isFaceIdBusy: boolean;
  userProfiles: UserProfile[];
} & Pick<
  ProfileStateSetters,
  'setPendingFaceIdAction' | 'setIsSettingsOpen' | 'setFaceIdMode'
>): Promise<void> {
  const {
    role,
    pin,
    name: rawName,
    faceIdName: rawFaceIdName,
    isFaceIdBusy,
    userProfiles,
    setPendingFaceIdAction,
    setIsSettingsOpen,
    setFaceIdMode,
  } = params;

  if (isFaceIdBusy) {
    return;
  }

  if (role === 'admin' && !ADMIN_SIGNUP_ENABLED) {
    showToast('New admin account creation is disabled');
    return;
  }

  if (role !== 'admin') {
    showToast('Face ID is only available for admin profiles');
    return;
  }

  if ((pin || '').trim() !== ADMIN_PIN) {
    showToast('Invalid admin invite PIN');
    return;
  }

  const name = rawName.trim();
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

  const faceIdName = rawFaceIdName.trim();
  if (!faceIdName) {
    showToast('Face ID name is required');
    return;
  }

  setPendingFaceIdAction({ type: 'create-faceid', name, faceIdName, role: 'admin' });
  setIsSettingsOpen(false);
  setFaceIdMode('test');
}

export async function loadUserProfile(params: {
  profileId: string;
  password?: string;
  authRole: UserRole;
  isFaceIdBusy: boolean;
  userProfiles: UserProfile[];
} & Pick<
  ProfileStateSetters,
  'setSignedInUserProfileId' | 'setPendingFaceIdAction' | 'setIsSettingsOpen' | 'setFaceIdMode'
> & {
    resetAuthInputs: () => void;
  }): Promise<void> {
  const {
    profileId,
    password,
    authRole,
    isFaceIdBusy,
    userProfiles,
    setSignedInUserProfileId,
    setPendingFaceIdAction,
    setIsSettingsOpen,
    setFaceIdMode,
    resetAuthInputs,
  } = params;

  if (isFaceIdBusy) {
    return;
  }

  if (userProfiles.length === 0) {
    showToast('No profiles available to load');
    return;
  }

  const selectedProfile = userProfiles.find((profile) => profile.id === profileId);
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
    const passwordMatches = await verifyPassword(selectedProfile, password || '');
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
}
