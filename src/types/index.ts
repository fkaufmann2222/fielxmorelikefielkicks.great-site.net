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

export interface PitScoutData {
  teamNumber: number | '';
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
  defendedAgainst: boolean;
  hubScoringStrategy: HubScoringStrategy | '';

  // End Game
  endGameClimbResult: EndGameClimbResult | '';
  climbTimeSeconds: number | '';

  // Post-Match
  foulsCaused: number;
  cardReceived: CardReceived | '';
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
