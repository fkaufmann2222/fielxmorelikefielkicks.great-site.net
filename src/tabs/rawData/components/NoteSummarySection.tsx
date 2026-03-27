import React from 'react';
import { MatchNoteSummary } from '../../../lib/gemini';
import { SectionCard } from './RawDataPrimitives';

type NoteSummarySectionProps = {
  title?: string;
  noteSummary: MatchNoteSummary | null;
  isLoadingNoteSummary: boolean;
  noteSummaryError: string | null;
};

export function NoteSummarySection({
  title = 'Cumulative Strategy Summary',
  noteSummary,
  isLoadingNoteSummary,
  noteSummaryError,
}: NoteSummarySectionProps) {
  return (
    <SectionCard title={title}>
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
    </SectionCard>
  );
}
