import { createClient } from '@supabase/supabase-js';

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
