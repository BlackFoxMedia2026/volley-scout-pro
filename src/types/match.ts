import type { Skill, Quality, TeamSide } from './dv4';

export type { TeamSide } from './dv4';

// ─────────────────────────────────────────────
// IDENTIFIERS
// ─────────────────────────────────────────────

export type ULID = string;

// ─────────────────────────────────────────────
// DOMAIN ENTITIES
// ─────────────────────────────────────────────

export interface Player {
  id: ULID;
  firstName: string;
  lastName: string;
  number: number;
  role: 'S' | 'OH' | 'OP' | 'MB' | 'L' | 'DS';
  isLibero: boolean;
}

export interface Team {
  id: ULID;
  name: string;
  shortName: string;
  isOwnTeam: boolean;
  players: Player[];
}

// ─────────────────────────────────────────────
// MATCH STATE (derived from event replay)
// ─────────────────────────────────────────────

export type MatchPhase =
  | 'not_started'
  | 'set_warmup'
  | 'in_rally'
  | 'between_rallies'
  | 'timeout'
  | 'substitution'
  | 'set_end'
  | 'match_end';

export interface RotationState {
  positions: [ULID|null, ULID|null, ULID|null, ULID|null, ULID|null, ULID|null];
  // positions[0]=pos1(server), [1]=pos2, ..., [5]=pos6
  libero1Id: ULID | null;
  libero2Id: ULID | null;
  setterId: ULID | null;
  rotationIndex: number;  // 0-5, how many rotations from initial
  isConfirmed: boolean;
}

export interface SetScore {
  home: number;
  away: number;
}

export interface MatchState {
  matchId: ULID;
  phase: MatchPhase;
  currentSet: number;               // 1-5
  score: SetScore;                  // current set score
  setsWon: { home: number; away: number };
  setCores: SetScore[];             // completed sets scores
  servingTeam: TeamSide;
  rotation: { home: RotationState; away: RotationState };
  timeoutsUsed: { home: number; away: number };
  substitutionsUsed: { home: number; away: number };
  currentRallyEvents: MatchEvent[]; // events in the current open rally
  lastEventSequence: number;
}

// ─────────────────────────────────────────────
// EVENTS (append-only log entries)
// ─────────────────────────────────────────────

export type EventType =
  // Scouting actions (from DV4 codes)
  | 'serve'
  | 'reception'
  | 'set'
  | 'attack'
  | 'block'
  | 'dig'
  | 'freeball'
  // Rally lifecycle
  | 'rally_start'
  | 'rally_end'
  | 'point'
  // Match lifecycle
  | 'match_start'
  | 'set_start'
  | 'set_end'
  | 'match_end'
  // Stoppages
  | 'timeout'
  | 'substitution'
  | 'libero_swap'
  | 'challenge'
  | 'video_check'
  // Meta
  | 'setter_call'
  | 'formation_enter'
  | 'comment'
  | 'score_correction'
  | 'undo'
  | 'serve_assign'
  | 'setter_assign';

export interface EventPayload {
  // Common to scouting events
  skill?: Skill;
  skillType?: string;
  quality?: Quality;
  combination?: string;
  zoneFrom?: number;
  zoneTo?: number;
  zoneToSub?: string;
  // Point events
  pointTeam?: TeamSide;
  // Rally end reason
  rallyEndReason?: 'kill' | 'error' | 'net_touch' | 'out' | 'rotation_fault' | 'challenge_overturned' | 'other';
  // Substitution
  playerOutId?: ULID;
  playerInId?: ULID;
  position?: number;
  // Setter call
  setterCallCode?: string;
  // Undo
  undoTargetSeq?: number;
  // Formation
  formation?: RotationState;
  // Smart time (video sync)
  videoTsMs?: number;
  // Freeform
  text?: string;
  [key: string]: unknown;
}

export interface MatchEvent {
  id: ULID;
  matchId: ULID;
  setId?: ULID;
  rallyId?: ULID;
  sequence: number;           // monotonic per match
  timestampMs: number;        // wall clock
  videoTsMs?: number;         // video timestamp if synced
  type: EventType;
  actorUserId: ULID;
  playerId?: ULID;
  teamSide?: TeamSide;
  rawCode?: string;
  payload: EventPayload;
  isValid: boolean;
  undoneSince?: number;       // ms when undone
  undoneBySeq?: number;       // sequence of the UNDO event
}

// ─────────────────────────────────────────────
// SMART TIME CONFIG
// ─────────────────────────────────────────────

export interface SmartTimeConfig {
  serveToFirstAttackMs: number;    // default 3000
  attackToAttackMs: number;        // default 3200
  lastAttackToEndMs: number;       // default 3000
  receptionToSetMs?: number;       // default 1000
  setToAttackMs?: number;          // default 1500
}

export const DEFAULT_SMART_TIME: SmartTimeConfig = {
  serveToFirstAttackMs: 3000,
  attackToAttackMs: 3200,
  lastAttackToEndMs: 3000,
  receptionToSetMs: 1000,
  setToAttackMs: 1500,
};
