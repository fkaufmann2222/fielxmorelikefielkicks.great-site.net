import { useEffect, useRef, useState } from 'react';
import { gemini, MatchNoteSummary } from '../../../lib/gemini';
import { NOTE_SUMMARY_DEBOUNCE_MS } from '../constants';
import { MatchNotesBundle, RawDataScope } from '../types';

type UseNoteSummaryArgs = {
  selectedTeam: number | null;
  isGlobalScope: boolean;
  activeEventKey: string;
  activeSeasonYear: number | null;
  scope: RawDataScope;
  selectedTeamMatchNotes: MatchNotesBundle;
};

type UseNoteSummaryResult = {
  noteSummary: MatchNoteSummary | null;
  isLoadingNoteSummary: boolean;
  noteSummaryError: string | null;
};

export function useNoteSummary({
  selectedTeam,
  isGlobalScope,
  activeEventKey,
  activeSeasonYear,
  scope,
  selectedTeamMatchNotes,
}: UseNoteSummaryArgs): UseNoteSummaryResult {
  const [noteSummary, setNoteSummary] = useState<MatchNoteSummary | null>(null);
  const [isLoadingNoteSummary, setIsLoadingNoteSummary] = useState(false);
  const [noteSummaryError, setNoteSummaryError] = useState<string | null>(null);

  const noteSummaryCacheRef = useRef<Map<string, MatchNoteSummary>>(new Map());
  const noteSummaryInFlightRef = useRef<Map<string, Promise<MatchNoteSummary>>>(new Map());

  useEffect(() => {
    if (!selectedTeam || (!isGlobalScope && !activeEventKey)) {
      setNoteSummary(null);
      setIsLoadingNoteSummary(false);
      setNoteSummaryError(null);
      return;
    }

    const autonNotes = selectedTeamMatchNotes.autonNotes;
    const defenseNotes = selectedTeamMatchNotes.defenseNotes;
    const generalNotes = selectedTeamMatchNotes.generalNotes;

    if (autonNotes.length === 0 && defenseNotes.length === 0 && generalNotes.length === 0) {
      setNoteSummary({
        autonStrategy: 'No autonomous strategy notes were provided for this team yet.',
        defenseStrategy: 'No defense strategy notes were provided for this team yet.',
        overallSummary: 'No additional match notes were provided for this team yet.',
      });
      setIsLoadingNoteSummary(false);
      setNoteSummaryError(null);
      return;
    }

    const summaryRequestPayload = {
      eventKey: isGlobalScope
        ? activeSeasonYear
          ? `season-${activeSeasonYear}`
          : 'global'
        : activeEventKey,
      scope,
      contextLabel: isGlobalScope
        ? activeSeasonYear
          ? `season ${activeSeasonYear}`
          : 'all competitions'
        : activeEventKey,
      teamNumber: selectedTeam,
      autonNotes,
      defenseNotes,
      generalNotes,
    };

    const summaryKey = `${summaryRequestPayload.eventKey}:${selectedTeam}:${autonNotes.join('\u0001')}:${defenseNotes.join('\u0001')}:${generalNotes.join('\u0001')}`;
    const cachedSummary = noteSummaryCacheRef.current.get(summaryKey);
    if (cachedSummary) {
      setNoteSummary(cachedSummary);
      setIsLoadingNoteSummary(false);
      setNoteSummaryError(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsLoadingNoteSummary(true);
      setNoteSummaryError(null);

      try {
        const inFlight = noteSummaryInFlightRef.current.get(summaryKey);
        const summaryPromise = inFlight || gemini.summarizeMatchNotes(summaryRequestPayload);

        if (!inFlight) {
          noteSummaryInFlightRef.current.set(summaryKey, summaryPromise);
        }

        const summary = await summaryPromise;
        noteSummaryCacheRef.current.set(summaryKey, summary);

        if (!cancelled) {
          setNoteSummary(summary);
        }
      } catch (error) {
        if (!cancelled) {
          setNoteSummaryError(error instanceof Error ? error.message : 'Failed to summarize notes');
          setNoteSummary(null);
        }
      } finally {
        noteSummaryInFlightRef.current.delete(summaryKey);
        if (!cancelled) {
          setIsLoadingNoteSummary(false);
        }
      }
    }, NOTE_SUMMARY_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeEventKey, activeSeasonYear, isGlobalScope, scope, selectedTeam, selectedTeamMatchNotes]);

  return {
    noteSummary,
    isLoadingNoteSummary,
    noteSummaryError,
  };
}
