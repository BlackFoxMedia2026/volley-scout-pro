import { useMemo } from 'react';
import { useMatchStore } from '@/stores/matchStore';
import { SKILL_LABELS, QUALITY_LABELS } from '@/types/dv4';
import type { ParsedCode, Skill } from '@/types/dv4';
import { computeTeamStats } from '@/lib/analytics/stats';

const ZONE_NAMES: Record<number, string> = {
  1: 'Z1', 2: 'Z2', 3: 'Z3', 4: 'Z4', 5: 'Z5',
  6: 'Z6', 7: 'Z7', 8: 'Z8', 9: 'Z9',
};

const SKILL_TYPE_LABELS: Record<string, string> = {
  H: 'Flot', M: 'T/S', Q: 'Semi', T: 'Tensor', U: 'Jump', N: 'N/A', O: 'Under',
  P: 'Pipe', E: 'Shoot', B: 'Bic', C: 'Cut', S: 'Spike',
};

const SKILL_TYPE_HINTS: Record<Skill, string> = {
  S: 'H=Flot M=T/S Q=Semi T=Tensor U=Jump O=Under',
  R: 'H=Alta O=Bassa P=Pipe',
  A: 'H=Hard P=Pipe T=Tip S=Spike B=Bic C=Cut E=Shoot O=Palla',
  B: '1-3=bloccat C=Cop P=Punt B=Sbrac',
  D: 'H=Picch P=Piatt T=Bagher C=Coll O=Palla',
  E: 'H=Mano O=Tocco P=Pipe S=Ret B=Bas C=Cop T=Teso',
  F: 'H=Hard P=Morbida T=Tip O=Palla',
};

