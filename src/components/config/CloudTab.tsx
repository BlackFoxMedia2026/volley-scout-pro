import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function CloudTab() {
  const [url, setUrl]         = useState('');
  const [anon, setAnon]       = useState('');
  const [service, setService] = useState('');
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');

  const handleSave = async () => {
    if (!url || !anon || !service) { setError('Tutti i campi sono obbligatori'); return; }
    try {
      await invoke('save_cloud_credentials', {
        creds: { supabase_url: url, anon_key: anon, service_key: service },
      });
      setSaved(true);
      setError('');
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="cloud-tab">
      <p className="cloud-tab__info">
        Configura le credenziali Supabase per abilitare la condivisione partite online.
        Le chiavi vengono salvate localmente nel database dell&apos;app (non nel codice sorgente).
      </p>

      <div className="cloud-tab__form">
        <label className="form-label">
          Supabase URL
          <input
            className="form-input form-input--mono"
            value={url}
            placeholder="https://xyzabcdef.supabase.co"
            onChange={e => { setUrl(e.target.value); setSaved(false); }}
          />
        </label>
        <label className="form-label">
          Anon Key (pubblica)
          <input
            className="form-input form-input--mono"
            value={anon}
            placeholder="eyJhbGciOiJIUzI1NiIs..."
            onChange={e => { setAnon(e.target.value); setSaved(false); }}
          />
        </label>
        <label className="form-label">
          Service Role Key (privata — non condividere)
          <input
            className="form-input form-input--mono"
            type="password"
            value={service}
            placeholder="eyJhbGciOiJIUzI1NiIs..."
            onChange={e => { setService(e.target.value); setSaved(false); }}
          />
        </label>

        {error && <p className="form-error">{error}</p>}
        {saved && <p className="form-success">Credenziali salvate.</p>}

        <button className="btn btn--primary" onClick={handleSave}>Salva credenziali</button>
      </div>

      <div className="cloud-tab__info-box">
        <h3>Come condividere una partita</h3>
        <ol>
          <li>Apri la partita → menu azioni → <strong>Condividi online</strong></li>
          <li>L&apos;app carica i dati su Supabase e genera un link breve</li>
          <li>Condividi il link: <code>https://dashboard.volleyscoutpro.io/abc12xyz</code></li>
          <li>Chiunque con il link può vedere le statistiche senza login</li>
        </ol>
      </div>
    </div>
  );
}
