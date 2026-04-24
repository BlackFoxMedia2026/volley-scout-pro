// DVW File Parser — DataVolley 4 format
//
// .dvw files are XML-based. Key sections:
//   <MATCH>         — date, teams, tournament
//   <TEAMS>         — home (t1) and away (t2) team names
//   <PLAYERS-H>     — home team roster
//   <PLAYERS-V>     — away team roster
//   <SET n>         — per-set data with <POINT> elements inside
//   <POINT>         — each coded action (the core data)
//
// POINT element format:
//   <POINT Number="1" HomeScore="0" VisitorScore="1"
//          Serve="1"           (1=home serves, 0=away serves)
//          Video="00:00:05.01" (video timestamp)
//          Code="a01S#"        (the DV4 code)
//          HRotation="123456"  (home rotation: player numbers at pos1-6)
//          VRotation="123456"  (away rotation)
//   />
//
// Reference: DV4 file format documentation + reverse engineering of real .dvw files.

import { parseDV4Code } from '@/lib/parser/dv4Parser';
import type { MatchEvent } from '@/types/match';
import { monotonicFactory } from 'ulid';

const ulid = monotonicFactory();

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface DvwMatch {
  date: string;
  homeTeam: string;
  awayTeam: string;
  tournament: string;
  homePlayers: DvwPlayer[];
  awayPlayers: DvwPlayer[];
  sets: DvwSet[];
}

export interface DvwPlayer {
  number: number;
  name: string;
  role: string;
}

export interface DvwSet {
  setNumber: number;
  scoreHome: number;
  scoreAway: number;
  points: DvwPoint[];
}

export interface DvwPoint {
  number: number;
  homeScore: number;
  visitorScore: number;
  serve: 'home' | 'away';
  videoTimestamp?: string;
  code: string;
  homeRotation?: string;
  awayRotation?: string;
}

// ─────────────────────────────────────────────
// PARSE DVW XML
// ─────────────────────────────────────────────

export function parseDvw(xmlText: string): DvwMatch {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('DVW XML parse error: ' + parseError.textContent);

  // Match info
  const matchEl = doc.querySelector('MATCH');
  const date = matchEl?.getAttribute('Date') ?? matchEl?.getAttribute('date') ?? '';
  const tournament = matchEl?.getAttribute('Division') ?? matchEl?.getAttribute('division') ?? '';

  // Teams
  const teamsEl = doc.querySelector('TEAMS');
  const homeTeam =
    teamsEl?.querySelector('TEAM-1')?.getAttribute('Name') ??
    teamsEl?.querySelector('TEAM-H')?.getAttribute('Name') ??
    doc.querySelector('TEAMS > *:first-child')?.getAttribute('Name') ?? 'Home';
  const awayTeam =
    teamsEl?.querySelector('TEAM-2')?.getAttribute('Name') ??
    teamsEl?.querySelector('TEAM-V')?.getAttribute('Name') ??
    doc.querySelector('TEAMS > *:last-child')?.getAttribute('Name') ?? 'Away';

  // Players
  const homePlayers = parsePlayers(doc, 'PLAYERS-H', 'PLAYERS-1');
  const awayPlayers = parsePlayers(doc, 'PLAYERS-V', 'PLAYERS-2');

  // Sets
  const setEls = Array.from(doc.querySelectorAll('SET'));
  const sets: DvwSet[] = setEls.map(setEl => {
    const setNum = parseInt(setEl.getAttribute('Number') ?? setEl.getAttribute('n') ?? '1', 10);
    const points = Array.from(setEl.querySelectorAll('POINT')).map(pt => ({
      number: parseInt(pt.getAttribute('Number') ?? '0', 10),
      homeScore: parseInt(pt.getAttribute('HomeScore') ?? '0', 10),
      visitorScore: parseInt(pt.getAttribute('VisitorScore') ?? '0', 10),
      serve: pt.getAttribute('Serve') === '1' ? 'home' as const : 'away' as const,
      videoTimestamp: pt.getAttribute('Video') ?? undefined,
      code: pt.getAttribute('Code') ?? '',
      homeRotation: pt.getAttribute('HRotation') ?? undefined,
      awayRotation: pt.getAttribute('VRotation') ?? undefined,
    }));

    // Score is the last point's score
    const lastPt = points[points.length - 1];
    return {
      setNumber: setNum,
      scoreHome: lastPt?.homeScore ?? 0,
      scoreAway: lastPt?.visitorScore ?? 0,
      points,
    };
  });

  return { date, homeTeam, awayTeam, tournament, homePlayers, awayPlayers, sets };
}

function parsePlayers(
  doc: Document,
  ...selectors: string[]
): DvwPlayer[] {
  for (const sel of selectors) {
    const container = doc.querySelector(sel);
    if (!container) continue;
    const players = Array.from(container.querySelectorAll('PLAYER')).map(el => ({
      number: parseInt(el.getAttribute('Number') ?? el.getAttribute('Num') ?? '0', 10),
      name: el.getAttribute('Name') ?? '',
      role: el.getAttribute('Role') ?? '',
    }));
    if (players.length > 0) return players;
  }
  return [];
}

