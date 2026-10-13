import { storage } from './storage';
import { supabase } from './supabase';
import { CompetitionProfile, TBATeam, TBAEvent } from '../types';

const PROFILES_KEY = 'global:competitionProfiles';
const ACTIVE_PROFILE_ID_KEY = 'global:activeCompetitionProfileId';
const LEGACY_PROFILES_KEY = 'competitionProfiles';
const LEGACY_ACTIVE_PROFILE_ID_KEY = 'activeCompetitionProfileId';

function getProfileTeamsKey(profileId: string) {
  return `global:competitionProfileTeams:${profileId}`;
}

function getLegacyProfileTeamsKey(profileId: string) {
  return `competitionProfileTeams:${profileId}`;
}

function migrateLegacyProfileState(): void {
  const legacyProfiles = storage.get<CompetitionProfile[]>(LEGACY_PROFILES_KEY);
  if (legacyProfiles && !storage.get<CompetitionProfile[]>(PROFILES_KEY)) {
    storage.set(PROFILES_KEY, legacyProfiles);
  }

  const legacyActiveId = storage.get<string | null>(LEGACY_ACTIVE_PROFILE_ID_KEY);
  if (legacyActiveId && !storage.get<string | null>(ACTIVE_PROFILE_ID_KEY)) {
    storage.set(ACTIVE_PROFILE_ID_KEY, legacyActiveId);
  }

  const profiles = storage.get<CompetitionProfile[]>(PROFILES_KEY) || [];
  for (const profile of profiles) {
    const globalTeamsKey = getProfileTeamsKey(profile.id);
    if (!storage.get<TBATeam[]>(globalTeamsKey)) {
      const legacyTeams = storage.get<TBATeam[]>(getLegacyProfileTeamsKey(profile.id));
      if (legacyTeams) {
        storage.set(globalTeamsKey, legacyTeams);
      }
    }
  }
}

migrateLegacyProfileState();

type CompetitionProfileRow = {
  id: string;
  event_key: string;
  name: string;
  location: string | null;
  year: number | null;
  team_count: number;
  teams: unknown;
  created_at: string;
  updated_at: string;
};

function normalizeTeams(value: unknown): TBATeam[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((team): team is TBATeam => {
    if (!team || typeof team !== 'object') {
      return false;
    }

    const candidate = team as Record<string, unknown>;
    return typeof candidate.key === 'string' && typeof candidate.team_number === 'number';
  });
}

function rowToProfile(row: CompetitionProfileRow): CompetitionProfile {
  return {
    id: row.id,
    eventKey: row.event_key,
    name: row.name,
    location: row.location || 'Unknown location',
    year: row.year || undefined,
    teamCount: row.team_count,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function profileToRow(profile: CompetitionProfile, teams: TBATeam[]): {
  id: string;
  event_key: string;
  name: string;
  location: string;
  year: number | null;
  team_count: number;
  teams: TBATeam[];
  created_at: string;
  updated_at: string;
} {
  return {
    id: profile.id,
    event_key: profile.eventKey,
    name: profile.name,
    location: profile.location,
    year: profile.year || null,
    team_count: profile.teamCount,
    teams,
    created_at: new Date(profile.createdAt).toISOString(),
    updated_at: new Date(profile.updatedAt).toISOString(),
  };
}

export async function hydrateProfilesFromSupabase(): Promise<void> {
  const { data, error } = await supabase
    .from('competition_profiles')
    .select('id, event_key, name, location, year, team_count, teams, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to load competition profiles');
  }

  const rows = (data || []) as CompetitionProfileRow[];
  const profiles = rows.map(rowToProfile);
  saveProfiles(profiles);

  rows.forEach((row) => {
    setProfileTeams(row.id, normalizeTeams(row.teams));
  });

  const activeId = getActiveProfileId();
  if (activeId && !profiles.some((profile) => profile.id === activeId)) {
    clearActiveProfile();
  }
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

export async function createProfile(params: {
  eventKey: string;
  eventInfo: TBAEvent | null;
  teams: TBATeam[];
  nameOverride?: string;
  allowLocalFallback?: boolean;
  isCustom?: boolean;
}): Promise<CompetitionProfile> {
  const now = Date.now();
  const eventKey = params.eventKey.trim().toLowerCase();
  const existing = getProfileByEventKey(eventKey);

  if (existing) {
    const updatedProfile: CompetitionProfile = {
      ...existing,
      name: params.nameOverride?.trim() || buildProfileName(eventKey, params.eventInfo),
      location: buildLocation(params.eventInfo),
      year: params.eventInfo?.year,
      teamCount: params.teams.length,
      isCustom: params.isCustom ?? existing.isCustom,
      updatedAt: now,
    };

    const profiles = getProfiles().map((profile) =>
      profile.id === existing.id ? updatedProfile : profile
    );

    saveProfiles(profiles);
    setProfileTeams(updatedProfile.id, params.teams);

    if (!params.allowLocalFallback) {
      const { error } = await supabase
        .from('competition_profiles')
        .upsert(profileToRow(updatedProfile, params.teams), { onConflict: 'event_key' });

      if (error) {
        throw new Error(error.message || 'Failed to save competition profile');
      }
    }

    setActiveProfileId(updatedProfile.id);
    return updatedProfile;
  }

  const profile: CompetitionProfile = {
    id: `${eventKey}-${now}`,
    eventKey,
    name: params.nameOverride?.trim() || buildProfileName(eventKey, params.eventInfo),
    location: buildLocation(params.eventInfo),
    year: params.eventInfo?.year,
    teamCount: params.teams.length,
    isCustom: params.isCustom ?? false,
    createdAt: now,
    updatedAt: now,
  };

  const profiles = getProfiles();
  saveProfiles([profile, ...profiles]);
  setProfileTeams(profile.id, params.teams);

  if (!params.allowLocalFallback) {
    const { error } = await supabase
      .from('competition_profiles')
      .upsert(profileToRow(profile, params.teams), { onConflict: 'event_key' });

    if (error) {
      throw new Error(error.message || 'Failed to save competition profile');
    }
  }

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
