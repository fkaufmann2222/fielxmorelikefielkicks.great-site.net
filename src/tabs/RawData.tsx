import React, { useCallback, useMemo, useState } from 'react';
import { TeamListPanel } from './rawData/components/TeamListPanel';
import { TeamAnalyticsPanel } from './rawData/components/TeamAnalyticsPanel';
import { ScoutingDataPanel } from './rawData/components/ScoutingDataPanel';
import { RawerDataPanel } from './rawData/components/RawerDataPanel';
import { AllianceSelection } from './AllianceSelection';
import { useRawEntries } from './rawData/hooks/useRawEntries';
import { useEventTeams } from './rawData/hooks/useEventTeams';
import { useTeamYears } from './rawData/hooks/useTeamYears';
import { useRawDataDerived } from './rawData/hooks/useRawDataDerived';
import { useNoteSummary } from './rawData/hooks/useNoteSummary';
import { useRawerMatchRecords } from './rawData/hooks/useRawerMatchRecords';
import { MetricKey, RawDataProps, RawDataViewMode } from './rawData/types';
import { parseEventYear } from './rawData/utils';

export function RawData({
  eventKey,
  profileId,
  scope = 'event',
  embeddedTeamNumber = null,
  hideTeamList = false,
  includeAutonPathViewer = true,
  scoutProfiles,
}: RawDataProps) {
  const isGlobalScope = scope === 'global';
  const activeEventKey = eventKey.trim().toLowerCase();
  const activeSeasonYear = useMemo(() => parseEventYear(eventKey), [eventKey]);

  const {
    eventTeams,
    selectedTeam,
    setSelectedTeam,
    isLoadingTeams,
    teamsError,
  } = useEventTeams({
    eventKey,
    profileId,
    embeddedTeamNumber,
  });

  const { entries, counts } = useRawEntries({
    activeEventKey,
    isGlobalScope,
    profileId,
    selectedTeam,
  });

  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<RawDataViewMode>('analytics');
  const [visibleMetrics, setVisibleMetrics] = useState<Record<MetricKey, boolean>>({
    total_points: true,
    auto_points: true,
    teleop_points: true,
    endgame_points: true,
  });

  const { teamYears, isLoadingYears, yearError } = useTeamYears({
    scope,
    isGlobalScope,
    activeEventKey,
    activeSeasonYear,
    selectedTeam,
  });

  const {
    filteredTeams,
    selectedTeamDisplay,
    selectedTeamScouting,
    selectedTeamMatchNotes,
    selectedTeamAutonPaths,
    stripSummaries,
    selectedTeamTeleopSummary,
    selectedTeamEventKeys,
    epaSummary,
    activeMetricKeys,
    graphData,
  } = useRawDataDerived({
    entries,
    counts,
    eventTeams,
    selectedTeam,
    search,
    isGlobalScope,
    activeEventKey,
    teamYears,
    visibleMetrics,
  });

  const {
    noteSummary,
    isLoadingNoteSummary,
    noteSummaryError,
  } = useNoteSummary({
    selectedTeam,
    isGlobalScope,
    activeEventKey,
    activeSeasonYear,
    scope,
    selectedTeamMatchNotes,
  });

  const {
    rawerMatchRecords,
    isLoadingCollectorFallback,
    collectorFallbackError,
  } = useRawerMatchRecords({
    selectedTeam,
    selectedTeamMatchEntries: selectedTeamScouting.match,
    isGlobalScope,
    activeEventKey,
    scoutProfiles,
  });

  const toggleMetric = useCallback((metric: MetricKey) => {
    setVisibleMetrics((previous) => ({
      ...previous,
      [metric]: !previous[metric],
    }));
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 px-4">
      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl">
        <h2 className="text-2xl font-bold text-white">Team Analytics + Scouting Data</h2>
        <p className="text-slate-400 mt-2">
          {isGlobalScope
            ? 'Search teams from the active profile and view scouting/analytics aggregated across all competitions.'
            : 'Search teams from the selected event and view event-scoped scouting and analytics.'}
        </p>
        <div className="mt-4 text-sm text-slate-300 flex flex-wrap gap-4">
          <span>
            Scope: <span className="font-mono uppercase">{isGlobalScope ? 'all-competitions' : 'event-only'}</span>
          </span>
          <span>
            Mode: <span className="font-mono uppercase">{viewMode}</span>
          </span>
          <span>
            Active event: <span className="font-mono uppercase">{eventKey || 'none'}</span>
          </span>
          <span>Teams: {eventTeams.length}</span>
          <span>Scouting Records: {counts.total}</span>
          <span>Pit: {counts.pit}</span>
          <span>Match: {counts.match}</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setViewMode('analytics')}
            className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              viewMode === 'analytics'
                ? 'border-blue-500 bg-blue-500/20 text-blue-100'
                : 'border-slate-600 text-slate-300 hover:bg-slate-700/60'
            }`}
          >
            Current Analytics
          </button>
          <button
            type="button"
            onClick={() => setViewMode('rawer')}
            className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              viewMode === 'rawer'
                ? 'border-blue-500 bg-blue-500/20 text-blue-100'
                : 'border-slate-600 text-slate-300 hover:bg-slate-700/60'
            }`}
          >
            Rawer Data
          </button>
          <button
            type="button"
            onClick={() => setViewMode('alliance-analysis')}
            className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              viewMode === 'alliance-analysis'
                ? 'border-blue-500 bg-blue-500/20 text-blue-100'
                : 'border-slate-600 text-slate-300 hover:bg-slate-700/60'
            }`}
          >
            Alliance Analysis
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${hideTeamList ? '' : 'lg:grid-cols-3'}`}>
        {!hideTeamList && (
          <TeamListPanel
            search={search}
            setSearch={setSearch}
            isLoadingTeams={isLoadingTeams}
            teamsError={teamsError}
            filteredTeams={filteredTeams}
            selectedTeam={selectedTeam}
            setSelectedTeam={setSelectedTeam}
          />
        )}

        <div className={`space-y-6 ${hideTeamList ? '' : 'lg:col-span-2'}`}>
          {!selectedTeamDisplay ? (
            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl text-slate-400">
              Select a team to view EPA and scouting details.
            </div>
          ) : (
            <>
               {viewMode === 'analytics' ? (
                 <>
                  <TeamAnalyticsPanel
                    selectedTeamDisplay={selectedTeamDisplay}
                    isGlobalScope={isGlobalScope}
                    epaSummary={epaSummary}
                    visibleMetrics={visibleMetrics}
                    toggleMetric={toggleMetric}
                    isLoadingYears={isLoadingYears}
                    yearError={yearError}
                    teamYears={teamYears}
                    activeMetricKeys={activeMetricKeys}
                    graphData={graphData}
                  />

                  <ScoutingDataPanel
                    selectedTeamDisplay={selectedTeamDisplay}
                    isGlobalScope={isGlobalScope}
                    eventKey={eventKey}
                    selectedTeamEventKeys={selectedTeamEventKeys}
                    selectedTeamScouting={selectedTeamScouting}
                    selectedTeamAutonPaths={selectedTeamAutonPaths}
                    includeAutonPathViewer={includeAutonPathViewer}
                    stripSummaries={stripSummaries}
                    selectedTeamTeleopSummary={selectedTeamTeleopSummary}
                    selectedTeamMatchNotes={selectedTeamMatchNotes}
                    noteSummary={noteSummary}
                    isLoadingNoteSummary={isLoadingNoteSummary}
                    noteSummaryError={noteSummaryError}
                  />
                </>
               ) : viewMode === 'rawer' ? (
                 <RawerDataPanel
                   selectedTeamDisplay={selectedTeamDisplay}
                   isGlobalScope={isGlobalScope}
                  eventKey={eventKey}
                  selectedTeamEventKeys={selectedTeamEventKeys}
                  rawerMatchRecords={rawerMatchRecords}
                  isLoadingCollectorFallback={isLoadingCollectorFallback}
                   collectorFallbackError={collectorFallbackError}
                 />
               ) : (
                 <AllianceSelection eventKey={eventKey} profileId={profileId} />
               )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
