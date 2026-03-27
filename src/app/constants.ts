export const USER_PROFILES_KEY = 'global:userProfiles';
export const LEGACY_ACTIVE_USER_PROFILE_ID_KEY = 'global:activeUserProfileId';
export const ACTIVE_USER_PROFILE_ID_KEY = 'device:activeUserProfileId';

export const USER_PROFILES_TABLE = 'admin_user_profiles';

export const ADMIN_PIN = 'bazinga';
export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_HASH_ITERATIONS = 600000;

export const STRICT_FACE_ID_POLICY = {
  threshold: 0.27,
  minMargin: 0.06,
  minConfidence: 0.85,
  qualityFloor: 0.35,
  embeddingModel: 'face-api.js@tiny-face-detector-v1',
};
