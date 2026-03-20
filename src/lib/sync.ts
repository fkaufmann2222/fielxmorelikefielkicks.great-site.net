import { storage } from './storage';
import { SyncRecord } from '../types';

export type SyncStatus = 'success' | 'pending' | 'error';

let syncInterval: NodeJS.Timeout | null = null;
let lastSyncTime: number | null = null;
let currentStatus: SyncStatus = 'success';
let listeners: ((status: SyncStatus, lastSync: number | null, pendingCount: number) => void)[] = [];

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

  getBackendUrl() {
    return storage.get<string>('backendUrl') || window.location.origin;
  },

  async initialSync() {
    try {
      const response = await fetch(`${this.getBackendUrl()}/api/data`);
      if (response.ok) {
        const data = await response.json();
        
        // Merge pit scouts
        data.pitScouts.forEach((serverRecord: SyncRecord<any>) => {
          const key = `pitScout:${serverRecord.data.teamNumber}`;
          const localRecord = storage.get<SyncRecord<any>>(key);
          if (!localRecord || serverRecord.timestamp > localRecord.timestamp) {
            storage.set(key, serverRecord);
          }
        });

        // Merge match scouts
        data.matchScouts.forEach((serverRecord: SyncRecord<any>) => {
          const key = `matchScout:${serverRecord.data.matchNumber}:${serverRecord.data.teamNumber}`;
          const localRecord = storage.get<SyncRecord<any>>(key);
          if (!localRecord || serverRecord.timestamp > localRecord.timestamp) {
            storage.set(key, serverRecord);
          }
        });

        lastSyncTime = Date.now();
        currentStatus = storage.getSyncQueue().length > 0 ? 'pending' : 'success';
      }
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.getBackendUrl()}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queue),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          storage.removeFromSyncQueue(queue.map(r => r.id));
          lastSyncTime = Date.now();
          currentStatus = 'success';
          
          // Dispatch a custom event for toast notification
          window.dispatchEvent(new CustomEvent('sync-success'));
        } else {
          currentStatus = 'error';
        }
      } else {
        currentStatus = 'error';
      }
    } catch (error) {
      console.error('Sync failed:', error);
      currentStatus = 'error';
    }
    
    this.notify();
  }
};
