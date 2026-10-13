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
import { CompetitionProfile, TBATeam, TBAEvent } from '../../types';
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
  eventKey: unknown;
  teamList?: unknown;
  title?: unknown;
  isAdminSignedIn: boolean;
  setIsCreatingProfile: (isCreating: boolean) => void;
  setLocation: (location: Location) => void;
  setActiveTab: (tab: EventTab) => void;
} & RefreshProfilesParams) {
  const { eventKey: rawEventKey, teamList: rawTeamList, title: rawTitle, isAdminSignedIn, setIsCreatingProfile, setLocation, setActiveTab, setProfiles, setActiveProfile } = params;

  if (!isAdminSignedIn) {
    showToast('Only admins can create competition profiles');
    return;
  }

  const eventKey = typeof rawEventKey === 'string' || typeof rawEventKey === 'number'
    ? String(rawEventKey).trim().toLowerCase()
    : '';
  const teamNumbers = typeof rawTeamList === 'string'
    ? Array.from(new Set(rawTeamList.split(/[\\s,;]+/).map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0)))
    : [];
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';

  if (!eventKey) {
    showToast('Enter an event key first.');
    return;
  }

  if (rawTeamList !== undefined && teamNumbers.length === 0) {
    showToast('Enter at least one valid team number.');
    return;
  }

  const manualTeams: TBATeam[] = teamNumbers.map((teamNumber) => ({
    key: `frc${teamNumber}`,
    team_number: teamNumber,
    nickname: '',
    name: `Team ${teamNumber}`,
    city: '',
    state_prov: '',
    country: '',
  }));

  setIsCreatingProfile(true);
  try {
    const teams = rawTeamList !== undefined ? manualTeams : await tba.fetchTeams(eventKey);
    const eventInfo = rawTeamList !== undefined
      ? null
      : await tba.fetchEvent(eventKey).catch(() => null as TBAEvent | null);

    await createProfile({
      eventKey,
      eventInfo,
      teams,
      nameOverride: title || undefined,
      allowLocalFallback: rawTeamList !== undefined,
      isCustom: rawTeamList !== undefined,
    });
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
