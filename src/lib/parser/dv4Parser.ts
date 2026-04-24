import type {
  ParsedCode, ParseResult, ParseError, Skill, Quality, AutoCode, SetterCallCode,
} from '@/types/dv4';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const SKILLS = new Set<Skill>(['S', 'R', 'A', 'B', 'D', 'E', 'F']);
const QUALITIES = new Set<Quality>(['=', '/', '-', '!', '+', '#']);
const SETTER_CALL_RE = /^K[1-9]$/;
const AUTO_CODES = new Set<AutoCode>(['*z1','*z2','*z3','*z4','*z5','*z6','*p','*c','*P','$&H=']);
const ZONE_CHARS = new Set(['1','2','3','4','5','6','7','8','9']);
const ZONE_SUB = new Set(['A','B','C','D']);

// Valid skill types per skill (DV4 manual)
const SKILL_TYPES: Record<Skill, Set<string>> = {
  S: new Set(['H','M','Q','T','U','N','O']), // serve types
  R: new Set(['H','O','P']),                  // reception types
  A: new Set(['H','P','T','S','B','C','E','O']), // attack types
  B: new Set(['1','2','3','C','P','B']),      // block types
  D: new Set(['H','P','T','C','O']),          // dig types
  E: new Set(['H','O','P','S','B','C','T']), // set types
  F: new Set(['H','P','T','O']),              // freeball types
};

// ─────────────────────────────────────────────
// STAGE 1 — Tokenise / split compound code
// ─────────────────────────────────────────────

function splitCompound(raw: string): [string, string | null] {
  const dotIdx = raw.indexOf('.');
  if (dotIdx === -1) return [raw, null];
  return [raw.slice(0, dotIdx), raw.slice(dotIdx + 1)];
}

// ─────────────────────────────────────────────
// STAGE 2 — Normalise & resolve shortcuts
// ─────────────────────────────────────────────

function normalise(raw: string): string {
  // Remove leading/trailing whitespace, uppercase skill/quality chars
  // Keep case for player numbers and combination codes (some are lowercase in DV4)
  return raw.trim();
}

// ─────────────────────────────────────────────
// STAGE 3 — Auto code detection
// ─────────────────────────────────────────────

function tryParseAutoCode(raw: string): ParseResult | null {
  if (AUTO_CODES.has(raw as AutoCode)) {
    const base = emptyParsed(raw);
    base.isAutoCode = true;
    base.autoCode = raw as AutoCode;
    // Auto codes don't have a team/player — they're match-level events
    // We set fake values to satisfy the type
    base.teamSide = 'home'; // caller should override from context
    base.playerNumber = 0;
    base.skill = 'S' as Skill; // placeholder, unused for auto codes
    return { ok: true, value: base };
  }
  return null;
}

// ─────────────────────────────────────────────
// STAGE 4 — Main positional parser
// ─────────────────────────────────────────────

// DV4 positional format (0-indexed):
//  0     : team indicator (** or *a or letter-based; we use 'a'=home, 'b'=away)
//  1-2   : player number (2 digits, zero-padded)
//  3     : skill (S R A B D E F)
//  4     : skill type (H M Q T U N O P E B C S)
//  5     : quality (= / - ! + #)
//  6-7   : combination or setter call (2 chars)
//  8     : zone from (1-9)
//  9     : zone to (1-9)
//  10    : zone to sub (A B C D)
//  11-12 : end zone plus (2 chars)
//  13    : ext type
//  14    : ext blockers
//  15    : ext special
//  16    : ext flag
//  17-21 : custom (up to 5 chars)
//
// In practice users often enter abbreviated codes: "aXXS+", "a01S#"
// The parser is lenient on trailing fields.

