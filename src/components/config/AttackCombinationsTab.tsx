import { useState, useEffect } from 'react';
import { useConfigStore } from '@/stores/configStore';
import type { AttackCombination } from '@/stores/configStore';

interface Props { orgId: string; }

const DV4_DEFAULTS: Omit<AttackCombination, 'id' | 'orgId' | 'seasonId' | 'useCones' | 'trajectoryData'>[] = [
  // ─── Quick (Q) ───────────────────────────────────────────────────────────
  { code: 'X2', zoneFrom: 3, ballType: 'Q', attackerPosition: 'Center', description: 'veloce dietro',                   sortOrder:  1, isActive: 1 },
  { code: 'X1', zoneFrom: 3, ballType: 'Q', attackerPosition: 'Center', description: 'veloce davanti',                  sortOrder:  2, isActive: 1 },
  { code: 'XM', zoneFrom: 3, ballType: 'Q', attackerPosition: 'Center', description: 'Veloce in punto 3',               sortOrder:  3, isActive: 1 },
  { code: 'XG', zoneFrom: 3, ballType: 'Q', attackerPosition: 'Center', description: '7-1 Gun',                         sortOrder:  4, isActive: 1 },
  { code: 'XC', zoneFrom: 3, ballType: 'Q', attackerPosition: 'Center', description: 'veloce spostata',                 sortOrder:  5, isActive: 1 },
  { code: 'XD', zoneFrom: 3, ballType: 'Q', attackerPosition: 'Center', description: 'DoppiaC',                         sortOrder:  6, isActive: 1 },
  { code: 'X7', zoneFrom: 4, ballType: 'Q', attackerPosition: 'Center', description: 'Sette Davanti',                   sortOrder:  7, isActive: 1 },
  { code: 'XS', zoneFrom: 2, ballType: 'Q', attackerPosition: 'Center', description: 'Sette Dietro',                    sortOrder:  8, isActive: 1 },
  { code: 'XO', zoneFrom: 2, ballType: 'Q', attackerPosition: 'Back',   description: 'Veloce Dietro Opp.',              sortOrder:  9, isActive: 1 },
  { code: 'XF', zoneFrom: 2, ballType: 'Q', attackerPosition: 'Back',   description: 'Fast Opposto',                    sortOrder: 10, isActive: 1 },
  { code: 'CD', zoneFrom: 2, ballType: 'Q', attackerPosition: 'Center', description: 'Fast vicino al palleggiatore',    sortOrder: 11, isActive: 1 },
  { code: 'CB', zoneFrom: 2, ballType: 'Q', attackerPosition: 'Center', description: 'Fast spostata dal palleggiatore', sortOrder: 12, isActive: 1 },
  { code: 'CF', zoneFrom: 2, ballType: 'Q', attackerPosition: 'Center', description: 'Fast lontano dal palleggiatore',  sortOrder: 13, isActive: 1 },
  // ─── High (H) ────────────────────────────────────────────────────────────
  { code: 'V5', zoneFrom: 4, ballType: 'H', attackerPosition: 'Front',  description: 'Alta in posto 4',                 sortOrder: 14, isActive: 1 },
  { code: 'V0', zoneFrom: 7, ballType: 'H', attackerPosition: 'Front',  description: 'Alta in posto 5',                 sortOrder: 15, isActive: 1 },
  { code: 'V6', zoneFrom: 2, ballType: 'H', attackerPosition: 'Back',   description: 'Alta in posto 2',                 sortOrder: 16, isActive: 1 },
  { code: 'V8', zoneFrom: 9, ballType: 'H', attackerPosition: 'Back',   description: 'Alta in posto 1',                 sortOrder: 17, isActive: 1 },
  { code: 'VB', zoneFrom: 8, ballType: 'H', attackerPosition: 'Pipe',   description: 'Pipe Alta spostata 6-1',          sortOrder: 18, isActive: 1 },
  { code: 'VP', zoneFrom: 8, ballType: 'H', attackerPosition: 'Pipe',   description: 'Pipe Alta',                       sortOrder: 19, isActive: 1 },
  { code: 'VR', zoneFrom: 8, ballType: 'H', attackerPosition: 'Pipe',   description: 'Pipe Alta spostata 6-5',          sortOrder: 20, isActive: 1 },
  // ─── Other (O) ───────────────────────────────────────────────────────────
  { code: 'V3', zoneFrom: 3, ballType: 'O', attackerPosition: '-',      description: 'Alta in posto 3',                 sortOrder: 21, isActive: 1 },
  { code: 'P2', zoneFrom: 3, ballType: 'O', attackerPosition: '-',      description: 'Secondo tocco di là',             sortOrder: 22, isActive: 1 },
  { code: 'PR', zoneFrom: 3, ballType: 'O', attackerPosition: '-',      description: 'Rigore',                          sortOrder: 23, isActive: 1 },
  { code: 'PP', zoneFrom: 3, ballType: 'O', attackerPosition: 'Setter', description: 'Pallonetto Alzatore',             sortOrder: 24, isActive: 1 },
  // ─── Tenso (T) ───────────────────────────────────────────────────────────
  { code: 'X0', zoneFrom: 7, ballType: 'T', attackerPosition: 'Front',  description: 'Spinta in posto 5',               sortOrder: 25, isActive: 1 },
  { code: 'X6', zoneFrom: 2, ballType: 'T', attackerPosition: 'Back',   description: 'Spinta in posto 2',               sortOrder: 26, isActive: 1 },
  { code: 'X8', zoneFrom: 9, ballType: 'T', attackerPosition: 'Back',   description: 'Spinta in posto 1',               sortOrder: 27, isActive: 1 },
  { code: 'X5', zoneFrom: 4, ballType: 'T', attackerPosition: 'Front',  description: 'Spinta in posto 4',               sortOrder: 28, isActive: 1 },
  // ─── Super (U) ───────────────────────────────────────────────────────────
  { code: 'C5', zoneFrom: 4, ballType: 'U', attackerPosition: 'Front',  description: 'Super in posto 4',                sortOrder: 29, isActive: 1 },
  { code: 'C0', zoneFrom: 7, ballType: 'U', attackerPosition: 'Front',  description: 'Super in posto 5',                sortOrder: 30, isActive: 1 },
  { code: 'C6', zoneFrom: 2, ballType: 'U', attackerPosition: 'Back',   description: 'Super in posto 2',                sortOrder: 31, isActive: 1 },
  { code: 'C8', zoneFrom: 9, ballType: 'U', attackerPosition: 'Back',   description: 'Super in posto 1',                sortOrder: 32, isActive: 1 },
  // ─── Mezza (M) ───────────────────────────────────────────────────────────
  { code: 'X9', zoneFrom: 4, ballType: 'M', attackerPosition: 'Front',  description: 'Mezza davanti dopo 7',            sortOrder: 33, isActive: 1 },
  { code: 'XT', zoneFrom: 3, ballType: 'M', attackerPosition: 'Front',  description: 'Mezza da posto 4',                sortOrder: 34, isActive: 1 },
  { code: 'X3', zoneFrom: 3, ballType: 'M', attackerPosition: 'Back',   description: 'Mezza da posto 2',                sortOrder: 35, isActive: 1 },
  { code: 'X4', zoneFrom: 4, ballType: 'M', attackerPosition: 'Back',   description: 'Mezza dietro C.A.',               sortOrder: 36, isActive: 1 },
  { code: 'XQ', zoneFrom: 2, ballType: 'M', attackerPosition: 'Back',   description: 'Mezza Dietro C.D.',               sortOrder: 37, isActive: 1 },
  { code: 'XB', zoneFrom: 8, ballType: 'M', attackerPosition: 'Pipe',   description: 'Pipe spostata 6-1',               sortOrder: 38, isActive: 1 },
  { code: 'XP', zoneFrom: 8, ballType: 'M', attackerPosition: 'Pipe',   description: 'Pipe',                            sortOrder: 39, isActive: 1 },
  { code: 'XR', zoneFrom: 8, ballType: 'M', attackerPosition: 'Pipe',   description: 'Pipe spostata 6-5',               sortOrder: 40, isActive: 1 },
];

