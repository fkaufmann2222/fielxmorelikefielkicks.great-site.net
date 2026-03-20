import React, { useState, useEffect } from 'react';
import { storage } from '../lib/storage';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [tbaKey, setTbaKey] = useState(storage.get<string>('tbaApiKey') || 'o8PwvlOVbzVgr95eahTOhJwixVUKkmeSdtqVJ5Z9EaVnUigrM0qR32cad9D8Qlkf');
  const [geminiKey, setGeminiKey] = useState(storage.get<string>('geminiApiKey') || '');
  const [backendUrl, setBackendUrl] = useState(storage.get<string>('backendUrl') || window.location.origin);
  const [eventKey, setEventKey] = useState(storage.get<string>('eventKey') || '');

  useEffect(() => {
    if (isOpen) {
      setTbaKey(storage.get<string>('tbaApiKey') || 'o8PwvlOVbzVgr95eahTOhJwixVUKkmeSdtqVJ5Z9EaVnUigrM0qR32cad9D8Qlkf');
      setGeminiKey(storage.get<string>('geminiApiKey') || '');
      setBackendUrl(storage.get<string>('backendUrl') || window.location.origin);
      setEventKey(storage.get<string>('eventKey') || '');
    }
  }, [isOpen]);

  const handleSave = () => {
    storage.set('tbaApiKey', tbaKey);
    storage.set('geminiApiKey', geminiKey);
    storage.set('backendUrl', backendUrl);
    storage.set('eventKey', eventKey);
    onClose();
  };

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
                <label className="block text-sm font-medium text-slate-300">TBA API Key</label>
                <input
                  type="text"
                  value={tbaKey}
                  onChange={(e) => setTbaKey(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono text-sm"
                />
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">Gemini API Key</label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono text-sm"
                />
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">Backend URL</label>
                <input
                  type="url"
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  placeholder="https://your-backend.railway.app"
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono text-sm"
                />
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">Default Event Key</label>
                <input
                  type="text"
                  value={eventKey}
                  onChange={(e) => setEventKey(e.target.value)}
                  placeholder="2026paphi"
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono text-sm uppercase"
                />
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end">
              <button
                onClick={handleSave}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-500/20"
              >
                Save Changes
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
