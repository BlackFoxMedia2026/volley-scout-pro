import { useMemo, useState } from 'react';
import { useMatchStore } from '@/stores/matchStore';
import {
  computeTeamStats, serveZoneDistribution,
  attackZoneDistribution, receptionZoneDistribution,
  assignEventSets, computeSetterCallStats, computeAttackCombinationStats,
  computeMaxRuns, computeSkillTypeStats, computeRotationStats, computeBlockTouchStats,
  computeReceptionAttackChain, computeSetTimeline, computeMomentumTrend,
  computeSetComparison, computeServeErrorBreakdown, computeAttackZoneComboStats,
  computeDigPerAttackZone, computeSideoutBySet, computeServeTargetStats, computeCoachInsights,
  computePlayerAttackTendency, extractMatchComments, computeScoringRuns, computeSetterCallByReception,
} from '@/lib/analytics/stats';
import { StatsBar } from './StatsBar';
import { PlayerStatsTable } from './PlayerStatsTable';
import { CourtZoneMap } from './CourtZoneMap';
import { ScoreProgressionChart } from './ScoreProgressionChart';
import { SetTimeline } from './SetTimeline';
import type { Skill } from '@/types/dv4';
import { SKILL_LABELS } from '@/types/dv4';

import type { MomentumPoint } from '@/lib/analytics/stats';

function MomentumSparkline({ points }: { points: MomentumPoint[] }) {
  const W = 220, H = 28, PAD = 4;
  const PW = W - PAD * 2;
  const mid = H / 2;
  const maxAbs = Math.max(...points.map(p => Math.abs(p.rollingEff)), 20);

  const xs = points.map((_, i) => PAD + (i / (points.length - 1)) * PW);
  const ys = points.map(p => mid - (p.rollingEff / maxAbs) * (mid - PAD));

  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const trend = points.length >= 3
    ? points[points.length - 1].rollingEff - points[points.length - 3].rollingEff
    : 0;
  const trendLabel = trend > 5 ? '↑' : trend < -5 ? '↓' : '→';
  const trendColor = trend > 5 ? 'var(--q-excellent)' : trend < -5 ? 'var(--q-error)' : 'var(--text-muted)';

  return (
    <div className="momentum-sparkline">
      <span className="momentum-sparkline__label">Trend (ultimi 5)</span>
      <svg width={W} height={H} className="momentum-sparkline__svg">
        <line x1={PAD} y1={mid} x2={W - PAD} y2={mid} stroke="var(--border)" strokeWidth={0.5} />
        <path d={path} fill="none" stroke="var(--home)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2.5} fill="var(--home)" />
      </svg>
      <span className="momentum-sparkline__now" style={{ color: last.rollingEff >= 0 ? 'var(--q-excellent)' : 'var(--q-error)' }}>
        {last.rollingEff > 0 ? '+' : ''}{last.rollingEff}%
      </span>
      <span className="momentum-sparkline__trend" style={{ color: trendColor }}>{trendLabel}</span>
    </div>
  );
}

type SkillTab = Skill | 'notes';
const SKILL_TABS: Skill[] = ['S', 'R', 'A', 'B', 'D'];

interface Props {
  onClose: () => void;
}

