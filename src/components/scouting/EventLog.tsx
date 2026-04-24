import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useMatchStore } from '@/stores/matchStore';
import type { MatchEvent } from '@/types/match';
import { SKILL_LABELS } from '@/types/dv4';
import { computeTeamStats } from '@/lib/analytics/stats';

interface Props {
  onClickEvent?: (event: MatchEvent) => void;
}

const FILTER_SKILLS = ['S', 'R', 'A', 'B', 'D', 'E', 'F'] as const;

function MiniEff({ val, side }: { val: number | null; side: 'home' | 'away' }) {
  if (val === null) return <span className="event-log__mini-eff event-log__mini-eff--empty">—</span>;
  const cls = val >= 20 ? 'good' : val >= 0 ? 'mid' : 'bad';
  return (
    <span className={`event-log__mini-eff event-log__mini-eff--${side} event-log__mini-eff--${cls}`}>
      {val > 0 ? '+' : ''}{val}%
    </span>
  );
}

export function EventLog({ onClickEvent }: Props) {
  const events = useMatchStore(s => s.events);
  const playersById = useMatchStore(s => s.playersById);
  const editEventCode = useMatchStore(s => s.editEventCode);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filterTeam, setFilterTeam] = useState<'all' | 'home' | 'away'>('all');
  const [filterSkill, setFilterSkill] = useState<'all' | string>('all');
  const [filterPlayer, setFilterPlayer] = useState<string | null>(null);
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [editingSeq, setEditingSeq] = useState<number | null>(null);

  const handleEdit = useCallback(async (sequence: number, newCode: string) => {
    setEditingSeq(null);
    if (!newCode.trim()) return;
    await editEventCode(sequence, newCode.trim());
  }, [editEventCode]);

  const filtered = [...events].filter(e => {
    if (e.type === 'undo' || e.undoneBySeq) return false;
    if (filterTeam !== 'all' && e.teamSide !== filterTeam) return false;
    if (filterSkill !== 'all') {
      const skill = e.payload.skill;
      if (skill !== filterSkill) return false;
    }
    if (filterPlayer !== null && e.playerId !== filterPlayer) return false;
    return true;
  });

  const visible = (sortNewestFirst ? [...filtered].reverse() : filtered).slice(0, 150);

  // Auto-scroll to top when new events arrive (latest first = top)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events.length]);

  // Mini live stats for both teams (S/R/A eff%)
  const liveStats = useMemo(() => {
    const h = computeTeamStats(events, 'home');
    const a = computeTeamStats(events, 'away');
    const fmtEff = (v: number | undefined) => v === undefined ? null : v;
    return {
      home: {
        S: fmtEff(h.bySkill.S?.efficiency),
        R: fmtEff(h.bySkill.R?.efficiency),
        A: fmtEff(h.bySkill.A?.efficiency),
      },
      away: {
        S: fmtEff(a.bySkill.S?.efficiency),
        R: fmtEff(a.bySkill.R?.efficiency),
        A: fmtEff(a.bySkill.A?.efficiency),
      },
    };
  }, [events]);

  return (
    <div className="event-log">
      {/* Live mini stats bar */}
      <div className="event-log__mini-stats">
        {(['S', 'R', 'A'] as const).map(skill => (
          <span key={skill} className="event-log__mini-stat-group">
            <span className="event-log__mini-stat-skill">{SKILL_LABELS[skill]}</span>
            <MiniEff val={liveStats.home[skill]} side="home" />
            <MiniEff val={liveStats.away[skill]} side="away" />
          </span>
        ))}
      </div>
      <div className="event-log__header">
        <span className="event-log__title">Log ({visible.length})</span>
        <div className="event-log__filters">
          <select
            className="event-log__filter-select"
            value={filterTeam}
            onChange={e => setFilterTeam(e.target.value as 'all' | 'home' | 'away')}
            title="Filtra per squadra"
          >
            <option value="all">Tutte</option>
            <option value="home">Casa</option>
            <option value="away">Ospiti</option>
          </select>
          <select
            className="event-log__filter-select"
            value={filterSkill}
            onChange={e => setFilterSkill(e.target.value)}
            title="Filtra per skill"
          >
            <option value="all">—</option>
            {FILTER_SKILLS.map(s => (
              <option key={s} value={s}>{SKILL_LABELS[s]}</option>
            ))}
          </select>
          <button
            className="event-log__filter-clear"
            onClick={() => setSortNewestFirst(v => !v)}
            title={sortNewestFirst ? 'Ordine: più recente in cima' : 'Ordine: più vecchio in cima'}
            style={{ padding: '0 .3rem' }}
          >
            {sortNewestFirst ? '↓' : '↑'}
          </button>
          {filterPlayer && (
            <span className="event-log__player-filter-chip">
              #{playersById.get(filterPlayer)?.number ?? '?'} {playersById.get(filterPlayer)?.lastName ?? ''}
              <button
                className="event-log__filter-clear"
                onClick={() => setFilterPlayer(null)}
                title="Rimuovi filtro giocatore"
                style={{ marginLeft: '.2rem' }}
              >✕</button>
            </span>
          )}
          {(filterTeam !== 'all' || filterSkill !== 'all' || filterPlayer !== null) && (
            <button
              className="event-log__filter-clear"
              onClick={() => { setFilterTeam('all'); setFilterSkill('all'); setFilterPlayer(null); }}
              title="Rimuovi tutti i filtri"
            >✕✕</button>
          )}
        </div>
        {onClickEvent && <span className="event-log__hint">▶ video</span>}
      </div>
      <div className="event-log__table" role="list" ref={scrollRef}>
        <div className="event-log__thead">
          <span className="event-col--seq">#</span>
          <span className="event-col--team">T</span>
          <span className="event-col--player">N°</span>
          <span className="event-col--code">Cod</span>
          <span className="event-col--skill">Skill</span>
          <span className="event-col--type">Tipo</span>
          <span className="event-col--quality">Qual</span>
          <span className="event-col--zone">Zona</span>
          <span className="event-col--combo">Comb</span>
          <span className="event-col--ts">Video</span>
        </div>
        {visible.map(event => (
          <EventRow
            key={event.id}
            event={event}
            onClick={onClickEvent}
            playersById={playersById}
            onClickPlayer={pid => setFilterPlayer(filterPlayer === pid ? null : pid)}
            isEditing={editingSeq === event.sequence}
            onStartEdit={() => setEditingSeq(event.sequence)}
            onCommitEdit={(newCode) => handleEdit(event.sequence, newCode)}
            onCancelEdit={() => setEditingSeq(null)}
          />
        ))}
        {visible.length === 0 && (
          <div className="event-log__empty">Nessun evento registrato</div>
        )}
      </div>
    </div>
  );
}

