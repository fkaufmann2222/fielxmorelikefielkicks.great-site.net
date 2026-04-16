import { showToast } from '../../components/Toast';
import {
  createProfile,
  getActiveProfile,
  getProfileByEventKey,
  getProfiles,
  saveProfiles,
  setActiveProfileId,
  setProfileTeams,
} from '../../lib/competitionProfiles';
import { tba } from '../../lib/tba';
import { CompetitionProfile, TBAEvent } from '../../types';
import { EventTab, Location } from '../types';

type RefreshProfilesParams = {
  setProfiles: (profiles: ReturnType<typeof getProfiles>) => void;
  setActiveProfile: (profile: ReturnType<typeof getActiveProfile>) => void;
};

export function refreshProfiles(params: RefreshProfilesParams) {
  const { setProfiles, setActiveProfile } = params;
  setProfiles(getProfiles());
  setActiveProfile(getActiveProfile());
}

export async function selectProfile(params: {
  profileId: string;
  isAdminSignedIn: boolean;
  setLocation: (location: Location) => void;
  setActiveTab: (tab: EventTab) => void;
} & RefreshProfilesParams) {
  const { profileId, isAdminSignedIn, setLocation, setActiveTab, setProfiles, setActiveProfile } = params;

  if (!isAdminSignedIn) {
    showToast('Only admins can choose the global event');
    return;
  }
  setActiveProfileId(profileId);

  const selectedProfile = getProfiles().find((profile) => profile.id === profileId);
  if (selectedProfile?.eventKey) {
    try {
      const [teams, eventInfo] = await Promise.all([
        tba.fetchTeams(selectedProfile.eventKey),
        tba.fetchEvent(selectedProfile.eventKey).catch(() => null as TBAEvent | null),
      ]);

      await createProfile({
        eventKey: selectedProfile.eventKey,
        eventInfo,
        teams,
      });

    } catch {
      // Keep profile selection usable even when refresh fails.
    }
  }

  refreshProfiles({ setProfiles, setActiveProfile });
  setLocation('event');
  setActiveTab('pit');
}

export async function createCompetitionProfile(params: {
  isAdminSignedIn: boolean;
  setIsCreatingProfile: (isCreating: boolean) => void;
  setLocation: (location: Location) => void;
  setActiveTab: (tab: EventTab) => void;
} & RefreshProfilesParams) {
  const { isAdminSignedIn, setIsCreatingProfile, setLocation, setActiveTab, setProfiles, setActiveProfile } = params;

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
    refreshProfiles({ setProfiles, setActiveProfile });
    setLocation('event');
    setActiveTab('pit');
    showToast(`Saved profile for ${eventInfo?.name || eventKey.toUpperCase()}`);
  } catch {
    showToast('Failed to create profile. Check event key and try again.');
  } finally {
    setIsCreatingProfile(false);
  }
}

export async function ensureScoutDefaultEventProfile(params: {
  eventKey: string;
} & RefreshProfilesParams) {
  const { eventKey, setProfiles, setActiveProfile } = params;
  const normalizedEventKey = eventKey.trim().toLowerCase();
  if (!normalizedEventKey) {
    return;
  }

  const existingProfile = getProfileByEventKey(normalizedEventKey);
  if (existingProfile) {
    setActiveProfileId(existingProfile.id);
    refreshProfiles({ setProfiles, setActiveProfile });
    return;
  }

  try {
    const [teams, eventInfo] = await Promise.all([
      tba.fetchTeams(normalizedEventKey),
      tba.fetchEvent(normalizedEventKey).catch(() => null as TBAEvent | null),
    ]);
    await createProfile({ eventKey: normalizedEventKey, eventInfo, teams });
  } catch (error) {
    console.warn('Failed to ensure default scout event profile. Attempting local-only fallback.', {
      eventKey: normalizedEventKey,
      error,
    });

    try {
      await createProfile({ eventKey: normalizedEventKey, eventInfo: null, teams: [] });
    } catch (fallbackError) {
      console.error('Failed to create fallback default scout event profile', {
        eventKey: normalizedEventKey,
        error: fallbackError,
      });
    }
  }

  const ensuredProfile = getProfileByEventKey(normalizedEventKey);
  if (ensuredProfile) {
    setActiveProfileId(ensuredProfile.id);
  } else {
    const now = Date.now();
    const localFallbackProfile: CompetitionProfile = {
      id: `${normalizedEventKey}-${now}`,
      eventKey: normalizedEventKey,
      name: normalizedEventKey.toUpperCase(),
      location: 'Unknown location',
      year: undefined,
      teamCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    saveProfiles([localFallbackProfile, ...getProfiles()]);
    setProfileTeams(localFallbackProfile.id, []);
    setActiveProfileId(localFallbackProfile.id);
    console.info('Created local-only fallback default scout event profile; scout can continue without admin intervention', {
      eventKey: normalizedEventKey,
    });
  }

  refreshProfiles({ setProfiles, setActiveProfile });
}
