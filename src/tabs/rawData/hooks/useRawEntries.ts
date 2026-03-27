import { useEffect, useRef, useState } from 'react';
import { getProfileTeams } from '../../../lib/competitionProfiles';
import { storage } from '../../../lib/storage';
import { supabase } from '../../../lib/supabase';
import { SyncRecord } from '../../../types';
import { DATA_REFRESH_DEBOUNCE_MS } from '../constants';
import { EntryCounts, RawEntry, SupabaseRow } from '../types';
import { getPayloadEventKey, normalizePayload } from '../utils';

type UseRawEntriesArgs = {
  activeEventKey: string;
  isGlobalScope: boolean;
  profileId: string | null;
  selectedTeam: number | null;
};

type UseRawEntriesResult = {
  entries: RawEntry[];
  counts: EntryCounts;
};

type RawIndexEntry = {
  key: string;
  type: 'pit' | 'match';
  updatedAt: number;
};

const EMPTY_COUNTS: EntryCounts = {
  pit: 0,
  match: 0,
  total: 0,
};

function buildEntryCounts(localIndexes: RawIndexEntry[], remoteIndexes: RawIndexEntry[]): EntryCounts {
  const merged = new Map<string, RawIndexEntry>();

  [...localIndexes, ...remoteIndexes].forEach((entry) => {
    const existing = merged.get(entry.key);
    if (!existing || entry.updatedAt >= existing.updatedAt) {
      merged.set(entry.key, entry);
    }
  });

  let pit = 0;
  let match = 0;

  merged.forEach((entry) => {
    if (entry.type === 'pit') {
      pit += 1;
      return;
    }

    match += 1;
  });

  return {
    pit,
    match,
    total: pit + match,
  };
}

