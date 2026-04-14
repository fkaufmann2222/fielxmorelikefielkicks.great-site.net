import React from 'react';
import { FieldHeatmap } from '../../../components/FieldHeatmap';
import {
  AUTON_FIELD_HEIGHT,
  AUTON_FIELD_OVERLAY_SRC,
  AUTON_FIELD_WIDTH,
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
    <SectionCard title="Teleop Shot Frequency Heatmap">
      <p className="text-xs text-slate-400">Tap-mapped teleop shot attempts from all saved match scouts for this team.</p>

      <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-100">Teleop Shot Attempts</p>
          <p className="text-xs text-slate-400">Shots: {selectedTeamTeleopSummary.totalShots}</p>
        </div>

        <FieldHeatmap
          points={selectedTeamTeleopSummary.shotPoints}
          totalShots={selectedTeamTeleopSummary.totalShots}
          width={AUTON_FIELD_WIDTH}
          height={AUTON_FIELD_HEIGHT}
          overlaySrc={AUTON_FIELD_OVERLAY_SRC}
          color="#22c55e"
          pointRadius={42}
          emptyMessage="No teleop shot taps captured for this team yet."
        />

        {selectedTeamTeleopSummary.totalShots > 0 && (
          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <span>lower</span>
            <div
              className="h-3 w-40 rounded-full border border-slate-700"
              style={{ background: 'linear-gradient(90deg, #0a071a 0%, #3f1168 30%, #942264 55%, #f47235 78%, #fcd34d 92%, #fff6e8 100%)' }}
            />
            <span>higher</span>
          </div>
        )}

        <p className="text-xs text-slate-500">
          Orientation: {selectedTeamTeleopSummary.dominantAlliance || 'mixed/unknown'} alliance frame
        </p>
      </div>
    </SectionCard>
  );
});

TeleopHeatmapSection.displayName = 'TeleopHeatmapSection';
