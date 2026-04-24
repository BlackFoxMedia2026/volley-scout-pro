import { useEffect, useState, useMemo } from 'react';
import { useMatchStore } from '@/stores/matchStore';

export function SetTimer() {
  const events     = useMatchStore(s => s.events);
  const matchState = useMatchStore(s => s.matchState);

  const [now, setNow] = useState(Date.now());

  const { setStartMs, isRunning } = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
    let lastSetStart: number | null = null;
    let ended = false;
    for (const ev of sorted) {
      if (ev.undoneBySeq !== undefined) continue;
      if (ev.type === 'set_start') { lastSetStart = ev.timestampMs; ended = false; }
      if (ev.type === 'set_end' || ev.type === 'match_end') ended = true;
    }
    return {
      setStartMs: lastSetStart,
      isRunning: !ended && matchState?.phase !== 'not_started' && matchState?.phase !== 'match_end',
    };
  }, [events, matchState?.phase]);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  if (!setStartMs) return null;

  const elapsed = isRunning ? now - setStartMs : 0;
  const totalSec = Math.floor(Math.abs(elapsed) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const label = `${m}:${String(s).padStart(2, '0')}`;

  return (
    <div className="set-timer" title={`Durata Set ${matchState?.currentSet ?? ''}`}>
      <span className="set-timer__icon">⏱</span>
      <span className="set-timer__label">{label}</span>
    </div>
  );
}
