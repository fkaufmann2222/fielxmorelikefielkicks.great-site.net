import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { showToast } from '../components/Toast';
import { formatMatchLabel } from '../lib/matchUtils';
import { claimPrescoutingTeam, listActivePrescoutingTeamClaims, releasePrescoutingTeamClaim } from '../lib/supabase';
import { TBAMatch, PrescoutingTeamClaim } from '../types';
import { UserProfile } from '../app/types';
import { PRESCOUTING_SEASON_YEAR, PRESCOUTING_TEAMS, PRESCOUTING_TEAM_NUMBERS } from '../prescouting/constants';
import { getMatchEventKey, loadAllTeamMatchesForPrescouting, sortMatches } from '../prescouting/matchData';
import { PrescoutingQuickScoutTarget } from '../prescouting/quickScout';
import { isTeamMatchAlreadyScouted, loadPrescoutingScoutedIndex, PrescoutingScoutedIndex } from '../prescouting/scoutedEntries';

type MatchColumn = {
  key: string;
  eventKey: string;
  matchNumber: number;
  label: string;
  teamNumbers: Set<number>;
  match: TBAMatch;
};

const EMPTY_SCOUTED_INDEX: PrescoutingScoutedIndex = {
  byTeamAndMatchKey: new Set<string>(),
  byTeamAndEventMatch: new Set<string>(),
  entries: [],
};

function buildClaimMap(claims: PrescoutingTeamClaim[]): Map<number, PrescoutingTeamClaim> {
  const nextMap = new Map<number, PrescoutingTeamClaim>();
  claims.forEach((claim) => {
    nextMap.set(claim.teamNumber, claim);
  });

  return nextMap;
}

type Props = {
  isAdminSignedIn: boolean;
  signedInUserProfile: UserProfile | null;
  onQuickScout?: (target: PrescoutingQuickScoutTarget) => void;
};

