interface Props {
  onClose: () => void;
}

export function SplashScreen({ onClose }: Props) {
  return (
    <div className="splash-overlay" onClick={onClose}>
      <div className="splash-modal" onClick={e => e.stopPropagation()}>

        {/* Logo */}
        <div className="splash-logo-area">
          <div className="splash-logo">
            <span className="splash-logo__vsp">VSP</span>
          </div>
          <h1 className="splash-app-name">VolleyScoutPro</h1>
          <p className="splash-tagline">Software professionale di scouting pallavolo</p>
          <div className="splash-version">Versione 0.1.5</div>
        </div>

        <div className="splash-divider" />

        {/* Company info */}
        <div className="splash-company">
          <div className="splash-company__name">BlackFox Media</div>
          <div className="splash-company__desc">Soluzioni software per lo sport professionistico</div>

          <div className="splash-contacts">
            <div className="splash-contact-row">
              <span className="splash-contact-label">Sito web</span>
              <span className="splash-contact-value">www.blackfoxmedia.agency</span>
            </div>
            <div className="splash-contact-row">
              <span className="splash-contact-label">Email</span>
              <span className="splash-contact-value">info@blackfoxmedia.agency</span>
            </div>
            <div className="splash-contact-row">
              <span className="splash-contact-label">Helpdesk</span>
              <span className="splash-contact-value">support@blackfoxmedia.agency</span>
            </div>
            <div className="splash-contact-row">
              <span className="splash-contact-label">Telefono</span>
              <span className="splash-contact-value">+39 02 1234 5678</span>
            </div>
          </div>

          <div className="splash-support-note">
            Per assistenza tecnica invia una email all'helpdesk indicando<br />
            il tuo nome, la versione del software e una descrizione del problema.
          </div>
        </div>

        <div className="splash-divider" />

        {/* Footer */}
        <div className="splash-footer">
          <span className="splash-copyright">© 2025 BlackFox Media. Tutti i diritti riservati.</span>
          <button className="splash-close-btn" onClick={onClose}>Inizia</button>
        </div>

      </div>
    </div>
  );
}
