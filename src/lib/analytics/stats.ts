import type { MatchEvent, TeamSide } from '@/types/match';
import type { Quality, Skill } from '@/types/dv4';
import { matchReducer, initialMatchState } from '@/lib/reducer/matchReducer';

// ─────────────────────────────────────────────
// QUALITY WEIGHTS (DV4-compatible)
// ─────────────────────────────────────────────

const QUALITY_WEIGHT: Record<Quality, number> = {
  '#': 3,   // ace / kill / perfect
  '+': 2,   // positive / in-system
  '!': 1,   // ok / in-play but not positive
  '-': 0,   // negative / out-of-system
  '/': -1,  // poor / dig but rally continues negatively
  '=': -3,  // error / point for opponent
};

// ─────────────────────────────────────────────
// CORE STAT INTERFACES
// ─────────────────────────────────────────────

export interface SkillStats {
  total: number;
  excellent: number;  // # (ace, kill, perfect reception)
  positive: number;   // +
  ok: number;         // !
  negative: number;   // -
  poor: number;       // /
  error: number;      // =
  positivePercent: number;   // (# + +) / total × 100
  efficiency: number;        // (# − =) / total × 100  [DV4 efficiency]
  weightedRating: number;    // sum of weights / total (−3 to +3)
}

export interface PlayerStats {
  playerId: string;
  playerNumber?: number;
  bySkill: Partial<Record<Skill, SkillStats>>;
}

export interface TeamStats {
  teamSide: TeamSide;
  bySkill: Partial<Record<Skill, SkillStats>>;
  byPlayer: PlayerStats[];
  rotationStats: RotationStats[];
  rallyStats: RallyStats;
}

export interface RotationStats {
  rotationIndex: number;   // 0-5
  pointsWon: number;
  pointsLost: number;
  sideouts: number;        // won point as receiver
  breakpoints: number;     // won point as server
}

export interface RallyStats {
  total: number;
  sideoutPercent: number;   // receiving team wins
  breakpointPercent: number; // serving team wins
  avgDurationMs?: number;
}

export interface MatchStats {
  home: TeamStats;
  away: TeamStats;
  sets: SetStats[];
}

export interface SetStats {
  setNumber: number;
  home: TeamStats;
  away: TeamStats;
}

// ─────────────────────────────────────────────
// CORE AGGREGATOR
// ─────────────────────────────────────────────

function emptySkill(): SkillStats {
  return {
    total: 0, excellent: 0, positive: 0, ok: 0, negative: 0, poor: 0, error: 0,
    positivePercent: 0, efficiency: 0, weightedRating: 0,
  };
}

function accumulateQuality(stats: SkillStats, quality: Quality | null): void {
  if (!quality) return;
  stats.total++;
  switch (quality) {
    case '#': stats.excellent++; break;
    case '+': stats.positive++;  break;
    case '!': stats.ok++;        break;
    case '-': stats.negative++;  break;
    case '/': stats.poor++;      break;
    case '=': stats.error++;     break;
  }
}

function finalise(stats: SkillStats): SkillStats {
  if (stats.total === 0) return stats;
  const { total, excellent, positive, error } = stats;
  stats.positivePercent = Math.round(((excellent + positive) / total) * 100);
  stats.efficiency = Math.round(((excellent - error) / total) * 100);

  let weightSum = 0;
  const qualities: [Quality, number][] = [
    ['#', stats.excellent], ['+', stats.positive], ['!', stats.ok],
    ['-', stats.negative], ['/', stats.poor], ['=', stats.error],
  ];
  for (const [q, count] of qualities) weightSum += QUALITY_WEIGHT[q] * count;
  stats.weightedRating = weightSum / total;
  return stats;
}

// ─────────────────────────────────────────────
// BUILD TEAM STATS FROM EVENT LOG
// ─────────────────────────────────────────────

export function computeTeamStats(
  events: MatchEvent[],
  teamSide: TeamSide,
  setNumber?: number,
): TeamStats {
  const SCOUTING_SKILLS: Skill[] = ['S', 'R', 'A', 'B', 'D', 'E', 'F'];

  // Filter relevant events
  const filtered = events.filter(ev => {
    if (ev.undoneBySeq !== undefined) return false;
    if (ev.type === 'undo') return false;
    if (ev.teamSide !== teamSide) return false;
    if (setNumber !== undefined && ev.payload.setNumber !== undefined &&
        ev.payload.setNumber !== setNumber) return false;
    return SCOUTING_SKILLS.includes(ev.payload.skill as Skill);
  });

  // Aggregate by skill (team level)
  const bySkill: Partial<Record<Skill, SkillStats>> = {};
  for (const skill of SCOUTING_SKILLS) bySkill[skill] = emptySkill();

  // Aggregate by player
  const playerMap = new Map<string, Record<Skill, SkillStats>>();

  for (const ev of filtered) {
    const skill = ev.payload.skill as Skill | undefined;
    const quality = ev.payload.quality as Quality | null | undefined;
    if (!skill) continue;

    // Team-level
    if (!bySkill[skill]) bySkill[skill] = emptySkill();
    accumulateQuality(bySkill[skill]!, quality ?? null);

    // Player-level
    const pid = ev.playerId;
    if (pid) {
      if (!playerMap.has(pid)) {
        playerMap.set(pid, Object.fromEntries(
          SCOUTING_SKILLS.map(s => [s, emptySkill()])
        ) as Record<Skill, SkillStats>);
      }
      const pStats = playerMap.get(pid)!;
      if (!pStats[skill]) pStats[skill] = emptySkill();
      accumulateQuality(pStats[skill], quality ?? null);
    }
  }

  // Finalise team stats
  for (const skill of SCOUTING_SKILLS) {
    if (bySkill[skill]) bySkill[skill] = finalise(bySkill[skill]!);
  }

  // Finalise player stats
  const byPlayer: PlayerStats[] = Array.from(playerMap.entries()).map(([pid, skillMap]) => ({
    playerId: pid,
    bySkill: Object.fromEntries(
      Object.entries(skillMap).map(([s, st]) => [s, finalise(st)])
    ) as Partial<Record<Skill, SkillStats>>,
  }));

  // Rally stats
  const pointEvents = events.filter(ev =>
    ev.type === 'point' && !ev.undoneBySeq,
  );
  const rallyStats = computeRallyStats(pointEvents, teamSide);

  return {
    teamSide,
    bySkill,
    byPlayer,
    rotationStats: [],   // filled separately when formation data is available
    rallyStats,
  };
}

