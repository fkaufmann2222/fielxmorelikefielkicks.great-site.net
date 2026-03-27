import { supabase } from '../../lib/supabase';
import {
  ACTIVE_USER_PROFILE_ID_KEY,
  LEGACY_ACTIVE_USER_PROFILE_ID_KEY,
  USER_PROFILES_KEY,
  USER_PROFILES_TABLE,
} from '../constants';
import { UserProfile, UserProfileRow } from '../types';

function mapUserProfileRow(row: UserProfileRow): UserProfile {
  const createdAtTimestamp = Date.parse(row.created_at);
  return {
    id: row.id,
    name: row.name,
    role: row.role || 'admin',
    authType: row.auth_type,
    passwordHash: row.password_hash || undefined,
    passwordSalt: row.password_salt || undefined,
    faceIdName: row.face_id_name || undefined,
    bannedAt: row.banned_at,
    bannedReason: row.banned_reason,
    bannedByProfileId: row.banned_by_profile_id,
    createdAt: Number.isNaN(createdAtTimestamp) ? Date.now() : createdAtTimestamp,
  };
}

function mapUserProfileToRow(profile: UserProfile) {
  return {
    id: profile.id,
    name: profile.name,
    role: profile.role,
    auth_type: profile.authType,
    password_hash: profile.passwordHash || null,
    password_salt: profile.passwordSalt || null,
    face_id_name: profile.faceIdName || null,
    banned_at: profile.bannedAt || null,
    banned_reason: profile.bannedReason || null,
    banned_by_profile_id: profile.bannedByProfileId || null,
    created_at: new Date(profile.createdAt).toISOString(),
  };
}

function getLegacyStoredUserProfiles(): UserProfile[] {
  try {
    const raw = localStorage.getItem(USER_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserProfile[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((profile) => profile && typeof profile.id === 'string' && typeof profile.name === 'string')
      .map((profile) => ({
        ...profile,
        role: profile.role === 'scout' ? 'scout' : 'admin',
      }));
  } catch {
    return [];
  }
}

export async function saveStoredUserProfiles(profiles: UserProfile[]): Promise<void> {
  // Creation and updates are supported through this flow.
  // Full profile deletion is not currently part of the product behavior.
  if (profiles.length === 0) {
    return;
  }

  const rows = profiles.map(mapUserProfileToRow);
  const { error } = await supabase.from(USER_PROFILES_TABLE).upsert(rows, { onConflict: 'id' });
  if (error) {
    throw new Error(error.message || 'Failed to save user profiles');
  }
}

export async function getStoredUserProfiles(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from(USER_PROFILES_TABLE)
    .select(
      'id, name, role, auth_type, password_hash, password_salt, face_id_name, banned_at, banned_reason, banned_by_profile_id, created_at'
    )
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to load user profiles');
  }

  const rows = (data || []) as UserProfileRow[];
  if (rows.length > 0) {
    return rows.map(mapUserProfileRow);
  }

  const legacyProfiles = getLegacyStoredUserProfiles();
  if (legacyProfiles.length > 0) {
    await saveStoredUserProfiles(legacyProfiles);
    localStorage.removeItem(USER_PROFILES_KEY);
    return legacyProfiles;
  }

  return [];
}

export async function getStoredActiveUserProfileId(): Promise<string | null> {
  const activeId = localStorage.getItem(ACTIVE_USER_PROFILE_ID_KEY);
  if (activeId) {
    return activeId;
  }

  const legacyActiveId = localStorage.getItem(LEGACY_ACTIVE_USER_PROFILE_ID_KEY);
  if (!legacyActiveId) {
    return null;
  }

  localStorage.setItem(ACTIVE_USER_PROFILE_ID_KEY, legacyActiveId);
  localStorage.removeItem(LEGACY_ACTIVE_USER_PROFILE_ID_KEY);
  return legacyActiveId;
}

export async function setStoredActiveUserProfileId(profileId: string): Promise<void> {
  localStorage.setItem(ACTIVE_USER_PROFILE_ID_KEY, profileId);
}

export async function clearStoredActiveUserProfileId(): Promise<void> {
  localStorage.removeItem(ACTIVE_USER_PROFILE_ID_KEY);
  localStorage.removeItem(LEGACY_ACTIVE_USER_PROFILE_ID_KEY);
}

export function normalizeProfileNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function generateUserProfileId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `user-${crypto.randomUUID()}`;
  }
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
