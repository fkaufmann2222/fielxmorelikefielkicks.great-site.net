import { storage } from './storage';
import { SyncRecord } from '../types';
import { supabase } from './supabase';
import { getActiveProfile } from './competitionProfiles';

export type SyncStatus = 'success' | 'pending' | 'error';

let syncInterval: ReturnType<typeof setInterval> | null = null;
let lastSyncTime: number | null = null;
let currentStatus: SyncStatus = 'success';
let listeners: ((status: SyncStatus, lastSync: number | null, pendingCount: number) => void)[] = [];

type SupabaseScoutRow = {
  id: string;
  data: unknown;
  updated_at: string;
  event_key?: string | null;
  profile_id?: string | null;
};

function normalizeJsonPayload(value: unknown): unknown {
  if (typeof value === 'string') {
    return JSON.parse(value);
  }
  return value;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export const syncManager = {
  start() {
    if (syncInterval) return;
    this.initialSync();
    syncInterval = setInterval(() => this.sync(), 15000);
  },

  stop() {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  },

  subscribe(listener: (status: SyncStatus, lastSync: number | null, pendingCount: number) => void) {
    listeners.push(listener);
    this.notify();
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  },

  notify() {
    const queue = storage.getSyncQueue();
    const pendingCount = queue.length;
    
    if (pendingCount > 0 && currentStatus === 'success') {
      currentStatus = 'pending';
    } else if (pendingCount === 0 && currentStatus === 'pending') {
      currentStatus = 'success';
    }

    listeners.forEach(l => l(currentStatus, lastSyncTime, pendingCount));
  },

  async initialSync() {
    try {
      const activeProfile = getActiveProfile();
      const activeEventKey = activeProfile?.eventKey?.trim().toLowerCase() || '';

      const pitPromise = activeEventKey
        ? supabase.from('pit_scouts').select('id, event_key, profile_id, data, updated_at').eq('event_key', activeEventKey)
        : Promise.resolve({ data: [], error: null });

      const [pitResult, matchResult] = await Promise.all([
        pitPromise,
        supabase.from('match_scouts').select('id, data, updated_at'),
      ]);

      if (pitResult.error) {
        throw pitResult.error;
      }

      if (matchResult.error) {
        throw matchResult.error;
      }

      (pitResult.data || []).forEach((row: SupabaseScoutRow) => {
        const payload = normalizeJsonPayload(row.data) as any;
        const teamNumber = toNullableNumber(payload?.teamNumber);
        const eventKey = (row.event_key || payload?.eventKey || '').toString().trim().toLowerCase();
        const profileId = (row.profile_id || payload?.profileId || activeProfile?.id || '').toString().trim();

        if (!teamNumber || !eventKey || !profileId) {
          return;
        }

        const record = {
          id: row.id,
          type: 'pitScout',
          timestamp: new Date(row.updated_at).getTime(),
          data: {
            ...payload,
            teamNumber,
            eventKey,
            profileId,
          },
        } as SyncRecord<any>;

        const key = `pitScout:${record.data.profileId}:${record.data.teamNumber}`;
        const localRecord = storage.get<SyncRecord<any>>(key);
        if (!localRecord || record.timestamp > localRecord.timestamp) {
          storage.set(key, record);
        }
      });

      (matchResult.data || []).forEach((row: SupabaseScoutRow) => {
        const record = {
          id: row.id,
          type: 'matchScout',
          timestamp: new Date(row.updated_at).getTime(),
          data: normalizeJsonPayload(row.data),
        } as SyncRecord<any>;

        const key = `matchScout:${record.data.matchNumber}:${record.data.teamNumber}`;
        const localRecord = storage.get<SyncRecord<any>>(key);
        if (!localRecord || record.timestamp > localRecord.timestamp) {
          storage.set(key, record);
        }
      });

      lastSyncTime = Date.now();
      currentStatus = storage.getSyncQueue().length > 0 ? 'pending' : 'success';
    } catch (error) {
      console.error('Initial sync failed:', error);
      currentStatus = 'error';
    }
    this.notify();
  },

  async sync() {
    const queue = storage.getSyncQueue();
    if (queue.length === 0) {
      this.notify();
      return;
    }

    try {
      const legacyPitIds = queue
        .filter((record) => {
          if (record.type !== 'pitScout') {
            return false;
          }

          const payload = (record.data || {}) as any;
          const eventKey = typeof payload.eventKey === 'string' ? payload.eventKey.trim() : '';
          const profileId = typeof payload.profileId === 'string' ? payload.profileId.trim() : '';
          const teamNumber = toNullableNumber(payload.teamNumber);

          return !eventKey || !profileId || teamNumber === null;
        })
        .map((record) => record.id);

      if (legacyPitIds.length > 0) {
        storage.removeFromSyncQueue(legacyPitIds);
      }

      const matchKeys = storage.getAllKeys().filter((key) => key.startsWith('matchScout:'));
      const localMatchIds = new Set(
        matchKeys
          .map((key) => storage.get<SyncRecord<any>>(key)?.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      );

      const orphanedMatchIds = storage
        .getSyncQueue()
        .filter((record) => record.type === 'matchScout' && !localMatchIds.has(record.id))
        .map((record) => record.id);

      if (orphanedMatchIds.length > 0) {
        storage.removeFromSyncQueue(orphanedMatchIds);
      }

      const activeQueue = storage.getSyncQueue();

      const pitRows = activeQueue
        .filter(record => record.type === 'pitScout')
        .map(record => {
          const payload = (record.data || {}) as any;
          const eventKey = typeof payload.eventKey === 'string' ? payload.eventKey.trim().toLowerCase() : '';
          const profileId = typeof payload.profileId === 'string' ? payload.profileId.trim() : '';
          const teamNumber = toNullableNumber(payload.teamNumber);

          if (!eventKey || !profileId || teamNumber === null) {
            return null;
          }

          return {
            id: record.id,
            event_key: eventKey,
            profile_id: profileId,
            team_number: teamNumber,
            data: payload,
            updated_at: new Date(record.timestamp).toISOString(),
          };
        })
        .filter((row): row is {
          id: string;
          event_key: string;
          profile_id: string;
          team_number: number;
          data: unknown;
          updated_at: string;
        } => row !== null);

      const matchRows = activeQueue
        .filter(record => record.type === 'matchScout')
        .map(record => ({
          id: record.id,
          match_number: toNullableNumber((record.data as any)?.matchNumber),
          team_number: toNullableNumber((record.data as any)?.teamNumber),
          alliance: (record.data as any)?.allianceColor || null,
          data: record.data,
          updated_at: new Date(record.timestamp).toISOString(),
        }));

      const [pitResult, matchResult] = await Promise.all([
        pitRows.length > 0 ? supabase.from('pit_scouts').upsert(pitRows, { onConflict: 'event_key,team_number' }) : Promise.resolve({ error: null }),
        matchRows.length > 0 ? supabase.from('match_scouts').upsert(matchRows, { onConflict: 'id' }) : Promise.resolve({ error: null }),
      ]);

      if (pitResult.error || matchResult.error) {
        currentStatus = 'error';
      } else {
        storage.removeFromSyncQueue(activeQueue.map(r => r.id));
        lastSyncTime = Date.now();
        currentStatus = 'success';
        window.dispatchEvent(new CustomEvent('sync-success'));
      }
    } catch (error) {
      console.error('Sync failed:', error);
      currentStatus = 'error';
    }
    
    this.notify();
  }
};
