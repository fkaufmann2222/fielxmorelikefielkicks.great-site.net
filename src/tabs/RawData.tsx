import React, { useEffect, useMemo, useState } from 'react';
import { storage } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { SyncRecord } from '../types';
import { statbotics, StatboticsTeamEvent } from '../lib/statbotics';
import { getProfileTeams } from '../lib/competitionProfiles';

type RawEntryType = 'pit' | 'match';

type MetricKey = 'total_points' | 'auto_points' | 'teleop_points' | 'endgame_points';

type RawEntry = {
  key: string;
  type: RawEntryType;
  teamNumber: number | string;
  matchNumber?: number | string;
  updatedAt: number;
  source: 'local' | 'remote';
  payload: unknown;
};

type TeamYearPoint = {
  matchLabel: string;
  order: number;
  total_points: number;
  auto_points: number;
  teleop_points: number;
  endgame_points: number;
};

type EventTeam = {
  teamNumber: number;
  nickname: string;
  stats: StatboticsTeamEvent | null;
};

type SupabaseRow = {
  data: unknown;
  team_number?: number | null;
  match_number?: number | null;
  updated_at?: string;
};

function normalizePayload(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function pickFirstNumber(data: unknown, keys: string[]): number | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  for (const key of keys) {
    const parts = key.split('.');
    let current: unknown = data;

    for (const part of parts) {
      if (typeof current !== 'object' || current === null) {
        current = null;
        break;
      }

      current = (current as Record<string, unknown>)[part];
    }

    const parsed = toNumber(current);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function extractTeamNumber(team: StatboticsTeamEvent): number | null {
  const parsed = toNumber(team.team_number ?? team.team);
  if (!parsed || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function extractNickname(team: StatboticsTeamEvent, fallbackTeamNumber: number): string {
  const nickname =
    (typeof team.nickname === 'string' && team.nickname.trim()) ||
    (typeof team.name === 'string' && team.name.trim()) ||
    (typeof team.team_name === 'string' && team.team_name.trim()) ||
    '';

  return nickname || `Team ${fallbackTeamNumber}`;
}

function extractYearRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;
  if (Array.isArray(objectPayload.data)) {
    return objectPayload.data.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  if (Array.isArray(objectPayload.years)) {
    return objectPayload.years.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
  }

  return [];
}

function toMatchLabel(row: Record<string, unknown>, fallbackIndex: number): string {
  const directMatchNumber = toNumber(row.match_number);
  if (directMatchNumber !== null) {
    return `M${directMatchNumber}`;
  }

  const matchObject = row.match;
  if (matchObject && typeof matchObject === 'object') {
    const objectMatchNumber = toNumber((matchObject as Record<string, unknown>).match_number);
    if (objectMatchNumber !== null) {
      const compLevel = (matchObject as Record<string, unknown>).comp_level;
      if (typeof compLevel === 'string' && compLevel.trim()) {
        return `${compLevel.toUpperCase()} ${objectMatchNumber}`;
      }
      return `M${objectMatchNumber}`;
    }

    const key = (matchObject as Record<string, unknown>).key;
    if (typeof key === 'string' && key.trim()) {
      return key;
    }
  }

  const key = row.key;
  if (typeof key === 'string' && key.trim()) {
    return key;
  }

  return `Match ${fallbackIndex + 1}`;
}

function metricValue(point: TeamYearPoint, key: MetricKey): number {
  return point[key];
}

const METRIC_META: Record<MetricKey, { label: string; color: string }> = {
  total_points: { label: 'Total EPA (unitless)', color: '#60a5fa' },
  auto_points: { label: 'Auto', color: '#34d399' },
  teleop_points: { label: 'Teleop', color: '#f59e0b' },
  endgame_points: { label: 'Endgame', color: '#f472b6' },
};

type RawDataProps = {
  eventKey: string;
  profileId: string | null;
};

export function RawData({ eventKey, profileId }: RawDataProps) {
  const [entries, setEntries] = useState<RawEntry[]>([]);
  const [eventTeams, setEventTeams] = useState<EventTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [teamYears, setTeamYears] = useState<TeamYearPoint[]>([]);
  const [isLoadingYears, setIsLoadingYears] = useState(false);
  const [yearError, setYearError] = useState<string | null>(null);
  const [visibleMetrics, setVisibleMetrics] = useState<Record<MetricKey, boolean>>({
    total_points: true,
    auto_points: true,
    teleop_points: true,
    endgame_points: true,
  });

  useEffect(() => {
    const loadData = async () => {
      const localPitEntries = storage
        .getAllKeys()
        .filter((key) => key.startsWith('pitScout:'))
        .map((key) => storage.get<SyncRecord<any>>(key))
        .filter(Boolean)
        .map((record) => ({
          key: `pit:${record!.data?.teamNumber}`,
          type: 'pit' as const,
          teamNumber: record!.data?.teamNumber ?? 'Unknown',
          updatedAt: record!.timestamp || 0,
          source: 'local' as const,
          payload: record!.data,
        }));

      const localMatchEntries = storage
        .getAllKeys()
        .filter((key) => key.startsWith('matchScout:'))
        .map((key) => storage.get<SyncRecord<any>>(key))
        .filter(Boolean)
        .map((record) => ({
          key: `match:${record!.data?.matchNumber}:${record!.data?.teamNumber}`,
          type: 'match' as const,
          teamNumber: record!.data?.teamNumber ?? 'Unknown',
          matchNumber: record!.data?.matchNumber ?? 'Unknown',
          updatedAt: record!.timestamp || 0,
          source: 'local' as const,
          payload: record!.data,
        }));

      const [pitResult, matchResult] = await Promise.all([
        supabase.from('pit_scouts').select('team_number, data, updated_at'),
        supabase.from('match_scouts').select('match_number, team_number, data, updated_at'),
      ]);

      const remotePitEntries: RawEntry[] = pitResult.error
        ? []
        : ((pitResult.data || []) as SupabaseRow[]).map((row) => {
            const payload = normalizePayload(row.data) as any;
            const teamNumber = row.team_number ?? payload?.teamNumber ?? 'Unknown';
            return {
              key: `pit:${teamNumber}`,
              type: 'pit',
              teamNumber,
              updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
              source: 'remote',
              payload,
            };
          });

      const remoteMatchEntries: RawEntry[] = matchResult.error
        ? []
        : ((matchResult.data || []) as SupabaseRow[]).map((row) => {
            const payload = normalizePayload(row.data) as any;
            const matchNumber = row.match_number ?? payload?.matchNumber ?? 'Unknown';
            const teamNumber = row.team_number ?? payload?.teamNumber ?? 'Unknown';
            return {
              key: `match:${matchNumber}:${teamNumber}`,
              type: 'match',
              teamNumber,
              matchNumber,
              updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
              source: 'remote',
              payload,
            };
          });

      const merged = new Map<string, RawEntry>();
      [...localPitEntries, ...remotePitEntries, ...localMatchEntries, ...remoteMatchEntries].forEach((entry) => {
        const existing = merged.get(entry.key);
        if (!existing || entry.updatedAt >= existing.updatedAt) {
          merged.set(entry.key, entry);
        }
      });

      const sorted = Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      setEntries(sorted);
    };

    loadData();

    const refresh = () => {
      loadData();
    };

    window.addEventListener('sync-success', refresh);
    window.addEventListener('team-import-success', refresh);
    window.addEventListener('storage', refresh);

    return () => {
      window.removeEventListener('sync-success', refresh);
      window.removeEventListener('team-import-success', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (!eventKey) {
      setEventTeams([]);
      setSelectedTeam(null);
      setTeamsError('Select an event profile in Home to view teams.');
      return;
    }

    let cancelled = false;

    const loadTeams = async () => {
      setIsLoadingTeams(true);
      setTeamsError(null);

      try {
        const statboticsRows = await statbotics.fetchEventTeams(eventKey);
        const mapped = new Map<number, EventTeam>();

        if (Array.isArray(statboticsRows)) {
          statboticsRows.forEach((row) => {
            const teamNumber = extractTeamNumber(row);
            if (!teamNumber) {
              return;
            }

            mapped.set(teamNumber, {
              teamNumber,
              nickname: extractNickname(row, teamNumber),
              stats: row,
            });
          });
        }

        if (mapped.size === 0 && profileId) {
          const fallbackTeams = getProfileTeams(profileId);
          fallbackTeams.forEach((team) => {
            if (!team?.team_number) {
              return;
            }
            mapped.set(team.team_number, {
              teamNumber: team.team_number,
              nickname: team.nickname || team.name || `Team ${team.team_number}`,
              stats: null,
            });
          });
        }

        const list = Array.from(mapped.values()).sort((a, b) => a.teamNumber - b.teamNumber);

        if (!cancelled) {
          setEventTeams(list);
          if (list.length === 0) {
            setSelectedTeam(null);
            setTeamsError('No teams found for this event.');
          } else {
            setSelectedTeam((prev) => {
              if (prev && list.some((team) => team.teamNumber === prev)) {
                return prev;
              }
              return list[0].teamNumber;
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          setTeamsError(error instanceof Error ? error.message : 'Failed to load event teams');
          setEventTeams([]);
          setSelectedTeam(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTeams(false);
        }
      }
    };

    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [eventKey, profileId]);

  useEffect(() => {
    if (!selectedTeam || !eventKey) {
      setTeamYears([]);
      setYearError(null);
      return;
    }

    let cancelled = false;

    const loadTeamYears = async () => {
      setIsLoadingYears(true);
      setYearError(null);

      try {
        const response = await fetch(`/api/statbotics/team_matches?team=${selectedTeam}&event=${encodeURIComponent(eventKey)}`);
        if (!response.ok) {
          throw new Error(`Statbotics team matches request failed (${response.status})`);
        }

        const payload = await response.json();
        const rows = extractYearRows(payload);
        const parsed = rows
          .map((row, index) => {
            return {
              matchLabel: toMatchLabel(row, index),
              order: index,
              total_points: pickFirstNumber(row, [
                'epa.breakdown.total_points',
                'epa.total_points.mean',
                'epa.total_points',
                'norm_epa',
                'total_points',
              ]) ?? 0,
              auto_points: pickFirstNumber(row, ['epa.breakdown.auto_points', 'epa.auto_points', 'auto_points']) ?? 0,
              teleop_points: pickFirstNumber(row, ['epa.breakdown.teleop_points', 'epa.teleop_points', 'teleop_points']) ?? 0,
              endgame_points: pickFirstNumber(row, ['epa.breakdown.endgame_points', 'epa.endgame_points', 'endgame_points']) ?? 0,
            } as TeamYearPoint;
          })
          .filter((row) => {
            return row.total_points !== 0 || row.auto_points !== 0 || row.teleop_points !== 0 || row.endgame_points !== 0;
          });

        if (!cancelled) {
          setTeamYears(parsed);
        }
      } catch (error) {
        if (!cancelled) {
          setYearError(error instanceof Error ? error.message : 'Failed to load team years');
          setTeamYears([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingYears(false);
        }
      }
    };

    loadTeamYears();

    return () => {
      cancelled = true;
    };
  }, [selectedTeam, eventKey]);

  const counts = useMemo(() => {
    const pit = entries.filter((e) => e.type === 'pit').length;
    const match = entries.filter((e) => e.type === 'match').length;
    return { pit, match, total: entries.length };
  }, [entries]);

  const filteredTeams = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return eventTeams;
    }

    return eventTeams.filter((team) => {
      return (
        String(team.teamNumber).includes(query) ||
        team.nickname.toLowerCase().includes(query)
      );
    });
  }, [eventTeams, search]);

  const selectedTeamEntry = useMemo(
    () => eventTeams.find((team) => team.teamNumber === selectedTeam) || null,
    [eventTeams, selectedTeam],
  );

  const selectedTeamScouting = useMemo(() => {
    if (!selectedTeam) {
      return { pit: [] as RawEntry[], match: [] as RawEntry[] };
    }

    const pit = entries
      .filter((entry) => entry.type === 'pit' && Number(entry.teamNumber) === selectedTeam)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const match = entries
      .filter((entry) => entry.type === 'match' && Number(entry.teamNumber) === selectedTeam)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    return { pit, match };
  }, [entries, selectedTeam]);

  const activeMetricKeys = useMemo(
    () => (Object.keys(visibleMetrics) as MetricKey[]).filter((key) => visibleMetrics[key]),
    [visibleMetrics],
  );

  const graphData = useMemo(() => {
    if (teamYears.length === 0 || activeMetricKeys.length === 0) {
      return {
        series: {} as Record<MetricKey, string>,
        labels: [] as TeamYearPoint[],
      };
    }

    const width = 720;
    const height = 300;
    const padX = 48;
    const padY = 26;

    const allValues = teamYears.flatMap((point) => activeMetricKeys.map((metric) => metricValue(point, metric)));
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const spread = Math.max(1, maxVal - minVal);

    const xForIndex = (index: number) => {
      if (teamYears.length === 1) {
        return width / 2;
      }
      return padX + (index / (teamYears.length - 1)) * (width - padX * 2);
    };

    const yForValue = (value: number) => {
      const ratio = (value - minVal) / spread;
      return height - padY - ratio * (height - padY * 2);
    };

    const series = {} as Record<MetricKey, string>;

    activeMetricKeys.forEach((metric) => {
      const points = teamYears.map((point, index) => {
        const x = xForIndex(index);
        const y = yForValue(metricValue(point, metric));
        return `${x},${y}`;
      });
      series[metric] = points.join(' ');
    });

    return { series, labels: teamYears };
  }, [teamYears, activeMetricKeys]);

  const toggleMetric = (metric: MetricKey) => {
    setVisibleMetrics((previous) => ({
      ...previous,
      [metric]: !previous[metric],
    }));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 px-4">
      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl">
        <h2 className="text-2xl font-bold text-white">Event Teams + Scouting Data</h2>
        <p className="text-slate-400 mt-2">
          Search teams from the selected event, open a team, and view Statbotics EPA trends with all scouting records.
        </p>
        <div className="mt-4 text-sm text-slate-300 flex flex-wrap gap-4">
          <span>Event: <span className="font-mono uppercase">{eventKey || 'none'}</span></span>
          <span>Teams: {eventTeams.length}</span>
          <span>Scouting Records: {counts.total}</span>
          <span>Pit: {counts.pit}</span>
          <span>Match: {counts.match}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
            {isLoadingTeams && (
              <div className="text-sm text-slate-400">Loading event teams...</div>
            )}
            {!isLoadingTeams && teamsError && (
              <div className="text-sm text-rose-300">{teamsError}</div>
            )}
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

        <div className="space-y-6 lg:col-span-2">
          {!selectedTeamEntry ? (
            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl text-slate-400">
              Select a team to view EPA and scouting details.
            </div>
          ) : (
            <>
              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl">
                <h3 className="text-xl font-bold text-white">Team {selectedTeamEntry.teamNumber}</h3>
                <p className="text-slate-400 mt-1">{selectedTeamEntry.nickname}</p>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                    <p className="text-xs text-slate-400">Total EPA (event)</p>
                    <p className="text-lg font-mono text-white">
                      {selectedTeamEntry.stats?.epa?.total_points?.toFixed?.(2) ?? 'N/A'}
                    </p>
                  </div>
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                    <p className="text-xs text-slate-400">Auto</p>
                    <p className="text-lg font-mono text-white">
                      {selectedTeamEntry.stats?.epa?.auto_points?.toFixed?.(2) ?? 'N/A'}
                    </p>
                  </div>
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                    <p className="text-xs text-slate-400">Teleop</p>
                    <p className="text-lg font-mono text-white">
                      {selectedTeamEntry.stats?.epa?.teleop_points?.toFixed?.(2) ?? 'N/A'}
                    </p>
                  </div>
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                    <p className="text-xs text-slate-400">Endgame</p>
                    <p className="text-lg font-mono text-white">
                      {selectedTeamEntry.stats?.epa?.endgame_points?.toFixed?.(2) ?? 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {(Object.keys(METRIC_META) as MetricKey[]).map((metric) => (
                    <button
                      key={metric}
                      onClick={() => toggleMetric(metric)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        visibleMetrics[metric]
                          ? 'bg-slate-700 border-slate-500 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      {METRIC_META[metric].label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 bg-slate-900 border border-slate-700 rounded-xl p-3 overflow-x-auto">
                  {isLoadingYears && <div className="text-sm text-slate-400 p-3">Loading EPA trend...</div>}
                  {!isLoadingYears && yearError && <div className="text-sm text-rose-300 p-3">{yearError}</div>}
                  {!isLoadingYears && !yearError && teamYears.length === 0 && (
                    <div className="text-sm text-slate-400 p-3">No match-level event EPA data found for this team.</div>
                  )}
                  {!isLoadingYears && !yearError && teamYears.length > 0 && activeMetricKeys.length === 0 && (
                    <div className="text-sm text-slate-400 p-3">Enable at least one metric to draw the graph.</div>
                  )}
                  {!isLoadingYears && !yearError && teamYears.length > 0 && activeMetricKeys.length > 0 && (
                    <svg viewBox="0 0 720 300" className="w-full min-w-[640px] h-[300px]">
                      <line x1="48" y1="26" x2="48" y2="274" stroke="#334155" strokeWidth="1" />
                      <line x1="48" y1="274" x2="672" y2="274" stroke="#334155" strokeWidth="1" />

                      {activeMetricKeys.map((metric) => (
                        <polyline
                          key={metric}
                          fill="none"
                          stroke={METRIC_META[metric].color}
                          strokeWidth="2.5"
                          points={graphData.series[metric]}
                        />
                      ))}

                      {graphData.labels.map((point, index) => {
                        const x = graphData.labels.length === 1
                          ? 360
                          : 48 + (index / (graphData.labels.length - 1)) * (720 - 96);

                        const showTick = graphData.labels.length <= 12 || index === 0 || index === graphData.labels.length - 1 || index % 2 === 0;
                        if (!showTick) {
                          return null;
                        }

                        return (
                          <g key={`${point.matchLabel}-${index}`}>
                            <line x1={x} y1="274" x2={x} y2="278" stroke="#64748b" strokeWidth="1" />
                            <text x={x} y="292" fill="#94a3b8" fontSize="11" textAnchor="middle">
                              {point.matchLabel}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  {activeMetricKeys.map((metric) => (
                    <div key={metric} className="flex items-center gap-2 text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: METRIC_META[metric].color }} />
                      {METRIC_META[metric].label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl">
                <h3 className="text-xl font-bold text-white">Scouting Data</h3>
                <p className="text-slate-400 mt-1">
                  Showing all saved scouting records for team {selectedTeamEntry.teamNumber}.
                </p>

                <div className="mt-4 text-sm text-slate-300 flex flex-wrap gap-4">
                  <span>Pit records: {selectedTeamScouting.pit.length}</span>
                  <span>Match records: {selectedTeamScouting.match.length}</span>
                </div>

                <div className="mt-4 space-y-3">
                  {selectedTeamScouting.pit.length === 0 && selectedTeamScouting.match.length === 0 && (
                    <div className="text-sm text-slate-400">No scouting data saved for this team yet.</div>
                  )}

                  {selectedTeamScouting.pit.map((entry) => (
                    <div key={entry.key} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
                        <span className="px-2 py-1 rounded bg-slate-700 text-slate-200 uppercase">pit</span>
                        <span className="text-slate-500">Source: {entry.source}</span>
                        <span className="text-slate-500">Updated: {entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : 'Unknown'}</span>
                      </div>
                      <pre className="text-xs text-slate-200 bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-auto">
                        {JSON.stringify(entry.payload, null, 2)}
                      </pre>
                    </div>
                  ))}

                  {selectedTeamScouting.match.map((entry) => (
                    <div key={entry.key} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
                        <span className="px-2 py-1 rounded bg-slate-700 text-slate-200 uppercase">match</span>
                        <span className="text-slate-300 font-mono">Match {entry.matchNumber}</span>
                        <span className="text-slate-500">Source: {entry.source}</span>
                        <span className="text-slate-500">Updated: {entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : 'Unknown'}</span>
                      </div>
                      <pre className="text-xs text-slate-200 bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-auto">
                        {JSON.stringify(entry.payload, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
