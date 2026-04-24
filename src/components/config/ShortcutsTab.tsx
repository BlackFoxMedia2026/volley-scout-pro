import { useState } from 'react';
import { useConfigStore } from '@/stores/configStore';
import type { CodeShortcut } from '@/stores/configStore';

interface Props {
  orgId: string;
}

const EMPTY: Omit<CodeShortcut, 'id' | 'orgId'> = { shortcut: '', expandsTo: '', description: '' };

export function ShortcutsTab({ orgId }: Props) {
  const { shortcuts, upsertShortcut, deleteShortcut } = useConfigStore();
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const startEdit = (s: CodeShortcut) => {
    setEditId(s.id);
    setForm({ shortcut: s.shortcut, expandsTo: s.expandsTo, description: s.description });
    setError('');
  };

  const reset = () => {
    setEditId(null);
    setForm(EMPTY);
    setError('');
  };

  const handleSave = async () => {
    if (!form.shortcut.trim()) { setError('Shortcut obbligatorio'); return; }
    if (!form.expandsTo.trim()) { setError('Codice espanso obbligatorio'); return; }
    try {
      await upsertShortcut({ id: editId ?? undefined, orgId, ...form });
      reset();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="shortcuts-tab">
      <p className="shortcuts-tab__info">
        Gli shortcut consentono di digitare alias brevi (es. <code>ace</code>) che vengono
        espansi automaticamente al codice DV4 completo (es. <code>a01S#</code>) prima del parsing.
      </p>

      <div className="shortcuts-tab__form">
        <label className="form-label">
          Shortcut
          <input
            className="form-input"
            value={form.shortcut}
            placeholder="ace"
            onChange={e => setForm(f => ({ ...f, shortcut: e.target.value.toLowerCase() }))}
          />
        </label>
        <label className="form-label">
          Espande in
          <input
            className="form-input form-input--mono"
            value={form.expandsTo}
            placeholder="a01S#"
            onChange={e => setForm(f => ({ ...f, expandsTo: e.target.value }))}
          />
        </label>
        <label className="form-label">
          Descrizione
          <input
            className="form-input"
            value={form.description}
            placeholder="Ace battuta"
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="shortcuts-tab__form-actions">
          {editId && <button className="btn btn--ghost" onClick={reset}>Annulla</button>}
          <button className="btn btn--primary" onClick={handleSave}>
            {editId ? 'Salva modifiche' : 'Aggiungi shortcut'}
          </button>
        </div>
      </div>

      {shortcuts.length === 0 ? (
        <p className="shortcuts-tab__empty">Nessuno shortcut configurato.</p>
      ) : (
        <table className="config-table">
          <thead>
            <tr>
              <th>Shortcut</th>
              <th>Espande in</th>
              <th>Descrizione</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shortcuts.map(s => (
              <tr key={s.id} className={editId === s.id ? 'config-table__row--editing' : ''}>
                <td><code>{s.shortcut}</code></td>
                <td><code>{s.expandsTo}</code></td>
                <td>{s.description}</td>
                <td className="config-table__actions">
                  <button className="btn btn--ghost btn--sm" onClick={() => startEdit(s)}>Modifica</button>
                  <button className="btn btn--danger btn--sm" onClick={() => deleteShortcut(s.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
