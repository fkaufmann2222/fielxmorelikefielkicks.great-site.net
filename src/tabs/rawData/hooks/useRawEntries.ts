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

const TEAM_FILTER_CHUNK_SIZE = 20;

function chunkTeamNumbers(values: number[], size: number): number[][] {
  if (values.length === 0) {
    return [];
  }

  const chunks: number[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function isMissingEventKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = String((error as { message?: unknown }).message || '').toLowerCase();
  return message.includes('event_key') && (message.includes('column') || message.includes('not found') || message.includes('does not exist'));
}

async function fetchByTeamChunks(
  table: 'pit_scouts' | 'match_scouts',
  selectClause: string,
  teamNumbers: number[],
): Promise<{ data: SupabaseRow[]; error: unknown }> {
  const normalized = Array.from(new Set(teamNumbers.filter((value) => Number.isInteger(value) && value > 0)));

  if (normalized.length === 0) {
    const { data, error } = await supabase.from(table).select(selectClause);
    return {
      data: ((data || []) as unknown as SupabaseRow[]),
      error,
    };
  }

  const chunks = chunkTeamNumbers(normalized, TEAM_FILTER_CHUNK_SIZE);
  const results = await Promise.all(
    chunks.map((chunk) => {
      return supabase.from(table).select(selectClause).in('team_number', chunk);
    }),
  );

  const mergedData: SupabaseRow[] = [];
  let firstError: unknown = null;

  results.forEach((result) => {
    if (result.error && !firstError) {
      firstError = result.error;
    }

    if (Array.isArray(result.data)) {
      mergedData.push(...(result.data as unknown as SupabaseRow[]));
    }
  });

  return {
    data: mergedData,
    error: firstError,
  };
}

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

      const fetchPitIndexRows = async (): Promise<SupabaseRow[]> => {
        if (isGlobalScope) {
          const globalResult = profileTeamNumbers.length > 0
            ? await fetchByTeamChunks('pit_scouts', 'team_number, data, updated_at', profileTeamNumbers)
            : await supabase.from('pit_scouts').select('team_number, data, updated_at');

          if (globalResult.error) {
            return [];
          }

          return (globalResult.data || []) as SupabaseRow[];
        }

        if (!activeEventKey) {
          return [];
        }

        const eventScoped = await supabase
          .from('pit_scouts')
          .select('team_number, event_key, updated_at')
          .eq('event_key', activeEventKey);

        if (!eventScoped.error) {
          return ((eventScoped.data || []) as SupabaseRow[]);
        }

        if (!isMissingEventKeyError(eventScoped.error)) {
          return [];
        }

        const fallback = await supabase.from('pit_scouts').select('team_number, data, updated_at');
        if (fallback.error) {
          return [];
        }

        return ((fallback.data || []) as SupabaseRow[]).filter((row) => {
          return getPayloadEventKey(normalizePayload(row.data)) === activeEventKey;
        });
      };

      const fetchMatchIndexRows = async (): Promise<SupabaseRow[]> => {
        if (isGlobalScope) {
          const globalResult = profileTeamNumbers.length > 0
            ? await fetchByTeamChunks('match_scouts', 'match_number, team_number, updated_at', profileTeamNumbers)
            : await supabase.from('match_scouts').select('match_number, team_number, updated_at');

          if (globalResult.error) {
            return [];
          }

          return (globalResult.data || []) as SupabaseRow[];
        }

        if (!activeEventKey) {
          return [];
        }

        const eventScoped = await supabase
          .from('match_scouts')
          .select('match_number, team_number, event_key, updated_at')
          .eq('event_key', activeEventKey);

        if (!eventScoped.error) {
          return ((eventScoped.data || []) as SupabaseRow[]);
        }

        if (!isMissingEventKeyError(eventScoped.error)) {
          return [];
        }

        const fallback = await supabase.from('match_scouts').select('match_number, team_number, data, updated_at');
        if (fallback.error) {
          return [];
        }

        return ((fallback.data || []) as SupabaseRow[]).filter((row) => {
          return getPayloadEventKey(normalizePayload(row.data)) === activeEventKey;
        });
      };

      const fetchSelectedPitRows = async (): Promise<SupabaseRow[]> => {
        if (!selectedTeam) {
          return [];
        }

        if (isGlobalScope) {
          if (profileTeamNumbers.length > 0 && !profileTeamNumbers.includes(selectedTeam)) {
            return [];
          }

          const selectedResult = await supabase
            .from('pit_scouts')
            .select('team_number, data, updated_at')
            .eq('team_number', selectedTeam);

          return selectedResult.error ? [] : ((selectedResult.data || []) as SupabaseRow[]);
        }

        if (!activeEventKey) {
          return [];
        }

        const eventScoped = await supabase
          .from('pit_scouts')
          .select('team_number, event_key, data, updated_at')
          .eq('team_number', selectedTeam)
          .eq('event_key', activeEventKey);

        if (!eventScoped.error) {
          return ((eventScoped.data || []) as SupabaseRow[]);
        }

        if (!isMissingEventKeyError(eventScoped.error)) {
          return [];
        }

        const fallback = await supabase
          .from('pit_scouts')
          .select('team_number, data, updated_at')
          .eq('team_number', selectedTeam);

        if (fallback.error) {
          return [];
        }

        return ((fallback.data || []) as SupabaseRow[]).filter((row) => {
          return getPayloadEventKey(normalizePayload(row.data)) === activeEventKey;
        });
      };

      const fetchSelectedMatchRows = async (): Promise<SupabaseRow[]> => {
        if (!selectedTeam) {
          return [];
        }

        if (isGlobalScope) {
          if (profileTeamNumbers.length > 0 && !profileTeamNumbers.includes(selectedTeam)) {
            return [];
          }

          const selectedResult = await supabase
            .from('match_scouts')
            .select('match_number, team_number, data, updated_at')
            .eq('team_number', selectedTeam);

          return selectedResult.error ? [] : ((selectedResult.data || []) as SupabaseRow[]);
        }

        if (!activeEventKey) {
          return [];
        }

        const eventScoped = await supabase
          .from('match_scouts')
          .select('match_number, team_number, event_key, data, updated_at')
          .eq('team_number', selectedTeam)
          .eq('event_key', activeEventKey);

        if (!eventScoped.error) {
          return ((eventScoped.data || []) as SupabaseRow[]);
        }

        if (!isMissingEventKeyError(eventScoped.error)) {
          return [];
        }

        const fallback = await supabase
          .from('match_scouts')
          .select('match_number, team_number, data, updated_at')
          .eq('team_number', selectedTeam);

        if (fallback.error) {
          return [];
        }

        return ((fallback.data || []) as SupabaseRow[]).filter((row) => {
          return getPayloadEventKey(normalizePayload(row.data)) === activeEventKey;
        });
      };

      const [pitIndexRows, matchIndexRows, remoteSelectedPitRows, remoteSelectedMatchRows] = await Promise.all([
        fetchPitIndexRows(),
        fetchMatchIndexRows(),
        fetchSelectedPitRows(),
        fetchSelectedMatchRows(),
      ]);

      const remoteIndexes: RawIndexEntry[] = [];

      pitIndexRows.forEach((row) => {
          const teamNumber = row.team_number ?? 'Unknown';
          const eventKey =
            (row.event_key || '').toString().trim().toLowerCase() ||
            getPayloadEventKey(normalizePayload(row.data)) ||
            'unknown';
          remoteIndexes.push({
            key: `pit:${eventKey}:${teamNumber}`,
            type: 'pit',
            updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
          });
      });

      matchIndexRows.forEach((row) => {
          const matchNumber = row.match_number ?? 'Unknown';
          const teamNumber = row.team_number ?? 'Unknown';
          remoteIndexes.push({
            key: `match:${matchNumber}:${teamNumber}`,
            type: 'match',
            updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
          });
      });

      const remoteSelectedEntries: RawEntry[] = [];

      remoteSelectedPitRows.forEach((row) => {
          const payload = normalizePayload(row.data) as any;
          const payloadEventKey =
            (row.event_key || '').toString().trim().toLowerCase() || getPayloadEventKey(payload) || '';
          const payloadWithContext = {
            ...payload,
            eventKey: payloadEventKey,
          };
          const teamNumber = row.team_number ?? payload?.teamNumber ?? 'Unknown';
          remoteSelectedEntries.push({
            key: `pit:${payloadEventKey || 'unknown'}:${teamNumber}`,
            type: 'pit',
            teamNumber,
            updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
            source: 'remote',
            payload: payloadWithContext,
          });
      });

      remoteSelectedMatchRows.forEach((row) => {
          const payload = normalizePayload(row.data) as any;
          const payloadWithContext = {
            ...payload,
            eventKey: (row.event_key || '').toString().trim().toLowerCase() || getPayloadEventKey(payload),
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
