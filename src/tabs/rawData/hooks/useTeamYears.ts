import { useEffect, useRef, useState } from 'react';
import { RawDataScope, TeamYearPoint } from '../types';
import { extractYearRows, pickFirstNumber, toMatchLabel, toNumber } from '../utils';

type UseTeamYearsArgs = {
  scope: RawDataScope;
  isGlobalScope: boolean;
  activeEventKey: string;
  activeSeasonYear: number | null;
  selectedTeam: number | null;
};

type UseTeamYearsResult = {
  teamYears: TeamYearPoint[];
  isLoadingYears: boolean;
  yearError: string | null;
};

export function useTeamYears({
  scope,
  isGlobalScope,
  activeEventKey,
  activeSeasonYear,
  selectedTeam,
}: UseTeamYearsArgs): UseTeamYearsResult {
  const [teamYears, setTeamYears] = useState<TeamYearPoint[]>([]);
  const [isLoadingYears, setIsLoadingYears] = useState(false);
  const [yearError, setYearError] = useState<string | null>(null);

  const teamYearsCacheRef = useRef<Map<string, TeamYearPoint[]>>(new Map());
  const teamYearsInFlightRef = useRef<Map<string, Promise<TeamYearPoint[]>>>(new Map());

  useEffect(() => {
    if (!selectedTeam || (!isGlobalScope && !activeEventKey)) {
      setTeamYears([]);
      setYearError(null);
      return;
    }

    let cancelled = false;

    const loadTeamYears = async () => {
      setIsLoadingYears(true);
      setYearError(null);

      try {
        const cacheKey = `${scope}:${isGlobalScope ? activeSeasonYear ?? 'global' : activeEventKey}:${selectedTeam}`;
        const cached = teamYearsCacheRef.current.get(cacheKey);
        if (cached) {
          if (!cancelled) {
            setTeamYears(cached);
            setIsLoadingYears(false);
          }
          return;
        }

        const inFlight = teamYearsInFlightRef.current.get(cacheKey);
        if (inFlight) {
          const dedupedRows = await inFlight;
          if (!cancelled) {
            setTeamYears(dedupedRows);
            setIsLoadingYears(false);
          }
          return;
        }

        const params = new URLSearchParams({ team: String(selectedTeam) });
        if (isGlobalScope) {
          if (activeSeasonYear) {
            params.set('year', String(activeSeasonYear));
          }
        } else {
          params.set('eventKey', activeEventKey);
        }

        const parseRows = (rows: Record<string, unknown>[]): TeamYearPoint[] => {
          return rows
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
        };

        const fetchRows = async (): Promise<TeamYearPoint[]> => {
          let parsed: TeamYearPoint[] = [];

          try {
            const matchesResponse = await fetch(`/api/statbotics/team_matches?${params.toString()}`);
            if (matchesResponse.ok) {
              const payload = await matchesResponse.json();
              parsed = parseRows(extractYearRows(payload));
            }
          } catch {
            // Fall through to year-level fallback.
          }

          if (parsed.length === 0 && isGlobalScope) {
            try {
              const yearsResponse = await fetch(`/api/statbotics/team_years?team=${selectedTeam}`);
              if (yearsResponse.ok) {
                const yearsPayload = await yearsResponse.json();
                const yearRows = extractYearRows(yearsPayload);
                const selectedYearRow = activeSeasonYear ? yearRows.find((row) => toNumber(row.year) === activeSeasonYear) : null;
                const fallbackRow = selectedYearRow || yearRows.sort((a, b) => (toNumber(b.year) || 0) - (toNumber(a.year) || 0))[0];
                const fallbackYear = toNumber(fallbackRow?.year);

                if (fallbackRow && fallbackYear) {
                  parsed = [
                    {
                      matchLabel: `Season ${fallbackYear}`,
                      order: 0,
                      total_points: pickFirstNumber(fallbackRow, [
                        'epa.breakdown.total_points',
                        'epa.total_points.mean',
                        'epa.total_points',
                        'norm_epa',
                        'total_points',
                      ]) ?? 0,
                      auto_points: pickFirstNumber(fallbackRow, ['epa.breakdown.auto_points', 'epa.auto_points', 'auto_points']) ?? 0,
                      teleop_points: pickFirstNumber(fallbackRow, ['epa.breakdown.teleop_points', 'epa.teleop_points', 'teleop_points']) ?? 0,
                      endgame_points: pickFirstNumber(fallbackRow, ['epa.breakdown.endgame_points', 'epa.endgame_points', 'endgame_points']) ?? 0,
                    },
                  ];
                }
              }
            } catch {
              // Ignore and return empty parsed rows.
            }
          }

          return parsed;
        };

        const request = fetchRows().finally(() => {
          teamYearsInFlightRef.current.delete(cacheKey);
        });

        teamYearsInFlightRef.current.set(cacheKey, request);
        const parsed = await request;
        teamYearsCacheRef.current.set(cacheKey, parsed);

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

    void loadTeamYears();

    return () => {
      cancelled = true;
    };
  }, [activeEventKey, activeSeasonYear, isGlobalScope, scope, selectedTeam]);

  return {
    teamYears,
    isLoadingYears,
    yearError,
  };
}
