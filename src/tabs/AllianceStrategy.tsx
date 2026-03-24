import React, { useEffect, useMemo, useRef, useState } from 'react';

type LockedAlliance = 'blue' | 'red';

type TeamSeasonEPA = {
  teamNumber: number;
  teamName: string;
  year: number;
  total: number;
  auto: number;
  teleop: number;
  endgame: number;
};

type TeamFetchState = {
  status: 'loading' | 'ready' | 'error';
  year: number;
  data?: TeamSeasonEPA;
  error?: string;
};

type AllianceTotals = {
  total: number;
  auto: number;
  teleop: number;
  endgame: number;
  readyCount: number;
  missingCount: number;
};

const LOCKED_TEAM_NUMBER = 423;

function parseEventYear(eventKey: string): number | null {
  const match = eventKey.trim().match(/^(\d{4})/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  if (!Number.isInteger(year) || year < 1992 || year > 2100) {
    return null;
  }

  return year;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function pickNumber(source: unknown, paths: string[]): number | null {
  if (!source || typeof source !== 'object') {
    return null;
  }

  for (const path of paths) {
    const parts = path.split('.');
    let current: unknown = source;

    for (const part of parts) {
      if (!current || typeof current !== 'object') {
        current = null;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }

    const parsed = toFiniteNumber(current);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function normalizeTeamInput(raw: string): string {
  return raw.replace(/[^\d]/g, '').slice(0, 5);
}

function parseTeamNumber(raw: string): number | null {
  if (!raw.trim()) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function extractTeamYearRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;

  if (Array.isArray(objectPayload.data)) {
    return objectPayload.data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');
  }

  if (Array.isArray(objectPayload.years)) {
    return objectPayload.years.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');
  }

  return Object.values(objectPayload).filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');
}

async function fetchTeamSeasonEPA(teamNumber: number, year: number): Promise<TeamSeasonEPA> {
  const [teamRes, yearsRes] = await Promise.all([
    fetch(`/api/statbotics/team/${teamNumber}`),
    fetch(`/api/statbotics/team_years?team=${teamNumber}`),
  ]);

  if (!teamRes.ok) {
    throw new Error(`Team ${teamNumber} not found`);
  }

  if (!yearsRes.ok) {
    throw new Error(`No yearly Statbotics data for team ${teamNumber}`);
  }

  const teamJson = (await teamRes.json()) as Record<string, unknown>;
  const yearsJson = await yearsRes.json();

  const yearRows = extractTeamYearRows(yearsJson);
  const yearRow = yearRows.find((row) => toFiniteNumber(row.year) === year);

  if (!yearRow) {
    throw new Error(`No ${year} season data for team ${teamNumber}`);
  }

  const total = pickNumber(yearRow, [
    'epa.total_points.mean',
    'epa.breakdown.total_points',
    'epa.total_points',
    'norm_epa',
    'epa_mean',
    'epa.mean',
  ]) ?? 0;

  const auto = pickNumber(yearRow, [
    'epa.breakdown.auto_points',
    'epa.auto_points',
    'auto_epa',
  ]) ?? 0;

  const teleop = pickNumber(yearRow, [
    'epa.breakdown.teleop_points',
    'epa.breakdown.teleoppoints',
    'epa.teleop_points',
    'teleop_epa',
  ]) ?? 0;

  const endgame = pickNumber(yearRow, [
    'epa.breakdown.endgame_points',
    'epa.endgame_points',
    'endgame_epa',
  ]) ?? 0;

  return {
    teamNumber,
    teamName: String(teamJson.nickname || teamJson.name || `Team ${teamNumber}`),
    year,
    total,
    auto,
    teleop,
    endgame,
  };
}

type AllianceStrategyProps = {
  eventKey: string;
};

export function AllianceStrategy({ eventKey }: AllianceStrategyProps) {
  const [lockedAlliance, setLockedAlliance] = useState<LockedAlliance>('blue');
  const [blueInputs, setBlueInputs] = useState<string[]>(['', '', '']);
  const [redInputs, setRedInputs] = useState<string[]>(['', '', '']);
  const [teamStates, setTeamStates] = useState<Record<number, TeamFetchState>>({});

  const eventYear = useMemo(() => parseEventYear(eventKey), [eventKey]);
  const teamStatesRef = useRef(teamStates);

  useEffect(() => {
    teamStatesRef.current = teamStates;
  }, [teamStates]);

  const blueTeams = useMemo(() => {
    const parsed = blueInputs.map(parseTeamNumber).filter((team): team is number => team !== null);
    const deduped = Array.from(new Set(parsed.filter((team) => team !== LOCKED_TEAM_NUMBER)));
    if (lockedAlliance === 'blue') {
      return [LOCKED_TEAM_NUMBER, ...deduped.slice(0, 2)];
    }
    return deduped.slice(0, 3);
  }, [blueInputs, lockedAlliance]);

  const redTeams = useMemo(() => {
    const parsed = redInputs.map(parseTeamNumber).filter((team): team is number => team !== null);
    const deduped = Array.from(new Set(parsed.filter((team) => team !== LOCKED_TEAM_NUMBER)));
    if (lockedAlliance === 'red') {
      return [LOCKED_TEAM_NUMBER, ...deduped.slice(0, 2)];
    }
    return deduped.slice(0, 3);
  }, [redInputs, lockedAlliance]);

  const requestedTeams = useMemo(
    () => Array.from(new Set([...blueTeams, ...redTeams])),
    [blueTeams, redTeams],
  );

  useEffect(() => {
    if (!eventYear) {
      return;
    }

    let cancelled = false;

    requestedTeams.forEach((teamNumber) => {
      const current = teamStatesRef.current[teamNumber];
      if (current && current.year === eventYear && (current.status === 'loading' || current.status === 'ready')) {
        return;
      }

      setTeamStates((previous) => ({
        ...previous,
        [teamNumber]: {
          status: 'loading',
          year: eventYear,
        },
      }));

      fetchTeamSeasonEPA(teamNumber, eventYear)
        .then((data) => {
          if (cancelled) {
            return;
          }

          setTeamStates((previous) => ({
            ...previous,
            [teamNumber]: {
              status: 'ready',
              year: eventYear,
              data,
            },
          }));
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          setTeamStates((previous) => ({
            ...previous,
            [teamNumber]: {
              status: 'error',
              year: eventYear,
              error: error instanceof Error ? error.message : 'Failed to fetch team data',
            },
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [eventYear, requestedTeams]);

  const updateTeamInput = (alliance: LockedAlliance, index: number, value: string) => {
    const sanitized = normalizeTeamInput(value);
    if (alliance === 'blue') {
      setBlueInputs((previous) => previous.map((item, itemIndex) => (itemIndex === index ? sanitized : item)));
      return;
    }

    setRedInputs((previous) => previous.map((item, itemIndex) => (itemIndex === index ? sanitized : item)));
  };

  const getAllianceTotals = (teams: number[]): AllianceTotals => {
    return teams.reduce<AllianceTotals>((accumulator, teamNumber) => {
      const state = teamStates[teamNumber];
      if (state?.status !== 'ready' || !state.data) {
        return {
          ...accumulator,
          missingCount: accumulator.missingCount + 1,
        };
      }

      return {
        total: accumulator.total + state.data.total,
        auto: accumulator.auto + state.data.auto,
        teleop: accumulator.teleop + state.data.teleop,
        endgame: accumulator.endgame + state.data.endgame,
        readyCount: accumulator.readyCount + 1,
        missingCount: accumulator.missingCount,
      };
    }, {
      total: 0,
      auto: 0,
      teleop: 0,
      endgame: 0,
      readyCount: 0,
      missingCount: 0,
    });
  };

  const blueTotals = getAllianceTotals(blueTeams);
  const redTotals = getAllianceTotals(redTeams);

  const renderTeamSlot = (alliance: LockedAlliance, slotIndex: number) => {
    const isLockedSlot = alliance === lockedAlliance && slotIndex === 0;
    const isBlue = alliance === 'blue';
    const borderClass = isBlue ? 'border-blue-500/40' : 'border-red-500/40';

    let teamNumber: number | null = null;
    let inputValue = '';
    let inputIndex = slotIndex;

    if (isLockedSlot) {
      teamNumber = LOCKED_TEAM_NUMBER;
    } else {
      inputIndex = alliance === lockedAlliance ? slotIndex - 1 : slotIndex;
      const listValue = alliance === 'blue' ? blueInputs[inputIndex] : redInputs[inputIndex];
      inputValue = listValue || '';
      teamNumber = parseTeamNumber(inputValue);
    }

    const teamState = teamNumber ? teamStates[teamNumber] : null;
    const teamData = teamState?.status === 'ready' ? teamState.data : null;

    return (
      <div key={`${alliance}-${slotIndex}`} className={`rounded-2xl border bg-slate-800/50 p-4 shadow-xl ${borderClass}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-wide text-slate-400">{alliance} slot {slotIndex + 1}</span>
          {isLockedSlot && <span className="text-[11px] px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300">Locked</span>}
        </div>

        {isLockedSlot ? (
          <div className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-lg text-white">
            {LOCKED_TEAM_NUMBER}
          </div>
        ) : (
          <input
            type="text"
            value={inputValue}
            onChange={(event) => updateTeamInput(alliance, inputIndex, event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Team #"
            inputMode="numeric"
          />
        )}

        <div className="mt-3 text-xs text-slate-400 min-h-[20px]">
          {!teamNumber && 'Enter a team number'}
          {teamNumber && teamState?.status === 'loading' && `Loading ${eventYear || ''} EPA...`}
          {teamNumber && teamState?.status === 'error' && <span className="text-rose-300">{teamState.error}</span>}
          {teamData && (
            <span className="text-slate-300">
              {teamData.teamName} | Total {teamData.total.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderAllianceSummary = (label: 'Blue' | 'Red', totals: AllianceTotals, teams: number[]) => {
    const isBlue = label === 'Blue';

    return (
      <div className={`rounded-2xl border bg-slate-800/50 p-5 shadow-xl ${isBlue ? 'border-blue-500/50' : 'border-red-500/50'}`}>
        <h3 className={`text-xl font-bold ${isBlue ? 'text-blue-300' : 'text-red-300'}`}>{label} Alliance EPA</h3>
        <p className="text-xs text-slate-400 mt-1">{teams.length}/3 slots filled</p>

        <div className="grid grid-cols-2 gap-4 mt-5">
          <div>
            <p className="text-xs text-slate-400">Total (unitless)</p>
            <p className="text-2xl font-mono text-white">{totals.total.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Auto</p>
            <p className="text-xl font-mono text-white">{totals.auto.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Teleop</p>
            <p className="text-xl font-mono text-white">{totals.teleop.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Endgame</p>
            <p className="text-xl font-mono text-white">{totals.endgame.toFixed(1)}</p>
          </div>
        </div>

        {totals.missingCount > 0 && (
          <p className="mt-4 text-xs text-amber-300">
            Missing data for {totals.missingCount} team{totals.missingCount > 1 ? 's' : ''}; totals include available teams only.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 px-4">
      <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6 shadow-xl">
        <h2 className="text-2xl font-bold text-white">Alliance Strategy (Statbotics)</h2>
        <p className="text-sm text-slate-400 mt-2">
          Team 423 is permanently locked into the matchup. Switch its alliance, then fill the other five teams.
        </p>
        <p className="text-sm text-slate-400">
          Active event: <span className="font-mono text-slate-200">{eventKey || 'Unknown'}</span>
          {' | '}Season year: <span className="font-mono text-slate-200">{eventYear ?? 'Unable to parse'}</span>
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-300">Team 423 alliance:</span>
          <button
            onClick={() => setLockedAlliance('blue')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              lockedAlliance === 'blue' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-300 border border-slate-700'
            }`}
          >
            Blue
          </button>
          <button
            onClick={() => setLockedAlliance('red')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              lockedAlliance === 'red' ? 'bg-red-600 text-white' : 'bg-slate-900 text-slate-300 border border-slate-700'
            }`}
          >
            Red
          </button>
        </div>
      </div>

      {!eventYear && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
          Could not derive season year from event key. Use an event key that starts with a 4-digit year (example: 2026paphi).
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-blue-300">Blue Alliance</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {[0, 1, 2].map((slotIndex) => renderTeamSlot('blue', slotIndex))}
          </div>
          {renderAllianceSummary('Blue', blueTotals, blueTeams)}
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-bold text-red-300">Red Alliance</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {[0, 1, 2].map((slotIndex) => renderTeamSlot('red', slotIndex))}
          </div>
          {renderAllianceSummary('Red', redTotals, redTeams)}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-5">
        <h3 className="text-lg font-semibold text-white">Matchup Delta</h3>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-400">Total</p>
            <p className={`text-xl font-mono ${blueTotals.total >= redTotals.total ? 'text-blue-300' : 'text-red-300'}`}>
              {(blueTotals.total - redTotals.total).toFixed(1)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Auto</p>
            <p className={`text-xl font-mono ${blueTotals.auto >= redTotals.auto ? 'text-blue-300' : 'text-red-300'}`}>
              {(blueTotals.auto - redTotals.auto).toFixed(1)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Teleop</p>
            <p className={`text-xl font-mono ${blueTotals.teleop >= redTotals.teleop ? 'text-blue-300' : 'text-red-300'}`}>
              {(blueTotals.teleop - redTotals.teleop).toFixed(1)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Endgame</p>
            <p className={`text-xl font-mono ${blueTotals.endgame >= redTotals.endgame ? 'text-blue-300' : 'text-red-300'}`}>
              {(blueTotals.endgame - redTotals.endgame).toFixed(1)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
