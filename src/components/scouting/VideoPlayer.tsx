import { useRef, useEffect, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useMatchStore } from '@/stores/matchStore';

interface Props {
  videoPath: string;
  matchId?: string;
  seekToMs?: number;
  onTimeUpdate?: (ms: number) => void;
  initialSyncOffsetMs?: number;
}

export function VideoPlayer({ videoPath, matchId, seekToMs, onTimeUpdate, initialSyncOffsetMs }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [syncOffsetMs, setSyncOffsetMs] = useState<number | null>(initialSyncOffsetMs ?? null);

  const src = (videoPath.startsWith('http') || videoPath.startsWith('rtsp') || videoPath.startsWith('asset://'))
    ? videoPath
    : `http://localhost:50105/file?path=${encodeURIComponent(videoPath)}`;

  useEffect(() => {
    setLoaded(false);
    setError('');
  }, [videoPath]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || seekToMs === undefined) return;
    v.currentTime = seekToMs / 1000;
  }, [seekToMs]);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const ms = Math.floor(v.currentTime * 1000);
    setCurrentMs(ms);
    onTimeUpdate?.(ms);
  }, [onTimeUpdate]);

  const skip = (deltaSeconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + deltaSeconds));
  };

  const handleSyncHere = async () => {
    if (!matchId) return;
    const offset = currentMs;
    try {
      await invoke('update_video_sync_offset', { matchId, offsetMs: offset });
      setSyncOffsetMs(offset);
      useMatchStore.getState().setVideoSyncOffset(offset);
    } catch { /* non-critical */ }
  };

  const fmtMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <div className="video-player">
      <div className="video-player__wrap">
        {error ? (
          <div className="video-player__error">{error}</div>
        ) : (
          <video
            ref={videoRef}
            className="video-player__video"
            src={src}
            controls
            preload="metadata"
            onLoadedMetadata={e => {
              setLoaded(true);
              setDurationMs(Math.floor((e.currentTarget.duration || 0) * 1000));
            }}
            onTimeUpdate={handleTimeUpdate}
            onError={() => setError('Impossibile aprire il video. Controlla il percorso file.')}
          />
        )}
        {!loaded && !error && (
          <div className="video-player__loading">Caricamento video…</div>
        )}
      </div>

      {loaded && (
        <div className="video-player__controls">
          <button className="video-player__skip" onClick={() => skip(-10)} title="-10s">«10</button>
          <button className="video-player__skip" onClick={() => skip(-5)} title="-5s">«5</button>
          <span className="video-player__time">{fmtMs(currentMs)} / {fmtMs(durationMs)}</span>
          <button className="video-player__skip" onClick={() => skip(5)} title="+5s">5»</button>
          <button className="video-player__skip" onClick={() => skip(10)} title="+10s">10»</button>
          {matchId && (
            <button
              className="video-player__skip"
              onClick={handleSyncHere}
              title="Sincronizza video qui (segna questo punto come inizio partita)"
            >
              {syncOffsetMs != null ? `Sync ✓ ${fmtMs(syncOffsetMs)}` : 'Sync'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
