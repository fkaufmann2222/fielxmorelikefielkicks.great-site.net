import React from 'react';
import { MatchNoteSummary } from '../../../lib/gemini';
import {
  MatchNotesBundle,
  RawEntry,
  SelectedTeamAutonPath,
  SelectedTeamScouting,
  StripSummary,
  TeamDisplay,
  TeleopSummary,
} from '../types';
import { AutonTendenciesSection } from './AutonTendenciesSection';
import { NoteSummarySection } from './NoteSummarySection';
import { PitRecordCard } from './PitRecordCard';
import { TeleopHeatmapSection } from './TeleopHeatmapSection';

type ScoutingDataPanelProps = {
  selectedTeamDisplay: TeamDisplay;
  isGlobalScope: boolean;
  eventKey: string;
  selectedTeamEventKeys: string[];
  selectedTeamScouting: SelectedTeamScouting;
  selectedTeamAutonPaths: SelectedTeamAutonPath[];
  includeAutonPathViewer: boolean;
  stripSummaries: StripSummary[];
  selectedTeamTeleopSummary: TeleopSummary;
  selectedTeamMatchNotes: MatchNotesBundle;
  noteSummary: MatchNoteSummary | null;
  isLoadingNoteSummary: boolean;
  noteSummaryError: string | null;
};

export const ScoutingDataPanel = React.memo(function ScoutingDataPanel({
  selectedTeamDisplay,
  isGlobalScope,
  eventKey,
  selectedTeamEventKeys,
  selectedTeamScouting,
  selectedTeamAutonPaths,
  includeAutonPathViewer,
  stripSummaries,
  selectedTeamTeleopSummary,
  selectedTeamMatchNotes,
  noteSummary,
  isLoadingNoteSummary,
  noteSummaryError,
}: ScoutingDataPanelProps) {
  return (
    <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl">
      <h3 className="text-xl font-bold text-white">Scouting Data</h3>
      <p className="text-slate-400 mt-1">
        {isGlobalScope
          ? `Showing all saved scouting records for team ${selectedTeamDisplay.teamNumber} across ${selectedTeamEventKeys.length || 0} competitions.`
          : `Showing all saved scouting records for team ${selectedTeamDisplay.teamNumber} in event ${eventKey.toUpperCase() || 'N/A'}.`}
      </p>

      <div className="mt-4 text-sm text-slate-300 flex flex-wrap gap-4">
        <span>Pit records: {selectedTeamScouting.pit.length}</span>
        <span>Match records: {selectedTeamScouting.match.length}</span>
        <span>Auton paths: {selectedTeamAutonPaths.length}</span>
      </div>

      {includeAutonPathViewer && selectedTeamAutonPaths.length > 0 && (
        <div className="mt-4">
          <AutonTendenciesSection selectedTeamDisplay={selectedTeamDisplay} stripSummaries={stripSummaries} />
        </div>
      )}

      <div className="mt-4">
        <TeleopHeatmapSection selectedTeamTeleopSummary={selectedTeamTeleopSummary} />
      </div>

      <div className="mt-4 space-y-3">
        {selectedTeamScouting.pit.length === 0 && selectedTeamScouting.match.length === 0 && (
          <div className="text-sm text-slate-400">No scouting data saved for this team yet.</div>
        )}

        {selectedTeamScouting.pit.map((entry: RawEntry) => (
          <div key={entry.key}>
            <PitRecordCard
              entry={entry}
              selectedTeamMatchNotes={selectedTeamMatchNotes}
              noteSummary={noteSummary}
              isLoadingNoteSummary={isLoadingNoteSummary}
              noteSummaryError={noteSummaryError}
            />
          </div>
        ))}

        {selectedTeamScouting.pit.length === 0 && selectedTeamScouting.match.length > 0 && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
              <span className="px-2 py-1 rounded bg-slate-700 text-slate-200 uppercase">match strategy notes</span>
              <span className="text-slate-500">
                No pit scout record found yet. Showing notes from {selectedTeamMatchNotes.totalMatches} saved match records.
              </span>
            </div>

            <NoteSummarySection
              noteSummary={noteSummary}
              isLoadingNoteSummary={isLoadingNoteSummary}
              noteSummaryError={noteSummaryError}
            />
          </div>
        )}
      </div>
    </div>
  );
});

ScoutingDataPanel.displayName = 'ScoutingDataPanel';
