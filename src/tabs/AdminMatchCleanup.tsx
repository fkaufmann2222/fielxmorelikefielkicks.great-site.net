import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { showToast } from '../components/Toast';
import { storage } from '../lib/storage';
import { deleteMatchScoutById, supabase } from '../lib/supabase';
import { MatchScoutData, SyncRecord } from '../types';

type MatchScoutRow = {
  id: string;
  matchNumber: number | string;
  teamNumber: number | string;
  alliance: string;
  eventKey: string;
  notes: string;
  updatedAt: number;
  source: 'local' | 'remote';
};

type SupabaseMatchRow = {
  id: string;
  match_number?: number | null;
  team_number?: number | null;
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

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function AdminMatchCleanup() {
  const [rows, setRows] = useState<MatchScoutRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setIsLoading(true);

    try {
      const localRows: MatchScoutRow[] = storage
        .getAllKeys()
        .filter((key) => key.startsWith('matchScout:'))
        .map((key) => storage.get<SyncRecord<any>>(key))
        .filter((record): record is SyncRecord<any> => Boolean(record?.id))
        .map((record) => {
          const payload = asMatchPayload(record.data);
          const notes = [trimText(payload.autonNotes), trimText(payload.defenseNotes), trimText(payload.notes)]
            .filter(Boolean)
            .join(' | ');

          return {
            id: record.id,
            matchNumber: toDisplayNumber(payload.matchNumber),
            teamNumber: toDisplayNumber(payload.teamNumber),
            alliance: trimText(payload.allianceColor) || 'Unknown',
            eventKey: trimText(payload.eventKey) || 'Unknown',
            notes: notes || 'No notes',
            updatedAt: record.timestamp || 0,
            source: 'local',
          };
        });

      const { data, error } = await supabase.from('match_scouts').select('id, match_number, team_number, data, updated_at');
      if (error) {
        throw error;
      }

      const remoteRows: MatchScoutRow[] = ((data || []) as SupabaseMatchRow[]).map((row) => {
        const payload = asMatchPayload(normalizePayload(row.data));
        const notes = [trimText(payload.autonNotes), trimText(payload.defenseNotes), trimText(payload.notes)]
          .filter(Boolean)
          .join(' | ');

        return {
          id: row.id,
          matchNumber: row.match_number ?? toDisplayNumber(payload.matchNumber),
          teamNumber: row.team_number ?? toDisplayNumber(payload.teamNumber),
          alliance: trimText(payload.allianceColor) || 'Unknown',
          eventKey: trimText(payload.eventKey) || 'Unknown',
          notes: notes || 'No notes',
          updatedAt: toUpdatedAt(row.updated_at),
          source: 'remote',
        };
      });

      const merged = new Map<string, MatchScoutRow>();
      [...localRows, ...remoteRows].forEach((row) => {
        const existing = merged.get(row.id);
        if (!existing || row.updatedAt >= existing.updatedAt) {
          merged.set(row.id, row);
        }
      });

      const sorted = Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      setRows(sorted);
    } catch (error) {
      console.error('Failed to load match scout rows:', error);
      showToast('Failed to load match scouting data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();

    const refresh = () => {
      void loadRows();
    };

    window.addEventListener('sync-success', refresh);
    window.addEventListener('storage', refresh);

    return () => {
      window.removeEventListener('sync-success', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return rows;
    }

    return rows.filter((row) => {
      const haystack = `${row.id} ${row.eventKey} ${row.matchNumber} ${row.teamNumber} ${row.alliance} ${row.notes}`.toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [rows, query]);

  const handleDelete = async (row: MatchScoutRow) => {
    if (deletingId) {
      return;
    }

    const confirmed = window.confirm(`Delete match ${row.matchNumber}, team ${row.teamNumber}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setDeletingId(row.id);
    try {
      await deleteMatchScoutById(row.id);
      storage.removeMatchScoutRecordById(row.id);
      setRows((current) => current.filter((entry) => entry.id !== row.id));
      window.dispatchEvent(new CustomEvent('sync-success'));
      showToast(`Deleted match ${row.matchNumber} team ${row.teamNumber}`);
    } catch (error) {
      console.error('Failed to delete match scout row:', error);
      showToast('Delete failed. Try again.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold text-white">Admin Match Cleanup</h2>
          <p className="text-sm text-slate-300">
            Review all match scouting records and remove junk entries.
          </p>
        </div>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by event, team, match, id, or notes"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-5 text-slate-300">Loading match scouting data...</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-5 text-slate-300">No match scouting records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/70 text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Event</th>
                  <th className="px-3 py-2 text-left font-medium">Match</th>
                  <th className="px-3 py-2 text-left font-medium">Team</th>
                  <th className="px-3 py-2 text-left font-medium">Alliance</th>
                  <th className="px-3 py-2 text-left font-medium">Updated</th>
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                  <th className="px-3 py-2 text-left font-medium">Notes</th>
                  <th className="px-3 py-2 text-right font-medium">Delete</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-700/80 align-top">
                    <td className="px-3 py-2 text-slate-200">{row.eventKey}</td>
                    <td className="px-3 py-2 text-slate-200">{row.matchNumber}</td>
                    <td className="px-3 py-2 text-slate-200">{row.teamNumber}</td>
                    <td className="px-3 py-2 text-slate-200">{row.alliance}</td>
                    <td className="px-3 py-2 text-slate-400">{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : 'Unknown'}</td>
                    <td className="px-3 py-2 text-slate-400">{row.source}</td>
                    <td className="px-3 py-2 text-slate-300 max-w-md truncate" title={row.notes}>
                      {row.notes}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => {
                          void handleDelete(row);
                        }}
                        disabled={deletingId === row.id}
                        className="inline-flex items-center justify-center rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Delete match ${row.matchNumber} team ${row.teamNumber}`}
                        title="Delete record"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
