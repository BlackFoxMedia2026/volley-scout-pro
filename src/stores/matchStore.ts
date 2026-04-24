import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import type { MatchState, MatchEvent } from '@/types/match';
import type { ParsedCode } from '@/types/dv4';
import { replayEvents } from '@/lib/reducer/matchReducer';
import { parseDV4Code } from '@/lib/parser/dv4Parser';
import { useConfigStore } from './configStore';

// ─────────────────────────────────────────────
// STORE SHAPE
// ─────────────────────────────────────────────

interface MatchMeta {
  homeTeamName: string;
  awayTeamName: string;
  date: string;
  competition?: string;
  matchPhase?: string;
  venue?: string;
}

export interface PlayerInfo {
  id: string;
  number: number;
  firstName: string;
  lastName: string;
  role: string;
  teamSide: 'home' | 'away';
  isLibero: boolean;
}

interface MatchStoreState {
  activeMatchId: string | null;
  actorUserId: string;  // real DB user id, read from match.created_by on load
  matchState: MatchState | null;
  matchMeta: MatchMeta | null;
  events: MatchEvent[];
  codeBuffer: string;
  lastParsed: ParsedCode | null;
  isSyncing: boolean;
  error: string | null;
  videoCurrentMs: number | null;
  videoSyncOffsetMs: number | null;  // video position at sync point (subtract for event timestamps)
  playersByNumber: Map<string, string>;  // 'home:5' → playerId
  playersById: Map<string, PlayerInfo>;  // playerId → PlayerInfo
  isPaused: boolean;
  pendingUICommand: string | null;  // 'FORM' | 'ROT' | 'VER' | 'TABE' | 'INV'
}

interface MatchStoreActions {
  loadMatch: (matchId: string) => Promise<void>;
  startMatch: (servingTeam: 'home' | 'away') => Promise<void>;
  startNextSet: () => Promise<void>;
  appendCode: (char: string) => void;
  deleteLastChar: () => void;
  submitCode: () => Promise<void>;
  clearBuffer: () => void;
  setCodePrefix: (prefix: string) => void;
  undoLast: () => Promise<void>;
  setError: (msg: string | null) => void;
  manualPoint: (team: 'home' | 'away') => Promise<void>;
  recordTimeout: (team: 'home' | 'away') => Promise<void>;
  recordChallenge: (team: 'home' | 'away', outcome: 'accepted' | 'rejected' | 'pending') => Promise<void>;
  resolveLastChallenge: (outcome: 'accepted' | 'rejected') => Promise<void>;
  recordLiberoSwap: (team: 'home' | 'away', liberoId: string, playerOutId: string) => Promise<void>;
  togglePause: () => void;
  setVideoCurrentMs: (ms: number | null) => void;
  setVideoSyncOffset: (ms: number) => void;
  scoreCorrection: (home: number, away: number) => Promise<void>;
  editEventCode: (sequence: number, newRawCode: string) => Promise<void>;
  recordTechnicalTimeout: (team: 'home' | 'away') => Promise<void>;
  recordSetterAssignment: (team: 'home' | 'away', jerseyNum: number) => Promise<void>;
  recordSubstitution: (team: 'home' | 'away', playerOut: number, playerIn: number) => Promise<void>;
  recordServeAssignment: (team: 'home' | 'away') => Promise<void>;
  clearPendingCommand: () => void;
}

// ─────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────

