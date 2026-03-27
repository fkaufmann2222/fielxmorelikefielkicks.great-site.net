import React from 'react';
import { AutonPathField } from '../../../components/AutonPathField';
import { FieldHeatmap } from '../../../components/FieldHeatmap';
import {
  AUTON_FIELD_HEIGHT,
  AUTON_FIELD_OVERLAY_SRC,
  AUTON_FIELD_WIDTH,
  AUTON_HEATMAP_COLS,
  AUTON_HEATMAP_ROWS,
} from '../constants';
import { StripSummary, TeamDisplay } from '../types';
import { SectionCard } from './RawDataPrimitives';

type AutonTendenciesSectionProps = {
  selectedTeamDisplay: TeamDisplay;
  stripSummaries: StripSummary[];
};

export function AutonTendenciesSection({ selectedTeamDisplay, stripSummaries }: AutonTendenciesSectionProps) {
  return (
    <SectionCard title="Autonomous Tendencies (Averaged)">
      <p className="text-xs text-slate-400">
        Paths are grouped by starting Y position in three equal horizontal strips, then averaged on normalized time.
        Heatmaps show where autonomous shots cluster for each strip.
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {stripSummaries.map((summary) => (
          <div key={`${summary.key}-path`} className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-100">{summary.label} Avg Path</p>
              <p className="text-xs text-slate-400">Runs: {summary.runCount}</p>
            </div>

            {summary.replayPath && (
              <AutonPathField
                instanceId={`avg-replay-${selectedTeamDisplay.teamNumber}-${summary.key}`}
                mode="replay"
                allianceColor={summary.dominantAlliance}
                value={summary.replayPath}
              />
            )}

            {summary.runCount === 0 && (
              <p className="text-xs text-slate-500">No autonomous paths captured from this start strip yet.</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {stripSummaries.map((summary) => (
          <div key={`${summary.key}-heat`} className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-100">{summary.label} Shot Heatmap</p>
              <p className="text-xs text-slate-400">Shots: {summary.totalShots}</p>
            </div>

            <FieldHeatmap
              bins={summary.shotBins}
              cols={AUTON_HEATMAP_COLS}
              rows={AUTON_HEATMAP_ROWS}
              maxBin={summary.maxShotBin}
              totalShots={summary.totalShots}
              width={AUTON_FIELD_WIDTH}
              height={AUTON_FIELD_HEIGHT}
              overlaySrc={AUTON_FIELD_OVERLAY_SRC}
              color="#f43f5e"
              showHorizontalThirds
              emptyMessage="No autonomous shots captured from this start strip yet."
            />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
