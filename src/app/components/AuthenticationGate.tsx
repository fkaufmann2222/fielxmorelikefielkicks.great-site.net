import React from 'react';
import { UserRole } from '../../types';
import { UserAuthType, UserProfile } from '../types';

type AuthenticationGateProps = {
  authMode: 'login' | 'signup';
  setAuthMode: React.Dispatch<React.SetStateAction<'login' | 'signup'>>;
  authRole: UserRole;
  setAuthRole: React.Dispatch<React.SetStateAction<UserRole>>;
  authName: string;
  setAuthName: React.Dispatch<React.SetStateAction<string>>;
  authPassword: string;
  setAuthPassword: React.Dispatch<React.SetStateAction<string>>;
  authPin: string;
  setAuthPin: React.Dispatch<React.SetStateAction<string>>;
  authSignupType: UserAuthType;
  setAuthSignupType: React.Dispatch<React.SetStateAction<UserAuthType>>;
  authFaceIdName: string;
  setAuthFaceIdName: React.Dispatch<React.SetStateAction<string>>;
  selectedLoginProfileId: string;
  setSelectedLoginProfileId: React.Dispatch<React.SetStateAction<string>>;
  loginProfiles: UserProfile[];
  selectedLoginProfile: UserProfile | null;
  isFaceIdBusy: boolean;
  onLoginSubmit: () => Promise<void>;
  onSignupSubmit: () => Promise<void>;
};

export function AuthenticationGate(props: AuthenticationGateProps) {
  const {
    authMode,
    setAuthMode,
    authRole,
    setAuthRole,
    authName,
    setAuthName,
    authPassword,
    setAuthPassword,
    authPin,
    setAuthPin,
    authSignupType,
    setAuthSignupType,
    authFaceIdName,
    setAuthFaceIdName,
    selectedLoginProfileId,
    setSelectedLoginProfileId,
    loginProfiles,
    selectedLoginProfile,
    isFaceIdBusy,
    onLoginSubmit,
    onSignupSubmit,
  } = props;

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-800/50 p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Sign in to Scout</h1>
          <p className="text-sm text-slate-300">
            Login is required. Scouts use name + password only. Admins can use password or Face ID.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-700 p-1 bg-slate-900/60">
          <button
            onClick={() => {
              setAuthMode('login');
              setAuthPassword('');
            }}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              authMode === 'login' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Login
          </button>
          <button
            onClick={() => {
              setAuthMode('signup');
              setAuthPassword('');
            }}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              authMode === 'signup' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Sign Up
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-700 p-1 bg-slate-900/60">
          <button
            onClick={() => {
              setAuthRole('scout');
              setAuthSignupType('password');
            }}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              authRole === 'scout' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Scout
          </button>
          <button
            onClick={() => setAuthRole('admin')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              authRole === 'admin' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            Admin
          </button>
        </div>

        {authMode === 'login' ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-300">
              Profile
              <select
                value={selectedLoginProfileId}
                onChange={(event) => setSelectedLoginProfileId(event.target.value)}
                className="mt-1 w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
              >
                <option value="">Select profile...</option>
                {loginProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} ({profile.authType})
                  </option>
                ))}
              </select>
            </label>

            {selectedLoginProfile?.authType === 'password' && (
              <label className="block text-sm font-medium text-slate-300">
                Password
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  className="mt-1 w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
                />
              </label>
            )}

            <button
              onClick={() => {
                void onLoginSubmit();
              }}
              disabled={isFaceIdBusy}
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {selectedLoginProfile?.authType === 'faceid' ? 'Login with Face ID' : 'Login'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-300">
              Name
              <input
                type="text"
                value={authName}
                onChange={(event) => setAuthName(event.target.value)}
                className="mt-1 w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
              />
            </label>

            {authRole === 'admin' && (
              <label className="block text-sm font-medium text-slate-300">
                Admin Invite PIN
                <input
                  type="password"
                  value={authPin}
                  onChange={(event) => setAuthPin(event.target.value)}
                  className="mt-1 w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
                />
              </label>
            )}

            {authRole === 'admin' && (
              <label className="block text-sm font-medium text-slate-300">
                Auth Type
                <select
                  value={authSignupType}
                  onChange={(event) => setAuthSignupType(event.target.value as UserAuthType)}
                  className="mt-1 w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
                >
                  <option value="password">Password</option>
                  <option value="faceid">Face ID</option>
                </select>
              </label>
            )}

            {(authRole === 'scout' || authSignupType === 'password') && (
              <label className="block text-sm font-medium text-slate-300">
                Password
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  className="mt-1 w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
                />
              </label>
            )}

            {authRole === 'admin' && authSignupType === 'faceid' && (
              <label className="block text-sm font-medium text-slate-300">
                Face ID Name
                <input
                  type="text"
                  value={authFaceIdName}
                  onChange={(event) => setAuthFaceIdName(event.target.value)}
                  placeholder={authName || 'Face ID profile name'}
                  className="mt-1 w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none"
                />
              </label>
            )}

            <button
              onClick={() => {
                void onSignupSubmit();
              }}
              disabled={isFaceIdBusy}
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {authRole === 'admin' ? 'Create Admin Account' : 'Create Scout Account'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
