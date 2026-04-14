import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, RefreshCw, Trash2 } from 'lucide-react';
import { AutonPathField } from '../components/AutonPathField';
import { showToast } from '../components/Toast';
import { storage } from '../lib/storage';
import { deleteMatchScoutById, supabase, validateMatchScoutById } from '../lib/supabase';
import { AllianceColor, AutonPathData, MatchScoutData, SyncRecord } from '../types';
import { TeleopShotField } from './rawData/components/TeleopShotField';

type GlobalMatchRow = {
  id: string;
  localKey?: string;
  matchNumber: number | string;
  teamNumber: number | string;
  alliance: string;
  eventKey: string;
  validated: boolean;
  updatedAt: number;
  source: 'local' | 'remote';
  collectorProfileId: string | null;
  collectorName: string | null;
  collectorSource: 'record' | 'legacy-admin-record' | 'unknown';
  notePreview: string;
  payload: Partial<MatchScoutData>;
};

type SupabaseMatchRow = {
  id: string;
  match_number?: number | null;
  team_number?: number | null;
  alliance?: string | null;
  validated?: boolean | null;
  data: unknown;
  updated_at?: string | null;
};

type RawMatchPoint = {
  x: number;
  y: number;
  timestampMs: number;
};

type ScoutProfileLookup = Array<{ id: string; name: string }>;

type Props = {
  scoutProfiles?: ScoutProfileLookup;
};

const START_SLOTS = new Set(['R1', 'R2', 'R3', 'B1', 'B2', 'B3']);

type RawPointTableProps = {
  title: string;
  points: RawMatchPoint[];
  emptyMessage: string;
};

