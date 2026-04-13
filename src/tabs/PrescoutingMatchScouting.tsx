import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, PlayCircle } from 'lucide-react';
import { MatchScoutingFormState, MatchScoutingSections } from '../components/MatchScoutingSections';
import { compLevelSortOrder, formatMatchLabel, toTeamNumber } from '../lib/matchUtils';
import { buildMatchScoutStorageKey, getMatchScoutStorageKeyCandidates, storage } from '../lib/storage';
import { listActivePrescoutingTeamClaims } from '../lib/supabase';
import { MatchScoutData, PrescoutingTeamClaim, TBAMatch } from '../types';
import { PRESCOUTING_SEASON_YEAR, PRESCOUTING_TEAMS } from '../prescouting/constants';
import { usePrescoutingTeamMatches } from '../prescouting/hooks/usePrescoutingTeamMatches';
import { getMatchEventKey, loadYoutubeVideoForMatch } from '../prescouting/matchData';
import {
  clearPendingPrescoutingQuickScout,
  getPendingPrescoutingQuickScout,
  PrescoutingQuickScoutTarget,
} from '../prescouting/quickScout';
import { isTeamMatchAlreadyScouted, loadPrescoutingScoutedIndex, PrescoutingScoutedIndex } from '../prescouting/scoutedEntries';
import { showToast } from '../components/Toast';

type Props = {
  isAdminScout: boolean;
  adminProfileId: string | null;
  scoutProfileId: string | null;
};

type EventMatchScoutData = MatchScoutData & {
  eventKey: string;
  matchKey: string;
  matchNumber: number;
  teamNumber: number;
  allianceColor: 'Red' | 'Blue' | '';
};

const EMPTY_FORM: MatchScoutingFormState = {
  autonNotes: '',
  autonPath: null,
  teleopShotAttempts: [],
  playedDefense: false,
  defenseQuality: '',
  defenseNotes: '',
  notes: '',
};

function resolveAllianceColor(match: TBAMatch | null, teamNumber: number | null): 'Red' | 'Blue' | '' {
  if (!match || !teamNumber) {
    return '';
  }

  const redTeams = (match.alliances?.red?.team_keys || []).map(toTeamNumber);
  return redTeams.includes(teamNumber) ? 'Red' : 'Blue';
}

function sortByDisplayOrder(matches: TBAMatch[]): TBAMatch[] {
  return [...matches].sort((a, b) => {
    const levelSort = compLevelSortOrder(a.comp_level) - compLevelSortOrder(b.comp_level);
    if (levelSort !== 0) {
      return levelSort;
    }

    const eventCompare = getMatchEventKey(a).localeCompare(getMatchEventKey(b));
    if (eventCompare !== 0) {
      return eventCompare;
    }

    if (a.set_number !== b.set_number) {
      return a.set_number - b.set_number;
    }

    return a.match_number - b.match_number;
  });
}

function buildClaimMap(claims: PrescoutingTeamClaim[]): Map<number, PrescoutingTeamClaim> {
  const nextMap = new Map<number, PrescoutingTeamClaim>();
  claims.forEach((claim) => {
    nextMap.set(claim.teamNumber, claim);
  });

  return nextMap;
}

