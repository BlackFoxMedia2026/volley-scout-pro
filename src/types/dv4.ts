// DV4 Code format: up to 20 characters
// [team][num][skill][type][quality][combination(2)][zoneFrom][zoneTo][zoneToSub][endZonePlus(2)][ext(4)][custom(5)]

export type TeamSide = 'home' | 'away';

export type Skill = 'S' | 'R' | 'A' | 'B' | 'D' | 'E' | 'F';
// S=Serve R=Reception A=Attack B=Block D=Dig E=Set F=Freeball

export type SkillType =
  | 'H' | 'M' | 'Q' | 'T' | 'U' | 'N' | 'O' // serve types
  | 'O' | 'P' | 'E'                            // reception types (overlap intentional in DV4)
  | 'H' | 'P' | 'T' | 'S' | 'B' | 'C';        // attack types

export type Quality = '=' | '/' | '-' | '!' | '+' | '#';
// = Error / Slash=Negative - Negative ! OK + Positive # Excellent/Ace/Kill

export type SetterCallCode = 'K1'|'K2'|'K3'|'K4'|'K5'|'K6'|'K7'|'K8'|'K9';

export type AutoCode =
  | '*z1'|'*z2'|'*z3'|'*z4'|'*z5'|'*z6'  // rotation errors home/away
  | '*p'                                   // libero illegal contact
  | '*c'                                   // coach card
  | '*P'                                   // penetration fault
  | '$&H='                                 // rally ended by hand signal (no code)
  ;

export interface ParsedCode {
  raw: string;

  // Main code (positions 1-6)
  teamSide: TeamSide;
  playerNumber: number;              // 00-99
  skill: Skill;
  skillType: string | null;          // 1 char
  quality: Quality | null;

  // Advanced code (positions 7-13)
  combination: string | null;        // 2 chars: attack combination or setter call (K1-K9)
  zoneFrom: number | null;           // 1-9
  zoneTo: number | null;             // 1-9
  zoneToSub: 'A'|'B'|'C'|'D' | null; // sub-zone within target zone
  endZonePlus: string | null;        // 2 chars: advanced endpoint info

  // Extended code (positions 14-17)
  extType: string | null;            // H=HardSpike P=SoftSpike T=Tip
  extBlockers: number | null;        // number of blockers (1-3)
  extSpecial: string | null;         // X=direct, S=sideout, etc.
  extFlag: string | null;

  // Custom (positions 18-20, up to 5 chars in practice)
  custom: string | null;

  // Parsed metadata
  isSetterCall: boolean;
  setterCallCode: SetterCallCode | null;
  isAutoCode: boolean;
  autoCode: AutoCode | null;
  isCompound: boolean;               // paired with another event via . notation
  compoundPair?: ParsedCode;         // the second event in a compound code
}

export interface ParseError {
  code: 'INVALID_TEAM' | 'INVALID_PLAYER' | 'INVALID_SKILL' | 'INVALID_QUALITY'
      | 'INVALID_ZONE' | 'UNKNOWN_COMBINATION' | 'MALFORMED_CODE';
  message: string;
  position?: number;
}

export type ParseResult =
  | { ok: true;  value: ParsedCode }
  | { ok: false; errors: ParseError[]; partial?: ParsedCode };

// Quality descriptions for UI display
export const QUALITY_LABELS: Record<Quality, string> = {
  '#': 'Eccellente / Ace / Kill',
  '+': 'Positivo',
  '!': 'OK / In-system',
  '-': 'Negativo',
  '/': 'Scarso',
  '=': 'Errore',
};

export const SKILL_LABELS: Record<Skill, string> = {
  S: 'Battuta',
  R: 'Ricezione',
  A: 'Attacco',
  B: 'Muro',
  D: 'Difesa',
  E: 'Alzata',
  F: 'Freeball',
};

// These qualities terminate a rally
export const RALLY_ENDING_QUALITIES: Quality[] = ['#', '='];
