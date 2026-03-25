import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AllianceColor, AutonPathData, AutonShotAttempt, AutonTrajectoryPoint } from '../types';

type Point = { x: number; y: number };
type RecorderPhase = 'setup' | 'recording' | 'annotate';

type Props = {
  mode: 'record' | 'replay';
  allianceColor: AllianceColor | '';
  value?: AutonPathData | null;
  onChange?: (next: AutonPathData | null) => void;
  durationMs?: number;
  instanceId?: string;
};

const FIELD_WIDTH = 1000;
const FIELD_HEIGHT = 540;
const RECORD_SAMPLE_MS = 45;
const PLAYBACK_STEP_MS = 40;
const FIELD_OVERLAY_SRC = '/auton-field-overlay.svg';
const RED_START_LINE_X = 0.174;
const BLUE_START_LINE_X = 0.826;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function pointToSvg(point: Point): { x: number; y: number } {
  return {
    x: point.x * FIELD_WIDTH,
    y: point.y * FIELD_HEIGHT,
  };
}

function clampPointToAllianceZone(point: Point, allianceColor: AllianceColor | ''): Point {
  if (allianceColor === 'Red') {
    return { x: Math.min(point.x, RED_START_LINE_X), y: point.y };
  }
  if (allianceColor === 'Blue') {
    return { x: Math.max(point.x, BLUE_START_LINE_X), y: point.y };
  }
  return point;
}

function isInAllianceStartZone(point: Point, allianceColor: AllianceColor | ''): boolean {
  if (allianceColor === 'Red') {
    return point.x <= RED_START_LINE_X;
  }
  if (allianceColor === 'Blue') {
    return point.x >= BLUE_START_LINE_X;
  }
  return false;
}

function defaultStartPoint(allianceColor: AllianceColor | ''): Point {
  if (allianceColor === 'Red') {
    return { x: 0.12, y: 0.5 };
  }
  if (allianceColor === 'Blue') {
    return { x: 0.88, y: 0.5 };
  }
  return { x: 0.5, y: 0.5 };
}

function interpolateRobot(points: AutonTrajectoryPoint[], timeMs: number): Point {
  if (points.length === 0) {
    return { x: 0.5, y: 0.5 };
  }

  if (points.length === 1 || timeMs <= points[0].timestampMs) {
    return { x: points[0].x, y: points[0].y };
  }

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    if (timeMs <= next.timestampMs) {
      const span = Math.max(1, next.timestampMs - prev.timestampMs);
      const ratio = (timeMs - prev.timestampMs) / span;
      return {
        x: prev.x + (next.x - prev.x) * ratio,
        y: prev.y + (next.y - prev.y) * ratio,
      };
    }
  }

  const tail = points[points.length - 1];
  return { x: tail.x, y: tail.y };
}

function toFieldPoint(event: React.PointerEvent<SVGSVGElement>, element: SVGSVGElement): Point {
  const rect = element.getBoundingClientRect();
  const x = clamp01((event.clientX - rect.left) / rect.width);
  const y = clamp01((event.clientY - rect.top) / rect.height);
  return { x, y };
}

function toPolyline(points: AutonTrajectoryPoint[]): string {
  return points
    .map((point) => {
      const svg = pointToSvg(point);
      return `${svg.x},${svg.y}`;
    })
    .join(' ');
}