function fmtTs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function zoneLabel(from: number | null | undefined, to: number | null | undefined, sub: string | null | undefined): string {
  if (!from && !to) return '';
  const parts: string[] = [];
  if (from) parts.push(String(from));
  if (to) parts.push((sub ? `${to}${sub}` : String(to)));
  return parts.join('→');
}

const QUALITY_SHORT: Record<string, string> = {
  '#': '#', '+': '+', '!': '!', '-': '-', '/': '/', '=': '=',
};

const TYPE_LABELS: Record<string, string> = {
  // Serve
  H: 'Flot', M: 'T/S', Q: 'Semi', T: 'Tensor', U: 'Jump', N: 'N/A', O: 'Under',
  // Attack
  P: 'Pipe', E: 'Shoot', B: 'Bic', C: 'Cut', S: 'Spike',
};

function EventRow({ event, onClick, playersById, onClickPlayer, isEditing, onStartEdit, onCommitEdit, onCancelEdit }: {
  event: MatchEvent;
  onClick?: (e: MatchEvent) => void;
  playersById: Map<string, { number: number; lastName: string }>;
  onClickPlayer?: (playerId: string) => void;
  isEditing?: boolean;
  onStartEdit?: () => void;
  onCommitEdit?: (newCode: string) => void;
  onCancelEdit?: () => void;
}) {
  const [editValue, setEditValue] = useState(event.rawCode ?? '');

  useEffect(() => {
    if (isEditing) setEditValue(event.rawCode ?? '');
  }, [isEditing, event.rawCode]);
  const isInvalid = !event.isValid;
  const isPoint = event.type === 'point';
  const isSubstitution = event.type === 'substitution';
  const isLiberoSwap = event.type === 'libero_swap';
  const isCompoundPair = !!(event.payload.isCompoundPair);
  const isTimeout = event.type === 'timeout';
  const isComment = event.type === 'comment' && event.isValid;
  const isChallenge = event.type === 'challenge';
  const isMatchMeta = ['match_start', 'set_start', 'set_end', 'match_end', 'formation_enter', 'rally_start', 'rally_end'].includes(event.type);
  // libero_swap is handled above, so isMatchMeta doesn't need it
  const hasVideo = event.videoTsMs != null;
  const clickable = hasVideo && !!onClick;

  const classes = [
    'event-row',
    event.teamSide ? `event-row--${event.teamSide}` : 'event-row--meta',
    isInvalid ? 'event-row--invalid' : '',
    isPoint ? 'event-row--point' : '',
    isMatchMeta ? 'event-row--meta' : '',
    clickable ? 'event-row--clickable' : '',
    isCompoundPair ? 'event-row--compound-pair' : '',
  ].filter(Boolean).join(' ');

  if (isMatchMeta) {
    return (
      <div className={classes} role="listitem">
        <span className="event-col--seq">{event.sequence}</span>
        <span className="event-col--meta-label" style={{ gridColumn: '2 / -1' }}>
          {metaLabel(event)}
        </span>
      </div>
    );
  }

  if (isSubstitution) {
    const { playerOutId, playerInId, position } = event.payload as { playerOutId?: string; playerInId?: string; position?: number };
    const outNum = playerOutId ? (playersById.get(playerOutId)?.number ?? `…${playerOutId.slice(-4)}`) : '?';
    const inNum = playerInId ? (playersById.get(playerInId)?.number ?? `…${playerInId.slice(-4)}`) : '?';
    return (
      <div className={classes} role="listitem">
        <span className="event-col--seq">{event.sequence}</span>
        <span className="event-col--team">{teamDot(event.teamSide)}</span>
        <span className="event-col--meta-label" style={{ gridColumn: '3 / -1' }}>
          SOST P{position ?? '?'} #{outNum} → #{inNum}
        </span>
      </div>
    );
  }

  if (isLiberoSwap) {
    const { liberoId, playerOutId } = event.payload as { liberoId?: string; playerOutId?: string };
    const liberoNum = liberoId ? (playersById.get(liberoId)?.number ?? '?') : '?';
    const outNum = playerOutId ? (playersById.get(playerOutId)?.number ?? '?') : '?';
    return (
      <div className={classes} role="listitem">
        <span className="event-col--seq">{event.sequence}</span>
        <span className="event-col--team">{teamDot(event.teamSide)}</span>
        <span className="event-col--meta-label" style={{ gridColumn: '3 / -1' }}>
          🔄 Libero #L{liberoNum} ↔ #{outNum}
        </span>
      </div>
    );
  }

  if (isTimeout) {
    return (
      <div className={classes} role="listitem">
        <span className="event-col--seq">{event.sequence}</span>
        <span className="event-col--team">{teamDot(event.teamSide)}</span>
        <span className="event-col--meta-label" style={{ gridColumn: '3 / -1' }}>
          ⏸ Timeout {event.teamSide === 'home' ? 'Casa' : 'Ospiti'}
        </span>
      </div>
    );
  }

  if (isChallenge) {
    const outcome = event.payload.outcome as string | undefined;
    return (
      <div className={classes} role="listitem">
        <span className="event-col--seq">{event.sequence}</span>
        <span className="event-col--team">{teamDot(event.teamSide)}</span>
        <span className="event-col--meta-label" style={{ gridColumn: '3 / -1' }}>
          ⚑ Challenge {event.teamSide === 'home' ? 'Casa' : 'Ospiti'}
          {outcome && outcome !== 'pending' ? ` — ${outcome === 'accepted' ? '✓ Accolto' : '✗ Respinto'}` : ''}
        </span>
      </div>
    );
  }

  if (isComment) {
    const text = event.payload.text as string | undefined;
    return (
      <div className={`${classes} event-row--comment`} role="listitem">
        <span className="event-col--seq">{event.sequence}</span>
        <span className="event-col--meta-label" style={{ gridColumn: '2 / -1', fontStyle: 'italic', color: 'var(--q-ok)' }}>
          💬 {text ?? event.rawCode ?? 'nota'}
        </span>
      </div>
    );
  }

  if (isPoint) {
    const pointTeam = (event.payload.pointTeam ?? event.teamSide) as string;
    return (
      <div className={classes} role="listitem" onClick={() => clickable && onClick?.(event)}>
        <span className="event-col--seq">{event.sequence}</span>
        <span className="event-col--team">{teamDot(event.teamSide)}</span>
        <span className="event-col--meta-label" style={{ gridColumn: '3 / -1' }}>
          ● Punto {pointTeam === 'home' ? 'Casa' : 'Ospiti'}
        </span>
        {hasVideo && <span className="event-col--ts">{fmtTs(event.videoTsMs!)}</span>}
      </div>
    );
  }

  const quality = event.payload.quality as string | undefined;
  const skillType = event.payload.skillType as string | undefined ?? (event.rawCode ? extractTypeFromCode(event.rawCode) : undefined);

  return (
    <div className={classes} role="listitem" onClick={() => clickable && onClick?.(event)}>
      <span className="event-col--seq">{event.sequence}</span>
      <span className="event-col--team">{teamDot(event.teamSide)}</span>
      <span
        className={`event-col--player ${event.playerId && onClickPlayer ? 'event-col--clickable-player' : ''}`}
        onClick={event.playerId && onClickPlayer ? (e) => { e.stopPropagation(); onClickPlayer(event.playerId!); } : undefined}
        title={event.playerId ? 'Filtra per questo giocatore' : undefined}
      >
        {event.playerId
          ? `#${playersById.get(event.playerId)?.number ?? extractPlayerNum(event.rawCode)?.slice(1) ?? '?'}`
          : (extractPlayerNum(event.rawCode) ?? '')}
      </span>
      <span className="event-col--code">
        {isEditing && onCommitEdit ? (
          <input
            className="event-code-edit"
            value={editValue}
            autoFocus
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); onCommitEdit(editValue); }
              if (e.key === 'Escape') { e.preventDefault(); onCancelEdit?.(); }
              e.stopPropagation();
            }}
            onBlur={() => onCancelEdit?.()}
            onClick={e => e.stopPropagation()}
          />
        ) : event.rawCode ? (
          <span
            className={`event-code ${isInvalid ? 'event-code--invalid' : ''}`}
            onDoubleClick={e => { e.stopPropagation(); onStartEdit?.(); }}
            title="Doppio clic per modificare"
          >
            {event.rawCode.slice(0, 8)}
            {isInvalid && <span className="event-row__invalid-badge">ERR</span>}
          </span>
        ) : <span className="event-col--empty">—</span>}
      </span>
      <span className="event-col--skill">
        {event.payload.skill
          ? SKILL_LABELS[event.payload.skill as keyof typeof SKILL_LABELS]?.slice(0, 4) ?? event.payload.skill
          : <span className="event-col--empty">—</span>}
      </span>
      <span className="event-col--type">
        {skillType ? (TYPE_LABELS[skillType] ?? skillType) : <span className="event-col--empty">—</span>}
      </span>
      <span className={`event-col--quality event-col--quality-${quality ?? 'none'}`}>
        {quality ? (QUALITY_SHORT[quality] ?? quality) : <span className="event-col--empty">—</span>}
      </span>
      <span className="event-col--zone">
        {zoneLabel(
          event.payload.zoneFrom as number | undefined,
          event.payload.zoneTo as number | undefined,
          event.payload.zoneToSub as string | undefined,
        ) || <span className="event-col--empty">—</span>}
      </span>
      <span className="event-col--combo">
        {event.payload.combination
          ? <span className="event-col--combo-code">{event.payload.combination as string}</span>
          : <span className="event-col--empty">—</span>}
      </span>
      <span className="event-col--ts">
        {hasVideo ? fmtTs(event.videoTsMs!) : <span className="event-col--empty">—</span>}
      </span>
    </div>
  );
}

