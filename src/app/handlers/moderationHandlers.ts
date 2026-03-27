import { showToast } from '../../components/Toast';
import { setScoutBanState } from '../../lib/supabase';
import { UserProfile } from '../types';

export async function banScout(params: {
  scoutProfileId: string;
  isAdminSignedIn: boolean;
  signedInUserProfile: UserProfile | null;
  refreshUserProfiles: () => Promise<void>;
}) {
  const { scoutProfileId, isAdminSignedIn, signedInUserProfile, refreshUserProfiles } = params;

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
}

export async function unbanScout(params: {
  scoutProfileId: string;
  isAdminSignedIn: boolean;
  refreshUserProfiles: () => Promise<void>;
}) {
  const { scoutProfileId, isAdminSignedIn, refreshUserProfiles } = params;

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
}