function ballColor(ballType: string | null, pos: string | null) {
  if (ballType === 'O' && (pos === '-' || pos === null)) return 'red';
  return 'blue';
}

function parseTrajectory(data: string | null) {
  try {
    if (!data) return { direction: 0, color: '#c0392b', note: '', subZone: '' };
    const p = JSON.parse(data);
    return {
      direction: p.direction ?? 0,
      color: p.color ?? '#c0392b',
      note: p.note ?? '',
      subZone: p.subZone ?? '',
    };
  } catch {
    return { direction: 0, color: '#c0392b', note: '', subZone: '' };
  }
}

const PALETTE = [
  '#111111', '#c0392b', '#1a5276', '#1e8449',
  '#d4ac0d', '#784212', '#717d7e', '#d0d3d4',
  '#6c3483', '#117a65',
];

// DV4 court grid: net at top, 3 rows × 3 cols
// Sub-zones within each cell:  C | B
//                               D | A
const COURT_GRID = [
  [4, 3, 2],  // Prima linea (near net)
  [7, 8, 9],  // Middle
  [5, 6, 1],  // Back
];

// Sub-zone positions: [row, col] within the 2×2 grid (C=top-left, B=top-right, D=bot-left, A=bot-right)
const SUB_ZONES: { label: string; row: number; col: number }[] = [
  { label: 'C', row: 0, col: 0 },
  { label: 'B', row: 0, col: 1 },
  { label: 'D', row: 1, col: 0 },
  { label: 'A', row: 1, col: 1 },
];