export function PrescoutingCoverage({ isAdminSignedIn, signedInUserProfile, onQuickScout }: Props) {
  const [teamMatchesMap, setTeamMatchesMap] = useState<Map<number, TBAMatch[]>>(new Map());
  const [scoutedIndex, setScoutedIndex] = useState<PrescoutingScoutedIndex>(EMPTY_SCOUTED_INDEX);
  const [claimsByTeam, setClaimsByTeam] = useState<Map<number, PrescoutingTeamClaim>>(new Map());
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isLoadingClaims, setIsLoadingClaims] = useState(true);
  const [claimActionByTeam, setClaimActionByTeam] = useState<Record<number, 'claim' | 'release'>>({});
  const [showOnlyUncovered, setShowOnlyUncovered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSequence = useRef(0);

  const loadSchedule = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setIsLoadingSchedule(true);
    setError(null);

    try {
      const nextMap = await loadAllTeamMatchesForPrescouting(PRESCOUTING_TEAM_NUMBERS, PRESCOUTING_SEASON_YEAR);
      if (sequence !== loadSequence.current) {
        return;
      }
      setTeamMatchesMap(nextMap);
    } catch (loadError) {
      if (sequence !== loadSequence.current) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : 'Failed to load prescouting schedule.');
      setTeamMatchesMap(new Map());
    } finally {
      if (sequence === loadSequence.current) {
        setIsLoadingSchedule(false);
      }
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const index = await loadPrescoutingScoutedIndex();
      setScoutedIndex(index);
    } catch {
      setScoutedIndex(EMPTY_SCOUTED_INDEX);
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  const loadClaims = useCallback(async () => {
    setIsLoadingClaims(true);
    try {
      const claims = await listActivePrescoutingTeamClaims(PRESCOUTING_SEASON_YEAR);
      setClaimsByTeam(buildClaimMap(claims));
    } catch (loadError) {
      console.error('Failed to load team claims:', loadError);
      showToast('Failed to load team claims.');
      setClaimsByTeam(new Map());
    } finally {
      setIsLoadingClaims(false);
    }
  }, []);

  const claimTeam = useCallback(async (teamNumber: number) => {
    if (!signedInUserProfile) {
      showToast('Sign in before claiming teams.');
      return;
    }

    if (claimActionByTeam[teamNumber]) {
      return;
    }

    setClaimActionByTeam((current) => ({ ...current, [teamNumber]: 'claim' }));
    try {
      const claim = await claimPrescoutingTeam({
        seasonYear: PRESCOUTING_SEASON_YEAR,
        teamNumber,
        claimerProfileId: signedInUserProfile.id,
        claimerName: signedInUserProfile.name,
      });

      setClaimsByTeam((current) => {
        const next = new Map(current);
        next.set(teamNumber, claim);
        return next;
      });
      showToast(`Claimed Team ${teamNumber}.`);
      window.dispatchEvent(new CustomEvent('prescouting-claims-updated'));
    } catch (claimError) {
      const message = claimError instanceof Error ? claimError.message : 'Failed to claim team.';
      showToast(message);
      void loadClaims();
    } finally {
      setClaimActionByTeam((current) => {
        const next = { ...current };
        delete next[teamNumber];
        return next;
      });
    }
  }, [claimActionByTeam, loadClaims, signedInUserProfile]);

  const releaseTeam = useCallback(async (teamNumber: number) => {
    if (!isAdminSignedIn || !signedInUserProfile) {
      showToast('Only admins can release claims.');
      return;
    }

    if (claimActionByTeam[teamNumber]) {
      return;
    }

    const claim = claimsByTeam.get(teamNumber);
    if (!claim) {
      return;
    }

    const confirmed = window.confirm(`Release Team ${teamNumber} claimed by ${claim.claimerName}?`);
    if (!confirmed) {
      return;
    }

    setClaimActionByTeam((current) => ({ ...current, [teamNumber]: 'release' }));
    try {
      await releasePrescoutingTeamClaim({
        seasonYear: PRESCOUTING_SEASON_YEAR,
        teamNumber,
        releasedByProfileId: signedInUserProfile.id,
        isAdmin: isAdminSignedIn,
      });

      setClaimsByTeam((current) => {
        const next = new Map(current);
        next.delete(teamNumber);
        return next;
      });
      showToast(`Released claim for Team ${teamNumber}.`);
      window.dispatchEvent(new CustomEvent('prescouting-claims-updated'));
    } catch (releaseError) {
      const message = releaseError instanceof Error ? releaseError.message : 'Failed to release claim.';
      showToast(message);
      void loadClaims();
    } finally {
      setClaimActionByTeam((current) => {
        const next = { ...current };
        delete next[teamNumber];
        return next;
      });
    }
  }, [claimActionByTeam, claimsByTeam, isAdminSignedIn, loadClaims, signedInUserProfile]);

  const handleQuickScout = useCallback((column: MatchColumn, teamNumber: number, covered: boolean) => {
    if (covered || !onQuickScout) {
      return;
    }

    const confirmed = window.confirm('Scout this match?');
    if (!confirmed) {
      return;
    }

    onQuickScout({
      teamNumber,
      matchKey: column.key,
      matchNumber: column.matchNumber,
      eventKey: column.eventKey,
    });
  }, [onQuickScout]);

  useEffect(() => {
    void Promise.all([loadSchedule(), loadStatus(), loadClaims()]);
  }, [loadClaims, loadSchedule, loadStatus]);

  useEffect(() => {
    const refreshStatusAndClaims = () => {
      void loadStatus();
      void loadClaims();
    };

    window.addEventListener('sync-success', refreshStatusAndClaims);
    window.addEventListener('storage', refreshStatusAndClaims);
    window.addEventListener('prescouting-claims-updated', refreshStatusAndClaims);
    return () => {
      window.removeEventListener('sync-success', refreshStatusAndClaims);
      window.removeEventListener('storage', refreshStatusAndClaims);
      window.removeEventListener('prescouting-claims-updated', refreshStatusAndClaims);
    };
  }, [loadClaims, loadStatus]);

  const columns = useMemo(() => {
    const byKey = new Map<string, MatchColumn>();

    PRESCOUTING_TEAM_NUMBERS.forEach((teamNumber) => {
      const matches = teamMatchesMap.get(teamNumber) || [];
      matches.forEach((match) => {
        const eventKey = getMatchEventKey(match);
        const key = match.key;
        const existing = byKey.get(key);
        if (existing) {
          existing.teamNumbers.add(teamNumber);
          return;
        }

        byKey.set(key, {
          key,
          eventKey,
          matchNumber: match.match_number,
          label: `${eventKey.toUpperCase()} ${formatMatchLabel(match)}`,
          teamNumbers: new Set<number>([teamNumber]),
          match,
        });
      });
    });

    const all = Array.from(byKey.values());
    all.sort((a, b) => {
      const eventCompare = a.eventKey.localeCompare(b.eventKey);
      if (eventCompare !== 0) {
        return eventCompare;
      }

      const sorted = sortMatches([a.match, b.match]);
      return sorted[0].key === a.key ? -1 : 1;
    });

    return all;
  }, [teamMatchesMap]);

  const coverageMetadata = useMemo(() => {
    const coveredKeys = new Set<string>();
    const coveredCountByTeam = new Map<number, number>();
    const scheduledCountByTeam = new Map<number, number>();
    const coveredCountByMatch = new Map<string, number>();
    const scheduledCountByMatch = new Map<string, number>();

    PRESCOUTING_TEAM_NUMBERS.forEach((teamNumber) => {
      scheduledCountByTeam.set(teamNumber, 0);
      coveredCountByTeam.set(teamNumber, 0);
    });

    columns.forEach((column) => {
      let coveredInColumn = 0;
      const scheduledInColumn = column.teamNumbers.size;
      scheduledCountByMatch.set(column.key, scheduledInColumn);

      column.teamNumbers.forEach((teamNumber) => {
        const cellKey = `${column.key}|${teamNumber}`;
        const isCovered = isTeamMatchAlreadyScouted(scoutedIndex, teamNumber, column.match);

        scheduledCountByTeam.set(teamNumber, (scheduledCountByTeam.get(teamNumber) || 0) + 1);
        if (isCovered) {
          coveredInColumn += 1;
          coveredKeys.add(cellKey);
          coveredCountByTeam.set(teamNumber, (coveredCountByTeam.get(teamNumber) || 0) + 1);
        }
      });

      coveredCountByMatch.set(column.key, coveredInColumn);
    });

    return {
      coveredKeys,
      coveredCountByTeam,
      scheduledCountByTeam,
      coveredCountByMatch,
      scheduledCountByMatch,
    };
  }, [columns, scoutedIndex]);

  const overallScheduled = useMemo(
    () => Array.from(coverageMetadata.scheduledCountByTeam.values()).reduce((sum, value) => sum + value, 0),
    [coverageMetadata.scheduledCountByTeam],
  );
  const overallCovered = useMemo(
    () => Array.from(coverageMetadata.coveredCountByTeam.values()).reduce((sum, value) => sum + value, 0),
    [coverageMetadata.coveredCountByTeam],
  );

  const visibleColumns = useMemo(() => {
    if (!showOnlyUncovered) {
      return columns;
    }

    return columns.filter((column) => {
      const coveredCount = coverageMetadata.coveredCountByMatch.get(column.key) || 0;
      const scheduledCount = coverageMetadata.scheduledCountByMatch.get(column.key) || 0;
      return Math.max(scheduledCount - coveredCount, 0) > 0;
    });
  }, [columns, coverageMetadata.coveredCountByMatch, coverageMetadata.scheduledCountByMatch, showOnlyUncovered]);

  const visibleTeams = useMemo(() => {
    if (!showOnlyUncovered) {
      return PRESCOUTING_TEAMS;
    }

    return PRESCOUTING_TEAMS.filter((team) => {
      const coveredCount = coverageMetadata.coveredCountByTeam.get(team.teamNumber) || 0;
      const scheduledCount = coverageMetadata.scheduledCountByTeam.get(team.teamNumber) || 0;
      return Math.max(scheduledCount - coveredCount, 0) > 0;
    });
  }, [coverageMetadata.coveredCountByTeam, coverageMetadata.scheduledCountByTeam, showOnlyUncovered]);

  if (isLoadingSchedule) {
    return (
      <div className="max-w-7xl mx-auto px-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-slate-300 inline-flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading prescouting schedule for all 66 teams...
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

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Prescouting Coverage Matrix</h2>
            <p className="mt-1 text-sm text-slate-300">
              66 hardcoded teams across all {PRESCOUTING_SEASON_YEAR} matches they played in every event.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Claims are advisory only. Any scout can still proceed scouting after warning.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowOnlyUncovered((current) => !current)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                showOnlyUncovered
                  ? 'border-rose-500/60 bg-rose-900/30 text-rose-200 hover:bg-rose-900/40'
                  : 'border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800'
              }`}
            >
              {showOnlyUncovered ? 'Showing Uncovered Only' : 'Show Uncovered Only'}
            </button>
            <button
              onClick={() => {
                void Promise.all([loadSchedule(), loadStatus(), loadClaims()]);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingStatus || isLoadingClaims ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Covered cells</p>
            <p className="text-xl font-semibold text-emerald-300">{overallCovered}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Missing cells</p>
            <p className="text-xl font-semibold text-rose-300">{Math.max(overallScheduled - overallCovered, 0)}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Coverage rate</p>
            <p className="text-xl font-semibold text-blue-200">
              {overallScheduled > 0 ? `${Math.round((overallCovered / overallScheduled) * 100)}%` : '0%'}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          {isLoadingClaims ? 'Loading team claims...' : `${claimsByTeam.size} teams currently claimed.`}
        </p>
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden">
        <div className="overflow-auto max-h-[72vh]">
          <table className="min-w-max border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-30 bg-slate-900 px-3 py-2 text-left font-semibold text-slate-200 border-b border-r border-slate-700 min-w-[250px]">
                  Team
                </th>
                {visibleColumns.map((column) => {
                  const coveredCount = coverageMetadata.coveredCountByMatch.get(column.key) || 0;
                  const scheduledCount = coverageMetadata.scheduledCountByMatch.get(column.key) || 0;
                  return (
                    <th
                      key={column.key}
                      className="sticky top-0 z-20 bg-slate-900 px-2 py-2 text-center font-semibold text-slate-200 border-b border-r border-slate-700 min-w-[92px]"
                    >
                      <div className="whitespace-nowrap">{column.label}</div>
                      <div className="text-[10px] text-slate-400">{coveredCount}/{scheduledCount}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {showOnlyUncovered && visibleColumns.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-sm text-emerald-200 bg-slate-900/70">
                    All currently scheduled prescouting cells are covered.
                  </td>
                </tr>
              )}

              {visibleTeams.map((team) => {
                const scheduledCount = coverageMetadata.scheduledCountByTeam.get(team.teamNumber) || 0;
                const coveredCount = coverageMetadata.coveredCountByTeam.get(team.teamNumber) || 0;
                const complete = scheduledCount > 0 && coveredCount === scheduledCount;
                const claim = claimsByTeam.get(team.teamNumber);
                const claimedByCurrentUser = Boolean(claim && signedInUserProfile && claim.claimerProfileId === signedInUserProfile.id);
                const claimAction = claimActionByTeam[team.teamNumber];

                return (
                  <tr key={team.teamNumber}>
                    <th className="sticky left-0 z-10 bg-slate-900/95 px-3 py-2 text-left border-b border-r border-slate-700">
                      <div className="font-semibold text-slate-100">#{team.rank} - Team {team.teamNumber}</div>
                      <div className="text-[11px] text-slate-400">{coveredCount}/{scheduledCount}</div>
                      <div className={`text-[10px] mt-0.5 ${complete ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {complete ? 'Complete' : 'Missing'}
                      </div>

                      <div className="mt-2 space-y-1">
                        {claim ? (
                          <>
                            <div className="text-[10px] text-amber-100 rounded-md border border-amber-500/40 bg-amber-900/30 px-2 py-1">
                              Claimed by {claim.claimerName}
                              {claimedByCurrentUser ? ' (you)' : ''}
                            </div>
                            {isAdminSignedIn && (
                              <button
                                onClick={() => {
                                  void releaseTeam(team.teamNumber);
                                }}
                                disabled={claimAction === 'release'}
                                className="text-[10px] px-2 py-1 rounded-md border border-slate-600 text-slate-100 hover:bg-slate-800 disabled:opacity-60"
                              >
                                {claimAction === 'release' ? 'Releasing...' : 'Release claim'}
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              void claimTeam(team.teamNumber);
                            }}
                            disabled={claimAction === 'claim' || !signedInUserProfile}
                            className="text-[10px] px-2 py-1 rounded-md border border-blue-500/50 text-blue-100 hover:bg-blue-900/30 disabled:opacity-60"
                          >
                            {claimAction === 'claim' ? 'Claiming...' : 'Claim team'}
                          </button>
                        )}
                      </div>
                    </th>
                    {visibleColumns.map((column) => {
                      const scheduled = column.teamNumbers.has(team.teamNumber);
                      const covered = coverageMetadata.coveredKeys.has(`${column.key}|${team.teamNumber}`);
                      const uncovered = scheduled && !covered;

                      if (showOnlyUncovered && !uncovered) {
                        return (
                          <td
                            key={`${column.key}:${team.teamNumber}`}
                            className="h-9 border-b border-r border-transparent bg-transparent"
                            aria-hidden="true"
                          />
                        );
                      }

                      if (!scheduled) {
                        return (
                          <td
                            key={`${column.key}:${team.teamNumber}`}
                            className="h-9 border-b border-r border-slate-800 bg-slate-950/70 text-center text-slate-600"
                            title="Team not in this match"
                          >
                            -
                          </td>
                        );
                      }

                      if (covered) {
                        return (
                          <td
                            key={`${column.key}:${team.teamNumber}`}
                            className="h-9 border-b border-r border-slate-700 text-center font-semibold bg-emerald-900/35 text-emerald-200"
                            title="Scouted"
                          >
                            ✓
                          </td>
                        );
                      }

                      return (
                        <td
                          key={`${column.key}:${team.teamNumber}`}
                          onClick={() => handleQuickScout(column, team.teamNumber, covered)}
                          className="h-9 border-b border-r border-slate-700 text-center font-semibold bg-rose-900/30 text-rose-200 cursor-pointer hover:bg-rose-800/40"
                          title="Missing - click to scout this match"
                        >
                          •
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {showOnlyUncovered && visibleColumns.length > 0 && visibleTeams.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length + 1} className="px-4 py-6 text-center text-sm text-emerald-200 bg-slate-900/70">
                    All teams are fully covered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
