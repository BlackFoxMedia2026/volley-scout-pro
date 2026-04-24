import { describe, it, expect } from 'vitest';
import { initialMatchState, matchReducer, replayEvents } from './matchReducer';
import type { MatchEvent } from '@/types/match';
import { monotonicFactory } from 'ulid';

const ulid = monotonicFactory();
const NOW = Date.now();
const USER = 'user_01';

function makeEvent(
  sequence: number,
  type: MatchEvent['type'],
  overrides: Partial<MatchEvent> = {},
): MatchEvent {
  return {
    id: ulid(),
    matchId: 'match_01',
    sequence,
    timestampMs: NOW + sequence * 1000,
    type,
    actorUserId: USER,
    payload: {},
    isValid: true,
    ...overrides,
  };
}

describe('initialMatchState', () => {
  it('creates a fresh state', () => {
    const s = initialMatchState('match_01');
    expect(s.phase).toBe('not_started');
    expect(s.score).toEqual({ home: 0, away: 0 });
    expect(s.setsWon).toEqual({ home: 0, away: 0 });
    expect(s.lastEventSequence).toBe(0);
  });
});

describe('match_start', () => {
  it('transitions phase to set_warmup', () => {
    const s = matchReducer(
      initialMatchState('m1'),
      makeEvent(1, 'match_start', { teamSide: 'home' }),
    );
    expect(s.phase).toBe('set_warmup');
    expect(s.servingTeam).toBe('home');
  });
});

describe('scoring', () => {
  it('increments home score on home point', () => {
    let s = initialMatchState('m1');
    s = matchReducer(s, makeEvent(1, 'match_start', { teamSide: 'home' }));
    s = matchReducer(s, makeEvent(2, 'set_start', { payload: { setNumber: 1 } }));
    s = matchReducer(s, makeEvent(3, 'point', { payload: { pointTeam: 'home' } }));
    expect(s.score.home).toBe(1);
    expect(s.score.away).toBe(0);
  });

  it('increments away score on away point', () => {
    let s = initialMatchState('m1');
    s = matchReducer(s, makeEvent(1, 'match_start', { teamSide: 'home' }));
    s = matchReducer(s, makeEvent(2, 'set_start', { payload: { setNumber: 1 } }));
    s = matchReducer(s, makeEvent(3, 'point', { payload: { pointTeam: 'away' } }));
    expect(s.score.away).toBe(1);
  });

  it('ends a set at 25-23', () => {
    let s = initialMatchState('m1');
    s = matchReducer(s, makeEvent(1, 'match_start', { teamSide: 'home' }));
    s = matchReducer(s, makeEvent(2, 'set_start', { payload: { setNumber: 1 } }));

    // Bring score to 24-23
    for (let i = 0; i < 24; i++) {
      s = matchReducer(s, makeEvent(3 + i * 2, 'point', { payload: { pointTeam: 'home' } }));
      if (i < 23) {
        s = matchReducer(s, makeEvent(4 + i * 2, 'point', { payload: { pointTeam: 'away' } }));
      }
    }
    // score should be 24-23 — set not yet over
    expect(s.phase).toBe('between_rallies');

    // Final point: 25-23
    const nextSeq = s.lastEventSequence + 1;
    s = matchReducer(s, makeEvent(nextSeq, 'point', { payload: { pointTeam: 'home' } }));
    expect(s.phase).toBe('set_end');
    expect(s.setsWon.home).toBe(1);
    expect(s.score).toEqual({ home: 0, away: 0 }); // reset for next set
  });
});

describe('timeout', () => {
  it('increments timeout counter', () => {
    let s = initialMatchState('m1');
    s = matchReducer(s, makeEvent(1, 'timeout', { teamSide: 'home' }));
    expect(s.timeoutsUsed.home).toBe(1);
    expect(s.timeoutsUsed.away).toBe(0);
    expect(s.phase).toBe('timeout');
  });
});

describe('undo via replay', () => {
  it('neutralises undone event', () => {
    const events: MatchEvent[] = [
      makeEvent(1, 'match_start', { teamSide: 'home' }),
      makeEvent(2, 'set_start', { payload: { setNumber: 1 } }),
      makeEvent(3, 'point', { payload: { pointTeam: 'home' } }), // will be undone
      makeEvent(4, 'undo', { payload: { undoTargetSeq: 3 } }),   // undoes seq 3
    ];

    const s = replayEvents('match_01', events);
    // The point was undone so score should remain 0-0
    expect(s.score.home).toBe(0);
  });

  it('preserves audit trail — un-undone events still present in replay input', () => {
    const events: MatchEvent[] = [
      makeEvent(1, 'match_start', { teamSide: 'home' }),
      makeEvent(2, 'set_start', { payload: { setNumber: 1 } }),
      makeEvent(3, 'point', { payload: { pointTeam: 'home' } }),
      makeEvent(4, 'undo', { payload: { undoTargetSeq: 3 } }),
      makeEvent(5, 'point', { payload: { pointTeam: 'away' } }),
    ];

    const s = replayEvents('match_01', events);
    expect(s.score.home).toBe(0);
    expect(s.score.away).toBe(1);
  });
});

describe('rotation', () => {
  it('rotates team when they win the right to serve', () => {
    let s = initialMatchState('m1');
    // Set initial serving team as home
    s = matchReducer(s, makeEvent(1, 'match_start', { teamSide: 'home' }));
    s = matchReducer(s, makeEvent(2, 'set_start', { payload: { setNumber: 1 } }));

    // Away wins a point — away now serves — away should rotate
    const prevRotationIdx = s.rotation.away.rotationIndex;
    s = matchReducer(s, makeEvent(3, 'point', { payload: { pointTeam: 'away' } }));
    expect(s.rotation.away.rotationIndex).toBe((prevRotationIdx + 1) % 6);
    expect(s.servingTeam).toBe('away');
  });
});
