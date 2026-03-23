import React, { useState, useEffect } from 'react';
import { CompetitionProfile } from '../types';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProfile: CompetitionProfile | null;
}

export function SettingsModal({ isOpen, onClose, activeProfile }: SettingsModalProps) {
  const [activeEventKey, setActiveEventKey] = useState('');

  useEffect(() => {
    if (isOpen) {
      setActiveEventKey(activeProfile?.eventKey || 'No active profile');
    }
  }, [activeProfile?.eventKey, isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white">Settings</h2>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">Active Competition Event Key</label>
                <input
                  type="text"
                  value={activeEventKey}
                  readOnly
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none transition-all font-mono text-sm uppercase"
                />
              </div>

              {activeProfile && (
                <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-300 space-y-1">
                  <p className="text-white font-semibold">{activeProfile.name}</p>
                  <p>{activeProfile.location}</p>
                  <p>{activeProfile.teamCount} teams cached</p>
                </div>
              )}

              <p className="text-xs text-slate-400">
                Competition profiles are managed on the Home page. Supabase, TBA, and Gemini keys are loaded from Vercel environment variables.
              </p>
            </div>
            
            <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-500/20"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
