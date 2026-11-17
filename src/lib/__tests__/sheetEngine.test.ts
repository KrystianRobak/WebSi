import { describe, expect, it } from 'vitest';
import {
  computeSheetState,
  evaluateSafeFormula,
  interpolateSheetRoll,
  sanitizeSheetCss,
  sanitizeSheetHtml,
} from '../sheetEngine';
import { SHEET_PRESET_5E } from '../../data/sheetPresets';

describe('sheetEngine', () => {
  it('evaluates nested Roll20-style formulas without eval', () => {
    const attrs: Record<string, number> = { str: 18, dex: 15, prof: 3 };
    const lookup = (k: string) => attrs[k] ?? 0;
    expect(evaluateSafeFormula('floor((@{str} - 10) / 2)', lookup)).toBe(4);
    expect(evaluateSafeFormula('floor((@{dex} - 10) / 2) + @{prof}', lookup)).toBe(5);
    expect(evaluateSafeFormula('max(0, min(5, @{prof} + 1))', lookup)).toBe(4);
    expect(evaluateSafeFormula('clamp(@{str}, 8, 16)', lookup)).toBe(16);
  });

  it('rejects arbitrary JS tokens and division by zero safely returns 0', () => {
    expect(() => evaluateSafeFormula('process.exit(1)', () => 0)).toThrow();
    expect(() => evaluateSafeFormula('alert(1)', () => 0)).toThrow();
    expect(evaluateSafeFormula('10 / 0', () => 0)).toBe(0);
  });

  it('computes 5e preset ability modifiers and interpolates roll macros with repeating rows', () => {
    const { computed } = computeSheetState({ str: 16, dex: 8, wis: 15, prof: 3 }, SHEET_PRESET_5E.schema_json);
    expect(computed.str_mod).toBe(3);
    expect(computed.dex_mod).toBe(-1);
    expect(computed.wis_mod).toBe(2);

    const macro = interpolateSheetRoll(
      '1d20+@{str_mod}+@{prof}',
      { str: 16, prof: 3 },
      SHEET_PRESET_5E.schema_json
    );
    expect(macro).toBe('1d20+3+3');

    const repeatMacro = interpolateSheetRoll(
      '@{attack_formula}',
      { str: 16 },
      SHEET_PRESET_5E.schema_json,
      { name: 'Longsword', attack_formula: '1d20+6' }
    );
    expect(repeatMacro).toBe('1d20+6');
  });

  it('sanitizes dangerous tags and event handlers while preserving sheet inputs', () => {
    const dirty = '<div onclick="alert(1)"><input type="text" name="attr_hp" /><script>alert(1)</script></div>';
    const clean = sanitizeSheetHtml(dirty);
    expect(clean).toContain('name="attr_hp"');
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/onclick/i);

    const cleanCss = sanitizeSheetCss('</style><script>bad()</script> @import "evil.css"; .a { color: gold; }');
    expect(cleanCss).not.toContain('</style>');
    expect(cleanCss).not.toContain('@import');
    expect(cleanCss).not.toMatch(/<script/i);
  });
});
