import React, { useMemo } from 'react';
import { EventTeam, RawEntry } from '../types';

type EntryCountsPanelProps = {
  eventTeams: EventTeam[];
  entries: RawEntry[];
};

export function EntryCountsPanel({ eventTeams, entries }: EntryCountsPanelProps) {
  const rows = useMemo(() => {
    const counts = new Map<number, number>();
    entries.forEach((entry) => {
      const teamNumber = Number(entry.teamNumber);
      if (Number.isFinite(teamNumber)) counts.set(teamNumber, (counts.get(teamNumber) || 0) + 1);
    });

    return eventTeams
      .map((team) => ({ teamNumber: team.teamNumber, count: counts.get(team.teamNumber) || 0 }))
      .sort((a, b) => b.count - a.count || a.teamNumber - b.teamNumber);
  }, [entries, eventTeams]);

  const maxCount = Math.max(1, ...rows.map((row) => row.count));

  return (
    <section className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-white">Scouting Entries by Team</h3>
        <p className="text-sm text-slate-400 mt-1">A complete view of scouting coverage for every team in this event.</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-slate-400">No teams are available for this event yet.</p>
      ) : (
        <div className="flex flex-col gap-3" role="list" aria-label="Scouting entries by team">
          {rows.map((row) => (
            <div key={row.teamNumber} role="listitem" className="grid grid-cols-[5rem_1fr_3rem] items-center gap-3">
              <span className="text-sm font-medium text-slate-200">Team {row.teamNumber}</span>
              <div className="h-7 rounded-md bg-slate-900/80 overflow-hidden" aria-label={`${row.count} entries`}>
                <div
                  className="h-full rounded-md bg-blue-500/80 transition-[width] duration-300"
                  style={{ width: `${(row.count / maxCount) * 100}%`, minWidth: row.count > 0 ? '0.5rem' : 0 }}
                />
              </div>
              <span className="text-right text-sm tabular-nums text-slate-300">{row.count}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
