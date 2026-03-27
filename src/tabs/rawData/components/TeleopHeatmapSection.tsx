import React from 'react';
import { FieldHeatmap } from '../../../components/FieldHeatmap';
import {
  AUTON_FIELD_HEIGHT,
  AUTON_FIELD_OVERLAY_SRC,
  AUTON_FIELD_WIDTH,
  TELEOP_HEATMAP_COLS,
  TELEOP_HEATMAP_ROWS,
} from '../constants';
import { TeleopSummary } from '../types';
import { SectionCard } from './RawDataPrimitives';

type TeleopHeatmapSectionProps = {
  selectedTeamTeleopSummary: TeleopSummary;
};

export const TeleopHeatmapSection = React.memo(function TeleopHeatmapSection({
  selectedTeamTeleopSummary,
}: TeleopHeatmapSectionProps) {
  return (
    <SectionCard title="Teleop Shot Heatmap">
      <p className="text-xs text-slate-400">Tap-mapped teleop shot attempts from all saved match scouts for this team.</p>

      <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-100">Teleop Shot Attempts</p>
          <p className="text-xs text-slate-400">Shots: {selectedTeamTeleopSummary.totalShots}</p>
        </div>

        <FieldHeatmap
          bins={selectedTeamTeleopSummary.shotBins}
          cols={TELEOP_HEATMAP_COLS}
          rows={TELEOP_HEATMAP_ROWS}
          maxBin={selectedTeamTeleopSummary.maxShotBin}
          totalShots={selectedTeamTeleopSummary.totalShots}
          width={AUTON_FIELD_WIDTH}
          height={AUTON_FIELD_HEIGHT}
          overlaySrc={AUTON_FIELD_OVERLAY_SRC}
          color="#22c55e"
          emptyMessage="No teleop shot taps captured for this team yet."
        />

        <p className="text-xs text-slate-500">
          Orientation: {selectedTeamTeleopSummary.dominantAlliance || 'mixed/unknown'} alliance frame
        </p>
      </div>
    </SectionCard>
  );
});

TeleopHeatmapSection.displayName = 'TeleopHeatmapSection';