function parseSingle(raw: string): ParseResult {
  const errors: ParseError[] = [];
  const partial = emptyParsed(raw);
  let pos = 0;

  // ── team ──────────────────────────────────────
  if (pos >= raw.length) {
    errors.push({ code: 'MALFORMED_CODE', message: 'Code is empty', position: 0 });
    return { ok: false, errors, partial };
  }

  // DV4 standard: * = Casa (auto-inserito), a = Ospiti
  // Se il primo char è una cifra, si assume Casa (come DV4 con auto-insert)
  const firstChar = raw[pos];
  if (firstChar === '*') {
    partial.teamSide = 'home';
    pos++;
  } else if (firstChar === 'a' || firstChar === 'A') {
    // 'a' minuscolo/maiuscolo = Ospiti (DV4 standard)
    // Distinguiamo da skill 'A' (Attacco) verificando che sia la prima posizione
    partial.teamSide = 'away';
    pos++;
  } else if (/\d/.test(firstChar)) {
    // Nessun prefisso = Casa (DV4 auto-insert)
    partial.teamSide = 'home';
    // Non avanzare pos — il char è l'inizio del numero maglia
  } else {
    errors.push({ code: 'INVALID_TEAM', message: `Indicatore squadra non valido '${raw[pos]}' (usa *=Casa, a=Ospiti, o inizia col numero)`, position: pos });
    partial.teamSide = 'home';
    // Do NOT advance pos — the char might be a player number
  }

  // ── player number (0-2 digits, optional) ─────
  let numStr = '';
  if (pos < raw.length && /\d/.test(raw[pos])) {
    numStr += raw[pos++];
    if (pos < raw.length && /\d/.test(raw[pos])) {
      numStr += raw[pos++];
    }
  }
  // Player number is optional in fast-entry mode — default to 0
  partial.playerNumber = numStr.length > 0 ? parseInt(numStr, 10) : 0;

  // ── skill ─────────────────────────────────────
  if (pos >= raw.length) {
    errors.push({ code: 'INVALID_SKILL', message: 'Missing skill character', position: pos });
    return { ok: false, errors, partial };
  }
  const skillChar = raw[pos].toUpperCase();
  if (!SKILLS.has(skillChar as Skill)) {
    errors.push({ code: 'INVALID_SKILL', message: `Unknown skill '${raw[pos]}'`, position: pos });
  } else {
    partial.skill = skillChar as Skill;
  }
  pos++;

  // ── skill type ────────────────────────────────
  // Skip if next two chars look like a setter call (K1-K9) — those belong in combination slot
  if (pos < raw.length && raw[pos] !== undefined) {
    const c = raw[pos];
    const nextTwo = raw.slice(pos, pos + 2).toUpperCase();
    const looksLikeSetterCall = SETTER_CALL_RE.test(nextTwo);
    if (!looksLikeSetterCall && !QUALITIES.has(c as Quality) && !ZONE_CHARS.has(c) && c !== '.') {
      const typeChar = c.toUpperCase();
      partial.skillType = typeChar;
      // Warn if type is not valid for this skill, but don't fail
      const validTypes = partial.skill ? SKILL_TYPES[partial.skill] : null;
      if (validTypes && !validTypes.has(typeChar)) {
        errors.push({
          code: 'INVALID_SKILL',
          message: `Tipo '${typeChar}' non valido per skill '${partial.skill}'`,
          position: pos,
        });
      }
      pos++;
    }
  }

  // ── quality ───────────────────────────────────
  if (pos < raw.length && QUALITIES.has(raw[pos] as Quality)) {
    partial.quality = raw[pos] as Quality;
    pos++;
  }

  // ── combination / setter call (2 chars) ───────
  if (pos < raw.length && pos + 1 < raw.length) {
    const twoChar = raw.slice(pos, pos + 2);
    // setter call K1-K9
    if (SETTER_CALL_RE.test(twoChar.toUpperCase())) {
      partial.combination = twoChar.toUpperCase();
      partial.isSetterCall = true;
      partial.setterCallCode = twoChar.toUpperCase() as SetterCallCode;
      pos += 2;
    } else if (/^[A-Z][0-9A-Z]$/i.test(twoChar) && !ZONE_CHARS.has(twoChar[0])) {
      // looks like a combination code
      partial.combination = twoChar.toUpperCase();
      pos += 2;
    }
  }

  // ── zone from ─────────────────────────────────
  if (pos < raw.length && ZONE_CHARS.has(raw[pos])) {
    partial.zoneFrom = parseInt(raw[pos], 10);
    pos++;
  }

  // ── zone to ──────────────────────────────────
  if (pos < raw.length && ZONE_CHARS.has(raw[pos])) {
    partial.zoneTo = parseInt(raw[pos], 10);
    pos++;
  }

  // ── zone to sub ───────────────────────────────
  if (pos < raw.length && ZONE_SUB.has(raw[pos])) {
    partial.zoneToSub = raw[pos] as 'A'|'B'|'C'|'D';
    pos++;
  }

  // ── end zone plus (2 chars) ───────────────────
  if (pos + 1 < raw.length) {
    const ezp = raw.slice(pos, pos + 2);
    if (/^[0-9A-Z]{2}$/.test(ezp)) {
      partial.endZonePlus = ezp;
      pos += 2;
    }
  }

  // ── extended code (up to 4 chars) ─────────────
  if (pos < raw.length) {
    const extChar = raw[pos];
    if ('HPT'.includes(extChar.toUpperCase())) {
      partial.extType = extChar.toUpperCase();
      pos++;
    }
    if (pos < raw.length && /[123]/.test(raw[pos])) {
      partial.extBlockers = parseInt(raw[pos], 10);
      pos++;
    }
    if (pos < raw.length && /[XSCO]/.test(raw[pos].toUpperCase())) {
      partial.extSpecial = raw[pos].toUpperCase();
      pos++;
    }
    if (pos < raw.length && /[A-Z0-9]/.test(raw[pos].toUpperCase())) {
      partial.extFlag = raw[pos].toUpperCase();
      pos++;
    }
  }

  // ── custom (remainder, up to 5 chars) ─────────
  if (pos < raw.length) {
    partial.custom = raw.slice(pos, pos + 5);
  }

  const ok = errors.length === 0;
  if (ok) return { ok: true, value: partial };
  return { ok: false, errors, partial };
}

