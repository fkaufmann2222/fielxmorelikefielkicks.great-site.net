import React, { useEffect, useMemo, useState } from 'react';
import { storage } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { SyncRecord } from '../types';

type RawEntryType = 'pit' | 'match';

type RawEntry = {
  key: string;
  type: RawEntryType;
  teamNumber: number | string;
  matchNumber?: number | string;
  updatedAt: number;
  source: 'local' | 'remote';
  payload: unknown;
};

type SupabaseRow = {
  data: unknown;
  team_number?: number | null;
  match_number?: number | null;
  updated_at?: string;
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

export function RawData() {
  const [entries, setEntries] = useState<RawEntry[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const localPitEntries = storage
        .getAllKeys()
        .filter((key) => key.startsWith('pitScout:'))
        .map((key) => storage.get<SyncRecord<any>>(key))
        .filter(Boolean)
        .map((record) => ({
          key: `pit:${record!.data?.teamNumber}`,
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

      const [pitResult, matchResult] = await Promise.all([
        supabase.from('pit_scouts').select('team_number, data, updated_at'),
        supabase.from('match_scouts').select('match_number, team_number, data, updated_at'),
      ]);

      const remotePitEntries: RawEntry[] = pitResult.error
        ? []
        : ((pitResult.data || []) as SupabaseRow[]).map((row) => {
            const payload = normalizePayload(row.data) as any;
            const teamNumber = row.team_number ?? payload?.teamNumber ?? 'Unknown';
            return {
              key: `pit:${teamNumber}`,
              type: 'pit',
              teamNumber,
              updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
              source: 'remote',
              payload,
            };
          });

      const remoteMatchEntries: RawEntry[] = matchResult.error
        ? []
        : ((matchResult.data || []) as SupabaseRow[]).map((row) => {
            const payload = normalizePayload(row.data) as any;
            const matchNumber = row.match_number ?? payload?.matchNumber ?? 'Unknown';
            const teamNumber = row.team_number ?? payload?.teamNumber ?? 'Unknown';
            return {
              key: `match:${matchNumber}:${teamNumber}`,
              type: 'match',
              teamNumber,
              matchNumber,
              updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
              source: 'remote',
              payload,
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
  }, []);

  const counts = useMemo(() => {
    const pit = entries.filter((e) => e.type === 'pit').length;
    const match = entries.filter((e) => e.type === 'match').length;
    return { pit, match, total: entries.length };
  }, [entries]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 px-4">
      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl">
        <h2 className="text-2xl font-bold text-white">Raw Data</h2>
        <p className="text-slate-400 mt-2">
          Showing all raw pit scouting and match scouting data for all teams.
        </p>
        <div className="mt-4 text-sm text-slate-300 flex flex-wrap gap-4">
          <span>Total: {counts.total}</span>
          <span>Pit: {counts.pit}</span>
          <span>Match: {counts.match}</span>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl text-slate-400">
          No pit scouting or match scouting records found yet.
        </div>
      ) : (
        entries.map((entry) => (
          <div key={entry.key} className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl">
            <div className="flex flex-wrap items-center gap-2 text-sm mb-3">
              <span className="px-2 py-1 rounded bg-slate-700 text-slate-200 uppercase">{entry.type}</span>
              <span className="text-slate-300 font-mono">Team {entry.teamNumber}</span>
              {entry.type === 'match' && <span className="text-slate-300 font-mono">Match {entry.matchNumber}</span>}
              <span className="text-slate-500">Source: {entry.source}</span>
            </div>
            <pre className="text-xs text-slate-200 bg-slate-900 border border-slate-700 rounded-xl p-4 overflow-auto">
              {JSON.stringify(entry.payload, null, 2)}
            </pre>
          </div>
        ))
      )}
    </div>
  );
}
