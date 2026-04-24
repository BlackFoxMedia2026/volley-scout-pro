import { useState } from 'react';
import { useMatchStore } from '@/stores/matchStore';

interface Props {
  onClose: () => void;
}

export function LiberoSwapDialog({ onClose }: Props) {
  const matchState      = useMatchStore(s => s.matchState);
  const playersById     = useMatchStore(s => s.playersById);
  const recordLiberoSwap = useMatchStore(s => s.recordLiberoSwap);

  const [team, setTeam] = useState<'home' | 'away'>('home');
  const [liberoId, setLiberoId] = useState('');
  const [playerOutId, setPlayerOutId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!matchState) return null;

  const rotation = matchState.rotation[team];
  const onCourtIds = new Set(rotation.positions.filter(Boolean) as string[]);

  const liberos = [...playersById.values()].filter(
    p => p.teamSide === team && p.isLibero,
  );

  // Players on court who are NOT liberos — candidates to come off
  const onCourtNonLiberos = [...playersById.values()].filter(
    p => p.teamSide === team && !p.isLibero && onCourtIds.has(p.id),
  ).sort((a, b) => a.number - b.number);

  const handleSubmit = async () => {
    if (!liberoId) { setError('Seleziona il libero'); return; }
    if (!playerOutId) { setError('Seleziona il giocatore che esce'); return; }
    setSubmitting(true);
    setError('');
    try {
      await recordLiberoSwap(team, liberoId, playerOutId);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="scouting-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="scouting-overlay__card" style={{ minWidth: 320 }}>
        <h2>Cambio Libero</h2>
        <p className="sub-dialog__player-out" style={{ color: 'var(--text-muted)', marginBottom: '.8rem' }}>
          Non consuma una sostituzione
        </p>

        <div className="sub-dialog__row">
          <label className="sub-dialog__label">Squadra</label>
          <div className="sub-dialog__seg">
            <button
              className={`btn btn--sm ${team === 'home' ? 'btn--active' : 'btn--ghost'}`}
              onClick={() => { setTeam('home'); setLiberoId(''); setPlayerOutId(''); }}
            >Casa</button>
            <button
              className={`btn btn--sm ${team === 'away' ? 'btn--active' : 'btn--ghost'}`}
              onClick={() => { setTeam('away'); setLiberoId(''); setPlayerOutId(''); }}
            >Ospiti</button>
          </div>
        </div>

        <div className="sub-dialog__row">
          <label className="sub-dialog__label">Libero entra</label>
          <select
            className="sub-dialog__select"
            value={liberoId}
            onChange={e => setLiberoId(e.target.value)}
          >
            <option value="">— Seleziona —</option>
            {liberos.map(p => (
              <option key={p.id} value={p.id}>#{p.number} {p.lastName} (L)</option>
            ))}
          </select>
        </div>

        <div className="sub-dialog__row">
          <label className="sub-dialog__label">Esce</label>
          <select
            className="sub-dialog__select"
            value={playerOutId}
            onChange={e => setPlayerOutId(e.target.value)}
          >
            <option value="">— Seleziona —</option>
            {onCourtNonLiberos.map(p => (
              <option key={p.id} value={p.id}>#{p.number} {p.lastName}</option>
            ))}
          </select>
        </div>

        {liberos.length === 0 && (
          <div className="sub-dialog__warn">
            Nessun libero registrato per questa squadra
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="scouting-overlay__actions" style={{ marginTop: '.8rem' }}>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Annulla</button>
          <button
            className="btn btn--primary btn--sm"
            onClick={handleSubmit}
            disabled={submitting || !liberoId || !playerOutId}
          >
            {submitting ? 'Salvo…' : 'Conferma'}
          </button>
        </div>
      </div>
    </div>
  );
}
