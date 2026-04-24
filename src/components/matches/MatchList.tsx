import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { exportVsp } from '@/lib/vsp/vspExport';
import { publishMatch } from '@/lib/cloud/cloudSync';
import { computeMatchStats } from '@/lib/analytics/stats';
import { replayEvents } from '@/lib/reducer/matchReducer';
import { useAppStore } from '@/stores/appStore';
import type { MatchEvent } from '@/types/match';

interface MatchRow {
  id: string;
  date: string;
  phase: string;
  sets_home: number;
  sets_away: number;
  home_team_id: string;
  away_team_id: string;
  venue: string | null;
  notes: string | null;
}

interface TeamRow {
  id: string;
  name: string;
  short_name: string | null;
}

interface Props {
  onSelect: (matchId: string) => void;
  onNew: () => void;
  onConfig: () => void;
  onTeams?: () => void;
  onImport?: () => void;
  onUpdates?: () => void;
}

const phaseLabel: Record<string, string> = {
  not_started: 'Non iniziata',
  in_progress: 'In corso',
  finished: 'Terminata',
  abandoned: 'Abbandonata',
};

export function MatchList({ onSelect, onNew, onConfig, onTeams, onUpdates }: Props) {
  const { orgId } = useAppStore();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [teamMap, setTeamMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [actionMatchId, setActionMatchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [importError, setImportError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'incontri' | 'sintesi'>('incontri');
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [ms, teams] = await Promise.all([
          invoke<MatchRow[]>('get_matches'),
          orgId ? invoke<TeamRow[]>('get_teams', { orgId }) : Promise.resolve([] as TeamRow[]),
        ]);
        setMatches(ms);
        setTeamMap(new Map(teams.map(t => [t.id, t.short_name ?? t.name])));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orgId]);

  const filteredMatches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return matches.filter(m => {
      if (filterPhase !== 'all' && m.phase !== filterPhase) return false;
      if (!q) return true;
      const home = (teamMap.get(m.home_team_id) ?? '').toLowerCase();
      const away = (teamMap.get(m.away_team_id) ?? '').toLowerCase();
      const date = new Date(m.date).toLocaleDateString('it-IT');
      return home.includes(q) || away.includes(q) || date.includes(q) || (m.venue ?? '').toLowerCase().includes(q);
    });
  }, [matches, teamMap, searchQuery, filterPhase]);

  const reload = async () => {
    setLoading(true);
    try {
      const [ms, teams] = await Promise.all([
        invoke<MatchRow[]>('get_matches'),
        orgId ? invoke<TeamRow[]>('get_teams', { orgId }) : Promise.resolve([] as TeamRow[]),
      ]);
      setMatches(ms);
      setTeamMap(new Map(teams.map(t => [t.id, t.short_name ?? t.name])));
    } finally {
      setLoading(false);
    }
  };

  const handleImportVsp = async () => {
    setImportError(null);
    try {
      const matchId = await invoke<string | null>('import_vsp');
      if (matchId) {
        await reload();
        onSelect(matchId);
      }
    } catch (e) {
      setImportError(String(e));
    }
  };

  const handleShare = async (m: MatchRow) => {
    setActionMatchId(m.id);
    try {
      const events = await invoke<MatchEvent[]>('get_match_events', { matchId: m.id });
      const matchState = replayEvents(m.id, events);
      const stats = computeMatchStats(events);
      void matchState;
      const result = await publishMatch({
        version: 1, matchId: m.id,
        homeTeam: teamMap.get(m.home_team_id) ?? 'Home',
        awayTeam: teamMap.get(m.away_team_id) ?? 'Away',
        date: m.date, events, stats,
      });
      setShareUrl(result.url);
    } catch { /* cloud not configured */ } finally {
      setActionMatchId(null);
    }
  };

  const selectedMatch = selectedMatchId ? matches.find(m => m.id === selectedMatchId) : null;

  return (
    <div className="dv-home">

      {/* ── Top navigation bar ── */}
      <nav className="dv-navbar">
        <div className="dv-navbar__left">
          <button className="dv-nav-icon dv-nav-icon--active" title="Home">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
          </button>
          <button className="dv-nav-icon" onClick={onConfig} title="Strumenti">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg>
            <span>Strumenti</span>
          </button>
          {onUpdates && (
            <button className="dv-nav-icon" onClick={onUpdates} title="Aggiornamenti">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM11 5h2v6h-2zm0 8h2v2h-2z"/></svg>
              <span>Aggiornamenti</span>
            </button>
          )}
        </div>
        <div className="dv-navbar__title">VolleyScoutPro — [Incontri]</div>
        <div className="dv-navbar__right">
          <div className="dv-navbar__logo">
            <span className="dv-logo-text">VSP</span>
          </div>
        </div>
      </nav>

      {/* ── Main content area ── */}
      <div className="dv-workspace">

        {/* Season header */}
        <div className="dv-season-bar">
          <h1 className="dv-season-title">
            <span className="dv-season-title__icon">≡</span>
            La mia stagione
          </h1>
          <div className="dv-season-actions">
            {onTeams && (
              <button className="dv-action-icon" onClick={onTeams} title="Squadre">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                <span>Squadre</span>
              </button>
            )}
            <button className="dv-action-icon" onClick={onConfig} title="Tabelle">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 14H7v-2h4v2zm0-4H7v-2h4v2zm0-4H7V7h4v2zm6 8h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V7h4v2z"/></svg>
              <span>Tabelle</span>
            </button>
          </div>
        </div>

        {importError && (
          <div className="dv-error-bar">
            Errore importazione: {importError}
            <button className="dv-error-bar__close" onClick={() => setImportError(null)}>✕</button>
          </div>
        )}

        {/* Two-panel layout */}
        <div className="dv-panel">

          {/* Left sidebar */}
          <div className="dv-sidebar">
            <div className="dv-sidebar__body">
              {/* Selected match detail or empty */}
              {selectedMatch ? (
                <div className="dv-sidebar__detail">
                  <div className="dv-detail__teams">
                    <span className="dv-detail__home">{teamMap.get(selectedMatch.home_team_id) ?? 'Casa'}</span>
                    <span className="dv-detail__score">{selectedMatch.sets_home}–{selectedMatch.sets_away}</span>
                    <span className="dv-detail__away">{teamMap.get(selectedMatch.away_team_id) ?? 'Ospiti'}</span>
                  </div>
                  <div className="dv-detail__date">{new Date(selectedMatch.date).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  {selectedMatch.venue && <div className="dv-detail__venue">{selectedMatch.venue}</div>}
                  <div className={`dv-detail__phase dv-detail__phase--${selectedMatch.phase}`}>{phaseLabel[selectedMatch.phase] ?? selectedMatch.phase}</div>
                  <div className="dv-detail__actions">
                    <button className="dv-detail-btn" onClick={() => onSelect(selectedMatch.id)}>▶ Apri</button>
                    <button className="dv-detail-btn dv-detail-btn--ghost" onClick={() => exportVsp(selectedMatch.id)}>↓ .vsp</button>
                    <button className="dv-detail-btn dv-detail-btn--ghost"
                      disabled={actionMatchId === selectedMatch.id}
                      onClick={() => handleShare(selectedMatch)}>
                      {actionMatchId === selectedMatch.id ? '…' : '⤴ Condividi'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="dv-sidebar__empty">
                  <p>Seleziona un incontro</p>
                </div>
              )}
            </div>
            <div className="dv-sidebar__tabs">
              <button
                className={`dv-tab ${activeTab === 'incontri' ? 'dv-tab--active' : ''}`}
                onClick={() => setActiveTab('incontri')}
              >Incontri</button>
              <button
                className={`dv-tab ${activeTab === 'sintesi' ? 'dv-tab--active' : ''}`}
                onClick={() => setActiveTab('sintesi')}
              >Sintesi</button>
            </div>
          </div>

          {/* Main content */}
          <div className="dv-main">
            {/* Toolbar */}
            <div className="dv-toolbar">
              <button className="dv-toolbar-icon" title="Ordina per data">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>
              </button>
              <button className="dv-btn-primary" onClick={onNew}>Nuovo incontro</button>
              <button className="dv-btn-secondary" onClick={handleImportVsp}>Importa</button>
              <div className="dv-toolbar__spacer" />
              <input
                className="dv-search"
                type="search"
                placeholder="Cerca…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <select
                className="dv-filter-select"
                value={filterPhase}
                onChange={e => setFilterPhase(e.target.value)}
              >
                <option value="all">Tutte</option>
                <option value="not_started">Non iniziata</option>
                <option value="in_progress">In corso</option>
                <option value="finished">Terminata</option>
              </select>
              <button className="dv-toolbar-icon" title="Aggiorna" onClick={reload}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
              </button>
            </div>

            {/* Match list */}
            <div className="dv-list">
              {loading ? (
                <div className="dv-list__empty">Caricamento…</div>
              ) : filteredMatches.length === 0 ? (
                <div className="dv-list__empty">
                  {matches.length === 0
                    ? <><p>Nessun incontro trovato.</p><button className="dv-btn-primary" onClick={onNew}>Crea il primo incontro</button></>
                    : <p>Nessun incontro corrisponde ai filtri.</p>}
                </div>
              ) : (
                <table className="dv-match-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Casa</th>
                      <th className="dv-match-table__score-col">Set</th>
                      <th>Ospiti</th>
                      <th>Campo</th>
                      <th>Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatches.map(m => {
                      let comp = '';
                      try { const n = JSON.parse(m.notes ?? '{}'); comp = n.competition || ''; } catch { comp = ''; }
                      const isSelected = m.id === selectedMatchId;
                      return (
                        <tr
                          key={m.id}
                          className={`dv-match-row ${isSelected ? 'dv-match-row--selected' : ''} dv-match-row--${m.phase}`}
                          onClick={() => { setSelectedMatchId(m.id); }}
                          onDoubleClick={() => onSelect(m.id)}
                        >
                          <td className="dv-match-row__date">
                            {new Date(m.date).toLocaleDateString('it-IT')}
                            {comp && <span className="dv-match-row__comp">{comp}</span>}
                          </td>
                          <td className="dv-match-row__home">{teamMap.get(m.home_team_id) ?? 'Casa'}</td>
                          <td className="dv-match-row__score">{m.sets_home} – {m.sets_away}</td>
                          <td className="dv-match-row__away">{teamMap.get(m.away_team_id) ?? 'Ospiti'}</td>
                          <td className="dv-match-row__venue">{m.venue ?? '—'}</td>
                          <td>
                            <span className={`dv-phase-badge dv-phase-badge--${m.phase}`}>
                              {phaseLabel[m.phase] ?? m.phase}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Status bar */}
            <div className="dv-statusbar">
              <span>{filteredMatches.length} incontri</span>
              {selectedMatch && (
                <span className="dv-statusbar__hint">Doppio clic per aprire · Invio per aprire</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {shareUrl && (
        <div className="share-toast">
          <span>Link: </span>
          <a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>
          <button className="btn btn--ghost btn--xs" onClick={() => navigator.clipboard.writeText(shareUrl)}>Copia</button>
          <button className="btn btn--ghost btn--xs" onClick={() => setShareUrl(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