function RawPointTable({ title, points, emptyMessage }: RawPointTableProps) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        <p className="text-xs text-slate-400">{points.length}</p>
      </div>

      {points.length === 0 ? (
        <p className="text-xs text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="max-h-52 overflow-auto rounded-lg border border-slate-700">
          <table className="min-w-full text-xs text-slate-200">
            <thead className="sticky top-0 bg-slate-900/95 border-b border-slate-700">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-300">#</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-300">Time (ms)</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-300">X</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-300">Y</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => (
                <tr key={`${title}-${index}-${point.timestampMs}`} className="border-b border-slate-800 last:border-b-0">
                  <td className="px-2 py-1.5 text-slate-400">{index + 1}</td>
                  <td className="px-2 py-1.5 font-mono">{Math.round(point.timestampMs)}</td>
                  <td className="px-2 py-1.5 font-mono">{point.x.toFixed(4)}</td>
                  <td className="px-2 py-1.5 font-mono">{point.y.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeRawPoint(value: unknown, fallbackTimestampMs: number): RawMatchPoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const point = value as Record<string, unknown>;
  const x = toNumber(point.x);
  const y = toNumber(point.y);

  if (x === null || y === null) {
    return null;
  }

  return {
    x: clamp01(x),
    y: clamp01(y),
    timestampMs: toNumber(point.timestampMs) ?? fallbackTimestampMs,
  };
}

function normalizeRawPoints(value: unknown): RawMatchPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((point, index) => normalizeRawPoint(point, index * 1000))
    .filter((point): point is RawMatchPoint => Boolean(point));
}

function normalizeAllianceColor(value: unknown): AllianceColor | '' {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'red') {
    return 'Red';
  }
  if (normalized === 'blue') {
    return 'Blue';
  }
  return '';
}

function normalizeAutonPath(value: unknown): AutonPathData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const trajectoryPoints = normalizeRawPoints(payload.trajectoryPoints);

  if (trajectoryPoints.length === 0) {
    return null;
  }

  const shotAttempts = normalizeRawPoints(payload.shotAttempts);
  const startPositionPayload = payload.startPosition;

  let startPosition = {
    x: trajectoryPoints[0].x,
    y: trajectoryPoints[0].y,
  };

  if (startPositionPayload && typeof startPositionPayload === 'object' && !Array.isArray(startPositionPayload)) {
    const rawStart = startPositionPayload as Record<string, unknown>;
    const startX = toNumber(rawStart.x);
    const startY = toNumber(rawStart.y);

    if (startX !== null && startY !== null) {
      startPosition = {
        x: clamp01(startX),
        y: clamp01(startY),
      };
    }
  }

  const durationMsCandidate = toNumber(payload.durationMs);
  const fallbackDurationMs = Math.max(0, trajectoryPoints[trajectoryPoints.length - 1].timestampMs);
  const durationMs = durationMsCandidate !== null && durationMsCandidate > 0 ? durationMsCandidate : fallbackDurationMs;
  const capturedAt = typeof payload.capturedAt === 'string' && payload.capturedAt.trim() ? payload.capturedAt : '1970-01-01T00:00:00.000Z';
  const startSlotCandidate = typeof payload.startSlot === 'string' ? payload.startSlot.trim().toUpperCase() : '';
  const startSlot = START_SLOTS.has(startSlotCandidate)
    ? (startSlotCandidate as NonNullable<AutonPathData['startSlot']>)
    : undefined;

  return {
    startPosition,
    startSlot,
    capturedAt,
    durationMs,
    trajectoryPoints,
    shotAttempts,
    fieldVersion: '2026-field-v1',
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

function asMatchPayload(value: unknown): Partial<MatchScoutData> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Partial<MatchScoutData>;
}

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeCollectorId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveCollector(payload: Partial<MatchScoutData>, scoutNameById: Map<string, string>) {
  const explicitCollectorId = sanitizeCollectorId(payload.scoutedByProfileId);
  const legacyAdminCollectorId = sanitizeCollectorId(payload.scoutedByAdminProfileId);

  let collectorProfileId: string | null = null;
  let collectorSource: GlobalMatchRow['collectorSource'] = 'unknown';

  if (explicitCollectorId) {
    collectorProfileId = explicitCollectorId;
    collectorSource = 'record';
  } else if (legacyAdminCollectorId) {
    collectorProfileId = legacyAdminCollectorId;
    collectorSource = 'legacy-admin-record';
  }

  return {
    collectorProfileId,
    collectorName: collectorProfileId ? scoutNameById.get(collectorProfileId) || null : null,
    collectorSource,
  };
}

function collectorSourceLabel(source: GlobalMatchRow['collectorSource']): string {
  switch (source) {
    case 'record':
      return 'from match record';
    case 'legacy-admin-record':
      return 'from legacy admin field';
    default:
      return 'collector not recorded';
  }
}

function collectorDisplayLabel(row: Pick<GlobalMatchRow, 'collectorName' | 'collectorProfileId'>): string {
  if (row.collectorName && row.collectorProfileId) {
    return `${row.collectorName} (${row.collectorProfileId})`;
  }

  if (row.collectorName) {
    return row.collectorName;
  }

  if (row.collectorProfileId) {
    return row.collectorProfileId;
  }

  return 'Unknown scout';
}

function toDisplayNumber(value: unknown): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 'Unknown';
}

function toUpdatedAt(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp) {
    return 'Unknown';
  }

  return new Date(timestamp).toLocaleString();
}

function buildNotePreview(payload: Partial<MatchScoutData>): string {
  const chunks = [trimText(payload.autonNotes), trimText(payload.defenseNotes), trimText(payload.notes)].filter(Boolean);
  if (chunks.length === 0) {
    return 'No notes';
  }

  const combined = chunks.join(' | ');
  return combined.length > 180 ? `${combined.slice(0, 177)}...` : combined;
}

