import { createClient } from '@supabase/supabase-js';
import { PrescoutingTeamClaim, ScoutAssignment } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL is not configured');
}

if (!supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_ANON_KEY is not configured');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const PIT_SCOUT_PHOTO_BUCKET = 'pit-scout-photos';
export const FACE_ID_SNAPSHOT_BUCKET = 'face-id-snapshots';

type UploadedPitPhoto = {
  publicUrl: string;
  path: string;
};

function getFileExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.trim().toLowerCase();
  if (!extension) {
    return 'jpg';
  }
  return extension.replace(/[^a-z0-9]/g, '') || 'jpg';
}

function randomSuffix(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function uploadPitScoutPhoto(eventKey: string, teamNumber: number, file: File): Promise<UploadedPitPhoto> {
  const normalizedEventKey = eventKey.trim().toLowerCase();
  if (!normalizedEventKey) {
    throw new Error('A valid event key is required to upload a pit photo.');
  }

  if (!Number.isInteger(teamNumber) || teamNumber <= 0) {
    throw new Error('A valid team number is required to upload a pit photo.');
  }

  const ext = getFileExtension(file.name);
  const path = `pit/${normalizedEventKey}/${teamNumber}/${Date.now()}-${randomSuffix()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(PIT_SCOUT_PHOTO_BUCKET).upload(path, file, {
    upsert: false,
    cacheControl: '3600',
    contentType: file.type || undefined,
  });

  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to upload pit photo.');
  }

  const { data } = supabase.storage.from(PIT_SCOUT_PHOTO_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('Failed to resolve a public URL for the uploaded pit photo.');
  }

  return { publicUrl: data.publicUrl, path };
}

export function extractStoragePathFromPublicUrl(publicUrl: string, bucket: string): string | null {
  try {
    const parsed = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) {
      return null;
    }
    return decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

export async function deletePitScoutPhotoByUrl(publicUrl: string): Promise<void> {
  const path = extractStoragePathFromPublicUrl(publicUrl, PIT_SCOUT_PHOTO_BUCKET);
  if (!path) {
    return;
  }

  const { error } = await supabase.storage.from(PIT_SCOUT_PHOTO_BUCKET).remove([path]);
  if (error) {
    throw new Error(error.message || 'Failed to delete pit photo.');
  }
}

export async function uploadFaceIdSnapshot(scopeKey: string, personName: string, file: File): Promise<UploadedPitPhoto> {
  const normalizedScope = scopeKey.trim().toLowerCase() || 'global';
  const normalizedName = personName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';

  const ext = getFileExtension(file.name);
  const path = `faceid/${normalizedScope}/${normalizedName}/${Date.now()}-${randomSuffix()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(FACE_ID_SNAPSHOT_BUCKET).upload(path, file, {
    upsert: false,
    cacheControl: '3600',
    contentType: file.type || undefined,
  });

  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to upload face snapshot.');
  }

  const { data } = supabase.storage.from(FACE_ID_SNAPSHOT_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('Failed to resolve a public URL for the uploaded face snapshot.');
  }

  return { publicUrl: data.publicUrl, path };
}

export async function deleteMatchScoutById(id: string): Promise<void> {
  const trimmedId = id.trim();
  if (!trimmedId) {
    throw new Error('A valid match scout id is required for deletion.');
  }

  const { error } = await supabase.from('match_scouts').delete().eq('id', trimmedId);
  if (error) {
    throw new Error(error.message || 'Failed to delete match scout record.');
  }
}

export async function validateMatchScoutById(id: string): Promise<void> {
  const trimmedId = id.trim();
  if (!trimmedId) {
    throw new Error('A valid match scout id is required for validation.');
  }

  const { error } = await supabase.from('match_scouts').update({ validated: true }).eq('id', trimmedId);
  if (error) {
    throw new Error(error.message || 'Failed to validate match scout record.');
  }
}

type ScoutAssignmentRow = {
  id: string;
  event_key: string;
  match_number: number;
  team_number: number;
  scout_profile_id: string;
  status: 'assigned' | 'completed';
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PrescoutingTeamClaimRow = {
  id: string;
  season_year: number;
  team_number: number;
  claimer_profile_id: string;
  claimer_name: string;
  created_at: string;
  updated_at: string;
};

type MatchCoverageRow = {
  id: string;
  match_number: number | null;
  team_number: number | null;
  data: unknown;
};

type MatchCoverageEntry = {
  matchNumber: number;
  teamNumber: number;
  matchKey?: string;
};

const PRESCOUTING_TEAM_CLAIM_SELECT =
  'id, season_year, team_number, claimer_profile_id, claimer_name, created_at, updated_at';

export type ScoutedMatchEntry = {
  teamNumber: number;
  matchNumber: number | null;
  eventKey: string;
  matchKey: string;
};

function normalizeJsonPayload(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function extractEventKeyFromMatchKey(matchKey: string): string {
  const normalizedMatchKey = matchKey.trim().toLowerCase();
  const separatorIndex = normalizedMatchKey.indexOf('_');
  if (separatorIndex <= 0) {
    return '';
  }

  return normalizedMatchKey.slice(0, separatorIndex);
}

export async function listAllScoutedMatchEntries(): Promise<ScoutedMatchEntry[]> {
  const { data, error } = await supabase
    .from('match_scouts')
    .select('team_number, match_number, data');

  if (error) {
    throw new Error(error.message || 'Failed to load scouted match entries.');
  }

  return ((data || []) as MatchCoverageRow[])
    .map((row) => {
      const payload = asObject(normalizeJsonPayload(row.data));
      const teamNumber = row.team_number ?? asNumber(payload?.teamNumber);
      if (teamNumber === null || !Number.isInteger(teamNumber) || teamNumber <= 0) {
        return null;
      }

      const matchNumber = row.match_number ?? asNumber(payload?.matchNumber);
      const normalizedMatchKey = asString(payload?.matchKey).trim().toLowerCase();
      const eventKeyFromPayload = asString(payload?.eventKey).trim().toLowerCase();

      return {
        teamNumber,
        matchNumber,
        eventKey: eventKeyFromPayload || extractEventKeyFromMatchKey(normalizedMatchKey),
        matchKey: normalizedMatchKey,
      } as ScoutedMatchEntry;
    })
    .filter((entry): entry is ScoutedMatchEntry => Boolean(entry));
}

export async function listMatchCoverageRowsForEvent(eventKey: string): Promise<MatchCoverageEntry[]> {
  const normalizedEventKey = eventKey.trim().toLowerCase();
  if (!normalizedEventKey) {
    return [];
  }

  const { data, error } = await supabase
    .from('match_scouts')
    .select('id, match_number, team_number, data');

  if (error) {
    throw new Error(error.message || 'Failed to load match scouting coverage.');
  }

  return ((data || []) as MatchCoverageRow[])
    .map((row) => {
      const payload = asObject(normalizeJsonPayload(row.data));
      const payloadEventKey = asString(payload?.eventKey).trim().toLowerCase();
      if (payloadEventKey !== normalizedEventKey) {
        return null;
      }

      const teamNumber = row.team_number ?? asNumber(payload?.teamNumber);
      const matchNumber = row.match_number ?? asNumber(payload?.matchNumber);
      if (teamNumber === null || matchNumber === null) {
        return null;
      }

      const matchKey = asString(payload?.matchKey).trim();

      const entry: MatchCoverageEntry = {
        matchNumber,
        teamNumber,
        matchKey: matchKey || undefined,
      };

      return entry;
    })
    .filter((row): row is MatchCoverageEntry => row !== null);
}

function mapAssignmentRow(row: ScoutAssignmentRow): ScoutAssignment {
  return {
    id: row.id,
    eventKey: row.event_key,
    matchNumber: row.match_number,
    teamNumber: row.team_number,
    scoutProfileId: row.scout_profile_id,
    status: row.status,
    notes: row.notes || undefined,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPrescoutingTeamClaimRow(row: PrescoutingTeamClaimRow): PrescoutingTeamClaim {
  return {
    id: row.id,
    seasonYear: row.season_year,
    teamNumber: row.team_number,
    claimerProfileId: row.claimer_profile_id,
    claimerName: row.claimer_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getPrescoutingTeamClaimByTeam(seasonYear: number, teamNumber: number): Promise<PrescoutingTeamClaim | null> {
  const { data, error } = await supabase
    .from('prescouting_team_claims')
    .select(PRESCOUTING_TEAM_CLAIM_SELECT)
    .eq('season_year', seasonYear)
    .eq('team_number', teamNumber)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load team claim.');
  }

  if (!data) {
    return null;
  }

  return mapPrescoutingTeamClaimRow(data as PrescoutingTeamClaimRow);
}

export async function listActivePrescoutingTeamClaims(seasonYear: number): Promise<PrescoutingTeamClaim[]> {
  if (!Number.isInteger(seasonYear) || seasonYear <= 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('prescouting_team_claims')
    .select(PRESCOUTING_TEAM_CLAIM_SELECT)
    .eq('season_year', seasonYear)
    .order('team_number', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to load team claims.');
  }

  return ((data || []) as PrescoutingTeamClaimRow[]).map(mapPrescoutingTeamClaimRow);
}

export async function claimPrescoutingTeam(input: {
  seasonYear: number;
  teamNumber: number;
  claimerProfileId: string;
  claimerName: string;
}): Promise<PrescoutingTeamClaim> {
  if (!Number.isInteger(input.seasonYear) || input.seasonYear <= 0) {
    throw new Error('A valid season year is required.');
  }

  if (!Number.isInteger(input.teamNumber) || input.teamNumber <= 0) {
    throw new Error('A valid team number is required.');
  }

  const normalizedClaimerId = input.claimerProfileId.trim();
  if (!normalizedClaimerId) {
    throw new Error('A valid claimer profile id is required.');
  }

  const normalizedClaimerName = input.claimerName.trim() || 'Unknown scout';

  const existing = await getPrescoutingTeamClaimByTeam(input.seasonYear, input.teamNumber);
  if (existing) {
    if (existing.claimerProfileId === normalizedClaimerId) {
      return existing;
    }

    throw new Error(`Team ${input.teamNumber} is already claimed by ${existing.claimerName}.`);
  }

  const row = {
    id: `${input.seasonYear}:${input.teamNumber}`,
    season_year: input.seasonYear,
    team_number: input.teamNumber,
    claimer_profile_id: normalizedClaimerId,
    claimer_name: normalizedClaimerName,
  };

  const { data, error } = await supabase
    .from('prescouting_team_claims')
    .insert(row)
    .select(PRESCOUTING_TEAM_CLAIM_SELECT)
    .single();

  if (error) {
    const latest = await getPrescoutingTeamClaimByTeam(input.seasonYear, input.teamNumber);
    if (latest) {
      if (latest.claimerProfileId === normalizedClaimerId) {
        return latest;
      }

      throw new Error(`Team ${input.teamNumber} is already claimed by ${latest.claimerName}.`);
    }

    throw new Error(error.message || 'Failed to claim team.');
  }

  return mapPrescoutingTeamClaimRow(data as PrescoutingTeamClaimRow);
}

export async function releasePrescoutingTeamClaim(input: {
  seasonYear: number;
  teamNumber: number;
  releasedByProfileId: string;
  isAdmin: boolean;
}): Promise<void> {
  if (!input.isAdmin) {
    throw new Error('Only admins can release team claims.');
  }

  if (!Number.isInteger(input.seasonYear) || input.seasonYear <= 0) {
    throw new Error('A valid season year is required.');
  }

  if (!Number.isInteger(input.teamNumber) || input.teamNumber <= 0) {
    throw new Error('A valid team number is required.');
  }

  if (!input.releasedByProfileId.trim()) {
    throw new Error('A valid admin profile id is required.');
  }

  const { error } = await supabase
    .from('prescouting_team_claims')
    .delete()
    .eq('season_year', input.seasonYear)
    .eq('team_number', input.teamNumber);

  if (error) {
    throw new Error(error.message || 'Failed to release team claim.');
  }
}

export async function listAssignmentsForEvent(eventKey: string): Promise<ScoutAssignment[]> {
  const normalizedEventKey = eventKey.trim().toLowerCase();
  if (!normalizedEventKey) {
    return [];
  }

  const { data, error } = await supabase
    .from('scout_assignments')
    .select('id, event_key, match_number, team_number, scout_profile_id, status, notes, completed_at, created_at, updated_at')
    .eq('event_key', normalizedEventKey)
    .order('match_number', { ascending: true })
    .order('team_number', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to load assignments.');
  }

  return ((data || []) as ScoutAssignmentRow[]).map(mapAssignmentRow);
}

export async function listAssignmentsForScout(eventKey: string, scoutProfileId: string): Promise<ScoutAssignment[]> {
  const normalizedEventKey = eventKey.trim().toLowerCase();
  const normalizedScoutId = scoutProfileId.trim();
  if (!normalizedEventKey || !normalizedScoutId) {
    return [];
  }

  const { data, error } = await supabase
    .from('scout_assignments')
    .select('id, event_key, match_number, team_number, scout_profile_id, status, notes, completed_at, created_at, updated_at')
    .eq('event_key', normalizedEventKey)
    .eq('scout_profile_id', normalizedScoutId)
    .order('match_number', { ascending: true })
    .order('team_number', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to load scout assignments.');
  }

  return ((data || []) as ScoutAssignmentRow[]).map(mapAssignmentRow);
}

export async function listAssignmentsForTeam(input: {
  teamNumber: number;
  eventKey?: string | null;
}): Promise<ScoutAssignment[]> {
  if (!Number.isInteger(input.teamNumber) || input.teamNumber <= 0) {
    return [];
  }

  const normalizedEventKey = input.eventKey?.trim().toLowerCase() || '';
  let query = supabase
    .from('scout_assignments')
    .select('id, event_key, match_number, team_number, scout_profile_id, status, notes, completed_at, created_at, updated_at')
    .eq('team_number', input.teamNumber)
    .order('updated_at', { ascending: false });

  if (normalizedEventKey) {
    query = query.eq('event_key', normalizedEventKey);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Failed to load team assignments.');
  }

  return ((data || []) as ScoutAssignmentRow[]).map(mapAssignmentRow);
}

export async function upsertAssignment(input: {
  eventKey: string;
  matchNumber: number;
  teamNumber: number;
  scoutProfileId: string;
  notes?: string;
}): Promise<void> {
  const normalizedEventKey = input.eventKey.trim().toLowerCase();
  const normalizedScoutId = input.scoutProfileId.trim();
  if (!normalizedEventKey || !normalizedScoutId) {
    throw new Error('Event key and scout are required.');
  }

  const row = {
    id: `${normalizedEventKey}:${input.matchNumber}:${input.teamNumber}:${normalizedScoutId}`,
    event_key: normalizedEventKey,
    match_number: input.matchNumber,
    team_number: input.teamNumber,
    scout_profile_id: normalizedScoutId,
    status: 'assigned' as const,
    notes: input.notes?.trim() || null,
    completed_at: null,
  };

  const { error } = await supabase.from('scout_assignments').upsert(row, { onConflict: 'id' });
  if (error) {
    throw new Error(error.message || 'Failed to save assignment.');
  }
}

export async function deleteAssignmentById(assignmentId: string): Promise<void> {
  const normalizedAssignmentId = assignmentId.trim();
  if (!normalizedAssignmentId) {
    throw new Error('Assignment id is required.');
  }

  const { error } = await supabase.from('scout_assignments').delete().eq('id', normalizedAssignmentId);
  if (error) {
    throw new Error(error.message || 'Failed to delete assignment.');
  }
}

export async function markAssignmentCompleted(input: {
  eventKey: string;
  matchNumber: number;
  teamNumber: number;
  scoutProfileId: string;
}): Promise<void> {
  const normalizedEventKey = input.eventKey.trim().toLowerCase();
  const normalizedScoutId = input.scoutProfileId.trim();
  if (!normalizedEventKey || !normalizedScoutId) {
    return;
  }

  const { error } = await supabase
    .from('scout_assignments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('event_key', normalizedEventKey)
    .eq('match_number', input.matchNumber)
    .eq('team_number', input.teamNumber)
    .eq('scout_profile_id', normalizedScoutId);

  if (error) {
    throw new Error(error.message || 'Failed to mark assignment complete.');
  }
}

export async function setScoutBanState(input: {
  scoutProfileId: string;
  banned: boolean;
  bannedBy?: string | null;
  reason?: string;
}): Promise<void> {
  const profileId = input.scoutProfileId.trim();
  if (!profileId) {
    throw new Error('Scout profile id is required.');
  }

  const updatePayload = input.banned
    ? {
        banned_at: new Date().toISOString(),
        banned_reason: input.reason?.trim() || 'Banned by admin',
        banned_by_profile_id: input.bannedBy || null,
      }
    : {
        banned_at: null,
        banned_reason: null,
        banned_by_profile_id: null,
      };

  const { error } = await supabase.from('admin_user_profiles').update(updatePayload).eq('id', profileId).eq('role', 'scout');
  if (error) {
    throw new Error(error.message || 'Failed to update scout moderation state.');
  }
}
