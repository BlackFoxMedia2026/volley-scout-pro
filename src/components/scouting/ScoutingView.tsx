import { useEffect, useState, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ScoreBoard } from './ScoreBoard';
import { EventLog } from './EventLog';
import { CodeBar } from './CodeBar';
import { VideoPlayer } from './VideoPlayer';
import { PlayerRosterPanel } from './PlayerRosterPanel';
import { PlaynexLogo } from '@/components/common/PlaynexLogo';
import { AnalyticsPanel } from '@/components/analytics/AnalyticsPanel';
import { SubstitutionDialog } from './SubstitutionDialog';
import { LiberoSwapDialog } from './LiberoSwapDialog';
import { ScoreCorrectionDialog } from './ScoreCorrectionDialog';
import { SetFormationOverlay } from './SetFormationOverlay';
import { CommentDialog } from './CommentDialog';
import { KeyboardHelpOverlay } from './KeyboardHelpOverlay';
import { RotationPanel } from './RotationPanel';
import { CodeVerificationDialog } from './CodeVerificationDialog';
import { SetTimer } from './SetTimer';
import { useKeyboardInput } from '@/hooks/useKeyboardInput';
import { useMatchStore } from '@/stores/matchStore';
import { generateMatchReport } from '@/lib/report/matchReport';
import { eventsToCSV } from '@/lib/report/csvExport';
import type { MatchEvent } from '@/types/match';
import '@/styles/analytics.css';

interface Props {
  matchId: string;
  onBack?: () => void;
}

