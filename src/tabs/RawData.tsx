import React, { useEffect, useMemo, useState } from 'react';
import { storage } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { AutonPathData, MatchScoutData, PitScoutData, SyncRecord } from '../types';
import { gemini, MatchNoteSummary } from '../lib/gemini';
import { statbotics, StatboticsTeamEvent } from '../lib/statbotics';
import { getProfileTeams } from '../lib/competitionProfiles';
import { AutonPathField } from '../components/AutonPathField';
import { FieldHeatmap } from '../components/FieldHeatmap';
import { alignPointBetweenAlliances, buildHeatmapBins } from '../lib/heatmapUtils';

type RawEntryType = 'pit' | 'match';

type MetricKey = 'total_points' | 'auto_points' | 'teleop_points' | 'endgame_points';

type RawDataScope = 'event' | 'global';

type RawEntry = {
  key: string;
  type: RawEntryType;
  teamNumber: number | string;
  matchNumber?: number | string;
  updatedAt: number;
  source: 'local' | 'remote';
  payload: unknown;
};

type TeamYearPoint = {
  matchLabel: string;
  order: number;
  total_points: number;
  auto_points: number;
  teleop_points: number;
  endgame_points: number;
};

type EventTeam = {
  teamNumber: number;
  nickname: string;
  stats: StatboticsTeamEvent | null;
};

type SupabaseRow = {
  data: unknown;
  team_number?: number | null;
  match_number?: number | null;
  event_key?: string | null;
  updated_at?: string;
};

type MatchNotesBundle = {
  totalMatches: number;
  autonNotes: string[];
  defenseNotes: string[];
  generalNotes: string[];
};

type StripKey = 'top' | 'middle' | 'bottom';

type NormalizedPoint = {
  x: number;
  y: number;
};

type StripSummary = {
  key: StripKey;
  label: string;
  runCount: number;
  totalShots: number;
  avgPath: NormalizedPoint[];
  replayPath: AutonPathData | null;
  dominantAlliance: 'Red' | 'Blue' | '';
  shotBins: number[];
  maxShotBin: number;
};

type StripRunSample = {
  trajectory: NormalizedPoint[];
  shots: NormalizedPoint[];
  start: NormalizedPoint;
  alliance: 'Red' | 'Blue' | '';
};

const AUTON_FIELD_WIDTH = 1000;
const AUTON_FIELD_HEIGHT = 540;
const AUTON_FIELD_OVERLAY_SRC = '/auton-field-overlay.svg';
const PATH_SAMPLE_COUNT = 45;
const AUTON_HEATMAP_COLS = 12;
const AUTON_HEATMAP_ROWS = 6;
const TELEOP_HEATMAP_COLS = 24;
const TELEOP_HEATMAP_ROWS = 12;

const STRIP_ORDER: Array<{ key: StripKey; label: string; minY: number; maxY: number }> = [
  { key: 'top', label: 'Top Start Strip', minY: 0, maxY: 1 / 3 },
  { key: 'middle', label: 'Middle Start Strip', minY: 1 / 3, maxY: 2 / 3 },
  { key: 'bottom', label: 'Bottom Start Strip', minY: 2 / 3, maxY: 1 },
];

