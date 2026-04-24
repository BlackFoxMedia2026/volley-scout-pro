import { useState, useCallback } from 'react';
import { useMatchStore } from '@/stores/matchStore';
import type { MatchEvent } from '@/types/match';

interface Props {
  onClose: () => void;
}

export function CodeVerificationDialog({ onClose }: Props) {
  const events = useMatchStore(s => s.events);
  const playersById = useMatchStore(s => s.playersById);
  const editEventCode = useMatchStore(s => s.editEventCode);
  const undoLast = useMatchStore(s => s.undoLast);

  const [editingSeq, setEditingSeq] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [working, setWorking] = useState(false);

  // Invalid = isValid false, not undone, not an undo itself
  const invalidEvents = events.filter(
    e => !e.isValid && e.type !== 'undo' && e.undoneBySeq === undefined,
  );

  const playerName = (e: MatchEvent) => {
    if (!e.playerId) return null;
    const p = playersById.get(e.playerId);
    return p ? `#${p.number} ${p.lastName}` : null;
  };

  const startEdit = (e: MatchEvent) => {
    setEditingSeq(e.sequence);
    setEditValue(e.rawCode ?? '');
  };

  const handleFix = useCallback(async (sequence: number) => {
    if (!editValue.trim()) return;
    setWorking(true);
    try {
      await editEventCode(sequence, editValue.trim());
      setEditingSeq(null);
    } finally {
      setWorking(false);
    }
  }, [editValue, editEventCode]);

  const handleDelete = useCallback(async (_sequence: number) => {
    setWorking(true);
    try {
      await undoLast();
    } finally {
      setWorking(false);
    }
  }, [undoLast]);

  return (
    <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog dialog--wide">
        <div className="dialog__head">
          <h2 className="dialog__title">Verifica codici (VER)</h2>
          <button className="btn btn--ghost btn--xs" onClick={onClose}>✕</button>
        </div>

        {invalidEvents.length === 0 ? (
          <div className="code-ver__ok">
            <span className="code-ver__ok-icon">✓</span>
            <p>Nessun codice errato trovato.</p>
          </div>
        ) : (
          <>
            <p className="code-ver__count">
              {invalidEvents.length} codice{invalidEvents.length > 1 ? 'i' : ''} con errori
            </p>
            <div className="code-ver__list">
              {invalidEvents.map(ev => (
                <div key={ev.id} className="code-ver__row">
                  <span className="code-ver__seq">#{ev.sequence}</span>
                  <span className="code-ver__team">{ev.teamSide === 'home' ? 'Casa' : ev.teamSide === 'away' ? 'Osp' : '—'}</span>

                  {editingSeq === ev.sequence ? (
                    <input
                      className="code-ver__edit"
                      value={editValue}
                      autoFocus
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleFix(ev.sequence);
                        if (e.key === 'Escape') setEditingSeq(null);
                        e.stopPropagation();
                      }}
                    />
                  ) : (
                    <code className="code-ver__code">{ev.rawCode ?? '—'}</code>
                  )}

                  {playerName(ev) && (
                    <span className="code-ver__player">{playerName(ev)}</span>
                  )}

                  <span className="code-ver__error">
                    {(ev.payload as { parseError?: string }).parseError ?? 'Codice non valido'}
                  </span>

                  <div className="code-ver__actions">
                    {editingSeq === ev.sequence ? (
                      <>
                        <button className="btn btn--primary btn--xs" onClick={() => handleFix(ev.sequence)} disabled={working}>Salva</button>
                        <button className="btn btn--ghost btn--xs" onClick={() => setEditingSeq(null)}>Annulla</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn--ghost btn--xs" onClick={() => startEdit(ev)}>Correggi</button>
                        <button className="btn btn--danger btn--xs" onClick={() => handleDelete(ev.sequence)} disabled={working}>Elimina</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="dialog__actions">
          <button className="btn btn--primary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
