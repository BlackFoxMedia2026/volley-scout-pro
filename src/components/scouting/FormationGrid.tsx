import { useState, useCallback } from 'react';
import type { FormationSnapshot, FormationError } from '@/lib/formation/formationEngine';
import { COURT_GRID, validateFormation } from '@/lib/formation/formationEngine';
import type { Player } from '@/types/match';

interface Props {
  teamSide: 'home' | 'away';
  players: Player[];
  initial?: Partial<FormationSnapshot>;
  onConfirm: (formation: FormationSnapshot) => void;
  onCancel: () => void;
}

type Pos = 0 | 1 | 2 | 3 | 4 | 5;

export function FormationGrid({ teamSide, players, initial, onConfirm, onCancel }: Props) {
  const [positions, setPositions] = useState<(string | null)[]>([
    initial?.positions?.[0] ?? null,
    initial?.positions?.[1] ?? null,
    initial?.positions?.[2] ?? null,
    initial?.positions?.[3] ?? null,
    initial?.positions?.[4] ?? null,
    initial?.positions?.[5] ?? null,
  ]);
  const [setterId, setSetterId] = useState<string | null>(initial?.setterId ?? null);
  const [libero1Id, setLibero1Id] = useState<string | null>(initial?.libero1Id ?? null);
  const [libero2Id, setLibero2Id] = useState<string | null>(initial?.libero2Id ?? null);
  const [selectedPos, setSelectedPos] = useState<Pos | null>(null);
  const [errors, setErrors] = useState<FormationError[]>([]);

  // Assign the currently selected player to the selected position
  const assignPlayer = useCallback((playerId: string) => {
    if (selectedPos === null) return;
    setPositions(prev => {
      const next = [...prev];
      // Remove player from any existing position first
      const existingIdx = next.findIndex(p => p === playerId);
      if (existingIdx !== -1) next[existingIdx] = null;
      next[selectedPos] = playerId;
      return next;
    });
    setSelectedPos(null);
  }, [selectedPos]);

  const clearPosition = useCallback((pos: Pos) => {
    setPositions(prev => {
      const next = [...prev];
      next[pos] = null;
      return next;
    });
  }, []);

  const formation: FormationSnapshot = {
    positions: positions as [string|null,string|null,string|null,string|null,string|null,string|null],
    setterId,
    libero1Id,
    libero2Id,
    rotationIndex: 0,
    isConfirmed: true,
    entryMethod: 'manual',
  };

  const handleConfirm = () => {
    const errs = validateFormation(formation, teamSide === 'home');
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    onConfirm(formation);
  };

  const assignedIds = new Set(positions.filter(Boolean) as string[]);

  return (
    <div className="formation-grid">
      <h2 className="formation-grid__title">
        Formazione — {teamSide === 'home' ? 'Casa' : 'Ospiti'}
      </h2>

      {errors.length > 0 && (
        <ul className="formation-grid__errors" role="alert">
          {errors.map((e, i) => <li key={i}>{e.message}</li>)}
        </ul>
      )}

      {/* Court diagram */}
      <div className="court-diagram">
        <div className="court-diagram__net" aria-hidden>RETE</div>
        <div className="court-diagram__grid">
          {([1, 2, 3, 4, 5, 6] as const).map(posNum => {
            const { col, row } = COURT_GRID[posNum];
            const posIdx = (posNum - 1) as Pos;
            const playerId = positions[posIdx];
            const player = players.find(p => p.id === playerId);
            const isSelected = selectedPos === posIdx;
            return (
              <button
                key={posNum}
                className={`court-cell court-cell--col${col} court-cell--row${row} ${isSelected ? 'court-cell--selected' : ''} ${playerId ? 'court-cell--filled' : 'court-cell--empty'}`}
                style={{ gridColumn: col + 1, gridRow: row + 1 }}
                onClick={() => {
                  if (playerId) {
                    if (isSelected) clearPosition(posIdx);
                    else setSelectedPos(posIdx);
                  } else {
                    setSelectedPos(posIdx);
                  }
                }}
                aria-label={`Posizione ${posNum}${player ? `: ${player.lastName} #${player.number}` : ''}`}
              >
                <span className="court-cell__pos">P{posNum}</span>
                {player ? (
                  <>
                    <span className="court-cell__number">#{player.number}</span>
                    <span className="court-cell__name">{player.lastName}</span>
                  </>
                ) : (
                  <span className="court-cell__empty-label">—</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Player roster for selection */}
      {selectedPos !== null && (
        <div className="formation-roster">
          <div className="formation-roster__hint">
            Seleziona giocatore per posizione {selectedPos + 1}
          </div>
          <div className="formation-roster__list">
            {players.map(player => {
              const isAssigned = assignedIds.has(player.id);
              const isLibero = player.isLibero;
              return (
                <button
                  key={player.id}
                  className={`roster-btn ${isAssigned ? 'roster-btn--assigned' : ''} ${isLibero ? 'roster-btn--libero' : ''}`}
                  onClick={() => assignPlayer(player.id)}
                  disabled={isAssigned && positions[selectedPos] !== player.id}
                >
                  <span className="roster-btn__number">#{player.number}</span>
                  <span className="roster-btn__name">{player.lastName} {player.firstName[0]}.</span>
                  <span className="roster-btn__role">{isLibero ? 'L' : player.role}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Libero / setter assignment */}
      <div className="formation-meta">
        <label className="formation-meta__field">
          <span>Palleggiatore</span>
          <select value={setterId ?? ''} onChange={e => setSetterId(e.target.value || null)}>
            <option value="">— seleziona —</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>#{p.number} {p.lastName}</option>
            ))}
          </select>
        </label>

        <label className="formation-meta__field">
          <span>Libero 1</span>
          <select value={libero1Id ?? ''} onChange={e => setLibero1Id(e.target.value || null)}>
            <option value="">— nessuno —</option>
            {players.filter(p => p.isLibero).map(p => (
              <option key={p.id} value={p.id}>#{p.number} {p.lastName}</option>
            ))}
          </select>
        </label>

        <label className="formation-meta__field">
          <span>Libero 2</span>
          <select value={libero2Id ?? ''} onChange={e => setLibero2Id(e.target.value || null)}>
            <option value="">— nessuno —</option>
            {players.filter(p => p.isLibero).map(p => (
              <option key={p.id} value={p.id}>#{p.number} {p.lastName}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="formation-grid__actions">
        <button className="btn btn--secondary" onClick={onCancel}>Annulla</button>
        <button className="btn btn--primary" onClick={handleConfirm}>Conferma formazione</button>
      </div>
    </div>
  );
}