function computeRallyStats(pointEvents: MatchEvent[], teamSide: TeamSide): RallyStats {
  // For sideout/break we need to know who was serving — this requires
  // the serving team from context. As a simplification, we count
  // won/lost rallies by point team.
  const total = pointEvents.length;
  if (total === 0) return { total: 0, sideoutPercent: 0, breakpointPercent: 0 };

  // Approximate: count how many points this team won
  const won = pointEvents.filter(ev => ev.payload.pointTeam === teamSide).length;
  const winPercent = Math.round((won / total) * 100);

  return {
    total,
    sideoutPercent: winPercent,  // simplified — full calculation needs rotation context
    breakpointPercent: 100 - winPercent,
  };
}

// ─────────────────────────────────────────────
// FULL MATCH STATS
// ─────────────────────────────────────────────

export function computeMatchStats(events: MatchEvent[]): MatchStats {
  return {
    home: computeTeamStats(events, 'home'),
    away: computeTeamStats(events, 'away'),
    sets: [],   // set-by-set computed on demand
  };
}

// ─────────────────────────────────────────────
// SINGLE-STAT HELPERS (used by UI sparklines)
// ─────────────────────────────────────────────

export function serveEfficiency(events: MatchEvent[], playerId?: string): number {
  const filtered = events.filter(ev =>
    ev.type === 'serve' && !ev.undoneBySeq &&
    (!playerId || ev.playerId === playerId),
  );
  const stats = emptySkill();
  for (const ev of filtered) accumulateQuality(stats, ev.payload.quality as Quality ?? null);
  return finalise(stats).efficiency;
}

export function receptionPositivePercent(events: MatchEvent[], playerId?: string): number {
  const filtered = events.filter(ev =>
    ev.type === 'reception' && !ev.undoneBySeq &&
    (!playerId || ev.playerId === playerId),
  );
  const stats = emptySkill();
  for (const ev of filtered) accumulateQuality(stats, ev.payload.quality as Quality ?? null);
  return finalise(stats).positivePercent;
}

export function attackKillPercent(events: MatchEvent[], playerId?: string): number {
  const filtered = events.filter(ev =>
    ev.type === 'attack' && !ev.undoneBySeq &&
    (!playerId || ev.playerId === playerId),
  );
  const stats = emptySkill();
  for (const ev of filtered) accumulateQuality(stats, ev.payload.quality as Quality ?? null);
  const fin = finalise(stats);
  return fin.total === 0 ? 0 : Math.round((fin.excellent / fin.total) * 100);
}

// ─────────────────────────────────────────────
// SERVE DISTRIBUTION (zone-based)
// ─────────────────────────────────────────────

export interface ZoneDistribution {
  zone: number;
  count: number;
  excellent: number;
  error: number;
}

export function serveZoneDistribution(events: MatchEvent[], teamSide?: TeamSide): ZoneDistribution[] {
  const filtered = events.filter(ev =>
    ev.type === 'serve' && !ev.undoneBySeq &&
    (!teamSide || ev.teamSide === teamSide),
  );
  return buildZoneDistribution(filtered, 'zoneTo');
}

export function attackZoneDistribution(events: MatchEvent[], teamSide?: TeamSide): ZoneDistribution[] {
  const filtered = events.filter(ev =>
    ev.type === 'attack' && !ev.undoneBySeq &&
    (!teamSide || ev.teamSide === teamSide),
  );
  return buildZoneDistribution(filtered, 'zoneTo');
}

export function receptionZoneDistribution(events: MatchEvent[], teamSide?: TeamSide): ZoneDistribution[] {
  const filtered = events.filter(ev =>
    ev.type === 'reception' && !ev.undoneBySeq &&
    (!teamSide || ev.teamSide === teamSide),
  );
  return buildZoneDistribution(filtered, 'zoneFrom');
}

function buildZoneDistribution(events: MatchEvent[], zoneKey: 'zoneFrom' | 'zoneTo'): ZoneDistribution[] {
  const zoneMap = new Map<number, ZoneDistribution>();
  for (const ev of events) {
    const zone = ev.payload[zoneKey] as number | undefined;
    if (!zone) continue;
    if (!zoneMap.has(zone)) zoneMap.set(zone, { zone, count: 0, excellent: 0, error: 0 });
    const zs = zoneMap.get(zone)!;
    zs.count++;
    if (ev.payload.quality === '#') zs.excellent++;
    if (ev.payload.quality === '=') zs.error++;
  }
  return Array.from(zoneMap.values()).sort((a, b) => a.zone - b.zone);
}

export function assignEventSets(events: MatchEvent[]): Map<string, number> {
  const map = new Map<string, number>();
  let currentSet = 1;
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  for (const ev of sorted) {
    if (ev.type === 'set_start' && ev.payload.setNumber) {
      currentSet = ev.payload.setNumber as number;
    }
    map.set(ev.id, currentSet);
  }
  return map;
}

// ─────────────────────────────────────────────
// SKILL TYPE BREAKDOWN
// ─────────────────────────────────────────────

export interface SkillTypeStat {
  type: string;
  total: number;
  excellent: number;
  error: number;
  efficiency: number;
}

const SKILL_TO_EVENT: Record<string, string> = {
  S: 'serve', R: 'reception', A: 'attack', B: 'block', D: 'dig', E: 'set', F: 'freeball',
};

