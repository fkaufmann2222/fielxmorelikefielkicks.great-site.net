import { showToast } from '../../components/Toast';
import { UserRole } from '../../types';
import { ADMIN_SIGNUP_ENABLED } from '../constants';
import { UserAuthType, UserProfile } from '../types';

export async function loginSubmit(params: {
  selectedLoginProfileId: string;
  selectedLoginProfile: UserProfile | null;
  authPassword: string;
  onLoadUserProfile: (params: { profileId: string; password?: string }) => Promise<void>;
}) {
  const { selectedLoginProfileId, selectedLoginProfile, authPassword, onLoadUserProfile } = params;

  if (!selectedLoginProfileId) {
    showToast('Choose a profile first');
    return;
  }

  if (selectedLoginProfile?.authType === 'faceid') {
    await onLoadUserProfile({ profileId: selectedLoginProfileId });
    return;
  }

  await onLoadUserProfile({ profileId: selectedLoginProfileId, password: authPassword });
}

export async function signupSubmit(params: {
  authRole: UserRole;
  authSignupType: UserAuthType;
  authPin: string;
  authName: string;
  authFaceIdName: string;
  authPassword: string;
  onCreateFaceIdUserProfile: (params: {
    role: UserRole;
    pin?: string;
    name: string;
    faceIdName: string;
  }) => Promise<void>;
  onCreatePasswordUserProfile: (params: {
    role: UserRole;
    pin?: string;
    name: string;
    password: string;
  }) => Promise<void>;
}) {
  const {
    authRole,
    authSignupType,
    authPin,
    authName,
    authFaceIdName,
    authPassword,
    onCreateFaceIdUserProfile,
    onCreatePasswordUserProfile,
  } = params;

  if (authRole === 'admin' && !ADMIN_SIGNUP_ENABLED) {
    showToast('New admin account creation is disabled');
    return;
  }

  if (authRole === 'admin' && authSignupType === 'faceid') {
    await onCreateFaceIdUserProfile({
      role: 'admin',
      pin: authPin,
      name: authName,
      faceIdName: authFaceIdName || authName,
    });
    return;
  }

  await onCreatePasswordUserProfile({
    role: authRole,
    pin: authRole === 'admin' ? authPin : undefined,
    name: authName,
    password: authPassword,
  });
}
