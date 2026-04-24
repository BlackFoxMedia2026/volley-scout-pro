import { describe, it, expect } from 'vitest';
import { parseDV4Code, validateDV4Code } from './dv4Parser';

// ─────────────────────────────────────────────
// BASIC CODES
// ─────────────────────────────────────────────

describe('basic codes', () => {
  it('parses a simple serve ace', () => {
    const r = parseDV4Code('a05S#');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.teamSide).toBe('home');
    expect(r.value.playerNumber).toBe(5);
    expect(r.value.skill).toBe('S');
    expect(r.value.quality).toBe('#');
  });

  it('parses an away team attack kill', () => {
    const r = parseDV4Code('b14AH#');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.teamSide).toBe('away');
    expect(r.value.playerNumber).toBe(14);
    expect(r.value.skill).toBe('A');
    expect(r.value.skillType).toBe('H');
    expect(r.value.quality).toBe('#');
  });

  it('parses reception with zones', () => {
    // a07R+ → no combination → zones follow quality directly: zoneFrom=5 zoneTo=9
    const r = parseDV4Code('a07R+59');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.skill).toBe('R');
    expect(r.value.quality).toBe('+');
    expect(r.value.zoneFrom).toBe(5);
    expect(r.value.zoneTo).toBe(9);
  });

  it('parses a block with sub-zone', () => {
    const r = parseDV4Code('b03B#67B');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.skill).toBe('B');
    expect(r.value.quality).toBe('#');
    expect(r.value.zoneFrom).toBe(6);
    expect(r.value.zoneTo).toBe(7);
    expect(r.value.zoneToSub).toBe('B');
  });

  it('returns error for unknown team', () => {
    const r = parseDV4Code('x05S#');
    expect(r.ok).toBe(false);
  });

  it('returns error for unknown skill', () => {
    const r = parseDV4Code('a05Z#');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some(e => e.code === 'INVALID_SKILL')).toBe(true);
  });
});

// ─────────────────────────────────────────────
// COMPOUND CODES
// ─────────────────────────────────────────────

describe('compound codes (. notation)', () => {
  it('parses serve+reception compound', () => {
    const r = parseDV4Code('a05S#.b07R=');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.skill).toBe('S');
    expect(r.value.quality).toBe('#');
    expect(r.value.isCompound).toBe(true);
    expect(r.value.compoundPair).toBeDefined();
    expect(r.value.compoundPair?.skill).toBe('R');
    expect(r.value.compoundPair?.quality).toBe('=');
  });

  it('parses attack+block compound', () => {
    const r = parseDV4Code('a14AH#.b03B=');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.compoundPair?.skill).toBe('B');
  });

  it('inherits team/player on abbreviated second code', () => {
    // When second code has no team/player prefix, inherits from first
    const r = parseDV4Code('a05S#.R+');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.compoundPair?.teamSide).toBe('home');
    // player may or may not be inherited depending on context
  });
});

// ─────────────────────────────────────────────
// SETTER CALLS
// ─────────────────────────────────────────────

describe('setter calls', () => {
  it('parses K1 setter call in combination field', () => {
    const r = parseDV4Code('a01EK1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.skill).toBe('E');
    expect(r.value.isSetterCall).toBe(true);
    expect(r.value.setterCallCode).toBe('K1');
    expect(r.value.combination).toBe('K1');
  });

  it('parses K9 setter call', () => {
    const r = parseDV4Code('a01EK9');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.setterCallCode).toBe('K9');
  });
});

// ─────────────────────────────────────────────
// AUTOMATIC CODES
// ─────────────────────────────────────────────

describe('automatic codes', () => {
  it('parses *z1 rotation error', () => {
    const r = parseDV4Code('*z1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.isAutoCode).toBe(true);
    expect(r.value.autoCode).toBe('*z1');
  });

  it('parses *p libero fault', () => {
    const r = parseDV4Code('*p');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.isAutoCode).toBe(true);
  });

  it('parses $&H= hand signal', () => {
    const r = parseDV4Code('$&H=');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.isAutoCode).toBe(true);
    expect(r.value.autoCode).toBe('$&H=');
  });
});

// ─────────────────────────────────────────────
// ATTACK COMBINATIONS
// ─────────────────────────────────────────────

describe('attack combinations', () => {
  it('parses attack with X5 combination and zones', () => {
    const r = parseDV4Code('a14AHX549');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.skill).toBe('A');
    expect(r.value.combination).toBe('X5');
    expect(r.value.zoneFrom).toBe(4);
    expect(r.value.zoneTo).toBe(9);
  });

  it('parses back row pipe', () => {
    // DV4 order: [team][num][skill][type][quality][combo][zones]
    const r = parseDV4Code('a07AH+XD15');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.combination).toBe('XD');
    expect(r.value.zoneFrom).toBe(1);
    expect(r.value.zoneTo).toBe(5);
  });
});

// ─────────────────────────────────────────────
// VALIDATION HELPER
// ─────────────────────────────────────────────

describe('validateDV4Code', () => {
  it('returns empty array for valid code', () => {
    expect(validateDV4Code('a05S#')).toHaveLength(0);
  });

  it('returns errors for invalid code', () => {
    expect(validateDV4Code('z99Z?')).not.toHaveLength(0);
  });
});
