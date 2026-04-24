import { useState } from 'react';
import { useConfigStore } from '@/stores/configStore';
import type { SetterCall } from '@/stores/configStore';

interface Props { orgId: string; }

const K_CODES = ['K1','K2','K3','K4','K5','K6','K7','K8','K9'];

export function SetterCallsTab({ orgId }: Props) {
  const { setterCalls, upsertSetterCall } = useConfigStore();
  const [editing, setEditing] = useState<Partial<SetterCall> | null>(null);

  const handleSave = async () => {
    if (!editing?.code || !editing.description) return;
    await upsertSetterCall({ ...editing, orgId } as SetterCall);
    setEditing(null);
  };

  return (
    <div className="config-tab">
      <div className="config-tab__toolbar">
        <span className="config-tab__count">{setterCalls.length} chiamate configurate</span>
      </div>

      {editing && (
        <div className="config-form">
          <h3 className="config-form__title">Modifica chiamata {editing.code}</h3>

          <div className="config-form__row">
            <label>
              Descrizione
              <input
                value={editing.description ?? ''}
                onChange={e => setEditing(prev => ({ ...prev, description: e.target.value }))}
                className="input"
                placeholder="es. Veloce zona 4"
              />
            </label>
            <label>
              Colore
              <input
                type="color"
                value={editing.colorHex ?? '#888888'}
                onChange={e => setEditing(prev => ({ ...prev, colorHex: e.target.value }))}
                className="input input--color"
              />
            </label>
          </div>

          <div className="config-form__actions">
            <button className="btn btn--ghost" onClick={() => setEditing(null)}>Annulla</button>
            <button className="btn btn--primary" onClick={handleSave}>Salva</button>
          </div>
        </div>
      )}

      <div className="setter-calls-grid">
        {K_CODES.map(code => {
          const call = setterCalls.find(c => c.code === code);
          return (
            <button
              key={code}
              className="setter-call-card"
              style={{ borderColor: call?.colorHex ?? '#444', background: call ? `${call.colorHex}22` : undefined }}
              onClick={() => setEditing(call ? { ...call } : { code, description: '', colorHex: '#888888', orgId, isActive: 1 })}
            >
              <span className="setter-call-card__code">{code}</span>
              <span className="setter-call-card__desc">{call?.description ?? 'non configurata'}</span>
              {call && <span className="setter-call-card__dot" style={{ background: call.colorHex }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