function stringifyJson(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AdminGlobalMatchData({ scoutProfiles = [] }: Props) {
  const [rows, setRows] = useState<GlobalMatchRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCollectorId, setSelectedCollectorId] = useState('');
  const [pendingDeletes, setPendingDeletes] = useState<Record<string, boolean>>({});
  const [pendingApprovals, setPendingApprovals] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const scoutNameById = useMemo(() => {
    const map = new Map<string, string>();

    scoutProfiles.forEach((profile) => {
      const id = profile.id.trim();
      const name = profile.name.trim();
      if (!id || !name) {
        return;
      }

      map.set(id, name);
    });

    return map;
  }, [scoutProfiles]);

  const loadRows = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const localRows = storage
        .getAllKeys()
        .filter((key) => key.startsWith('matchScout:'))
        .map((key) => ({ key, record: storage.get<SyncRecord<any>>(key) }))
        .filter((entry): entry is { key: string; record: SyncRecord<any> } => Boolean(entry.record?.id))
        .map(({ key, record }) => {
          const payload = asMatchPayload(record.data);
          if (Boolean(payload.validated)) {
            return null;
          }
          const collector = resolveCollector(payload, scoutNameById);

          return {
            id: record.id,
            localKey: key,
            matchNumber: toDisplayNumber(payload.matchNumber),
            teamNumber: toDisplayNumber(payload.teamNumber),
            alliance: trimText(payload.allianceColor) || 'Unknown',
            eventKey: trimText(payload.eventKey) || 'Unknown',
            validated: Boolean(payload.validated),
            updatedAt: record.timestamp || 0,
            source: 'local' as const,
            collectorProfileId: collector.collectorProfileId,
            collectorName: collector.collectorName,
            collectorSource: collector.collectorSource,
            notePreview: buildNotePreview(payload),
            payload,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      const { data, error } = await supabase
        .from('match_scouts')
        .select('id, match_number, team_number, alliance, validated, data, updated_at')
        .eq('validated', false)
        .order('updated_at', { ascending: false });

      if (error) {
        throw error;
      }

      const remoteRows = ((data || []) as SupabaseMatchRow[]).map((row) => {
        const payload = asMatchPayload(normalizePayload(row.data));
        const collector = resolveCollector(payload, scoutNameById);

        return {
          id: row.id,
          localKey: undefined,
          matchNumber: row.match_number ?? toDisplayNumber(payload.matchNumber),
          teamNumber: row.team_number ?? toDisplayNumber(payload.teamNumber),
          alliance: trimText(row.alliance) || trimText(payload.allianceColor) || 'Unknown',
          eventKey: trimText(payload.eventKey) || 'Unknown',
          validated: Boolean(row.validated ?? payload.validated),
          updatedAt: toUpdatedAt(row.updated_at),
          source: 'remote' as const,
          collectorProfileId: collector.collectorProfileId,
          collectorName: collector.collectorName,
          collectorSource: collector.collectorSource,
          notePreview: buildNotePreview(payload),
          payload,
        };
      });

      const merged = new Map<string, GlobalMatchRow>();
      [...localRows, ...remoteRows].forEach((row) => {
        const existing = merged.get(row.id);
        if (!existing || row.updatedAt >= existing.updatedAt) {
          merged.set(row.id, {
            ...row,
            localKey: row.localKey || existing?.localKey,
          });
        }
      });

      const sorted = Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      setRows(sorted);
    } catch (error) {
      console.error('Failed to load global match data:', error);
      showToast('Failed to load global match data');
    } finally {
      if (isManualRefresh) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [scoutNameById]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) {
      return rows;
    }

    return rows.filter((row) => {
      const haystack = [
        row.id,
        String(row.matchNumber),
        String(row.teamNumber),
        row.alliance,
        row.eventKey,
        row.notePreview,
        row.source,
        row.collectorName || '',
        row.collectorProfileId || '',
        row.validated ? 'validated' : 'not-validated',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(trimmedQuery);
    });
  }, [rows, query]);

  const collectorOptions = useMemo(() => {
    const collectorMap = new Map<string, { id: string; name: string; count: number }>();

    rows.forEach((row) => {
      if (!row.collectorProfileId) {
        return;
      }

      const existing = collectorMap.get(row.collectorProfileId);
      if (!existing) {
        collectorMap.set(row.collectorProfileId, {
          id: row.collectorProfileId,
          name: row.collectorName || row.collectorProfileId,
          count: 1,
        });
        return;
      }

      existing.count += 1;
      if (!row.collectorName) {
        return;
      }

      existing.name = row.collectorName;
    });

    return Array.from(collectorMap.values()).sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }

      return a.name.localeCompare(b.name);
    });
  }, [rows]);

  useEffect(() => {
    if (collectorOptions.length === 0) {
      if (selectedCollectorId) {
        setSelectedCollectorId('');
      }
      return;
    }

    const stillExists = collectorOptions.some((option) => option.id === selectedCollectorId);
    if (stillExists) {
      return;
    }

    setSelectedCollectorId(collectorOptions[0].id);
  }, [collectorOptions, selectedCollectorId]);

  const toggleExpanded = (id: string) => {
    setExpandedRows((current) => ({
      ...current,
      [id]: !current[id],
    }));
  };

  const handleDelete = async (row: GlobalMatchRow) => {
    if (pendingDeletes[row.id] || pendingApprovals[row.id]) {
      return;
    }

    const confirmed = window.confirm(
      `Delete match ${row.matchNumber} / team ${row.teamNumber} from the global data pool? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setPendingDeletes((current) => ({ ...current, [row.id]: true }));

    try {
      await deleteMatchScoutById(row.id);
      storage.removeMatchScoutRecordById(row.id);
      setRows((current) => current.filter((entry) => entry.id !== row.id));
      showToast(`Deleted match ${row.matchNumber} team ${row.teamNumber}`);
    } catch (error) {
      console.error('Failed to delete global match row:', error);
      showToast('Delete failed. Try again.');
    } finally {
      setPendingDeletes((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
    }
  };

  const handleApproveByEvan = async (row: GlobalMatchRow) => {
    if (pendingApprovals[row.id] || pendingDeletes[row.id]) {
      return;
    }

    const confirmed = window.confirm(
      `Approve match ${row.matchNumber} / team ${row.teamNumber} and remove it from the global match data pool?`,
    );

    if (!confirmed) {
      return;
    }

    setPendingApprovals((current) => ({ ...current, [row.id]: true }));

    try {
      if (row.localKey) {
        const localRecord = storage.get<SyncRecord<any>>(row.localKey);
        if (localRecord?.data && typeof localRecord.data === 'object') {
          storage.saveRecord('matchScout', row.localKey, {
            ...(localRecord.data as Record<string, unknown>),
            validated: true,
          });
        }
      }

      await validateMatchScoutById(row.id);
      setRows((current) => current.filter((entry) => entry.id !== row.id));
      showToast(`Approved match ${row.matchNumber} team ${row.teamNumber}`);
    } catch (error) {
      console.error('Failed to approve global match row:', error);
      showToast('Approval failed. Try again.');
    } finally {
      setPendingApprovals((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
    }
  };

  const handleDeleteByCollector = async (collectorId: string) => {
    if (!collectorId || isBulkDeleting) {
      return;
    }

    const targetRows = rows.filter((row) => row.collectorProfileId === collectorId);
    if (targetRows.length === 0) {
      showToast('No rows found for that scout');
      return;
    }

    const collectorName = targetRows.find((row) => row.collectorName)?.collectorName || collectorId;
    const confirmed = window.confirm(
      `Delete ${targetRows.length} rows collected by ${collectorName} (${collectorId}) from the global data pool? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setIsBulkDeleting(true);

    const deletedIds = new Set<string>();
    let failedCount = 0;

    for (const row of targetRows) {
      try {
        await deleteMatchScoutById(row.id);
        storage.removeMatchScoutRecordById(row.id);
        deletedIds.add(row.id);
      } catch (error) {
        failedCount += 1;
        console.error('Failed to bulk delete collector row:', error);
      }
    }

    if (deletedIds.size > 0) {
      setRows((current) => current.filter((row) => !deletedIds.has(row.id)));
    }

    if (failedCount === 0) {
      showToast(`Deleted ${deletedIds.size} rows for ${collectorName}`);
    } else {
      showToast(`Deleted ${deletedIds.size} rows for ${collectorName}. ${failedCount} failed.`);
    }

    setIsBulkDeleting(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <section className="rounded-3xl border border-slate-700 bg-slate-800/40 p-6 sm:p-8 shadow-xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-rose-300 text-sm tracking-wide uppercase font-semibold">Allowlisted Admin Tool</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Global Match Data Pool</h1>
            <p className="text-slate-300 mt-2 max-w-3xl">
              Review active pool rows across all events. Use Approved by Evan to validate and remove clean rows from
              this queue.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadRows(true)}
            disabled={isLoading || isRefreshing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Total Rows</p>
            <p className="text-lg font-bold text-white mt-1">{rows.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Validated</p>
            <p className="text-lg font-bold text-emerald-300 mt-1">0</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Not Validated</p>
            <p className="text-lg font-bold text-amber-300 mt-1">{rows.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Visible Rows</p>
            <p className="text-lg font-bold text-sky-300 mt-1">{filteredRows.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Attributed Scouts</p>
            <p className="text-lg font-bold text-fuchsia-300 mt-1">{collectorOptions.length}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
          <label htmlFor="global-match-search" className="text-xs uppercase tracking-wide text-slate-400">
            Search by match, team, event, notes, id, source, scout
          </label>
          <input
            id="global-match-search"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type to filter rows"
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
          />
        </div>

        <div className="rounded-2xl border border-rose-700/50 bg-rose-950/20 p-3">
          <p className="text-xs uppercase tracking-wide text-rose-200">Collector Control</p>
          {collectorOptions.length === 0 ? (
            <p className="text-sm text-slate-300 mt-2">No attributed scouts found yet.</p>
          ) : (
            <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1">
                <label htmlFor="collector-select" className="text-xs uppercase tracking-wide text-slate-300">
                  Select Scout
                </label>
                <select
                  id="collector-select"
                  value={selectedCollectorId}
                  onChange={(event) => setSelectedCollectorId(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/60 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500/60"
                >
                  {collectorOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.id}) - {option.count} rows
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void handleDeleteByCollector(selectedCollectorId)}
                disabled={!selectedCollectorId || isBulkDeleting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold"
              >
                <Trash2 className="w-4 h-4" />
                {isBulkDeleting ? 'Deleting Scout Rows...' : 'Delete All Rows By Scout'}
              </button>
            </div>
          )}
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-6 text-slate-300">Loading global match data...</div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/30 p-6 text-slate-300">
          No match rows found for the current filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRows.map((row) => {
            const isPendingDelete = Boolean(pendingDeletes[row.id]);
            const isPendingApprove = Boolean(pendingApprovals[row.id]);
            const isExpanded = Boolean(expandedRows[row.id]);
            const teleopShotPoints = normalizeRawPoints(row.payload.teleopShotAttempts);
            const teleopShotCount = teleopShotPoints.length;
            const autonPath = normalizeAutonPath(row.payload.autonPath);
            const autonTrajectoryPoints = autonPath?.trajectoryPoints || [];
            const autonShotPoints = autonPath?.shotAttempts || [];
            const allianceColor = normalizeAllianceColor(row.payload.allianceColor || row.alliance);
            const hasAutonPath = Boolean(autonPath);

            return (
              <article key={row.id} className="rounded-2xl border border-slate-700 bg-slate-800/40 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2 py-1 rounded bg-slate-700 text-slate-100 uppercase">Match {row.matchNumber}</span>
                      <span className="px-2 py-1 rounded bg-slate-700 text-slate-100 uppercase">Team {row.teamNumber}</span>
                      <span className="px-2 py-1 rounded bg-slate-700 text-slate-100 uppercase">Event {row.eventKey || 'Unknown'}</span>
                      <span className="px-2 py-1 rounded bg-slate-700 text-slate-100 uppercase">Alliance {row.alliance}</span>
                      <span className="px-2 py-1 rounded bg-slate-700 text-slate-100 uppercase">{row.source}</span>
                      <span
                        className={`px-2 py-1 rounded uppercase ${
                          row.validated ? 'bg-emerald-600/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'
                        }`}
                      >
                        {row.validated ? 'validated' : 'not validated'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300">{row.notePreview}</p>
                    <p className="text-xs text-slate-400">
                      Updated {formatTimestamp(row.updatedAt)} | ID {row.id}
                    </p>
                    <p className="text-xs text-slate-400">
                      Collected by {collectorDisplayLabel(row)} | {collectorSourceLabel(row.collectorSource)}
                    </p>
                    <p className="text-xs text-slate-400">
                      Teleop shots {teleopShotCount} | Auton path {hasAutonPath ? 'captured' : 'not captured'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(row.id)}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-slate-600 bg-slate-900/50 hover:bg-slate-900 text-slate-100 text-sm"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {isExpanded ? 'Hide Details' : 'Show Details'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleApproveByEvan(row)}
                      disabled={isPendingApprove || isPendingDelete}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {isPendingApprove ? 'Approving...' : 'Approved by Evan'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(row)}
                      disabled={isPendingDelete || isPendingApprove}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold"
                    >
                      <Trash2 className="w-4 h-4" />
                      {isPendingDelete ? 'Deleting...' : 'Delete'}
                    </button>
                    {row.collectorProfileId && (
                      <button
                        type="button"
                        onClick={() => setSelectedCollectorId(row.collectorProfileId || '')}
                        className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-fuchsia-500/50 bg-fuchsia-900/20 hover:bg-fuchsia-900/40 text-fuchsia-100 text-sm font-semibold"
                      >
                        Select Scout
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Collector</p>
                        <p className="text-slate-100 mt-1 whitespace-pre-line">{collectorDisplayLabel(row)}</p>
                        <p className="text-xs text-slate-400 mt-2">{collectorSourceLabel(row.collectorSource)}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Auton Notes</p>
                        <p className="text-slate-100 mt-1 whitespace-pre-line">{trimText(row.payload.autonNotes) || 'None'}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Defense Notes</p>
                        <p className="text-slate-100 mt-1 whitespace-pre-line">{trimText(row.payload.defenseNotes) || 'None'}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-400">General Notes</p>
                        <p className="text-slate-100 mt-1 whitespace-pre-line">{trimText(row.payload.notes) || 'None'}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Unaveraged Autonomous Path</p>
                        <div className="mt-2">
                          {autonPath ? (
                            <AutonPathField
                              instanceId={`global-replay-${row.id}`}
                              mode="replay"
                              allianceColor={allianceColor}
                              value={autonPath}
                            />
                          ) : (
                            <p className="text-xs text-slate-500">No autonomous path captured for this match.</p>
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Raw Teleop Shot Positions</p>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-100">Teleop Shot Map</p>
                            <p className="text-xs text-slate-400">Shots: {teleopShotCount}</p>
                          </div>
                          <TeleopShotField points={teleopShotPoints} />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                      <RawPointTable
                        title="Auton Trajectory Points"
                        points={autonTrajectoryPoints}
                        emptyMessage="No trajectory points captured."
                      />
                      <RawPointTable
                        title="Auton Shot Positions"
                        points={autonShotPoints}
                        emptyMessage="No autonomous shots captured."
                      />
                      <RawPointTable
                        title="Teleop Shot Coordinates"
                        points={teleopShotPoints}
                        emptyMessage="No teleop shots captured."
                      />
                    </div>

                    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Full Payload</p>
                      <pre className="mt-2 text-xs text-slate-200 whitespace-pre-wrap break-all overflow-x-auto max-h-96">
                        {stringifyJson(row.payload)}
                      </pre>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
