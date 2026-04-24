import type { MatchEvent } from '@/types/match';

// ─────────────────────────────────────────────
// FORMATION ENGINE
//
// Two entry paths:
// 1. Manual (FORM command): user fills positions 1-6 explicitly
// 2. Auto-reconstruct: derive from first 6 serve events per set
//
// Volleyball rotation convention:
//   Pos 1 = back-right (server)
//   Pos 2 = front-right
//   Pos 3 = front-center
//   Pos 4 = front-left
//   Pos 5 = back-left
//   Pos 6 = back-center
//
// When a team side-outs (wins a rally as receiver) they rotate clockwise:
//   new_pos1 ← old_pos6
//   new_pos2 ← old_pos1
//   new_pos3 ← old_pos2
//   new_pos4 ← old_pos3
//   new_pos5 ← old_pos4
//   new_pos6 ← old_pos5
// ─────────────────────────────────────────────

export type Position6 = [string|null, string|null, string|null, string|null, string|null, string|null];

export interface FormationSnapshot {
  positions: Position6;    // positions[0] = pos1 (server), indexed 0-5
  setterId: string | null;
  libero1Id: string | null;
  libero2Id: string | null;
  rotationIndex: number;   // 0 = initial (as entered), 1-5 = subsequent rotations
  isConfirmed: boolean;
  entryMethod: 'manual' | 'reconstructed_from_serves' | 'imported_dvw';
}

// ─────────────────────────────────────────────
// ROTATION HELPERS
// ─────────────────────────────────────────────

export function rotateClockwise(positions: Position6): Position6 {
  // Rotation: last player moves to position 1 (back-right → server)
  return [positions[5], positions[0], positions[1], positions[2], positions[3], positions[4]];
}

export function rotateCounterClockwise(positions: Position6): Position6 {
  // Inverse of rotateClockwise
  return [positions[1], positions[2], positions[3], positions[4], positions[5], positions[0]];
}

// Get the position (1-6) of a player in the current formation
export function playerPosition(formation: FormationSnapshot, playerId: string): number | null {
  const idx = formation.positions.findIndex(p => p === playerId);
  return idx === -1 ? null : idx + 1;
}

// Get the formation at a specific rotation index relative to the initial
export function formationAtRotation(initial: FormationSnapshot, targetRotation: number): FormationSnapshot {
  let positions = [...initial.positions] as Position6;
  const rotations = ((targetRotation - initial.rotationIndex) % 6 + 6) % 6;
  for (let i = 0; i < rotations; i++) {
    positions = rotateClockwise(positions);
  }
  return {
    ...initial,
    positions,
    rotationIndex: targetRotation,
  };
}

// ─────────────────────────────────────────────
// AUTO-RECONSTRUCTION
//
// Algorithm:
// - Watch serve events for a given team in order
// - Each serve tells us who was at position 1 at that rotation
// - After 6 unique server-rotations, we can infer all 6 positions
// ─────────────────────────────────────────────

export interface ServeRecord {
  playerId: string;
  rotationIndex: number;  // 0-5, inferred from order
}

export function reconstructFormation(
  serveEvents: MatchEvent[],
  libero1Id: string | null,
  libero2Id: string | null,
): FormationSnapshot | null {
  // Collect unique servers in order (deduplicate consecutive same-player serves)
  const servers: string[] = [];
  for (const ev of serveEvents) {
    if (!ev.playerId) continue;
    if (servers[servers.length - 1] !== ev.playerId) {
      servers.push(ev.playerId);
    }
    if (servers.length === 6) break;
  }

  if (servers.length < 6) return null; // not enough data yet

  // servers[0] was at pos1 in rotation 0, servers[1] was at pos1 in rotation 1, etc.
  // To reconstruct rotation 0 (initial lineup), we need to reverse the rotations:
  // In rotation k, the player who served was at pos1.
  // Rotation 1 is one clockwise step from rotation 0, so:
  //   In rotation 0: pos1=servers[0], pos6=servers[1], pos5=servers[2], ...
  //   because rotateClockwise moves pos6 → pos1
  //
  // Build rotation-0 positions:
  //   pos1 = servers[0]
  //   pos6 = servers[1]  (they'll be pos1 after next rotation)
  //   pos5 = servers[2]
  //   pos4 = servers[3]
  //   pos3 = servers[4]
  //   pos2 = servers[5]

  const positions: Position6 = [
    servers[0],   // pos1
    servers[5],   // pos2
    servers[4],   // pos3
    servers[3],   // pos4
    servers[2],   // pos5
    servers[1],   // pos6
  ];

  // If any libero appears in the reconstructed positions, flag isConfirmed=false
  // so the user is prompted to correct the substituted positions.

  return {
    positions,
    setterId: null,   // caller must identify setter from roles
    libero1Id,
    libero2Id,
    rotationIndex: 0,
    isConfirmed: false,
    entryMethod: 'reconstructed_from_serves',
  };
}

// ─────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────

export interface FormationError {
  type: 'duplicate_player' | 'missing_positions' | 'libero_in_front_row';
  message: string;
  positions?: number[];
}

export function validateFormation(
  formation: FormationSnapshot,
  _isServing: boolean,
): FormationError[] {
  const errors: FormationError[] = [];
  const { positions, libero1Id, libero2Id } = formation;

  // Check for missing positions
  const missing = positions
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p === null)
    .map(({ i }) => i + 1);
  if (missing.length > 0) {
    errors.push({ type: 'missing_positions', message: `Posizioni vuote: ${missing.join(', ')}`, positions: missing });
  }

  // Check for duplicate players
  const seen = new Set<string>();
  const duplicates: number[] = [];
  positions.forEach((p, i) => {
    if (p !== null) {
      if (seen.has(p)) duplicates.push(i + 1);
      seen.add(p);
    }
  });
  if (duplicates.length > 0) {
    errors.push({ type: 'duplicate_player', message: `Giocatori duplicati alle posizioni: ${duplicates.join(', ')}` });
  }

  // Libero cannot be in front row (positions 2, 3, 4)
  const frontRow = [positions[1], positions[2], positions[3]]; // pos2,3,4
  const liberoInFront = frontRow.some(p => p === libero1Id || p === libero2Id);
  if (liberoInFront) {
    errors.push({ type: 'libero_in_front_row', message: 'Il libero non può essere in zona d\'attacco (pos 2-4)' });
  }

  return errors;
}

// ─────────────────────────────────────────────
// COURT DIAGRAM DATA (for UI rendering)
// ─────────────────────────────────────────────

// Court positions as [col, row] in a 3x2 grid
// Home team view (looking from home side):
//   pos4 pos3 pos2   (row 0, front: left center right)
//   pos5 pos6 pos1   (row 1, back:  left center right)
export const COURT_GRID: Record<number, { col: number; row: number; label: string }> = {
  1: { col: 2, row: 1, label: 'P1 (server)' },
  2: { col: 2, row: 0, label: 'P2' },
  3: { col: 1, row: 0, label: 'P3' },
  4: { col: 0, row: 0, label: 'P4' },
  5: { col: 0, row: 1, label: 'P5' },
  6: { col: 1, row: 1, label: 'P6' },
};
