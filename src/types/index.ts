export type AllianceColor = 'Red' | 'Blue';
export type ClimbLevel = 'Level 1' | 'Level 2' | 'Level 3';
export type AutoClimbResult = 'Level 1 Successful' | 'Attempted but Failed';
export type EndGameClimbResult = 'Did Not Attempt' | 'Parked near Tower' | 'Level 1' | 'Level 2' | 'Level 3' | 'Attempted but Failed';
export type DriveTrainType = 'Tank' | 'Swerve' | 'Mecanum' | 'H-Drive' | 'Other';
export type DriveMotor = 'Falcon 500 / Kraken X60' | 'NEO' | 'NEO Vortex' | 'CIM' | 'MiniCIM' | 'Other';
export type IntakePosition = 'Over the bumper' | 'Under the bumper' | 'Both';
export type ShooterType = 'Single shooter' | 'Multi-shooter';
export type HubScoringStrategy = 'Prioritized scoring when Hub active' | 'Scored regardless of Hub state' | 'Primarily collected/fed Human Player';
export type CardReceived = 'None' | 'Yellow' | 'Red';
export type DefenseQuality = 'Good' | 'Bad';

export interface PitScoutData {
  eventKey?: string;
  profileId?: string;
  teamNumber: number | '';
  photoUrls: string[];
  canClimbTower: boolean;
  maxClimbLevel?: ClimbLevel;
  fuelHopperCapacity: number | '';
  chassisWidth: number | '';
  chassisLength: number | '';
  driveTrainType: DriveTrainType | '';
  driveTrainOther?: string;
  driveMotors: DriveMotor[];
  canDriveOverBump: boolean;
  canDriveUnderTrench: boolean;
  intakePosition: IntakePosition | '';
  looksGood: 'Yes' | 'No' | 'Mid' | '';
  autoDescription: string;
  visionSetup: string;
  shooterType: ShooterType | '';
  hasTurret: boolean;
  canPlayDefense: boolean;
  defenseStyle?: string;
  notes: string;
}

export interface MatchScoutData {
  eventKey?: string;
  matchKey?: string;
  matchNumber: number | '';
  teamNumber: number | '';
  allianceColor: AllianceColor | '';
  
  // Auto
  leftStartingZone: boolean;
  autoFuelScored: number;
  autoClimbAttempted: boolean;
  autoClimbResult?: AutoClimbResult;

  // Teleop
  teleopFuelScored: number;
  avgBps: number;
  shootingConsistency: number;
  intakeConsistency: number;
  droveOverBump: boolean;
  droveUnderTrench: boolean;
  playedDefense: boolean;
  defenseEffectiveness?: number;
  defenseQuality?: DefenseQuality | '';
  defenseNotes?: string;
  defendedAgainst: boolean;
  hubScoringStrategy: HubScoringStrategy | '';

  // End Game
  endGameClimbResult: EndGameClimbResult | '';
  climbTimeSeconds: number | '';

  // Post-Match
  foulsCaused: number;
  cardReceived: CardReceived | '';
  autonNotes?: string;
  notes: string;
}

export interface SyncRecord<T> {
  id: string;
  type: 'pitScout' | 'matchScout';
  timestamp: number;
  data: T;
}

export interface TBATeam {
  key: string;
  team_number: number;
  nickname: string;
  name: string;
  city: string;
  state_prov: string;
  country: string;
}

export interface TBAMatch {
  key: string;
  comp_level: string;
  set_number: number;
  match_number: number;
  alliances: {
    red: { team_keys: string[] };
    blue: { team_keys: string[] };
  };
}

export interface TeamImportData {
  teamNumber: number;
  previousCompRank: string;
  autoFuelCount: number | null;
  autoNotes: string;
}

export interface TBAEvent {
  key: string;
  name: string;
  event_code?: string;
  event_type_string?: string;
  city?: string;
  state_prov?: string;
  country?: string;
  year?: number;
  start_date?: string;
  end_date?: string;
}

export interface CompetitionProfile {
  id: string;
  eventKey: string;
  name: string;
  location: string;
  year?: number;
  teamCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface FaceIdEnrollmentPayload {
  personName: string;
  embedding: number[];
  photoUrls: string[];
  embeddingModel?: string;
  acceptedFrames?: number;
  qualityScore?: number;
  eventKey?: string | null;
  profileId?: string | null;
}

export interface FaceIdEnrollmentResponse {
  id: string;
  personName: string;
  photoCount: number;
  embeddingModel: string;
  action?: 'created_new' | 'upserted_duplicate' | 'skipped_duplicate_lower_quality';
}

export interface FaceIdVerifyPayload {
  embedding: number[];
  threshold?: number;
  minMargin?: number;
  minConfidence?: number;
  qualityFloor?: number;
  embeddingModel?: string;
  eventKey?: string | null;
  profileId?: string | null;
}

export interface FaceIdVerifyResponse {
  matched: boolean;
  decision?: 'match' | 'borderline' | 'no_match';
  decisionReason?: string;
  name: string | null;
  enrollmentId: string | null;
  distance: number | null;
  secondBestDistance?: number | null;
  margin?: number | null;
  confidence?: number | null;
  checked: number;
  candidatesChecked?: number;
  threshold: number;
  minMargin?: number;
  minConfidence?: number;
  qualityFloor?: number;
}
