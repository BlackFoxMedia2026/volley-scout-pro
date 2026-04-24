import { describe, it, expect } from 'vitest';
import {
  rotateClockwise, rotateCounterClockwise, reconstructFormation,
  validateFormation, playerPosition, formationAtRotation,
} from './formationEngine';
import type { FormationSnapshot } from './formationEngine';
import type { MatchEvent } from '@/types/match';

function mockServeEvent(seq: number, playerId: string): MatchEvent {
  return {
    id: `ev${seq}`,
    matchId: 'm1',
    sequence: seq,
    timestampMs: Date.now() + seq * 1000,
    type: 'serve',
    actorUserId: 'user1',
    playerId,
    teamSide: 'home',
    payload: { skill: 'S', quality: '#' },
    isValid: true,
  };
}

const INITIAL_FORMATION: FormationSnapshot = {
  positions: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
  setterId: 'p1',
  libero1Id: null,
  libero2Id: null,
  rotationIndex: 0,
  isConfirmed: true,
  entryMethod: 'manual',
};

describe('rotation', () => {
  it('rotateClockwise moves pos6 to pos1', () => {
    const rotated = rotateClockwise(INITIAL_FORMATION.positions as [string|null,string|null,string|null,string|null,string|null,string|null]);
    expect(rotated[0]).toBe('p6'); // p6 → pos1
    expect(rotated[1]).toBe('p1'); // p1 → pos2
    expect(rotated[5]).toBe('p5'); // p5 → pos6
  });

  it('rotateCounterClockwise inverts rotateClockwise', () => {
    const pos = INITIAL_FORMATION.positions as [string|null,string|null,string|null,string|null,string|null,string|null];
    const cw = rotateClockwise(pos);
    const back = rotateCounterClockwise(cw);
    expect(back).toEqual(pos);
  });

  it('6 clockwise rotations return to start', () => {
    let pos = INITIAL_FORMATION.positions as [string|null,string|null,string|null,string|null,string|null,string|null];
    for (let i = 0; i < 6; i++) pos = rotateClockwise(pos);
    expect(pos).toEqual(INITIAL_FORMATION.positions);
  });
});

describe('formationAtRotation', () => {
  it('rotation 1 from initial = one clockwise step', () => {
    const rot1 = formationAtRotation(INITIAL_FORMATION, 1);
    expect(rot1.positions[0]).toBe('p6');
    expect(rot1.rotationIndex).toBe(1);
  });

  it('rotation 0 from rotation 0 = no change', () => {
    const same = formationAtRotation(INITIAL_FORMATION, 0);
    expect(same.positions).toEqual(INITIAL_FORMATION.positions);
  });
});

describe('playerPosition', () => {
  it('finds player at correct position', () => {
    expect(playerPosition(INITIAL_FORMATION, 'p1')).toBe(1);
    expect(playerPosition(INITIAL_FORMATION, 'p6')).toBe(6);
    expect(playerPosition(INITIAL_FORMATION, 'xx')).toBeNull();
  });
});

describe('reconstructFormation', () => {
  it('reconstructs from 6 ordered serve events', () => {
    // servers in order: p1→p6→p5→p4→p3→p2 means formation at rot0:
    // pos1=p1, pos6=p6, pos5=p5, pos4=p4, pos3=p3, pos2=p2
    const events = [
      mockServeEvent(1, 'p1'),
      mockServeEvent(2, 'p6'),
      mockServeEvent(3, 'p5'),
      mockServeEvent(4, 'p4'),
      mockServeEvent(5, 'p3'),
      mockServeEvent(6, 'p2'),
    ];

    const formation = reconstructFormation(events, null, null);
    expect(formation).not.toBeNull();
    expect(formation!.positions[0]).toBe('p1'); // pos1 = first server
    expect(formation!.positions[5]).toBe('p6'); // pos6 = second server
    expect(formation!.positions[4]).toBe('p5'); // pos5 = third server
    expect(formation!.entryMethod).toBe('reconstructed_from_serves');
    expect(formation!.isConfirmed).toBe(false);
  });

  it('returns null with fewer than 6 serves', () => {
    const events = [
      mockServeEvent(1, 'p1'),
      mockServeEvent(2, 'p6'),
    ];
    const formation = reconstructFormation(events, null, null);
    expect(formation).toBeNull();
  });

  it('deduplicates consecutive same-player serves', () => {
    // p1 serves twice (won 2 points), then side-out
    const events = [
      mockServeEvent(1, 'p1'),
      mockServeEvent(2, 'p1'), // duplicate — same rotation
      mockServeEvent(3, 'p6'),
      mockServeEvent(4, 'p5'),
      mockServeEvent(5, 'p4'),
      mockServeEvent(6, 'p3'),
      mockServeEvent(7, 'p2'),
    ];
    const formation = reconstructFormation(events, null, null);
    expect(formation).not.toBeNull();
    expect(formation!.positions[0]).toBe('p1');
  });
});

describe('validateFormation', () => {
  it('valid formation returns no errors', () => {
    const errors = validateFormation(INITIAL_FORMATION, true);
    expect(errors).toHaveLength(0);
  });

  it('detects missing positions', () => {
    const partial: FormationSnapshot = {
      ...INITIAL_FORMATION,
      positions: ['p1', null, 'p3', 'p4', 'p5', 'p6'],
    };
    const errors = validateFormation(partial, true);
    expect(errors.some(e => e.type === 'missing_positions')).toBe(true);
  });

  it('detects duplicate players', () => {
    const dup: FormationSnapshot = {
      ...INITIAL_FORMATION,
      positions: ['p1', 'p1', 'p3', 'p4', 'p5', 'p6'],
    };
    const errors = validateFormation(dup, true);
    expect(errors.some(e => e.type === 'duplicate_player')).toBe(true);
  });

  it('detects libero in front row', () => {
    const withLibero: FormationSnapshot = {
      ...INITIAL_FORMATION,
      positions: ['p1', 'libero', 'p3', 'p4', 'p5', 'p6'], // libero at pos2 (front)
      libero1Id: 'libero',
    };
    const errors = validateFormation(withLibero, true);
    expect(errors.some(e => e.type === 'libero_in_front_row')).toBe(true);
  });
});
