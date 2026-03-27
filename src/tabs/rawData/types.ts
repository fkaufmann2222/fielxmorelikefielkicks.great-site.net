import { AutonPathData, MatchScoutData, PitScoutData } from '../../types';
import { MatchNoteSummary } from '../../lib/gemini';
import { StatboticsTeamEvent } from '../../lib/statbotics';

export type RawEntryType = 'pit' | 'match';

export type MetricKey = 'total_points' | 'auto_points' | 'teleop_points' | 'endgame_points';

export type RawDataScope = 'event' | 'global';

export type RawDataViewMode = 'analytics' | 'rawer';

export type RawEntry = {
  key: string;
  type: RawEntryType;
  teamNumber: number | string;
  matchNumber?: number | string;
  updatedAt: number;
  source: 'local' | 'remote';
  payload: unknown;
};

export type EntryCounts = {
  pit: number;
  match: number;
  total: number;
};

export type TeamYearPoint = {
  matchLabel: string;
  order: number;
  total_points: number;
  auto_points: number;
  teleop_points: number;
  endgame_points: number;
};

export type EventTeam = {
  teamNumber: number;
  nickname: string;
  stats: StatboticsTeamEvent | null;
};

export type SupabaseRow = {
  data: unknown;
  team_number?: number | null;
  match_number?: number | null;
  event_key?: string | null;
  updated_at?: string;
};

export type MatchNotesBundle = {
  totalMatches: number;
  autonNotes: string[];
  defenseNotes: string[];
  generalNotes: string[];
};

export type StripKey = 'top' | 'middle' | 'bottom';

export type NormalizedPoint = {
  x: number;
  y: number;
};

export type StripSummary = {
  key: StripKey;
  label: string;
  runCount: number;
  totalShots: number;
  avgPath: NormalizedPoint[];
  replayPath: AutonPathData | null;
  dominantAlliance: 'Red' | 'Blue' | '';
  shotBins: number[];
  maxShotBin: number;
};

export type StripRunSample = {
  trajectory: NormalizedPoint[];
  shots: NormalizedPoint[];
  start: NormalizedPoint;
  alliance: 'Red' | 'Blue' | '';
};

export type SelectedTeamAutonPath = {
  key: string;
  matchNumber: number;
  allianceColor: 'Red' | 'Blue' | '';
  updatedAt: number;
  path: AutonPathData;
};

export type SelectedTeamScouting = {
  pit: RawEntry[];
  match: RawEntry[];
};

export type TeamDisplay = {
  teamNumber: number;
  nickname: string;
  stats: StatboticsTeamEvent | null;
};

export type TeleopSummary = {
  shotBins: number[];
  maxShotBin: number;
  totalShots: number;
  dominantAlliance: 'Red' | 'Blue' | '';
};

export type GraphData = {
  series: Record<MetricKey, string>;
  labels: TeamYearPoint[];
};

export type RawDataProps = {
  eventKey: string;
  profileId: string | null;
  scope?: RawDataScope;
  embeddedTeamNumber?: number | null;
  hideTeamList?: boolean;
  includeAutonPathViewer?: boolean;
  scoutProfiles?: Array<{ id: string; name: string }>;
};

export type RawCollectorSource = 'record' | 'legacy-admin-record' | 'assignment' | 'unknown';

export type RawMatchPoint = {
  x: number;
  y: number;
  timestampMs: number;
};

export type RawerMatchRecord = {
  key: string;
  source: 'local' | 'remote';
  updatedAt: number;
  eventKey: string;
  matchNumber: number | string;
  teamNumber: number;
  allianceColor: 'Red' | 'Blue' | '';
  collectorProfileId: string | null;
  collectorName: string | null;
  collectorSource: RawCollectorSource;
  autonPath: AutonPathData | null;
  autonTrajectoryPoints: RawMatchPoint[];
  autonShotAttempts: RawMatchPoint[];
  teleopShotAttempts: RawMatchPoint[];
  autonNotes: string;
  defenseNotes: string;
  notes: string;
};

export type NoteSummaryViewState = {
  noteSummary: MatchNoteSummary | null;
  isLoadingNoteSummary: boolean;
  noteSummaryError: string | null;
};

export type RenderablePitPayload = Partial<PitScoutData>;

export type RenderableMatchPayload = Partial<MatchScoutData>;
