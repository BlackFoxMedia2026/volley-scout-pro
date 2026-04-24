import { useState } from 'react';
import type { PlayerStats } from '@/lib/analytics/stats';
import type { Skill } from '@/types/dv4';
import { SKILL_LABELS } from '@/types/dv4';

type SortKey = 'name' | 'total' | 'excellent' | 'positive' | 'ok' | 'negative' | 'error' | 'positivePercent' | 'efficiency';

interface Props {
  players: PlayerStats[];
  skill: Skill;
  playerNames?: Record<string, string>;
}

export function PlayerStatsTable({ players, skill, playerNames = {} }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('efficiency');
  const [sortAsc, setSortAsc] = useState(false);

  const rows = players
    .map(p => ({ ...p, s: p.bySkill[skill] }))
    .filter(p => p.s && p.s.total > 0);

  rows.sort((a, b) => {
    let av: number | string, bv: number | string;
    if (sortKey === 'name') {
      av = playerNames[a.playerId] ?? a.playerId;
      bv = playerNames[b.playerId] ?? b.playerId;
      const cmp = (av as string).localeCompare(bv as string);
      return sortAsc ? cmp : -cmp;
    }
    av = a.s![sortKey as keyof typeof a.s] as number;
    bv = b.s![sortKey as keyof typeof b.s] as number;
    return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  if (rows.length === 0) return (
    <p className="stats-empty">Nessun dato per {SKILL_LABELS[skill]}</p>
  );

  const th = (key: SortKey, label: React.ReactNode, title?: string) => {
    const active = sortKey === key;
    const arrow = active ? (sortAsc ? ' ↑' : ' ↓') : '';
    return (
      <th
        className={`sortable-th ${active ? 'sortable-th--active' : ''}`}
        title={title}
        onClick={() => { if (active) setSortAsc(a => !a); else { setSortKey(key); setSortAsc(false); } }}
      >
        {label}{arrow}
      </th>
    );
  };

  return (
    <table className="stats-table">
      <thead>
        <tr>
          {th('name', 'Giocatore')}
          {th('total', 'N', 'Totale azioni')}
          {th('excellent', <span className="quality-badge quality-badge--excellent">#</span>, 'Ace/Kill')}
          {th('positive', <span className="quality-badge quality-badge--positive">+</span>, 'Positivi')}
          {th('ok', <span className="quality-badge quality-badge--ok">!</span>, 'OK')}
          {th('negative', <span className="quality-badge quality-badge--negative">-</span>, 'Negativi')}
          {th('error', <span className="quality-badge quality-badge--error">=</span>, 'Errori')}
          {th('positivePercent', 'Pos%', 'Positività %')}
          {th('efficiency', 'Eff%', 'Efficienza %')}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ playerId, s }) => (
          <tr key={playerId}>
            <td>{playerNames[playerId] ?? playerId.slice(-6)}</td>
            <td>{s!.total}</td>
            <td className="q-excellent">{s!.excellent || '·'}</td>
            <td className="q-positive">{s!.positive || '·'}</td>
            <td className="q-ok">{s!.ok || '·'}</td>
            <td className="q-negative">{s!.negative || '·'}</td>
            <td className="q-error">{s!.error || '·'}</td>
            <td><span className="pct-badge">{s!.positivePercent}%</span></td>
            <td>
              <span className={`eff-badge eff-badge--${effClass(s!.efficiency)}`}>
                {s!.efficiency > 0 ? '+' : ''}{s!.efficiency}%
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function effClass(eff: number): string {
  if (eff >= 30) return 'high';
  if (eff >= 0)  return 'mid';
  return 'low';
}
