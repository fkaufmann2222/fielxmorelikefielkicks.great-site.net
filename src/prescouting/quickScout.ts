import { storage } from '../lib/storage';

export type PrescoutingQuickScoutTarget = {
  teamNumber: number;
  matchKey: string;
  matchNumber: number;
  eventKey: string;
};

const PRESCOUTING_QUICK_SCOUT_STORAGE_KEY = 'TEMP:prescoutingQuickScout';

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function sanitizeTarget(value: unknown): PrescoutingQuickScoutTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const teamNumber = toPositiveInteger(payload.teamNumber);
  const matchNumber = toPositiveInteger(payload.matchNumber);
  const matchKey = normalizeText(payload.matchKey);
  const eventKey = normalizeText(payload.eventKey);

  if (!teamNumber || !matchNumber || !matchKey || !eventKey) {
    return null;
  }

  return {
    teamNumber,
    matchNumber,
    matchKey,
    eventKey,
  };
}

export function setPendingPrescoutingQuickScout(target: PrescoutingQuickScoutTarget): void {
  const sanitizedTarget = sanitizeTarget(target);
  if (!sanitizedTarget) {
    throw new Error('Invalid quick-scout target.');
  }

  storage.set(PRESCOUTING_QUICK_SCOUT_STORAGE_KEY, sanitizedTarget);
}

export function getPendingPrescoutingQuickScout(): PrescoutingQuickScoutTarget | null {
  const value = storage.get<unknown>(PRESCOUTING_QUICK_SCOUT_STORAGE_KEY);
  const sanitizedTarget = sanitizeTarget(value);
  if (!sanitizedTarget) {
    clearPendingPrescoutingQuickScout();
    return null;
  }

  return sanitizedTarget;
}

export function clearPendingPrescoutingQuickScout(): void {
  storage.deleteKey(PRESCOUTING_QUICK_SCOUT_STORAGE_KEY);
}