// ─────────────────────────────────────────────
// STAGE 5 — Compound code resolution
// ─────────────────────────────────────────────

function resolveCompound(codeA: ParsedCode, rawB: string): ParsedCode {
  // parse the second code in the pair — inheriting team/player if omitted
  let fullRawB = rawB;

  // If rawB doesn't start with a team indicator, prepend the same team as codeA
  const rawBFirst = rawB[0];
  const hasTeamPrefix = rawBFirst === '*' || rawBFirst === 'a' || rawBFirst === 'A';
  if (!hasTeamPrefix && !/^\d/.test(rawB)) {
    const teamPrefix = codeA.teamSide === 'home' ? '*' : 'a';
    const numStr = codeA.playerNumber.toString().padStart(2, '0');
    fullRawB = `${teamPrefix}${numStr}${rawB}`;
  } else if (!hasTeamPrefix) {
    const teamPrefix = codeA.teamSide === 'home' ? '*' : 'a';
    fullRawB = `${teamPrefix}${rawB}`;
  }

  const result = parseSingle(fullRawB);
  const codeB: ParsedCode = result.ok ? result.value : (result.partial ?? emptyParsed(fullRawB));

  // Mark both as compound
  codeA.isCompound = true;
  codeB.isCompound = true;
  codeA.compoundPair = codeB;

  return codeA;
}

// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────

export function parseDV4Code(raw: string): ParseResult {
  const normalised = normalise(raw);
  if (!normalised) {
    return { ok: false, errors: [{ code: 'MALFORMED_CODE', message: 'Empty input' }] };
  }

  // Auto codes are special-cased
  const autoResult = tryParseAutoCode(normalised);
  if (autoResult) return autoResult;

  const [partA, partB] = splitCompound(normalised);
  const resultA = parseSingle(partA);

  if (partB !== null) {
    // Compound code (. notation)
    const codeA = resultA.ok ? resultA.value : (resultA.partial ?? emptyParsed(partA));
    const resolved = resolveCompound(codeA, partB);
    // Compound is valid only if both parts are valid
    const resultB = parseSingle(codeA.compoundPair!.raw);
    if (!resultA.ok || !resultB.ok) {
      const allErrors = [
        ...(resultA.ok ? [] : resultA.errors),
        ...(resultB.ok ? [] : resultB.errors),
      ];
      return { ok: false, errors: allErrors, partial: resolved };
    }
    return { ok: true, value: resolved };
  }

  return resultA;
}

// Validate only (no allocation overhead for hot-path UI feedback)
export function validateDV4Code(raw: string): ParseError[] {
  const result = parseDV4Code(raw);
  return result.ok ? [] : result.errors;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function emptyParsed(raw: string): ParsedCode {
  return {
    raw,
    teamSide: 'home',
    playerNumber: 0,
    skill: 'S',
    skillType: null,
    quality: null,
    combination: null,
    zoneFrom: null,
    zoneTo: null,
    zoneToSub: null,
    endZonePlus: null,
    extType: null,
    extBlockers: null,
    extSpecial: null,
    extFlag: null,
    custom: null,
    isSetterCall: false,
    setterCallCode: null,
    isAutoCode: false,
    autoCode: null,
    isCompound: false,
  };
}
