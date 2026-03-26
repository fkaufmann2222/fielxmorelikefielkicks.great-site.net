import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listMatchCoverageRowsForEvent } from '../lib/supabase';
import { tba } from '../lib/tba';
import { TBAMatch, TBATeam } from '../types';

type Props = {
  eventKey: string;
};

type CoverageRow = {
  matchNumber: number;
  teamNumber: number;
  matchKey?: string;
};

type TeamRow = {
  teamNumber: number;
  nickname: string;
};

type MatchColumn = {
  key: string;
  label: string;
  teamNumbers: Set<number>;
};

function toTeamNumber(teamKey: string): number {
  return Number(teamKey.replace('frc', ''));
}

function compLevelSortOrder(compLevel: string): number {
  switch (compLevel) {
    case 'qm':
      return 0;
    case 'ef':
      return 1;
    case 'qf':
      return 2;
    case 'sf':
      return 3;
    case 'f':
      return 4;
    default:
      return 5;
  }
}

function formatMatchLabel(match: TBAMatch): string {
  const compLabel = match.comp_level.toUpperCase();
  if (match.comp_level === 'qm') {
    return `QM ${match.match_number}`;
  }

  return `${compLabel} ${match.set_number}-${match.match_number}`;
}

function createCellKey(matchKey: string, teamNumber: number): string {
  return `${matchKey}|${teamNumber}`;
}