const QUALITY_HINT = '= Err / Neg - Neg ! OK + Pos # Kill';

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function CodeBar() {
  const codeBuffer   = useMatchStore(s => s.codeBuffer);
  const lastParsed   = useMatchStore(s => s.lastParsed);
  const error        = useMatchStore(s => s.error);
  const videoCurrentMs = useMatchStore(s => s.videoCurrentMs);
  const isPaused     = useMatchStore(s => s.isPaused);
  const events       = useMatchStore(s => s.events);
  const appendCode   = useMatchStore(s => s.appendCode);
  const submitCode   = useMatchStore(s => s.submitCode);

  // Live efficiency badge for the currently-typed team+skill
  const liveEff = useMemo(() => {
    if (!lastParsed?.skill || !lastParsed.teamSide) return null;
    const teamStats = computeTeamStats(events, lastParsed.teamSide);
    const skillStat = teamStats.bySkill[lastParsed.skill];
    if (!skillStat || skillStat.total < 3) return null;
    return { eff: skillStat.efficiency, total: skillStat.total };
  }, [events, lastParsed?.skill, lastParsed?.teamSide]);

  return (
    <div className="code-bar">
      {/* Current buffer */}
      <div className="code-bar__buffer" aria-live="polite" aria-label="codice corrente">
        {codeBuffer || <span className="code-bar__placeholder">pronto…</span>}
        {lastParsed && !lastParsed.quality && !lastParsed.skillType && lastParsed.playerNumber > 0 && codeBuffer.length <= 3 && (
          <span className="code-bar__auto-badge" title="Battuta automatica">AUTO</span>
        )}
      </div>

      {/* Live parsed feedback */}
      {lastParsed && (
        <div className="code-bar__feedback">
          <span className={`code-bar__chip code-bar__chip--team ${lastParsed.teamSide === 'home' ? 'code-bar__chip--home' : 'code-bar__chip--away'}`}>
            {lastParsed.teamSide === 'home' ? 'Casa' : 'Osp'}
          </span>

          {lastParsed.playerNumber > 0 && (
            <span className="code-bar__chip"># {lastParsed.playerNumber}</span>
          )}

          <span className="code-bar__chip code-bar__chip--skill">
            {SKILL_LABELS[lastParsed.skill] ?? lastParsed.skill}
          </span>

          {liveEff !== null && (
            <span
              className={`code-bar__live-eff ${liveEff.eff >= 20 ? 'code-bar__live-eff--good' : liveEff.eff >= 0 ? 'code-bar__live-eff--mid' : 'code-bar__live-eff--bad'}`}
              title={`Eff. partita su ${liveEff.total} azioni`}
            >
              {liveEff.eff > 0 ? '+' : ''}{liveEff.eff}%
            </span>
          )}

          {lastParsed.skillType && (
            <span className="code-bar__chip">
              {SKILL_TYPE_LABELS[lastParsed.skillType] ?? lastParsed.skillType}
            </span>
          )}

          {lastParsed.quality && (
            <span className={`code-bar__chip code-bar__chip--quality code-bar__chip--q-${qualityClass(lastParsed.quality)}`}>
              {QUALITY_LABELS[lastParsed.quality]}
            </span>
          )}

          {lastParsed.combination && !lastParsed.isSetterCall && (
            <span className="code-bar__chip code-bar__chip--combo">
              {lastParsed.combination}
            </span>
          )}

          {lastParsed.isSetterCall && lastParsed.setterCallCode && (
            <span className="code-bar__chip code-bar__chip--setter">
              Alzata {lastParsed.setterCallCode}
            </span>
          )}

          {lastParsed.zoneFrom != null && (
            <span className="code-bar__chip code-bar__chip--zone">
              da {ZONE_NAMES[lastParsed.zoneFrom] ?? lastParsed.zoneFrom}
            </span>
          )}

          {lastParsed.zoneTo != null && (
            <span className="code-bar__chip code-bar__chip--zone">
              → {ZONE_NAMES[lastParsed.zoneTo] ?? lastParsed.zoneTo}
              {lastParsed.zoneToSub ?? ''}
            </span>
          )}

          {lastParsed.isCompound && (
            <span className="code-bar__chip code-bar__chip--compound">
              +{lastParsed.compoundPair?.skill ?? '?'}
            </span>
          )}

          {lastParsed.isAutoCode && (
            <span className="code-bar__chip code-bar__chip--auto">AUTO</span>
          )}
        </div>
      )}

      {/* Parse error */}
      {error && (
        <div className="code-bar__error" role="alert">{error}</div>
      )}

      {/* Contextual hint for next input */}
      {!error && lastParsed && (
        <div className="code-bar__next-hint">
          {nextHint(lastParsed)}
        </div>
      )}
      {!lastParsed && !codeBuffer && (
        <div className="code-bar__next-hint">
          <strong>*</strong>=Casa (auto) &nbsp; <strong>a</strong>=Ospiti &nbsp; poi maglia + skill (S R A B D E F) &nbsp;|&nbsp; <strong>,</strong>=Punto Casa &nbsp; <strong>&lt;</strong>=Punto Osp
        </div>
      )}

      {/* Clickable suggestion chips — Skill type (shown after skill, before type) */}
      {!error && lastParsed && lastParsed.skill && !lastParsed.skillType && !lastParsed.quality && (
        <div className="code-bar__suggestions">
          {skillTypeButtons(lastParsed.skill).map(({ code, label }) => (
            <button
              key={code}
              className="code-bar__suggest-chip code-bar__suggest-chip--type"
              onClick={() => appendCode(code)}
              tabIndex={-1}
              title={label}
            >
              {code} <span className="code-bar__suggest-label">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Quality chips (shown after type) */}
      {!error && lastParsed && lastParsed.skillType && !lastParsed.quality && (
        <div className="code-bar__suggestions">
          {(['#', '+', '!', '-', '/', '='] as const).map(q => (
            <button
              key={q}
              className={`code-bar__suggest-chip code-bar__suggest-chip--q code-bar__suggest-chip--q-${qualityClass(q)}`}
              onClick={() => appendCode(q)}
              tabIndex={-1}
              title={QUALITY_LABELS[q]}
            >
              {q}
            </button>
          ))}
        </div>
      )}
      {!error && lastParsed && lastParsed.quality && lastParsed.zoneFrom == null && (
        <div className="code-bar__suggestions">
          {[1,2,3,4,5,6,7,8,9].map(z => (
            <button
              key={z}
              className="code-bar__suggest-chip code-bar__suggest-chip--zone"
              onClick={() => appendCode(String(z))}
              tabIndex={-1}
              title={`Zona ${z}`}
            >
              Z{z}
            </button>
          ))}
        </div>
      )}
      {!error && lastParsed && lastParsed.quality && lastParsed.zoneFrom != null && lastParsed.zoneTo == null && (
        <div className="code-bar__suggestions">
          {[1,2,3,4,5,6,7,8,9].map(z => (
            <button
              key={z}
              className="code-bar__suggest-chip code-bar__suggest-chip--zone"
              onClick={() => appendCode(String(z))}
              tabIndex={-1}
              title={`Zona arrivo ${z}`}
            >
              →Z{z}
            </button>
          ))}
          <button
            className="code-bar__suggest-chip code-bar__suggest-chip--submit"
            onClick={() => submitCode()}
            tabIndex={-1}
          >
            ↵ invia
          </button>
        </div>
      )}

      {/* Bottom row: keyboard hints + video time */}
      <div className="code-bar__footer">
        <div className="code-bar__hints">
          <kbd>Enter</kbd> invia &nbsp;
          <kbd>Esc</kbd> cancella &nbsp;
          <kbd>⌫</kbd> correggi &nbsp;
          <kbd>⌘Z</kbd> annulla &nbsp;
          <kbd>,</kbd> Casa &nbsp;
          <kbd>&lt;</kbd> Osp &nbsp;
          <kbd>F4</kbd> pausa &nbsp;
          <kbd>F7</kbd> TO-H &nbsp;
          <kbd>F8</kbd> TO-A &nbsp;
          <kbd>F9</kbd> nota &nbsp;
          <kbd>F10</kbd> ±Pt &nbsp;
          <span className="code-bar__hint-cmd">FORM ROT VER T aT P5 aP5 C6.7 aC6.7 S aS NOTE FINE STOP</span>
        </div>

        {isPaused && (
          <div className="code-bar__paused-badge">⏸ PAUSA</div>
        )}

        {videoCurrentMs != null && (
          <div className="code-bar__video-ts" title="Posizione video corrente">
            🎬 {formatMs(videoCurrentMs)}
          </div>
        )}
      </div>
    </div>
  );
}

function nextHint(parsed: ParsedCode): string | null {
  if (parsed.isAutoCode) return 'Codice automatico — premi Enter per registrare';
  if (parsed.quality) {
    if (parsed.zoneFrom == null) return 'Zona partenza (1-9), o Enter per inviare';
    if (parsed.zoneTo == null) return `Zona arrivo (1-9), o Enter`;
    return 'Enter per inviare, o aggiungi estensioni';
  }
  if (parsed.skillType) return `Qualità: ${QUALITY_HINT}`;
  if (parsed.skill) {
    const hint = SKILL_TYPE_HINTS[parsed.skill];
    return hint ? `Tipo: ${hint} — poi qualità (= / - ! + #)` : `Qualità: ${QUALITY_HINT}`;
  }
  return 'Skill: S=Battuta R=Ric A=Att B=Muro D=Dif E=Alz F=Free';
}

function skillTypeButtons(skill: string): { code: string; label: string }[] {
  const MAP: Record<string, { code: string; label: string }[]> = {
    S: [
      { code: 'H', label: 'Float' },
      { code: 'M', label: 'Top-spin' },
      { code: 'Q', label: 'Semi' },
      { code: 'T', label: 'Tensor' },
      { code: 'U', label: 'Jump' },
      { code: 'O', label: 'Under' },
    ],
    R: [
      { code: 'H', label: 'Alta' },
      { code: 'O', label: 'Bassa' },
      { code: 'P', label: 'Pipe' },
    ],
    A: [
      { code: 'H', label: 'Hard' },
      { code: 'P', label: 'Pipe' },
      { code: 'T', label: 'Tip' },
      { code: 'S', label: 'Spike' },
      { code: 'B', label: 'Bic' },
      { code: 'C', label: 'Cut' },
      { code: 'E', label: 'Shoot' },
      { code: 'O', label: 'Palla' },
    ],
    B: [
      { code: '1', label: 'Tocco×1' },
      { code: '2', label: 'Tocco×2' },
      { code: '3', label: 'Tocco×3' },
      { code: 'C', label: 'Cop' },
      { code: 'P', label: 'Punt' },
      { code: 'B', label: 'Sbrac' },
    ],
    D: [
      { code: 'H', label: 'Picch' },
      { code: 'P', label: 'Piatto' },
      { code: 'T', label: 'Bagher' },
      { code: 'C', label: 'Coll' },
      { code: 'O', label: 'Palla' },
    ],
    E: [
      { code: 'H', label: 'Mano' },
      { code: 'O', label: 'Tocco' },
      { code: 'P', label: 'Pipe' },
      { code: 'S', label: 'Ret' },
      { code: 'B', label: 'Bas' },
      { code: 'C', label: 'Cop' },
      { code: 'T', label: 'Teso' },
    ],
    F: [
      { code: 'H', label: 'Hard' },
      { code: 'P', label: 'Morbida' },
      { code: 'T', label: 'Tip' },
      { code: 'O', label: 'Palla' },
    ],
  };
  return MAP[skill] ?? [];
}

function qualityClass(q: string): string {
  switch (q) {
    case '#': return 'excellent';
    case '+': return 'positive';
    case '!': return 'ok';
    case '-': return 'negative';
    case '/': return 'poor';
    case '=': return 'error';
    default:  return 'neutral';
  }
}
