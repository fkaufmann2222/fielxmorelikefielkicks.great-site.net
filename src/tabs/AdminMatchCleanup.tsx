import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { showToast } from '../components/Toast';
import { storage } from '../lib/storage';
import { tba } from '../lib/tba';
import {
  deleteMatchScoutById,
  listAssignmentsForEvent,
  supabase,
  upsertAssignment,
  validateMatchScoutById,
} from '../lib/supabase';
import { MatchScoutData, ScoutAssignment, SyncRecord, TBAMatch } from '../types';

type MatchScoutRow = {
  id: string;
  localKey?: string;
  matchNumber: number | string;
  teamNumber: number | string;
  alliance: string;
  eventKey: string;
  notes: string;
  updatedAt: number;
  validated: boolean;
  source: 'local' | 'remote';
};

type SupabaseMatchRow = {
  id: string;
  match_number?: number | null;
  team_number?: number | null;
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

type Props = {
  eventKey: string;
  scoutProfiles: Array<{ id: string; name: string; bannedAt?: string | null }>;
  onBanScout: (scoutProfileId: string) => void;
  onUnbanScout: (scoutProfileId: string) => void;
};

export function AdminMatchCleanup({ eventKey, scoutProfiles, onBanScout, onUnbanScout }: Props) {
  const [rows, setRows] = useState<MatchScoutRow[]>([]);
  const [assignments, setAssignments] = useState<ScoutAssignment[]>([]);
  const [eventMatches, setEventMatches] = useState<TBAMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [pendingActions, setPendingActions] = useState<Record<string, 'delete' | 'validate'>>({});
  const [assignmentMatchNumber, setAssignmentMatchNumber] = useState<number | ''>('');
  const [assignmentTeamNumber, setAssignmentTeamNumber] = useState<number | ''>('');
  const [assignmentScoutId, setAssignmentScoutId] = useState('');
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [isAssignmentBusy, setIsAssignmentBusy] = useState(false);

  const loadRows = useCallback(async () => {
    setIsLoading(true);

    try {
      const normalizedEventKey = eventKey.trim().toLowerCase();
      const localRows = storage
        .getAllKeys()
        .filter((key) => key.startsWith('matchScout:'))
        .map((key) => ({ key, record: storage.get<SyncRecord<any>>(key) }))
        .filter((entry): entry is { key: string; record: SyncRecord<any> } => Boolean(entry.record?.id))
        .map(({ key, record }) => {
          const payload = asMatchPayload(record.data);
          const rowEventKey = trimText(payload.eventKey).toLowerCase();
          if (!normalizedEventKey || rowEventKey !== normalizedEventKey) {
            return null;
          }
          const validated = Boolean(payload.validated);
          if (validated) {
            return null;
          }
          const notes = [trimText(payload.autonNotes), trimText(payload.defenseNotes), trimText(payload.notes)]
            .filter(Boolean)
            .join(' | ');

          return {
            id: record.id,
            localKey: key,
            matchNumber: toDisplayNumber(payload.matchNumber),
            teamNumber: toDisplayNumber(payload.teamNumber),
            alliance: trimText(payload.allianceColor) || 'Unknown',
            eventKey: trimText(payload.eventKey) || 'Unknown',
            notes: notes || 'No notes',
            updatedAt: record.timestamp || 0,
            validated,
            source: 'local' as const,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      const { data, error } = await supabase
        .from('match_scouts')
        .select('id, match_number, team_number, validated, data, updated_at')
        .eq('validated', false);
      if (error) {
        throw error;
      }

      const remoteRows: MatchScoutRow[] = ((data || []) as SupabaseMatchRow[]).map((row) => {
        const payload = asMatchPayload(normalizePayload(row.data));
        const rowEventKey = trimText(payload.eventKey).toLowerCase();
        if (!normalizedEventKey || rowEventKey !== normalizedEventKey) {
          return null;
        }
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
          validated: Boolean(row.validated ?? payload.validated),
          source: 'remote',
        };
      }).filter((row): row is MatchScoutRow => row !== null);

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
  }, [eventKey]);

  const loadAssignments = useCallback(async () => {
    try {
      const loadedAssignments = await listAssignmentsForEvent(eventKey);
      setAssignments(loadedAssignments);
      if (!assignmentScoutId && scoutProfiles.length > 0) {
        const firstAvailableScout = scoutProfiles.find((profile) => !profile.bannedAt);
        if (firstAvailableScout) {
          setAssignmentScoutId(firstAvailableScout.id);
        }
      }
    } catch (error) {
      console.error('Failed to load scout assignments:', error);
      showToast('Failed to load assignments');
    }
  }, [eventKey, assignmentScoutId, scoutProfiles]);

  const loadEventMatches = useCallback(async () => {
    const normalizedEventKey = eventKey.trim().toLowerCase();
    if (!normalizedEventKey) {
      setEventMatches([]);
      return;
    }

    try {
      const fetched = await tba.fetchMatches(normalizedEventKey);
      setEventMatches(Array.isArray(fetched) ? fetched : []);
    } catch (error) {
      console.error('Failed to load event matches for assignment board:', error);
      setEventMatches(tba.getMatches());
    }
  }, [eventKey]);

  useEffect(() => {
    void loadRows();
    void loadAssignments();
    void loadEventMatches();

    const refresh = () => {
      void loadRows();
      void loadAssignments();
      void loadEventMatches();
    };

    window.addEventListener('sync-success', refresh);
    window.addEventListener('storage', refresh);

    return () => {
      window.removeEventListener('sync-success', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [loadRows, loadAssignments, loadEventMatches]);

  const matchOptions = useMemo(() => {
    const fromTba = Array.from(
      new Set<number>(
        eventMatches
          .map((match) => match.match_number)
          .filter((value): value is number => Number.isFinite(value)),
      ),
    ).sort((a, b) => a - b);

    if (fromTba.length > 0) {
      return fromTba;
    }

    return Array.from(
      new Set<number>(
        rows
          .map((row) => (typeof row.matchNumber === 'number' ? row.matchNumber : Number(row.matchNumber)))
          .filter((value): value is number => Number.isFinite(value)),
      ),
    ).sort((a, b) => a - b);
  }, [eventMatches, rows]);

  const teamOptions = useMemo(() => {
    if (assignmentMatchNumber === '') {
      return [];
    }

    const selectedMatches = eventMatches.filter((match) => match.match_number === assignmentMatchNumber);
    if (selectedMatches.length > 0) {
      return Array.from(
        new Set<string>(
          selectedMatches.flatMap((match) => [
            ...match.alliances.red.team_keys,
            ...match.alliances.blue.team_keys,
          ]),
        ),
      )
        .map((teamKey) => Number(teamKey.replace('frc', '')))
        .filter((value): value is number => Number.isFinite(value))
        .sort((a, b) => a - b);
    }

    return Array.from(
      new Set<number>(
        rows
          .filter((row) => {
            const parsedMatch = typeof row.matchNumber === 'number' ? row.matchNumber : Number(row.matchNumber);
            return parsedMatch === assignmentMatchNumber;
          })
          .map((row) => (typeof row.teamNumber === 'number' ? row.teamNumber : Number(row.teamNumber)))
          .filter((value): value is number => Number.isFinite(value)),
      ),
    ).sort((a, b) => a - b);
  }, [assignmentMatchNumber, eventMatches, rows]);

  useEffect(() => {
    setAssignmentTeamNumber('');
  }, [assignmentMatchNumber]);

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
    if (pendingActions[row.id]) {
      return;
    }

    setPendingActions((current) => ({ ...current, [row.id]: 'delete' }));
    try {
      await deleteMatchScoutById(row.id);
      storage.removeMatchScoutRecordById(row.id);
      setRows((current) => current.filter((entry) => entry.id !== row.id));
      showToast(`Deleted match ${row.matchNumber} team ${row.teamNumber}`);
    } catch (error) {
      console.error('Failed to delete match scout row:', error);
      showToast('Delete failed. Try again.');
    } finally {
      setPendingActions((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
    }
  };

  const handleValidate = async (row: MatchScoutRow) => {
    if (pendingActions[row.id]) {
      return;
    }

    setPendingActions((current) => ({ ...current, [row.id]: 'validate' }));
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
      showToast(`Validated match ${row.matchNumber} team ${row.teamNumber}`);
    } catch (error) {
      console.error('Failed to validate match scout row:', error);
      showToast('Validation failed. Try again.');
    } finally {
      setPendingActions((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
    }
  };

  const handleCreateAssignment = async () => {
    if (isAssignmentBusy) {
      return;
    }

    const normalizedEventKey = eventKey.trim().toLowerCase();
    if (!normalizedEventKey) {
      showToast('Select an active event before assigning scouts');
      return;
    }
    if (!assignmentScoutId || assignmentMatchNumber === '' || assignmentTeamNumber === '') {
      showToast('Choose scout, match number, and team number');
      return;
    }

    setIsAssignmentBusy(true);
    try {
      await upsertAssignment({
        eventKey: normalizedEventKey,
        scoutProfileId: assignmentScoutId,
        matchNumber: assignmentMatchNumber,
        teamNumber: assignmentTeamNumber,
        notes: assignmentNotes,
      });
      const refreshed = await listAssignmentsForEvent(normalizedEventKey);
      setAssignments(refreshed);
      setAssignmentMatchNumber('');
      setAssignmentTeamNumber('');
      setAssignmentNotes('');
      showToast('Assignment saved');
    } catch (error) {
      console.error('Failed to save assignment:', error);
      showToast('Assignment save failed');
    } finally {
      setIsAssignmentBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold text-white">Admin Match Cleanup</h2>
          <p className="text-sm text-slate-300">
            Review pending match scouting records for this event. Checkmark validates and hides the record, X deletes junk.
          </p>
        </div>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by event, team, match, id, or notes"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 space-y-3">
          <h3 className="text-lg font-semibold text-white">Scout Moderation</h3>
          <p className="text-xs text-slate-400">Ban immediately kicks a scout and blocks future login.</p>
          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {scoutProfiles.length === 0 ? (
              <p className="text-sm text-slate-400">No scouts found yet.</p>
            ) : (
              scoutProfiles.map((scout) => (
                <div key={scout.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{scout.name}</p>
                    <p className="text-xs text-slate-400">{scout.bannedAt ? 'Banned' : 'Active'}</p>
                  </div>
                  {scout.bannedAt ? (
                    <button
                      onClick={() => onUnbanScout(scout.id)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                    >
                      Unban
                    </button>
                  ) : (
                    <button
                      onClick={() => onBanScout(scout.id)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                    >
                      Ban
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 space-y-3">
          <h3 className="text-lg font-semibold text-white">Match Assignment Board</h3>
          <p className="text-xs text-slate-400">Assign scouts to match/team pairs and track completion state.</p>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={assignmentMatchNumber}
              onChange={(event) => setAssignmentMatchNumber(event.target.value ? Number(event.target.value) : '')}
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
            >
              <option value="">Select match...</option>
              {matchOptions.map((matchNumber) => (
                <option key={matchNumber} value={matchNumber}>
                  Match {matchNumber}
                </option>
              ))}
            </select>
            <select
              value={assignmentTeamNumber}
              onChange={(event) => setAssignmentTeamNumber(event.target.value ? Number(event.target.value) : '')}
              disabled={assignmentMatchNumber === ''}
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white disabled:opacity-50"
            >
              <option value="">Select team...</option>
              {teamOptions.map((teamNumber) => (
                <option key={teamNumber} value={teamNumber}>
                  Team {teamNumber}
                </option>
              ))}
            </select>
          </div>
          <select
            value={assignmentScoutId}
            onChange={(event) => setAssignmentScoutId(event.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
          >
            <option value="">Select scout...</option>
            {scoutProfiles.filter((profile) => !profile.bannedAt).map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <input
            value={assignmentNotes}
            onChange={(event) => setAssignmentNotes(event.target.value)}
            placeholder="Optional notes"
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
          />
          <button
            onClick={() => {
              void handleCreateAssignment();
            }}
            disabled={isAssignmentBusy}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm disabled:opacity-50"
          >
            Save Assignment
          </button>

          <div className="max-h-40 overflow-auto space-y-1 pr-1">
            {assignments.map((assignment) => {
              const scoutName = scoutProfiles.find((profile) => profile.id === assignment.scoutProfileId)?.name || 'Unknown scout';
              return (
                <div key={assignment.id} className="text-xs rounded-lg border border-slate-700 bg-slate-900/50 px-2 py-1.5 text-slate-200">
                  M{assignment.matchNumber} / T{assignment.teamNumber} {'->'} {scoutName} ({assignment.status})
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-5 text-slate-300">Loading pending match scouting data...</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-5 text-slate-300">No pending match scouting records found.</div>
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
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
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
                          void handleValidate(row);
                        }}
                        disabled={Boolean(pendingActions[row.id])}
                        className="mr-2 inline-flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Validate match ${row.matchNumber} team ${row.teamNumber}`}
                        title="Validate record"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          void handleDelete(row);
                        }}
                        disabled={Boolean(pendingActions[row.id])}
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