export function MatchScoutingCoverage({ eventKey }: Props) {
  const [matches, setMatches] = useState<TBAMatch[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [coverageRows, setCoverageRows] = useState<CoverageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSequence = useRef(0);

  const loadCoverage = useCallback(async () => {
    const normalizedEventKey = eventKey.trim().toLowerCase();
    const sequence = ++loadSequence.current;

    if (!normalizedEventKey) {
      setMatches([]);
      setTeams([]);
      setCoverageRows([]);
      setError('No active event selected.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [fetchedTeams, fetchedMatches, fetchedCoverageRows] = await Promise.all([
        tba.fetchTeams(normalizedEventKey),
        tba.fetchMatches(normalizedEventKey),
        listMatchCoverageRowsForEvent(normalizedEventKey),
      ]);

      if (loadSequence.current !== sequence) {
        return;
      }

      const sortedMatches = [...fetchedMatches]
        .filter((match: TBAMatch) => match.alliances?.red?.team_keys && match.alliances?.blue?.team_keys)
        .sort((a, b) => {
          const levelSort = compLevelSortOrder(a.comp_level) - compLevelSortOrder(b.comp_level);
          if (levelSort !== 0) {
            return levelSort;
          }
          if (a.set_number !== b.set_number) {
            return a.set_number - b.set_number;
          }
          return a.match_number - b.match_number;
        });

      const nicknameByTeamNumber = new Map<number, string>();
      fetchedTeams.forEach((team: TBATeam) => {
        nicknameByTeamNumber.set(team.team_number, team.nickname || team.name || 'Unknown');
      });

      const teamNumbersFromMatches = sortedMatches.flatMap((match) => [
        ...match.alliances.red.team_keys.map(toTeamNumber),
        ...match.alliances.blue.team_keys.map(toTeamNumber),
      ]);

      const teamNumbers = Array.from(
        new Set<number>([
          ...fetchedTeams.map((team) => team.team_number),
          ...teamNumbersFromMatches,
        ]),
      )
        .filter((teamNumber) => Number.isFinite(teamNumber))
        .sort((a, b) => a - b);

      const nextTeamRows: TeamRow[] = teamNumbers.map((teamNumber) => ({
        teamNumber,
        nickname: nicknameByTeamNumber.get(teamNumber) || 'Unknown',
      }));

      setMatches(sortedMatches);
      setTeams(nextTeamRows);
      setCoverageRows(fetchedCoverageRows);
    } catch (loadError) {
      if (loadSequence.current !== sequence) {
        return;
      }

      setMatches([]);
      setTeams([]);
      setCoverageRows([]);
      setError('Failed to load coverage data for this event.');
    } finally {
      if (loadSequence.current === sequence) {
        setIsLoading(false);
      }
    }
  }, [eventKey]);

  useEffect(() => {
    void loadCoverage();

    const refresh = () => {
      void loadCoverage();
    };

    window.addEventListener('sync-success', refresh);
    window.addEventListener('storage', refresh);

    return () => {
      window.removeEventListener('sync-success', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [loadCoverage]);

  const matchMetadata = useMemo(() => {
    const columns: MatchColumn[] = [];
    const teamsByMatchKey = new Map<string, Set<number>>();
    const matchesByNumber = new Map<number, TBAMatch[]>();
    const scheduledKeys = new Set<string>();
    const scheduledCountByTeam = new Map<number, number>();
    const scheduledCountByMatch = new Map<string, number>();

    matches.forEach((match) => {
      const teamNumbers = new Set<number>([
        ...match.alliances.red.team_keys.map(toTeamNumber),
        ...match.alliances.blue.team_keys.map(toTeamNumber),
      ]);

      columns.push({
        key: match.key,
        label: formatMatchLabel(match),
        teamNumbers,
      });

      teamsByMatchKey.set(match.key, teamNumbers);

      const byNumberList = matchesByNumber.get(match.match_number) || [];
      byNumberList.push(match);
      matchesByNumber.set(match.match_number, byNumberList);

      scheduledCountByMatch.set(match.key, teamNumbers.size);
      teamNumbers.forEach((teamNumber) => {
        scheduledKeys.add(createCellKey(match.key, teamNumber));
        scheduledCountByTeam.set(teamNumber, (scheduledCountByTeam.get(teamNumber) || 0) + 1);
      });
    });

    return {
      columns,
      teamsByMatchKey,
      matchesByNumber,
      scheduledKeys,
      scheduledCountByTeam,
      scheduledCountByMatch,
    };
  }, [matches]);

  const coverageMetadata = useMemo(() => {
    const coveredKeys = new Set<string>();
    const coveredCountByTeam = new Map<number, number>();
    const coveredCountByMatch = new Map<string, number>();

    coverageRows.forEach((row) => {
      const explicitMatchKey = row.matchKey?.trim();
      const explicitTeamSet = explicitMatchKey ? matchMetadata.teamsByMatchKey.get(explicitMatchKey) : undefined;

      let resolvedMatchKey = '';
      if (explicitMatchKey && explicitTeamSet?.has(row.teamNumber)) {
        resolvedMatchKey = explicitMatchKey;
      } else {
        const candidates = (matchMetadata.matchesByNumber.get(row.matchNumber) || []).filter((match) => {
          const teamsInMatch = matchMetadata.teamsByMatchKey.get(match.key);
          return Boolean(teamsInMatch?.has(row.teamNumber));
        });

        if (candidates.length === 1) {
          resolvedMatchKey = candidates[0].key;
        }
      }

      if (!resolvedMatchKey) {
        return;
      }

      const key = createCellKey(resolvedMatchKey, row.teamNumber);
      if (!matchMetadata.scheduledKeys.has(key) || coveredKeys.has(key)) {
        return;
      }

      coveredKeys.add(key);
      coveredCountByTeam.set(row.teamNumber, (coveredCountByTeam.get(row.teamNumber) || 0) + 1);
      coveredCountByMatch.set(resolvedMatchKey, (coveredCountByMatch.get(resolvedMatchKey) || 0) + 1);
    });

    return {
      coveredKeys,
      coveredCountByTeam,
      coveredCountByMatch,
    };
  }, [coverageRows, matchMetadata]);

  const overallScheduled = matchMetadata.scheduledKeys.size;
  const overallCovered = coverageMetadata.coveredKeys.size;
  const overallMissing = Math.max(overallScheduled - overallCovered, 0);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-slate-300">
          Loading match scouting coverage...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4">
        <div className="bg-rose-900/20 border border-rose-500/30 rounded-2xl p-6 text-rose-200">{error}</div>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-slate-300">
          No matches found for this event.
        </div>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-slate-300">
          No teams found for this event.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
        <h2 className="text-2xl font-bold text-white">Match Scouting Coverage</h2>
        <p className="mt-1 text-sm text-slate-300">
          Rows are teams, columns are all scheduled matches. Green cells are covered in Supabase, red cells are still missing.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Covered cells</p>
            <p className="text-xl font-semibold text-emerald-300">{overallCovered}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Missing cells</p>
            <p className="text-xl font-semibold text-rose-300">{overallMissing}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Coverage rate</p>
            <p className="text-xl font-semibold text-blue-200">
              {overallScheduled > 0 ? `${Math.round((overallCovered / overallScheduled) * 100)}%` : '0%'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="min-w-max border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-30 bg-slate-900 px-3 py-2 text-left font-semibold text-slate-200 border-b border-r border-slate-700 min-w-[230px]">
                  Team
                </th>
                {matchMetadata.columns.map((column) => {
                  const coveredCount = coverageMetadata.coveredCountByMatch.get(column.key) || 0;
                  const scheduledCount = matchMetadata.scheduledCountByMatch.get(column.key) || 0;
                  return (
                    <th
                      key={column.key}
                      className="sticky top-0 z-20 bg-slate-900 px-2 py-2 text-center font-semibold text-slate-200 border-b border-r border-slate-700 min-w-[78px]"
                    >
                      <div>{column.label}</div>
                      <div className="text-[10px] text-slate-400">{coveredCount}/{scheduledCount}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => {
                const scheduledCount = matchMetadata.scheduledCountByTeam.get(team.teamNumber) || 0;
                const coveredCount = coverageMetadata.coveredCountByTeam.get(team.teamNumber) || 0;

                return (
                  <tr key={team.teamNumber}>
                    <th className="sticky left-0 z-10 bg-slate-900/95 px-3 py-2 text-left border-b border-r border-slate-700">
                      <div className="font-semibold text-slate-100">{team.teamNumber}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[200px]">{team.nickname}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{coveredCount}/{scheduledCount}</div>
                    </th>
                    {matchMetadata.columns.map((column) => {
                      const scheduled = column.teamNumbers.has(team.teamNumber);
                      const covered = coverageMetadata.coveredKeys.has(createCellKey(column.key, team.teamNumber));

                      if (!scheduled) {
                        return (
                          <td
                            key={`${column.key}:${team.teamNumber}`}
                            className="h-9 border-b border-r border-slate-800 bg-slate-950/70 text-center text-slate-600"
                            title="Team not scheduled for this match"
                          >
                            -
                          </td>
                        );
                      }

                      return (
                        <td
                          key={`${column.key}:${team.teamNumber}`}
                          className={`h-9 border-b border-r border-slate-700 text-center font-semibold ${
                            covered ? 'bg-emerald-900/35 text-emerald-200' : 'bg-rose-900/30 text-rose-200'
                          }`}
                          title={covered ? 'Scouting entry exists' : 'Missing scouting entry'}
                        >
                          {covered ? '✓' : '•'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
