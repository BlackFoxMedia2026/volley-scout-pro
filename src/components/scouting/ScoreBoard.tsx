import { useMemo } from 'react';
import { useMatchStore } from '@/stores/matchStore';
import { computeCurrentRun } from '@/lib/analytics/stats';
import { SetTimer } from './SetTimer';
import { SKILL_LABELS } from '@/types/dv4';

const PHASE_LABELS: Record<string, string> = {
  not_started: 'Non iniziata',
  set_warmup: 'Riscaldamento',
  in_rally: 'In rally',
  between_rallies: 'Tra i rally',
  timeout: 'Timeout',
  substitution: 'Sostituzione',
  set_end: 'Fine set',
  match_end: 'Partita conclusa',
};

export function ScoreBoard() {
  const matchState = useMatchStore(s => s.matchState);
  const matchMeta = useMatchStore(s => s.matchMeta);
  const events = useMatchStore(s => s.events);

  const homeLabel = matchMeta?.homeTeamName ?? 'Casa';
  const awayLabel = matchMeta?.awayTeamName ?? 'Ospiti';

  const currentRun = useMemo(() => computeCurrentRun(events), [events]);

  const lastAction = useMemo(() => {
    const SCOUTING = new Set(['serve','reception','attack','block','dig','set','freeball']);
    const last = [...events]
      .filter(e => SCOUTING.has(e.type) && !e.undoneBySeq && e.payload.quality)
      .pop();
    if (!last) return null;
    const skill = last.payload.skill as string ?? last.type;
    const q = last.payload.quality as string;
    return { skill, q, team: last.teamSide as 'home' | 'away' | undefined };
  }, [events]);

  if (!matchState) return null;

  const { score, setsWon, setCores, currentSet, servingTeam, timeoutsUsed, substitutionsUsed, phase, rotation } = matchState;
  const homeRotIdx = (rotation.home.rotationIndex % 6) + 1;
  const awayRotIdx = (rotation.away.rotationIndex % 6) + 1;

  // Touch counts for current set
  const SCOUTING_TYPES = new Set(['serve','reception','attack','block','dig','set','freeball']);
  const homeTouches = events.filter(e => SCOUTING_TYPES.has(e.type) && e.teamSide === 'home' && !e.undoneBySeq).length;
  const awayTouches = events.filter(e => SCOUTING_TYPES.has(e.type) && e.teamSide === 'away' && !e.undoneBySeq).length;
  const maxScore = Math.max(score.home, score.away);
  const showTT = currentSet < 5 && phase !== 'not_started' && phase !== 'match_end';
  const tt8Done = maxScore >= 8;
  const tt16Done = maxScore >= 16;

  return (
    <div className="scoreboard">
      {/* Completed sets mini-scores */}
      {setCores.length > 0 && (
        <div className="scoreboard__history">
          {setCores.map((s, i) => (
            <div key={i} className="scoreboard__past-set">
              <span className="scoreboard__past-set-num">S{i + 1}</span>
              <span className={s.home > s.away ? 'scoreboard__past-set-win' : ''}>{s.home}</span>
              <span className="scoreboard__past-set-sep">-</span>
              <span className={s.away > s.home ? 'scoreboard__past-set-win' : ''}>{s.away}</span>
            </div>
          ))}
        </div>
      )}

      {/* Set indicator */}
      <div className="scoreboard__set-indicator">Set {currentSet}</div>

      <div className="scoreboard__teams">
        {/* Home */}
        <div className={`scoreboard__team scoreboard__team--home ${servingTeam === 'home' ? 'scoreboard__team--serving' : ''}`}>
          {servingTeam === 'home' && <div className="scoreboard__serve-indicator" aria-label="in battuta" />}
          <span className="scoreboard__team-name">{homeLabel}</span>
          <span className="scoreboard__sets">{setsWon.home}</span>
          <span className="scoreboard__score">{score.home}</span>
          <div className="scoreboard__meta">
            <span className="scoreboard__rot" title={`Rotazione ${homeRotIdx}`}>R{homeRotIdx}</span>
            <span title="Timeout rimasti">{2 - timeoutsUsed.home}TO</span>
            <span title="Sostituzioni rimaste">{6 - substitutionsUsed.home}S</span>
            <span title="Azioni registrate" style={{ opacity: .6 }}>{homeTouches}t</span>
          </div>
        </div>

        <div className="scoreboard__divider">:</div>

        {/* Away */}
        <div className={`scoreboard__team scoreboard__team--away ${servingTeam === 'away' ? 'scoreboard__team--serving' : ''}`}>
          {servingTeam === 'away' && <div className="scoreboard__serve-indicator scoreboard__serve-indicator--away" aria-label="in battuta" />}
          <span className="scoreboard__score">{score.away}</span>
          <span className="scoreboard__sets">{setsWon.away}</span>
          <span className="scoreboard__team-name">{awayLabel}</span>
          <div className="scoreboard__meta">
            <span className="scoreboard__rot" title={`Rotazione ${awayRotIdx}`}>R{awayRotIdx}</span>
            <span>{2 - timeoutsUsed.away}TO</span>
            <span title="Sostituzioni rimaste">{6 - substitutionsUsed.away}S</span>
            <span title="Azioni registrate" style={{ opacity: .6 }}>{awayTouches}t</span>
          </div>
        </div>
      </div>

      {/* Technical timeout + run indicator */}
      <div className="scoreboard__bottom-row">
        {showTT && (
          <div className="scoreboard__tt-row">
            <span className={`tt-badge ${tt8Done ? 'tt-badge--done' : ''}`}>TT8</span>
            <span className={`tt-badge ${tt16Done ? 'tt-badge--done' : ''}`}>TT16</span>
          </div>
        )}
        {currentRun && (
          <span
            className="scoreboard__run"
            style={{ color: currentRun.team === 'home' ? 'var(--home)' : 'var(--away)' }}
          >
            {currentRun.length}-0
          </span>
        )}
        {lastAction && (
          <span
            className={`scoreboard__last-action scoreboard__last-action--q-${lastAction.q === '#' ? 'excellent' : lastAction.q === '=' ? 'error' : lastAction.q === '+' ? 'positive' : 'neutral'}`}
            title="Ultima azione registrata"
          >
            {lastAction.team === 'home' ? 'H' : lastAction.team === 'away' ? 'A' : '?'}
            {' '}{SKILL_LABELS[lastAction.skill as keyof typeof SKILL_LABELS]?.slice(0,3) ?? lastAction.skill}
            {' '}{lastAction.q}
          </span>
        )}
        <div className="scoreboard__phase">{PHASE_LABELS[phase] ?? phase}</div>
        <SetTimer />
      </div>
    </div>
  );
}