export function useRawEntries({ activeEventKey, isGlobalScope, profileId, selectedTeam }: UseRawEntriesArgs): UseRawEntriesResult {
  const [entries, setEntries] = useState<RawEntry[]>([]);
  const [counts, setCounts] = useState<EntryCounts>(EMPTY_COUNTS);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      const localPitPrefix = isGlobalScope
        ? 'pitScout:'
        : profileId
          ? `pitScout:${profileId}:`
          : null;

      const localPitKeys = localPitPrefix ? storage.getKeysByPrefix(localPitPrefix) : [];
      const localMatchKeys = storage.getKeysByPrefix('matchScout:');

      const localIndexes: RawIndexEntry[] = [];
      const localSelectedEntries: RawEntry[] = [];

      localPitKeys.forEach((key) => {
        const record = storage.get<SyncRecord<any>>(key);
        if (!record) {
          return;
        }

        const payloadEventKey = getPayloadEventKey(record.data) || 'unknown';
        const teamNumber = record.data?.teamNumber ?? 'Unknown';
        const entry: RawEntry = {
          key: `pit:${payloadEventKey}:${teamNumber}`,
          type: 'pit',
          teamNumber,
          updatedAt: record.timestamp || 0,
          source: 'local',
          payload: record.data,
        };

        localIndexes.push({
          key: entry.key,
          type: 'pit',
          updatedAt: entry.updatedAt,
        });

        if (selectedTeam && Number(teamNumber) === selectedTeam) {
          localSelectedEntries.push(entry);
        }
      });

      localMatchKeys.forEach((key) => {
        const record = storage.get<SyncRecord<any>>(key);
        if (!record) {
          return;
        }

        const payloadEventKey = getPayloadEventKey(record.data);
        if (!isGlobalScope && activeEventKey && payloadEventKey !== activeEventKey) {
          return;
        }

        const matchNumber = record.data?.matchNumber ?? 'Unknown';
        const teamNumber = record.data?.teamNumber ?? 'Unknown';
        const entry: RawEntry = {
          key: `match:${matchNumber}:${teamNumber}`,
          type: 'match',
          teamNumber,
          matchNumber,
          updatedAt: record.timestamp || 0,
          source: 'local',
          payload: record.data,
        };

        localIndexes.push({
          key: entry.key,
          type: 'match',
          updatedAt: entry.updatedAt,
        });

        if (selectedTeam && Number(teamNumber) === selectedTeam) {
          localSelectedEntries.push(entry);
        }
      });

      const profileTeamNumbers = profileId
        ? getProfileTeams(profileId)
            .map((team) => team?.team_number)
            .filter((teamNumber): teamNumber is number => Number.isInteger(teamNumber) && teamNumber > 0)
        : [];

      const pitIndexQuery = supabase.from('pit_scouts').select('team_number, event_key, updated_at');
      const pitIndexPromise = isGlobalScope
        ? profileTeamNumbers.length > 0
          ? pitIndexQuery.in('team_number', profileTeamNumbers)
          : pitIndexQuery
        : activeEventKey
          ? pitIndexQuery.eq('event_key', activeEventKey)
          : Promise.resolve({ data: [], error: null });

      const matchIndexQuery = supabase.from('match_scouts').select('match_number, team_number, event_key, updated_at');
      const matchIndexPromise = isGlobalScope
        ? profileTeamNumbers.length > 0
          ? matchIndexQuery.in('team_number', profileTeamNumbers)
          : matchIndexQuery
        : activeEventKey
          ? matchIndexQuery.eq('event_key', activeEventKey)
          : Promise.resolve({ data: [], error: null });

      const remoteSelectedPitPromise = (() => {
        if (!selectedTeam) {
          return Promise.resolve({ data: [], error: null });
        }

        const query = supabase
          .from('pit_scouts')
          .select('team_number, event_key, data, updated_at')
          .eq('team_number', selectedTeam);

        if (isGlobalScope) {
          return profileTeamNumbers.length > 0
            ? query.in('team_number', profileTeamNumbers)
            : query;
        }

        return activeEventKey ? query.eq('event_key', activeEventKey) : Promise.resolve({ data: [], error: null });
      })();

      const remoteSelectedMatchPromise = (() => {
        if (!selectedTeam) {
          return Promise.resolve({ data: [], error: null });
        }

        const query = supabase
          .from('match_scouts')
          .select('match_number, team_number, event_key, data, updated_at')
          .eq('team_number', selectedTeam);

        if (isGlobalScope) {
          return profileTeamNumbers.length > 0
            ? query.in('team_number', profileTeamNumbers)
            : query;
        }

        return activeEventKey ? query.eq('event_key', activeEventKey) : Promise.resolve({ data: [], error: null });
      })();

      const [pitIndexResult, matchIndexResult, remoteSelectedPitResult, remoteSelectedMatchResult] = await Promise.all([
        pitIndexPromise,
        matchIndexPromise,
        remoteSelectedPitPromise,
        remoteSelectedMatchPromise,
      ]);

      const remoteIndexes: RawIndexEntry[] = [];

      if (!pitIndexResult.error) {
        ((pitIndexResult.data || []) as SupabaseRow[]).forEach((row) => {
          const teamNumber = row.team_number ?? 'Unknown';
          const eventKey = (row.event_key || '').toString().trim().toLowerCase() || 'unknown';
          remoteIndexes.push({
            key: `pit:${eventKey}:${teamNumber}`,
            type: 'pit',
            updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
          });
        });
      }

      if (!matchIndexResult.error) {
        ((matchIndexResult.data || []) as SupabaseRow[]).forEach((row) => {
          const matchNumber = row.match_number ?? 'Unknown';
          const teamNumber = row.team_number ?? 'Unknown';
          remoteIndexes.push({
            key: `match:${matchNumber}:${teamNumber}`,
            type: 'match',
            updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
          });
        });
      }

      const remoteSelectedEntries: RawEntry[] = [];

      if (!remoteSelectedPitResult.error) {
        ((remoteSelectedPitResult.data || []) as SupabaseRow[]).forEach((row) => {
          const payload = normalizePayload(row.data) as any;
          const payloadWithContext = {
            ...payload,
            eventKey: (payload?.eventKey || row.event_key || '').toString().trim().toLowerCase(),
          };
          const teamNumber = row.team_number ?? payload?.teamNumber ?? 'Unknown';
          remoteSelectedEntries.push({
            key: `pit:${row.event_key || payload?.eventKey || 'unknown'}:${teamNumber}`,
            type: 'pit',
            teamNumber,
            updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
            source: 'remote',
            payload: payloadWithContext,
          });
        });
      }

      if (!remoteSelectedMatchResult.error) {
        ((remoteSelectedMatchResult.data || []) as SupabaseRow[]).forEach((row) => {
          const payload = normalizePayload(row.data) as any;
          const payloadWithContext = {
            ...payload,
            eventKey: getPayloadEventKey(payload),
          };
          const matchNumber = row.match_number ?? payload?.matchNumber ?? 'Unknown';
          const teamNumber = row.team_number ?? payload?.teamNumber ?? 'Unknown';
          remoteSelectedEntries.push({
            key: `match:${matchNumber}:${teamNumber}`,
            type: 'match',
            teamNumber,
            matchNumber,
            updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
            source: 'remote',
            payload: payloadWithContext,
          });
        });
      }

      const mergedSelected = new Map<string, RawEntry>();
      [...localSelectedEntries, ...remoteSelectedEntries].forEach((entry) => {
        const existing = mergedSelected.get(entry.key);
        if (!existing || entry.updatedAt >= existing.updatedAt) {
          mergedSelected.set(entry.key, entry);
        }
      });

      const sortedSelected = Array.from(mergedSelected.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      const mergedCounts = buildEntryCounts(localIndexes, remoteIndexes);

      if (!cancelled) {
        setEntries(sortedSelected);
        setCounts(mergedCounts);
      }
    };

    void loadData();

    const clearRefreshTimer = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };

    const scheduleRefresh = (event?: Event) => {
      if (event instanceof StorageEvent) {
        if (!event.key || (!event.key.startsWith('pitScout:') && !event.key.startsWith('matchScout:'))) {
          return;
        }
      }

      clearRefreshTimer();
      refreshTimerRef.current = setTimeout(() => {
        void loadData();
      }, DATA_REFRESH_DEBOUNCE_MS);
    };

    window.addEventListener('sync-success', scheduleRefresh);
    window.addEventListener('team-import-success', scheduleRefresh);
    window.addEventListener('storage', scheduleRefresh);

    return () => {
      cancelled = true;
      clearRefreshTimer();
      window.removeEventListener('sync-success', scheduleRefresh);
      window.removeEventListener('team-import-success', scheduleRefresh);
      window.removeEventListener('storage', scheduleRefresh);
    };
  }, [activeEventKey, isGlobalScope, profileId, selectedTeam]);

  return { entries, counts };
}
