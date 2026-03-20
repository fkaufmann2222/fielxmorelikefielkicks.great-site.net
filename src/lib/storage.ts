import { v4 as uuidv4 } from 'uuid';
import { SyncRecord } from '../types';

const SYNC_QUEUE_KEY = 'syncQueue';

export function get<T>(key: string): T | null {
  const item = localStorage.getItem(key);
  return item ? JSON.parse(item) : null;
}

export function set<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getAllKeys(): string[] {
  return Object.keys(localStorage);
}

export function saveRecord<T>(type: 'pitScout' | 'matchScout', key: string, data: T): void {
  const existingRecord = get<SyncRecord<T>>(key);
  
  const record: SyncRecord<T> = {
    id: existingRecord?.id || uuidv4(),
    type,
    timestamp: Date.now(),
    data,
  };

  // Save locally
  set(key, record);

  // Add to sync queue
  const queue = get<SyncRecord<any>[]>(SYNC_QUEUE_KEY) || [];
  const existingIndex = queue.findIndex(r => r.id === record.id);
  if (existingIndex >= 0) {
    queue[existingIndex] = record;
  } else {
    queue.push(record);
  }
  
  set(SYNC_QUEUE_KEY, queue);
}

export function getSyncQueue(): SyncRecord<any>[] {
  return get<SyncRecord<any>[]>(SYNC_QUEUE_KEY) || [];
}

export function removeFromSyncQueue(ids: string[]): void {
  const queue = getSyncQueue();
  const newQueue = queue.filter(r => !ids.includes(r.id));
  set(SYNC_QUEUE_KEY, newQueue);
}

export function clearSyncQueue(): void {
  set(SYNC_QUEUE_KEY, []);
}

export const storage = {
  get,
  set,
  getAllKeys,
  saveRecord,
  getSyncQueue,
  removeFromSyncQueue,
  clearSyncQueue
};
