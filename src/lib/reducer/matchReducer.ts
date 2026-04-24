import type {
  MatchState, MatchEvent, RotationState, SetScore, TeamSide, EventPayload,
} from '@/types/match';

// ─────────────────────────────────────────────
// INITIAL STATE
// ─────────────────────────────────────────────

const emptyRotation = (): RotationState => ({
  positions: [null, null, null, null, null, null],
  libero1Id: null,
  libero2Id: null,
  setterId: null,
  rotationIndex: 0,
  isConfirmed: false,
});

export function initialMatchState(matchId: string): MatchState {
  return {
    matchId,
    phase: 'not_started',
    currentSet: 1,
    score: { home: 0, away: 0 },
    setsWon: { home: 0, away: 0 },
    setCores: [],
    servingTeam: 'home',
    rotation: {
      home: emptyRotation(),
      away: emptyRotation(),
    },
    timeoutsUsed: { home: 0, away: 0 },
    substitutionsUsed: { home: 0, away: 0 },
    currentRallyEvents: [],
    lastEventSequence: 0,
  };
}

// ─────────────────────────────────────────────
// PURE REDUCER — STATE = reduce(events, initialState)
// ─────────────────────────────────────────────

export function matchReducer(state: MatchState, event: MatchEvent): MatchState {
  // Skip undone events — they are neutralised
  if (event.undoneBySeq !== undefined) return state;

  const s = { ...state };

  switch (event.type) {

    case 'match_start': {
      s.phase = 'set_warmup';
      s.currentSet = 1;
      if (event.teamSide) s.servingTeam = event.teamSide;
      break;
    }

    case 'set_start': {
      s.phase = 'between_rallies';
      if (event.payload.setNumber !== undefined) {
        s.currentSet = event.payload.setNumber as number;
      }
      break;
    }

    case 'rally_start': {
      s.phase = 'in_rally';
      s.currentRallyEvents = [];
      break;
    }

    case 'serve':
    case 'reception':
    case 'set':
    case 'attack':
    case 'block':
    case 'dig':
    case 'freeball': {
      s.currentRallyEvents = [...s.currentRallyEvents, event];
      break;
    }

    case 'setter_call': {
      s.currentRallyEvents = [...s.currentRallyEvents, event];
      break;
    }

    case 'point': {
      const team = event.payload.pointTeam as TeamSide | undefined;
      if (!team) break;

      const newScore: SetScore = {
        home: s.score.home + (team === 'home' ? 1 : 0),
        away: s.score.away + (team === 'away' ? 1 : 0),
      };

      // Check set-end conditions
      const isSetEnd = isSetOver(newScore, s.currentSet);

      if (isSetEnd) {
        const winner: TeamSide = newScore.home > newScore.away ? 'home' : 'away';
        const newSetsWon = {
          home: s.setsWon.home + (winner === 'home' ? 1 : 0),
          away: s.setsWon.away + (winner === 'away' ? 1 : 0),
        };
        s.setCores = [...s.setCores, newScore];
        s.score = { home: 0, away: 0 };
        s.setsWon = newSetsWon;
        s.phase = isMatchOver(newSetsWon) ? 'match_end' : 'set_end';
        // Serving team in next set = team that didn't win this set (they receive)
        // Actually: winner of set serves first in next set in volleyball
        s.servingTeam = winner;
        s.rotation = {
          home: emptyRotation(),
          away: emptyRotation(),
        };
      } else {
        s.score = newScore;
        s.phase = 'between_rallies';
        // Winner of point serves
        // prevServingTeam captured before the assignment below
        const prevServingTeam = s.servingTeam;
        s.servingTeam = team;
        // When receiving team wins point → they side-out → rotate clockwise
        if (team !== prevServingTeam) {
          const rotated = rotateClockwise(s.rotation[team]);
          s.rotation = { ...s.rotation, [team]: rotated };
        }
      }
      s.currentRallyEvents = [];
      break;
    }

    case 'rally_end': {
      s.phase = 'between_rallies';
      s.currentRallyEvents = [];
      break;
    }

    case 'score_correction': {
      const corrHome = event.payload.correctedHome as number | undefined;
      const corrAway = event.payload.correctedAway as number | undefined;
      if (typeof corrHome === 'number' && typeof corrAway === 'number') {
        s.score = { home: corrHome, away: corrAway };
      }
      break;
    }

    case 'timeout': {
      const team = event.teamSide as 'home' | 'away' | undefined;
      if (team === 'home' || team === 'away') {
        s.timeoutsUsed = {
          home: s.timeoutsUsed.home + (team === 'home' ? 1 : 0),
          away: s.timeoutsUsed.away + (team === 'away' ? 1 : 0),
        };
      }
      s.phase = 'timeout';
      break;
    }

    case 'substitution': {
      const { playerOutId, playerInId, position } = event.payload as EventPayload & {
        position?: number;
      };
      const team = event.teamSide as 'home' | 'away' | undefined;
      if ((team === 'home' || team === 'away') && playerOutId && playerInId && position !== undefined) {
        const rotation = { ...s.rotation[team] };
        const positions = [...rotation.positions] as RotationState['positions'];
        const idx = position - 1;
        if (idx >= 0 && idx <= 5) {
          positions[idx] = playerInId;
        }
        rotation.positions = positions;
        s.rotation = { ...s.rotation, [team]: rotation };
        s.substitutionsUsed = {
          home: s.substitutionsUsed.home + (team === 'home' ? 1 : 0),
          away: s.substitutionsUsed.away + (team === 'away' ? 1 : 0),
        };
      }
      break;
    }

    case 'formation_enter': {
      const team = event.teamSide;
      if (team && event.payload.formation) {
        s.rotation = {
          ...s.rotation,
          [team]: event.payload.formation as RotationState,
        };
      }
      break;
    }

    case 'set_end': {
      s.phase = 'set_end';
      break;
    }

    case 'match_end': {
      s.phase = 'match_end';
      break;
    }

    case 'serve_assign': {
      const team = event.payload.team as TeamSide | undefined;
      if (team === 'home' || team === 'away') {
        s.servingTeam = team;
      }
      break;
    }

    case 'setter_assign': {
      const team = event.teamSide as 'home' | 'away' | undefined;
      const setterId = event.payload.setterId as string | null | undefined;
      if ((team === 'home' || team === 'away') && setterId) {
        s.rotation = {
          ...s.rotation,
          [team]: { ...s.rotation[team], setterId },
        };
      }
      break;
    }

    case 'undo': {
      // UNDO is handled by replay: events with undoneBySeq set are skipped.
      // This branch shouldn't normally be reached in replay mode.
      break;
    }
  }

  s.lastEventSequence = event.sequence;
  return s;
}

