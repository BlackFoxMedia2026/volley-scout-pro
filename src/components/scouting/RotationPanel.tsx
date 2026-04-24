import { useMemo } from 'react';
import { useMatchStore } from '@/stores/matchStore';
import type { RotationState } from '@/types/match';
import type { MatchEvent } from '@/types/match';

// Position layout in the 3x2 court grid
// Home view: pos4 pos3 pos2 (front row), pos5 pos6 pos1 (back row)
const GRID_LAYOUT = [
  { pos: 4, col: 1, row: 1 },
  { pos: 3, col: 2, row: 1 },
  { pos: 2, col: 3, row: 1 },
  { pos: 5, col: 1, row: 2 },
  { pos: 6, col: 2, row: 2 },
  { pos: 1, col: 3, row: 2 },
] as const;

interface Props {
  playerMap: Map<string, { number: number; lastName: string; isLibero?: boolean }>;
}

export function RotationPanel({ playerMap }: Props) {
  const matchState = useMatchStore(s => s.matchState);
  const events = useMatchStore(s => s.events);
  if (!matchState) return null;

  const { rotation, servingTeam, score, currentSet } = matchState;

  // Quick per-player stats: serve efficiency and reception positive%
  const playerStatMap = useMemo(() => computePlayerQuickStats(events), [events]);

  return (
    <div className="rotation-panel">
      <div className="rotation-panel__heading">
        Rotazioni — Set {currentSet}
      </div>
      <RotationGrid
        label="Casa"
        rotation={rotation.home}
        isServing={servingTeam === 'home'}
        color="home"
        playerMap={playerMap}
        score={score.home}
        playerStatMap={playerStatMap}
      />
      <RotationGrid
        label="Ospiti"
        rotation={rotation.away}
        isServing={servingTeam === 'away'}
        color="away"
        playerMap={playerMap}
        score={score.away}
        playerStatMap={playerStatMap}
      />
    </div>
  );
}

interface PlayerQuickStat {
  serveTotal: number;
  serveAce: number;
  serveError: number;
  recvTotal: number;
  recvPositive: number;  // # + +
  recvError: number;
}

function computePlayerQuickStats(events: MatchEvent[]): Map<string, PlayerQuickStat> {
  const map = new Map<string, PlayerQuickStat>();
  for (const ev of events) {
    if (ev.undoneBySeq !== undefined || !ev.playerId) continue;
    const pid = ev.playerId;
    if (!map.has(pid)) map.set(pid, { serveTotal: 0, serveAce: 0, serveError: 0, recvTotal: 0, recvPositive: 0, recvError: 0 });
    const s = map.get(pid)!;
    if (ev.type === 'serve') {
      s.serveTotal++;
      if (ev.payload.quality === '#') s.serveAce++;
      if (ev.payload.quality === '=') s.serveError++;
    }
    if (ev.type === 'reception') {
      s.recvTotal++;
      if (ev.payload.quality === '#' || ev.payload.quality === '+') s.recvPositive++;
      if (ev.payload.quality === '=') s.recvError++;
    }
  }
  return map;
}

function RotationGrid({
  label, rotation, isServing, color, playerMap, score, playerStatMap,
}: {
  label: string;
  rotation: RotationState;
  isServing: boolean;
  color: 'home' | 'away';
  playerMap: Map<string, { number: number; lastName: string; isLibero?: boolean }>;
  score: number;
  playerStatMap: Map<string, PlayerQuickStat>;
}) {
  return (
    <div className="rotation-grid">
      <div className={`rotation-grid__label rotation-grid__label--${color}`}>
        {isServing && <span className="rotation-grid__serve-dot" />}
        {label}
        <span className="rotation-grid__score">{score}</span>
      </div>
      <div className="rotation-grid__net" aria-hidden>RETE</div>
      <div className="rotation-grid__court">
        {GRID_LAYOUT.map(({ pos, col, row }) => {
          const playerId = rotation.positions[pos - 1];
          const player = playerId ? playerMap.get(playerId) : null;
          const isServerPos = pos === 1;
          const isLibero = !!player?.isLibero;
          const pStat = playerId ? playerStatMap.get(playerId) : null;

          // Serve badge (position 1 = server)
          const serveBadge = pStat && pStat.serveTotal > 0 && isServerPos && isServing
            ? serveBadgeLabel(pStat)
            : null;

          // Reception badge (back row = positions 1, 5, 6)
          const recvBadge = pStat && pStat.recvTotal > 0 && (pos === 1 || pos === 5 || pos === 6)
            ? recvBadgeLabel(pStat)
            : null;

          return (
            <div
              key={pos}
              className={[
                'rotation-cell',
                `rotation-cell--col${col}`,
                `rotation-cell--row${row}`,
                isServerPos && isServing ? 'rotation-cell--server' : '',
                rotation.isConfirmed ? '' : 'rotation-cell--unconfirmed',
                isLibero ? 'rotation-cell--libero' : '',
              ].filter(Boolean).join(' ')}
              style={{ gridColumn: col, gridRow: row }}
              aria-label={`Pos ${pos}`}
            >
              <span className="rotation-cell__pos">P{pos}</span>
              {player ? (
                <>
                  <span className="rotation-cell__number">
                    {isLibero && <span className="rotation-cell__libero-badge">L</span>}
                    #{player.number}
                  </span>
                  <span className="rotation-cell__name">{player.lastName.slice(0, 5)}</span>
                  {serveBadge && (
                    <span className={`rotation-cell__stat rotation-cell__stat--${serveBadge.cls}`} title={`Battuta: ${serveBadge.text}`}>
                      S{serveBadge.text}
                    </span>
                  )}
                  {!serveBadge && recvBadge && (
                    <span className={`rotation-cell__stat rotation-cell__stat--${recvBadge.cls}`} title={`Ricezione: ${recvBadge.text}`}>
                      R{recvBadge.text}
                    </span>
                  )}
                </>
              ) : (
                <span className="rotation-cell__empty">—</span>
              )}
            </div>
          );
        })}
      </div>
      {!rotation.isConfirmed && (
        <div className="rotation-grid__warn">Formazione non inserita</div>
      )}
    </div>
  );
}

function serveBadgeLabel(s: PlayerQuickStat): { text: string; cls: string } {
  const eff = Math.round(((s.serveAce - s.serveError) / s.serveTotal) * 100);
  const cls = eff >= 20 ? 'good' : eff >= 0 ? 'ok' : 'bad';
  return { text: `${eff > 0 ? '+' : ''}${eff}%`, cls };
}

function recvBadgeLabel(s: PlayerQuickStat): { text: string; cls: string } {
  const pos = Math.round((s.recvPositive / s.recvTotal) * 100);
  const cls = pos >= 60 ? 'good' : pos >= 40 ? 'ok' : 'bad';
  return { text: `${pos}%`, cls };
}
