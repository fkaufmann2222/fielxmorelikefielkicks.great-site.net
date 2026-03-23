import React, { useState, useEffect } from 'react';
import { PitScouting } from './tabs/PitScouting';
import { MatchScouting } from './tabs/MatchScouting';
import { TeamLookup } from './tabs/TeamLookup';
import { AllianceStrategy } from './tabs/AllianceStrategy';
import { RawData } from './tabs/RawData';
import { SyncIndicator } from './components/SyncIndicator';
import { SettingsModal } from './components/SettingsModal';
import { ToastProvider, showToast } from './components/Toast';
import { syncManager } from './lib/sync';
import {
  getProfiles,
  getActiveProfile,
  createProfile,
  setActiveProfileId
} from './lib/competitionProfiles';
import { tba } from './lib/tba';
import { CompetitionProfile, TBAEvent } from './types';
import { Settings, ClipboardList, Activity, Users, Target, Database, Plus, Trophy } from 'lucide-react';

type Tab = 'home' | 'pit' | 'match' | 'lookup' | 'strategy' | 'raw';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [profiles, setProfiles] = useState<CompetitionProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<CompetitionProfile | null>(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);

  useEffect(() => {
    syncManager.start();
    return () => syncManager.stop();
  }, []);

  useEffect(() => {
    setProfiles(getProfiles());
    setActiveProfile(getActiveProfile());
  }, []);

  const refreshProfiles = () => {
    setProfiles(getProfiles());
    setActiveProfile(getActiveProfile());
  };

  const handleSelectProfile = (profileId: string) => {
    setActiveProfileId(profileId);
    refreshProfiles();
    setActiveTab('match');
  };

  const handleCreateProfile = async () => {
    const rawEventKey = window.prompt('Enter TBA event key (example: 2026paphi):', '') || '';
    const eventKey = rawEventKey.trim().toLowerCase();

    if (!eventKey) {
      return;
    }

    setIsCreatingProfile(true);
    try {
      const [teams, eventInfo] = await Promise.all([
        tba.fetchTeams(eventKey),
        tba.fetchEvent(eventKey).catch(() => null as TBAEvent | null),
      ]);

      createProfile({ eventKey, eventInfo, teams });
      refreshProfiles();
      setActiveTab('match');
      showToast(`Saved profile for ${eventInfo?.name || eventKey.toUpperCase()}`);
    } catch (error) {
      showToast('Failed to create profile. Check event key and try again.');
    } finally {
      setIsCreatingProfile(false);
    }
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'home': return renderHome();
      case 'pit': return <PitScouting />;
      case 'match': return <MatchScouting />;
      case 'lookup': return <TeamLookup />;
      case 'strategy': return <AllianceStrategy />;
      case 'raw': return <RawData />;
      default: return <MatchScouting />;
    }
  };

  useEffect(() => {
    if (!activeProfile && activeTab !== 'home') {
      setActiveTab('home');
    }
  }, [activeProfile, activeTab]);

  const renderHome = () => (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="rounded-3xl border border-slate-700 bg-slate-800/40 p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sky-300 text-sm tracking-wide uppercase font-semibold">Competition Profiles</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Select Competition</h1>
            <p className="text-slate-300 mt-2 max-w-2xl">
              Start by creating or selecting a competition profile. Tabs stay locked until an active profile is set.
            </p>
          </div>
          <button
            onClick={handleCreateProfile}
            disabled={isCreatingProfile}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4" />
            {isCreatingProfile ? 'Creating...' : 'Add Profile'}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        {profiles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/30 p-10 text-center text-slate-300">
            No saved competition profiles yet. Press <span className="font-semibold text-white">Add Profile</span> to create one.
          </div>
        ) : (
          <div className="grid gap-3">
            {profiles.map((profile) => {
              const isActive = activeProfile?.id === profile.id;
              return (
                <button
                  key={profile.id}
                  onClick={() => handleSelectProfile(profile.id)}
                  className={`w-full text-left rounded-2xl border p-4 sm:p-5 transition-colors ${
                    isActive
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-slate-700 bg-slate-800/30 hover:bg-slate-800/60 hover:border-slate-500'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-xl p-2 ${isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-white font-bold">{profile.name}</p>
                        <p className="text-slate-300 text-sm font-mono uppercase">{profile.eventKey}</p>
                      </div>
                    </div>
                    {isActive && (
                      <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Active</span>
                    )}
                  </div>
                  <div className="mt-3 text-sm text-slate-300 flex flex-wrap gap-x-4 gap-y-1">
                    <span>{profile.location}</span>
                    <span>{profile.teamCount} teams</span>
                    <span>{profile.year || 'Unknown year'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-blue-500/30">
      <nav className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-inner shadow-white/20">
              <span className="text-white font-bold font-mono text-sm">26</span>
            </div>
            <span className="font-bold text-lg hidden sm:block tracking-tight text-white">REBUILT Scout</span>
          </div>

          {activeProfile ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => setActiveTab('home')}
                className={`p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'home' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Trophy className="w-4 h-4" />
                <span className="hidden md:block">Home</span>
              </button>
              <button
                onClick={() => setActiveTab('pit')}
                className={`p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'pit' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                <span className="hidden md:block">Pit</span>
              </button>
              <button
                onClick={() => setActiveTab('match')}
                className={`p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'match' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span className="hidden md:block">Match</span>
              </button>
              <button
                onClick={() => setActiveTab('lookup')}
                className={`p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'lookup' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span className="hidden md:block">Teams</span>
              </button>
              <button
                onClick={() => setActiveTab('strategy')}
                className={`p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'strategy' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Target className="w-4 h-4" />
                <span className="hidden md:block">Strategy</span>
              </button>
              <button
                onClick={() => setActiveTab('raw')}
                className={`p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'raw' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Database className="w-4 h-4" />
                <span className="hidden md:block">Raw</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => setActiveTab('home')}
                className={`p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === 'home' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Trophy className="w-4 h-4" />
                <span className="hidden md:block">Home</span>
              </button>
              <div className="hidden sm:flex items-center text-sm text-slate-400 ml-2">
                Select a competition profile to unlock tabs
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            {activeProfile && (
              <div className="hidden lg:flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs">
                <span className="text-slate-400">Active:</span>
                <span className="text-white font-mono uppercase">{activeProfile.eventKey}</span>
              </div>
            )}
            <SyncIndicator />
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="p-4 sm:p-6 lg:p-8">
        {renderTab()}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        activeProfile={activeProfile}
      />
      <ToastProvider />
    </div>
  );
}
