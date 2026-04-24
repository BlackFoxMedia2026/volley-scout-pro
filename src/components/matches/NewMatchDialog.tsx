import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/stores/appStore';

interface TeamRow {
  id: string;
  name: string;
  short_name: string | null;
  is_own_team: number;
}

interface Props {
  onCreated: (matchId: string) => void;
  onCancel: () => void;
}

// ── Sub-dialog: selezione squadra ───────────────────────────────────────────
function TeamSelectionDialog({
  teams, onSelect, onClose, onCreateNew,
}: {
  teams: TeamRow[];
  onSelect: (t: TeamRow) => void;
  onClose: () => void;
  onCreateNew: (name: string) => Promise<TeamRow>;
}) {
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = teams.filter(t =>
    t.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const t = await onCreateNew(newName.trim());
    onSelect(t);
  };

  return (
    <div className="dialog-overlay" style={{ zIndex: 200 }}>
      <div className="ni-team-dialog">
        <div className="ni-titlebar">
          <span>Selezione squadra</span>
          <button className="ni-titlebar__close" onClick={onClose}>✕</button>
        </div>
        <div className="ni-team-search-row">
          <label className="ni-label">Ricerca</label>
          <input
            ref={inputRef}
            className="ni-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <span className="ni-team-count">{filtered.length}</span>
        </div>
        <div className="ni-team-list">
          {filtered.map(t => (
            <div key={t.id} className="ni-team-item" onClick={() => onSelect(t)}>
              {t.name}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="ni-team-empty">Nessuna squadra trovata</div>
          )}
        </div>
        <div className="ni-team-add-row">
          <input
            className="ni-input"
            placeholder="Nuova squadra…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          />
          <button className="ni-btn ni-btn--primary" onClick={handleCreate}>Crea</button>
        </div>
      </div>
    </div>
  );
}

// ── Main dialog: Note incontro ──────────────────────────────────────────────
export function NewMatchDialog({ onCreated, onCancel }: Props) {
  const { orgId, seasonId, userId } = useAppStore();

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [homeTeam, setHomeTeam] = useState<TeamRow | null>(null);
  const [awayTeam, setAwayTeam] = useState<TeamRow | null>(null);
  const [teamPickFor, setTeamPickFor] = useState<'home' | 'away' | null>(null);

  // form fields
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [stagione, setStagione] = useState('/');
  const [competition, setCompetition] = useState('');
  const [fase, setFase] = useState('');
  const [nIncontro, setNIncontro] = useState('');
  const [nGiornata, setNGiornata] = useState('');
  const [tipo, setTipo] = useState('');
  const [set5type, setSet5type] = useState('Indoor Rally point');
  const [homeCoach, setHomeCoach] = useState('');
  const [homeAssist, setHomeAssist] = useState('');
  const [awayCoach, setAwayCoach] = useState('');
  const [awayAssist, setAwayAssist] = useState('');
  const [arbitri, setArbitri] = useState('');
  const [spettatori, setSpettatori] = useState('');
  const [oraFine, setOraFine] = useState('');
  const [incasso, setIncasso] = useState('');
  const [citta, setCitta] = useState('');
  const [impianto, setImpianto] = useState('');
  const [rilevatore, setRilevatore] = useState('');
  const [scoutedTeam] = useState<'home' | 'away' | 'both'>('home');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orgId) return;
    invoke<TeamRow[]>('get_teams', { orgId }).then(setTeams);
  }, [orgId]);

  const handleCreateTeam = async (name: string): Promise<TeamRow> => {
    const t = await invoke<TeamRow>('create_team', {
      req: { org_id: orgId, name, is_own_team: false },
    });
    setTeams(prev => [...prev, t]);
    return t;
  };

  const handleCreate = async () => {
    if (!orgId || !seasonId || !userId) return;
    if (!homeTeam || !awayTeam) { setError('Seleziona entrambe le squadre'); return; }
    if (homeTeam.id === awayTeam.id) { setError('Le squadre devono essere diverse'); return; }
    setLoading(true);
    try {
      const notesObj = {
        competition: competition || null,
        phase: fase || null,
        nIncontro: nIncontro || null,
        nGiornata: nGiornata || null,
        tipo: tipo || null,
        set5type,
        homeCoach: homeCoach || null,
        homeAssist: homeAssist || null,
        awayCoach: awayCoach || null,
        awayAssist: awayAssist || null,
        arbitri: arbitri || null,
        spettatori: spettatori || null,
        oraFine: oraFine || null,
        incasso: incasso || null,
        citta: citta || null,
        impianto: impianto || null,
        rilevatore: rilevatore || null,
        stagione,
      };
      const match = await invoke<{ id: string }>('create_match', {
        req: {
          org_id: orgId,
          season_id: seasonId,
          home_team_id: homeTeam.id,
          away_team_id: awayTeam.id,
          date: `${date}T${time}:00`,
          venue: impianto || null,
          competition: competition || null,
          match_phase: fase || null,
          scouted_team: scoutedTeam,
          video_path: null,
          notes: JSON.stringify(notesObj),
          created_by: userId,
        },
      });
      onCreated(match.id);
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  return (
    <>
      <div className="dialog-overlay">
        <div className="ni-dialog">

          {/* Title bar */}
          <div className="ni-titlebar">
            <span>Note incontro</span>
            <button className="ni-titlebar__close" onClick={onCancel}>✕</button>
          </div>

          {/* Body */}
          <div className="ni-body">

            {/* Row 1: Data / Competizione / N.Incontro */}
            <div className="ni-grid-row">
              <label className="ni-label">Data</label>
              <input className="ni-input ni-input--date" type="date" value={date} onChange={e => setDate(e.target.value)} />
              <div className="ni-spacer" />
              <label className="ni-label">Competizione</label>
              <input className="ni-input ni-input--comp" list="ni-comp-list" value={competition} onChange={e => setCompetition(e.target.value)} />
              <datalist id="ni-comp-list">
                <option value="Serie A1 Maschile" />
                <option value="Serie A2 Maschile" />
                <option value="Serie A1 Femminile" />
                <option value="Serie A2 Femminile" />
                <option value="SuperLega" />
              </datalist>
              <label className="ni-label ni-label--right">N. Incontro</label>
              <input className="ni-input ni-input--sm" value={nIncontro} onChange={e => setNIncontro(e.target.value)} />
            </div>

            {/* Row 2: Orario / Fase / N.Giornata */}
            <div className="ni-grid-row">
              <label className="ni-label">Orario</label>
              <input className="ni-input ni-input--time" type="time" value={time} onChange={e => setTime(e.target.value)} />
              <div className="ni-spacer" />
              <label className="ni-label">Fase</label>
              <input className="ni-input ni-input--comp" list="ni-fase-list" value={fase} onChange={e => setFase(e.target.value)} />
              <datalist id="ni-fase-list">
                <option value="Stagione regolare" />
                <option value="Playoff" />
                <option value="Playout" />
                <option value="Finale" />
                <option value="Semifinale" />
              </datalist>
              <label className="ni-label ni-label--right">N. Giornata</label>
              <input className="ni-input ni-input--sm" value={nGiornata} onChange={e => setNGiornata(e.target.value)} />
            </div>

            {/* Row 3: Stagione / Tipo / 5 Set */}
            <div className="ni-grid-row">
              <label className="ni-label">Stagione</label>
              <input className="ni-input ni-input--stagione" value={stagione} onChange={e => setStagione(e.target.value)} />
              <div className="ni-spacer" />
              <label className="ni-label">Tipo</label>
              <select className="ni-select ni-input--tipo" value={tipo} onChange={e => setTipo(e.target.value)}>
                <option value="">—</option>
                <option value="Campionato">Campionato</option>
                <option value="Coppa">Coppa</option>
                <option value="Amichevole">Amichevole</option>
                <option value="Torneo">Torneo</option>
              </select>
              <label className="ni-label ni-label--right">5 Set</label>
              <select className="ni-select ni-input--set5" value={set5type} onChange={e => setSet5type(e.target.value)}>
                <option>Indoor Rally point</option>
                <option>Beach Rally point</option>
                <option>Side out</option>
              </select>
            </div>

            <div className="ni-divider" />

            {/* Team header */}
            <div className="ni-team-header-row">
              <div className="ni-team-header-spacer" />
              <div className="ni-team-header-name" />
              <div className="ni-team-header-col">Allenatore</div>
              <div className="ni-team-header-col">Assistente</div>
              <div className="ni-team-header-jersey" />
            </div>

            {/* Home team row */}
            <div className="ni-team-row">
              <button className="ni-pick-btn" onClick={() => setTeamPickFor('home')}>…</button>
              <div className="ni-team-name ni-team-name--home">
                {homeTeam ? homeTeam.name : <span className="ni-placeholder">— seleziona squadra —</span>}
              </div>
              <input className="ni-input" placeholder="Allenatore" value={homeCoach} onChange={e => setHomeCoach(e.target.value)} />
              <input className="ni-input" placeholder="Assistente" value={homeAssist} onChange={e => setHomeAssist(e.target.value)} />
              <div className="ni-jersey ni-jersey--home">👕</div>
            </div>

            {/* Away team row */}
            <div className="ni-team-row">
              <button className="ni-pick-btn" onClick={() => setTeamPickFor('away')}>…</button>
              <div className="ni-team-name ni-team-name--away">
                {awayTeam ? awayTeam.name : <span className="ni-placeholder">— seleziona squadra —</span>}
              </div>
              <input className="ni-input" placeholder="Allenatore" value={awayCoach} onChange={e => setAwayCoach(e.target.value)} />
              <input className="ni-input" placeholder="Assistente" value={awayAssist} onChange={e => setAwayAssist(e.target.value)} />
              <div className="ni-jersey ni-jersey--away">👕</div>
            </div>

            <div className="ni-divider" />

            {/* Extra info */}
            <div className="ni-extra-grid">
              <label className="ni-label">Arbitri</label>
              <input className="ni-input ni-input--wide" value={arbitri} onChange={e => setArbitri(e.target.value)} />

              <label className="ni-label">Spettatori</label>
              <input className="ni-input ni-input--sm" value={spettatori} onChange={e => setSpettatori(e.target.value)} />
              <label className="ni-label">Ora fine</label>
              <input className="ni-input ni-input--time" type="time" value={oraFine} onChange={e => setOraFine(e.target.value)} />

              <label className="ni-label">Incasso</label>
              <input className="ni-input ni-input--sm" value={incasso} onChange={e => setIncasso(e.target.value)} />

              <label className="ni-label">Città</label>
              <input className="ni-input ni-input--wide" value={citta} onChange={e => setCitta(e.target.value)} />

              <label className="ni-label">Impianto</label>
              <input className="ni-input ni-input--wide" value={impianto} onChange={e => setImpianto(e.target.value)} />

              <label className="ni-label">Rilevatore</label>
              <input className="ni-input ni-input--wide" value={rilevatore} onChange={e => setRilevatore(e.target.value)} />
            </div>

            {error && <p className="ni-error">{error}</p>}
          </div>

          {/* Footer buttons — same as DV4: Commenti | Ok | Annulla */}
          <div className="ni-footer">
            <button className="ni-btn ni-btn--comments">Commenti</button>
            <div style={{ flex: 1 }} />
            <button className="ni-btn ni-btn--ok" onClick={handleCreate} disabled={loading}>
              {loading ? 'Creazione…' : 'Ok'}
            </button>
            <button className="ni-btn ni-btn--cancel" onClick={onCancel}>Annulla</button>
          </div>
        </div>
      </div>

      {/* Team selection sub-dialog */}
      {teamPickFor && (
        <TeamSelectionDialog
          teams={teams}
          onSelect={t => {
            if (teamPickFor === 'home') setHomeTeam(t);
            else setAwayTeam(t);
            setTeamPickFor(null);
          }}
          onClose={() => setTeamPickFor(null)}
          onCreateNew={handleCreateTeam}
        />
      )}
    </>
  );
}
