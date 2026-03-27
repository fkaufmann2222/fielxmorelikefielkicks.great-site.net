import React from 'react';
import { EventTeam } from '../types';

type TeamListPanelProps = {
  search: string;
  setSearch: (value: string) => void;
  isLoadingTeams: boolean;
  teamsError: string | null;
  filteredTeams: EventTeam[];
  selectedTeam: number | null;
  setSelectedTeam: (teamNumber: number) => void;
};

export function TeamListPanel({
  search,
  setSearch,
  isLoadingTeams,
  teamsError,
  filteredTeams,
  selectedTeam,
  setSelectedTeam,
}: TeamListPanelProps) {
  return (
    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 shadow-xl lg:col-span-1">
      <label className="block text-sm font-medium text-slate-300 mb-2">Search Team</label>
      <input
        type="text"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Team # or nickname"
      />

      <div className="mt-4 max-h-[520px] overflow-auto space-y-2 pr-1">
        {isLoadingTeams && <div className="text-sm text-slate-400">Loading event teams...</div>}
        {!isLoadingTeams && teamsError && <div className="text-sm text-rose-300">{teamsError}</div>}
        {!isLoadingTeams && !teamsError && filteredTeams.length === 0 && (
          <div className="text-sm text-slate-400">No teams match your search.</div>
        )}

        {filteredTeams.map((team) => {
          const isActive = team.teamNumber === selectedTeam;
          return (
            <button
              key={team.teamNumber}
              onClick={() => setSelectedTeam(team.teamNumber)}
              className={`w-full text-left p-3 rounded-xl border transition-colors ${
                isActive
                  ? 'bg-blue-600/20 border-blue-500 text-blue-100'
                  : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <div className="font-mono font-semibold">Team {team.teamNumber}</div>
              <div className="text-xs text-slate-400 truncate mt-1">{team.nickname}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
