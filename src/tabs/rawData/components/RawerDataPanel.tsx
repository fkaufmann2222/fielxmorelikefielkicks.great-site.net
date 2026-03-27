import React from 'react';
import { AutonPathField } from '../../../components/AutonPathField';
import { RawMatchPoint, RawerMatchRecord, TeamDisplay } from '../types';
import { SectionCard } from './RawDataPrimitives';

type RawerDataPanelProps = {
  selectedTeamDisplay: TeamDisplay;
  isGlobalScope: boolean;
  eventKey: string;
  selectedTeamEventKeys: string[];
  rawerMatchRecords: RawerMatchRecord[];
  isLoadingCollectorFallback: boolean;
  collectorFallbackError: string | null;
};

type RawPointTableProps = {
  title: string;
  points: RawMatchPoint[];
  emptyMessage: string;
};

function RawPointTable({ title, points, emptyMessage }: RawPointTableProps) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        <p className="text-xs text-slate-400">{points.length}</p>
      </div>

      {points.length === 0 ? (
        <p className="text-xs text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="max-h-52 overflow-auto rounded-lg border border-slate-700">
          <table className="min-w-full text-xs text-slate-200">
            <thead className="sticky top-0 bg-slate-900/95 border-b border-slate-700">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-300">#</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-300">Time (ms)</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-300">X</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-300">Y</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => (
                <tr key={`${title}-${index}-${point.timestampMs}`} className="border-b border-slate-800 last:border-b-0">
                  <td className="px-2 py-1.5 text-slate-400">{index + 1}</td>
                  <td className="px-2 py-1.5 font-mono">{Math.round(point.timestampMs)}</td>
                  <td className="px-2 py-1.5 font-mono">{point.x.toFixed(4)}</td>
                  <td className="px-2 py-1.5 font-mono">{point.y.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function collectorLabel(record: RawerMatchRecord): string {
  if (record.collectorName && record.collectorProfileId) {
    return `${record.collectorName} (${record.collectorProfileId})`;
  }

  if (record.collectorName) {
    return record.collectorName;
  }

  if (record.collectorProfileId) {
    return record.collectorProfileId;
  }

  return 'Unknown scout';
}

function collectorSourceLabel(record: RawerMatchRecord): string {
  switch (record.collectorSource) {
    case 'record':
      return 'collector from match record';
    case 'legacy-admin-record':
      return 'collector from legacy admin field';
    case 'assignment':
      return 'collector inferred from assignment';
    default:
      return 'collector not recorded';
  }
}

function noteValue(value: string): string {
  return value || 'No note saved.';
}

export const RawerDataPanel = React.memo(function RawerDataPanel({
  selectedTeamDisplay,
  isGlobalScope,
  eventKey,
  selectedTeamEventKeys,
  rawerMatchRecords,
  isLoadingCollectorFallback,
  collectorFallbackError,
}: RawerDataPanelProps) {
  return (
    <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-4">
      <div>
        <h3 className="text-xl font-bold text-white">Rawer Match Data</h3>
        <p className="text-slate-400 mt-1">
          {isGlobalScope
            ? `Showing unaveraged saved match records for team ${selectedTeamDisplay.teamNumber} across ${selectedTeamEventKeys.length || 0} competitions.`
            : `Showing unaveraged saved match records for team ${selectedTeamDisplay.teamNumber} in event ${eventKey.toUpperCase() || 'N/A'}.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-slate-300">
        <span>Match records: {rawerMatchRecords.length}</span>
      </div>

      {isLoadingCollectorFallback && (
        <p className="text-sm text-slate-400">Resolving scout attribution from assignment history...</p>
      )}

      {!isLoadingCollectorFallback && collectorFallbackError && (
        <p className="text-sm text-amber-300">{collectorFallbackError}</p>
      )}

      {rawerMatchRecords.length === 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-400">
          No saved match records found for this team.
        </div>
      )}

      {rawerMatchRecords.map((record) => {
        const autonViewerId = `rawer-replay-${selectedTeamDisplay.teamNumber}-${record.key}`;
        const eventLabel = record.eventKey ? record.eventKey.toUpperCase() : 'UNKNOWN';
        const allianceLabel = record.allianceColor || 'Unknown';

        return (
          <div key={record.key} className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded bg-slate-700 text-slate-100 uppercase">match {record.matchNumber}</span>
              <span className="px-2 py-1 rounded bg-slate-800 text-slate-200 uppercase">event {eventLabel}</span>
              <span className="px-2 py-1 rounded bg-slate-800 text-slate-200 uppercase">alliance {allianceLabel}</span>
              <span className="text-slate-500">Source: {record.source}</span>
              <span className="text-slate-500">Updated: {record.updatedAt ? new Date(record.updatedAt).toLocaleString() : 'Unknown'}</span>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 space-y-1">
              <p className="text-xs uppercase tracking-wide text-slate-400">Collected By</p>
              <p className="text-sm text-slate-100">{collectorLabel(record)}</p>
              <p className="text-xs text-slate-500">{collectorSourceLabel(record)}</p>
            </div>

            <SectionCard title="Unaveraged Autonomous Path">
              {record.autonPath ? (
                <AutonPathField
                  instanceId={autonViewerId}
                  mode="replay"
                  allianceColor={record.allianceColor}
                  value={record.autonPath}
                />
              ) : (
                <p className="text-xs text-slate-500">No autonomous path captured for this match.</p>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <RawPointTable
                  title="Auton Trajectory Points"
                  points={record.autonTrajectoryPoints}
                  emptyMessage="No trajectory points captured."
                />
                <RawPointTable
                  title="Auton Shot Positions"
                  points={record.autonShotAttempts}
                  emptyMessage="No autonomous shots captured."
                />
              </div>
            </SectionCard>

            <SectionCard title="Raw Teleop Shot Positions">
              <RawPointTable
                title="Teleop Shot Attempts"
                points={record.teleopShotAttempts}
                emptyMessage="No teleop shots captured."
              />
            </SectionCard>

            <SectionCard title="Raw Notes">
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Autonomous Notes</p>
                  <p className="text-sm text-slate-100 whitespace-pre-line">{noteValue(record.autonNotes)}</p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Defense Notes</p>
                  <p className="text-sm text-slate-100 whitespace-pre-line">{noteValue(record.defenseNotes)}</p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-slate-400">General Match Notes</p>
                  <p className="text-sm text-slate-100 whitespace-pre-line">{noteValue(record.notes)}</p>
                </div>
              </div>
            </SectionCard>
          </div>
        );
      })}
    </div>
  );
});

RawerDataPanel.displayName = 'RawerDataPanel';
