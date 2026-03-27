import { alignPointBetweenAlliances, buildHeatmapBins } from '../../lib/heatmapUtils';
import { AutonPathData, MatchScoutData, PitScoutData } from '../../types';
import {
  AUTON_HEATMAP_COLS,
  AUTON_HEATMAP_ROWS,
} from './constants';
import {
  MatchNotesBundle,
  MetricKey,
  NormalizedPoint,
  RenderableMatchPayload,
  RenderablePitPayload,
  StripKey,
  TeamYearPoint,
} from './types';

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function normalizePoint(point: { x: number; y: number }): NormalizedPoint {
  return {
    x: clamp01(point.x),
    y: clamp01(point.y),
  };
}

export function resolveStripForY(startY: number): StripKey {
  const y = clamp01(startY);

  if (y < 1 / 3) {
    return 'top';
  }
  if (y < 2 / 3) {
    return 'middle';
  }
  return 'bottom';
}

export function sampleTrajectoryPointAt(points: NormalizedPoint[], ratio: number): NormalizedPoint {
  if (points.length === 0) {
    return { x: 0.5, y: 0.5 };
  }
  if (points.length === 1) {
    return points[0];
  }

  const clampedRatio = clamp01(ratio);
  const virtualIndex = clampedRatio * (points.length - 1);
  const lowIndex = Math.floor(virtualIndex);
  const highIndex = Math.min(points.length - 1, lowIndex + 1);
  const spanRatio = virtualIndex - lowIndex;
  const low = points[lowIndex];
  const high = points[highIndex];

  return {
    x: low.x + (high.x - low.x) * spanRatio,
    y: low.y + (high.y - low.y) * spanRatio,
  };
}

export function resampleTrajectory(points: NormalizedPoint[], sampleCount: number): NormalizedPoint[] {
  if (sampleCount <= 1) {
    return points.length > 0 ? [points[0]] : [];
  }

  const output: NormalizedPoint[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const ratio = index / (sampleCount - 1);
    output.push(sampleTrajectoryPointAt(points, ratio));
  }
  return output;
}

export function averageResampledPaths(paths: NormalizedPoint[][]): NormalizedPoint[] {
  if (paths.length === 0) {
    return [];
  }

  const sampleLength = paths[0].length;
  if (sampleLength === 0) {
    return [];
  }

  const sums = Array.from({ length: sampleLength }, () => ({ x: 0, y: 0 }));
  paths.forEach((path) => {
    for (let i = 0; i < sampleLength; i += 1) {
      sums[i].x += path[i].x;
      sums[i].y += path[i].y;
    }
  });

  return sums.map((sum) => ({
    x: sum.x / paths.length,
    y: sum.y / paths.length,
  }));
}

export function buildReplayPath(points: NormalizedPoint[], shots: NormalizedPoint[]): AutonPathData | null {
  if (points.length === 0) {
    return null;
  }

  const durationMs = 20000;
  const trajectoryPoints = points.map((point, index) => ({
    x: point.x,
    y: point.y,
    timestampMs: points.length <= 1 ? 0 : Math.round((index / (points.length - 1)) * durationMs),
  }));

  const shotAttempts = shots.map((shot, index) => ({
    x: shot.x,
    y: shot.y,
    timestampMs: shots.length <= 1 ? Math.round(durationMs * 0.7) : Math.round((index / (shots.length - 1)) * durationMs),
  }));

  return {
    startPosition: { x: points[0].x, y: points[0].y },
    capturedAt: new Date(0).toISOString(),
    durationMs,
    trajectoryPoints,
    shotAttempts,
    fieldVersion: '2026-field-v1',
  };
}

export function alignPointToAlliance(
  point: NormalizedPoint,
  sourceAlliance: 'Red' | 'Blue' | '',
  targetAlliance: 'Red' | 'Blue' | '',
): NormalizedPoint {
  return alignPointBetweenAlliances(point, sourceAlliance, targetAlliance);
}