export function PrescoutingMatchScouting({ isAdminScout, adminProfileId, scoutProfileId }: Props) {
  const [selectedTeamNumber, setSelectedTeamNumber] = useState<number | null>(null);
  const [selectedMatchKey, setSelectedMatchKey] = useState('');
  const [videoEmbedUrl, setVideoEmbedUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [formState, setFormState] = useState<MatchScoutingFormState>(EMPTY_FORM);
  const [claimsByTeam, setClaimsByTeam] = useState<Map<number, PrescoutingTeamClaim>>(new Map());
  const [isLoadingClaims, setIsLoadingClaims] = useState(true);
  const [warningTeamNumber, setWarningTeamNumber] = useState<number | null>(null);
  const [pendingQuickScout, setPendingQuickScout] = useState<PrescoutingQuickScoutTarget | null>(null);
  const [scoutedIndex, setScoutedIndex] = useState<PrescoutingScoutedIndex>({
    byTeamAndMatchKey: new Set<string>(),
    byTeamAndEventMatch: new Set<string>(),
    entries: [],
  });

  const currentProfileId = isAdminScout ? adminProfileId : scoutProfileId;

  const formRef = useRef<MatchScoutingFormState>(EMPTY_FORM);
  useEffect(() => {
    formRef.current = formState;
  }, [formState]);

  const { matches, isLoading: matchesLoading, error: matchesError } = usePrescoutingTeamMatches(
    selectedTeamNumber,
    PRESCOUTING_SEASON_YEAR,
  );

  const orderedMatches = useMemo(() => sortByDisplayOrder(matches), [matches]);

  const loadClaims = useCallback(async () => {
    setIsLoadingClaims(true);
    try {
      const claims = await listActivePrescoutingTeamClaims(PRESCOUTING_SEASON_YEAR);
      setClaimsByTeam(buildClaimMap(claims));
    } catch (error) {
      console.error('Failed to load prescouting claims:', error);
    } finally {
      setIsLoadingClaims(false);
    }
  }, []);

  const attemptTeamSelection = useCallback((teamNumber: number | null): boolean => {
    if (!teamNumber) {
      setWarningTeamNumber(null);
      setSelectedTeamNumber(null);
      return true;
    }

    const claim = claimsByTeam.get(teamNumber);
    if (claim && claim.claimerProfileId !== currentProfileId) {
      setWarningTeamNumber(teamNumber);
      return false;
    }

    setWarningTeamNumber(null);
    setSelectedTeamNumber(teamNumber);
    return true;
  }, [claimsByTeam, currentProfileId]);

  const warningClaim = useMemo(() => {
    if (!warningTeamNumber) {
      return null;
    }

    return claimsByTeam.get(warningTeamNumber) || null;
  }, [claimsByTeam, warningTeamNumber]);

  const teamsWithNoScoutingEntries = useMemo(() => {
    const teamsWithEntries = new Set<number>();
    scoutedIndex.entries.forEach((entry) => {
      teamsWithEntries.add(entry.teamNumber);
    });

    return PRESCOUTING_TEAMS.filter((row) => !teamsWithEntries.has(row.teamNumber));
  }, [scoutedIndex.entries]);

  useEffect(() => {
    void loadClaims();

    const refreshClaims = () => {
      void loadClaims();
    };

    window.addEventListener('storage', refreshClaims);
    window.addEventListener('prescouting-claims-updated', refreshClaims);

    return () => {
      window.removeEventListener('storage', refreshClaims);
      window.removeEventListener('prescouting-claims-updated', refreshClaims);
    };
  }, [loadClaims]);

  useEffect(() => {
    const pending = getPendingPrescoutingQuickScout();
    if (!pending) {
      return;
    }

    setPendingQuickScout(pending);
  }, []);

  useEffect(() => {
    if (!pendingQuickScout || isLoadingClaims) {
      return;
    }

    attemptTeamSelection(pendingQuickScout.teamNumber);
  }, [attemptTeamSelection, isLoadingClaims, pendingQuickScout]);

  useEffect(() => {
    if (!pendingQuickScout || selectedTeamNumber !== pendingQuickScout.teamNumber) {
      return;
    }

    if (matchesLoading) {
      return;
    }

    if (orderedMatches.length === 0) {
      clearPendingPrescoutingQuickScout();
      setPendingQuickScout(null);
      return;
    }

    const matched = orderedMatches.find((match) => {
      if (match.key === pendingQuickScout.matchKey) {
        return true;
      }

      return (
        match.match_number === pendingQuickScout.matchNumber
        && getMatchEventKey(match) === pendingQuickScout.eventKey
      );
    });

    if (matched) {
      setSelectedMatchKey(matched.key);
    }

    clearPendingPrescoutingQuickScout();
    setPendingQuickScout(null);
  }, [matchesLoading, orderedMatches, pendingQuickScout, selectedTeamNumber]);

  useEffect(() => {
    let cancelled = false;

    const refreshScouted = async () => {
      try {
        const next = await loadPrescoutingScoutedIndex();
        if (!cancelled) {
          setScoutedIndex(next);
        }
      } catch (error) {
        console.error('Failed to load scouted index:', error);
      }
    };

    void refreshScouted();

    const onRefresh = () => {
      void refreshScouted();
    };

    window.addEventListener('sync-success', onRefresh);
    window.addEventListener('storage', onRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener('sync-success', onRefresh);
      window.removeEventListener('storage', onRefresh);
    };
  }, []);

  useEffect(() => {
    if (orderedMatches.length === 0) {
      setSelectedMatchKey('');
      return;
    }

    if (!orderedMatches.some((match) => match.key === selectedMatchKey)) {
      setSelectedMatchKey(orderedMatches[0].key);
    }
  }, [orderedMatches, selectedMatchKey]);

  const selectedMatch = useMemo(
    () => orderedMatches.find((match) => match.key === selectedMatchKey) || null,
    [orderedMatches, selectedMatchKey],
  );

  useEffect(() => {
    if (!selectedTeamNumber || !selectedMatch) {
      setFormState(EMPTY_FORM);
      return;
    }

    const saved = getMatchScoutStorageKeyCandidates({
      matchKey: selectedMatch.key,
      matchNumber: selectedMatch.match_number,
      teamNumber: selectedTeamNumber,
    })
      .map((key) => storage.get<{ data?: EventMatchScoutData }>(key))
      .find((record) => Boolean(record));

    if (!saved?.data) {
      setFormState(EMPTY_FORM);
      return;
    }

    const data = saved.data;
    setFormState({
      autonNotes: data.autonNotes || '',
      autonPath: data.autonPath || null,
      teleopShotAttempts: Array.isArray(data.teleopShotAttempts) ? data.teleopShotAttempts : [],
      playedDefense: Boolean(data.playedDefense),
      defenseQuality: data.defenseQuality || '',
      defenseNotes: data.defenseNotes || '',
      notes: data.notes || '',
    });
  }, [selectedMatch, selectedTeamNumber]);

  useEffect(() => {
    if (!selectedMatch) {
      setVideoEmbedUrl(null);
      setVideoError(null);
      setVideoLoading(false);
      return;
    }

    let cancelled = false;
    setVideoLoading(true);
    setVideoError(null);

    const run = async () => {
      try {
        const video = await loadYoutubeVideoForMatch(selectedMatch.key);
        if (cancelled) {
          return;
        }

        if (!video) {
          setVideoEmbedUrl(null);
          setVideoError('No YouTube video is available for this match yet.');
          return;
        }

        setVideoEmbedUrl(video.embedUrl);
      } catch (error) {
        if (!cancelled) {
          setVideoEmbedUrl(null);
          setVideoError(error instanceof Error ? error.message : 'Failed to load match video.');
        }
      } finally {
        if (!cancelled) {
          setVideoLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [selectedMatch]);

  const selectedRankingRow = useMemo(
    () => PRESCOUTING_TEAMS.find((row) => row.teamNumber === selectedTeamNumber) || null,
    [selectedTeamNumber],
  );

  const alreadyScouted = useMemo(() => {
    if (!selectedTeamNumber || !selectedMatch) {
      return false;
    }

    return isTeamMatchAlreadyScouted(scoutedIndex, selectedTeamNumber, selectedMatch);
  }, [selectedMatch, selectedTeamNumber, scoutedIndex]);

  const selectedTeamClaim = useMemo(() => {
    if (!selectedTeamNumber) {
      return null;
    }

    return claimsByTeam.get(selectedTeamNumber) || null;
  }, [claimsByTeam, selectedTeamNumber]);

  const handleWarningProceed = useCallback(() => {
    if (!warningTeamNumber) {
      return;
    }

    setSelectedTeamNumber(warningTeamNumber);
    setWarningTeamNumber(null);
  }, [warningTeamNumber]);

  const handleWarningBackOut = useCallback(() => {
    const warnedTeam = warningTeamNumber;
    setWarningTeamNumber(null);

    if (pendingQuickScout && warnedTeam && pendingQuickScout.teamNumber === warnedTeam) {
      clearPendingPrescoutingQuickScout();
      setPendingQuickScout(null);
    }
  }, [pendingQuickScout, warningTeamNumber]);

  const readyToScout = Boolean(selectedTeamNumber && selectedMatch);

  const persist = () => {
    if (!selectedTeamNumber || !selectedMatch) {
      return;
    }

    const scoutedByProfileId = isAdminScout ? adminProfileId || undefined : scoutProfileId || undefined;
    const payload: EventMatchScoutData = {
      eventKey: getMatchEventKey(selectedMatch),
      matchKey: selectedMatch.key,
      validated: isAdminScout,
      scoutedByAdmin: isAdminScout,
      scoutedByProfileId,
      scoutedByAdminProfileId: isAdminScout ? adminProfileId || undefined : undefined,
      matchNumber: selectedMatch.match_number,
      teamNumber: selectedTeamNumber,
      allianceColor: resolveAllianceColor(selectedMatch, selectedTeamNumber),
      leftStartingZone: false,
      autoFuelScored: 0,
      autoClimbAttempted: false,
      teleopFuelScored: 0,
      avgBps: 0,
      shootingConsistency: 0,
      intakeConsistency: 0,
      droveOverBump: false,
      droveUnderTrench: false,
      defenseEffectiveness: undefined,
      defendedAgainst: false,
      hubScoringStrategy: '',
      endGameClimbResult: '',
      climbTimeSeconds: '',
      foulsCaused: 0,
      cardReceived: '',
      ...formRef.current,
    };

    storage.saveRecord(
      'matchScout',
      buildMatchScoutStorageKey({
        matchKey: selectedMatch.key,
        matchNumber: selectedMatch.match_number,
        teamNumber: selectedTeamNumber,
      }),
      payload,
    );
  };

  const handleSave = async () => {
    if (!selectedTeamNumber || !selectedMatch) {
      showToast('Please select a team and match first.');
      return;
    }

    if (alreadyScouted) {
      showToast('This team and match has already been scouted.');
      return;
    }

    persist();
    showToast(`Saved Team ${selectedTeamNumber} for ${formatMatchLabel(selectedMatch)}.`);

    try {
      const next = await loadPrescoutingScoutedIndex();
      setScoutedIndex(next);
    } catch {
      // Keep save successful even if status refresh fails.
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-white">Prescouting Match Scouting</h2>
          <p className="text-sm text-slate-300 mt-1">
            Select one of the 66 hardcoded teams, choose one of its {PRESCOUTING_SEASON_YEAR} matches, watch the video, and scout with the standard flow.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Team</label>
            <select
              value={selectedTeamNumber || ''}
              onChange={(event) => {
                const nextTeamNumber = event.target.value ? Number(event.target.value) : null;

                if (pendingQuickScout && nextTeamNumber !== pendingQuickScout.teamNumber) {
                  clearPendingPrescoutingQuickScout();
                  setPendingQuickScout(null);
                }

                attemptTeamSelection(nextTeamNumber);
              }}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a team</option>
              {PRESCOUTING_TEAMS.map((row) => (
                <option key={row.teamNumber} value={row.teamNumber}>
                  #{row.rank} - Team {row.teamNumber} ({row.totalPoints} pts)
                </option>
              ))}
            </select>

            {isLoadingClaims && (
              <p className="text-xs text-slate-400">Loading team claims...</p>
            )}

            {!isLoadingClaims && selectedTeamClaim && (
              <p className="text-xs text-amber-200">
                Team {selectedTeamClaim.teamNumber} is currently claimed by {selectedTeamClaim.claimerName}.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Match</label>
            <select
              value={selectedMatchKey}
              onChange={(event) => setSelectedMatchKey(event.target.value)}
              disabled={!selectedTeamNumber || orderedMatches.length === 0}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            >
              <option value="">Select a match</option>
              {orderedMatches.map((match) => {
                const eventKey = getMatchEventKey(match) || 'unknown';
                return (
                  <option key={match.key} value={match.key}>
                    {eventKey.toUpperCase()} - {formatMatchLabel(match)}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {selectedRankingRow && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
            Team {selectedRankingRow.teamNumber}: Rank #{selectedRankingRow.rank}, Event points {selectedRankingRow.event1Points} + {selectedRankingRow.event2Points}, Total {selectedRankingRow.totalPoints}
          </div>
        )}

        {matchesLoading && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300 inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading team matches...
          </div>
        )}

        {!matchesLoading && matchesError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
            {matchesError}
          </div>
        )}

        {selectedTeamNumber && !matchesLoading && !matchesError && orderedMatches.length === 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
            No matches found for Team {selectedTeamNumber} in {PRESCOUTING_SEASON_YEAR}.
          </div>
        )}
      </div>

      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-3">
        <div className="flex items-center gap-2 text-white">
          <PlayCircle className="w-5 h-5 text-blue-300" />
          <h3 className="text-xl font-semibold">Match Video</h3>
        </div>

        {!selectedMatch && <p className="text-sm text-slate-400">Select a match to load the YouTube video.</p>}

        {selectedMatch && videoLoading && (
          <p className="text-sm text-slate-300 inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading video...
          </p>
        )}

        {selectedMatch && !videoLoading && videoError && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
            {videoError}
          </div>
        )}

        {selectedMatch && !videoLoading && videoEmbedUrl && (
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-slate-700 bg-black">
            <iframe
              title={`Video ${selectedMatch.key}`}
              src={videoEmbedUrl}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        )}
      </div>

      {readyToScout && alreadyScouted && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-900/20 p-4 text-emerald-200">
          This team and match has already been scouted. Duplicate scouting is blocked.
        </div>
      )}

      <MatchScoutingSections
        readyToScout={readyToScout}
        selectedMatchKey={selectedMatchKey}
        selectedTeamNumber={selectedTeamNumber || ''}
        allianceColor={resolveAllianceColor(selectedMatch, selectedTeamNumber)}
        formState={formState}
        onFormStateChange={setFormState}
        onPersist={() => {
          // Prescouting blocks duplicates at save time; draft edits stay local in component state.
        }}
        onSave={handleSave}
        saveDisabled={!readyToScout || alreadyScouted}
      />

      {warningTeamNumber && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 p-4 flex items-center justify-center">
          <div className="w-full max-w-2xl rounded-2xl border border-amber-500/40 bg-slate-900 shadow-2xl p-6 space-y-4">
            <h3 className="text-xl font-bold text-amber-100">Claim Warning</h3>
            <p className="text-sm text-slate-200">
              This team has already been claimed. Are you sure you want to scout them?
            </p>

            {warningClaim && (
              <p className="text-sm text-amber-200">
                Team {warningClaim.teamNumber} is currently claimed by {warningClaim.claimerName}.
              </p>
            )}

            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">Teams with zero scouting entries</p>
              {teamsWithNoScoutingEntries.length === 0 ? (
                <p className="text-sm text-emerald-200">Every team already has at least one scouting entry.</p>
              ) : (
                <div className="max-h-40 overflow-auto grid gap-1 sm:grid-cols-2">
                  {teamsWithNoScoutingEntries.map((row) => (
                    <div key={row.teamNumber} className="text-sm text-slate-200 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1">
                      Team {row.teamNumber}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={handleWarningBackOut}
                className="px-4 py-2 rounded-xl border border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                Back
              </button>
              <button
                onClick={handleWarningProceed}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold"
              >
                I know
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
