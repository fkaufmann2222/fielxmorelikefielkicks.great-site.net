import React from 'react';
import { MatchNoteSummary } from '../../../lib/gemini';
import { MatchNotesBundle, RawEntry } from '../types';
import { asPitPayload, displayPhotoUrls, displayText } from '../utils';
import { BoolRow, SectionCard, ValueRow } from './RawDataPrimitives';

type PitRecordCardProps = {
  entry: RawEntry;
  selectedTeamMatchNotes: MatchNotesBundle;
  noteSummary: MatchNoteSummary | null;
  isLoadingNoteSummary: boolean;
  noteSummaryError: string | null;
};

export const PitRecordCard = React.memo(function PitRecordCard({
  entry,
  selectedTeamMatchNotes,
  noteSummary,
  isLoadingNoteSummary,
  noteSummaryError,
}: PitRecordCardProps) {
  const pit = asPitPayload(entry.payload);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
        <span className="px-2 py-1 rounded bg-slate-700 text-slate-200 uppercase">pit</span>
        <span className="text-slate-500">Source: {entry.source}</span>
        <span className="text-slate-500">Updated: {entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : 'Unknown'}</span>
      </div>

      {!pit && <div className="text-sm text-slate-400">This record could not be rendered.</div>}

      {pit && (
        <div className="space-y-4">
          <SectionCard title="Robot Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ValueRow label="Team Number" value={displayText(pit.teamNumber, 'Unknown')} mono />
              <ValueRow label="Drive Train Type" value={displayText(pit.driveTrainType)} />
              <ValueRow label="Chassis Width (in)" value={displayText(pit.chassisWidth)} />
              <ValueRow label="Chassis Length (in)" value={displayText(pit.chassisLength)} />
            </div>

            {pit.driveTrainType === 'Other' && <ValueRow label="Drive Train (Other)" value={displayText(pit.driveTrainOther)} />}

            <ValueRow label="Drive Motors" value={displayText(pit.driveMotors, 'None selected')} />
          </SectionCard>

          <SectionCard title="Game Mechanisms">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ValueRow label="Fuel Hopper Capacity" value={displayText(pit.fuelHopperCapacity)} mono />
              <ValueRow label="Intake Position" value={displayText(pit.intakePosition)} />
              <ValueRow label="Shooter Type" value={displayText(pit.shooterType)} />
              <ValueRow label="Looks Good" value={displayText(pit.looksGood)} />
            </div>

            <BoolRow label="Has Turret" value={pit.hasTurret} />
            <BoolRow label="Can Drive over Bump" value={pit.canDriveOverBump} />
            <BoolRow label="Can Drive under Trench" value={pit.canDriveUnderTrench} />
            <BoolRow label="Can Climb Tower" value={pit.canClimbTower} />

            {pit.canClimbTower && <ValueRow label="Maximum Climb Level" value={displayText(pit.maxClimbLevel)} />}
          </SectionCard>

          <SectionCard title="Strategy and Notes">
            <BoolRow label="Can Play Defense" value={pit.canPlayDefense} />

            {pit.canPlayDefense && <ValueRow label="Defense Style" value={displayText(pit.defenseStyle)} />}

            <ValueRow label="Autonomous Description" value={displayText(pit.autoDescription)} />
            <ValueRow label="Vision Setup" value={displayText(pit.visionSetup)} />
            <ValueRow label="Additional Notes" value={displayText(pit.notes)} />

            <div className="pt-2 border-t border-slate-700/70 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded bg-slate-800 text-slate-200 uppercase">match strategy notes</span>
                <span className="text-slate-500">From {selectedTeamMatchNotes.totalMatches} saved match records</span>
              </div>

              {isLoadingNoteSummary && (
                <p className="text-sm text-slate-400">Summarizing cumulative autonomous and defense strategies...</p>
              )}

              {!isLoadingNoteSummary && noteSummaryError && <p className="text-sm text-rose-300">{noteSummaryError}</p>}

              {!isLoadingNoteSummary && !noteSummaryError && noteSummary && (
                <div className="space-y-3">
                  <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3 space-y-1">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Cumulative Auton Strategy</p>
                    <p className="text-sm text-slate-100 whitespace-pre-line">{noteSummary.autonStrategy}</p>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3 space-y-1">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Cumulative Defense Strategy</p>
                    <p className="text-sm text-slate-100 whitespace-pre-line">{noteSummary.defenseStrategy}</p>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-700 rounded-lg p-3 space-y-1">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Overall Match Notes</p>
                    <p className="text-sm text-slate-100 whitespace-pre-line">{noteSummary.overallSummary}</p>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {displayPhotoUrls(pit.photoUrls).length > 0 && (
            <SectionCard title="Photos">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {displayPhotoUrls(pit.photoUrls).map((photoUrl, index) => (
                  <div key={`${photoUrl}-${index}`} className="rounded-xl border border-slate-700 bg-slate-950/40 p-2">
                    <img
                      src={photoUrl}
                      alt={`Pit photo ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg border border-slate-700"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
});

PitRecordCard.displayName = 'PitRecordCard';
