import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useMatchStore } from '@/stores/matchStore';
import type { MatchEvent } from '@/types/match';
import { replayEvents } from '@/lib/reducer/matchReducer';

interface PlayerInfo {
  number: number;
  lastName: string;
}

interface Props {
  matchId: string;
  playerMap: Map<string, PlayerInfo>;
  onClose: () => void;
}

const POSITIONS = [1, 2, 3, 4, 5, 6] as const;

export function SubstitutionDialog({ matchId, playerMap, onClose }: Props) {
  const matchState  = useMatchStore(s => s.matchState);
  const events      = useMatchStore(s => s.events);
  const actorUserId = useMatchStore(s => s.actorUserId);
  const setStore = useMatchStore.setState;

  const [team, setTeam] = useState<'home' | 'away'>('home');
  const [positionOut, setPositionOut] = useState<number>(1);
  const [playerInId, setPlayerInId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!matchState) return null;

  const rotation = matchState.rotation[team];
  const playerOutId = rotation.positions[positionOut - 1];
  const playerOut = playerOutId ? playerMap.get(playerOutId) : null;

  // Players on bench = those not in rotation positions
  const onCourtIds = new Set(rotation.positions.filter(Boolean) as string[]);
  const benchPlayers = [...playerMap.entries()]
    .filter(([id]) => !onCourtIds.has(id))
    .map(([id, info]) => ({ id, number: info.number, lastName: info.lastName }))
    .sort((a, b) => a.number - b.number);

  const handleSubmit = async () => {
    if (!playerInId) { setError('Seleziona il giocatore entrante'); return; }
    if (!playerOutId) { setError('La posizione selezionata è vuota'); return; }

    setSubmitting(true);
    setError('');
    try {
      const ev = await invoke<MatchEvent>('append_event', {
        req: {
          matchId,
          setId: null,
          rallyId: null,
          timestampMs: Date.now(),
          videoTsMs: null,
          type: 'substitution',
          actorUserId: actorUserId,
          playerId: playerInId,
          teamSide: team,
          rawCode: null,
          skill: null,
          skillType: null,
          quality: null,
          combination: null,
          zoneFrom: null,
          zoneTo: null,
          zoneToSub: null,
          endZonePlus: null,
          payload: JSON.stringify({ playerOutId, playerInId, position: positionOut }),
          isValid: true,
        },
      });
      const allEvents = [...events, ev];
      setStore(s => ({
        ...s,
        events: allEvents,
        matchState: replayEvents(matchId, allEvents),
      }));
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="scouting-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="scouting-overlay__card" style={{ minWidth: 340 }}>
        <h2>Sostituzione</h2>

        {/* Team selector */}
        <div className="sub-dialog__row">
          <label className="sub-dialog__label">Squadra</label>
          <div className="sub-dialog__seg">
            <button
              className={`btn btn--sm ${team === 'home' ? 'btn--active' : 'btn--ghost'}`}
              onClick={() => setTeam('home')}
            >Casa</button>
            <button
              className={`btn btn--sm ${team === 'away' ? 'btn--active' : 'btn--ghost'}`}
              onClick={() => setTeam('away')}
            >Ospiti</button>
          </div>
        </div>

        {/* Position out */}
        <div className="sub-dialog__row">
          <label className="sub-dialog__label">Posizione uscente</label>
          <select
            className="sub-dialog__select"
            value={positionOut}
            onChange={e => setPositionOut(Number(e.target.value))}
          >
            {POSITIONS.map(pos => {
              const pid = rotation.positions[pos - 1];
              const info = pid ? playerMap.get(pid) : null;
              return (
                <option key={pos} value={pos}>
                  P{pos} {info ? `— #${info.number} ${info.lastName}` : '(vuota)'}
                </option>
              );
            })}
          </select>
        </div>

        {/* Player out display */}
        {playerOut && (
          <div className="sub-dialog__player-out">
            Esce: <strong>#{playerOut.number} {playerOut.lastName}</strong>
          </div>
        )}

        {/* Player in */}
        <div className="sub-dialog__row">
          <label className="sub-dialog__label">Entra</label>
          <select
            className="sub-dialog__select"
            value={playerInId}
            onChange={e => setPlayerInId(e.target.value)}
          >
            <option value="">— Seleziona —</option>
            {benchPlayers.map(p => (
              <option key={p.id} value={p.id}>#{p.number} {p.lastName}</option>
            ))}
          </select>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="scouting-overlay__actions" style={{ marginTop: '.8rem' }}>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Annulla</button>
          <button
            className="btn btn--primary btn--sm"
            onClick={handleSubmit}
            disabled={submitting || !playerInId}
          >
            {submitting ? 'Salvo…' : 'Conferma'}
          </button>
        </div>

        {matchState.substitutionsUsed[team] >= 6 && (
          <div className="sub-dialog__warn">
            Attenzione: raggiunto il limite di 6 sostituzioni per {team === 'home' ? 'Casa' : 'Ospiti'}
          </div>
        )}
      </div>
    </div>
  );
}