function teamDot(side: string | undefined) {
  if (side === 'home') return <span className="event-team-dot event-team-dot--home">H</span>;
  if (side === 'away') return <span className="event-team-dot event-team-dot--away">A</span>;
  return <span className="event-team-dot">·</span>;
}

function metaLabel(event: MatchEvent): string {
  switch (event.type) {
    case 'match_start':    return '── Inizio partita ──';
    case 'set_start':      return `── Inizio Set ${(event.payload.setNumber as number | undefined) ?? '?'} ──`;
    case 'set_end':        return '── Fine Set ──';
    case 'match_end':      return '── Fine partita ──';
    case 'formation_enter': return `Formazione ${event.teamSide === 'home' ? 'Casa' : 'Ospiti'} registrata`;
    case 'rally_start':    return '· Rally iniziato';
    case 'rally_end':      return '· Fine rally';
    default:               return event.type;
  }
}

function extractPlayerNum(rawCode: string | undefined): string {
  if (!rawCode) return '';
  const match = rawCode.match(/^[a-zA-Z*](\d{1,2})/);
  return match ? `#${match[1]}` : '';
}

function extractTypeFromCode(rawCode: string): string | undefined {
  // position 3 in code (after team + 2-digit player) is skill type
  const match = rawCode.match(/^[a-zA-Z*]\d{2}[SRABAD-F]([A-Z])/i);
  return match ? match[1].toUpperCase() : undefined;
}
