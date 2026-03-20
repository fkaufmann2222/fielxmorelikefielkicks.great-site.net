import React, { useEffect, useState } from 'react';
import { syncManager, SyncStatus } from '../lib/sync';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { cn } from './Stepper';
import { showToast } from './Toast';

export function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus>('success');
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const unsubscribe = syncManager.subscribe((s, l, p) => {
      setStatus(s);
      setLastSync(l);
      setPendingCount(p);
    });

    const handleSuccess = () => showToast('Sync successful');
    window.addEventListener('sync-success', handleSuccess);

    return () => {
      unsubscribe();
      window.removeEventListener('sync-success', handleSuccess);
    };
  }, []);

  const getStatusColor = () => {
    if (status === 'error') return 'text-red-400 bg-red-400/10 border-red-400/20';
    if (status === 'pending') return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
  };

  const getIcon = () => {
    if (status === 'error') return <CloudOff className="w-4 h-4" />;
    if (status === 'pending') return <RefreshCw className="w-4 h-4 animate-spin" />;
    return <Cloud className="w-4 h-4" />;
  };

  return (
    <div className="relative group flex items-center">
      <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors", getStatusColor())}>
        {getIcon()}
        {pendingCount > 0 && <span>{pendingCount}</span>}
      </div>
      
      <div className="absolute right-0 top-full mt-2 w-48 p-3 bg-slate-800 border border-slate-700 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-xs text-slate-300">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Status:</span>
            <span className="font-medium capitalize">{status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Pending:</span>
            <span className="font-medium">{pendingCount} items</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Last Sync:</span>
            <span className="font-medium">
              {lastSync ? new Date(lastSync).toLocaleTimeString() : 'Never'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