const DIR_LABELS = ['Incrociato', 'Diag. sx', 'Diag. dx', 'Dritto'];
const DIR_ROTATIONS = [-45, -22, 22, 45];

export function AttackCombinationsTab({ orgId }: Props) {
  const { attackCombinations, upsertCombination, deleteCombination, init } = useConfigStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<AttackCombination> | null>(null);
  const [attackMode, setAttackMode] = useState<'zone' | 'coni'>('zone');

  // Edit dialog extra state
  const [editNote, setEditNote] = useState('');
  const [editDirection, setEditDirection] = useState(0);
  const [editColor, setEditColor] = useState('#c0392b');
  const [editSubZone, setEditSubZone] = useState('');
  const [saveError, setSaveError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Ensure configStore has orgId loaded
  useEffect(() => {
    if (orgId) init(orgId);
  }, [orgId]);

  const rows = attackCombinations.length > 0
    ? attackCombinations
    : DV4_DEFAULTS.map((d, i) => ({
        ...d, id: `default-${i}`, orgId, seasonId: null, useCones: 0, trajectoryData: null,
      }));

  const isDefault = (id?: string | null) => !id || id.startsWith('default-');

  const openEdit = (combo: Partial<AttackCombination>) => {
    const traj = parseTrajectory(combo.trajectoryData ?? null);
    setEditNote(traj.note);
    setEditDirection(traj.direction);
    setEditColor(traj.color);
    setEditSubZone(traj.subZone);
    setSaveError('');
    setEditing({ ...combo });
  };

  const handleLoadDefaults = async () => {
    setResetting(true);
    // Delete existing then re-insert all 40 DV4 defaults
    const toDelete = [...attackCombinations];
    for (const c of toDelete) {
      await deleteCombination(c.id);
    }
    for (const d of DV4_DEFAULTS) {
      await upsertCombination({
        ...d, id: undefined, orgId, seasonId: null, useCones: 0, trajectoryData: null,
      });
    }
    setResetting(false);
    setConfirmReset(false);
  };

  const handleSave = async () => {
    if (!editing?.code?.trim()) {
      setSaveError('Inserire un codice combinazione');
      return;
    }
    setSaveError('');
    try {
      const trajectoryData = JSON.stringify({
        direction: editDirection,
        color: editColor,
        note: editNote,
        subZone: editSubZone,
      });
      const id = !isDefault(editing.id) ? editing.id : undefined;
      await upsertCombination({
        orgId,
        seasonId: null,
        code: editing.code.trim().toUpperCase(),
        description: editing.description ?? '',
        ballType: editing.ballType ?? null,
        attackerPosition: editing.attackerPosition ?? null,
        zoneFrom: editing.zoneFrom ?? null,
        useCones: attackMode === 'coni' ? 1 : 0,
        trajectoryData,
        sortOrder: editing.sortOrder ?? rows.length,
        isActive: 1,
        id,
      });
    } catch (e) {
      setSaveError(String(e));
      return;
    }
    setEditing(null);
  };

  const moveUp = async () => {
    const idx = rows.findIndex(r => r.id === selectedId);
    if (idx <= 0) return;
    const a = rows[idx], b = rows[idx - 1];
    await upsertCombination({ ...a, sortOrder: b.sortOrder });
    await upsertCombination({ ...b, sortOrder: a.sortOrder });
  };

  const moveDown = async () => {
    const idx = rows.findIndex(r => r.id === selectedId);
    if (idx < 0 || idx >= rows.length - 1) return;
    const a = rows[idx], b = rows[idx + 1];
    await upsertCombination({ ...a, sortOrder: b.sortOrder });
    await upsertCombination({ ...b, sortOrder: a.sortOrder });
  };

  const zoneLabel = editing?.zoneFrom != null
    ? `Zona ${editing.zoneFrom}${editSubZone}`
    : 'Seleziona zona';

  return (
    <div className="tb-layout">

      {/* ── Main table ── */}
      <div className="tb-main">
        <div className="tb-thead">
          <span className="tb-col-code">Codice</span>
          <span className="tb-col-zone">Zona</span>
          <span className="tb-col-ball">Palla</span>
          <span className="tb-col-att">Attacc.</span>
          <span className="tb-col-desc">Descrizione</span>
          <span className="tb-col-count">{rows.length}</span>
        </div>

        <div className="tb-rows">
          {rows.map(r => (
            <div
              key={r.id}
              className={`tb-row ${selectedId === r.id ? 'tb-row--selected' : ''} ${!r.isActive ? 'tb-row--inactive' : ''}`}
              onClick={() => setSelectedId(r.id)}
              onDoubleClick={() => openEdit(r)}
            >
              <span className="tb-col-code tb-code">{r.code}</span>
              <span className="tb-col-zone" style={{ textAlign: 'center' }}>{r.zoneFrom ?? '—'}</span>
              <span className="tb-col-ball">
                <span className={`tb-ball-icon tb-ball-icon--${ballColor(r.ballType, r.attackerPosition)}`} />
                <span className="tb-ball-letter">{r.ballType ?? '?'}</span>
              </span>
              <span className="tb-col-att">{r.attackerPosition ?? '—'}</span>
              <span className="tb-col-desc">{r.description}</span>
            </div>
          ))}
        </div>

        <div className="tb-options">
          <span className="tb-options__label">Selezionare come gestire le traiettorie di Attacco:</span>
          <label className="tb-radio">
            <input type="radio" name="attackMode" checked={attackMode === 'zone'} onChange={() => setAttackMode('zone')} />
            Attacchi per Zone
          </label>
          <label className="tb-radio">
            <input type="radio" name="attackMode" checked={attackMode === 'coni'} onChange={() => setAttackMode('coni')} />
            Attacchi per Coni
          </label>
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div className="tb-sidebar">
        <button
          className="tb-side-btn"
          onClick={() => openEdit({
            orgId, code: '', description: '', ballType: 'H',
            attackerPosition: 'Front', zoneFrom: null,
            sortOrder: rows.length, isActive: 1,
          })}
        >
          Aggiungi
        </button>
        <button className="tb-side-btn" onClick={() => {}}>Stampa</button>
        <div className="tb-side-arrows">
          <button className="tb-arrow-btn" onClick={moveUp} title="Sposta su">▲</button>
          <button className="tb-arrow-btn" onClick={moveDown} title="Sposta giù">▼</button>
        </div>
        <div style={{ flex: 1 }} />
        {confirmReset ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 }}>
              Sostituire tutto con i 40 DV4?
            </span>
            <button
              className="tb-side-btn"
              style={{ background: '#c0392b', color: '#fff', border: 'none' }}
              onClick={handleLoadDefaults}
              disabled={resetting}
            >
              {resetting ? '…' : 'Conferma'}
            </button>
            <button className="tb-side-btn" onClick={() => setConfirmReset(false)}>
              No
            </button>
          </div>
        ) : (
          <button
            className="tb-side-btn tb-side-btn--default"
            onClick={() => setConfirmReset(true)}
            title="Carica combinazioni DV4 predefinite"
          >
            Predefiniti
          </button>
        )}
      </div>

      {/* ── Edit / Add dialog ── */}
      {editing && (
        <div className="dialog-overlay" style={{ zIndex: 300 }}>
          <div className="comb-edit-dialog">

            <div className="ni-titlebar">
              <span>Combinazioni attacco — {!isDefault(editing.id) ? 'Modifica' : 'Nuova'}</span>
              <button className="ni-titlebar__close" onClick={() => setEditing(null)}>✕</button>
            </div>

            <div className="comb-edit-body">

              {/* LEFT: form */}
              <div className="comb-edit-left">

                <div className="comb-field">
                  <span className="comb-field__label">Codice (2 car.)</span>
                  <input
                    className="comb-field__input comb-field__input--code"
                    maxLength={2}
                    value={editing.code ?? ''}
                    onChange={e => setEditing(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                    autoFocus
                  />
                </div>

                <div className="comb-field">
                  <span className="comb-field__label">Descrizione</span>
                  <input
                    className="comb-field__input"
                    value={editing.description ?? ''}
                    onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                  />
                </div>

                <div className="comb-field">
                  <span className="comb-field__label">Tipo palla</span>
                  <select
                    className="comb-field__select"
                    value={editing.ballType ?? ''}
                    onChange={e => setEditing(p => ({ ...p, ballType: e.target.value || null }))}
                  >
                    <option value="">—</option>
                    <option value="H">Alta</option>
                    <option value="M">Mezza</option>
                    <option value="Q">Veloce (Quick)</option>
                    <option value="T">Tenso (Spinta)</option>
                    <option value="U">Super</option>
                    <option value="O">Altro</option>
                  </select>
                </div>

                <div className="comb-field">
                  <span className="comb-field__label">Attaccante servito</span>
                  <select
                    className="comb-field__select"
                    value={editing.attackerPosition ?? ''}
                    onChange={e => setEditing(p => ({ ...p, attackerPosition: e.target.value || null }))}
                  >
                    <option value="">—</option>
                    <option value="Front">Ala (Front)</option>
                    <option value="Back">Opposto (Back)</option>
                    <option value="Center">Centrale (Center)</option>
                    <option value="Pipe">Pipe</option>
                    <option value="Setter">Alzatore (Setter)</option>
                    <option value="-">—</option>
                  </select>
                </div>

                <div className="comb-field comb-field--grow">
                  <span className="comb-field__label">Note</span>
                  <textarea
                    className="comb-field__textarea"
                    value={editNote}
                    onChange={e => setEditNote(e.target.value)}
                    rows={4}
                  />
                </div>

                {saveError && (
                  <p style={{ color: 'var(--q-error)', fontSize: '.82rem', margin: 0 }}>{saveError}</p>
                )}

              </div>

              {/* RIGHT: court editor */}
              <div className="comb-edit-right">

                {/* Direction arrows */}
                <div className="comb-section">
                  <div className="comb-section__label">Direzione attacco</div>
                  <div className="comb-dir-row">
                    {DIR_ROTATIONS.map((rot, dir) => (
                      <button
                        key={dir}
                        className={`comb-dir-btn ${editDirection === dir ? 'comb-dir-btn--active' : ''}`}
                        onClick={() => setEditDirection(dir)}
                        title={DIR_LABELS[dir]}
                      >
                        <svg width="22" height="22" viewBox="0 0 22 22"
                          fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <g transform={`rotate(${rot} 11 11)`}>
                            <line x1="11" y1="18" x2="11" y2="5" />
                            <polyline points="7,9 11,5 15,9" />
                          </g>
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color palette */}
                <div className="comb-section">
                  <div className="comb-section__label">Colore traiettoria</div>
                  <div className="comb-palette-row">
                    {PALETTE.map(c => (
                      <div
                        key={c}
                        className={`comb-color-swatch ${editColor === c ? 'comb-color-swatch--active' : ''}`}
                        style={{ background: c }}
                        onClick={() => setEditColor(c)}
                        title={c}
                      />
                    ))}
                  </div>
                </div>

                {/* Court zone grid */}
                <div className="comb-section comb-section--grow">
                  <div className="comb-court-label">Prima linea</div>
                  <div className="comb-court-grid">
                    {COURT_GRID.map((rowZones, ri) =>
                      rowZones.map((zone, ci) => (
                        <div
                          key={`${ri}-${ci}`}
                          className={`comb-court-cell ${editing.zoneFrom === zone ? 'comb-court-cell--selected' : ''}`}
                          onClick={() => {
                            setEditing(p => ({ ...p, zoneFrom: zone }));
                            setEditSubZone('');
                          }}
                        >
                          {zone}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Sub-zone picker (A/B/C/D) — appears after zone selected */}
                  {editing.zoneFrom != null && (
                    <div className="comb-subzone-section">
                      <div className="comb-section__label" style={{ marginBottom: '.25rem' }}>
                        Settore zona {editing.zoneFrom}
                      </div>
                      <div className="comb-subzone-grid">
                        {SUB_ZONES.map(sz => (
                          <button
                            key={sz.label}
                            className={`comb-subzone-btn ${editSubZone === sz.label ? 'comb-subzone-btn--active' : ''}`}
                            style={{ gridRow: sz.row + 1, gridColumn: sz.col + 1 }}
                            onClick={() => setEditSubZone(prev => prev === sz.label ? '' : sz.label)}
                          >
                            {sz.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="comb-zone-label">{zoneLabel}</div>
                </div>

                <button className="comb-see-all-btn">Premere per vedere tutte</button>

              </div>
            </div>

            {/* Footer */}
            <div className="comb-edit-footer">
              {!isDefault(editing.id) && (
                <button
                  className="comb-delete-btn"
                  onClick={async () => {
                    await deleteCombination(editing.id!);
                    setEditing(null);
                  }}
                >
                  🗑 Elimina
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button className="ni-btn ni-btn--ok" onClick={handleSave}>Ok</button>
              <button className="ni-btn ni-btn--cancel" onClick={() => setEditing(null)}>Annulla</button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
