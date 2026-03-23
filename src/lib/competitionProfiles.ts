import { storage } from './storage';
import { CompetitionProfile, TBATeam, TBAEvent } from '../types';

const PROFILES_KEY = 'competitionProfiles';
const ACTIVE_PROFILE_ID_KEY = 'activeCompetitionProfileId';

function getProfileTeamsKey(profileId: string) {
  return `competitionProfileTeams:${profileId}`;
}

function buildLocation(eventInfo: TBAEvent | null): string {
  if (!eventInfo) {
    return 'Unknown location';
  }

  const locationParts = [eventInfo.city, eventInfo.state_prov || eventInfo.country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  if (locationParts.length === 0) {
    return 'Unknown location';
  }

  return locationParts.join(', ');
}

function buildProfileName(eventKey: string, eventInfo: TBAEvent | null): string {
  const normalizedKey = eventKey.trim().toUpperCase();
  if (!eventInfo?.name) {
    return normalizedKey;
  }

  return eventInfo.name.trim();
}

function syncLegacyActiveContext(profile: CompetitionProfile | null): void {
  if (!profile) {
    storage.set('eventKey', '');
    storage.set('tbaTeams', []);
    return;
  }

  storage.set('eventKey', profile.eventKey);
  storage.set('tbaTeams', getProfileTeams(profile.id));
}

export function getProfiles(): CompetitionProfile[] {
  const profiles = storage.get<CompetitionProfile[]>(PROFILES_KEY) || [];
  return [...profiles].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveProfiles(profiles: CompetitionProfile[]): void {
  storage.set(PROFILES_KEY, profiles);
}

export function getProfileByEventKey(eventKey: string): CompetitionProfile | null {
  const normalizedKey = eventKey.trim().toLowerCase();
  return getProfiles().find((profile) => profile.eventKey.toLowerCase() === normalizedKey) || null;
}

export function createProfile(params: {
  eventKey: string;
  eventInfo: TBAEvent | null;
  teams: TBATeam[];
}): CompetitionProfile {
  const now = Date.now();
  const eventKey = params.eventKey.trim().toLowerCase();
  const existing = getProfileByEventKey(eventKey);

  if (existing) {
    const updatedProfile: CompetitionProfile = {
      ...existing,
      name: buildProfileName(eventKey, params.eventInfo),
      location: buildLocation(params.eventInfo),
      year: params.eventInfo?.year,
      teamCount: params.teams.length,
      updatedAt: now,
    };

    const profiles = getProfiles().map((profile) =>
      profile.id === existing.id ? updatedProfile : profile
    );

    saveProfiles(profiles);
    setProfileTeams(updatedProfile.id, params.teams);
    setActiveProfileId(updatedProfile.id);
    return updatedProfile;
  }

  const profile: CompetitionProfile = {
    id: `${eventKey}-${now}`,
    eventKey,
    name: buildProfileName(eventKey, params.eventInfo),
    location: buildLocation(params.eventInfo),
    year: params.eventInfo?.year,
    teamCount: params.teams.length,
    createdAt: now,
    updatedAt: now,
  };

  const profiles = getProfiles();
  saveProfiles([profile, ...profiles]);
  setProfileTeams(profile.id, params.teams);
  setActiveProfileId(profile.id);
  return profile;
}

export function getProfileTeams(profileId: string): TBATeam[] {
  return storage.get<TBATeam[]>(getProfileTeamsKey(profileId)) || [];
}

export function setProfileTeams(profileId: string, teams: TBATeam[]): void {
  storage.set(getProfileTeamsKey(profileId), teams);
}

export function getActiveProfileId(): string | null {
  return storage.get<string>(ACTIVE_PROFILE_ID_KEY);
}

export function getActiveProfile(): CompetitionProfile | null {
  const activeId = getActiveProfileId();
  if (!activeId) {
    return null;
  }

  return getProfiles().find((profile) => profile.id === activeId) || null;
}

export function setActiveProfileId(profileId: string): void {
  storage.set(ACTIVE_PROFILE_ID_KEY, profileId);
  const profile = getProfiles().find((candidate) => candidate.id === profileId) || null;
  syncLegacyActiveContext(profile);
}

export function clearActiveProfile(): void {
  storage.set(ACTIVE_PROFILE_ID_KEY, null);
  syncLegacyActiveContext(null);
}
