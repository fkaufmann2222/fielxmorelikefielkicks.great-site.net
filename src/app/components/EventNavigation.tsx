import React from 'react';
import {
  Settings,
  ClipboardList,
  Target,
  Database,
  Clipboard,
  Shield,
  LayoutGrid,
  LogOut,
  DraftingCompass,
} from 'lucide-react';
import { SyncIndicator } from '../../components/SyncIndicator';
import { CompetitionProfile } from '../../types';
import { EventTab, Location, UserProfile } from '../types';

type EventNavigationProps = {
  location: Location;
  activeProfile: CompetitionProfile | null;
  activeTab: EventTab;
  isAdminSignedIn: boolean;
  signedInUserProfile: UserProfile | null;
  onSetActiveTab: (tab: EventTab) => void;
  onSignOut: () => void;
  onOpenSettings: () => void;
};

function TabButton(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  const { active, label, onClick, icon } = props;
  return (
    <button
      onClick={onClick}
      className={`p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
        active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
      }`}
    >
      {icon}
      <span className="hidden md:block">{label}</span>
    </button>
  );
}

export function EventNavigation(props: EventNavigationProps) {
  const {
    location,
    activeProfile,
    activeTab,
    isAdminSignedIn,
    signedInUserProfile,
    onSetActiveTab,
    onSignOut,
    onOpenSettings,
  } = props;

  return (
    <nav className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-inner shadow-white/20">
            <span className="text-white font-bold font-mono text-sm">26</span>
          </div>
          <span className="font-bold text-lg hidden sm:block tracking-tight text-white">REBUILT Scout</span>
        </div>

        {location === 'event' && activeProfile ? (
          <div className="flex items-center gap-1 sm:gap-2">
            {isAdminSignedIn && (
              <TabButton
                active={activeTab === 'pit'}
                label="Pit"
                onClick={() => onSetActiveTab('pit')}
                icon={<ClipboardList className="w-4 h-4" />}
              />
            )}
            <TabButton
              active={activeTab === 'match'}
              label="Match"
              onClick={() => onSetActiveTab('match')}
              icon={<Clipboard className="w-4 h-4" />}
            />
            <TabButton
              active={activeTab === 'strategy'}
              label="Strategy"
              onClick={() => onSetActiveTab('strategy')}
              icon={<Target className="w-4 h-4" />}
            />
            <TabButton
              active={activeTab === 'alliance'}
              label="Alliance"
              onClick={() => onSetActiveTab('alliance')}
              icon={<DraftingCompass className="w-4 h-4" />}
            />
            <TabButton
              active={activeTab === 'raw'}
              label="Raw"
              onClick={() => onSetActiveTab('raw')}
              icon={<Database className="w-4 h-4" />}
            />
            {isAdminSignedIn && (
              <TabButton
                active={activeTab === 'admin'}
                label="Admin"
                onClick={() => onSetActiveTab('admin')}
                icon={<Shield className="w-4 h-4" />}
              />
            )}
            {isAdminSignedIn && (
              <TabButton
                active={activeTab === 'coverage'}
                label="Coverage"
                onClick={() => onSetActiveTab('coverage')}
                icon={<LayoutGrid className="w-4 h-4" />}
              />
            )}
          </div>
        ) : (
          <div className="hidden sm:flex items-center text-sm text-slate-400">
            <span>Create or select an event folder to start scouting.</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          {activeProfile && (
            <div className="hidden lg:flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs">
              <span className="text-slate-400">Selected:</span>
              <span className="text-white font-mono uppercase">{activeProfile.eventKey}</span>
            </div>
          )}
          {signedInUserProfile && (
            <button
              onClick={onSignOut}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs border border-slate-700 text-slate-200 rounded-lg hover:border-slate-500"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          )}
          <SyncIndicator />
          {isAdminSignedIn && (
            <button
              onClick={onOpenSettings}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
