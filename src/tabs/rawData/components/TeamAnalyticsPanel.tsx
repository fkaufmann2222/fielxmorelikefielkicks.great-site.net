import React from 'react';
import { METRIC_META } from '../constants';
import { GraphData, MetricKey, TeamDisplay, TeamYearPoint } from '../types';

type TeamAnalyticsPanelProps = {
  selectedTeamDisplay: TeamDisplay;
  isGlobalScope: boolean;
  epaSummary: { total: number; auto: number; teleop: number; endgame: number } | null;
  visibleMetrics: Record<MetricKey, boolean>;
  toggleMetric: (metric: MetricKey) => void;
  isLoadingYears: boolean;
  yearError: string | null;
  teamYears: TeamYearPoint[];
  activeMetricKeys: MetricKey[];
  graphData: GraphData;
};

export function TeamAnalyticsPanel({
  selectedTeamDisplay,
  isGlobalScope,
  epaSummary,
  visibleMetrics,
  toggleMetric,
  isLoadingYears,
  yearError,
  teamYears,
  activeMetricKeys,
  graphData,
}: TeamAnalyticsPanelProps) {
  return (
    <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl">
      <h3 className="text-xl font-bold text-white">Team {selectedTeamDisplay.teamNumber}</h3>
      <p className="text-slate-400 mt-1">{selectedTeamDisplay.nickname}</p>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
          <p className="text-xs text-slate-400">Total EPA ({isGlobalScope ? 'season avg' : 'event avg'})</p>
          <p className="text-lg font-mono text-white">
            {epaSummary?.total.toFixed(2) ?? selectedTeamDisplay.stats?.epa?.total_points?.toFixed?.(2) ?? 'N/A'}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
          <p className="text-xs text-slate-400">Auto</p>
          <p className="text-lg font-mono text-white">
            {epaSummary?.auto.toFixed(2) ?? selectedTeamDisplay.stats?.epa?.auto_points?.toFixed?.(2) ?? 'N/A'}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
          <p className="text-xs text-slate-400">Teleop</p>
          <p className="text-lg font-mono text-white">
            {epaSummary?.teleop.toFixed(2) ?? selectedTeamDisplay.stats?.epa?.teleop_points?.toFixed?.(2) ?? 'N/A'}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
          <p className="text-xs text-slate-400">Endgame</p>
          <p className="text-lg font-mono text-white">
            {epaSummary?.endgame.toFixed(2) ?? selectedTeamDisplay.stats?.epa?.endgame_points?.toFixed?.(2) ?? 'N/A'}
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
          <div className="text-sm text-slate-400 p-3">
            {isGlobalScope
              ? 'No season-wide EPA data found for this team.'
              : 'No match-level event EPA data found for this team.'}
          </div>
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
              const x =
                graphData.labels.length === 1
                  ? 360
                  : 48 + (index / (graphData.labels.length - 1)) * (720 - 96);

              const showTick =
                graphData.labels.length <= 12 ||
                index === 0 ||
                index === graphData.labels.length - 1 ||
                index % 2 === 0;
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
  );
}