function clamp01(value: number): number {
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

function normalizePoint(point: { x: number; y: number }): NormalizedPoint {
  return {
    x: clamp01(point.x),
    y: clamp01(point.y),
  };
}

function toSvgPoint(point: NormalizedPoint): { x: number; y: number } {
  return {
    x: point.x * AUTON_FIELD_WIDTH,
    y: point.y * AUTON_FIELD_HEIGHT,
  };
}

function resolveStripForY(startY: number): StripKey {
  const y = clamp01(startY);

  if (y < 1 / 3) {
    return 'top';
  }
  if (y < 2 / 3) {
    return 'middle';
  }
  return 'bottom';
}

function sampleTrajectoryPointAt(points: NormalizedPoint[], ratio: number): NormalizedPoint {
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

function resampleTrajectory(points: NormalizedPoint[], sampleCount: number): NormalizedPoint[] {
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

function toPolyline(points: NormalizedPoint[]): string {
  return points
    .map((point) => {
      const svg = toSvgPoint(point);
      return `${svg.x},${svg.y}`;
    })
    .join(' ');
}

function averageResampledPaths(paths: NormalizedPoint[][]): NormalizedPoint[] {
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

function buildReplayPath(points: NormalizedPoint[], shots: NormalizedPoint[]): AutonPathData | null {
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

function alignPointToAlliance(point: NormalizedPoint, sourceAlliance: 'Red' | 'Blue' | '', targetAlliance: 'Red' | 'Blue' | ''): NormalizedPoint {
  return alignPointBetweenAlliances(point, sourceAlliance, targetAlliance);
}

function averagePoint(points: NormalizedPoint[]): NormalizedPoint {
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

function normalizePayload(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function toNumber(value: unknown): number | null {
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

function pickFirstNumber(data: unknown, keys: string[]): number | null {
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

function extractTeamNumber(team: StatboticsTeamEvent): number | null {
  const parsed = toNumber(team.team_number ?? team.team);
  if (!parsed || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function extractNickname(team: StatboticsTeamEvent, fallbackTeamNumber: number): string {
  const nickname =
    (typeof team.nickname === 'string' && team.nickname.trim()) ||
    (typeof team.name === 'string' && team.name.trim()) ||
    (typeof team.team_name === 'string' && team.team_name.trim()) ||
    '';

  return nickname || `Team ${fallbackTeamNumber}`;
}

function extractYearRows(payload: unknown): Record<string, unknown>[] {
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

function toMatchLabel(row: Record<string, unknown>, fallbackIndex: number): string {
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

function parseEventYear(eventKey: string): number | null {
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

function getPayloadEventKey(payload: unknown): string {
  if (!isRecord(payload)) {
    return '';
  }

  const raw = payload.eventKey;
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function metricValue(point: TeamYearPoint, key: MetricKey): number {
  return point[key];
}

const METRIC_META: Record<MetricKey, { label: string; color: string }> = {
  total_points: { label: 'Total EPA (unitless)', color: '#60a5fa' },
  auto_points: { label: 'Auto', color: '#34d399' },
  teleop_points: { label: 'Teleop', color: '#f59e0b' },
  endgame_points: { label: 'Endgame', color: '#f472b6' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asPitPayload(value: unknown): Partial<PitScoutData> | null {
  if (!isRecord(value)) {
    return null;
  }
  return value as Partial<PitScoutData>;
}

function asMatchPayload(value: unknown): Partial<MatchScoutData> | null {
  if (!isRecord(value)) {
    return null;
  }
  return value as Partial<MatchScoutData>;
}

function asAutonPathData(value: unknown): AutonPathData | null {
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
    startPosition: parsedStartPosition || fallbackStartFromTrajectory!,
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
    fieldVersion: value.fieldVersion === '2026-field-v1' ? '2026-field-v1' : '2026-field-v1',
  };
}

function displayText(value: unknown, fallback = 'Not set'): string {
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

function displayBoolean(value: unknown): 'Yes' | 'No' | 'Unknown' {
  if (typeof value !== 'boolean') {
    return 'Unknown';
  }
  return value ? 'Yes' : 'No';
}

function displayPhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 3);
}

function normalizeNoteText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function collectNoteBuckets(payloads: Partial<MatchScoutData>[]): Omit<MatchNotesBundle, 'totalMatches'> {
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
      defenseNotes.push(
        defenseQualityText ? `${defenseQualityText}: ${defenseText}` : defenseText,
      );
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

function buildMatchNotesBundle(entries: RawEntry[]): MatchNotesBundle {
  const payloads = entries
    .map((entry) => asMatchPayload(entry.payload))
    .filter((payload): payload is Partial<MatchScoutData> => payload !== null);
  const { autonNotes, defenseNotes, generalNotes } = collectNoteBuckets(payloads);

  return {
    totalMatches: payloads.length,
    autonNotes,
    defenseNotes,
    generalNotes,
  };
}

type ValueRowProps = {
  label: string;
  value: string;
  mono?: boolean;
};

function ValueRow({ label, value, mono = false }: ValueRowProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-sm text-slate-100 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

type BoolRowProps = {
  label: string;
  value: unknown;
};

function BoolRow({ label, value }: BoolRowProps) {
  const state = displayBoolean(value);
  const badgeClass =
    state === 'Yes'
      ? 'bg-blue-600/25 border border-blue-500/40 text-blue-100'
      : state === 'No'
        ? 'bg-slate-800 border border-slate-700 text-slate-300'
        : 'bg-slate-800 border border-slate-700 text-slate-400';

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-900/60 border border-slate-800 px-3 py-2">
      <span className="text-sm text-slate-200">{label}</span>
      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wide ${badgeClass}`}>{state}</span>
    </div>
  );
}

type SectionCardProps = {
  title: string;
  children: React.ReactNode;
};

function SectionCard({ title, children }: SectionCardProps) {
  return (
    <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 space-y-4">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-200">{title}</h4>
      {children}
    </div>
  );
}

type RawDataProps = {
  eventKey: string;
  profileId: string | null;
  scope?: RawDataScope;
  embeddedTeamNumber?: number | null;
  hideTeamList?: boolean;
  includeAutonPathViewer?: boolean;
};

export function RawData({
  eventKey,
  profileId,
  scope = 'event',
  embeddedTeamNumber = null,
  hideTeamList = false,
  includeAutonPathViewer = true,
}: RawDataProps) {
  const isGlobalScope = scope === 'global';
  const activeEventKey = eventKey.trim().toLowerCase();
  const activeSeasonYear = useMemo(() => parseEventYear(eventKey), [eventKey]);
  const [entries, setEntries] = useState<RawEntry[]>([]);
  const [eventTeams, setEventTeams] = useState<EventTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [teamYears, setTeamYears] = useState<TeamYearPoint[]>([]);
  const [isLoadingYears, setIsLoadingYears] = useState(false);
  const [yearError, setYearError] = useState<string | null>(null);
  const [noteSummary, setNoteSummary] = useState<MatchNoteSummary | null>(null);
  const [isLoadingNoteSummary, setIsLoadingNoteSummary] = useState(false);
  const [noteSummaryError, setNoteSummaryError] = useState<string | null>(null);
  const [visibleMetrics, setVisibleMetrics] = useState<Record<MetricKey, boolean>>({
    total_points: true,
    auto_points: true,
    teleop_points: true,
    endgame_points: true,
  });

  useEffect(() => {
    if (embeddedTeamNumber && Number.isInteger(embeddedTeamNumber) && embeddedTeamNumber > 0) {
      setSelectedTeam(embeddedTeamNumber);
    }
  }, [embeddedTeamNumber]);

  useEffect(() => {
    const loadData = async () => {
      const localPitPrefix = isGlobalScope
        ? 'pitScout:'
        : profileId
          ? `pitScout:${profileId}:`
          : null;

      const localPitEntries = storage
        .getAllKeys()
        .filter((key) => (localPitPrefix ? key.startsWith(localPitPrefix) : false))
        .map((key) => storage.get<SyncRecord<any>>(key))
        .filter(Boolean)
        .map((record) => ({
          key: `pit:${getPayloadEventKey(record!.data) || 'unknown'}:${record!.data?.teamNumber}`,
          type: 'pit' as const,
          teamNumber: record!.data?.teamNumber ?? 'Unknown',
          updatedAt: record!.timestamp || 0,
          source: 'local' as const,
          payload: record!.data,
        }));

      const localMatchEntries = storage
        .getAllKeys()
        .filter((key) => key.startsWith('matchScout:'))
        .map((key) => storage.get<SyncRecord<any>>(key))
        .filter(Boolean)
        .map((record) => ({
          key: `match:${record!.data?.matchNumber}:${record!.data?.teamNumber}`,
          type: 'match' as const,
          teamNumber: record!.data?.teamNumber ?? 'Unknown',
          matchNumber: record!.data?.matchNumber ?? 'Unknown',
          updatedAt: record!.timestamp || 0,
          source: 'local' as const,
          payload: record!.data,
        }));

      const profileTeamNumbers = profileId
        ? getProfileTeams(profileId)
            .map((team) => team?.team_number)
            .filter((teamNumber): teamNumber is number => Number.isInteger(teamNumber) && teamNumber > 0)
        : [];

      const pitQuery = supabase.from('pit_scouts').select('team_number, event_key, data, updated_at');
      const pitPromise = isGlobalScope
        ? profileTeamNumbers.length > 0
          ? pitQuery.in('team_number', profileTeamNumbers)
          : pitQuery
        : activeEventKey
          ? pitQuery.eq('event_key', activeEventKey)
          : Promise.resolve({ data: [], error: null });

      const [pitResult, matchResult] = await Promise.all([
        pitPromise,
        supabase.from('match_scouts').select('match_number, team_number, data, updated_at'),
      ]);

      const remotePitEntries: RawEntry[] = pitResult.error
        ? []
        : ((pitResult.data || []) as SupabaseRow[]).map((row) => {
            const payload = normalizePayload(row.data) as any;
            const payloadWithContext = {
              ...payload,
              eventKey: (payload?.eventKey || row.event_key || '').toString().trim().toLowerCase(),
            };
            const teamNumber = row.team_number ?? payload?.teamNumber ?? 'Unknown';
            return {
              key: `pit:${row.event_key || payload?.eventKey || 'unknown'}:${teamNumber}`,
              type: 'pit',
              teamNumber,
              updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
              source: 'remote',
              payload: payloadWithContext,
            };
          });

      const remoteMatchEntries: RawEntry[] = matchResult.error
        ? []
        : ((matchResult.data || []) as SupabaseRow[]).map((row) => {
            const payload = normalizePayload(row.data) as any;
          const payloadWithContext = {
            ...payload,
            eventKey: getPayloadEventKey(payload),
          };
            const matchNumber = row.match_number ?? payload?.matchNumber ?? 'Unknown';
            const teamNumber = row.team_number ?? payload?.teamNumber ?? 'Unknown';
            return {
              key: `match:${matchNumber}:${teamNumber}`,
              type: 'match',
              teamNumber,
              matchNumber,
              updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
              source: 'remote',
            payload: payloadWithContext,
            };
          });

      const merged = new Map<string, RawEntry>();
      [...localPitEntries, ...remotePitEntries, ...localMatchEntries, ...remoteMatchEntries].forEach((entry) => {
        const existing = merged.get(entry.key);
        if (!existing || entry.updatedAt >= existing.updatedAt) {
          merged.set(entry.key, entry);
        }
      });

      const sorted = Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      setEntries(sorted);
    };

    loadData();

    const refresh = () => {
      loadData();
    };

    window.addEventListener('sync-success', refresh);
    window.addEventListener('team-import-success', refresh);
    window.addEventListener('storage', refresh);

    return () => {
      window.removeEventListener('sync-success', refresh);
      window.removeEventListener('team-import-success', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [activeEventKey, isGlobalScope, profileId]);

  useEffect(() => {
    if (!eventKey) {
      setEventTeams([]);
      setSelectedTeam(null);
      setTeamsError('Select an event profile in Home to view teams.');
      return;
    }

    let cancelled = false;

    const loadTeams = async () => {
      setIsLoadingTeams(true);
      setTeamsError(null);

      try {
        const statboticsRows = await statbotics.fetchEventTeams(eventKey);
        const mapped = new Map<number, EventTeam>();

        if (Array.isArray(statboticsRows)) {
          statboticsRows.forEach((row) => {
            const teamNumber = extractTeamNumber(row);
            if (!teamNumber) {
              return;
            }

            mapped.set(teamNumber, {
              teamNumber,
              nickname: extractNickname(row, teamNumber),
              stats: row,
            });
          });
        }

        if (mapped.size === 0 && profileId) {
          const fallbackTeams = getProfileTeams(profileId);
          fallbackTeams.forEach((team) => {
            if (!team?.team_number) {
              return;
            }
            mapped.set(team.team_number, {
              teamNumber: team.team_number,
              nickname: team.nickname || team.name || `Team ${team.team_number}`,
              stats: null,
            });
          });
        }

        const list = Array.from(mapped.values()).sort((a, b) => a.teamNumber - b.teamNumber);

        if (!cancelled) {
          setEventTeams(list);
          if (list.length === 0) {
            setSelectedTeam(embeddedTeamNumber && embeddedTeamNumber > 0 ? embeddedTeamNumber : null);
            setTeamsError('No teams found for this event.');
          } else {
            // In embedded mode (Strategy popup), always pin to the requested team.
            if (embeddedTeamNumber && embeddedTeamNumber > 0) {
              setSelectedTeam(embeddedTeamNumber);
            } else {
              setSelectedTeam((prev) => {
                if (prev && list.some((team) => team.teamNumber === prev)) {
                  return prev;
                }
                return list[0].teamNumber;
              });
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setTeamsError(error instanceof Error ? error.message : 'Failed to load event teams');
          setEventTeams([]);
          setSelectedTeam(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTeams(false);
        }
      }
    };

    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [embeddedTeamNumber, eventKey, profileId]);

  useEffect(() => {
    if (!selectedTeam || (!isGlobalScope && !activeEventKey)) {
      setTeamYears([]);
      setYearError(null);
      return;
    }

    let cancelled = false;

    const loadTeamYears = async () => {
      setIsLoadingYears(true);
      setYearError(null);

      try {
        const params = new URLSearchParams({ team: String(selectedTeam) });
        if (isGlobalScope) {
          if (activeSeasonYear) {
            params.set('year', String(activeSeasonYear));
          }
        } else {
          params.set('eventKey', activeEventKey);
        }

        const response = await fetch(`/api/statbotics/team_matches?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Statbotics team matches request failed (${response.status})`);
        }

        const payload = await response.json();
        const rows = extractYearRows(payload);
        const parsed = rows
          .map((row, index) => {
            return {
              matchLabel: toMatchLabel(row, index),
              order: index,
              total_points: pickFirstNumber(row, [
                'epa.breakdown.total_points',
                'epa.total_points.mean',
                'epa.total_points',
                'norm_epa',
                'total_points',
              ]) ?? 0,
              auto_points: pickFirstNumber(row, ['epa.breakdown.auto_points', 'epa.auto_points', 'auto_points']) ?? 0,
              teleop_points: pickFirstNumber(row, ['epa.breakdown.teleop_points', 'epa.teleop_points', 'teleop_points']) ?? 0,
              endgame_points: pickFirstNumber(row, ['epa.breakdown.endgame_points', 'epa.endgame_points', 'endgame_points']) ?? 0,
            } as TeamYearPoint;
          })
          .filter((row) => {
            return row.total_points !== 0 || row.auto_points !== 0 || row.teleop_points !== 0 || row.endgame_points !== 0;
          });

        if (!cancelled && parsed.length === 0 && isGlobalScope) {
          const yearsResponse = await fetch(`/api/statbotics/team_years?team=${selectedTeam}`);
          if (yearsResponse.ok) {
            const yearsPayload = await yearsResponse.json();
            const yearRows = extractYearRows(yearsPayload);
            const selectedYearRow = activeSeasonYear
              ? yearRows.find((row) => toNumber(row.year) === activeSeasonYear)
              : null;
            const fallbackRow = selectedYearRow || yearRows.sort((a, b) => (toNumber(b.year) || 0) - (toNumber(a.year) || 0))[0];
            const fallbackYear = toNumber(fallbackRow?.year);

            if (fallbackRow && fallbackYear) {
              parsed.push({
                matchLabel: `Season ${fallbackYear}`,
                order: 0,
                total_points: pickFirstNumber(fallbackRow, [
                  'epa.breakdown.total_points',
                  'epa.total_points.mean',
                  'epa.total_points',
                  'norm_epa',
                  'total_points',
                ]) ?? 0,
                auto_points: pickFirstNumber(fallbackRow, ['epa.breakdown.auto_points', 'epa.auto_points', 'auto_points']) ?? 0,
                teleop_points: pickFirstNumber(fallbackRow, ['epa.breakdown.teleop_points', 'epa.teleop_points', 'teleop_points']) ?? 0,
                endgame_points: pickFirstNumber(fallbackRow, ['epa.breakdown.endgame_points', 'epa.endgame_points', 'endgame_points']) ?? 0,
              });
            }
          }
        }

        if (!cancelled) {
          setTeamYears(parsed);
        }
      } catch (error) {
        if (!cancelled) {
          setYearError(error instanceof Error ? error.message : 'Failed to load team years');
          setTeamYears([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingYears(false);
        }
      }
    };

    loadTeamYears();

    return () => {
      cancelled = true;
    };
  }, [activeEventKey, activeSeasonYear, isGlobalScope, selectedTeam]);

  const counts = useMemo(() => {
    const pit = entries.filter((e) => e.type === 'pit').length;
    const match = entries.filter((e) => e.type === 'match').length;
    return { pit, match, total: entries.length };
  }, [entries]);

  const filteredTeams = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return eventTeams;
    }

    return eventTeams.filter((team) => {
      return (
        String(team.teamNumber).includes(query) ||
        team.nickname.toLowerCase().includes(query)
      );
    });
  }, [eventTeams, search]);

  const selectedTeamEntry = useMemo(
    () => eventTeams.find((team) => team.teamNumber === selectedTeam) || null,
    [eventTeams, selectedTeam],
  );

  const selectedTeamDisplay = useMemo(() => {
    if (selectedTeamEntry) {
      return selectedTeamEntry;
    }

    if (!selectedTeam) {
      return null;
    }

    return {
      teamNumber: selectedTeam,
      nickname: `Team ${selectedTeam}`,
      stats: null,
    };
  }, [selectedTeam, selectedTeamEntry]);

  const selectedTeamScouting = useMemo(() => {
    if (!selectedTeam) {
      return { pit: [] as RawEntry[], match: [] as RawEntry[] };
    }

    const pit = entries
      .filter((entry) => {
        if (entry.type !== 'pit' || Number(entry.teamNumber) !== selectedTeam) {
          return false;
        }

        if (isGlobalScope) {
          return true;
        }

        const payloadEventKey = getPayloadEventKey(entry.payload);
        return payloadEventKey !== '' && payloadEventKey === activeEventKey;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const match = entries
      .filter((entry) => {
        if (entry.type !== 'match' || Number(entry.teamNumber) !== selectedTeam) {
          return false;
        }

        if (isGlobalScope) {
          return true;
        }

        const payloadEventKey = getPayloadEventKey(entry.payload);
        return payloadEventKey !== '' && payloadEventKey === activeEventKey;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);

    return { pit, match };
  }, [activeEventKey, entries, isGlobalScope, selectedTeam]);

  const selectedTeamMatchNotes = useMemo(
    () => buildMatchNotesBundle(selectedTeamScouting.match),
    [selectedTeamScouting.match],
  );

  const selectedTeamAutonPaths = useMemo(() => {
    return selectedTeamScouting.match
      .map((entry) => {
        const match = asMatchPayload(entry.payload);
        const autonPath = asAutonPathData(match?.autonPath);
        if (!match || !autonPath || autonPath.trajectoryPoints.length === 0) {
          return null;
        }

        return {
          key: entry.key,
          matchNumber: typeof match.matchNumber === 'number' ? match.matchNumber : Number(match.matchNumber) || 0,
          allianceColor: match.allianceColor === 'Red' || match.allianceColor === 'Blue' ? match.allianceColor : '',
          updatedAt: entry.updatedAt,
          path: autonPath,
        };
      })
      .filter((entry): entry is { key: string; matchNumber: number; allianceColor: 'Red' | 'Blue' | ''; updatedAt: number; path: AutonPathData } => entry !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [selectedTeamScouting.match]);

  const stripSummaries = useMemo(() => {
    const groupedRuns: Record<StripKey, StripRunSample[]> = {
      top: [],
      middle: [],
      bottom: [],
    };

    const groupedAllianceCounts: Record<StripKey, { red: number; blue: number }> = {
      top: { red: 0, blue: 0 },
      middle: { red: 0, blue: 0 },
      bottom: { red: 0, blue: 0 },
    };

    selectedTeamAutonPaths.forEach((entry) => {
      const strip = resolveStripForY(entry.path.startPosition?.y ?? 0.5);

      const normalizedTrajectory = entry.path.trajectoryPoints
        .map((point) => normalizePoint({ x: point.x, y: point.y }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

      if (normalizedTrajectory.length > 0) {
        groupedRuns[strip].push({
          trajectory: resampleTrajectory(normalizedTrajectory, PATH_SAMPLE_COUNT),
          shots: entry.path.shotAttempts
            .map((shot) => normalizePoint({ x: shot.x, y: shot.y }))
            .filter((shot) => Number.isFinite(shot.x) && Number.isFinite(shot.y)),
          start: normalizePoint({ x: entry.path.startPosition.x, y: entry.path.startPosition.y }),
          alliance: entry.allianceColor,
        });
      }

      if (entry.allianceColor === 'Red') {
        groupedAllianceCounts[strip].red += 1;
      }
      if (entry.allianceColor === 'Blue') {
        groupedAllianceCounts[strip].blue += 1;
      }

    });

    return STRIP_ORDER.map((stripConfig) => {
      const runs = groupedRuns[stripConfig.key];
      const allianceCounts = groupedAllianceCounts[stripConfig.key];
      const dominantAlliance = allianceCounts.red === allianceCounts.blue
        ? ''
        : allianceCounts.red > allianceCounts.blue
          ? 'Red'
          : 'Blue';

      const targetAlliance: 'Red' | 'Blue' | '' = dominantAlliance || (runs[0]?.alliance || '');

      const alignedRuns = runs.map((run) => {
        return {
          start: alignPointToAlliance(run.start, run.alliance, targetAlliance),
          trajectory: run.trajectory.map((point) => alignPointToAlliance(point, run.alliance, targetAlliance)),
          shots: run.shots.map((shot) => alignPointToAlliance(shot, run.alliance, targetAlliance)),
        };
      });

      const avgStart = averagePoint(alignedRuns.map((run) => run.start));
      const avgPath = averageResampledPaths(alignedRuns.map((run) => run.trajectory));
      if (avgPath.length > 0) {
        avgPath[0] = avgStart;
      }

      const allShots = alignedRuns.flatMap((run) => run.shots);
      const shotBins = buildHeatmapBins(allShots, AUTON_HEATMAP_COLS, AUTON_HEATMAP_ROWS);

      return {
        key: stripConfig.key,
        label: stripConfig.label,
        runCount: runs.length,
        totalShots: allShots.length,
        avgPath,
        replayPath: buildReplayPath(avgPath, allShots),
        dominantAlliance: targetAlliance,
        shotBins,
        maxShotBin: shotBins.reduce((max, value) => Math.max(max, value), 0),
      } as StripSummary;
    });
  }, [selectedTeamAutonPaths]);

  const selectedTeamTeleopSummary = useMemo(() => {
    const runs = selectedTeamScouting.match
      .map((entry) => {
        const match = asMatchPayload(entry.payload);
        if (!match) {
          return null;
        }

        const allianceColor = match.allianceColor === 'Red' || match.allianceColor === 'Blue' ? match.allianceColor : '';
        const rawAttempts = Array.isArray(match.teleopShotAttempts) ? match.teleopShotAttempts : [];
        const shots = rawAttempts
          .filter((shot) => isRecord(shot))
          .map((shot) => normalizePoint({ x: Number(shot.x), y: Number(shot.y) }))
          .filter((shot) => Number.isFinite(shot.x) && Number.isFinite(shot.y));

        return {
          allianceColor,
          shots,
        };
      })
      .filter((entry): entry is { allianceColor: 'Red' | 'Blue' | ''; shots: NormalizedPoint[] } => entry !== null);

    const redCount = runs.filter((run) => run.allianceColor === 'Red').length;
    const blueCount = runs.filter((run) => run.allianceColor === 'Blue').length;
    const dominantAlliance: 'Red' | 'Blue' | '' = redCount === blueCount ? '' : redCount > blueCount ? 'Red' : 'Blue';
    const targetAlliance: 'Red' | 'Blue' | '' = dominantAlliance || (runs[0]?.allianceColor || '');

    const alignedShots = runs.flatMap((run) => {
      return run.shots.map((shot) => alignPointToAlliance(shot, run.allianceColor, targetAlliance));
    });

    const shotBins = buildHeatmapBins(alignedShots, TELEOP_HEATMAP_COLS, TELEOP_HEATMAP_ROWS);

    return {
      shotBins,
      maxShotBin: shotBins.reduce((max, value) => Math.max(max, value), 0),
      totalShots: alignedShots.length,
      dominantAlliance: targetAlliance,
    };
  }, [selectedTeamScouting.match]);

  useEffect(() => {
    if (!selectedTeam || (!isGlobalScope && !activeEventKey)) {
      setNoteSummary(null);
      setIsLoadingNoteSummary(false);
      setNoteSummaryError(null);
      return;
    }

    const autonNotes = selectedTeamMatchNotes.autonNotes;
    const defenseNotes = selectedTeamMatchNotes.defenseNotes;
    const generalNotes = selectedTeamMatchNotes.generalNotes;

    if (autonNotes.length === 0 && defenseNotes.length === 0 && generalNotes.length === 0) {
      setNoteSummary({
        autonStrategy: 'No autonomous strategy notes were provided for this team yet.',
        defenseStrategy: 'No defense strategy notes were provided for this team yet.',
        overallSummary: 'No additional match notes were provided for this team yet.',
      });
      setIsLoadingNoteSummary(false);
      setNoteSummaryError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingNoteSummary(true);
    setNoteSummaryError(null);

    gemini
      .summarizeMatchNotes({
        eventKey: isGlobalScope
          ? activeSeasonYear
            ? `season-${activeSeasonYear}`
            : 'global'
          : activeEventKey,
        scope,
        contextLabel: isGlobalScope
          ? activeSeasonYear
            ? `season ${activeSeasonYear}`
            : 'all competitions'
          : activeEventKey,
        teamNumber: selectedTeam,
        autonNotes,
        defenseNotes,
        generalNotes,
      })
      .then((summary) => {
        if (!cancelled) {
          setNoteSummary(summary);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setNoteSummaryError(error instanceof Error ? error.message : 'Failed to summarize notes');
          setNoteSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingNoteSummary(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeEventKey, activeSeasonYear, isGlobalScope, scope, selectedTeam, selectedTeamMatchNotes]);

  const selectedTeamEventKeys = useMemo(() => {
    const keys = new Set<string>();

    [...selectedTeamScouting.pit, ...selectedTeamScouting.match].forEach((entry) => {
      const payloadEventKey = getPayloadEventKey(entry.payload);
      if (payloadEventKey) {
        keys.add(payloadEventKey);
      }
    });

    return Array.from(keys).sort();
  }, [selectedTeamScouting.match, selectedTeamScouting.pit]);

  const epaSummary = useMemo(() => {
    if (teamYears.length === 0) {
      return null;
    }

    const totals = teamYears.reduce(
      (acc, point) => {
        return {
          total: acc.total + point.total_points,
          auto: acc.auto + point.auto_points,
          teleop: acc.teleop + point.teleop_points,
          endgame: acc.endgame + point.endgame_points,
        };
      },
      { total: 0, auto: 0, teleop: 0, endgame: 0 },
    );

    const divisor = Math.max(1, teamYears.length);
    return {
      total: totals.total / divisor,
      auto: totals.auto / divisor,
      teleop: totals.teleop / divisor,
      endgame: totals.endgame / divisor,
    };
  }, [teamYears]);

  const activeMetricKeys = useMemo(
    () => (Object.keys(visibleMetrics) as MetricKey[]).filter((key) => visibleMetrics[key]),
    [visibleMetrics],
  );

  const graphData = useMemo(() => {
    if (teamYears.length === 0 || activeMetricKeys.length === 0) {
      return {
        series: {} as Record<MetricKey, string>,
        labels: [] as TeamYearPoint[],
      };
    }

    const width = 720;
    const height = 300;
    const padX = 48;
    const padY = 26;

    const allValues = teamYears.flatMap((point) => activeMetricKeys.map((metric) => metricValue(point, metric)));
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const spread = Math.max(1, maxVal - minVal);

    const xForIndex = (index: number) => {
      if (teamYears.length === 1) {
        return width / 2;
      }
      return padX + (index / (teamYears.length - 1)) * (width - padX * 2);
    };

    const yForValue = (value: number) => {
      const ratio = (value - minVal) / spread;
      return height - padY - ratio * (height - padY * 2);
    };

    const series = {} as Record<MetricKey, string>;

    activeMetricKeys.forEach((metric) => {
      const points = teamYears.map((point, index) => {
        const x = xForIndex(index);
        const y = yForValue(metricValue(point, metric));
        return `${x},${y}`;
      });
      series[metric] = points.join(' ');
    });

    return { series, labels: teamYears };
  }, [teamYears, activeMetricKeys]);

  const toggleMetric = (metric: MetricKey) => {
    setVisibleMetrics((previous) => ({
      ...previous,
      [metric]: !previous[metric],
    }));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 px-4">
      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl">
        <h2 className="text-2xl font-bold text-white">Team Analytics + Scouting Data</h2>
        <p className="text-slate-400 mt-2">
          {isGlobalScope
            ? 'Search teams from the active profile and view scouting/analytics aggregated across all competitions.'
            : 'Search teams from the selected event and view event-scoped scouting and analytics.'}
        </p>
        <div className="mt-4 text-sm text-slate-300 flex flex-wrap gap-4">
          <span>Scope: <span className="font-mono uppercase">{isGlobalScope ? 'all-competitions' : 'event-only'}</span></span>
          <span>Active event: <span className="font-mono uppercase">{eventKey || 'none'}</span></span>
          <span>Teams: {eventTeams.length}</span>
          <span>Scouting Records: {counts.total}</span>
          <span>Pit: {counts.pit}</span>
          <span>Match: {counts.match}</span>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${hideTeamList ? '' : 'lg:grid-cols-3'}`}>
        {!hideTeamList && (
          <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 shadow-xl lg:col-span-1">
          <label className="block text-sm font-medium text-slate-300 mb-2">Search Team</label>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Team # or nickname"
          />

          <div className="mt-4 max-h-[520px] overflow-auto space-y-2 pr-1">
            {isLoadingTeams && (
              <div className="text-sm text-slate-400">Loading event teams...</div>
            )}
            {!isLoadingTeams && teamsError && (
              <div className="text-sm text-rose-300">{teamsError}</div>
            )}
            {!isLoadingTeams && !teamsError && filteredTeams.length === 0 && (
              <div className="text-sm text-slate-400">No teams match your search.</div>
            )}

            {filteredTeams.map((team) => {
              const isActive = team.teamNumber === selectedTeam;
              return (
                <button
                  key={team.teamNumber}
                  onClick={() => setSelectedTeam(team.teamNumber)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${
                    isActive
                      ? 'bg-blue-600/20 border-blue-500 text-blue-100'
                      : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-mono font-semibold">Team {team.teamNumber}</div>
                  <div className="text-xs text-slate-400 truncate mt-1">{team.nickname}</div>
                </button>
              );
            })}
          </div>
        </div>
        )}

        <div className={`space-y-6 ${hideTeamList ? '' : 'lg:col-span-2'}`}>
          {!selectedTeamDisplay ? (
            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl text-slate-400">
              Select a team to view EPA and scouting details.
            </div>
          ) : (
            <>
              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl">
                <h3 className="text-xl font-bold text-white">Team {selectedTeamDisplay.teamNumber}</h3>
                <p className="text-slate-400 mt-1">{selectedTeamDisplay.nickname}</p>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                    <p className="text-xs text-slate-400">Total EPA ({isGlobalScope ? 'season avg' : 'event avg'})</p>
                    <p className="text-lg font-mono text-white">
                      {epaSummary?.total.toFixed(2) ?? selectedTeamDisplay.stats?.epa?.total_points?.toFixed?.(2) ?? 'N/A'}
                    </p>
                  </div>
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                    <p className="text-xs text-slate-400">Auto</p>
                    <p className="text-lg font-mono text-white">
                      {epaSummary?.auto.toFixed(2) ?? selectedTeamDisplay.stats?.epa?.auto_points?.toFixed?.(2) ?? 'N/A'}
                    </p>
                  </div>
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                    <p className="text-xs text-slate-400">Teleop</p>
                    <p className="text-lg font-mono text-white">
                      {epaSummary?.teleop.toFixed(2) ?? selectedTeamDisplay.stats?.epa?.teleop_points?.toFixed?.(2) ?? 'N/A'}
                    </p>
                  </div>
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                    <p className="text-xs text-slate-400">Endgame</p>
                    <p className="text-lg font-mono text-white">
                      {epaSummary?.endgame.toFixed(2) ?? selectedTeamDisplay.stats?.epa?.endgame_points?.toFixed?.(2) ?? 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {(Object.keys(METRIC_META) as MetricKey[]).map((metric) => (
                    <button
                      key={metric}
                      onClick={() => toggleMetric(metric)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        visibleMetrics[metric]
                          ? 'bg-slate-700 border-slate-500 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      {METRIC_META[metric].label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 bg-slate-900 border border-slate-700 rounded-xl p-3 overflow-x-auto">
                  {isLoadingYears && <div className="text-sm text-slate-400 p-3">Loading EPA trend...</div>}
                  {!isLoadingYears && yearError && <div className="text-sm text-rose-300 p-3">{yearError}</div>}
                  {!isLoadingYears && !yearError && teamYears.length === 0 && (
                    <div className="text-sm text-slate-400 p-3">
                      {isGlobalScope
                        ? 'No season-wide EPA data found for this team.'
                        : 'No match-level event EPA data found for this team.'}
                    </div>
                  )}
                  {!isLoadingYears && !yearError && teamYears.length > 0 && activeMetricKeys.length === 0 && (
                    <div className="text-sm text-slate-400 p-3">Enable at least one metric to draw the graph.</div>
                  )}
                  {!isLoadingYears && !yearError && teamYears.length > 0 && activeMetricKeys.length > 0 && (
                    <svg viewBox="0 0 720 300" className="w-full min-w-[640px] h-[300px]">
                      <line x1="48" y1="26" x2="48" y2="274" stroke="#334155" strokeWidth="1" />
                      <line x1="48" y1="274" x2="672" y2="274" stroke="#334155" strokeWidth="1" />

                      {activeMetricKeys.map((metric) => (
                        <polyline
                          key={metric}
                          fill="none"
                          stroke={METRIC_META[metric].color}
                          strokeWidth="2.5"
                          points={graphData.series[metric]}
                        />
                      ))}

                      {graphData.labels.map((point, index) => {
                        const x = graphData.labels.length === 1
                          ? 360
                          : 48 + (index / (graphData.labels.length - 1)) * (720 - 96);

                        const showTick = graphData.labels.length <= 12 || index === 0 || index === graphData.labels.length - 1 || index % 2 === 0;
                        if (!showTick) {
                          return null;
                        }

                        return (
                          <g key={`${point.matchLabel}-${index}`}>
                            <line x1={x} y1="274" x2={x} y2="278" stroke="#64748b" strokeWidth="1" />
                            <text x={x} y="292" fill="#94a3b8" fontSize="11" textAnchor="middle">
                              {point.matchLabel}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  {activeMetricKeys.map((metric) => (
                    <div key={metric} className="flex items-center gap-2 text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: METRIC_META[metric].color }} />
                      {METRIC_META[metric].label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl">
                <h3 className="text-xl font-bold text-white">Scouting Data</h3>
                <p className="text-slate-400 mt-1">
                  {isGlobalScope
                    ? `Showing all saved scouting records for team ${selectedTeamDisplay.teamNumber} across ${selectedTeamEventKeys.length || 0} competitions.`
                    : `Showing all saved scouting records for team ${selectedTeamDisplay.teamNumber} in event ${eventKey.toUpperCase() || 'N/A'}.`}
                </p>

                <div className="mt-4 text-sm text-slate-300 flex flex-wrap gap-4">
                  <span>Pit records: {selectedTeamScouting.pit.length}</span>
                  <span>Match records: {selectedTeamScouting.match.length}</span>
                  <span>Auton paths: {selectedTeamAutonPaths.length}</span>
                </div>

                {includeAutonPathViewer && selectedTeamAutonPaths.length > 0 && (
                  <div className="mt-4">
                    <SectionCard title="Autonomous Tendencies (Averaged)">
                      <p className="text-xs text-slate-400">
                        Paths are grouped by starting Y position in three equal horizontal strips, then averaged on normalized time. Heatmaps show where autonomous shots cluster for each strip.
                      </p>

                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                        {stripSummaries.map((summary) => (
                          <div key={`${summary.key}-path`} className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-100">{summary.label} Avg Path</p>
                              <p className="text-xs text-slate-400">Runs: {summary.runCount}</p>
                            </div>

                            {summary.replayPath && (
                              <AutonPathField
                                instanceId={`avg-replay-${selectedTeamDisplay.teamNumber}-${summary.key}`}
                                mode="replay"
                                allianceColor={summary.dominantAlliance}
                                value={summary.replayPath}
                              />
                            )}

                            {summary.runCount === 0 && (
                              <p className="text-xs text-slate-500">No autonomous paths captured from this start strip yet.</p>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                        {stripSummaries.map((summary) => (
                          <div key={`${summary.key}-heat`} className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-100">{summary.label} Shot Heatmap</p>
                              <p className="text-xs text-slate-400">Shots: {summary.totalShots}</p>
                            </div>

                            <FieldHeatmap
                              bins={summary.shotBins}
                              cols={AUTON_HEATMAP_COLS}
                              rows={AUTON_HEATMAP_ROWS}
                              maxBin={summary.maxShotBin}
                              totalShots={summary.totalShots}
                              width={AUTON_FIELD_WIDTH}
                              height={AUTON_FIELD_HEIGHT}
                              overlaySrc={AUTON_FIELD_OVERLAY_SRC}
                              color="#f43f5e"
                              showHorizontalThirds
                              emptyMessage="No autonomous shots captured from this start strip yet."
                            />
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  </div>
                )}

                <div className="mt-4">
                  <SectionCard title="Teleop Shot Heatmap">
                    <p className="text-xs text-slate-400">
                      Tap-mapped teleop shot attempts from all saved match scouts for this team.
                    </p>

                    <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-100">Teleop Shot Attempts</p>
                        <p className="text-xs text-slate-400">Shots: {selectedTeamTeleopSummary.totalShots}</p>
                      </div>

                      <FieldHeatmap
                        bins={selectedTeamTeleopSummary.shotBins}
                        cols={TELEOP_HEATMAP_COLS}
                        rows={TELEOP_HEATMAP_ROWS}
                        maxBin={selectedTeamTeleopSummary.maxShotBin}
                        totalShots={selectedTeamTeleopSummary.totalShots}
                        width={AUTON_FIELD_WIDTH}
                        height={AUTON_FIELD_HEIGHT}
                        overlaySrc={AUTON_FIELD_OVERLAY_SRC}
                        color="#22c55e"
                        emptyMessage="No teleop shot taps captured for this team yet."
                      />

                      <p className="text-xs text-slate-500">
                        Orientation: {selectedTeamTeleopSummary.dominantAlliance || 'mixed/unknown'} alliance frame
                      </p>
                    </div>
                  </SectionCard>
                </div>

                <div className="mt-4 space-y-3">
                  {selectedTeamScouting.pit.length === 0 && selectedTeamScouting.match.length === 0 && (
                    <div className="text-sm text-slate-400">No scouting data saved for this team yet.</div>
                  )}

                  {selectedTeamScouting.pit.map((entry) => (
                    <div key={entry.key} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
                        <span className="px-2 py-1 rounded bg-slate-700 text-slate-200 uppercase">pit</span>
                        <span className="text-slate-500">Source: {entry.source}</span>
                        <span className="text-slate-500">Updated: {entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : 'Unknown'}</span>
                      </div>

                      {(() => {
                        const pit = asPitPayload(entry.payload);
                        if (!pit) {
                          return <div className="text-sm text-slate-400">This record could not be rendered.</div>;
                        }

                        return (
                          <div className="space-y-4">
                            <SectionCard title="Robot Details">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <ValueRow label="Team Number" value={displayText(pit.teamNumber, 'Unknown')} mono />
                                <ValueRow label="Drive Train Type" value={displayText(pit.driveTrainType)} />
                                <ValueRow label="Chassis Width (in)" value={displayText(pit.chassisWidth)} />
                                <ValueRow label="Chassis Length (in)" value={displayText(pit.chassisLength)} />
                              </div>

                              {pit.driveTrainType === 'Other' && (
                                <ValueRow label="Drive Train (Other)" value={displayText(pit.driveTrainOther)} />
                              )}

                              <ValueRow label="Drive Motors" value={displayText(pit.driveMotors, 'None selected')} />
                            </SectionCard>

                            <SectionCard title="Game Mechanisms">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <ValueRow label="Fuel Hopper Capacity" value={displayText(pit.fuelHopperCapacity)} mono />
                                <ValueRow label="Intake Position" value={displayText(pit.intakePosition)} />
                                <ValueRow label="Shooter Type" value={displayText(pit.shooterType)} />
                                <ValueRow label="Looks Good" value={displayText(pit.looksGood)} />
                              </div>

                              <BoolRow label="Has Turret" value={pit.hasTurret} />
                              <BoolRow label="Can Drive over Bump" value={pit.canDriveOverBump} />
                              <BoolRow label="Can Drive under Trench" value={pit.canDriveUnderTrench} />
                              <BoolRow label="Can Climb Tower" value={pit.canClimbTower} />

                              {pit.canClimbTower && (
                                <ValueRow label="Maximum Climb Level" value={displayText(pit.maxClimbLevel)} />
                              )}
                            </SectionCard>

                            <SectionCard title="Strategy and Notes">
                              <BoolRow label="Can Play Defense" value={pit.canPlayDefense} />

                              {pit.canPlayDefense && (
                                <ValueRow label="Defense Style" value={displayText(pit.defenseStyle)} />
                              )}

                              <ValueRow label="Autonomous Description" value={displayText(pit.autoDescription)} />
                              <ValueRow label="Vision Setup" value={displayText(pit.visionSetup)} />
                              <ValueRow label="Additional Notes" value={displayText(pit.notes)} />

                              <div className="pt-2 border-t border-slate-700/70 space-y-3">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="px-2 py-1 rounded bg-slate-800 text-slate-200 uppercase">match strategy notes</span>
                                  <span className="text-slate-500">From {selectedTeamMatchNotes.totalMatches} saved match records</span>
                                </div>

                                {isLoadingNoteSummary && (
                                  <p className="text-sm text-slate-400">Summarizing cumulative autonomous and defense strategies...</p>
                                )}

                                {!isLoadingNoteSummary && noteSummaryError && (
                                  <p className="text-sm text-rose-300">{noteSummaryError}</p>
                                )}

                                {!isLoadingNoteSummary && !noteSummaryError && noteSummary && (
                                  <div className="space-y-3">
                                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3 space-y-1">
                                      <p className="text-xs uppercase tracking-wide text-slate-400">Cumulative Auton Strategy</p>
                                      <p className="text-sm text-slate-100 whitespace-pre-line">{noteSummary.autonStrategy}</p>
                                    </div>

                                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3 space-y-1">
                                      <p className="text-xs uppercase tracking-wide text-slate-400">Cumulative Defense Strategy</p>
                                      <p className="text-sm text-slate-100 whitespace-pre-line">{noteSummary.defenseStrategy}</p>
                                    </div>

                                    <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3 space-y-1">
                                      <p className="text-xs uppercase tracking-wide text-slate-400">Overall Match Notes</p>
                                      <p className="text-sm text-slate-100 whitespace-pre-line">{noteSummary.overallSummary}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </SectionCard>

                            {displayPhotoUrls(pit.photoUrls).length > 0 && (
                              <SectionCard title="Photos">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  {displayPhotoUrls(pit.photoUrls).map((photoUrl, index) => (
                                    <div key={`${photoUrl}-${index}`} className="rounded-xl border border-slate-700 bg-slate-950/40 p-2">
                                      <img
                                        src={photoUrl}
                                        alt={`Pit photo ${index + 1}`}
                                        className="w-full h-32 object-cover rounded-lg border border-slate-700"
                                        loading="lazy"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </SectionCard>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ))}

                  {selectedTeamScouting.pit.length === 0 && selectedTeamScouting.match.length > 0 && (
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
                        <span className="px-2 py-1 rounded bg-slate-700 text-slate-200 uppercase">match strategy notes</span>
                        <span className="text-slate-500">No pit scout record found yet. Showing notes from {selectedTeamMatchNotes.totalMatches} saved match records.</span>
                      </div>

                      <SectionCard title="Cumulative Strategy Summary">
                        {isLoadingNoteSummary && (
                          <p className="text-sm text-slate-400">Summarizing cumulative autonomous and defense strategies...</p>
                        )}

                        {!isLoadingNoteSummary && noteSummaryError && (
                          <p className="text-sm text-rose-300">{noteSummaryError}</p>
                        )}

                        {!isLoadingNoteSummary && !noteSummaryError && noteSummary && (
                          <div className="space-y-3">
                            <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3 space-y-1">
                              <p className="text-xs uppercase tracking-wide text-slate-400">Cumulative Auton Strategy</p>
                              <p className="text-sm text-slate-100 whitespace-pre-line">{noteSummary.autonStrategy}</p>
                            </div>

                            <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3 space-y-1">
                              <p className="text-xs uppercase tracking-wide text-slate-400">Cumulative Defense Strategy</p>
                              <p className="text-sm text-slate-100 whitespace-pre-line">{noteSummary.defenseStrategy}</p>
                            </div>

                            <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3 space-y-1">
                              <p className="text-xs uppercase tracking-wide text-slate-400">Overall Match Notes</p>
                              <p className="text-sm text-slate-100 whitespace-pre-line">{noteSummary.overallSummary}</p>
                            </div>
                          </div>
                        )}
                      </SectionCard>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
