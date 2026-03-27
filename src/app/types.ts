import { UserRole } from '../types';

export type Location = 'home' | 'event';

export type EventTab = 'pit' | 'match' | 'strategy' | 'alliance' | 'raw' | 'admin' | 'coverage';

export type FaceIdMode = 'train' | 'test';

export type UserAuthType = 'password' | 'faceid';

export type UserProfile = {
  id: string;
  name: string;
  role: UserRole;
  authType: UserAuthType;
  passwordHash?: string;
  passwordSalt?: string;
  faceIdName?: string;
  bannedAt?: string | null;
  bannedReason?: string | null;
  bannedByProfileId?: string | null;
  createdAt: number;
};

export type UserProfileRow = {
  id: string;
  name: string;
  role: UserRole;
  auth_type: UserAuthType;
  password_hash: string | null;
  password_salt: string | null;
  face_id_name: string | null;
  banned_at: string | null;
  banned_reason: string | null;
  banned_by_profile_id: string | null;
  created_at: string;
};

export type PendingFaceIdAction =
  | { type: 'create-faceid'; name: string; faceIdName: string; role: UserRole }
  | { type: 'load-faceid'; profileId: string; profileName: string; faceIdName: string }
  | null;