// ─────────────────────────────────────────────
// REPLAY — reconstruct state from event log
// ─────────────────────────────────────────────

export function replayEvents(matchId: string, events: MatchEvent[]): MatchState {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);

  // Mark undone events
  const undoneSeqs = new Set<number>();
  for (const ev of sorted) {
    if (ev.type === 'undo' && ev.payload.undoTargetSeq !== undefined) {
      undoneSeqs.add(ev.payload.undoTargetSeq as number);
    }
  }

  // Annotate events with undoneBySeq before reducing
  const annotated = sorted.map(ev => ({
    ...ev,
    undoneBySeq: undoneSeqs.has(ev.sequence) ? -1 : ev.undoneBySeq,
  }));

  return annotated.reduce(matchReducer, initialMatchState(matchId));
}

// ─────────────────────────────────────────────
// VOLLEYBALL RULES HELPERS
// ─────────────────────────────────────────────

function isSetOver(score: SetScore, setNumber: number): boolean {
  const { home, away } = score;
  const max = Math.max(home, away);
  const min = Math.min(home, away);
  const isFifthSet = setNumber === 5;
  const target = isFifthSet ? 15 : 25;
  const minLead = 2;
  return max >= target && max - min >= minLead;
}

function isMatchOver(setsWon: { home: number; away: number }): boolean {
  return setsWon.home >= 3 || setsWon.away >= 3;
}

function rotateClockwise(rotation: RotationState): RotationState {
  // Rotation: position array shifts cyclically
  // DV4 convention: positions 1-6 clockwise = [1,2,3,4,5,6] → [6,1,2,3,4,5]
  const [p1, p2, p3, p4, p5, p6] = rotation.positions;
  return {
    ...rotation,
    positions: [p6, p1, p2, p3, p4, p5],
    rotationIndex: (rotation.rotationIndex + 1) % 6,
  };
}
