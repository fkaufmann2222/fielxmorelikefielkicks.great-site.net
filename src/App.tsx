import React, { useState, useEffect } from 'react';
import { Home } from './tabs/Home';
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
import { Settings, ClipboardList, Activity, Users, Target, Database, Trophy } from 'lucide-react';

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
      case 'home':
        return (
          <Home
            profiles={profiles}
            activeProfile={activeProfile}
            isCreatingProfile={isCreatingProfile}
            onCreateProfile={handleCreateProfile}
            onSelectProfile={handleSelectProfile}
          />
        );
      case 'pit': return <PitScouting />;
      case 'match': return <MatchScouting />;
      case 'lookup': return <TeamLookup />;
      case 'strategy': return <AllianceStrategy eventKey={activeProfile?.eventKey || ''} />;
      case 'raw': return <RawData />;
      default: return <MatchScouting />;
    }
  };

  useEffect(() => {
    if (!activeProfile && activeTab !== 'home') {
      setActiveTab('home');
    }
  }, [activeProfile, activeTab]);

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