export function ScoutingView({ matchId, onBack }: Props) {
  const {
    loadMatch, matchState, events, actorUserId,
    startMatch, startNextSet,
    manualPoint, recordTimeout, recordChallenge, resolveLastChallenge,
    setVideoCurrentMs, matchMeta, playersById,
    isPaused, togglePause, videoSyncOffsetMs, setCodePrefix,
    pendingUICommand, clearPendingCommand,
  } = useMatchStore();

  const hasPendingChallenge = useMemo(() => {
    const last = [...events].reverse().find(e => e.type === 'challenge');
    return last?.payload.outcome === 'pending' ? last.teamSide : null;
  }, [events]);

  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showSubDialog, setShowSubDialog] = useState(false);
  const [showLiberoDialog, setShowLiberoDialog] = useState(false);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [showScoreCorrection, setShowScoreCorrection] = useState(false);
  const [_showCodeList] = useState(false); // kept for future toggle; codelist always visible
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [seekToMs, setSeekToMs] = useState<number | undefined>(undefined);
  const [startingMatch, setStartingMatch] = useState<'home' | 'away' | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [showSetEndBanner, setShowSetEndBanner] = useState(false);
  const [prevSetCount, setPrevSetCount] = useState(0);
  const [showSetFormation, setShowSetFormation] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showRotation, setShowRotation] = useState(false);
  const [showCodeVer, setShowCodeVer] = useState(false);

  // Build playerMap from store data (no separate fetch needed)
  const playerMap = useMemo(() => {
    const map = new Map<string, { number: number; lastName: string; isLibero?: boolean }>();
    playersById.forEach((info, id) => {
      map.set(id, { number: info.number, lastName: info.lastName, isLibero: info.isLibero });
    });
    return map;
  }, [playersById]);

  // Split players by team for roster panels
  const homePlayers = useMemo(() => [...playersById.values()].filter(p => p.teamSide === 'home'), [playersById]);
  const awayPlayers = useMemo(() => [...playersById.values()].filter(p => p.teamSide === 'away'), [playersById]);

  useKeyboardInput();

  // F1 = help, F9 = comment dialog
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); setShowHelp(v => !v); }
      if (e.key === 'F9') { e.preventDefault(); setShowCommentDialog(v => !v); }
      if (e.key === 'F10') { e.preventDefault(); setShowScoreCorrection(v => !v); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Handle Quadro Comando UI commands from code bar
  useEffect(() => {
    if (!pendingUICommand) return;
    if (pendingUICommand === 'FORM') { if (orgId) setShowSetFormation(true); }
    if (pendingUICommand === 'ROT') { setShowRotation(v => !v); }
    if (pendingUICommand === 'VER') { setShowCodeVer(true); }
    if (pendingUICommand === 'NOTE') { setShowCommentDialog(true); }
    if (pendingUICommand === 'FINE') { onBack?.(); }
    if (pendingUICommand === 'ELENCO') { /* roster already visible as side panel */ }
    if (pendingUICommand === 'AELENCO') { /* roster already visible as side panel */ }
    if (pendingUICommand === 'INV') { /* TODO: invert home/away display */ }
    if (pendingUICommand === 'TABE') { /* TODO: open config/tables */ }
    clearPendingCommand();
  }, [pendingUICommand, orgId, clearPendingCommand]);

  useEffect(() => {
    loadMatch(matchId);
  }, [matchId, loadMatch]);

  // Get orgId from match row for formation overlay
  useEffect(() => {
    invoke<{ org_id: string } | null>('get_match', { id: matchId })
      .then(m => { if (m) setOrgId(m.org_id); })
      .catch(() => {});
  }, [matchId]);

  // Derivato direttamente dal phase — nessuno stato separato che può desincronizzarsi
  const showStartPrompt = matchState?.phase === 'not_started';

  // Detect set end to show next-set banner
  useEffect(() => {
    if (!matchState) return;
    const totalSets = matchState.setsWon.home + matchState.setsWon.away;
    if (totalSets > prevSetCount && matchState.phase !== 'match_end') {
      setShowSetEndBanner(true);
    }
    setPrevSetCount(totalSets);
  }, [matchState?.setsWon.home, matchState?.setsWon.away]);

  const handleEventClick = useCallback((ev: MatchEvent) => {
    if (ev.videoTsMs != null) setSeekToMs(ev.videoTsMs);
  }, []);

  const handleVideoTimeUpdate = useCallback((ms: number) => {
    setVideoCurrentMs(ms);
  }, [setVideoCurrentMs]);

  const pickVideo = async () => {
    const path = await invoke<string | null>('pick_video_file');
    if (path) setVideoPath(path);
  };

  const handleStartMatch = async (serving: 'home' | 'away') => {
    setStartingMatch(serving);
    setStartError(null);
    try {
      await startMatch(serving);
    } catch (e) {
      console.error('startMatch error:', e);
      setStartError(String(e));
    } finally {
      setStartingMatch(null);
    }
  };

  const handleNextSet = async () => {
    await startNextSet();
    setShowSetEndBanner(false);
    if (orgId) setShowSetFormation(true);
  };

  const handleSetFormationDone = () => {
    setShowSetFormation(false);
  };

  const handleExportCSV = async () => {
    const csv = eventsToCSV(events, playersById);
    const homeShort = (matchMeta?.homeTeamName ?? 'casa').replace(/\s+/g, '_');
    const awayShort = (matchMeta?.awayTeamName ?? 'ospiti').replace(/\s+/g, '_');
    await invoke('save_file', {
      content: csv,
      defaultName: `eventi_${homeShort}_vs_${awayShort}.csv`,
      filterExt: 'csv',
      filterLabel: 'CSV',
    });
  };

  const handleExportReport = async () => {
    if (!matchState) return;
    const html = generateMatchReport({
      matchState,
      events,
      homeTeamName: matchMeta?.homeTeamName ?? 'Casa',
      awayTeamName: matchMeta?.awayTeamName ?? 'Ospiti',
      date: matchMeta?.date ?? new Date().toISOString(),
      playersById,
      competition: matchMeta?.competition,
      matchPhase: matchMeta?.matchPhase,
      venue: matchMeta?.venue,
    });
    const homeShort = (matchMeta?.homeTeamName ?? 'casa').replace(/\s+/g, '_');
    const awayShort = (matchMeta?.awayTeamName ?? 'ospiti').replace(/\s+/g, '_');
    await invoke('save_file', {
      content: html,
      defaultName: `report_${homeShort}_vs_${awayShort}.html`,
      filterExt: 'html',
      filterLabel: 'HTML Report',
    });
  };

  if (!matchState) {
    return <div className="scouting-loading">Caricamento partita…</div>;
  }

  const bodyClass = [
    'scouting-view__body',
    showAnalytics ? 'scouting-view__body--with-analytics' : '',
  ].filter(Boolean).join(' ');

  const { setsWon, timeoutsUsed } = matchState;
  const isMatchOver = matchState.phase === 'match_end';

  return (
    <div className={`scouting-view ${videoPath ? 'scouting-view--with-video' : ''}`}>
      <header className="scouting-view__header">
        <PlaynexLogo size="sm" />
        {onBack && (
          <button className="btn btn--ghost btn--sm scouting-view__back" onClick={onBack}>
            ← Partite
          </button>
        )}
        {(matchMeta?.competition || matchMeta?.matchPhase) && (
          <div className="scouting-view__comp-badge" title={`${matchMeta.competition ?? ''} ${matchMeta.matchPhase ?? ''}`.trim()}>
            {matchMeta.competition && <span>{matchMeta.competition}</span>}
            {matchMeta.matchPhase && <span className="scouting-view__comp-phase">{matchMeta.matchPhase}</span>}
          </div>
        )}
        <ScoreBoard />
        <SetTimer />
        <div className="scouting-view__header-actions">
          {/* Fine Azione — DV4: ',' = punto Casa, '<' = punto Ospiti */}
          <button className="btn btn--home-pt btn--xs" title="Punto Casa — Fine Azione (tasto ,)" onClick={() => manualPoint('home')}>, Casa</button>
          <button className="btn btn--away-pt btn--xs" title="Punto Ospiti — Fine Azione (tasto <)" onClick={() => manualPoint('away')}>&lt; Osp</button>
          <span className="scouting-view__sep" />
          <button className="btn btn--ghost btn--xs" title={`Timeout Casa (usati: ${timeoutsUsed.home}/2)`} onClick={() => recordTimeout('home')}>TO-H {timeoutsUsed.home}</button>
          <button className="btn btn--ghost btn--xs" title={`Timeout Ospiti (usati: ${timeoutsUsed.away}/2)`} onClick={() => recordTimeout('away')}>TO-A {timeoutsUsed.away}</button>
          <button className="btn btn--ghost btn--xs" title="Sostituzione" onClick={() => setShowSubDialog(true)}>SOST</button>
          <button className="btn btn--ghost btn--xs" title="Cambio Libero" onClick={() => setShowLiberoDialog(true)}>LIB</button>
          <button className="btn btn--ghost btn--xs" title="Correggi punteggio" onClick={() => setShowScoreCorrection(true)}>±Pt</button>
          <button className="btn btn--ghost btn--xs" title="Challenge Casa" onClick={() => recordChallenge('home', 'pending')}>CHA-H</button>
          <button className="btn btn--ghost btn--xs" title="Challenge Ospiti" onClick={() => recordChallenge('away', 'pending')}>CHA-A</button>
          <button className="btn btn--ghost btn--xs" title="Nota (F9)" onClick={() => setShowCommentDialog(true)}>Nota</button>
          <span className="scouting-view__sep" />
          <button className="btn btn--ghost btn--sm" onClick={pickVideo} title={videoPath ? 'Video caricato' : 'Apri video'}>{videoPath ? 'Vid ✓' : 'Video'}</button>
          <button className={`btn btn--sm ${showRotation ? 'btn--active' : 'btn--ghost'}`} onClick={() => setShowRotation(v => !v)} title="Rotazioni (ROT)">Rot</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setShowCodeVer(true)} title="Verifica codici (VER)">VER</button>
          <button className={`btn btn--sm ${showAnalytics ? 'btn--active' : 'btn--ghost'}`} onClick={() => setShowAnalytics(v => !v)} title="Statistiche">Stats</button>
          <button className="btn btn--ghost btn--sm" onClick={() => invoke('export_vsp', { matchId })} title="Esporta .vsp">.vsp</button>
          <button className="btn btn--ghost btn--sm" onClick={handleExportReport} title="Esporta report HTML">Rep</button>
          <button className="btn btn--ghost btn--sm" onClick={handleExportCSV} title="Esporta CSV">.csv</button>
          <button className={`btn btn--sm ${isPaused ? 'btn--warn' : 'btn--ghost'}`} onClick={togglePause} title="Pausa scouting (F4)">{isPaused ? '▶' : '⏸'}</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setShowHelp(true)} title="Guida (F1)">?</button>
        </div>
      </header>

      {showHelp && <KeyboardHelpOverlay onClose={() => setShowHelp(false)} />}
      {showCodeVer && <CodeVerificationDialog onClose={() => setShowCodeVer(false)} />}

      {/* ─── Pause banner ────────────────────────── */}
      {isPaused && (
        <div className="pause-bar">
          <span className="pause-bar__label">⏸ Scouting in pausa — input bloccato</span>
          <button className="btn btn--ghost btn--xs" onClick={togglePause}>
            ▶ Riprendi (F4)
          </button>
        </div>
      )}

      {/* ─── Pending challenge bar ───────────────── */}
      {hasPendingChallenge && (
        <div className="challenge-bar">
          <span className="challenge-bar__label">
            ⚑ Challenge {hasPendingChallenge === 'home' ? 'Casa' : 'Ospiti'} — in attesa
          </span>
          <button
            className="btn btn--ghost btn--xs challenge-bar__btn--accept"
            onClick={() => resolveLastChallenge('accepted')}
          >
            ✓ Accolto
          </button>
          <button
            className="btn btn--ghost btn--xs challenge-bar__btn--reject"
            onClick={() => resolveLastChallenge('rejected')}
          >
            ✗ Respinto
          </button>
        </div>
      )}

      {/* ─── Start-match overlay ─────────────────── */}
      {showStartPrompt && (
        <div className="scouting-overlay">
          <div className="scouting-overlay__card">
            <h2>Chi batte per primo?</h2>
            <p className="scouting-overlay__hint">Seleziona la squadra che serve nel Set 1</p>
            <div className="scouting-overlay__actions">
              <button
                className="btn btn--home-lg"
                onClick={() => handleStartMatch('home')}
                disabled={startingMatch !== null}
              >
                {startingMatch === 'home' ? 'Avvio…' : 'Casa'}
              </button>
              <button
                className="btn btn--away-lg"
                onClick={() => handleStartMatch('away')}
                disabled={startingMatch !== null}
              >
                {startingMatch === 'away' ? 'Avvio…' : 'Ospiti'}
              </button>
            </div>
            {startingMatch && (
              <p style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>
                Salvataggio in corso…
              </p>
            )}
            {startError && (
              <p style={{ color: '#f87171', fontSize: '.85rem', marginTop: '8px', maxWidth: '340px', wordBreak: 'break-all' }}>
                ⚠ Errore: {startError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── Set-end banner ───────────────────────── */}
      {showSetEndBanner && !isMatchOver && (
        <div className="scouting-set-banner">
          <span className="scouting-set-banner__score">
            Set concluso — {setsWon.home} : {setsWon.away}
          </span>
          <button className="btn btn--primary btn--sm" onClick={handleNextSet}>
            Inizia Set {matchState.currentSet + 1} →
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => setShowSetEndBanner(false)}>
            ✕
          </button>
        </div>
      )}

      {/* ─── Match-over banner ────────────────────── */}
      {isMatchOver && (
        <div className="scouting-set-banner scouting-set-banner--match-end">
          <span>
            Partita conclusa — Casa {setsWon.home} : {setsWon.away} Ospiti
          </span>
          {onBack && (
            <button className="btn btn--ghost btn--sm" onClick={onBack}>
              ← Torna alle partite
            </button>
          )}
        </div>
      )}

      {showSubDialog && (
        <SubstitutionDialog
          matchId={matchId}
          playerMap={playerMap}
          onClose={() => setShowSubDialog(false)}
        />
      )}

      {showLiberoDialog && (
        <LiberoSwapDialog onClose={() => setShowLiberoDialog(false)} />
      )}

      {showScoreCorrection && (
        <ScoreCorrectionDialog onClose={() => setShowScoreCorrection(false)} />
      )}

      {showCommentDialog && (
        <CommentDialog
          matchId={matchId}
          onClose={() => setShowCommentDialog(false)}
        />
      )}

      {showSetFormation && orgId && matchState && (
        <SetFormationOverlay
          matchId={matchId}
          setNumber={matchState.currentSet}
          orgId={orgId}
          userId={actorUserId}
          onDone={handleSetFormationDone}
        />
      )}

      <div className={bodyClass}>
        {/* ─── Center: video player (always shown) ─── */}
        <main className="scouting-view__main">
          {videoPath ? (
            <VideoPlayer
              videoPath={videoPath}
              matchId={matchId}
              seekToMs={seekToMs}
              onTimeUpdate={handleVideoTimeUpdate}
              initialSyncOffsetMs={videoSyncOffsetMs ?? undefined}
            />
          ) : (
            <div className="video-empty">
              <div className="video-empty__icon">▶</div>
              <p className="video-empty__label">Nessun video caricato</p>
              <div className="video-empty__actions">
                <button className="btn btn--primary btn--sm" onClick={pickVideo}>
                  Apri file locale
                </button>
                <span className="video-empty__or">oppure</span>
                <div className="video-empty__url-row">
                  <input
                    className="video-empty__url-input"
                    type="text"
                    placeholder="URL streaming (http/rtsp/…)"
                    value={videoUrlInput}
                    onChange={e => setVideoUrlInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && videoUrlInput.trim()) {
                        setVideoPath(videoUrlInput.trim());
                      }
                    }}
                  />
                  <button
                    className="btn btn--ghost btn--sm"
                    disabled={!videoUrlInput.trim()}
                    onClick={() => { if (videoUrlInput.trim()) setVideoPath(videoUrlInput.trim()); }}
                  >
                    Carica
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ─── Bottom: both teams side-by-side ─────── */}
        <div className="scouting-view__teams-bar">
          <div className="scouting-view__teams-home">
            <PlayerRosterPanel
              teamSide="home"
              teamName={matchMeta?.homeTeamName ?? 'Casa'}
              players={homePlayers}
              rotation={matchState.rotation.home}
              servingTeam={matchState.servingTeam}
              onPlayerClick={prefix => { setCodePrefix(prefix); }}
            />
          </div>
          <div className="scouting-view__teams-away">
            <PlayerRosterPanel
              teamSide="away"
              teamName={matchMeta?.awayTeamName ?? 'Ospiti'}
              players={awayPlayers}
              rotation={matchState.rotation.away}
              servingTeam={matchState.servingTeam}
              onPlayerClick={prefix => { setCodePrefix(prefix); }}
            />
          </div>
        </div>

        {/* ─── Right: event log + code bar ─────────── */}
        <aside className="scouting-view__codelist">
          <EventLog onClickEvent={videoPath ? handleEventClick : undefined} />
          <CodeBar />
        </aside>

        {showRotation && (
          <aside className="scouting-view__side scouting-view__side--rotation">
            <div className="scouting-view__side-header">
              <span>Rotazioni</span>
              <button className="btn btn--ghost btn--xs" onClick={() => setShowRotation(false)}>✕</button>
            </div>
            <RotationPanel playerMap={playerMap} />
          </aside>
        )}

        {showAnalytics && (
          <aside className="scouting-view__side">
            <AnalyticsPanel onClose={() => setShowAnalytics(false)} />
          </aside>
        )}
      </div>

    </div>
  );
}
