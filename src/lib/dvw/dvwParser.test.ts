// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseDvw, dvwToEvents } from './dvwParser';

const SAMPLE_DVW = `<?xml version="1.0" encoding="utf-8"?>
<DataVolleyFile>
  <MATCH Date="2024-01-15" Division="Serie A2">
  </MATCH>
  <TEAMS>
    <TEAM-H Name="Milano Volley"/>
    <TEAM-V Name="Roma Volley"/>
  </TEAMS>
  <PLAYERS-H>
    <PLAYER Number="1" Name="Rossi Marco" Role="S"/>
    <PLAYER Number="5" Name="Bianchi Luca" Role="OH"/>
    <PLAYER Number="10" Name="Verdi Paolo" Role="MB"/>
  </PLAYERS-H>
  <PLAYERS-V>
    <PLAYER Number="3" Name="Ferrari Anna" Role="S"/>
    <PLAYER Number="7" Name="Russo Giada" Role="OH"/>
  </PLAYERS-V>
  <SET Number="1">
    <POINT Number="1" HomeScore="1" VisitorScore="0" Serve="1" Video="00:00:05.01" Code="a01S#" HRotation="153624" VRotation="372615"/>
    <POINT Number="2" HomeScore="1" VisitorScore="1" Serve="0" Video="00:00:12.03" Code="b03R+" HRotation="153624" VRotation="372615"/>
    <POINT Number="3" HomeScore="2" VisitorScore="1" Serve="1" Video="00:00:20.00" Code="a05AH#" HRotation="153624" VRotation="372615"/>
  </SET>
</DataVolleyFile>`;

describe('parseDvw', () => {
  it('parses match metadata', () => {
    const dvw = parseDvw(SAMPLE_DVW);
    expect(dvw.date).toBe('2024-01-15');
    expect(dvw.homeTeam).toBe('Milano Volley');
    expect(dvw.awayTeam).toBe('Roma Volley');
    expect(dvw.tournament).toBe('Serie A2');
  });

  it('parses home players', () => {
    const dvw = parseDvw(SAMPLE_DVW);
    expect(dvw.homePlayers).toHaveLength(3);
    expect(dvw.homePlayers[0].number).toBe(1);
    expect(dvw.homePlayers[0].name).toBe('Rossi Marco');
  });

  it('parses away players', () => {
    const dvw = parseDvw(SAMPLE_DVW);
    expect(dvw.awayPlayers).toHaveLength(2);
    expect(dvw.awayPlayers[0].number).toBe(3);
  });

  it('parses set with points', () => {
    const dvw = parseDvw(SAMPLE_DVW);
    expect(dvw.sets).toHaveLength(1);
    expect(dvw.sets[0].setNumber).toBe(1);
    expect(dvw.sets[0].points).toHaveLength(3);
  });

  it('parses point attributes', () => {
    const dvw = parseDvw(SAMPLE_DVW);
    const p1 = dvw.sets[0].points[0];
    expect(p1.code).toBe('a01S#');
    expect(p1.serve).toBe('home');
    expect(p1.homeScore).toBe(1);
    expect(p1.visitorScore).toBe(0);
    expect(p1.videoTimestamp).toBe('00:00:05.01');
  });
});

describe('dvwToEvents', () => {
  it('converts DVW to event log', () => {
    const dvw = parseDvw(SAMPLE_DVW);
    const result = dvwToEvents(dvw, {
      matchId: 'm1',
      actorUserId: 'u1',
      homePlayerIdMap: new Map([[1, 'p1'], [5, 'p5'], [10, 'p10']]),
      awayPlayerIdMap: new Map([[3, 'p3'], [7, 'p7']]),
    });

    expect(result.events.length).toBeGreaterThan(0);
    // Should have match_start, set_start, serve events, point events, set_end, match_end
    const types = result.events.map(e => e.type);
    expect(types).toContain('match_start');
    expect(types).toContain('set_start');
    expect(types).toContain('serve');
    expect(types).toContain('point');
    expect(types).toContain('set_end');
    expect(types).toContain('match_end');
  });

  it('maps player IDs correctly', () => {
    const dvw = parseDvw(SAMPLE_DVW);
    const result = dvwToEvents(dvw, {
      matchId: 'm1',
      actorUserId: 'u1',
      homePlayerIdMap: new Map([[1, 'player-uuid-1']]),
      awayPlayerIdMap: new Map([[3, 'player-uuid-3']]),
    });

    const serveEv = result.events.find(e => e.type === 'serve' && e.teamSide === 'home');
    expect(serveEv?.playerId).toBe('player-uuid-1');
  });

  it('parses video timestamps', () => {
    const dvw = parseDvw(SAMPLE_DVW);
    const result = dvwToEvents(dvw, {
      matchId: 'm1',
      actorUserId: 'u1',
      homePlayerIdMap: new Map([[1, 'p1']]),
      awayPlayerIdMap: new Map(),
    });

    const serveEv = result.events.find(e => e.type === 'serve');
    // 00:00:05.01 → 5010ms
    expect(serveEv?.videoTsMs).toBe(5010);
  });

  it('handles skipped invalid codes gracefully', () => {
    const badDvw = parseDvw(SAMPLE_DVW);
    badDvw.sets[0].points.push({
      number: 99, homeScore: 3, visitorScore: 1, serve: 'home',
      code: 'INVALID_CODE_XYZ',
    });
    const result = dvwToEvents(badDvw, {
      matchId: 'm1', actorUserId: 'u1',
      homePlayerIdMap: new Map(), awayPlayerIdMap: new Map(),
    });
    expect(result.skippedCodes).toContain('INVALID_CODE_XYZ');
  });
});
