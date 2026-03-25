import { createClient } from '@supabase/supabase-js';
import { ScoutAssignment } from '../types';

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