// ─────────────────────────────────────────────
// CONVERT TO MATCH EVENTS
// ─────────────────────────────────────────────

export interface DvwImportOptions {
  matchId: string;
  actorUserId: string;
  homePlayerIdMap: Map<number, string>;  // jersey number → our player ULID
  awayPlayerIdMap: Map<number, string>;
}

export interface DvwImportResult {
  events: MatchEvent[];
  skippedCodes: string[];
  warnings: string[];
}

export function dvwToEvents(
  dvw: DvwMatch,
  opts: DvwImportOptions,
): DvwImportResult {
  const events: MatchEvent[] = [];
  const skippedCodes: string[] = [];
  const warnings: string[] = [];
  let sequence = 1;
  const now = Date.now();

  // Add match_start event
  events.push(makeMetaEvent('match_start', sequence++, opts.matchId, opts.actorUserId, now));

  for (const set of dvw.sets) {
    events.push({
      ...makeMetaEvent('set_start', sequence++, opts.matchId, opts.actorUserId, now),
      payload: { setNumber: set.setNumber },
    });

    for (const point of set.points) {
      if (!point.code || point.code.trim() === '') continue;

      // Handle compound codes (split by '.')
      const codes = point.code.split('.');
      for (let ci = 0; ci < codes.length; ci++) {
        // For compound second code, inherit team indicator from first
        const codeToparse = ci === 0 ? codes[0] : `${codes[0][0]}${codes[ci]}`;

        const result = parseDV4Code(codeToparse);
        if (!result.ok) {
          skippedCodes.push(point.code);
          continue;
        }

        const parsed = result.value;
        const teamSide = parsed.teamSide;
        const playerMap = teamSide === 'home' ? opts.homePlayerIdMap : opts.awayPlayerIdMap;
        const playerId = playerMap.get(parsed.playerNumber) ?? undefined;

        if (!playerId && parsed.playerNumber !== 0) {
          warnings.push(`Player #${parsed.playerNumber} (${teamSide}) not found for code: ${point.code}`);
        }

        const videoTsMs = point.videoTimestamp
          ? parseVideoTimestamp(point.videoTimestamp)
          : undefined;

        const ev: MatchEvent = {
          id: ulid(),
          matchId: opts.matchId,
          sequence: sequence++,
          timestampMs: now + sequence * 100,
          videoTsMs,
          type: skillToEventType(parsed.skill),
          actorUserId: opts.actorUserId,
          playerId,
          teamSide,
          rawCode: ci === 0 ? point.code : undefined,
          payload: {
            skill: parsed.skill,
            skillType: parsed.skillType ?? undefined,
            quality: parsed.quality ?? undefined,
            combination: parsed.combination ?? undefined,
            zoneFrom: parsed.zoneFrom ?? undefined,
            zoneTo: parsed.zoneTo ?? undefined,
            setNumber: set.setNumber,
          },
          isValid: true,
        };
        events.push(ev);
      }

      // Add point event after each coded sequence
      if (point.homeScore !== undefined) {
        // Determine who scored: compare with previous point score
        const prevIdx = set.points.indexOf(point) - 1;
        const prev = prevIdx >= 0 ? set.points[prevIdx] : null;
        const scoredHome = point.homeScore > (prev?.homeScore ?? 0);
        const scoredAway = point.visitorScore > (prev?.visitorScore ?? 0);

        if (scoredHome || scoredAway) {
          events.push({
            ...makeMetaEvent('point', sequence++, opts.matchId, opts.actorUserId, now),
            payload: {
              pointTeam: scoredHome ? 'home' : 'away',
              setNumber: set.setNumber,
            },
          });
        }
      }
    }

    events.push({
      ...makeMetaEvent('set_end', sequence++, opts.matchId, opts.actorUserId, now),
      payload: { setNumber: set.setNumber, scoreHome: set.scoreHome, scoreAway: set.scoreAway },
    });
  }

  events.push(makeMetaEvent('match_end', sequence, opts.matchId, opts.actorUserId, now));

  return { events, skippedCodes, warnings };
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function makeMetaEvent(
  type: MatchEvent['type'],
  sequence: number,
  matchId: string,
  actorUserId: string,
  baseTime: number,
): MatchEvent {
  return {
    id: ulid(),
    matchId,
    sequence,
    timestampMs: baseTime + sequence * 100,
    type,
    actorUserId,
    payload: {},
    isValid: true,
  };
}

function skillToEventType(skill: string | undefined): MatchEvent['type'] {
  switch (skill) {
    case 'S': return 'serve';
    case 'R': return 'reception';
    case 'A': return 'attack';
    case 'B': return 'block';
    case 'D': return 'dig';
    case 'E': return 'set';
    case 'F': return 'freeball';
    default:  return 'freeball';
  }
}

// Video timestamp "HH:MM:SS.ff" → milliseconds
function parseVideoTimestamp(ts: string): number | undefined {
  const match = ts.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{2})$/);
  if (!match) return undefined;
  const [, hh, mm, ss, ff] = match.map(Number);
  return (hh * 3600 + mm * 60 + ss) * 1000 + ff * 10;
}
