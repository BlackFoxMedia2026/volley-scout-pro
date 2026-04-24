import { useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useMatchStore } from '@/stores/matchStore';
import type { MatchEvent } from '@/types/match';
import { replayEvents } from '@/lib/reducer/matchReducer';

interface Props {
  matchId: string;
  onClose: () => void;
}

const QUICK_TAGS = [
  { label: '🔥 Highlight', prefix: '[HIGHLIGHT] ' },
  { label: '⚠️ Errore', prefix: '[ERRORE] ' },
  { label: '💡 Tattica', prefix: '[TATTICA] ' },
  { label: '📌 Formazione', prefix: '[FORMAZIONE] ' },
  { label: '🔄 Cambio', prefix: '[CAMBIO] ' },
];

export function CommentDialog({ matchId, onClose }: Props) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const events         = useMatchStore(s => s.events);
  const actorUserId    = useMatchStore(s => s.actorUserId);
  const videoCurrentMs = useMatchStore(s => s.videoCurrentMs);
  const setStore = useMatchStore.setState;
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const text = textRef.current?.value.trim();
    if (!text) { onClose(); return; }
    setSubmitting(true);
    try {
      const ev = await invoke<MatchEvent>('append_event', {
        req: {
          matchId,
          setId: null, rallyId: null,
          timestampMs: Date.now(),
          videoTsMs: videoCurrentMs ?? null,
          type: 'comment',
          actorUserId: actorUserId,
          playerId: null, teamSide: null, rawCode: null,
          skill: null, skillType: null, quality: null, combination: null,
          zoneFrom: null, zoneTo: null, zoneToSub: null, endZonePlus: null,
          payload: JSON.stringify({ text }),
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
    } finally {
      setSubmitting(false);
    }
  };

  const applyTag = (prefix: string) => {
    if (!textRef.current) return;
    const cur = textRef.current.value;
    // Replace existing tag prefix if any, or prepend
    const hasPrev = QUICK_TAGS.some(t => cur.startsWith(t.prefix));
    textRef.current.value = hasPrev
      ? prefix + cur.replace(/^\[[\w]+\] /, '')
      : prefix + cur;
    textRef.current.focus();
  };

  return (
    <div className="scouting-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="scouting-overlay__card" style={{ minWidth: 340 }}>
        <h2>Aggiungi nota</h2>
        <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
          {QUICK_TAGS.map(t => (
            <button
              key={t.prefix}
              className="btn btn--ghost btn--xs"
              onClick={() => applyTag(t.prefix)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          ref={textRef}
          className="comment-dialog__textarea"
          placeholder="Scrivi una nota (es: situazione tattica, problema tecnico…)"
          rows={3}
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
            if (e.key === 'Escape') onClose();
          }}
        />
        <div className="scouting-overlay__actions">
          <button className="btn btn--ghost btn--sm" onClick={onClose}>Annulla</button>
          <button className="btn btn--primary btn--sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Salvo…' : 'Salva (Enter)'}
          </button>
        </div>
        <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Shift+Enter = nuova riga &nbsp;|&nbsp; Esc = annulla
        </div>
      </div>
    </div>
  );
}
