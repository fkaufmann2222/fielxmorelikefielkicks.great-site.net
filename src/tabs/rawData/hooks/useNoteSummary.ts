import { useEffect, useState } from 'react';
import { gemini, MatchNoteSummary } from '../../../lib/gemini';
import { NOTE_SUMMARY_DEBOUNCE_MS } from '../constants';
import { MatchNotesBundle, RawDataScope } from '../types';

const NOTE_SUMMARY_CACHE_STORAGE_KEY = 'global:rawDataNoteSummaryCache:v1';
const NOTE_SUMMARY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const NOTE_SUMMARY_CACHE_MAX_ENTRIES = 120;

type CachedNoteSummary = {
  summary: MatchNoteSummary;
  cachedAt: number;
};

const globalNoteSummaryCache = new Map<string, CachedNoteSummary>();
const globalNoteSummaryInFlight = new Map<string, Promise<MatchNoteSummary>>();
let hasHydratedNoteSummaryCache = false;

function hydrateNoteSummaryCache(): void {
  if (hasHydratedNoteSummaryCache) {
    return;
  }

  hasHydratedNoteSummaryCache = true;

  try {
    const raw = localStorage.getItem(NOTE_SUMMARY_CACHE_STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as Array<[string, CachedNoteSummary]>;
    if (!Array.isArray(parsed)) {
      return;
    }

    const now = Date.now();
    parsed.forEach((entry) => {
      if (!Array.isArray(entry) || entry.length !== 2) {
        return;
      }

      const [key, value] = entry;
      if (!value || typeof value !== 'object') {
        return;
      }

      if (typeof value.cachedAt !== 'number' || now - value.cachedAt > NOTE_SUMMARY_CACHE_TTL_MS) {
        return;
      }

      if (value.summary && typeof value.summary === 'object') {
        globalNoteSummaryCache.set(key, value);
      }
    });
  } catch {
    // Ignore cache hydration failures.
  }
}

function persistNoteSummaryCache(): void {
  try {
    const entries = Array.from(globalNoteSummaryCache.entries())
      .sort((a, b) => b[1].cachedAt - a[1].cachedAt)
      .slice(0, NOTE_SUMMARY_CACHE_MAX_ENTRIES);

    localStorage.setItem(NOTE_SUMMARY_CACHE_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore persistence failures.
  }
}

function getCachedSummary(summaryKey: string): MatchNoteSummary | null {
  hydrateNoteSummaryCache();

  const cached = globalNoteSummaryCache.get(summaryKey);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.cachedAt > NOTE_SUMMARY_CACHE_TTL_MS) {
    globalNoteSummaryCache.delete(summaryKey);
    return null;
  }

  return cached.summary;
}

function setCachedSummary(summaryKey: string, summary: MatchNoteSummary): void {
  globalNoteSummaryCache.set(summaryKey, {
    summary,
    cachedAt: Date.now(),
  });

  if (globalNoteSummaryCache.size > NOTE_SUMMARY_CACHE_MAX_ENTRIES) {
    const oldestKey = globalNoteSummaryCache.keys().next().value;
    if (oldestKey) {
      globalNoteSummaryCache.delete(oldestKey);
    }
  }

  persistNoteSummaryCache();
}

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
    const cachedSummary = getCachedSummary(summaryKey);
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
        const inFlight = globalNoteSummaryInFlight.get(summaryKey);
        const summaryPromise = inFlight || gemini.summarizeMatchNotes(summaryRequestPayload);

        if (!inFlight) {
          globalNoteSummaryInFlight.set(summaryKey, summaryPromise);
        }

        const summary = await summaryPromise;
        setCachedSummary(summaryKey, summary);

        if (!cancelled) {
          setNoteSummary(summary);
        }
      } catch (error) {
        if (!cancelled) {
          setNoteSummaryError(error instanceof Error ? error.message : 'Failed to summarize notes');
          setNoteSummary(null);
        }
      } finally {
        globalNoteSummaryInFlight.delete(summaryKey);
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