export function averagePoint(points: NormalizedPoint[]): NormalizedPoint {
  if (points.length === 0) {
    return { x: 0.5, y: 0.5 };
  }

  const sum = points.reduce(
    (acc, point) => {
      return {
        x: acc.x + point.x,
        y: acc.y + point.y,
      };
    },
    { x: 0, y: 0 },
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

export function normalizePayload(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

export function pickFirstNumber(data: unknown, keys: string[]): number | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  for (const key of keys) {
    const parts = key.split('.');
    let current: unknown = data;

    for (const part of parts) {
      if (typeof current !== 'object' || current === null) {
        current = null;
        break;
      }

      current = (current as Record<string, unknown>)[part];
    }

    const parsed = toNumber(current);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

export function extractTeamNumber(team: Record<string, unknown>): number | null {
  const parsed = toNumber(team.team_number ?? team.team);
  if (!parsed || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function extractNickname(team: Record<string, unknown>, fallbackTeamNumber: number): string {
  const nickname =
    (typeof team.nickname === 'string' && team.nickname.trim()) ||
    (typeof team.name === 'string' && team.name.trim()) ||
    (typeof team.team_name === 'string' && team.team_name.trim()) ||
    '';

  return nickname || `Team ${fallbackTeamNumber}`;
}

export function extractYearRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;
  if (Array.isArray(objectPayload.data)) {
    return objectPayload.data.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  if (Array.isArray(objectPayload.years)) {
    return objectPayload.years.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  return [];
}

export function toMatchLabel(row: Record<string, unknown>, fallbackIndex: number): string {
  const directMatchNumber = toNumber(row.match_number);
  if (directMatchNumber !== null) {
    return `M${directMatchNumber}`;
  }

  const matchObject = row.match;
  if (matchObject && typeof matchObject === 'object') {
    const objectMatchNumber = toNumber((matchObject as Record<string, unknown>).match_number);
    if (objectMatchNumber !== null) {
      const compLevel = (matchObject as Record<string, unknown>).comp_level;
      if (typeof compLevel === 'string' && compLevel.trim()) {
        return `${compLevel.toUpperCase()} ${objectMatchNumber}`;
      }
      return `M${objectMatchNumber}`;
    }

    const key = (matchObject as Record<string, unknown>).key;
    if (typeof key === 'string' && key.trim()) {
      return key;
    }
  }

  const key = row.key;
  if (typeof key === 'string' && key.trim()) {
    return key;
  }

  return `Match ${fallbackIndex + 1}`;
}

export function parseEventYear(eventKey: string): number | null {
  const match = eventKey.trim().match(/^(\d{4})/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  if (!Number.isInteger(year) || year < 1992 || year > 2100) {
    return null;
  }

  return year;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getPayloadEventKey(payload: unknown): string {
  if (!isRecord(payload)) {
    return '';
  }

  const raw = payload.eventKey;
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export function metricValue(point: TeamYearPoint, key: MetricKey): number {
  return point[key];
}

export function asPitPayload(value: unknown): RenderablePitPayload | null {
  if (!isRecord(value)) {
    return null;
  }
  return value as Partial<PitScoutData>;
}

export function asMatchPayload(value: unknown): RenderableMatchPayload | null {
  if (!isRecord(value)) {
    return null;
  }
  return value as Partial<MatchScoutData>;
}

export function asAutonPathData(value: unknown): AutonPathData | null {
  if (!isRecord(value)) {
    return null;
  }

  const startSlot = value.startSlot;
  const startPosition = value.startPosition;
  const durationMs = value.durationMs;
  const trajectoryPoints = value.trajectoryPoints;
  const shotAttempts = value.shotAttempts;

  if (typeof durationMs !== 'number' || !Array.isArray(trajectoryPoints) || !Array.isArray(shotAttempts)) {
    return null;
  }

  const parsedTrajectoryPoints = trajectoryPoints
    .filter((point) => isRecord(point))
    .map((point) => ({
      x: Number(point.x),
      y: Number(point.y),
      timestampMs: Number(point.timestampMs),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.timestampMs));

  const parsedStartPosition = isRecord(startPosition)
    ? {
        x: Number(startPosition.x),
        y: Number(startPosition.y),
      }
    : null;

  const fallbackStartFromTrajectory = parsedTrajectoryPoints.length > 0
    ? { x: parsedTrajectoryPoints[0].x, y: parsedTrajectoryPoints[0].y }
    : null;

  if (!parsedStartPosition && !fallbackStartFromTrajectory) {
    return null;
  }

  return {
    startPosition: parsedStartPosition || fallbackStartFromTrajectory,
    startSlot: typeof startSlot === 'string' ? (startSlot as AutonPathData['startSlot']) : undefined,
    capturedAt: typeof value.capturedAt === 'string' ? value.capturedAt : new Date(0).toISOString(),
    durationMs,
    trajectoryPoints: parsedTrajectoryPoints,
    shotAttempts: shotAttempts
      .filter((shot) => isRecord(shot))
      .map((shot) => ({
        x: Number(shot.x),
        y: Number(shot.y),
        timestampMs: Number(shot.timestampMs),
      }))
      .filter((shot) => Number.isFinite(shot.x) && Number.isFinite(shot.y) && Number.isFinite(shot.timestampMs)),
    fieldVersion: '2026-field-v1',
  };
}

export function displayText(value: unknown, fallback = 'Not set'): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : fallback;
  }
  if (typeof value === 'string') {
    return value.trim() || fallback;
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : fallback;
  }
  return fallback;
}

export function displayBoolean(value: unknown): 'Yes' | 'No' | 'Unknown' {
  if (typeof value !== 'boolean') {
    return 'Unknown';
  }
  return value ? 'Yes' : 'No';
}

export function displayPhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 3);
}

export function normalizeNoteText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

export function collectNoteBuckets(payloads: Partial<MatchScoutData>[]): Omit<MatchNotesBundle, 'totalMatches'> {
  const autonNotes: string[] = [];
  const defenseNotes: string[] = [];
  const generalNotes: string[] = [];

  payloads.forEach((match) => {
    const auton = normalizeNoteText(match.autonNotes);
    if (auton) {
      autonNotes.push(auton);
    }

    const defenseText = normalizeNoteText(match.defenseNotes);
    const defenseQualityText = normalizeNoteText(match.defenseQuality);
    if (defenseText) {
      defenseNotes.push(defenseQualityText ? `${defenseQualityText}: ${defenseText}` : defenseText);
    } else if (defenseQualityText && match.playedDefense === true) {
      defenseNotes.push(`Defense quality noted as ${defenseQualityText}.`);
    }

    const general = normalizeNoteText(match.notes);
    if (general) {
      generalNotes.push(general);
    }
  });

  return {
    autonNotes,
    defenseNotes,
    generalNotes,
  };
}

export function buildMatchNotesBundle(payloads: Partial<MatchScoutData>[]): MatchNotesBundle {
  const { autonNotes, defenseNotes, generalNotes } = collectNoteBuckets(payloads);

  return {
    totalMatches: payloads.length,
    autonNotes,
    defenseNotes,
    generalNotes,
  };
}

export function buildAutonBins(shots: NormalizedPoint[]): { bins: number[]; maxBin: number } {
  const bins = buildHeatmapBins(shots, AUTON_HEATMAP_COLS, AUTON_HEATMAP_ROWS);
  return {
    bins,
    maxBin: bins.reduce((max, value) => Math.max(max, value), 0),
  };
}
