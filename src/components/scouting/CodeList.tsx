import { useConfigStore } from '@/stores/configStore';
import { SKILL_LABELS, QUALITY_LABELS } from '@/types/dv4';

// Quadro Elenco Codici — DV4-style reference panel shown during live scouting.
// Keyboard-only: the scout glances at this column to recall codes without clicking anything.

const QUALITY_CSS: Record<string, string> = {
  '#': 'excellent', '+': 'positive', '!': 'ok', '-': 'negative', '/': 'poor', '=': 'error',
};

const SERVE_TYPES = [
  { code: 'H', desc: 'Corta/Salto' },
  { code: 'M', desc: 'Float' },
  { code: 'Q', desc: 'Potente' },
  { code: 'T', desc: 'Tensione' },
];

const RECEPTION_TYPES = [
  { code: 'O', desc: 'Bagher' },
  { code: 'P', desc: 'Piattaforma' },
  { code: 'E', desc: 'Dita' },
];

const ATTACK_TYPES = [
  { code: 'H', desc: 'Hard spike' },
  { code: 'P', desc: 'Soft/Tip' },
  { code: 'T', desc: 'Tip' },
  { code: 'B', desc: 'Mani-fuori' },
];

const AUTO_CODES = [
  { code: '*z1', desc: 'Err. rotazione z1' },
  { code: '*z2', desc: 'Err. rotazione z2' },
  { code: '*z3', desc: 'Err. rotazione z3' },
  { code: '*z4', desc: 'Err. rotazione z4' },
  { code: '*z5', desc: 'Err. rotazione z5' },
  { code: '*z6', desc: 'Err. rotazione z6' },
  { code: '*p',  desc: 'Libero contatto ill.' },
  { code: '*c',  desc: 'Cartellino allenatore' },
  { code: '*P',  desc: 'Penetrazione' },
];

export function CodeList() {
  const { attackCombinations, setterCalls } = useConfigStore();
  const activeCombos = attackCombinations.filter(c => c.isActive);
  const activeCalls  = setterCalls.filter(c => c.isActive);

  return (
    <div className="code-list" aria-label="Elenco codici DV4">
      <div className="code-list__heading">Elenco Codici</div>

      {/* ─── Format reminder ─────────────────── */}
      <Section title="Formato DV4">
        <div className="code-list__format">
          <span className="code-list__fmt-part code-list__fmt-part--team">*/a</span>
          <span className="code-list__fmt-part code-list__fmt-part--num">NN</span>
          <span className="code-list__fmt-part code-list__fmt-part--skill">S</span>
          <span className="code-list__fmt-part">[T]</span>
          <span className="code-list__fmt-part code-list__fmt-part--quality">[Q]</span>
          <span className="code-list__fmt-part">[CB][Z][Z]</span>
        </div>
        <div className="code-list__fmt-legend">
          *=Casa (auto) · a=Ospiti · NN=maglia · S=skill · T=tipo · Q=qualità
        </div>
        <div className="code-list__fmt-legend">
          Fine Azione: <strong>,</strong>=Punto Casa · <strong>&lt;</strong>=Punto Ospiti
        </div>
      </Section>

      {/* ─── Skills ──────────────────────────── */}
      <Section title="Azioni (S)">
        {(Object.entries(SKILL_LABELS) as [string, string][]).map(([k, v]) => (
          <Row key={k} code={k} desc={v} />
        ))}
      </Section>

      {/* ─── Quality ─────────────────────────── */}
      <Section title="Qualità (Q)">
        {(Object.entries(QUALITY_LABELS) as [string, string][]).map(([k, v]) => (
          <Row key={k} code={k} desc={v} qualityCss={QUALITY_CSS[k]} />
        ))}
      </Section>

      {/* ─── Serve types ─────────────────────── */}
      <Section title="Tipo battuta">
        {SERVE_TYPES.map(t => <Row key={t.code} code={t.code} desc={t.desc} />)}
      </Section>

      {/* ─── Reception types ─────────────────── */}
      <Section title="Tipo ricezione">
        {RECEPTION_TYPES.map(t => <Row key={t.code} code={t.code} desc={t.desc} />)}
      </Section>

      {/* ─── Attack types ────────────────────── */}
      <Section title="Tipo attacco">
        {ATTACK_TYPES.map(t => <Row key={t.code} code={t.code} desc={t.desc} />)}
      </Section>

      {/* ─── Attack combinations ─────────────── */}
      {activeCombos.length > 0 && (
        <Section title="Combinazioni attacco">
          {activeCombos.map(c => (
            <Row key={c.id} code={c.code} desc={c.description}
              badge={c.attackerPosition ?? undefined} />
          ))}
        </Section>
      )}

      {/* ─── Setter calls ────────────────────── */}
      {activeCalls.length > 0 && (
        <Section title="Chiamate alzatore">
          {activeCalls.map(c => (
            <Row key={c.id} code={c.code} desc={c.description}
              dotColor={c.colorHex} />
          ))}
        </Section>
      )}

      {/* ─── Zones ───────────────────────────── */}
      <Section title="Zone campo">
        <div className="code-list__zone-grid">
          {[4,3,2,5,6,1,7,8,9].map(z => (
            <div key={z} className="code-list__zone-cell">{z}</div>
          ))}
        </div>
        <div className="code-list__fmt-legend">Vista dal lato casa (z1=serve)</div>
      </Section>

      {/* ─── Auto codes ──────────────────────── */}
      <Section title="Codici automatici">
        {AUTO_CODES.map(a => <Row key={a.code} code={a.code} desc={a.desc} />)}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="code-list__section">
      <div className="code-list__section-title">{title}</div>
      {children}
    </div>
  );
}

function Row({ code, desc, qualityCss, badge, dotColor }: {
  code: string;
  desc: string;
  qualityCss?: string;
  badge?: string;
  dotColor?: string;
}) {
  return (
    <div className="code-list__row">
      <span className={`code-list__code ${qualityCss ? `code-list__code--q-${qualityCss}` : ''}`}>
        {code}
      </span>
      <span className="code-list__desc">{desc}</span>
      {badge && <span className="code-list__badge">{badge}</span>}
      {dotColor && <span className="code-list__dot" style={{ background: dotColor }} />}
    </div>
  );
}
