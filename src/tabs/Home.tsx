import React from 'react';
import { CompetitionProfile } from '../types';
import { Plus, Trophy } from 'lucide-react';

type HomeProps = {
  profiles: CompetitionProfile[];
  activeProfile: CompetitionProfile | null;
  isCreatingProfile: boolean;
  onCreateProfile: () => void;
  onSelectProfile: (profileId: string) => void;
};

export function Home({
  profiles,
  activeProfile,
  isCreatingProfile,
  onCreateProfile,
  onSelectProfile,
}: HomeProps) {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="rounded-3xl border border-slate-700 bg-slate-800/40 p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sky-300 text-sm tracking-wide uppercase font-semibold">Competition Profiles</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Select Competition</h1>
            <p className="text-slate-300 mt-2 max-w-2xl">
              Start by creating or selecting a competition profile. Each event key opens its own scouting pages.
            </p>
          </div>
          <button
            onClick={onCreateProfile}
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
                  onClick={() => onSelectProfile(profile.id)}
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
}
