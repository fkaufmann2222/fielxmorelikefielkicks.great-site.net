import { useDeferredValue, useMemo } from 'react';
import { buildHeatmapBins } from '../../../lib/heatmapUtils';
import {
  AUTON_HEATMAP_COLS,
  AUTON_HEATMAP_ROWS,
  METRIC_META,
  PATH_SAMPLE_COUNT,
  STRIP_ORDER,
  TELEOP_HEATMAP_COLS,
  TELEOP_HEATMAP_ROWS,
} from '../constants';
import {
  EventTeam,
  GraphData,
  MatchNotesBundle,
  MetricKey,
  RawEntry,
  SelectedTeamAutonPath,
  SelectedTeamScouting,
  StripRunSample,
  StripSummary,
  TeamDisplay,
  TeamYearPoint,
  TeleopSummary,
} from '../types';
import {
  alignPointToAlliance,
  asAutonPathData,
  asMatchPayload,
  averagePoint,
  averageResampledPaths,
  buildMatchNotesBundle,
  buildReplayPath,
  getPayloadEventKey,
  metricValue,
  normalizePoint,
  resampleTrajectory,
  resolveStripForY,
} from '../utils';

type UseRawDataDerivedArgs = {
  entries: RawEntry[];
  eventTeams: EventTeam[];
  selectedTeam: number | null;
  search: string;
  isGlobalScope: boolean;
  activeEventKey: string;
  teamYears: TeamYearPoint[];
  visibleMetrics: Record<MetricKey, boolean>;
};

type UseRawDataDerivedResult = {
  counts: { pit: number; match: number; total: number };
  filteredTeams: EventTeam[];
  selectedTeamDisplay: TeamDisplay | null;
  selectedTeamScouting: SelectedTeamScouting;
  selectedTeamMatchNotes: MatchNotesBundle;
  selectedTeamAutonPaths: SelectedTeamAutonPath[];
  stripSummaries: StripSummary[];
  selectedTeamTeleopSummary: TeleopSummary;
  selectedTeamEventKeys: string[];
  epaSummary: { total: number; auto: number; teleop: number; endgame: number } | null;
  activeMetricKeys: MetricKey[];
  graphData: GraphData;
};

