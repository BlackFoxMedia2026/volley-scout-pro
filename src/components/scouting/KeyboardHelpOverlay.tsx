interface Props {
  onClose: () => void;
}

const SECTIONS = [
  {
    title: 'Formato codice DV4',
    rows: [
      ['Team', '* = Casa (auto-inserito)   a = Ospiti'],
      ['Numero', '01–99 (2 cifre, es. a05 = Ospiti #5)'],
      ['Senza prefisso', 'Solo il numero = Casa automatico (es. 05S# = Casa #5 Ace)'],
      ['Skill', 'S=Battuta  R=Ricezione  A=Attacco  B=Muro  D=Difesa  E=Alzata  F=Free'],
      ['Tipo', 'H=Float  Q=Semi  M=Top  T=Tensor  U=Jump (battuta)'],
      ['Qualità', '#=Ace/Kill  +=Positivo  !=Ok  -=Negativo  /=Scarso  ==Errore'],
      ['Zone', '1-9 (da zona / a zona, es. 56B)'],
      ['Combinazione', 'X5 V6 P2 … oppure K1-K9 per chiamata palleggiatore'],
    ],
  },
  {
    title: 'Fine Azione (punto)',
    rows: [
      [',', 'Punto Casa — Fine Azione (tasto DV4 destra)'],
      ['<', 'Punto Ospiti — Fine Azione (tasto DV4 sinistra)'],
      ['F5', 'Punto manuale Casa (alternativo)'],
      ['F6', 'Punto manuale Ospiti (alternativo)'],
    ],
  },
  {
    title: 'Tasti rapidi',
    rows: [
      ['F1', 'Apri/chiudi questa guida'],
      ['F4', 'Pausa / Riprendi scouting (blocca input)'],
      ['F7', 'Timeout Casa'],
      ['F8', 'Timeout Ospiti'],
      ['F9', 'Aggiungi nota'],
      ['F10', 'Correggi punteggio (errore di conteggio)'],
      ['Enter', 'Conferma codice'],
      ['Backspace', 'Cancella ultimo carattere'],
      ['Esc', 'Cancella buffer'],
      ['Ctrl+Z', 'Annulla ultimo evento'],
      ['Click giocatore', 'Inserisce prefisso nel buffer (es. *08 per Casa #8)'],
    ],
  },
  {
    title: 'Codici auto',
    rows: [
      ['*z1…*z6', 'Punto zona n (battuta/attacco rapido)'],
      ['*p', 'Punto (rally vinto dalla squadra che batte)'],
      ['*c', 'Challenge (richiesta video check)'],
    ],
  },
  {
    title: 'Quadro Comando (digita + Enter)',
    rows: [
      ['FORM', 'Apri inserimento formazione'],
      ['ROT', 'Mostra/nascondi pannello rotazioni'],
      ['VER', 'Verifica codici errati'],
      ['NOTE', 'Inserisci commento/nota'],
      ['FINE', 'Salva e torna alla lista partite'],
      ['STOP', 'Pausa / Riprendi scouting'],
      ['T', 'Timeout tecnico Casa'],
      ['aT', 'Timeout tecnico Ospiti'],
      ['P5', 'Imposta palleggiatore Casa → #5'],
      ['aP5', 'Imposta palleggiatore Ospiti → #5'],
      ['C6.7', 'Cambio Casa: esce #6, entra #7'],
      ['aC6.7', 'Cambio Ospiti: esce #6, entra #7'],
      ['S', 'Assegna battuta a Casa'],
      ['aS', 'Assegna battuta a Ospiti'],
      ['AGGIO', 'Aggiornamento statistiche (no-op in VSP)'],
    ],
  },
  {
    title: 'Battuta automatica',
    rows: [
      ['Dopo punto', 'Il buffer si pre-compila col numero del prossimo servitore (badge AUTO)'],
      ['', 'Aggiungi skill e qualità per completare il codice (es. S# per ace)'],
    ],
  },
  {
    title: 'Normalizzazione',
    rows: [
      ['Tipo skill', 'Se omesso, viene applicato il default DV4: S/R/A/D/E/F→H, B→1'],
      ['Codice composto', 'Usa il punto: a05S+.a09A# (battuta positiva + attacco ace)'],
    ],
  },
];

export function KeyboardHelpOverlay({ onClose }: Props) {
  return (
    <div className="kb-help-overlay" onClick={onClose}>
      <div className="kb-help-card" onClick={e => e.stopPropagation()}>
        <div className="kb-help-header">
          <h2 className="kb-help-title">Guida rapida — VolleyScoutPro</h2>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>✕</button>
        </div>
        {SECTIONS.map(sec => (
          <section key={sec.title} className="kb-help-section">
            <h3 className="kb-help-section-title">{sec.title}</h3>
            <table className="kb-help-table">
              <tbody>
                {sec.rows.map(([key, desc]) => (
                  <tr key={key}>
                    <td className="kb-help-key"><span className="code-badge">{key}</span></td>
                    <td className="kb-help-desc">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <p className="kb-help-footer">Premi F1 o clicca fuori per chiudere</p>
      </div>
    </div>
  );
}
