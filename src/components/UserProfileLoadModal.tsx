import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

type UserProfile = {
  id: string;
  name: string;
  authType: 'password' | 'faceid';
};

type CreatePayload = {
  pin: string;
  name: string;
};

interface UserProfileLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: UserProfile[];
  isBusy?: boolean;
  onCreatePasswordProfile: (payload: CreatePayload & { password: string }) => void;
  onCreateFaceIdProfile: (payload: CreatePayload & { faceIdName: string }) => void;
  onLoadProfile: (payload: { profileId: string; password?: string }) => void;
}

type Mode = 'choose' | 'create' | 'load';

export function UserProfileLoadModal({
  isOpen,
  onClose,
  profiles,
  isBusy,
  onCreatePasswordProfile,
  onCreateFaceIdProfile,
  onLoadProfile,
}: UserProfileLoadModalProps) {
  const [mode, setMode] = useState<Mode>('choose');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [authType, setAuthType] = useState<'password' | 'faceid'>('password');
  const [password, setPassword] = useState('');
  const [faceIdName, setFaceIdName] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [loadPassword, setLoadPassword] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setMode('choose');
    setPin('');
    setName('');
    setAuthType('password');
    setPassword('');
    setFaceIdName('');
    setSelectedProfileId(profiles[0]?.id || '');
    setLoadPassword('');
  }, [isOpen, profiles]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) || null,
    [profiles, selectedProfileId]
  );

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
              <h2 className="text-xl font-bold text-white">Load Profile</h2>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {mode === 'choose' && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300">Choose what you want to do.</p>
                  <button
                    onClick={() => setMode('create')}
                    disabled={Boolean(isBusy)}
                    className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    New Profile
                  </button>
                  <button
                    onClick={() => setMode('load')}
                    disabled={Boolean(isBusy)}
                    className="w-full px-4 py-2.5 border border-slate-600 hover:border-slate-400 text-slate-100 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Load Existing Profile
                  </button>
                </div>
              )}

              {mode === 'create' && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-slate-300">
                    Admin PIN
                    <input
                      type="password"
                      value={pin}
                      onChange={(event) => setPin(event.target.value)}
                      className="mt-1 w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-300">
                    Profile Name
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="mt-1 w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-300">
                    Auth Type
                    <select
                      value={authType}
                      onChange={(event) => setAuthType(event.target.value as 'password' | 'faceid')}
                      className="mt-1 w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none"
                    >
                      <option value="password">Password</option>
                      <option value="faceid">Face ID</option>
                    </select>
                  </label>
                  {authType === 'password' ? (
                    <label className="block text-sm font-medium text-slate-300">
                      Password
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="mt-1 w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none"
                      />
                    </label>
                  ) : (
                    <label className="block text-sm font-medium text-slate-300">
                      Linked Face ID Name
                      <input
                        type="text"
                        value={faceIdName}
                        onChange={(event) => setFaceIdName(event.target.value)}
                        placeholder={name || 'Face ID name'}
                        className="mt-1 w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none"
                      />
                    </label>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMode('choose')}
                      className="px-4 py-2.5 border border-slate-600 hover:border-slate-400 text-slate-100 rounded-xl transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        if (authType === 'password') {
                          onCreatePasswordProfile({ pin, name, password });
                        } else {
                          onCreateFaceIdProfile({ pin, name, faceIdName: faceIdName || name });
                        }
                      }}
                      disabled={Boolean(isBusy)}
                      className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Create Profile
                    </button>
                  </div>
                </div>
              )}

              {mode === 'load' && (
                <div className="space-y-3">
                  {profiles.length === 0 ? (
                    <p className="text-sm text-slate-400">No profiles available to load.</p>
                  ) : (
                    <>
                      <label className="block text-sm font-medium text-slate-300">
                        Select Profile
                        <select
                          value={selectedProfileId}
                          onChange={(event) => setSelectedProfileId(event.target.value)}
                          className="mt-1 w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none"
                        >
                          {profiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {profile.name} ({profile.authType})
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedProfile?.authType === 'password' && (
                        <label className="block text-sm font-medium text-slate-300">
                          Password
                          <input
                            type="password"
                            value={loadPassword}
                            onChange={(event) => setLoadPassword(event.target.value)}
                            className="mt-1 w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none"
                          />
                        </label>
                      )}
                    </>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMode('choose')}
                      className="px-4 py-2.5 border border-slate-600 hover:border-slate-400 text-slate-100 rounded-xl transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        if (!selectedProfileId) {
                          return;
                        }
                        onLoadProfile({ profileId: selectedProfileId, password: loadPassword });
                      }}
                      disabled={Boolean(isBusy) || profiles.length === 0}
                      className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Load Profile
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