export function useRawDataDerived({
  entries,
  eventTeams,
  selectedTeam,
  search,
  isGlobalScope,
  activeEventKey,
  teamYears,
  visibleMetrics,
}: UseRawDataDerivedArgs): UseRawDataDerivedResult {
  const counts = useMemo(() => {
    const pit = entries.filter((entry) => entry.type === 'pit').length;
    const match = entries.filter((entry) => entry.type === 'match').length;
    return { pit, match, total: entries.length };
  }, [entries]);

  const filteredTeams = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return eventTeams;
    }

    return eventTeams.filter((team) => {
      return String(team.teamNumber).includes(query) || team.nickname.toLowerCase().includes(query);
    });
  }, [eventTeams, search]);

  const selectedTeamEntry = useMemo(
    () => eventTeams.find((team) => team.teamNumber === selectedTeam) || null,
    [eventTeams, selectedTeam],
  );

  const selectedTeamDisplay = useMemo(() => {
    if (selectedTeamEntry) {
      return selectedTeamEntry;
    }

    if (!selectedTeam) {
      return null;
    }

    return {
      teamNumber: selectedTeam,
      nickname: `Team ${selectedTeam}`,
      stats: null,
    };
  }, [selectedTeam, selectedTeamEntry]);

  const selectedTeamScouting = useMemo(() => {
    if (!selectedTeam) {
      return { pit: [] as RawEntry[], match: [] as RawEntry[] };
    }

    const pit = entries
      .filter((entry) => {
        if (entry.type !== 'pit' || Number(entry.teamNumber) !== selectedTeam) {
          return false;
        }

        if (isGlobalScope) {
          return true;
        }

        const payloadEventKey = getPayloadEventKey(entry.payload);
        return payloadEventKey !== '' && payloadEventKey === activeEventKey;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const match = entries
      .filter((entry) => {
        if (entry.type !== 'match' || Number(entry.teamNumber) !== selectedTeam) {
          return false;
        }

        if (isGlobalScope) {
          return true;
        }

        const payloadEventKey = getPayloadEventKey(entry.payload);
        return payloadEventKey !== '' && payloadEventKey === activeEventKey;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);

    return { pit, match };
  }, [activeEventKey, entries, isGlobalScope, selectedTeam]);

  const deferredSelectedTeamMatches = useDeferredValue(selectedTeamScouting.match);

  const selectedTeamMatchNotes = useMemo(() => {
    const payloads = deferredSelectedTeamMatches
      .map((entry) => asMatchPayload(entry.payload))
      .filter((payload): payload is NonNullable<ReturnType<typeof asMatchPayload>> => payload !== null);

    return buildMatchNotesBundle(payloads);
  }, [deferredSelectedTeamMatches]);

  const selectedTeamAutonPaths = useMemo(() => {
    return deferredSelectedTeamMatches
      .map((entry) => {
        const match = asMatchPayload(entry.payload);
        const autonPath = asAutonPathData(match?.autonPath);
        if (!match || !autonPath || autonPath.trajectoryPoints.length === 0) {
          return null;
        }

        return {
          key: entry.key,
          matchNumber: typeof match.matchNumber === 'number' ? match.matchNumber : Number(match.matchNumber) || 0,
          allianceColor: match.allianceColor === 'Red' || match.allianceColor === 'Blue' ? match.allianceColor : '',
          updatedAt: entry.updatedAt,
          path: autonPath,
        };
      })
      .filter((entry): entry is SelectedTeamAutonPath => entry !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [deferredSelectedTeamMatches]);

  const stripSummaries = useMemo(() => {
    const groupedRuns: Record<'top' | 'middle' | 'bottom', StripRunSample[]> = {
      top: [],
      middle: [],
      bottom: [],
    };

    const groupedAllianceCounts: Record<'top' | 'middle' | 'bottom', { red: number; blue: number }> = {
      top: { red: 0, blue: 0 },
      middle: { red: 0, blue: 0 },
      bottom: { red: 0, blue: 0 },
    };

    selectedTeamAutonPaths.forEach((entry) => {
      const strip = resolveStripForY(entry.path.startPosition?.y ?? 0.5);

      const normalizedTrajectory = entry.path.trajectoryPoints
        .map((point) => normalizePoint({ x: point.x, y: point.y }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

      if (normalizedTrajectory.length > 0) {
        groupedRuns[strip].push({
          trajectory: resampleTrajectory(normalizedTrajectory, PATH_SAMPLE_COUNT),
          shots: entry.path.shotAttempts
            .map((shot) => normalizePoint({ x: shot.x, y: shot.y }))
            .filter((shot) => Number.isFinite(shot.x) && Number.isFinite(shot.y)),
          start: normalizePoint({ x: entry.path.startPosition.x, y: entry.path.startPosition.y }),
          alliance: entry.allianceColor,
        });
      }

      if (entry.allianceColor === 'Red') {
        groupedAllianceCounts[strip].red += 1;
      }
      if (entry.allianceColor === 'Blue') {
        groupedAllianceCounts[strip].blue += 1;
      }
    });

    return STRIP_ORDER.map((stripConfig) => {
      const runs = groupedRuns[stripConfig.key];
      const allianceCounts = groupedAllianceCounts[stripConfig.key];
      const dominantAlliance =
        allianceCounts.red === allianceCounts.blue ? '' : allianceCounts.red > allianceCounts.blue ? 'Red' : 'Blue';

      const targetAlliance: 'Red' | 'Blue' | '' = dominantAlliance || (runs[0]?.alliance || '');

      const alignedRuns = runs.map((run) => {
        return {
          start: alignPointToAlliance(run.start, run.alliance, targetAlliance),
          trajectory: run.trajectory.map((point) => alignPointToAlliance(point, run.alliance, targetAlliance)),
          shots: run.shots.map((shot) => alignPointToAlliance(shot, run.alliance, targetAlliance)),
        };
      });

      const avgStart = averagePoint(alignedRuns.map((run) => run.start));
      const avgPath = averageResampledPaths(alignedRuns.map((run) => run.trajectory));
      if (avgPath.length > 0) {
        avgPath[0] = avgStart;
      }

      const allShots = alignedRuns.flatMap((run) => run.shots);
      const shotBins = buildHeatmapBins(allShots, AUTON_HEATMAP_COLS, AUTON_HEATMAP_ROWS);

      return {
        key: stripConfig.key,
        label: stripConfig.label,
        runCount: runs.length,
        totalShots: allShots.length,
        avgPath,
        replayPath: buildReplayPath(avgPath, allShots),
        dominantAlliance: targetAlliance,
        shotBins,
        maxShotBin: shotBins.reduce((max, value) => Math.max(max, value), 0),
      };
    });
  }, [selectedTeamAutonPaths]);

  const selectedTeamTeleopSummary = useMemo(() => {
    const runs = deferredSelectedTeamMatches
      .map((entry) => {
        const match = asMatchPayload(entry.payload);
        if (!match) {
          return null;
        }

        const allianceColor = match.allianceColor === 'Red' || match.allianceColor === 'Blue' ? match.allianceColor : '';
        const rawAttempts = Array.isArray(match.teleopShotAttempts) ? match.teleopShotAttempts : [];
        const shots = rawAttempts
          .map((shot) => normalizePoint({ x: Number(shot.x), y: Number(shot.y) }))
          .filter((shot) => Number.isFinite(shot.x) && Number.isFinite(shot.y));

        return {
          allianceColor,
          shots,
        };
      })
      .filter((entry): entry is { allianceColor: 'Red' | 'Blue' | ''; shots: Array<{ x: number; y: number }> } => entry !== null);

    const redCount = runs.filter((run) => run.allianceColor === 'Red').length;
    const blueCount = runs.filter((run) => run.allianceColor === 'Blue').length;
    const dominantAlliance: 'Red' | 'Blue' | '' = redCount === blueCount ? '' : redCount > blueCount ? 'Red' : 'Blue';
    const targetAlliance: 'Red' | 'Blue' | '' = dominantAlliance || (runs[0]?.allianceColor || '');

    const alignedShots = runs.flatMap((run) => {
      return run.shots.map((shot) => alignPointToAlliance(shot, run.allianceColor, targetAlliance));
    });

    const shotBins = buildHeatmapBins(alignedShots, TELEOP_HEATMAP_COLS, TELEOP_HEATMAP_ROWS);

    return {
      shotBins,
      maxShotBin: shotBins.reduce((max, value) => Math.max(max, value), 0),
      totalShots: alignedShots.length,
      dominantAlliance: targetAlliance,
    };
  }, [deferredSelectedTeamMatches]);

  const selectedTeamEventKeys = useMemo(() => {
    const keys = new Set<string>();

    [...selectedTeamScouting.pit, ...selectedTeamScouting.match].forEach((entry) => {
      const payloadEventKey = getPayloadEventKey(entry.payload);
      if (payloadEventKey) {
        keys.add(payloadEventKey);
      }
    });

    return Array.from(keys).sort();
  }, [selectedTeamScouting.match, selectedTeamScouting.pit]);

  const epaSummary = useMemo(() => {
    if (teamYears.length === 0) {
      return null;
    }

    const totals = teamYears.reduce(
      (acc, point) => {
        return {
          total: acc.total + point.total_points,
          auto: acc.auto + point.auto_points,
          teleop: acc.teleop + point.teleop_points,
          endgame: acc.endgame + point.endgame_points,
        };
      },
      { total: 0, auto: 0, teleop: 0, endgame: 0 },
    );

    const divisor = Math.max(1, teamYears.length);
    return {
      total: totals.total / divisor,
      auto: totals.auto / divisor,
      teleop: totals.teleop / divisor,
      endgame: totals.endgame / divisor,
    };
  }, [teamYears]);

  const activeMetricKeys = useMemo(
    () => (Object.keys(METRIC_META) as MetricKey[]).filter((key) => visibleMetrics[key]),
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

  return {
    counts,
    filteredTeams,
    selectedTeamDisplay,
    selectedTeamScouting,
    selectedTeamMatchNotes,
    selectedTeamAutonPaths,
    stripSummaries,
    selectedTeamTeleopSummary,
    selectedTeamEventKeys,
    epaSummary,
    activeMetricKeys,
    graphData,
  };
}
