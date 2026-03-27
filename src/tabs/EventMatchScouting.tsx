import React, { useState, useEffect, useMemo, useRef } from 'react';
import { tba } from '../lib/tba';
import { storage } from '../lib/storage';
import { listAssignmentsForScout, markAssignmentCompleted } from '../lib/supabase';
import { AutonPathData, AutonShotAttempt, CompetitionProfile, DefenseQuality, MatchScoutData, ScoutAssignment, TBAMatch, TBATeam } from '../types';
import { Toggle, MultiToggle } from '../components/Toggle';
import { AutonPathField } from '../components/AutonPathField';
import { showToast } from '../components/Toast';
import { Save } from 'lucide-react';

type AllianceColor = 'Red' | 'Blue';

interface EventMatchScoutData extends MatchScoutData {
  eventKey: string;
  matchKey: string;
  matchNumber: number;
  teamNumber: number;
  allianceColor: AllianceColor | '';
}

const EMPTY_FORM = {
  autonNotes: '',
  autonPath: null as AutonPathData | null,
  teleopShotAttempts: [] as AutonShotAttempt[],
  playedDefense: false,
  defenseQuality: '' as DefenseQuality | '',
  defenseNotes: '',
  notes: '',
};

type Props = {
  activeProfile: CompetitionProfile | null;
  isAdminScout: boolean;
  adminProfileId: string | null;
  scoutProfileId: string | null;
};

function toTeamNumber(teamKey: string): number {
  return Number(teamKey.replace('frc', ''));
}

function compLevelSortOrder(compLevel: string): number {
  switch (compLevel) {
    case 'qm': return 0;
    case 'ef': return 1;
    case 'qf': return 2;
    case 'sf': return 3;
    case 'f':  return 4;
    default:   return 5;
  }
}

function formatMatchLabel(match: TBAMatch): string {
  if (match.comp_level === 'qm') {
    return `QM ${match.match_number}`;
  }
  return `${match.comp_level.toUpperCase()} ${match.set_number}-${match.match_number}`;
}

