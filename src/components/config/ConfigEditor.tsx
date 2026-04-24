import { useState } from 'react';
import { AttackCombinationsTab } from './AttackCombinationsTab';
import { SetterCallsTab } from './SetterCallsTab';
import { ShortcutsTab } from './ShortcutsTab';
import { CloudTab } from './CloudTab';

type TopTab = 'indice' | 'effetti' | 'composti';
type BotTab = 'combinazioni' | 'chiamate' | 'efficienza';

interface Props {
  orgId: string;
  onClose: () => void;
}

export function ConfigEditor({ orgId, onClose }: Props) {
  const [topTab, setTopTab] = useState<TopTab>('composti');
  const [botTab, setBotTab] = useState<BotTab>('combinazioni');

  const activeContent = topTab === 'indice'
    ? 'indice'
    : topTab === 'effetti'
      ? 'effetti'
      : botTab; // 'composti' row shows sub-tabs

  return (
    <div className="dialog-overlay">
      <div className="tabelle-window">

        {/* Title bar */}
        <div className="ni-titlebar">
          <span>Tabelle — La mia stagione</span>
          <button className="ni-titlebar__close" onClick={onClose}>✕</button>
        </div>

        {/* Top tabs row */}
        <div className="tabelle-tabs tabelle-tabs--top">
          {([
            ['indice',   'Pesi per Indice personalizzato (Indice)'],
            ['effetti',  'Effetti per punto'],
            ['composti', 'Codici composti'],
          ] as [TopTab, string][]).map(([t, label]) => (
            <button
              key={t}
              className={`tabelle-tab ${topTab === t ? 'tabelle-tab--active' : ''}`}
              onClick={() => setTopTab(t)}
            >{label}</button>
          ))}
        </div>

        {/* Bottom tabs row (only when top = composti) */}
        {topTab === 'composti' && (
          <div className="tabelle-tabs tabelle-tabs--bot">
            {([
              ['combinazioni', 'Combinazioni attacco'],
              ['chiamate',     'Chiamate palleggiatore (basi)'],
              ['efficienza',   'Efficienza'],
            ] as [BotTab, string][]).map(([t, label]) => (
              <button
                key={t}
                className={`tabelle-tab tabelle-tab--bot ${botTab === t ? 'tabelle-tab--active' : ''}`}
                onClick={() => setBotTab(t)}
              >{label}</button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="tabelle-body">
          {activeContent === 'combinazioni' && <AttackCombinationsTab orgId={orgId} />}
          {activeContent === 'chiamate'     && <SetterCallsTab orgId={orgId} />}
          {activeContent === 'efficienza'   && <EfficienzaPlaceholder />}
          {activeContent === 'indice'       && <IndicePlaceholder />}
          {activeContent === 'effetti'      && <EffettiPlaceholder />}
        </div>

        {/* Footer */}
        <div className="tabelle-footer">
          <button className="ni-btn ni-btn--ok" onClick={onClose}>Ok</button>
          <button className="ni-btn ni-btn--cancel" onClick={onClose}>Annulla</button>
        </div>
      </div>
    </div>
  );
}

function IndicePlaceholder() {
  return (
    <div className="tabelle-placeholder">
      <p>Pesi per Indice personalizzato</p>
      <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>Configurazione avanzata pesi valutazione</p>
    </div>
  );
}
function EffettiPlaceholder() {
  return (
    <div className="tabelle-placeholder">
      <p>Effetti per punto</p>
      <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>Definizione effetti assegnati al punto</p>
    </div>
  );
}
function EfficienzaPlaceholder() {
  return (
    <div className="tabelle-placeholder">
      <p>Efficienza</p>
      <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>Tabella coefficienti efficienza per skill/qualità</p>
    </div>
  );
}

// Keep ShortcutsTab and CloudTab accessible via config (not shown in Tabelle window directly)
export { ShortcutsTab, CloudTab };
