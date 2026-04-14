import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Trash2 } from 'lucide-react';
import { showToast } from '../components/Toast';
import { storage } from '../lib/storage';
import { deleteMatchScoutById, supabase } from '../lib/supabase';
import { MatchScoutData, SyncRecord } from '../types';

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

export function AdminGlobalMatchData() {
  const [rows, setRows] = useState<GlobalMatchRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingDeletes, setPendingDeletes] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

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
            notePreview: buildNotePreview(payload),
            payload,
          };
        });

      const { data, error } = await supabase
        .from('match_scouts')
        .select('id, match_number, team_number, alliance, validated, data, updated_at')
        .order('updated_at', { ascending: false });

      if (error) {
        throw error;
      }

      const remoteRows = ((data || []) as SupabaseMatchRow[]).map((row) => {
        const payload = asMatchPayload(normalizePayload(row.data));

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
  }, []);

  useEffect(() => {
    void loadRows();

    const refresh = () => {
      void loadRows(true);
    };

    window.addEventListener('sync-success', refresh);
    window.addEventListener('storage', refresh);

    return () => {
      window.removeEventListener('sync-success', refresh);
      window.removeEventListener('storage', refresh);
    };
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
        row.validated ? 'validated' : 'not-validated',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(trimmedQuery);
    });
  }, [rows, query]);

  const toggleExpanded = (id: string) => {
    setExpandedRows((current) => ({
      ...current,
      [id]: !current[id],
    }));
  };

  const handleDelete = async (row: GlobalMatchRow) => {
    if (pendingDeletes[row.id]) {
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

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <section className="rounded-3xl border border-slate-700 bg-slate-800/40 p-6 sm:p-8 shadow-xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-rose-300 text-sm tracking-wide uppercase font-semibold">Allowlisted Admin Tool</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Global Match Data Pool</h1>
            <p className="text-slate-300 mt-2 max-w-3xl">
              View every saved match row across all events, including validated and invalid records. Rows are sorted by
              most recent update time.
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

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Total Rows</p>
            <p className="text-lg font-bold text-white mt-1">{rows.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Validated</p>
            <p className="text-lg font-bold text-emerald-300 mt-1">{rows.filter((row) => row.validated).length}</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Not Validated</p>
            <p className="text-lg font-bold text-amber-300 mt-1">{rows.filter((row) => !row.validated).length}</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Visible Rows</p>
            <p className="text-lg font-bold text-sky-300 mt-1">{filteredRows.length}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3">
          <label htmlFor="global-match-search" className="text-xs uppercase tracking-wide text-slate-400">
            Search by match, team, event, notes, id, source
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
            const isExpanded = Boolean(expandedRows[row.id]);
            const teleopShotCount = Array.isArray(row.payload.teleopShotAttempts) ? row.payload.teleopShotAttempts.length : 0;
            const hasAutonPath = Boolean(row.payload.autonPath);

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
                      onClick={() => void handleDelete(row)}
                      disabled={isPendingDelete}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold"
                    >
                      <Trash2 className="w-4 h-4" />
                      {isPendingDelete ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
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
                        <p className="text-xs uppercase tracking-wide text-slate-400">Teleop Shot Data</p>
                        <pre className="mt-2 text-xs text-slate-200 whitespace-pre-wrap break-all overflow-x-auto max-h-72">
                          {stringifyJson(row.payload.teleopShotAttempts || [])}
                        </pre>
                      </div>
                      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Auton Path Data</p>
                        <pre className="mt-2 text-xs text-slate-200 whitespace-pre-wrap break-all overflow-x-auto max-h-72">
                          {stringifyJson(row.payload.autonPath || null)}
                        </pre>
                      </div>
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
