import { describe, it, expect } from 'vitest';
import {
  computeTeamStats, serveEfficiency, receptionPositivePercent,
  attackKillPercent, serveZoneDistribution,
} from './stats';
import type { MatchEvent } from '@/types/match';

function ev(
  seq: number,
  type: MatchEvent['type'],
  teamSide: 'home' | 'away',
  quality: string,
  playerId = 'p1',
  extra: Partial<MatchEvent['payload']> = {},
): MatchEvent {
  return {
    id: `e${seq}`,
    matchId: 'm1',
    sequence: seq,
    timestampMs: Date.now() + seq * 1000,
    type,
    actorUserId: 'u1',
    playerId,
    teamSide,
    payload: { skill: type === 'serve' ? 'S' : type === 'reception' ? 'R' : type === 'attack' ? 'A' : 'B', quality: quality as import('@/types/dv4').Quality, ...extra },
    isValid: true,
  };
}

describe('computeTeamStats', () => {
  it('counts serve events correctly', () => {
    const events = [
      ev(1, 'serve', 'home', '#'),  // ace
      ev(2, 'serve', 'home', '+'),  // positive
      ev(3, 'serve', 'home', '='),  // error
      ev(4, 'serve', 'away', '#'),  // ignored (wrong team)
    ];
    const stats = computeTeamStats(events, 'home');
    const serve = stats.bySkill['S']!;
    expect(serve.total).toBe(3);
    expect(serve.excellent).toBe(1);
    expect(serve.error).toBe(1);
    expect(serve.efficiency).toBe(0); // (1-1)/3 = 0%
  });

  it('computes positive% correctly', () => {
    const events = [
      ev(1, 'serve', 'home', '#'),
      ev(2, 'serve', 'home', '+'),
      ev(3, 'serve', 'home', '!'),
      ev(4, 'serve', 'home', '='),
    ];
    const stats = computeTeamStats(events, 'home');
    // positive% = (# + +) / total = 2/4 = 50%
    expect(stats.bySkill['S']!.positivePercent).toBe(50);
  });

  it('ignores undone events', () => {
    const events = [
      ev(1, 'serve', 'home', '#'),
      { ...ev(2, 'serve', 'home', '#'), undoneBySeq: 3 }, // undone
    ];
    const stats = computeTeamStats(events, 'home');
    expect(stats.bySkill['S']!.total).toBe(1);
  });

  it('groups by player', () => {
    const events = [
      ev(1, 'serve', 'home', '#', 'p1'),
      ev(2, 'serve', 'home', '#', 'p1'),
      ev(3, 'serve', 'home', '=', 'p2'),
    ];
    const stats = computeTeamStats(events, 'home');
    expect(stats.byPlayer).toHaveLength(2);
    const p1 = stats.byPlayer.find(p => p.playerId === 'p1')!;
    expect(p1.bySkill['S']!.total).toBe(2);
    expect(p1.bySkill['S']!.excellent).toBe(2);
  });
});

describe('serveEfficiency', () => {
  it('computes (aces - errors) / total * 100', () => {
    const events = [
      ev(1, 'serve', 'home', '#'),
      ev(2, 'serve', 'home', '#'),
      ev(3, 'serve', 'home', '='),
      ev(4, 'serve', 'home', '!'),
    ];
    // (2-1)/4 * 100 = 25
    expect(serveEfficiency(events)).toBe(25);
  });

  it('filters by playerId when provided', () => {
    const events = [
      ev(1, 'serve', 'home', '#', 'p1'),
      ev(2, 'serve', 'home', '=', 'p2'),
    ];
    expect(serveEfficiency(events, 'p1')).toBe(100);
    expect(serveEfficiency(events, 'p2')).toBe(-100);
  });
});

describe('receptionPositivePercent', () => {
  it('computes (# + +) / total for receptions', () => {
    const events = [
      ev(1, 'reception', 'home', '#'),
      ev(2, 'reception', 'home', '+'),
      ev(3, 'reception', 'home', '-'),
      ev(4, 'reception', 'home', '='),
    ];
    expect(receptionPositivePercent(events)).toBe(50);
  });
});

describe('attackKillPercent', () => {
  it('computes kills / total', () => {
    const events = [
      ev(1, 'attack', 'home', '#'),
      ev(2, 'attack', 'home', '+'),
      ev(3, 'attack', 'home', '='),
      ev(4, 'attack', 'home', '-'),
    ];
    expect(attackKillPercent(events)).toBe(25);
  });
});

describe('serveZoneDistribution', () => {
  it('groups serve events by target zone', () => {
    const events = [
      ev(1, 'serve', 'home', '#', 'p1', { zoneTo: 1 }),
      ev(2, 'serve', 'home', '+', 'p1', { zoneTo: 1 }),
      ev(3, 'serve', 'home', '=', 'p1', { zoneTo: 5 }),
    ];
    const dist = serveZoneDistribution(events, 'home');
    const zone1 = dist.find(d => d.zone === 1)!;
    const zone5 = dist.find(d => d.zone === 5)!;
    expect(zone1.count).toBe(2);
    expect(zone1.excellent).toBe(1);
    expect(zone5.error).toBe(1);
  });
});