export const useMatchStore = create<MatchStoreState & MatchStoreActions>()(
  immer((set, get) => ({
    activeMatchId: null,
    actorUserId: '',
    matchState: null,
    matchMeta: null,
    events: [],
    codeBuffer: '',
    lastParsed: null,
    isSyncing: false,
    error: null,
    videoCurrentMs: null,
    videoSyncOffsetMs: null,
    playersByNumber: new Map(),
    playersById: new Map(),
    isPaused: false,
    pendingUICommand: null,

    loadMatch: async (matchId: string) => {
      const [rawEvents, matchRow] = await Promise.all([
        invoke<MatchEvent[]>('get_match_events', { matchId }),
        invoke<{ home_team_id: string; away_team_id: string; org_id: string; date: string; created_by: string; video_sync_offset_ms?: number | null; venue?: string | null; notes?: string | null } | null>('get_match', { id: matchId }),
      ]);

      const state = replayEvents(matchId, rawEvents);

      let meta: MatchMeta | null = null;
      const playersByNumber = new Map<string, string>();
      const playersById = new Map<string, PlayerInfo>();

      if (matchRow) {
        const [orgTeams, homePlayers, awayPlayers] = await Promise.all([
          invoke<Array<{ id: string; name: string }>>('get_teams', { orgId: matchRow.org_id }).catch(() => []),
          invoke<Array<{ id: string; number: number; first_name: string; last_name: string; role: string; is_libero: number }>>('get_players', { orgId: matchRow.org_id, teamId: matchRow.home_team_id }).catch(() => []),
          invoke<Array<{ id: string; number: number; first_name: string; last_name: string; role: string; is_libero: number }>>('get_players', { orgId: matchRow.org_id, teamId: matchRow.away_team_id }).catch(() => []),
        ]);

        const homeTeam = orgTeams.find(t => t.id === matchRow.home_team_id);
        const awayTeam = orgTeams.find(t => t.id === matchRow.away_team_id);
        let notesData: { competition?: string; phase?: string } = {};
        try { notesData = JSON.parse(matchRow.notes ?? '{}'); } catch { /* ignore */ }
        meta = {
          homeTeamName: homeTeam?.name ?? 'Casa',
          awayTeamName: awayTeam?.name ?? 'Ospiti',
          date: matchRow.date,
          competition: notesData.competition,
          matchPhase: notesData.phase,
          venue: matchRow.venue ?? undefined,
        };

        for (const p of homePlayers) {
          playersByNumber.set(`home:${p.number}`, p.id);
          playersById.set(p.id, { id: p.id, number: p.number, firstName: p.first_name ?? '', lastName: p.last_name, role: p.role ?? '', teamSide: 'home', isLibero: p.is_libero === 1 });
        }
        for (const p of awayPlayers) {
          playersByNumber.set(`away:${p.number}`, p.id);
          playersById.set(p.id, { id: p.id, number: p.number, firstName: p.first_name ?? '', lastName: p.last_name, role: p.role ?? '', teamSide: 'away', isLibero: p.is_libero === 1 });
        }
      }

      set(s => {
        s.activeMatchId = matchId;
        s.actorUserId = matchRow?.created_by ?? '';
        s.events = rawEvents;
        s.matchState = state;
        s.matchMeta = meta;
        s.codeBuffer = '';
        s.lastParsed = null;
        s.playersByNumber = playersByNumber;
        s.playersById = playersById;
        s.videoSyncOffsetMs = matchRow?.video_sync_offset_ms ?? null;
      });
    },

    startMatch: async (servingTeam: 'home' | 'away') => {
      const { activeMatchId, actorUserId, events } = get();
      console.log('[startMatch] activeMatchId=', activeMatchId, 'serving=', servingTeam);
      if (!activeMatchId) {
        console.error('[startMatch] ERRORE: activeMatchId è null!');
        throw new Error('activeMatchId è null — partita non caricata');
      }
      const now = Date.now();
      // match_start
      console.log('[startMatch] invoco append_event match_start...');
      const msEv = await invoke<MatchEvent>('append_event', {
        req: {
          matchId: activeMatchId, setId: null, rallyId: null,
          timestampMs: now, videoTsMs: null,
          type: 'match_start', actorUserId: actorUserId,
          playerId: null, teamSide: servingTeam, rawCode: null,
          skill: null, skillType: null, quality: null, combination: null,
          zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
          payload: JSON.stringify({ servingTeam }), isValid: true,
        },
      });
      console.log('[startMatch] match_start OK, evento:', msEv);
      // set_start for set 1
      const ssEv = await invoke<MatchEvent>('append_event', {
        req: {
          matchId: activeMatchId, setId: null, rallyId: null,
          timestampMs: now + 1, videoTsMs: null,
          type: 'set_start', actorUserId: actorUserId,
          playerId: null, teamSide: null, rawCode: null,
          skill: null, skillType: null, quality: null, combination: null,
          zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
          payload: JSON.stringify({ setNumber: 1 }), isValid: true,
        },
      });
      const allEvents = [...events, msEv, ssEv];
      set(s => {
        s.events = allEvents;
        s.matchState = replayEvents(activeMatchId, allEvents);
      });
    },

    startNextSet: async () => {
      const { activeMatchId, actorUserId, events, matchState } = get();
      if (!activeMatchId || !matchState) return;
      const nextSet = matchState.currentSet + 1;
      const now = Date.now();
      const ssEv = await invoke<MatchEvent>('append_event', {
        req: {
          matchId: activeMatchId, setId: null, rallyId: null,
          timestampMs: now, videoTsMs: null,
          type: 'set_start', actorUserId: actorUserId,
          playerId: null, teamSide: null, rawCode: null,
          skill: null, skillType: null, quality: null, combination: null,
          zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
          payload: JSON.stringify({ setNumber: nextSet }), isValid: true,
        },
      });
      const allEvents = [...events, ssEv];
      set(s => {
        s.events = allEvents;
        s.matchState = replayEvents(activeMatchId, allEvents);
      });
    },

    manualPoint: async (team: 'home' | 'away') => {
      const { activeMatchId, actorUserId, events } = get();
      if (!activeMatchId) return;
      const now = Date.now();
      const ev = await invoke<MatchEvent>('append_event', {
        req: {
          matchId: activeMatchId, setId: null, rallyId: null,
          timestampMs: now, videoTsMs: null,
          type: 'point', actorUserId: actorUserId,
          playerId: null, teamSide: team, rawCode: null,
          skill: null, skillType: null, quality: null, combination: null,
          zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
          payload: JSON.stringify({ pointTeam: team }), isValid: true,
        },
      });
      const allEvents = [...events, ev];
      const newState = replayEvents(activeMatchId, allEvents);
      const serverPrefix = findNextServer(newState, get().playersById);
      const prefixParsed = serverPrefix ? parseDV4Code(serverPrefix) : null;
      set(s => {
        s.events = allEvents;
        s.matchState = newState;
        s.codeBuffer = serverPrefix;
        s.lastParsed = prefixParsed
          ? (prefixParsed.ok ? prefixParsed.value : (prefixParsed.partial ?? null))
          : null;
        s.error = null;
      });
    },

    recordTimeout: async (team: 'home' | 'away') => {
      const { activeMatchId, actorUserId, events } = get();
      if (!activeMatchId) return;
      const now = Date.now();
      const ev = await invoke<MatchEvent>('append_event', {
        req: {
          matchId: activeMatchId, setId: null, rallyId: null,
          timestampMs: now, videoTsMs: null,
          type: 'timeout', actorUserId: actorUserId,
          playerId: null, teamSide: team, rawCode: null,
          skill: null, skillType: null, quality: null, combination: null,
          zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
          payload: JSON.stringify({ team }), isValid: true,
        },
      });
      const allEvents = [...events, ev];
      set(s => {
        s.events = allEvents;
        s.matchState = replayEvents(activeMatchId, allEvents);
      });
    },

    recordTechnicalTimeout: async (team: 'home' | 'away') => {
      const { activeMatchId, actorUserId, events } = get();
      if (!activeMatchId) return;
      const ev = await invoke<MatchEvent>('append_event', {
        req: {
          matchId: activeMatchId, setId: null, rallyId: null,
          timestampMs: Date.now(), videoTsMs: null,
          type: 'timeout', actorUserId,
          playerId: null, teamSide: team, rawCode: null,
          skill: null, skillType: null, quality: null, combination: null,
          zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
          payload: JSON.stringify({ team, technical: true }), isValid: true,
        },
      });
      const allEvents = [...events, ev];
      set(s => { s.events = allEvents; s.matchState = replayEvents(activeMatchId, allEvents); });
    },

    recordSetterAssignment: async (team, jerseyNum) => {
      const { activeMatchId, actorUserId, events, playersByNumber } = get();
      if (!activeMatchId) return;
      const setterId = playersByNumber.get(`${team}:${jerseyNum}`) ?? null;
      const ev = await invoke<MatchEvent>('append_event', {
        req: {
          matchId: activeMatchId, setId: null, rallyId: null,
          timestampMs: Date.now(), videoTsMs: null,
          type: 'setter_assign', actorUserId,
          playerId: setterId, teamSide: team, rawCode: null,
          skill: null, skillType: null, quality: null, combination: null,
          zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
          payload: JSON.stringify({ jerseyNum, setterId }), isValid: true,
        },
      });
      const allEvents = [...events, ev];
      set(s => { s.events = allEvents; s.matchState = replayEvents(activeMatchId, allEvents); });
    },

    recordSubstitution: async (team, playerOut, playerIn) => {
      const { activeMatchId, actorUserId, events, playersByNumber, matchState } = get();
      if (!activeMatchId) return;
      const playerOutId = playersByNumber.get(`${team}:${playerOut}`) ?? null;
      const playerInId = playersByNumber.get(`${team}:${playerIn}`) ?? null;
      const rotation = matchState?.rotation[team];
      const position = rotation
        ? rotation.positions.findIndex(id => id === playerOutId) + 1
        : 0;
      const ev = await invoke<MatchEvent>('append_event', {
        req: {
          matchId: activeMatchId, setId: null, rallyId: null,
          timestampMs: Date.now(), videoTsMs: null,
          type: 'substitution', actorUserId,
          playerId: playerInId, teamSide: team, rawCode: null,
          skill: null, skillType: null, quality: null, combination: null,
          zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
          payload: JSON.stringify({ playerOutId, playerInId, position: position > 0 ? position : null, jerseyOut: playerOut, jerseyIn: playerIn }), isValid: true,
        },
      });
      const allEvents = [...events, ev];
      set(s => { s.events = allEvents; s.matchState = replayEvents(activeMatchId, allEvents); });
    },

    recordServeAssignment: async (team) => {
      const { activeMatchId, actorUserId, events } = get();
      if (!activeMatchId) return;
      const ev = await invoke<MatchEvent>('append_event', {
        req: {
          matchId: activeMatchId, setId: null, rallyId: null,
          timestampMs: Date.now(), videoTsMs: null,
          type: 'serve_assign', actorUserId,
          playerId: null, teamSide: team, rawCode: null,
          skill: null, skillType: null, quality: null, combination: null,
          zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
          payload: JSON.stringify({ team }), isValid: true,
        },
      });
      const allEvents = [...events, ev];
      set(s => { s.events = allEvents; s.matchState = replayEvents(activeMatchId, allEvents); });
    },

    clearPendingCommand: () => set(s => { s.pendingUICommand = null; }),

    appendCode: (char: string) => {
      set(s => {
        s.codeBuffer += char;
        const result = parseDV4Code(s.codeBuffer);
        s.lastParsed = result.ok ? result.value : (result.partial ?? null);
      });
    },

    deleteLastChar: () => {
      set(s => {
        if (s.codeBuffer.length > 0) {
          s.codeBuffer = s.codeBuffer.slice(0, -1);
          const result = parseDV4Code(s.codeBuffer);
          s.lastParsed = result.ok ? result.value : (result.partial ?? null);
        }
      });
    },

    submitCode: async () => {
      const { codeBuffer, activeMatchId, events, matchState, videoCurrentMs, videoSyncOffsetMs, playersByNumber } = get();
      if (!codeBuffer || !activeMatchId) return;

      const expanded = useConfigStore.getState().expandShortcut(codeBuffer);

      // ── Quadro Comando DV4 ──────────────────────────────────
      const cmd = expanded.trim().toUpperCase();
      const clearBuf = () => set(s => { s.codeBuffer = ''; s.lastParsed = null; s.error = null; });

      if (cmd === 'STOP') { get().togglePause(); clearBuf(); return; }

      if (cmd === 'T' || cmd === 'AT') {
        await get().recordTechnicalTimeout(cmd === 'T' ? 'home' : 'away');
        clearBuf(); return;
      }

      // P<num> / AP<num>: imposta palleggiatore
      const setterM = cmd.match(/^(A?)P(\d+)$/);
      if (setterM) {
        const team: 'home' | 'away' = setterM[1] === 'A' ? 'away' : 'home';
        await get().recordSetterAssignment(team, parseInt(setterM[2], 10));
        clearBuf(); return;
      }

      // C<out>.<in> / AC<out>.<in>: cambio
      const subM = cmd.match(/^(A?)C(\d+)\.(\d+)$/);
      if (subM) {
        const team: 'home' | 'away' = subM[1] === 'A' ? 'away' : 'home';
        await get().recordSubstitution(team, parseInt(subM[2], 10), parseInt(subM[3], 10));
        clearBuf(); return;
      }

      // S / AS: assegna battuta
      if (cmd === 'S' || cmd === 'AS') {
        await get().recordServeAssignment(cmd === 'S' ? 'home' : 'away');
        clearBuf(); return;
      }

      // AGGIO: no-op (statistiche in tempo reale in VSP)
      if (cmd === 'AGGIO') { clearBuf(); return; }

      // Comandi UI (aprono pannelli/dialog)
      if (['FORM', 'ROT', 'VER', 'TABE', 'INV', 'FINE', 'NOTE', 'ELENCO', 'AELENCO'].includes(cmd)) {
        set(s => { s.pendingUICommand = cmd; s.codeBuffer = ''; s.lastParsed = null; s.error = null; });
        return;
      }
      // ────────────────────────────────────────────────────────

      const result = parseDV4Code(expanded);
      const now = Date.now();
      const actorUserId = get().actorUserId;
      const videoTs = videoCurrentMs !== null ? videoCurrentMs - (videoSyncOffsetMs ?? 0) : null;

      if (!result.ok) {
        // Submit as an invalid/raw event — user can see it in red and fix it
        try {
          const rawReq = {
            matchId: activeMatchId,
            setId: null,
            rallyId: null,
            timestampMs: now,
            videoTsMs: videoTs,
            type: 'comment',
            actorUserId: actorUserId,
            playerId: null,
            teamSide: null,
            rawCode: expanded,
            skill: null,
            skillType: null,
            quality: null,
            combination: null,
            zoneFrom: null,
            zoneTo: null,
            zoneToSub: null,
            endZonePlus: null,
            payload: JSON.stringify({ parseError: result.errors[0]?.message }),
            isValid: false,
          };
          const newEvent = await invoke<MatchEvent>('append_event', { req: rawReq });
          const newEvents = [...events, newEvent];
          set(s => {
            s.events = newEvents;
            s.matchState = replayEvents(activeMatchId, newEvents);
            s.codeBuffer = '';
            s.lastParsed = null;
            s.error = null;
          });
        } catch (err) {
          set(s => { s.error = String(err); });
        }
        return;
      }

      const parsed = result.value;
      const servingTeam = matchState?.servingTeam ?? 'home';

      // Normalizzazione DV4: auto-fill skill type when omitted
      const SKILL_TYPE_DEFAULTS: Record<string, string> = {
        S: 'H', R: 'H', A: 'H', B: '1', D: 'H', E: 'H', F: 'H',
      };
      const effectiveSkillType = parsed.skillType ?? SKILL_TYPE_DEFAULTS[parsed.skill] ?? null;

      // Resolve player ID from team + number
      const resolvedPlayerId = parsed.playerNumber > 0
        ? (playersByNumber.get(`${parsed.teamSide}:${parsed.playerNumber}`) ?? null)
        : null;

      const req = {
        matchId: activeMatchId,
        setId: null,
        rallyId: null,
        timestampMs: now,
        videoTsMs: videoTs,
        type: skillToEventType(parsed.skill),
        actorUserId: actorUserId,
        playerId: resolvedPlayerId,
        teamSide: parsed.teamSide,
        rawCode: expanded,
        skill: parsed.skill,
        skillType: effectiveSkillType,
        quality: parsed.quality ?? null,
        combination: parsed.combination ?? null,
        zoneFrom: parsed.zoneFrom ?? null,
        zoneTo: parsed.zoneTo ?? null,
        zoneToSub: parsed.zoneToSub ?? null,
        endZonePlus: null,
        payload: JSON.stringify({
          skill: parsed.skill,
          skillType: effectiveSkillType,
          quality: parsed.quality,
          combination: parsed.combination,
          zoneFrom: parsed.zoneFrom,
          zoneTo: parsed.zoneTo,
          ...(parsed.extBlockers != null && { extBlockers: parsed.extBlockers }),
          ...(parsed.extType     != null && { extType:     parsed.extType }),
          ...(parsed.extSpecial  != null && { extSpecial:  parsed.extSpecial }),
          ...(parsed.extFlag     != null && { extFlag:     parsed.extFlag }),
          ...(parsed.endZonePlus != null && { endZonePlus: parsed.endZonePlus }),
          ...(parsed.zoneToSub   != null && { zoneToSub:   parsed.zoneToSub }),
        }),
        isValid: true,
      };

      let pointWasScored = false;
      try {
        const newEvent = await invoke<MatchEvent>('append_event', { req });
        let allEvents = [...events, newEvent];

        // Submit compound pair if present
        if (parsed.isCompound && parsed.compoundPair) {
          const pair = parsed.compoundPair;
          const pairPlayerId = pair.playerNumber > 0
            ? (playersByNumber.get(`${pair.teamSide}:${pair.playerNumber}`) ?? null)
            : null;
          const pairReq = {
            matchId: activeMatchId, setId: null, rallyId: null,
            timestampMs: now + 1, videoTsMs: videoTs,
            type: skillToEventType(pair.skill),
            actorUserId, playerId: pairPlayerId,
            teamSide: pair.teamSide, rawCode: pair.raw,
            skill: pair.skill, skillType: pair.skillType ?? null,
            quality: pair.quality ?? null, combination: pair.combination ?? null,
            zoneFrom: pair.zoneFrom ?? null, zoneTo: pair.zoneTo ?? null,
            zoneToSub: pair.zoneToSub ?? null, endZonePlus: null,
            payload: JSON.stringify({
              skill: pair.skill, skillType: pair.skillType,
              quality: pair.quality, combination: pair.combination,
              zoneFrom: pair.zoneFrom, zoneTo: pair.zoneTo,
              isCompoundPair: true,
            }),
            isValid: true,
          };
          const pairEvent = await invoke<MatchEvent>('append_event', { req: pairReq });
          allEvents = [...allEvents, pairEvent];

          // Auto-point from compound pair's quality
          if (pair.quality === '#' || pair.quality === '=') {
            const ptTeam = determinePointTeam(pair.skill, pair.quality, pair.teamSide, servingTeam);
            const ptReq = {
              matchId: activeMatchId, setId: null, rallyId: null,
              timestampMs: now + 2, videoTsMs: null,
              type: 'point', actorUserId, playerId: null,
              teamSide: ptTeam, rawCode: null,
              skill: null, skillType: null, quality: null, combination: null,
              zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
              payload: JSON.stringify({ pointTeam: ptTeam }), isValid: true,
            };
            const ptEv = await invoke<MatchEvent>('append_event', { req: ptReq });
            allEvents = [...allEvents, ptEv];
            pointWasScored = true;
          }
        } else {
          // Auto-generate point event for rally-ending qualities (non-compound)
          if (parsed.quality === '#' || parsed.quality === '=') {
            const pointTeam = determinePointTeam(parsed.skill, parsed.quality, parsed.teamSide, servingTeam);
            const pointReq = {
              matchId: activeMatchId, setId: null, rallyId: null,
              timestampMs: now + 1, videoTsMs: null,
              type: 'point', actorUserId, playerId: null,
              teamSide: pointTeam, rawCode: null,
              skill: null, skillType: null, quality: null, combination: null,
              zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
              payload: JSON.stringify({ pointTeam }), isValid: true,
            };
            const pointEvent = await invoke<MatchEvent>('append_event', { req: pointReq });
            allEvents = [...allEvents, pointEvent];
            pointWasScored = true;
          }
        }

        const newState = replayEvents(activeMatchId, allEvents);
        const serverPrefix = pointWasScored ? findNextServer(newState, get().playersById) : '';
        const prefixParsed = serverPrefix ? parseDV4Code(serverPrefix) : null;
        set(s => {
          s.events = allEvents;
          s.matchState = newState;
          s.codeBuffer = serverPrefix;
          s.lastParsed = prefixParsed
            ? (prefixParsed.ok ? prefixParsed.value : (prefixParsed.partial ?? null))
            : null;
          s.error = null;
        });
      } catch (err) {
        set(s => { s.error = String(err); });
      }
    },

    clearBuffer: () => {
      set(s => {
        s.codeBuffer = '';
        s.lastParsed = null;
      });
    },

    setCodePrefix: (prefix: string) => {
      set(s => {
        s.codeBuffer = prefix;
        const result = parseDV4Code(prefix);
        s.lastParsed = result.ok ? result.value : (result.partial ?? null);
        s.error = null;
      });
    },

    undoLast: async () => {
      const { activeMatchId, actorUserId: undoActorId, events } = get();
      if (!activeMatchId) return;

      // Find the last valid, not-already-undone, non-undo event
      const lastUndoable = [...events]
        .reverse()
        .find(e => e.type !== 'undo' && e.undoneBySeq === undefined);

      if (!lastUndoable) return;

      try {
        const undoEvent = await invoke<MatchEvent>('undo_event', {
          matchId: activeMatchId,
          targetSequence: lastUndoable.sequence,
          actorUserId: undoActorId,
        });

        const newEvents = [...events, undoEvent];
        const newState = replayEvents(activeMatchId, newEvents);

        set(s => {
          s.events = newEvents;
          s.matchState = newState;
        });
      } catch (err) {
        set(s => { s.error = String(err); });
      }
    },

    recordChallenge: async (team, outcome) => {
      const { activeMatchId, actorUserId, events, videoCurrentMs } = get();
      if (!activeMatchId) return;
      const now = Date.now();
      const ev = await invoke<MatchEvent>('append_event', {
        req: {
          matchId: activeMatchId, setId: null, rallyId: null,
          timestampMs: now, videoTsMs: videoCurrentMs ?? null,
          type: 'challenge', actorUserId: actorUserId,
          playerId: null, teamSide: team, rawCode: null,
          skill: null, skillType: null, quality: null, combination: null,
          zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
          payload: JSON.stringify({ team, outcome }), isValid: true,
        },
      });
      const allEvents = [...events, ev];
      set(s => {
        s.events = allEvents;
        s.matchState = replayEvents(activeMatchId, allEvents);
      });
    },

    recordLiberoSwap: async (team, liberoId, playerOutId) => {
      const { activeMatchId, actorUserId, events } = get();
      if (!activeMatchId) return;
      const now = Date.now();
      const ev = await invoke<MatchEvent>('append_event', {
        req: {
          matchId: activeMatchId, setId: null, rallyId: null,
          timestampMs: now, videoTsMs: null,
          type: 'libero_swap', actorUserId: actorUserId,
          playerId: liberoId, teamSide: team, rawCode: null,
          skill: null, skillType: null, quality: null, combination: null,
          zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
          payload: JSON.stringify({ liberoId, playerOutId }), isValid: true,
        },
      });
      const allEvents = [...events, ev];
      set(s => {
        s.events = allEvents;
        s.matchState = replayEvents(activeMatchId, allEvents);
      });
    },

    resolveLastChallenge: async (outcome) => {
      const { events } = get();
      const lastChallenge = [...events]
        .reverse()
        .find(e => e.type === 'challenge' && e.payload.outcome === 'pending');
      if (!lastChallenge) return;
      return get().recordChallenge(
        (lastChallenge.teamSide ?? 'home') as 'home' | 'away',
        outcome,
      );
    },

    togglePause: () => set(s => { s.isPaused = !s.isPaused; }),

    setError: (msg) => set(s => { s.error = msg; }),

    setVideoCurrentMs: (ms) => set(s => { s.videoCurrentMs = ms; }),

    setVideoSyncOffset: (ms) => set(s => { s.videoSyncOffsetMs = ms; }),

    scoreCorrection: async (home, away) => {
      const { activeMatchId, actorUserId, events } = get();
      if (!activeMatchId) return;
      const ev = await invoke<MatchEvent>('append_event', {
        req: {
          matchId: activeMatchId, setId: null, rallyId: null,
          timestampMs: Date.now(), videoTsMs: null,
          type: 'score_correction', actorUserId: actorUserId,
          playerId: null, teamSide: null, rawCode: null,
          skill: null, skillType: null, quality: null, combination: null,
          zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
          payload: JSON.stringify({ correctedHome: home, correctedAway: away }), isValid: true,
        },
      });
      const allEvents = [...events, ev];
      set(s => {
        s.events = allEvents;
        s.matchState = replayEvents(activeMatchId, allEvents);
      });
    },

    editEventCode: async (sequence, newRawCode) => {
      const { activeMatchId, actorUserId, events } = get();
      if (!activeMatchId) return;

      // Mark original event as undone
      const undoEv = await invoke<MatchEvent>('undo_event', {
        matchId: activeMatchId,
        targetSequence: sequence,
        actorUserId,
      });

      // Update events: mark original undone, add undo event
      const withUndo = events.map(e =>
        e.sequence === sequence ? { ...e, undoneBySeq: undoEv.sequence } : e
      );
      withUndo.push(undoEv);

      // Set buffer and submit new code
      set(s => {
        s.events = withUndo;
        s.matchState = replayEvents(activeMatchId, withUndo);
        s.codeBuffer = newRawCode;
      });
      await get().submitCode();
    },
  })),
);

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

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

// Auto-fill next server prefix for battuta automatica
function findNextServer(state: MatchState, playersById: Map<string, PlayerInfo>): string {
  const serving = state.servingTeam;
  const rotation = serving === 'home' ? state.rotation.home : state.rotation.away;
  const serverId = rotation.positions[0]; // position 1 = index 0 = server
  if (!serverId) return '';
  const player = playersById.get(serverId);
  if (!player) return '';
  const numStr = String(player.number).padStart(2, '0');
  return serving === 'home' ? `*${numStr}` : `a${numStr}`;
}

// Determine which team gets the point based on skill, quality, and context.
// Convention:
//   # = performer's team wins the rally
//   = = performer's team loses the rally (opponent scores)
function determinePointTeam(
  _skill: string,
  quality: '#' | '=',
  teamSide: 'home' | 'away',
  _servingTeam: 'home' | 'away',
): 'home' | 'away' {
  const opponent = teamSide === 'home' ? 'away' : 'home';
  if (quality === '#') {
    // Dig or set excellence don't end the rally in normal play — treat as no-auto-point
    // but if the user explicitly enters # we honour it.
    return teamSide; // performer scores
  } else {
    // quality === '='
    return opponent; // opponent scores on performer's error
  }
}
