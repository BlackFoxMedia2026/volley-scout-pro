import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/stores/appStore';

interface TeamRow {
  id: string;
  org_id: string;
  name: string;
  short_name: string | null;
  is_own_team: number;
  created_at: number;
}

interface PlayerRow {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string;
  number: number;
  role: string;
  is_libero: number;
  birth_date: string | null;
  height_cm: number | null;
  hand: string | null;
}

const ROLES = ['S', 'OH', 'OP', 'MB', 'L', 'DS'];
const ROLE_LABELS: Record<string, string> = {
  S: 'Alzatore', OH: 'Schiacciatore', OP: 'Opposto',
  MB: 'Centrale', L: 'Libero', DS: 'Difensore',
};

interface Props {
  onClose: () => void;
}

export function TeamsView({ onClose }: Props) {
  const { orgId, seasonId } = useAppStore();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRow | null>(null);

  const [showNewTeam, setShowNewTeam] = useState(false);
  const [showNewPlayer, setShowNewPlayer] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerRow | null>(null);
  const [cloningPlayer, setCloningPlayer] = useState<PlayerRow | null>(null);

  useEffect(() => {
    if (!orgId) return;
    invoke<TeamRow[]>('get_teams', { orgId }).then(ts => {
      setTeams(ts);
      if (ts.length > 0 && !selectedTeam) setSelectedTeam(ts[0]);
    });
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    invoke<PlayerRow[]>('get_players', {
      orgId,
      teamId: selectedTeam?.id ?? null,
    }).then(ps => {
      setPlayers(ps);
      setSelectedPlayer(null);
    });
  }, [orgId, selectedTeam]);

  const handleTeamCreated = (t: TeamRow) => {
    setTeams(prev => [...prev, t]);
    setSelectedTeam(t);
    setShowNewTeam(false);
  };

  const handlePlayerCreated = (p: PlayerRow) => {
    setPlayers(prev => [...prev, p].sort((a, b) => a.number - b.number));
    setShowNewPlayer(false);
    setCloningPlayer(null);
  };

  const handlePlayerUpdated = (p: PlayerRow) => {
    setPlayers(prev =>
      prev.map(x => x.id === p.id ? p : x).sort((a, b) => a.number - b.number)
    );
    setEditingPlayer(null);
  };

  const handleExportAll = async () => {
    try {
      const data = JSON.stringify({ teams }, null, 2);
      await invoke('save_file', { content: data, defaultName: 'squadre.json', filterName: 'JSON', filterExt: 'json' });
    } catch { /* user cancelled */ }
  };

  const handleImport = async () => {
    // Import via Tauri command (pick file, read content)
    try {
      const result = await invoke<string | null>('pick_and_read_file');
      if (!result) return;
      const parsed = JSON.parse(result);
      if (parsed.teams && Array.isArray(parsed.teams) && orgId) {
        for (const t of parsed.teams) {
          if (t.name) {
            await invoke('create_team', { req: { org_id: orgId, name: t.name, short_name: t.short_name ?? null, is_own_team: t.is_own_team ?? false } });
          }
        }
        const fresh = await invoke<TeamRow[]>('get_teams', { orgId });
        setTeams(fresh);
      }
    } catch { /* user cancelled or error */ }
  };

  return (
    <div className="dialog-overlay">
      <div className="arq-window">

        {/* ── Title bar ── */}
        <div className="arq-titlebar">
          <span className="arq-titlebar__title">Archivio Squadre — La mia stagione</span>
          <button className="ni-titlebar__close" onClick={onClose}>✕</button>
        </div>

        {/* ── Left: team list ── */}
        <div className="arq-body">
          <div className="arq-left">
            {/* Toolbar */}
            <div className="arq-toolbar">
              <button className="arq-btn" onClick={() => setShowNewTeam(true)}>Nuova</button>
              <button className="arq-btn" onClick={handleImport}>Importa</button>
              <button className="arq-btn arq-btn--red" onClick={handleExportAll}>Esporta tutto</button>
              <span className="arq-count">{teams.length}</span>
            </div>

            {/* Team list */}
            <div className="arq-list">
              {teams.length === 0 && (
                <div className="arq-list__empty">Nessuna squadra</div>
              )}
              {teams.map(t => (
                <div
                  key={t.id}
                  className={`arq-list-row ${selectedTeam?.id === t.id ? 'arq-list-row--selected' : ''}`}
                  onClick={() => setSelectedTeam(t)}
                  onDoubleClick={() => setSelectedTeam(t)}
                >
                  <span className="arq-list-row__name">
                    {t.is_own_team ? '★ ' : ''}{t.name}
                  </span>
                  {t.short_name && <span className="arq-list-row__abbr">{t.short_name}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: player list ── */}
          <div className="arq-right">
            {selectedTeam ? (
              <>
                <div className="arq-right__header">
                  <span className="arq-right__title">{selectedTeam.name}</span>
                  <button className="arq-btn" onClick={() => setShowNewPlayer(true)}>+ Giocatore</button>
                </div>

                <div className="arq-player-toolbar">
                  <span className="arq-count">{players.length} atleti</span>
                </div>

                <div className="arq-player-list">
                  {players.length === 0 ? (
                    <div className="arq-list__empty">Nessun atleta — clicca "+ Giocatore"</div>
                  ) : (
                    <table className="arq-player-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Cognome</th>
                          <th>Nome</th>
                          <th>Ruolo</th>
                          <th>L</th>
                          <th>Alt.</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {players.map(p => (
                          <tr
                            key={p.id}
                            className={`arq-player-row ${p.is_libero ? 'arq-player-row--libero' : ''} ${selectedPlayer?.id === p.id ? 'arq-player-row--selected' : ''}`}
                            onClick={() => setSelectedPlayer(p)}
                            onDoubleClick={() => setEditingPlayer(p)}
                          >
                            <td className="arq-player-row__num">{p.number}</td>
                            <td className="arq-player-row__name">{p.last_name}</td>
                            <td className="arq-player-row__name">{p.first_name}</td>
                            <td>
                              <span className={`arq-role arq-role--${p.role.toLowerCase()}`}>{p.role}</span>
                            </td>
                            <td>{p.is_libero ? '✓' : ''}</td>
                            <td>{p.height_cm ?? '—'}</td>
                            <td>
                              <button className="arq-icon-btn" title="Modifica" onClick={e => { e.stopPropagation(); setEditingPlayer(p); }}>✏</button>
                              <button className="arq-icon-btn" title="Clona" onClick={e => { e.stopPropagation(); setCloningPlayer(p); }}>⊕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : (
              <div className="arq-right__empty">Seleziona una squadra</div>
            )}
          </div>
        </div>

        {/* ── Status bar ── */}
        <div className="arq-statusbar">
          {selectedTeam
            ? `${selectedTeam.name} · ${players.length} atleti`
            : `${teams.length} squadre`}
          <span style={{ marginLeft: 'auto' }}>Doppio clic per modificare</span>
        </div>
      </div>

      {/* ── Sub-dialogs ── */}
      {showNewTeam && orgId && (
        <NewTeamDialog orgId={orgId} onCreated={handleTeamCreated} onCancel={() => setShowNewTeam(false)} />
      )}
      {(showNewPlayer || cloningPlayer) && orgId && (
        <NewPlayerDialog
          orgId={orgId} seasonId={seasonId ?? undefined}
          teamId={selectedTeam?.id}
          initialValues={cloningPlayer ?? undefined}
          onCreated={handlePlayerCreated}
          onCancel={() => { setShowNewPlayer(false); setCloningPlayer(null); }}
        />
      )}
      {editingPlayer && orgId && (
        <EditPlayerDialog player={editingPlayer} onUpdated={handlePlayerUpdated} onCancel={() => setEditingPlayer(null)} />
      )}
    </div>
  );
}

// ─── New team dialog ─────────────────────────────────────────────────────────
function NewTeamDialog({ orgId, onCreated, onCancel }: { orgId: string; onCreated: (t: TeamRow) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [isOwn, setIsOwn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setError('Nome obbligatorio'); return; }
    setLoading(true);
    try {
      const t = await invoke<TeamRow>('create_team', {
        req: { org_id: orgId, name: name.trim(), short_name: shortName.trim() || null, is_own_team: isOwn },
      });
      onCreated(t);
    } catch (err) { setError(String(err)); setLoading(false); }
  };

  return (
    <div className="dialog-overlay" style={{ zIndex: 200 }}>
      <div className="dialog">
        <div className="ni-titlebar"><span>Nuova squadra</span><button className="ni-titlebar__close" onClick={onCancel}>✕</button></div>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          <div className="form-field">
            <span className="form-field__label">Nome squadra *</span>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="es. Volley Milano" autoFocus />
          </div>
          <div className="form-field">
            <span className="form-field__label">Abbreviazione</span>
            <input className="input" value={shortName} onChange={e => setShortName(e.target.value)} placeholder="es. MLN" maxLength={5} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.9rem' }}>
            <input type="checkbox" checked={isOwn} onChange={e => setIsOwn(e.target.checked)} />
            La mia squadra
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="dialog__actions">
            <button className="ni-btn ni-btn--cancel" onClick={onCancel}>Annulla</button>
            <button className="ni-btn ni-btn--ok" onClick={handleCreate} disabled={loading}>{loading ? '…' : 'Crea'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── New / clone player dialog ───────────────────────────────────────────────
function NewPlayerDialog({ orgId, seasonId, teamId, initialValues, onCreated, onCancel }: {
  orgId: string; seasonId?: string; teamId?: string;
  initialValues?: PlayerRow; onCreated: (p: PlayerRow) => void; onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState(initialValues?.first_name ?? '');
  const [lastName, setLastName]   = useState(initialValues?.last_name ?? '');
  const [number, setNumber]       = useState(initialValues != null ? String(initialValues.number) : '');
  const [role, setRole]           = useState(initialValues?.role ?? 'OH');
  const [isLibero, setIsLibero]   = useState(initialValues ? initialValues.is_libero === 1 : false);
  const [hand, setHand]           = useState(initialValues?.hand ?? 'R');
  const [heightCm, setHeightCm]   = useState(initialValues?.height_cm != null ? String(initialValues.height_cm) : '');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const isClone = initialValues != null;

  const handleCreate = async () => {
    if (!lastName.trim()) { setError('Cognome obbligatorio'); return; }
    const num = parseInt(number, 10);
    if (isNaN(num) || num < 0 || num > 99) { setError('Maglia: 0-99'); return; }
    setLoading(true);
    try {
      const p = await invoke<PlayerRow>('create_player', {
        req: { org_id: orgId, first_name: firstName.trim(), last_name: lastName.trim(), number: num, role, is_libero: isLibero, birth_date: null, height_cm: heightCm ? parseInt(heightCm, 10) : null, hand },
      });
      if (teamId && seasonId) {
        await invoke('link_player_to_team', { req: { team_id: teamId, player_id: p.id, season_id: seasonId, number: num, role, is_libero: isLibero } }).catch(() => {});
      }
      onCreated(p);
    } catch (err) { setError(String(err)); setLoading(false); }
  };

  return (
    <div className="dialog-overlay" style={{ zIndex: 200 }}>
      <div className="dialog">
        <div className="ni-titlebar"><span>{isClone ? 'Clona atleta' : 'Nuovo atleta'}</span><button className="ni-titlebar__close" onClick={onCancel}>✕</button></div>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          <div className="form-row">
            <div className="form-field"><span className="form-field__label">Cognome *</span><input className="input" value={lastName} onChange={e => setLastName(e.target.value)} autoFocus /></div>
            <div className="form-field"><span className="form-field__label">Nome</span><input className="input" value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-field"><span className="form-field__label">Maglia #</span><input className="input" type="number" min={0} max={99} value={number} onChange={e => setNumber(e.target.value)} /></div>
            <div className="form-field">
              <span className="form-field__label">Ruolo</span>
              <select className="select" value={role} onChange={e => { setRole(e.target.value); setIsLibero(e.target.value === 'L'); }}>
                {ROLES.map(r => <option key={r} value={r}>{r} — {ROLE_LABELS[r]}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-field"><span className="form-field__label">Mano</span><select className="select" value={hand} onChange={e => setHand(e.target.value)}><option value="R">Destra</option><option value="L">Sinistra</option></select></div>
            <div className="form-field"><span className="form-field__label">Altezza (cm)</span><input className="input" type="number" min={150} max={230} value={heightCm} onChange={e => setHeightCm(e.target.value)} /></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.9rem' }}>
            <input type="checkbox" checked={isLibero} onChange={e => setIsLibero(e.target.checked)} /> Libero
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="dialog__actions">
            <button className="ni-btn ni-btn--cancel" onClick={onCancel}>Annulla</button>
            <button className="ni-btn ni-btn--ok" onClick={handleCreate} disabled={loading}>{loading ? '…' : isClone ? 'Clona' : 'Aggiungi'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit player dialog ──────────────────────────────────────────────────────
function EditPlayerDialog({ player, onUpdated, onCancel }: { player: PlayerRow; onUpdated: (p: PlayerRow) => void; onCancel: () => void }) {
  const [firstName, setFirstName] = useState(player.first_name);
  const [lastName, setLastName]   = useState(player.last_name);
  const [number, setNumber]       = useState(String(player.number));
  const [role, setRole]           = useState(player.role);
  const [isLibero, setIsLibero]   = useState(player.is_libero === 1);
  const [hand, setHand]           = useState(player.hand ?? 'R');
  const [heightCm, setHeightCm]   = useState(player.height_cm != null ? String(player.height_cm) : '');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const handleSave = async () => {
    const num = parseInt(number, 10);
    if (isNaN(num) || num < 0 || num > 99) { setError('Maglia: 0-99'); return; }
    setLoading(true);
    try {
      const p = await invoke<PlayerRow>('update_player', {
        req: { id: player.id, first_name: firstName.trim(), last_name: lastName.trim(), number: num, role, is_libero: isLibero, height_cm: heightCm ? parseInt(heightCm, 10) : null, hand },
      });
      onUpdated(p);
    } catch (err) { setError(String(err)); setLoading(false); }
  };

  return (
    <div className="dialog-overlay" style={{ zIndex: 200 }}>
      <div className="dialog">
        <div className="ni-titlebar"><span>Modifica atleta</span><button className="ni-titlebar__close" onClick={onCancel}>✕</button></div>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          <div className="form-row">
            <div className="form-field"><span className="form-field__label">Cognome *</span><input className="input" value={lastName} onChange={e => setLastName(e.target.value)} autoFocus /></div>
            <div className="form-field"><span className="form-field__label">Nome</span><input className="input" value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-field"><span className="form-field__label">Maglia #</span><input className="input" type="number" min={0} max={99} value={number} onChange={e => setNumber(e.target.value)} /></div>
            <div className="form-field">
              <span className="form-field__label">Ruolo</span>
              <select className="select" value={role} onChange={e => { setRole(e.target.value); setIsLibero(e.target.value === 'L'); }}>
                {ROLES.map(r => <option key={r} value={r}>{r} — {ROLE_LABELS[r]}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-field"><span className="form-field__label">Mano</span><select className="select" value={hand} onChange={e => setHand(e.target.value)}><option value="R">Destra</option><option value="L">Sinistra</option></select></div>
            <div className="form-field"><span className="form-field__label">Altezza (cm)</span><input className="input" type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)} /></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.9rem' }}>
            <input type="checkbox" checked={isLibero} onChange={e => setIsLibero(e.target.checked)} /> Libero
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="dialog__actions">
            <button className="ni-btn ni-btn--cancel" onClick={onCancel}>Annulla</button>
            <button className="ni-btn ni-btn--ok" onClick={handleSave} disabled={loading}>{loading ? '…' : 'Salva'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
