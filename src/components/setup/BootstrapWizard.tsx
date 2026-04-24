import { useState } from 'react';
import { useAppStore } from '@/stores/appStore';

// First-run wizard: create org, season, and first user.
// Shows only once — data is persisted to SQLite.

export function BootstrapWizard() {
  const { bootstrap } = useAppStore();
  const [orgName, setOrgName]     = useState('');
  const [seasonName, setSeasonName] = useState('2025/2026');
  const [userName, setUserName]   = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !userName.trim()) {
      setError('Compila tutti i campi obbligatori');
      return;
    }
    setLoading(true);
    try {
      await bootstrap(orgName.trim(), seasonName.trim(), userName.trim());
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  return (
    <div className="bootstrap-wizard">
      <div className="bootstrap-wizard__card">
        <h1 className="bootstrap-wizard__title">VolleyScoutPro</h1>
        <p className="bootstrap-wizard__subtitle">Prima configurazione — compila i dati della tua organizzazione</p>

        <form className="bootstrap-wizard__form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span className="form-field__label">Nome squadra / club *</span>
            <input
              className="input"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="es. Pallavolo Milano ASD"
              autoFocus
            />
          </label>

          <label className="form-field">
            <span className="form-field__label">Stagione *</span>
            <input
              className="input"
              value={seasonName}
              onChange={e => setSeasonName(e.target.value)}
              placeholder="2025/2026"
            />
          </label>

          <label className="form-field">
            <span className="form-field__label">Tuo nome (analista) *</span>
            <input
              className="input"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              placeholder="es. Mario Rossi"
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
            {loading ? 'Configurazione in corso…' : 'Inizia'}
          </button>
        </form>
      </div>
    </div>
  );
}