export function AnalyticsPanel({ onClose }: Props) {
  const { events, matchState, playersById } = useMatchStore();
  const [activeSkill, setActiveSkill] = useState<SkillTab>('S');
  const activeSkillOrNull = activeSkill === 'notes' ? null : activeSkill;
  const [focusTeam, setFocusTeam] = useState<'home' | 'away'>('home');
  const [filterSet, setFilterSet] = useState<number | null>(null);

  const playerNames = useMemo(() => {
    const names: Record<string, string> = {};
    playersById.forEach((info, id) => {
      const role = info.role ? ` (${info.role})` : '';
      names[id] = `#${info.number} ${info.lastName}${role}`;
    });
    return names;
  }, [playersById]);

  // Build per-set event index
  const setIndex = useMemo(() => assignEventSets(events), [events]);
  const totalSets = matchState ? matchState.currentSet : 1;

  const filteredEvents = useMemo(() => {
    if (!filterSet) return events;
    return events.filter(ev => setIndex.get(ev.id) === filterSet);
  }, [events, filterSet, setIndex]);

  const teamStats = useMemo(
    () => computeTeamStats(filteredEvents, focusTeam),
    [filteredEvents, focusTeam],
  );

  const serveZones = useMemo(
    () => serveZoneDistribution(filteredEvents, focusTeam),
    [filteredEvents, focusTeam],
  );

  const attackZones = useMemo(
    () => attackZoneDistribution(filteredEvents, focusTeam),
    [filteredEvents, focusTeam],
  );

  const receptionZones = useMemo(
    () => receptionZoneDistribution(filteredEvents, focusTeam),
    [filteredEvents, focusTeam],
  );

  const setterCallStats = useMemo(
    () => computeSetterCallStats(filteredEvents, focusTeam),
    [filteredEvents, focusTeam],
  );

  const combinationStats = useMemo(
    () => computeAttackCombinationStats(filteredEvents, focusTeam),
    [filteredEvents, focusTeam],
  );

  const maxRuns = useMemo(() => computeMaxRuns(events), [events]);

  const skillTypeStats = useMemo(
    () => computeSkillTypeStats(filteredEvents, focusTeam, activeSkill),
    [filteredEvents, focusTeam, activeSkill],
  );

  const rotationStats = useMemo(
    () => matchState ? computeRotationStats(matchState.matchId, events, focusTeam) : [],
    [events, focusTeam, matchState],
  );

  const blockTouchStats = useMemo(
    () => computeBlockTouchStats(filteredEvents, focusTeam),
    [filteredEvents, focusTeam],
  );

  const receptionAttackChain = useMemo(
    () => computeReceptionAttackChain(filteredEvents, focusTeam),
    [filteredEvents, focusTeam],
  );

  const setTimeline = useMemo(
    () => computeSetTimeline(events, setIndex, filterSet ?? undefined),
    [events, setIndex, filterSet],
  );

  const momentumTrend = useMemo(
    () => computeMomentumTrend(filteredEvents, focusTeam, activeSkill),
    [filteredEvents, focusTeam, activeSkill],
  );

  const setComparison = useMemo(
    () => totalSets > 1 ? computeSetComparison(events, focusTeam, totalSets) : [],
    [events, focusTeam, totalSets],
  );

  const serveErrorBreakdown = useMemo(
    () => computeServeErrorBreakdown(filteredEvents, focusTeam),
    [filteredEvents, focusTeam],
  );

  const attackZoneComboStats = useMemo(
    () => computeAttackZoneComboStats(filteredEvents, focusTeam),
    [filteredEvents, focusTeam],
  );

  const digPerAttackZone = useMemo(
    () => computeDigPerAttackZone(filteredEvents, focusTeam),
    [filteredEvents, focusTeam],
  );

  const sideoutBySet = useMemo(
    () => computeSideoutBySet(events, focusTeam),
    [events, focusTeam],
  );

  const serveTargetStats = useMemo(
    () => computeServeTargetStats(events, focusTeam === 'home' ? 'away' : 'home'),
    [events, focusTeam],
  );

  const coachInsights = useMemo(
    () => computeCoachInsights(events, focusTeam),
    [events, focusTeam],
  );

  const playerAttackTendency = useMemo(
    () => computePlayerAttackTendency(filteredEvents, focusTeam),
    [filteredEvents, focusTeam],
  );

  const matchComments = useMemo(
    () => extractMatchComments(events),
    [events],
  );

  const scoringRuns = useMemo(
    () => computeScoringRuns(events, 3),
    [events],
  );

  const setterCallByReception = useMemo(
    () => computeSetterCallByReception(filteredEvents, focusTeam),
    [filteredEvents, focusTeam],
  );

  const skillStat = activeSkillOrNull ? teamStats.bySkill[activeSkillOrNull] : null;

  return (
    <div className="analytics-panel">
      <header className="analytics-panel__header">
        <h2 className="analytics-panel__title">Statistiche</h2>
        <div className="analytics-panel__team-toggle">
          <button
            className={`team-toggle-btn ${focusTeam === 'home' ? 'team-toggle-btn--active' : ''}`}
            onClick={() => setFocusTeam('home')}
          >Casa</button>
          <button
            className={`team-toggle-btn ${focusTeam === 'away' ? 'team-toggle-btn--active' : ''}`}
            onClick={() => setFocusTeam('away')}
          >Ospiti</button>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={onClose}>✕</button>
      </header>

      {/* Summary row for all skills */}
      <div className="analytics-summary">
        {SKILL_TABS.map(skill => {
          const s = teamStats.bySkill[skill];
          if (!s || s.total === 0) return null;
          return (
            <div key={skill} className="summary-card" onClick={() => setActiveSkill(skill)}>
              <div className="summary-card__label">{SKILL_LABELS[skill]}</div>
              <div className="summary-card__eff">
                <span className={`eff-badge eff-badge--${s.efficiency >= 0 ? (s.efficiency >= 30 ? 'high' : 'mid') : 'low'}`}>
                  {s.efficiency > 0 ? '+' : ''}{s.efficiency}%
                </span>
              </div>
              <div className="summary-card__n">n={s.total}</div>
            </div>
          );
        })}
      </div>

      {/* Skill tab bar */}
      <nav className="analytics-tabs">
        {SKILL_TABS.map(skill => (
          <button
            key={skill}
            className={`tab-btn ${activeSkill === skill ? 'tab-btn--active' : ''}`}
            onClick={() => setActiveSkill(skill)}
          >
            {SKILL_LABELS[skill]}
          </button>
        ))}
        <button
          className={`tab-btn ${activeSkill === 'notes' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveSkill('notes')}
        >
          Note
        </button>
      </nav>

      {/* Set filter */}
      {totalSets > 1 && (
        <div className="analytics-set-filter">
          <button
            className={`set-filter-btn ${!filterSet ? 'set-filter-btn--active' : ''}`}
            onClick={() => setFilterSet(null)}
          >Tutti</button>
          {Array.from({ length: totalSets }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              className={`set-filter-btn ${filterSet === n ? 'set-filter-btn--active' : ''}`}
              onClick={() => setFilterSet(n)}
            >S{n}</button>
          ))}
        </div>
      )}

      <div className="analytics-content">
        {/* Coach insights */}
        {coachInsights.length > 0 && (
          <div className="analytics-insights">
            {coachInsights.map(ins => (
              <div key={ins.id} className={`insight-card insight-card--${ins.severity}`}>
                <div className="insight-card__title">{ins.title}</div>
                <div className="insight-card__body">{ins.body}</div>
              </div>
            ))}
          </div>
        )}

        {/* Notes tab */}
        {activeSkill === 'notes' && (
          <div className="analytics-section">
            <h4 className="analytics-section__title">Note partita ({matchComments.length})</h4>
            {matchComments.length === 0 ? (
              <div className="analytics-empty">Nessuna nota. Usa F9 per aggiungere note durante la partita.</div>
            ) : (
              <div className="match-notes-list">
                {matchComments.map(c => (
                  <div key={c.sequence} className={`match-note ${c.tag ? `match-note--${c.tag.toLowerCase()}` : ''}`}>
                    {c.tag && <span className="match-note__tag">{c.tag}</span>}
                    <span className="match-note__text">{c.text}</span>
                    {c.videoTsMs != null && (
                      <span className="match-note__ts">{Math.floor(c.videoTsMs / 60000)}:{String(Math.floor((c.videoTsMs % 60000) / 1000)).padStart(2,'0')}</span>
                    )}
                    <span className="match-note__seq">#{c.sequence}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSkill !== 'notes' && skillStat && skillStat.total > 0 ? (
          <>
            {/* Team-level bar */}
            <div className="analytics-section">
              <StatsBar label={`${activeSkillOrNull ? SKILL_LABELS[activeSkillOrNull] : ''} — ${filterSet ? `Set ${filterSet}` : 'partita'}`} stats={skillStat} />
              {momentumTrend.length >= 2 && (
                <MomentumSparkline points={momentumTrend} />
              )}
            </div>

            {/* Serve error breakdown */}
            {activeSkill === 'S' && serveErrorBreakdown.total > 0 && (
              <div className="analytics-section">
                <h4 className="analytics-section__title">Errori battuta ({serveErrorBreakdown.total})</h4>
                <div className="serve-error-bar">
                  {serveErrorBreakdown.net > 0 && (
                    <span className="serve-error-chip serve-error-chip--net">
                      Rete {serveErrorBreakdown.net}
                    </span>
                  )}
                  {serveErrorBreakdown.out > 0 && (
                    <span className="serve-error-chip serve-error-chip--out">
                      Out {serveErrorBreakdown.out}
                    </span>
                  )}
                  {serveErrorBreakdown.double > 0 && (
                    <span className="serve-error-chip">
                      Dbl {serveErrorBreakdown.double}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Zone maps per skill */}
            {activeSkill === 'S' && serveZones.length > 0 && (
              <div className="analytics-section analytics-section--row">
                <CourtZoneMap distributions={serveZones} title="Zona battuta" />
              </div>
            )}
            {activeSkill === 'A' && attackZones.length > 0 && (
              <div className="analytics-section analytics-section--row">
                <CourtZoneMap distributions={attackZones} title="Zona attacco" />
              </div>
            )}
            {activeSkill === 'R' && receptionZones.length > 0 && (
              <div className="analytics-section analytics-section--row">
                <CourtZoneMap distributions={receptionZones} title="Zona ricezione" />
              </div>
            )}

            {/* Skill type breakdown (serve/attack/reception types) */}
            {skillTypeStats.length > 0 && (
              <div className="analytics-section">
                <h4 className="analytics-section__title">Tipo</h4>
                <table className="setter-call-table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th style={{ textAlign: 'right' }}>Tot</th>
                      <th style={{ textAlign: 'right' }}>#</th>
                      <th style={{ textAlign: 'right' }}>=</th>
                      <th style={{ textAlign: 'right' }}>Eff%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skillTypeStats.map(s => (
                      <tr key={s.type}>
                        <td><span className="code-badge">{s.type}</span></td>
                        <td style={{ textAlign: 'right' }}>{s.total}</td>
                        <td style={{ textAlign: 'right' }} className="q-excellent">{s.excellent}</td>
                        <td style={{ textAlign: 'right' }} className="q-error">{s.error}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}
                          className={s.efficiency >= 20 ? 'q-excellent' : s.efficiency >= 0 ? '' : 'q-error'}>
                          {s.efficiency > 0 ? '+' : ''}{s.efficiency}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Reception → Attack chain (reception tab) */}
            {activeSkill === 'R' && receptionAttackChain.length > 0 && (
              <div className="analytics-section">
                <h4 className="analytics-section__title">Ricezione → Attacco</h4>
                <table className="setter-call-table">
                  <thead>
                    <tr>
                      <th>Ric</th>
                      <th style={{ textAlign: 'right' }}>Ric n.</th>
                      <th style={{ textAlign: 'right' }}>Att n.</th>
                      <th style={{ textAlign: 'right' }}>Kill</th>
                      <th style={{ textAlign: 'right' }}>Kill%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receptionAttackChain.map(r => (
                      <tr key={r.receptionQuality}>
                        <td>
                          <span className={`code-badge quality-badge quality-badge--${
                            r.receptionQuality === '#' ? 'excellent' :
                            r.receptionQuality === '+' ? 'positive' :
                            r.receptionQuality === '!' ? 'ok' :
                            r.receptionQuality === '-' ? 'negative' :
                            r.receptionQuality === '=' ? 'error' : ''
                          }`}>{r.receptionQuality}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>{r.totalReceptions}</td>
                        <td style={{ textAlign: 'right' }}>{r.totalAttacks}</td>
                        <td style={{ textAlign: 'right' }} className="q-excellent">{r.kills}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}
                          className={r.killRate >= 40 ? 'q-excellent' : r.killRate >= 20 ? '' : 'q-error'}>
                          {r.killRate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Setter call × Reception quality correlation */}
            {activeSkill === 'R' && setterCallByReception.length > 0 && (
              <div className="analytics-section">
                <h4 className="analytics-section__title">Chiamata × Qualità ricezione</h4>
                <table className="setter-call-table">
                  <thead>
                    <tr>
                      <th>Call</th>
                      <th>Ric</th>
                      <th style={{ textAlign: 'right' }}>Tot</th>
                      <th style={{ textAlign: 'right' }}>Kill%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setterCallByReception.slice(0, 10).map(r => (
                      <tr key={`${r.setterCall}:${r.receptionQuality}`}>
                        <td><span className="code-badge">{r.setterCall}</span></td>
                        <td>
                          <span className={`code-badge quality-badge quality-badge--${
                            r.receptionQuality === '#' ? 'excellent' :
                            r.receptionQuality === '+' ? 'positive' :
                            r.receptionQuality === '!' ? 'ok' : 'negative'
                          }`}>{r.receptionQuality}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>{r.total}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}
                          className={r.killRate >= 40 ? 'q-excellent' : r.killRate >= 20 ? '' : 'q-error'}>
                          {r.killRate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Dig per opponent attack zone */}
            {(activeSkill === 'D') && digPerAttackZone.length > 0 && (
              <div className="analytics-section">
                <h4 className="analytics-section__title">Difesa per zona attacco avversario</h4>
                <table className="setter-call-table">
                  <thead>
                    <tr>
                      <th>Zona att.</th>
                      <th style={{ textAlign: 'right' }}>Dif n.</th>
                      <th style={{ textAlign: 'right' }}>Pos</th>
                      <th style={{ textAlign: 'right' }}>Err</th>
                      <th style={{ textAlign: 'right' }}>Pos%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {digPerAttackZone.map(r => (
                      <tr key={r.attackZone}>
                        <td><span className="code-badge">Z{r.attackZone}</span></td>
                        <td style={{ textAlign: 'right' }}>{r.totalDigs}</td>
                        <td style={{ textAlign: 'right' }} className="q-excellent">{r.positive}</td>
                        <td style={{ textAlign: 'right' }} className="q-error">{r.error}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}
                          className={r.positiveRate >= 50 ? 'q-excellent' : r.positiveRate >= 30 ? '' : 'q-error'}>
                          {r.positiveRate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Block touch breakdown */}
            {activeSkill === 'B' && blockTouchStats.length > 0 && (
              <div className="analytics-section">
                <h4 className="analytics-section__title">Muri per numero blockers</h4>
                <table className="setter-call-table">
                  <thead>
                    <tr>
                      <th>Blockers</th>
                      <th style={{ textAlign: 'right' }}>Tot</th>
                      <th style={{ textAlign: 'right' }}>Stop</th>
                      <th style={{ textAlign: 'right' }}>Err</th>
                      <th style={{ textAlign: 'right' }}>Eff%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blockTouchStats.map(s => (
                      <tr key={s.blockers}>
                        <td><span className="code-badge">{s.blockers}B</span></td>
                        <td style={{ textAlign: 'right' }}>{s.total}</td>
                        <td style={{ textAlign: 'right' }} className="q-excellent">{s.stops}</td>
                        <td style={{ textAlign: 'right' }} className="q-error">{s.errors}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}
                          className={s.efficiency >= 20 ? 'q-excellent' : s.efficiency >= 0 ? '' : 'q-error'}>
                          {s.efficiency > 0 ? '+' : ''}{s.efficiency}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Setter call breakdown (attack tab) */}
            {activeSkill === 'A' && setterCallStats.length > 0 && (
              <div className="analytics-section">
                <h4 className="analytics-section__title">Chiamate palleggiatore</h4>
                <table className="setter-call-table">
                  <thead>
                    <tr>
                      <th>Cod</th>
                      <th style={{ textAlign: 'right' }}>Tot</th>
                      <th style={{ textAlign: 'right' }}>Kill</th>
                      <th style={{ textAlign: 'right' }}>Err</th>
                      <th style={{ textAlign: 'right' }}>Eff%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setterCallStats.map(s => (
                      <tr key={s.code}>
                        <td><span className="code-badge">{s.code}</span></td>
                        <td style={{ textAlign: 'right' }}>{s.total}</td>
                        <td style={{ textAlign: 'right' }} className="q-excellent">{s.kills}</td>
                        <td style={{ textAlign: 'right' }} className="q-error">{s.errors}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}
                          className={s.efficiency >= 30 ? 'q-excellent' : s.efficiency >= 0 ? '' : 'q-error'}>
                          {s.efficiency > 0 ? '+' : ''}{s.efficiency}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Attack zone × combination matrix */}
            {activeSkill === 'A' && attackZoneComboStats.length > 0 && (
              <div className="analytics-section">
                <h4 className="analytics-section__title">Zona × Combinazione</h4>
                <table className="setter-call-table">
                  <thead>
                    <tr>
                      <th>Zona</th>
                      <th>Combo</th>
                      <th style={{ textAlign: 'right' }}>Tot</th>
                      <th style={{ textAlign: 'right' }}>Kill</th>
                      <th style={{ textAlign: 'right' }}>Kill%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attackZoneComboStats.slice(0, 10).map(s => (
                      <tr key={`${s.zone}:${s.combination}`}>
                        <td><span className="code-badge">Z{s.zone}</span></td>
                        <td><span className="code-badge">{s.combination}</span></td>
                        <td style={{ textAlign: 'right' }}>{s.total}</td>
                        <td style={{ textAlign: 'right' }} className="q-excellent">{s.kills}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}
                          className={s.killRate >= 40 ? 'q-excellent' : s.killRate >= 25 ? '' : 'q-error'}>
                          {s.killRate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Player attack tendency (zone preference per attacker) */}
            {activeSkill === 'A' && playerAttackTendency.length > 0 && (
              <div className="analytics-section">
                <h4 className="analytics-section__title">Tendenza attacco per giocatore</h4>
                <table className="setter-call-table">
                  <thead>
                    <tr>
                      <th>Giocatore</th>
                      <th>Zona</th>
                      <th style={{ textAlign: 'right' }}>n.</th>
                      <th style={{ textAlign: 'right' }}>Kill%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerAttackTendency.slice(0, 12).map(r => {
                      const info = playersById.get(r.playerId);
                      const name = info ? `#${info.number} ${info.lastName.slice(0,7)}` : r.playerId.slice(-4);
                      return (
                        <tr key={`${r.playerId}:${r.zone}`}>
                          <td style={{ fontSize: '.72rem' }}>{name}</td>
                          <td><span className="code-badge">Z{r.zone}</span></td>
                          <td style={{ textAlign: 'right' }}>{r.total}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}
                            className={r.killRate >= 40 ? 'q-excellent' : r.killRate >= 20 ? '' : 'q-error'}>
                            {r.killRate}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Attack combinations (non-setter-call) */}
            {activeSkill === 'A' && combinationStats.length > 0 && (
              <div className="analytics-section">
                <h4 className="analytics-section__title">Combinazioni</h4>
                <table className="setter-call-table">
                  <thead>
                    <tr>
                      <th>Cod</th>
                      <th style={{ textAlign: 'right' }}>Tot</th>
                      <th style={{ textAlign: 'right' }}>Kill</th>
                      <th style={{ textAlign: 'right' }}>Eff%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinationStats.map(s => (
                      <tr key={s.code}>
                        <td><span className="code-badge">{s.code}</span></td>
                        <td style={{ textAlign: 'right' }}>{s.total}</td>
                        <td style={{ textAlign: 'right' }} className="q-excellent">{s.kills}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}
                          className={s.efficiency >= 30 ? 'q-excellent' : s.efficiency >= 0 ? '' : 'q-error'}>
                          {s.efficiency > 0 ? '+' : ''}{s.efficiency}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Per-player table */}
            {activeSkillOrNull && (
              <div className="analytics-section">
                <h4 className="analytics-section__title">Per giocatore</h4>
                <PlayerStatsTable
                  players={teamStats.byPlayer}
                  skill={activeSkillOrNull}
                  playerNames={playerNames}
                />
              </div>
            )}
          </>
        ) : (
          activeSkill !== 'notes' && (
            <div className="analytics-empty">
              Nessun dato per {activeSkillOrNull ? SKILL_LABELS[activeSkillOrNull] : ''}
              {filterSet ? ` nel Set ${filterSet}` : ''}
            </div>
          )
        )}

        {/* Rotation stats (always visible if data available) */}
        {rotationStats.length > 0 && (
          <div className="analytics-section" style={{ marginTop: '.75rem' }}>
            <h4 className="analytics-section__title">Rotazioni ({focusTeam === 'home' ? 'Casa' : 'Ospiti'})</h4>
            <table className="setter-call-table">
              <thead>
                <tr>
                  <th>Rot</th>
                  <th style={{ textAlign: 'right' }}>Vinti</th>
                  <th style={{ textAlign: 'right' }}>Persi</th>
                  <th style={{ textAlign: 'right' }}>SO%</th>
                  <th style={{ textAlign: 'right' }}>BP%</th>
                </tr>
              </thead>
              <tbody>
                {rotationStats.map(r => {
                  const soBase = r.sideouts + (r.pointsLost - r.breakpoints);
                  const bpBase = r.breakpoints + (r.pointsLost - r.sideouts);
                  const so = soBase > 0 ? Math.round((r.sideouts / soBase) * 100) : 0;
                  const bp = bpBase > 0 ? Math.round((r.breakpoints / bpBase) * 100) : 0;
                  return (
                    <tr key={r.rotationIndex}>
                      <td><span className="code-badge">R{r.rotationIndex + 1}</span></td>
                      <td style={{ textAlign: 'right', color: 'var(--q-excellent)' }}>{r.pointsWon}</td>
                      <td style={{ textAlign: 'right', color: 'var(--q-error)' }}>{r.pointsLost}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}
                        className={so >= 50 ? 'q-excellent' : so >= 30 ? '' : 'q-error'}>
                        {so}%
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}
                        className={bp >= 50 ? 'q-excellent' : bp >= 30 ? '' : 'q-error'}>
                        {bp}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Set-by-set skill comparison (shown when 2+ sets) */}
        {setComparison.length > 0 && (
          <div className="analytics-section" style={{ marginTop: '.75rem' }}>
            <h4 className="analytics-section__title">Confronto per set — {focusTeam === 'home' ? 'Casa' : 'Ospiti'}</h4>
            <table className="setter-call-table">
              <thead>
                <tr>
                  <th>Skill</th>
                  {Array.from({ length: totalSets }, (_, i) => i + 1).map(n => (
                    <th key={n} style={{ textAlign: 'right' }}>S{n}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {setComparison.map(row => (
                  <tr key={row.skill}>
                    <td><span className="code-badge">{SKILL_LABELS[row.skill]}</span></td>
                    {row.sets.map((s, i) => (
                      <td key={i} style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)' }}
                        className={s === null ? '' : s.efficiency >= 20 ? 'q-excellent' : s.efficiency >= 0 ? '' : 'q-error'}>
                        {s === null ? <span className="event-col--empty">—</span> : `${s.efficiency > 0 ? '+' : ''}${s.efficiency}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sideout / Breakpoint by set */}
        {sideoutBySet.length > 0 && (
          <div className="analytics-section" style={{ marginTop: '.75rem' }}>
            <h4 className="analytics-section__title">SO% / BP% per set — {focusTeam === 'home' ? 'Casa' : 'Ospiti'}</h4>
            <table className="setter-call-table">
              <thead>
                <tr>
                  <th>Set</th>
                  <th style={{ textAlign: 'right' }}>SO%</th>
                  <th style={{ textAlign: 'right' }}>BP%</th>
                  <th style={{ textAlign: 'right' }}>R.Serv</th>
                  <th style={{ textAlign: 'right' }}>R.Ric</th>
                </tr>
              </thead>
              <tbody>
                {sideoutBySet.map(r => (
                  <tr key={r.setNumber}>
                    <td><span className="code-badge">S{r.setNumber}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}
                      className={r.sideoutPct >= 55 ? 'q-excellent' : r.sideoutPct >= 40 ? '' : 'q-error'}>
                      {r.sideoutPct}%
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}
                      className={r.breakpointPct >= 30 ? 'q-excellent' : r.breakpointPct >= 20 ? '' : 'q-error'}>
                      {r.breakpointPct}%
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.serveRallies}</td>
                    <td style={{ textAlign: 'right' }}>{r.receiveRallies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Serve targeting — which opponent player receives most */}
        {serveTargetStats.length > 0 && (
          <div className="analytics-section" style={{ marginTop: '.75rem' }}>
            <h4 className="analytics-section__title">
              Bersaglio battuta ({focusTeam === 'home' ? 'Ospiti' : 'Casa'} riceve)
            </h4>
            <table className="setter-call-table">
              <thead>
                <tr>
                  <th>Giocatore</th>
                  <th style={{ textAlign: 'right' }}>Ric</th>
                  <th style={{ textAlign: 'right' }}>Pos%</th>
                  <th style={{ textAlign: 'right' }}>Eff%</th>
                </tr>
              </thead>
              <tbody>
                {serveTargetStats.slice(0, 6).map(r => {
                  const info = playersById.get(r.playerId);
                  const name = info ? `#${info.number} ${info.lastName}` : r.playerId.slice(-6);
                  return (
                    <tr key={r.playerId}>
                      <td>{name}</td>
                      <td style={{ textAlign: 'right' }}>{r.total}</td>
                      <td style={{ textAlign: 'right' }}
                        className={r.positivePercent >= 60 ? 'q-error' : r.positivePercent >= 40 ? '' : 'q-excellent'}>
                        {r.positivePercent}%
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}
                        className={r.efficiency >= 20 ? 'q-error' : r.efficiency >= 0 ? '' : 'q-excellent'}>
                        {r.efficiency > 0 ? '+' : ''}{r.efficiency}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: '.25rem' }}>
              Pos%/Eff% alti = ricezione avversaria efficace (verde = bersaglio debole)
            </p>
          </div>
        )}

        {/* Score progression chart (always visible) */}
        <ScoreProgressionChart events={events} filterSet={filterSet} />

        {/* Scoring runs */}
        {scoringRuns.length > 0 && (
          <div className="analytics-section" style={{ marginTop: '.75rem' }}>
            <h4 className="analytics-section__title">Parziali ≥3 (top {Math.min(scoringRuns.length, 8)})</h4>
            <div className="scoring-runs-list">
              {scoringRuns.slice(0, 8).map((r, i) => (
                <div key={i} className={`scoring-run scoring-run--${r.team}`}>
                  <span className="scoring-run__badge">{r.length}-0</span>
                  <span className="scoring-run__detail">
                    S{r.setNumber} · {r.startScore.home}-{r.startScore.away} → {r.endScore.home}-{r.endScore.away}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Set timeline — stoppages vs score */}
        <div className="analytics-section" style={{ marginTop: '.5rem' }}>
          <h4 className="analytics-section__title">Timeline interruzioni</h4>
          <SetTimeline
            events={setTimeline}
            homeLabel={matchState ? 'H' : 'H'}
            awayLabel={matchState ? 'A' : 'A'}
          />
        </div>
      </div>

      {/* Mini rally summary */}
      {matchState && (
        <div className="analytics-rally-bar">
          <span>Set {matchState.currentSet}</span>
          <span className="home-score">{matchState.score.home}</span>
          <span>:</span>
          <span className="away-score">{matchState.score.away}</span>
          {maxRuns.homeMax > 0 && (
            <span className="rally-run" style={{ color: 'var(--home)' }} title="Massimo parziale Casa">
              max {maxRuns.homeMax}-0
            </span>
          )}
          {maxRuns.awayMax > 0 && (
            <span className="rally-run" style={{ color: 'var(--away)' }} title="Massimo parziale Ospiti">
              {maxRuns.awayMax}-0
            </span>
          )}
          <span className="rally-total">{teamStats.rallyStats.total}pt</span>
        </div>
      )}
    </div>
  );
}
