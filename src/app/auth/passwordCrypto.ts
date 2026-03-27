import { PASSWORD_HASH_ITERATIONS } from '../constants';
import { UserProfile } from '../types';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (!hex || hex.length % 2 !== 0) {
    console.warn('Invalid hex input while decoding bytes');
    return new Uint8Array();
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    const value = Number.parseInt(hex.slice(index, index + 2), 16);
    if (!Number.isFinite(value)) {
      console.warn('Invalid hex pair while decoding bytes');
      return new Uint8Array();
    }
    bytes[index / 2] = value;
  }
  return bytes;
}

export async function hashPasswordLegacy(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(new Uint8Array(digest));
}

export async function hashPassword(value: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const normalizedSaltBytes = Uint8Array.from(saltBytes);

  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey('raw', encoder.encode(value), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: normalizedSaltBytes,
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );

  return {
    hash: bytesToHex(new Uint8Array(derived)),
    salt: bytesToHex(normalizedSaltBytes),
  };
}

export async function verifyPassword(profile: UserProfile, candidatePassword: string): Promise<boolean> {
  if (!profile.passwordHash) {
    return false;
  }

  if (!profile.passwordSalt) {
    const legacyHash = await hashPasswordLegacy(candidatePassword);
    return legacyHash === profile.passwordHash;
  }

  const encoder = new TextEncoder();
  const saltBytes = hexToBytes(profile.passwordSalt);
  const normalizedSaltBytes = Uint8Array.from(saltBytes);
  if (normalizedSaltBytes.length === 0) {
    console.warn('Invalid password salt for profile', profile.id);
    return false;
  }

  const passwordKey = await crypto.subtle.importKey('raw', encoder.encode(candidatePassword), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: normalizedSaltBytes,
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );

  return bytesToHex(new Uint8Array(derived)) === profile.passwordHash;
}
