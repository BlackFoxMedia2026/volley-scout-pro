import { useState } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { CURRENT_VERSION, fetchLatestRelease, type ReleaseInfo } from '@/lib/updater';

interface Props {
  onClose: () => void;
}

type CheckState = 'idle' | 'checking' | 'done' | 'error';

export function UpdatesView({ onClose }: Props) {
  const [state, setState] = useState<CheckState>('idle');
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const handleCheck = async () => {
    setState('checking');
    setRelease(null);
    try {
      const info = await fetchLatestRelease();
      setRelease(info);
      setCheckedAt(new Date());
      setState('done');
    } catch {
      setState('error');
    }
  };

  const handleDownload = async (url: string) => {
    try {
      await open(url);
    } catch {
      window.location.href = url;
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="updates-view">
      <div className="updates-view__header">
        <button className="updates-back-btn" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          Indietro
        </button>
        <h1 className="updates-view__title">Aggiornamenti</h1>
      </div>

      <div className="updates-view__body">
        {/* Current version card */}
        <div className="updates-card">
          <div className="updates-card__label">Versione installata</div>
          <div className="updates-card__version">v{CURRENT_VERSION}</div>
          <div className="updates-card__app">VolleyScoutPro</div>
        </div>

        {/* Check button */}
        <div className="updates-check-row">
          <button
            className="updates-check-btn"
            onClick={handleCheck}
            disabled={state === 'checking'}
          >
            {state === 'checking' ? (
              <><span className="updates-spinner" /> Verifica in corso…</>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                Controlla aggiornamenti
              </>
            )}
          </button>
          {checkedAt && (
            <span className="updates-checked-at">
              Ultima verifica: {checkedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Result */}
        {state === 'error' && (
          <div className="updates-status updates-status--error">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            Impossibile contattare il server. Controlla la connessione internet.
          </div>
        )}

        {state === 'done' && release && !release.isNewer && (
          <div className="updates-status updates-status--ok">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14-4-4 1.41-1.41L10 13.17l6.59-6.59L18 8l-8 8z"/></svg>
            Stai già usando l'ultima versione ({release.version}).
          </div>
        )}

        {state === 'done' && release?.isNewer && (
          <div className="updates-release-card">
            <div className="updates-release-card__header">
              <div className="updates-release-top-row">
                <div>
                  <div className="updates-release-badge">Aggiornamento disponibile</div>
                  <div className="updates-release-version">{release.version}</div>
                  {release.publishedAt && (
                    <div className="updates-release-date">Rilasciato il {formatDate(release.publishedAt)}</div>
                  )}
                </div>
                <button
                  className="updates-download-btn"
                  onClick={() => handleDownload(release.releaseUrl)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                  Scarica {release.version}
                </button>
              </div>
            </div>

            {release.body && (
              <div className="updates-release-notes">
                <div className="updates-release-notes__label">Note di rilascio</div>
                <pre className="updates-release-notes__body">{release.body}</pre>
              </div>
            )}

            <div className="updates-install-note">
              Scarica il file per il tuo sistema operativo e installalo sopra la versione esistente.
              I dati esistenti vengono conservati.
            </div>
          </div>
        )}

        {state === 'done' && !release && (
          <div className="updates-status updates-status--error">
            Nessuna versione trovata sul server.
          </div>
        )}

        {/* How updates work */}
        <div className="updates-info-section">
          <h3 className="updates-info-title">Come funzionano gli aggiornamenti</h3>
          <ul className="updates-info-list">
            <li>I dati salvati (partite, squadre, configurazioni) vengono conservati durante l'aggiornamento.</li>
            <li>Scarica il file per il tuo sistema (Mac .dmg o Windows .exe) e installalo sopra la versione esistente.</li>
            <li>L'app ti notifica automaticamente all'avvio quando una nuova versione è disponibile.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
