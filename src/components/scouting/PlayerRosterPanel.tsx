import { useMemo } from 'react';
import { useMatchStore } from '@/stores/matchStore';
import type { PlayerInfo } from '@/stores/matchStore';
import type { RotationState } from '@/types/match';

interface Props {
  teamSide: 'home' | 'away';
  teamName: string;
  players: PlayerInfo[];
  rotation: RotationState;
  servingTeam: 'home' | 'away';
  onPlayerClick: (prefix: string) => void;
}

export function PlayerRosterPanel({ teamSide, teamName, players, rotation, servingTeam, onPlayerClick }: Props) {
  const matchState = useMatchStore(s => s.matchState);

  // Build position map: playerId → court position (1-6)
  const positionMap = useMemo(() => {
    const m = new Map<string, number>();
    rotation.positions.forEach((pid, idx) => {
      if (pid) m.set(pid, idx + 1);
    });
    return m;
  }, [rotation.positions]);

  // Libero IDs on court
  const liberoOnCourtId = rotation.libero1Id ?? rotation.libero2Id;

  const score = matchState?.score ?? { home: 0, away: 0 };
  const isServing = servingTeam === teamSide;

  const sorted = useMemo(
    () => [...players].sort((a, b) => a.number - b.number),
    [players]
  );

  const handleClick = (p: PlayerInfo) => {
    const numStr = String(p.number).padStart(2, '0');
    const prefix = teamSide === 'home' ? `*${numStr}` : `a${numStr}`;
    onPlayerClick(prefix);
  };

  return (
    <div className={`player-roster player-roster--${teamSide}`}>
      {/* Team header */}
      <div className="player-roster__header">
        {isServing && <span className="player-roster__serve-dot" title="In battuta">▶</span>}
        <span className="player-roster__team-name">{teamName}</span>
        <span className={`player-roster__score player-roster__score--${teamSide}`}>
          {teamSide === 'home' ? score.home : score.away}
        </span>
      </div>

      {/* Player list */}
      <div className="player-roster__list">
        {sorted.map(p => {
          const courtPos = positionMap.get(p.id);
          const isOnCourt = courtPos !== undefined;
          const isLiberoOnCourt = p.id === liberoOnCourtId;
          const isLibero = p.isLibero;

          return (
            <button
              key={p.id}
              className={[
                'player-roster__row',
                isOnCourt ? 'player-roster__row--on-court' : 'player-roster__row--bench',
                isLibero ? 'player-roster__row--libero' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handleClick(p)}
              tabIndex={-1}
              title={`Inserisci ${teamSide === 'home' ? '*' : 'a'}${String(p.number).padStart(2, '0')} nel buffer`}
            >
              <span className="player-roster__pos">
                {isLiberoOnCourt ? 'L' : courtPos ?? '—'}
              </span>
              <span className="player-roster__num">
                {isLibero ? `L${p.number}` : `#${p.number}`}
              </span>
              <span className="player-roster__name">{p.lastName}</span>
            </button>
          );
        })}
        {sorted.length === 0 && (
          <div className="player-roster__empty">Nessun giocatore</div>
        )}
      </div>
    </div>
  );
}