export function EventMatchScouting({ activeProfile, isAdminScout, adminProfileId, scoutProfileId }: Props) {
  const [matches, setMatches] = useState<TBAMatch[]>([]);
  const [teamNameByNumber, setTeamNameByNumber] = useState<Map<number, string>>(new Map());
  const [assignments, setAssignments] = useState<ScoutAssignment[]>([]);
  const [selectedMatchKey, setSelectedMatchKey] = useState<string>('');
  const [selectedTeamNumber, setSelectedTeamNumber] = useState<number | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [autonNotes, setAutonNotes] = useState('');
  const [autonPath, setAutonPath] = useState<AutonPathData | null>(null);
  const [teleopShotAttempts, setTeleopShotAttempts] = useState<AutonShotAttempt[]>([]);
  const [playedDefense, setPlayedDefense] = useState(false);
  const [defenseQuality, setDefenseQuality] = useState<DefenseQuality | ''>('');
  const [defenseNotes, setDefenseNotes] = useState('');
  const [notes, setNotes] = useState('');

  // Use a ref so autoSave can always access current form values without stale closures
  const formRef = useRef({ autonNotes, autonPath, teleopShotAttempts, playedDefense, defenseQuality, defenseNotes, notes });
  useEffect(() => {
    formRef.current = { autonNotes, autonPath, teleopShotAttempts, playedDefense, defenseQuality, defenseNotes, notes };
  }, [autonNotes, autonPath, teleopShotAttempts, playedDefense, defenseQuality, defenseNotes, notes]);

  useEffect(() => {
    if (!activeProfile) {
      setIsLoading(false);
      setError('No active competition profile selected.');
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const run = async () => {
      try {
        const [teams, loadedMatches] = await Promise.all([
          tba.fetchTeams(activeProfile.eventKey),
          tba.fetchMatches(activeProfile.eventKey),
        ]);

        if (cancelled) return;

        const sortedMatches = (loadedMatches as TBAMatch[])
          .filter((m) => m.alliances?.red?.team_keys && m.alliances?.blue?.team_keys)
          .sort((a, b) => {
            const levelSort = compLevelSortOrder(a.comp_level) - compLevelSortOrder(b.comp_level);
            if (levelSort !== 0) return levelSort;
            if (a.set_number !== b.set_number) return a.set_number - b.set_number;
            return a.match_number - b.match_number;
          });

        const nameMap = new Map<number, string>();
        (teams as TBATeam[]).forEach((t) => {
          nameMap.set(t.team_number, t.nickname || t.name || 'Unknown');
        });

        setMatches(sortedMatches);
        setTeamNameByNumber(nameMap);

        if (sortedMatches.length > 0) {
          const firstQual = sortedMatches.find((m) => m.comp_level === 'qm') || sortedMatches[0];
          setSelectedMatchKey(firstQual.key);
        }
      } catch (err) {
        console.error('Failed to load matches:', err);
        if (!cancelled) {
          setError('Failed to load matches for this event.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [activeProfile]);

  useEffect(() => {
    if (!activeProfile || !scoutProfileId) {
      setAssignments([]);
      return;
    }

    let cancelled = false;
    const loadAssignments = async () => {
      try {
        const loadedAssignments = await listAssignmentsForScout(activeProfile.eventKey, scoutProfileId);
        if (!cancelled) {
          setAssignments(loadedAssignments);
        }
      } catch (error) {
        console.error('Failed to load scout assignments:', error);
      }
    };

    void loadAssignments();
    return () => {
      cancelled = true;
    };
  }, [activeProfile, scoutProfileId]);

  const actionableAssignments = useMemo(() => {
    if (!scoutProfileId || !activeProfile) {
      return [];
    }

    return assignments.filter((assignment) => {
      if (assignment.status === 'completed') {
        return false;
      }

      const localKey = `matchScout:${assignment.matchNumber}:${assignment.teamNumber}`;
      const existingRecord = storage.get<{ data?: MatchScoutData }>(localKey);
      const existingEventKey = (existingRecord?.data?.eventKey || '').trim().toLowerCase();
      const activeEventKey = activeProfile.eventKey.trim().toLowerCase();
      return existingEventKey !== activeEventKey;
    });
  }, [assignments, scoutProfileId, activeProfile]);

  const scoutModeEnabled = Boolean(scoutProfileId);
  const assignedMatchNumbers = useMemo(
    () => new Set(actionableAssignments.map((assignment) => assignment.matchNumber)),
    [actionableAssignments],
  );

  const availableMatches = useMemo(() => {
    if (!scoutModeEnabled) {
      return matches;
    }

    return matches.filter((match) => assignedMatchNumbers.has(match.match_number));
  }, [matches, scoutModeEnabled, assignedMatchNumbers]);

  const selectedMatch = useMemo(
    () => availableMatches.find((m) => m.key === selectedMatchKey) || null,
    [availableMatches, selectedMatchKey],
  );

  const teamOptions = useMemo(() => {
    if (!selectedMatch) return [];
    const red = selectedMatch.alliances.red.team_keys.map((k) => ({
      teamNumber: toTeamNumber(k),
      alliance: 'Red' as AllianceColor,
    }));
    const blue = selectedMatch.alliances.blue.team_keys.map((k) => ({
      teamNumber: toTeamNumber(k),
      alliance: 'Blue' as AllianceColor,
    }));
    if (!scoutModeEnabled) {
      return [...red, ...blue];
    }

    const allowedTeams = new Set(
      actionableAssignments
        .filter((assignment) => assignment.matchNumber === selectedMatch.match_number)
        .map((assignment) => assignment.teamNumber),
    );

    return [...red, ...blue].filter((team) => allowedTeams.has(team.teamNumber));
  }, [selectedMatch, scoutModeEnabled, actionableAssignments]);

  useEffect(() => {
    if (availableMatches.length === 0) {
      setSelectedMatchKey('');
      return;
    }

    if (!availableMatches.some((match) => match.key === selectedMatchKey)) {
      setSelectedMatchKey(availableMatches[0].key);
    }
  }, [availableMatches, selectedMatchKey]);

  useEffect(() => {
    if (selectedTeamNumber === '') {
      return;
    }

    const hasSelectedTeam = teamOptions.some((team) => team.teamNumber === selectedTeamNumber);
    if (!hasSelectedTeam) {
      setSelectedTeamNumber('');
    }
  }, [selectedTeamNumber, teamOptions]);

  // Reset team and form when match changes
  useEffect(() => {
    setSelectedTeamNumber('');
    setAutonNotes('');
    setAutonPath(null);
    setTeleopShotAttempts([]);
    setPlayedDefense(false);
    setDefenseQuality('');
    setDefenseNotes('');
    setNotes('');
  }, [selectedMatchKey]);

  // Load saved data when team selection changes
  useEffect(() => {
    if (!selectedMatch || selectedTeamNumber === '') {
      setAutonNotes('');
      setAutonPath(null);
      setTeleopShotAttempts([]);
      setPlayedDefense(false);
      setDefenseQuality('');
      setDefenseNotes('');
      setNotes('');
      return;
    }

    const key = `matchScout:${selectedMatch.match_number}:${selectedTeamNumber}`;
    const saved = storage.get<{ data?: EventMatchScoutData }>(key);
    if (saved?.data) {
      const d = saved.data;
      setAutonNotes(d.autonNotes || '');
      setAutonPath(d.autonPath || null);
      setTeleopShotAttempts(Array.isArray(d.teleopShotAttempts) ? d.teleopShotAttempts : []);
      setPlayedDefense(d.playedDefense || false);
      setDefenseQuality(d.defenseQuality || '');
      setDefenseNotes(d.defenseNotes || '');
      setNotes(d.notes || '');
    } else {
      setAutonNotes('');
      setAutonPath(null);
      setTeleopShotAttempts([]);
      setPlayedDefense(false);
      setDefenseQuality('');
      setDefenseNotes('');
      setNotes('');
    }
  }, [selectedTeamNumber, selectedMatch]);

  function getAllianceColor(): AllianceColor | '' {
    if (!selectedMatch || selectedTeamNumber === '') return '';
    const redTeams = selectedMatch.alliances.red.team_keys.map(toTeamNumber);
    return redTeams.includes(selectedTeamNumber as number) ? 'Red' : 'Blue';
  }

  function persist(overrides: Partial<typeof EMPTY_FORM> = {}) {
    if (!selectedMatch || selectedTeamNumber === '' || !activeProfile) return;

    const current = { ...formRef.current, ...overrides };
    const scoutedByProfileId = isAdminScout ? adminProfileId || undefined : scoutProfileId || undefined;
    const record: EventMatchScoutData = {
      eventKey: activeProfile.eventKey,
      matchKey: selectedMatch.key,
      validated: isAdminScout,
      scoutedByAdmin: isAdminScout,
      scoutedByProfileId,
      scoutedByAdminProfileId: isAdminScout ? adminProfileId || undefined : undefined,
      matchNumber: selectedMatch.match_number,
      teamNumber: selectedTeamNumber as number,
      allianceColor: getAllianceColor(),
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
      ...current,
    };

    storage.saveRecord(
      'matchScout',
      `matchScout:${selectedMatch.match_number}:${selectedTeamNumber}`,
      record,
    );
  }

  const handleSave = () => {
    if (!selectedMatch || selectedTeamNumber === '') {
      showToast('Please select a match and team');
      return;
    }

    if (scoutModeEnabled) {
      const validScoutSelection = actionableAssignments.some(
        (assignment) =>
          assignment.matchNumber === selectedMatch.match_number && assignment.teamNumber === (selectedTeamNumber as number),
      );
      if (!validScoutSelection) {
        showToast('Scouts can only save assigned options');
        return;
      }
    }

    persist();
    if (activeProfile && scoutProfileId) {
      void markAssignmentCompleted({
        eventKey: activeProfile.eventKey,
        matchNumber: selectedMatch.match_number,
        teamNumber: selectedTeamNumber as number,
        scoutProfileId,
      });
      setAssignments((current) =>
        current.map((assignment) =>
          assignment.matchNumber === selectedMatch.match_number && assignment.teamNumber === (selectedTeamNumber as number)
            ? { ...assignment, status: 'completed', completedAt: new Date().toISOString() }
            : assignment
        )
      );
    }
    showToast(
      `Saved team ${selectedTeamNumber} for ${formatMatchLabel(selectedMatch)}`,
    );
    setSelectedTeamNumber('');
    setAutonNotes('');
    setAutonPath(null);
    setTeleopShotAttempts([]);
    setPlayedDefense(false);
    setDefenseQuality('');
    setDefenseNotes('');
    setNotes('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-slate-300">
          Loading match list…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-rose-900/20 border border-rose-500/30 rounded-2xl p-6 text-rose-200">{error}</div>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-slate-300">
          No matches found for this event yet.
        </div>
      </div>
    );
  }

  if (scoutModeEnabled && actionableAssignments.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-slate-300">
          You have no assigned match scouting options right now. Ask an admin to assign a match/team before scouting.
        </div>
      </div>
    );
  }

  const readyToScout = selectedMatch !== null && selectedTeamNumber !== '';

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-24">

      {scoutProfileId && (
        <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 shadow-xl space-y-2">
          <h2 className="text-lg font-semibold text-white">My Assignments</h2>
          {actionableAssignments.length === 0 ? (
            <p className="text-sm text-slate-400">No assignments yet.</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-auto pr-1">
              {actionableAssignments.map((assignment) => (
                <div key={assignment.id} className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-slate-200">
                  Match {assignment.matchNumber}, Team {assignment.teamNumber} ({assignment.status})
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Match & Team Setup ─────────────────────────────────────── */}
      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
        <h2 className="text-2xl font-bold text-white">Match Setup</h2>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Match</label>
          <select
            value={selectedMatchKey}
            onChange={(e) => setSelectedMatchKey(e.target.value)}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500"
          >
            {availableMatches.map((m) => (
              <option key={m.key} value={m.key}>
                {formatMatchLabel(m)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Team</label>
          <select
            value={selectedTeamNumber}
            onChange={(e) =>
              setSelectedTeamNumber(e.target.value ? parseInt(e.target.value, 10) : '')
            }
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Select a team —</option>
            {teamOptions.map((t) => (
              <option key={t.teamNumber} value={t.teamNumber}>
                {t.teamNumber} – {teamNameByNumber.get(t.teamNumber) || 'Unknown'} ({t.alliance})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Autonomous ─────────────────────────────────────────────── */}
      <div
        className={`bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6 transition-opacity ${
          readyToScout ? 'opacity-100' : 'opacity-40 pointer-events-none'
        }`}
      >
        <h2 className="text-2xl font-bold text-white">Autonomous</h2>

        <AutonPathField
          instanceId={`auton-${selectedMatchKey}-${selectedTeamNumber || 'none'}`}
          mode="record"
          allianceColor={getAllianceColor()}
          value={autonPath}
          enableTeleopShotMap
          teleopShotAttempts={teleopShotAttempts}
          onTeleopShotAttemptsChange={(next) => {
            console.info('[EventMatchScouting] Persisting teleop shots', {
              matchKey: selectedMatch?.key || null,
              teamNumber: selectedTeamNumber || null,
              shotCount: next.length,
            });
            setTeleopShotAttempts(next);
            persist({ teleopShotAttempts: next });
          }}
          onChange={(next) => {
            console.info('[EventMatchScouting] Persisting auton path', {
              matchKey: selectedMatch?.key || null,
              teamNumber: selectedTeamNumber || null,
              points: next?.trajectoryPoints.length || 0,
              durationMs: next?.durationMs || null,
            });
            setAutonPath(next);
            persist({ autonPath: next });
          }}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">
            What did they do in auto?
          </label>
          <textarea
            value={autonNotes}
            onChange={(e) => {
              setAutonNotes(e.target.value);
              persist({ autonNotes: e.target.value });
            }}
            placeholder="Describe autonomous actions…"
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 min-h-[100px] resize-y"
          />
        </div>
      </div>

      {/* ── Defense ────────────────────────────────────────────────── */}
      <div
        className={`bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6 transition-opacity ${
          readyToScout ? 'opacity-100' : 'opacity-40 pointer-events-none'
        }`}
      >
        <h2 className="text-2xl font-bold text-white">Defense</h2>

        <Toggle
          label="Played Defense?"
          value={playedDefense}
          onChange={(v) => {
            setPlayedDefense(v);
            persist({ playedDefense: v });
          }}
        />

        {playedDefense && (
          <div className="space-y-4">
            <MultiToggle<DefenseQuality>
              label="Defense Quality"
              options={['Good', 'Bad']}
              value={defenseQuality}
              onChange={(v) => {
                setDefenseQuality(v);
                persist({ defenseQuality: v });
              }}
            />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">
                Describe their defense (include if it was good or bad)
              </label>
              <textarea
                value={defenseNotes}
                onChange={(e) => {
                  setDefenseNotes(e.target.value);
                  persist({ defenseNotes: e.target.value });
                }}
                placeholder="Example: Good lane denial and smart pin timing, or bad positioning and missed assignments..."
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 min-h-[100px] resize-y"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Notes ──────────────────────────────────────────────────── */}
      <div
        className={`bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6 transition-opacity ${
          readyToScout ? 'opacity-100' : 'opacity-40 pointer-events-none'
        }`}
      >
        <h2 className="text-2xl font-bold text-white">Notes</h2>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Additional notes</label>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              persist({ notes: e.target.value });
            }}
            placeholder="Any other observations…"
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y"
          />
        </div>
      </div>

      {/* ── Save button ─────────────────────────────────────────────── */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          disabled={!readyToScout}
          className="flex items-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors shadow-lg shadow-emerald-600/20 w-full sm:w-auto justify-center text-lg"
        >
          <Save className="w-6 h-6" />
          Save & Next
        </button>
      </div>
    </div>
  );
}