function toClockMs(timeMs: number): string {
  const totalSeconds = Math.floor(timeMs / 1000);
  const wholeMs = Math.floor((timeMs % 1000) / 10).toString().padStart(2, '0');
  return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}.${wholeMs}`;
}

function hasPath(value: AutonPathData | null | undefined): value is AutonPathData {
  return Boolean(value && Array.isArray(value.trajectoryPoints) && value.trajectoryPoints.length > 0);
}

export function AutonPathField({
  mode,
  allianceColor,
  value = null,
  onChange,
  durationMs = 15000,
  instanceId,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const startEpochRef = useRef<number | null>(null);
  const lastSampleAtRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const latestRobotPointRef = useRef<Point>({ x: 0.5, y: 0.5 });

  const [phase, setPhase] = useState<RecorderPhase>(() => (hasPath(value) ? 'annotate' : 'setup'));
  const [pathData, setPathData] = useState<AutonPathData | null>(value);
  const [elapsedMs, setElapsedMs] = useState(() => (value?.durationMs && hasPath(value) ? value.durationMs : 0));
  const [playbackMs, setPlaybackMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [robotSetupPoint, setRobotSetupPoint] = useState<Point>(() => {
    if (value && value.trajectoryPoints.length > 0) {
      return { x: value.trajectoryPoints[0].x, y: value.trajectoryPoints[0].y };
    }

    if (value?.startPosition) {
      return {
        x: clamp01(value.startPosition.x),
        y: clamp01(value.startPosition.y),
      };
    }

    return defaultStartPoint(allianceColor);
  });

  const emitChange = (next: AutonPathData | null) => {
    setPathData(next);
    if (onChange) {
      onChange(next);
    }
  };

  useEffect(() => {
    latestRobotPointRef.current = robotSetupPoint;
  }, [robotSetupPoint]);

  useEffect(() => {
    setPathData(value ?? null);
    setIsPlaying(false);
    setPlaybackMs(0);

    if (value && value.trajectoryPoints.length > 0) {
      setPhase('annotate');
      setElapsedMs(value.durationMs);
      setRobotSetupPoint({ x: value.trajectoryPoints[0].x, y: value.trajectoryPoints[0].y });
      return;
    }

    setPhase('setup');
    setElapsedMs(0);
    setRobotSetupPoint(value?.startPosition ? clampPointToAllianceZone(value.startPosition, allianceColor) : defaultStartPoint(allianceColor));
  }, [instanceId]);

  useEffect(() => {
    if (phase !== 'recording') {
      return;
    }

    const timer = window.setInterval(() => {
      if (startEpochRef.current === null) {
        return;
      }

      const runningMs = Math.max(0, Math.floor(performance.now() - startEpochRef.current));
      const bounded = Math.min(durationMs, runningMs);
      setElapsedMs(bounded);
      setPlaybackMs(bounded);

      if (runningMs >= durationMs) {
        setPhase('annotate');
        setIsPlaying(false);
        startEpochRef.current = null;

        setPathData((current) => {
          if (!current) {
            return current;
          }

          const points = [...current.trajectoryPoints];
          const last = points[points.length - 1];
          if (!last || last.timestampMs < durationMs) {
            points.push({
              x: latestRobotPointRef.current.x,
              y: latestRobotPointRef.current.y,
              timestampMs: durationMs,
            });
          }

          const next: AutonPathData = {
            ...current,
            durationMs,
            trajectoryPoints: points,
          };
          if (onChange) {
            onChange(next);
          }
          return next;
        });
      }
    }, PLAYBACK_STEP_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [durationMs, onChange, phase]);

  useEffect(() => {
    if (!isPlaying || !hasPath(pathData) || phase === 'recording') {
      return;
    }

    const timer = window.setInterval(() => {
      setPlaybackMs((current) => {
        const next = current + PLAYBACK_STEP_MS;
        if (next >= pathData.durationMs) {
          window.clearInterval(timer);
          setIsPlaying(false);
          return pathData.durationMs;
        }
        return next;
      });
    }, PLAYBACK_STEP_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [isPlaying, pathData, phase]);

  const zoneLabel = useMemo(() => {
    if (allianceColor === 'Red') {
      return 'Red alliance zone';
    }
    if (allianceColor === 'Blue') {
      return 'Blue alliance zone';
    }
    return 'Unknown alliance';
  }, [allianceColor]);

  const robotDisplayPoint = useMemo(() => {
    if (phase === 'setup' || phase === 'recording') {
      return robotSetupPoint;
    }

    if (hasPath(pathData)) {
      return interpolateRobot(pathData.trajectoryPoints, playbackMs);
    }

    return robotSetupPoint;
  }, [pathData, phase, playbackMs, robotSetupPoint]);

  const shotAttemptsOnTimeline = useMemo(() => {
    if (!pathData?.shotAttempts?.length) {
      return [] as AutonShotAttempt[];
    }

    return pathData.shotAttempts.filter((shot) => shot.timestampMs <= playbackMs);
  }, [pathData, playbackMs]);

  const canStartRecording = mode === 'record' && phase === 'setup' && isInAllianceStartZone(robotSetupPoint, allianceColor);
  const canAnnotate = mode === 'record' && phase === 'annotate' && hasPath(pathData);
  const canReplay = hasPath(pathData) && phase !== 'recording';

  const beginRecording = () => {
    if (!canStartRecording) {
      return;
    }

    const start = clampPointToAllianceZone(robotSetupPoint, allianceColor);
    setRobotSetupPoint(start);
    setElapsedMs(0);
    setPlaybackMs(0);
    setPhase('recording');
    setIsPlaying(false);

    startEpochRef.current = performance.now();
    lastSampleAtRef.current = 0;

    emitChange({
      startPosition: start,
      capturedAt: new Date().toISOString(),
      durationMs,
      trajectoryPoints: [{ x: start.x, y: start.y, timestampMs: 0 }],
      shotAttempts: [],
      fieldVersion: '2026-field-v1',
    });
  };

  const rerecord = () => {
    setPhase('setup');
    setElapsedMs(0);
    setPlaybackMs(0);
    setIsPlaying(false);
    startEpochRef.current = null;
    lastSampleAtRef.current = 0;
    emitChange(null);
    setRobotSetupPoint(defaultStartPoint(allianceColor));
  };

  const appendTrajectorySample = (point: Point) => {
    if (phase !== 'recording' || startEpochRef.current === null) {
      return;
    }

    const now = performance.now();
    const elapsed = Math.min(durationMs, Math.max(0, Math.floor(now - startEpochRef.current)));
    if (elapsed < lastSampleAtRef.current + RECORD_SAMPLE_MS && elapsed !== durationMs) {
      return;
    }

    lastSampleAtRef.current = elapsed;

    setPathData((current) => {
      if (!current) {
        return current;
      }

      const nextPoints = [...current.trajectoryPoints, { x: point.x, y: point.y, timestampMs: elapsed }];
      const next: AutonPathData = {
        ...current,
        trajectoryPoints: nextPoints,
      };

      if (onChange) {
        onChange(next);
      }

      return next;
    });
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || mode !== 'record') {
      return;
    }

    if (phase !== 'setup' && phase !== 'recording') {
      return;
    }

    isDraggingRef.current = true;
    svgRef.current.setPointerCapture(event.pointerId);

    const point = toFieldPoint(event, svgRef.current);
    setRobotSetupPoint(phase === 'setup' ? clampPointToAllianceZone(point, allianceColor) : point);

    if (phase === 'recording') {
      appendTrajectorySample(point);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || !isDraggingRef.current || mode !== 'record') {
      return;
    }

    if (phase !== 'setup' && phase !== 'recording') {
      return;
    }

    const point = toFieldPoint(event, svgRef.current);
    setRobotSetupPoint(phase === 'setup' ? clampPointToAllianceZone(point, allianceColor) : point);

    if (phase === 'recording') {
      appendTrajectorySample(point);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || mode !== 'record') {
      return;
    }

    if (isDraggingRef.current) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
    isDraggingRef.current = false;

    if (phase === 'setup') {
      const point = clampPointToAllianceZone(toFieldPoint(event, svgRef.current), allianceColor);
      setRobotSetupPoint(point);
      emitChange({
        startPosition: point,
        capturedAt: new Date().toISOString(),
        durationMs,
        trajectoryPoints: [],
        shotAttempts: [],
        fieldVersion: '2026-field-v1',
      });
    }
  };

  const handleRobotShotTap = () => {
    if (!canAnnotate || !pathData) {
      return;
    }

    const nextShot: AutonShotAttempt = {
      x: robotDisplayPoint.x,
      y: robotDisplayPoint.y,
      timestampMs: playbackMs,
    };

    emitChange({
      ...pathData,
      shotAttempts: [...pathData.shotAttempts, nextShot],
    });
  };

  const removeLastShot = () => {
    if (!pathData || pathData.shotAttempts.length === 0) {
      return;
    }

    emitChange({
      ...pathData,
      shotAttempts: pathData.shotAttempts.slice(0, -1),
    });
  };

  const clearShots = () => {
    if (!pathData) {
      return;
    }

    emitChange({
      ...pathData,
      shotAttempts: [],
    });
  };

  const robotSvgPoint = pointToSvg(robotDisplayPoint);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
        <span className="px-2 py-1 rounded bg-slate-700/70 border border-slate-600 uppercase">Alliance: {allianceColor || 'Unknown'}</span>
        <span className="px-2 py-1 rounded bg-slate-700/70 border border-slate-600">Start Zone: {zoneLabel}</span>
        <span className="px-2 py-1 rounded bg-slate-700/70 border border-slate-600">Timer: {toClockMs(phase === 'recording' ? elapsedMs : playbackMs)}</span>
      </div>

      {mode === 'record' && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canStartRecording}
            onClick={beginRecording}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
          >
            Match Start
          </button>
          <button
            type="button"
            disabled={!canAnnotate}
            onClick={handleRobotShotTap}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
          >
            Tap Robot = Shot Attempt
          </button>
          <button
            type="button"
            disabled={!canAnnotate || !pathData?.shotAttempts.length}
            onClick={removeLastShot}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white"
          >
            Remove Last Shot
          </button>
          <button
            type="button"
            disabled={!canAnnotate || !pathData?.shotAttempts.length}
            onClick={clearShots}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white"
          >
            Clear Shots
          </button>
          <button
            type="button"
            onClick={rerecord}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-rose-700 hover:bg-rose-600 text-white"
          >
            Re-record
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${FIELD_WIDTH} ${FIELD_HEIGHT}`}
          className="w-full h-auto touch-none select-none rounded-lg"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <image href={FIELD_OVERLAY_SRC} x="0" y="0" width={FIELD_WIDTH} height={FIELD_HEIGHT} preserveAspectRatio="none" />

          {allianceColor === 'Red' && (
            <rect x="0" y="0" width={FIELD_WIDTH * RED_START_LINE_X} height={FIELD_HEIGHT} fill="#dc2626" opacity="0.12" />
          )}
          {allianceColor === 'Blue' && (
            <rect x={FIELD_WIDTH * BLUE_START_LINE_X} y="0" width={FIELD_WIDTH * (1 - BLUE_START_LINE_X)} height={FIELD_HEIGHT} fill="#2563eb" opacity="0.12" />
          )}
          {allianceColor === 'Red' && (
            <line x1={FIELD_WIDTH * RED_START_LINE_X} y1="0" x2={FIELD_WIDTH * RED_START_LINE_X} y2={FIELD_HEIGHT} stroke="#b91c1c" strokeDasharray="8 6" strokeWidth="3" />
          )}
          {allianceColor === 'Blue' && (
            <line x1={FIELD_WIDTH * BLUE_START_LINE_X} y1="0" x2={FIELD_WIDTH * BLUE_START_LINE_X} y2={FIELD_HEIGHT} stroke="#1d4ed8" strokeDasharray="8 6" strokeWidth="3" />
          )}

          {hasPath(pathData) && pathData.trajectoryPoints.length > 1 && (
            <polyline
              fill="none"
              stroke={allianceColor === 'Blue' ? '#2563eb' : '#dc2626'}
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={toPolyline(pathData.trajectoryPoints)}
              opacity="0.85"
            />
          )}

          {shotAttemptsOnTimeline.map((shot, index) => {
            const marker = pointToSvg(shot);
            return (
              <g key={`${shot.timestampMs}-${index}`}>
                <circle cx={marker.x} cy={marker.y} r={9} fill="#f59e0b" stroke="#7c2d12" strokeWidth="2" />
                <circle cx={marker.x} cy={marker.y} r={3} fill="#fff7ed" />
              </g>
            );
          })}

          <g
            onClick={canAnnotate ? handleRobotShotTap : undefined}
            style={{ cursor: canAnnotate ? 'pointer' : 'default' }}
          >
            <circle
              cx={robotSvgPoint.x}
              cy={robotSvgPoint.y}
              r="18"
              fill={allianceColor === 'Blue' ? '#1d4ed8' : '#b91c1c'}
              stroke="#111827"
              strokeWidth="3"
            />
            <circle cx={robotSvgPoint.x} cy={robotSvgPoint.y} r="6" fill="#f8fafc" />
          </g>
        </svg>
      </div>

      {canReplay && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={() => setIsPlaying((current) => !current)}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-white"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setPlaybackMs(0);
              }}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-white"
            >
              Reset Timeline
            </button>
            <span className="text-xs text-slate-400">Drag the timeline to inspect robot path and shot attempts.</span>
          </div>

          <input
            type="range"
            min={0}
            max={pathData?.durationMs || durationMs}
            value={playbackMs}
            onChange={(event) => {
              setIsPlaying(false);
              setPlaybackMs(Number(event.target.value));
            }}
            className="w-full"
          />
        </div>
      )}

      {pathData?.shotAttempts?.length ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
          <h4 className="text-sm font-semibold text-slate-100">Shot Attempts Timeline</h4>
          <div className="mt-2 max-h-40 overflow-auto text-xs text-slate-300">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-left py-1">#</th>
                  <th className="text-left py-1">Time</th>
                  <th className="text-left py-1">X</th>
                  <th className="text-left py-1">Y</th>
                </tr>
              </thead>
              <tbody>
                {pathData.shotAttempts
                  .slice()
                  .sort((a, b) => a.timestampMs - b.timestampMs)
                  .map((shot, index) => (
                    <tr key={`${shot.timestampMs}-${index}`} className="border-b border-slate-800">
                      <td className="py-1">{index + 1}</td>
                      <td className="py-1 font-mono">{toClockMs(shot.timestampMs)}</td>
                      <td className="py-1 font-mono">{shot.x.toFixed(3)}</td>
                      <td className="py-1 font-mono">{shot.y.toFixed(3)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {mode === 'record' && allianceColor === '' && (
        <p className="text-xs text-amber-300">
          Select a team first. Alliance side from TBA controls legal start zone.
        </p>
      )}

      {mode === 'record' && phase === 'setup' && allianceColor !== '' && (
        <p className="text-xs text-slate-300">
          Drag the robot anywhere in your alliance zone behind the starting line, then press Match Start.
        </p>
      )}

      {mode === 'record' && phase === 'recording' && (
        <p className="text-xs text-blue-300">
          Recording is active. Drag the robot across the map. Capture stops automatically at 15 seconds.
        </p>
      )}

      {mode === 'record' && phase === 'annotate' && (
        <p className="text-xs text-emerald-300">
          Recording complete. Scrub timeline and tap the robot to mark each shot attempt.
        </p>
      )}
    </div>
  );
}
