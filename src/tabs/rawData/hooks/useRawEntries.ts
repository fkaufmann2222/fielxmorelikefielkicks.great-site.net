import { useEffect, useRef, useState } from 'react';
import { getProfileTeams } from '../../../lib/competitionProfiles';
import { storage } from '../../../lib/storage';
import { supabase } from '../../../lib/supabase';
import { SyncRecord } from '../../../types';
import { DATA_REFRESH_DEBOUNCE_MS } from '../constants';
import { RawEntry, SupabaseRow } from '../types';
import { getPayloadEventKey, normalizePayload } from '../utils';

type UseRawEntriesArgs = {
  activeEventKey: string;
  isGlobalScope: boolean;
  profileId: string | null;
};

export function useRawEntries({ activeEventKey, isGlobalScope, profileId }: UseRawEntriesArgs): RawEntry[] {
  const [entries, setEntries] = useState<RawEntry[]>([]);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        .map((record) => {
          const payloadEventKey = getPayloadEventKey(record!.data);
          if (!isGlobalScope && activeEventKey && payloadEventKey !== activeEventKey) {
            return null;
          }

          return {
            key: `match:${record!.data?.matchNumber}:${record!.data?.teamNumber}`,
            type: 'match' as const,
            teamNumber: record!.data?.teamNumber ?? 'Unknown',
            matchNumber: record!.data?.matchNumber ?? 'Unknown',
            updatedAt: record!.timestamp || 0,
            source: 'local' as const,
            payload: record!.data,
          };
        })
        .filter((entry) => entry !== null) as RawEntry[];

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

      const matchQuery = supabase.from('match_scouts').select('match_number, team_number, event_key, data, updated_at');
      const matchPromise = isGlobalScope
        ? profileTeamNumbers.length > 0
          ? matchQuery.in('team_number', profileTeamNumbers)
          : matchQuery
        : activeEventKey
          ? matchQuery.eq('event_key', activeEventKey)
          : Promise.resolve({ data: [], error: null });

      const [pitResult, matchResult] = await Promise.all([pitPromise, matchPromise]);

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
      clearRefreshTimer();
      window.removeEventListener('sync-success', scheduleRefresh);
      window.removeEventListener('team-import-success', scheduleRefresh);
      window.removeEventListener('storage', scheduleRefresh);
    };
  }, [activeEventKey, isGlobalScope, profileId]);

  return entries;
}
