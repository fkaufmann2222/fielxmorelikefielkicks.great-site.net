import { useEffect } from 'react';
import {
  getProfiles,
  getActiveProfile,
  setActiveProfileId,
  hydrateProfilesFromSupabase,
} from '../../lib/competitionProfiles';
import { syncManager } from '../../lib/sync';
import {
  clearStoredActiveUserProfileId,
  getStoredActiveUserProfileId,
  getStoredUserProfiles,
} from '../auth/profileStorage';
import { CompetitionProfile } from '../../types';
import { UserProfile } from '../types';

type UseInitialAppLoadParams = {
  setProfiles: (profiles: CompetitionProfile[]) => void;
  setActiveProfile: (profile: CompetitionProfile | null) => void;
  setUserProfiles: (profiles: UserProfile[]) => void;
  setSignedInUserProfileId: (profileId: string | null) => void;
  setIsLoadingProfiles: (loading: boolean) => void;
};

export function useInitialAppLoad(params: UseInitialAppLoadParams) {
  const {
    setProfiles,
    setActiveProfile,
    setUserProfiles,
    setSignedInUserProfileId,
    setIsLoadingProfiles,
  } = params;

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
  }, [setActiveProfile, setIsLoadingProfiles, setProfiles, setSignedInUserProfileId, setUserProfiles]);
}
