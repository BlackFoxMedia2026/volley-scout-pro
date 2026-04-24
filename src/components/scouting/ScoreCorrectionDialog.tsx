import { useState } from 'react';
import { useMatchStore } from '@/stores/matchStore';

interface Props {
  onClose: () => void;
}

export function ScoreCorrectionDialog({ onClose }: Props) {
  const { matchState, matchMeta, scoreCorrection } = useMatchStore();

  const [home, setHome] = useState(matchState?.score.home ?? 0);
  const [away, setAway] = useState(matchState?.score.away ?? 0);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (home < 0 || away < 0) return;
    setSaving(true);
    await scoreCorrection(home, away);
    setSaving(false);
    onClose();
  };

  const homeLabel = matchMeta?.homeTeamName ?? 'Casa';
  const awayLabel = matchMeta?.awayTeamName ?? 'Ospiti';

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-card" onClick={e => e.stopPropagation()}>
        <h3 className="dialog-title">Correggi punteggio</h3>
        <p className="dialog-hint" style={{ marginBottom: '.75rem' }}>
          Set {matchState?.currentSet ?? '?'} — inserisci il punteggio corretto
        </p>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.25rem' }}>
            <label style={{ fontSize: '.75rem', color: 'var(--home)', fontWeight: 600 }}>{homeLabel}</label>
            <input
              type="number"
              min={0}
              max={99}
              value={home}
              onChange={e => setHome(Number(e.target.value))}
              style={{
                width: '4rem', textAlign: 'center', fontSize: '1.5rem', fontWeight: 700,
                fontFamily: 'var(--font-mono)', padding: '.25rem',
                background: 'var(--bg-input)', border: '1px solid var(--border-strong)',
                borderRadius: '.25rem', color: 'var(--text-primary)',
              }}
            />
          </div>
          <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>:</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.25rem' }}>
            <label style={{ fontSize: '.75rem', color: 'var(--away)', fontWeight: 600 }}>{awayLabel}</label>
            <input
              type="number"
              min={0}
              max={99}
              value={away}
              onChange={e => setAway(Number(e.target.value))}
              style={{
                width: '4rem', textAlign: 'center', fontSize: '1.5rem', fontWeight: 700,
                fontFamily: 'var(--font-mono)', padding: '.25rem',
                background: 'var(--bg-input)', border: '1px solid var(--border-strong)',
                borderRadius: '.25rem', color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>
        <div className="dialog-actions">
          <button className="btn btn--ghost btn--sm" onClick={onClose} disabled={saving}>
            Annulla
          </button>
          <button className="btn btn--primary btn--sm" onClick={handleConfirm} disabled={saving}>
            {saving ? '…' : 'Conferma'}
          </button>
        </div>
      </div>
    </div>
  );
}