export function computeSkillTypeStats(events: MatchEvent[], teamSide: TeamSide, skill: string): SkillTypeStat[] {
  const eventType = SKILL_TO_EVENT[skill];
  const filtered = events.filter(ev =>
    ev.type === eventType &&
    ev.undoneBySeq === undefined &&
    ev.teamSide === teamSide &&
    ev.payload.skillType,
  );

  const map = new Map<string, SkillTypeStat>();
  for (const ev of filtered) {
    const type = String(ev.payload.skillType).toUpperCase();
    if (!map.has(type)) map.set(type, { type, total: 0, excellent: 0, error: 0, efficiency: 0 });
    const stat = map.get(type)!;
    stat.total++;
    if (ev.payload.quality === '#') stat.excellent++;
    if (ev.payload.quality === '=') stat.error++;
  }
  for (const stat of map.values()) {
    if (stat.total > 0) stat.efficiency = Math.round(((stat.excellent - stat.error) / stat.total) * 100);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

// ─────────────────────────────────────────────
// SETTER CALL ANALYTICS
// ─────────────────────────────────────────────

export interface SetterCallStat {
  code: string;
  total: number;
  kills: number;
  errors: number;
  positive: number;
  efficiency: number;
}

// ─────────────────────────────────────────────
// BLOCK TOUCH DISTRIBUTION
// ─────────────────────────────────────────────

export interface BlockTouchStat {
  blockers: number;   // 1, 2, or 3
  total: number;
  stops: number;      // quality '#'
  errors: number;     // quality '='
  efficiency: number;
}

export function computeBlockTouchStats(events: MatchEvent[], teamSide: TeamSide): BlockTouchStat[] {
  const filtered = events.filter(ev =>
    ev.type === 'block' &&
    ev.undoneBySeq === undefined &&
    ev.teamSide === teamSide &&
    ev.payload.extBlockers != null,
  );

  const map = new Map<number, BlockTouchStat>();
  for (const ev of filtered) {
    const blockers = Number(ev.payload.extBlockers);
    if (blockers < 1 || blockers > 3) continue;
    if (!map.has(blockers)) map.set(blockers, { blockers, total: 0, stops: 0, errors: 0, efficiency: 0 });
    const stat = map.get(blockers)!;
    stat.total++;
    if (ev.payload.quality === '#') stat.stops++;
    if (ev.payload.quality === '=') stat.errors++;
  }
  for (const stat of map.values()) {
    if (stat.total > 0) stat.efficiency = Math.round(((stat.stops - stat.errors) / stat.total) * 100);
  }
  return Array.from(map.values()).sort((a, b) => a.blockers - b.blockers);
}

const SETTER_CALL_RE = /^K[1-9]$/i;

export function computeSetterCallStats(events: MatchEvent[], teamSide: TeamSide): SetterCallStat[] {
  const filtered = events.filter(ev =>
    ev.type === 'attack' &&
    ev.undoneBySeq === undefined &&
    ev.teamSide === teamSide &&
    ev.payload.combination &&
    SETTER_CALL_RE.test(String(ev.payload.combination)),
  );

  const map = new Map<string, SetterCallStat>();
  for (const ev of filtered) {
    const code = String(ev.payload.combination).toUpperCase();
    if (!map.has(code)) map.set(code, { code, total: 0, kills: 0, errors: 0, positive: 0, efficiency: 0 });
    const stat = map.get(code)!;
    stat.total++;
    const q = ev.payload.quality;
    if (q === '#') stat.kills++;
    else if (q === '=') stat.errors++;
    else if (q === '+') stat.positive++;
  }
  for (const stat of map.values()) {
    if (stat.total > 0) stat.efficiency = Math.round(((stat.kills - stat.errors) / stat.total) * 100);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export interface CombinationStat {
  code: string;
  total: number;
  kills: number;
  errors: number;
  efficiency: number;
}

export function computeAttackCombinationStats(events: MatchEvent[], teamSide: TeamSide): CombinationStat[] {
  const filtered = events.filter(ev =>
    ev.type === 'attack' &&
    ev.undoneBySeq === undefined &&
    ev.teamSide === teamSide &&
    ev.payload.combination &&
    !SETTER_CALL_RE.test(String(ev.payload.combination)),
  );

  const map = new Map<string, CombinationStat>();
  for (const ev of filtered) {
    const code = String(ev.payload.combination).toUpperCase();
    if (!map.has(code)) map.set(code, { code, total: 0, kills: 0, errors: 0, efficiency: 0 });
    const stat = map.get(code)!;
    stat.total++;
    const q = ev.payload.quality;
    if (q === '#') stat.kills++;
    else if (q === '=') stat.errors++;
  }
  for (const stat of map.values()) {
    if (stat.total > 0) stat.efficiency = Math.round(((stat.kills - stat.errors) / stat.total) * 100);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

// ─────────────────────────────────────────────
// SCORE RUNS / MOMENTUM
// ─────────────────────────────────────────────

export interface CurrentRun {
  team: TeamSide;
  length: number;
}

export function computeCurrentRun(events: MatchEvent[]): CurrentRun | null {
  const pts = events
    .filter(ev => ev.type === 'point' && ev.undoneBySeq === undefined && ev.payload.pointTeam)
    .sort((a, b) => a.sequence - b.sequence);

  if (pts.length === 0) return null;

  const lastTeam = pts[pts.length - 1].payload.pointTeam as TeamSide;
  let runLength = 0;
  for (let i = pts.length - 1; i >= 0; i--) {
    if ((pts[i].payload.pointTeam as TeamSide) === lastTeam) runLength++;
    else break;
  }
  return runLength >= 2 ? { team: lastTeam, length: runLength } : null;
}

export function computeMaxRuns(events: MatchEvent[]): { homeMax: number; awayMax: number } {
  const pts = events
    .filter(ev => ev.type === 'point' && ev.undoneBySeq === undefined && ev.payload.pointTeam)
    .sort((a, b) => a.sequence - b.sequence);

  let homeMax = 0, awayMax = 0;
  let currentTeam: TeamSide | null = null;
  let runLength = 0;

  for (const ev of pts) {
    const team = ev.payload.pointTeam as TeamSide;
    if (team === currentTeam) {
      runLength++;
    } else {
      if (currentTeam === 'home') homeMax = Math.max(homeMax, runLength);
      else if (currentTeam === 'away') awayMax = Math.max(awayMax, runLength);
      currentTeam = team;
      runLength = 1;
    }
  }
  if (currentTeam === 'home') homeMax = Math.max(homeMax, runLength);
  else if (currentTeam === 'away') awayMax = Math.max(awayMax, runLength);
  return { homeMax, awayMax };
}

// ─────────────────────────────────────────────
// RECEPTION → ATTACK CHAIN ANALYSIS
// ─────────────────────────────────────────────

export interface ReceptionAttackRow {
  receptionQuality: Quality;
  totalReceptions: number;
  totalAttacks: number;
  kills: number;
  errors: number;
  killRate: number;
}

export function computeReceptionAttackChain(
  events: MatchEvent[],
  teamSide: TeamSide,
): ReceptionAttackRow[] {
  const sorted = events
    .filter(e => e.undoneBySeq === undefined && e.type !== 'undo')
    .sort((a, b) => a.sequence - b.sequence);

  // Group into rallies: events between consecutive point events
  const rallies: MatchEvent[][] = [];
  let current: MatchEvent[] = [];
  for (const ev of sorted) {
    if (ev.type === 'point') {
      rallies.push(current);
      current = [];
    } else {
      current.push(ev);
    }
  }
  if (current.length > 0) rallies.push(current);

  const QUALITIES_ORDER: Quality[] = ['#', '+', '!', '-', '/', '='];
  const matrix = new Map<Quality, { receptions: number; kills: number; errors: number; attacks: number }>();

  for (const rally of rallies) {
    const rec = rally.find(e => e.type === 'reception' && e.teamSide === teamSide && e.payload.quality);
    if (!rec) continue;
    const recQ = rec.payload.quality as Quality;

    if (!matrix.has(recQ)) matrix.set(recQ, { receptions: 0, kills: 0, errors: 0, attacks: 0 });
    const row = matrix.get(recQ)!;
    row.receptions++;

    for (const atk of rally) {
      if (atk.type !== 'attack' || atk.teamSide !== teamSide) continue;
      row.attacks++;
      if (atk.payload.quality === '#') row.kills++;
      if (atk.payload.quality === '=') row.errors++;
    }
  }

  return QUALITIES_ORDER
    .filter(q => matrix.has(q))
    .map(q => {
      const r = matrix.get(q)!;
      return {
        receptionQuality: q,
        totalReceptions: r.receptions,
        totalAttacks: r.attacks,
        kills: r.kills,
        errors: r.errors,
        killRate: r.attacks > 0 ? Math.round((r.kills / r.attacks) * 100) : 0,
      };
    });
}

// ─────────────────────────────────────────────
// ROTATION STATS (replay-based)
// ─────────────────────────────────────────────

export function computeRotationStats(
  matchId: string,
  events: MatchEvent[],
  teamSide: TeamSide,
): RotationStats[] {
  const stats: Record<number, RotationStats> = {};
  for (let i = 0; i < 6; i++) {
    stats[i] = { rotationIndex: i, pointsWon: 0, pointsLost: 0, sideouts: 0, breakpoints: 0 };
  }

  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const undoneSeqs = new Set<number>();
  for (const ev of sorted) {
    if (ev.type === 'undo' && ev.payload.undoTargetSeq !== undefined) {
      undoneSeqs.add(ev.payload.undoTargetSeq as number);
    }
  }
  const annotated = sorted.map(ev => ({
    ...ev,
    undoneBySeq: undoneSeqs.has(ev.sequence) ? -1 : ev.undoneBySeq,
  }));

  let state = initialMatchState(matchId);
  for (const ev of annotated) {
    if (ev.undoneBySeq !== undefined) continue;

    // Capture state BEFORE processing the point
    if (ev.type === 'point') {
      const team = ev.payload.pointTeam as TeamSide | undefined;
      if (team) {
        const rotIdx = state.rotation[teamSide].rotationIndex % 6;
        if (team === teamSide) {
          stats[rotIdx].pointsWon++;
          if (state.servingTeam !== teamSide) stats[rotIdx].sideouts++;
          else stats[rotIdx].breakpoints++;
        } else {
          stats[rotIdx].pointsLost++;
        }
      }
    }

    state = matchReducer(state, ev);
  }

  return Object.values(stats).filter(s => s.pointsWon + s.pointsLost > 0);
}

// ─────────────────────────────────────────────
// DIG / FREEBALL QUALITY vs ATTACK ZONE
// ─────────────────────────────────────────────

export interface DigAttackZoneRow {
  attackZone: number;
  totalDigs: number;
  positive: number;   // quality # or +
  error: number;      // quality =
  positiveRate: number;
}

export function computeDigPerAttackZone(
  events: MatchEvent[],
  teamSide: TeamSide,
): DigAttackZoneRow[] {
  const sorted = events
    .filter(e => e.undoneBySeq === undefined && e.type !== 'undo')
    .sort((a, b) => a.sequence - b.sequence);

  // Group into rallies
  const rallies: MatchEvent[][] = [];
  let current: MatchEvent[] = [];
  for (const ev of sorted) {
    if (ev.type === 'point') { rallies.push(current); current = []; }
    else current.push(ev);
  }
  if (current.length > 0) rallies.push(current);

  const opponent = teamSide === 'home' ? 'away' : 'home';
  const zoneMap = new Map<number, DigAttackZoneRow>();

  for (const rally of rallies) {
    const attacks = rally.filter(e =>
      e.type === 'attack' && e.teamSide === opponent && e.payload.zoneTo != null,
    );
    const digs = rally.filter(e =>
      (e.type === 'dig' || e.type === 'freeball') && e.teamSide === teamSide && e.payload.quality,
    );
    if (attacks.length === 0 || digs.length === 0) continue;

    // Pair first attack zone with first dig in rally
    const attackZone = attacks[0].payload.zoneTo as number;
    for (const dig of digs) {
      if (!zoneMap.has(attackZone)) {
        zoneMap.set(attackZone, { attackZone, totalDigs: 0, positive: 0, error: 0, positiveRate: 0 });
      }
      const row = zoneMap.get(attackZone)!;
      row.totalDigs++;
      const q = dig.payload.quality as string;
      if (q === '#' || q === '+') row.positive++;
      if (q === '=') row.error++;
    }
  }

  for (const row of zoneMap.values()) {
    if (row.totalDigs > 0) row.positiveRate = Math.round((row.positive / row.totalDigs) * 100);
  }

  return Array.from(zoneMap.values())
    .filter(r => r.totalDigs >= 2)
    .sort((a, b) => b.totalDigs - a.totalDigs);
}

// ─────────────────────────────────────────────
// SET DURATION
// ─────────────────────────────────────────────

export interface SetDuration {
  setNumber: number;
  durationMs: number;
  points: number;
}

export function computeSetDurations(events: MatchEvent[]): SetDuration[] {
  const sorted = [...events]
    .filter(e => e.undoneBySeq === undefined)
    .sort((a, b) => a.sequence - b.sequence);

  const result: SetDuration[] = [];
  let setStart: number | null = null;
  let setNumber = 0;
  let pointsInSet = 0;

  for (const ev of sorted) {
    if (ev.type === 'set_start') {
      setStart = ev.timestampMs;
      setNumber = (ev.payload.setNumber as number | undefined) ?? setNumber + 1;
      pointsInSet = 0;
    }
    if (ev.type === 'point') pointsInSet++;
    if ((ev.type === 'set_end' || ev.type === 'match_end') && setStart !== null) {
      result.push({
        setNumber,
        durationMs: ev.timestampMs - setStart,
        points: pointsInSet,
      });
      setStart = null;
    }
  }
  return result;
}

// ─────────────────────────────────────────────
// ATTACK ZONE × COMBINATION MATRIX
// ─────────────────────────────────────────────

export interface AttackZoneComboStat {
  zone: number;
  combination: string;
  total: number;
  kills: number;
  errors: number;
  killRate: number;
}

export function computeAttackZoneComboStats(
  events: MatchEvent[],
  teamSide: TeamSide,
): AttackZoneComboStat[] {
  const filtered = events.filter(ev =>
    ev.type === 'attack' &&
    ev.undoneBySeq === undefined &&
    ev.teamSide === teamSide &&
    ev.payload.zoneTo != null &&
    ev.payload.combination,
  );

  const map = new Map<string, AttackZoneComboStat>();
  for (const ev of filtered) {
    const zone = ev.payload.zoneTo as number;
    const combo = String(ev.payload.combination).toUpperCase();
    const key = `${zone}:${combo}`;
    if (!map.has(key)) map.set(key, { zone, combination: combo, total: 0, kills: 0, errors: 0, killRate: 0 });
    const stat = map.get(key)!;
    stat.total++;
    if (ev.payload.quality === '#') stat.kills++;
    if (ev.payload.quality === '=') stat.errors++;
  }
  for (const stat of map.values()) {
    if (stat.total > 0) stat.killRate = Math.round((stat.kills / stat.total) * 100);
  }
  return Array.from(map.values())
    .filter(s => s.total >= 2)
    .sort((a, b) => b.total - a.total);
}

// ─────────────────────────────────────────────
// SERVE ERROR TYPE BREAKDOWN
// ─────────────────────────────────────────────

export interface ServeErrorBreakdown {
  total: number;
  net: number;       // skillType 'N' or extType 'N'
  out: number;       // other errors
  double: number;    // foot fault / double (extSpecial 'D')
}

export function computeServeErrorBreakdown(events: MatchEvent[], teamSide: TeamSide): ServeErrorBreakdown {
  const errors = events.filter(ev =>
    ev.type === 'serve' &&
    ev.undoneBySeq === undefined &&
    ev.teamSide === teamSide &&
    ev.payload.quality === '=',
  );

  let net = 0, out = 0, dbl = 0;
  for (const ev of errors) {
    const st = String(ev.payload.skillType ?? '').toUpperCase();
    const es = String(ev.payload.extSpecial ?? '').toUpperCase();
    if (st === 'N' || st === 'NET') net++;
    else if (es === 'D') dbl++;
    else out++;
  }
  return { total: errors.length, net, out, double: dbl };
}

// ─────────────────────────────────────────────
// SET-BY-SET COMPARISON
// ─────────────────────────────────────────────

export interface SetComparisonRow {
  skill: Skill;
  sets: Array<{ setNumber: number; total: number; efficiency: number } | null>;
}

export function computeSetComparison(
  events: MatchEvent[],
  teamSide: TeamSide,
  totalSets: number,
): SetComparisonRow[] {
  const setMap = assignEventSets(events);
  const SCOUTING_SKILLS: Skill[] = ['S', 'R', 'A', 'B', 'D'];
  const rows: SetComparisonRow[] = [];

  for (const skill of SCOUTING_SKILLS) {
    const setStats: Array<{ setNumber: number; total: number; efficiency: number } | null> = [];
    for (let s = 1; s <= totalSets; s++) {
      const setEvents = events.filter(ev =>
        setMap.get(ev.id) === s &&
        ev.undoneBySeq === undefined &&
        ev.teamSide === teamSide &&
        ev.payload.skill === skill &&
        ev.payload.quality,
      );
      if (setEvents.length === 0) { setStats.push(null); continue; }
      const ace = setEvents.filter(e => e.payload.quality === '#').length;
      const err = setEvents.filter(e => e.payload.quality === '=').length;
      const eff = Math.round(((ace - err) / setEvents.length) * 100);
      setStats.push({ setNumber: s, total: setEvents.length, efficiency: eff });
    }
    if (setStats.some(s => s !== null)) {
      rows.push({ skill, sets: setStats });
    }
  }
  return rows;
}

// ─────────────────────────────────────────────
// MOMENTUM TREND (rolling window efficiency)
// ─────────────────────────────────────────────

export interface MomentumPoint {
  sequence: number;
  rollingEff: number;  // (# - =) / window × 100, for the last N events of this skill
}

export function computeMomentumTrend(
  events: MatchEvent[],
  teamSide: TeamSide,
  skill: string,
  windowSize = 5,
): MomentumPoint[] {
  const eventType = SKILL_TO_EVENT[skill];
  const relevant = events
    .filter(ev =>
      ev.type === eventType &&
      ev.undoneBySeq === undefined &&
      ev.teamSide === teamSide &&
      ev.payload.quality,
    )
    .sort((a, b) => a.sequence - b.sequence);

  if (relevant.length < windowSize) return [];

  const result: MomentumPoint[] = [];
  for (let i = windowSize - 1; i < relevant.length; i++) {
    const window = relevant.slice(i - windowSize + 1, i + 1);
    const ace = window.filter(e => e.payload.quality === '#').length;
    const err = window.filter(e => e.payload.quality === '=').length;
    const eff = Math.round(((ace - err) / windowSize) * 100);
    result.push({ sequence: relevant[i].sequence, rollingEff: eff });
  }
  return result;
}

// ─────────────────────────────────────────────
// SET TIMELINE (stoppages vs score)
// ─────────────────────────────────────────────

export type TimelineEventType = 'timeout' | 'substitution' | 'libero_swap' | 'challenge';

export interface TimelineEvent {
  type: TimelineEventType;
  teamSide: TeamSide;
  scoreHome: number;
  scoreAway: number;
  pointIndex: number;   // cumulative point number in the set
  extra?: string;       // e.g. challenge outcome
}

export function computeSetTimeline(
  events: MatchEvent[],
  setEventMap?: Map<string, number>,
  setNumber?: number,
): TimelineEvent[] {
  const STOPPAGE_TYPES: TimelineEventType[] = ['timeout', 'substitution', 'libero_swap', 'challenge'];

  const sorted = [...events]
    .filter(e => e.undoneBySeq === undefined && e.type !== 'undo')
    .sort((a, b) => a.sequence - b.sequence);

  const result: TimelineEvent[] = [];
  let scoreHome = 0;
  let scoreAway = 0;
  let pointIndex = 0;
  let currentSet = 1;

  for (const ev of sorted) {
    if (ev.type === 'set_start' && ev.payload.setNumber) {
      currentSet = ev.payload.setNumber as number;
      if (setNumber !== undefined && currentSet !== setNumber) continue;
      scoreHome = 0;
      scoreAway = 0;
      pointIndex = 0;
    }

    if (setNumber !== undefined && currentSet !== setNumber) continue;
    if (setEventMap && setNumber && setEventMap.get(ev.id) !== setNumber) continue;

    if (ev.type === 'point' && ev.payload.pointTeam) {
      if (ev.payload.pointTeam === 'home') scoreHome++;
      else scoreAway++;
      pointIndex++;
    }

    if (STOPPAGE_TYPES.includes(ev.type as TimelineEventType) && ev.teamSide) {
      result.push({
        type: ev.type as TimelineEventType,
        teamSide: ev.teamSide as TeamSide,
        scoreHome,
        scoreAway,
        pointIndex,
        extra: ev.payload.outcome as string | undefined,
      });
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// SCORE PROGRESSION (for chart)
// ─────────────────────────────────────────────

export interface ScorePoint {
  diff: number;     // home − away at this point in time
  team: TeamSide;   // who scored this point
}

// ─────────────────────────────────────────────
// SIDEOUT / BREAKPOINT BY SET
// ─────────────────────────────────────────────

export interface SideoutBySetRow {
  setNumber: number;
  serveRallies: number;   // rallies where this team served
  receiveRallies: number; // rallies where this team received
  breakpoints: number;    // scored while serving
  sideouts: number;       // scored while receiving
  breakpointPct: number;
  sideoutPct: number;
}

export function computeSideoutBySet(
  events: MatchEvent[],
  teamSide: TeamSide,
): SideoutBySetRow[] {
  const sorted = [...events]
    .filter(e => e.undoneBySeq === undefined && e.type !== 'undo')
    .sort((a, b) => a.sequence - b.sequence);

  const setMap = assignEventSets(events);
  const setNums = new Set<number>();
  for (const ev of sorted) {
    if (ev.type === 'set_start' && ev.payload.setNumber) {
      setNums.add(ev.payload.setNumber as number);
    }
  }

  // For each set, find serve events and following points
  const rows = new Map<number, SideoutBySetRow>();
  for (const s of setNums) {
    rows.set(s, { setNumber: s, serveRallies: 0, receiveRallies: 0, breakpoints: 0, sideouts: 0, breakpointPct: 0, sideoutPct: 0 });
  }

  // Walk sorted events; track last serve team, match to next point
  let lastServeTeam: TeamSide | null = null;
  let lastServeSet = 1;
  let currentSetNum = 1;

  for (const ev of sorted) {
    if (ev.type === 'set_start' && ev.payload.setNumber) {
      currentSetNum = ev.payload.setNumber as number;
      lastServeTeam = null;
    }
    if (ev.type === 'serve') {
      lastServeTeam = ev.teamSide as TeamSide;
      lastServeSet = setMap.get(ev.id) ?? currentSetNum;
    }
    if (ev.type === 'point' && ev.payload.pointTeam && lastServeTeam !== null) {
      const s = lastServeSet;
      if (!rows.has(s)) rows.set(s, { setNumber: s, serveRallies: 0, receiveRallies: 0, breakpoints: 0, sideouts: 0, breakpointPct: 0, sideoutPct: 0 });
      const row = rows.get(s)!;
      const scorer = ev.payload.pointTeam as TeamSide;
      const wasServing = lastServeTeam === teamSide;
      if (wasServing) {
        row.serveRallies++;
        if (scorer === teamSide) row.breakpoints++;
      } else {
        row.receiveRallies++;
        if (scorer === teamSide) row.sideouts++;
      }
      lastServeTeam = null; // reset until next serve event
    }
  }

  for (const row of rows.values()) {
    row.breakpointPct = row.serveRallies > 0 ? Math.round((row.breakpoints / row.serveRallies) * 100) : 0;
    row.sideoutPct = row.receiveRallies > 0 ? Math.round((row.sideouts / row.receiveRallies) * 100) : 0;
  }

  return Array.from(rows.values())
    .filter(r => r.serveRallies + r.receiveRallies > 0)
    .sort((a, b) => a.setNumber - b.setNumber);
}

// ─────────────────────────────────────────────
// SERVE TARGET (opponent player reception stats)
// ─────────────────────────────────────────────

export interface ServeTargetRow {
  playerId: string;
  total: number;
  excellent: number;
  positive: number;
  error: number;
  positivePercent: number;
  efficiency: number;
}

export function computeServeTargetStats(
  events: MatchEvent[],
  receivingTeamSide: TeamSide,
): ServeTargetRow[] {
  const filtered = events.filter(ev =>
    ev.type === 'reception' &&
    ev.undoneBySeq === undefined &&
    ev.teamSide === receivingTeamSide &&
    ev.playerId,
  );

  const map = new Map<string, ServeTargetRow>();
  for (const ev of filtered) {
    const pid = ev.playerId!;
    if (!map.has(pid)) map.set(pid, { playerId: pid, total: 0, excellent: 0, positive: 0, error: 0, positivePercent: 0, efficiency: 0 });
    const row = map.get(pid)!;
    row.total++;
    const q = ev.payload.quality as string;
    if (q === '#') row.excellent++;
    else if (q === '+') row.positive++;
    else if (q === '=') row.error++;
  }

  for (const row of map.values()) {
    if (row.total > 0) {
      row.positivePercent = Math.round(((row.excellent + row.positive) / row.total) * 100);
      row.efficiency = Math.round(((row.excellent - row.error) / row.total) * 100);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

// ─────────────────────────────────────────────
// SETTER CALL × RECEPTION QUALITY CORRELATION
// ─────────────────────────────────────────────

export interface SetterCallByReceptionRow {
  setterCall: string;
  receptionQuality: Quality;
  total: number;
  kills: number;
  killRate: number;
}

export function computeSetterCallByReception(
  events: MatchEvent[],
  teamSide: TeamSide,
): SetterCallByReceptionRow[] {
  const sorted = events
    .filter(e => e.undoneBySeq === undefined && e.type !== 'undo')
    .sort((a, b) => a.sequence - b.sequence);

  const rallies: MatchEvent[][] = [];
  let current: MatchEvent[] = [];
  for (const ev of sorted) {
    if (ev.type === 'point') { rallies.push(current); current = []; }
    else current.push(ev);
  }
  if (current.length > 0) rallies.push(current);

  const map = new Map<string, SetterCallByReceptionRow>();
  for (const rally of rallies) {
    const rec = rally.find(e => e.type === 'reception' && e.teamSide === teamSide && e.payload.quality);
    if (!rec) continue;
    const recQ = rec.payload.quality as Quality;

    for (const atk of rally) {
      if (atk.type !== 'attack' || atk.teamSide !== teamSide) continue;
      if (!atk.payload.combination || !SETTER_CALL_RE.test(String(atk.payload.combination))) continue;
      const call = String(atk.payload.combination).toUpperCase();
      const key = `${call}:${recQ}`;
      if (!map.has(key)) map.set(key, { setterCall: call, receptionQuality: recQ, total: 0, kills: 0, killRate: 0 });
      const row = map.get(key)!;
      row.total++;
      if (atk.payload.quality === '#') row.kills++;
    }
  }

  for (const row of map.values()) {
    row.killRate = row.total > 0 ? Math.round((row.kills / row.total) * 100) : 0;
  }

  return Array.from(map.values())
    .filter(r => r.total >= 2)
    .sort((a, b) => b.total - a.total);
}

// ─────────────────────────────────────────────
// PER-PLAYER ATTACK TENDENCY
// ─────────────────────────────────────────────

export interface PlayerAttackTendency {
  playerId: string;
  zone: number;
  total: number;
  kills: number;
  errors: number;
  killRate: number;
}

export function computePlayerAttackTendency(
  events: MatchEvent[],
  teamSide: TeamSide,
): PlayerAttackTendency[] {
  const filtered = events.filter(ev =>
    ev.type === 'attack' &&
    ev.undoneBySeq === undefined &&
    ev.teamSide === teamSide &&
    ev.playerId &&
    ev.payload.zoneTo != null,
  );

  const map = new Map<string, PlayerAttackTendency>();
  for (const ev of filtered) {
    const key = `${ev.playerId}:${ev.payload.zoneTo}`;
    if (!map.has(key)) {
      map.set(key, { playerId: ev.playerId!, zone: ev.payload.zoneTo as number, total: 0, kills: 0, errors: 0, killRate: 0 });
    }
    const row = map.get(key)!;
    row.total++;
    if (ev.payload.quality === '#') row.kills++;
    if (ev.payload.quality === '=') row.errors++;
  }
  for (const row of map.values()) {
    if (row.total > 0) row.killRate = Math.round((row.kills / row.total) * 100);
  }
  return Array.from(map.values())
    .filter(r => r.total >= 2)
    .sort((a, b) => b.total - a.total);
}

// ─────────────────────────────────────────────
// MATCH COMMENTS / NOTES SUMMARY
// ─────────────────────────────────────────────

export interface CommentEntry {
  sequence: number;
  text: string;
  tag: string | null;  // [TAG] prefix extracted
  videoTsMs?: number;
}

export function extractMatchComments(events: MatchEvent[]): CommentEntry[] {
  const TAG_RE = /^\[([A-ZÀÈÉÌÒÙ\w]+)\] /i;
  return events
    .filter(ev => ev.type === 'comment' && ev.isValid && !ev.undoneBySeq)
    .sort((a, b) => a.sequence - b.sequence)
    .map(ev => {
      const text = (ev.payload.text as string | undefined) ?? (ev.rawCode ?? '');
      const match = text.match(TAG_RE);
      return {
        sequence: ev.sequence,
        text: match ? text.slice(match[0].length) : text,
        tag: match ? match[1].toUpperCase() : null,
        videoTsMs: ev.videoTsMs,
      };
    });
}

// ─────────────────────────────────────────────
// RUN ANALYSIS (scoring runs during the match)
// ─────────────────────────────────────────────

export interface ScoringRun {
  team: TeamSide;
  length: number;
  setNumber: number;
  startScore: { home: number; away: number };
  endScore: { home: number; away: number };
}

export function computeScoringRuns(
  events: MatchEvent[],
  minLength = 3,
): ScoringRun[] {
  const setMap = assignEventSets(events);
  const pts = events
    .filter(ev => ev.type === 'point' && !ev.undoneBySeq && ev.payload.pointTeam)
    .sort((a, b) => a.sequence - b.sequence);

  const runs: ScoringRun[] = [];
  let runTeam: TeamSide | null = null;
  let runLen = 0;
  let runStart = { home: 0, away: 0 };
  let scoreHome = 0;
  let scoreAway = 0;
  let currentSet = 1;

  for (const ev of pts) {
    const s = setMap.get(ev.id) ?? currentSet;
    if (s !== currentSet) {
      currentSet = s;
      scoreHome = 0;
      scoreAway = 0;
      if (runLen >= minLength && runTeam) {
        runs.push({ team: runTeam, length: runLen, setNumber: currentSet - 1, startScore: { ...runStart }, endScore: { home: scoreHome, away: scoreAway } });
      }
      runTeam = null;
      runLen = 0;
    }

    const scorer = ev.payload.pointTeam as TeamSide;
    if (scorer === runTeam) {
      runLen++;
    } else {
      if (runLen >= minLength && runTeam) {
        runs.push({ team: runTeam, length: runLen, setNumber: s, startScore: { ...runStart }, endScore: { home: scoreHome, away: scoreAway } });
      }
      runTeam = scorer;
      runLen = 1;
      runStart = { home: scoreHome, away: scoreAway };
    }

    if (scorer === 'home') scoreHome++;
    else scoreAway++;
  }
  if (runLen >= minLength && runTeam) {
    runs.push({ team: runTeam, length: runLen, setNumber: currentSet, startScore: { ...runStart }, endScore: { home: scoreHome, away: scoreAway } });
  }

  return runs.sort((a, b) => b.length - a.length);
}

// ─────────────────────────────────────────────
// COACH INSIGHTS (auto-detected tactical patterns)
// ─────────────────────────────────────────────

export type InsightSeverity = 'good' | 'warning' | 'info';

export interface CoachInsight {
  id: string;
  severity: InsightSeverity;
  title: string;
  body: string;
  team: TeamSide | null;
}

export function computeCoachInsights(
  events: MatchEvent[],
  teamSide: TeamSide,
): CoachInsight[] {
  const insights: CoachInsight[] = [];
  const opponent: TeamSide = teamSide === 'home' ? 'away' : 'home';

  const myStats = computeTeamStats(events, teamSide);
  const oppStats = computeTeamStats(events, opponent);

  // 1. Serve efficiency vs team's history
  const serveEff = myStats.bySkill.S?.efficiency;
  const serveN = myStats.bySkill.S?.total ?? 0;
  if (serveN >= 5) {
    if (serveEff !== undefined && serveEff < -10) {
      const errPct = myStats.bySkill.S ? Math.round((myStats.bySkill.S.error / serveN) * 100) : 0;
      insights.push({
        id: 'serve_low',
        severity: 'warning',
        title: 'Battuta in difficoltà',
        body: `Eff. ${serveEff}% su ${serveN} battute. Errori: ${errPct}%. Valuta di servire più in sicurezza.`,
        team: teamSide,
      });
    } else if (serveEff !== undefined && serveEff >= 25) {
      insights.push({
        id: 'serve_hot',
        severity: 'good',
        title: 'Battuta efficace',
        body: `Eff. +${serveEff}% su ${serveN} battute. Mantieni pressione.`,
        team: teamSide,
      });
    }
  }

  // 2. Reception quality — opponent's serve is causing trouble
  const recvEff = myStats.bySkill.R?.efficiency;
  const recvN = myStats.bySkill.R?.total ?? 0;
  if (recvN >= 5 && recvEff !== undefined && recvEff < -10) {
    const posPct = myStats.bySkill.R?.positivePercent ?? 0;
    insights.push({
      id: 'recv_low',
      severity: 'warning',
      title: 'Ricezione in difficoltà',
      body: `Pos% ${posPct}% su ${recvN} ricezioni. Eff. ${recvEff}%. Controlla la zona bersagliata.`,
      team: teamSide,
    });
  }

  // 3. Opponent's weakest receiver (serve target)
  const targets = computeServeTargetStats(events, opponent);
  if (targets.length > 0) {
    const weakest = targets.find(t => t.total >= 3 && t.positivePercent < 40);
    if (weakest) {
      insights.push({
        id: 'serve_target',
        severity: 'info',
        title: 'Bersaglio efficace',
        body: `#${weakest.playerId.slice(-4)} Pos% ${weakest.positivePercent}% su ${weakest.total} ric. Continua a colpirlo.`,
        team: opponent,
      });
    }
  }

  // 4. Attack kill rate
  const atkKillPct = myStats.bySkill.A
    ? Math.round((myStats.bySkill.A.excellent / (myStats.bySkill.A.total || 1)) * 100)
    : null;
  const atkN = myStats.bySkill.A?.total ?? 0;
  if (atkN >= 5 && atkKillPct !== null) {
    if (atkKillPct >= 40) {
      insights.push({
        id: 'attack_hot',
        severity: 'good',
        title: 'Attacco efficace',
        body: `Kill% ${atkKillPct}% su ${atkN} attacchi. Continua ad attaccare aggressivamente.`,
        team: teamSide,
      });
    } else if (atkKillPct < 20 && atkN >= 8) {
      const errPct = Math.round((myStats.bySkill.A!.error / atkN) * 100);
      insights.push({
        id: 'attack_low',
        severity: 'warning',
        title: 'Attacco in difficoltà',
        body: `Kill% ${atkKillPct}% su ${atkN} attacchi. Errori: ${errPct}%. Considera tip/morbida.`,
        team: teamSide,
      });
    }
  }

  // 5. Block effectiveness vs opponent attacks
  const oppAtkN = oppStats.bySkill.A?.total ?? 0;
  const myBlockN = myStats.bySkill.B?.total ?? 0;
  if (oppAtkN >= 8 && myBlockN >= 2) {
    const blockEff = myStats.bySkill.B?.efficiency;
    if (blockEff !== undefined && blockEff >= 20) {
      insights.push({
        id: 'block_good',
        severity: 'good',
        title: 'Muro efficace',
        body: `Eff. muro +${blockEff}% su ${myBlockN} tocchi. Il muro sta funzionando.`,
        team: teamSide,
      });
    }
  }

  // 6. Sideout rate in current set
  const soRows = computeSideoutBySet(events, teamSide);
  if (soRows.length > 0) {
    const lastSet = soRows[soRows.length - 1];
    if (lastSet.receiveRallies >= 5) {
      if (lastSet.sideoutPct < 40) {
        insights.push({
          id: 'sideout_low',
          severity: 'warning',
          title: `SO% basso (Set ${lastSet.setNumber})`,
          body: `Side-out: ${lastSet.sideoutPct}% su ${lastSet.receiveRallies} ricezioni. Difficile tornare in battuta.`,
          team: teamSide,
        });
      } else if (lastSet.sideoutPct >= 60) {
        insights.push({
          id: 'sideout_high',
          severity: 'good',
          title: `SO% ottimo (Set ${lastSet.setNumber})`,
          body: `Side-out: ${lastSet.sideoutPct}% su ${lastSet.receiveRallies} ricezioni.`,
          team: teamSide,
        });
      }
    }
  }

  // Cap at 5 most relevant insights (warnings first, then info, then good)
  const order: InsightSeverity[] = ['warning', 'info', 'good'];
  insights.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return insights.slice(0, 5);
}

export function computeScoreProgression(events: MatchEvent[], filterSetIndex?: Map<string, number>, filterSet?: number | null): ScorePoint[] {
  const pts = events
    .filter(ev => {
      if (ev.type !== 'point') return false;
      if (ev.undoneBySeq !== undefined) return false;
      if (!ev.payload.pointTeam) return false;
      if (filterSet && filterSetIndex && filterSetIndex.get(ev.id) !== filterSet) return false;
      return true;
    })
    .sort((a, b) => a.sequence - b.sequence);

  const result: ScorePoint[] = [];
  let h = 0, a = 0;
  for (const ev of pts) {
    const team = ev.payload.pointTeam as TeamSide;
    if (team === 'home') h++;
    else a++;
    result.push({ diff: h - a, team });
  }
  return result;
}
