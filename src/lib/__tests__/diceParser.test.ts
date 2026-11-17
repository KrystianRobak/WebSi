import { describe, expect, it } from 'vitest';
import { interpolateDiceAttributes, parseAndRollDice } from '../diceParser';

function seqRng(values: number[]): () => number {
  let idx = 0;
  return () => {
    const v = values[idx % values.length];
    idx++;
    return v;
  };
}

describe('diceParser', () => {
  it('interpolates @{attr} values safely', () => {
    expect(
      interpolateDiceAttributes('1d20+@{str_mod}+@{prof}', { str_mod: 3, prof: '2' })
    ).toBe('1d20+3+2');
    expect(interpolateDiceAttributes('1d20+@{missing}', {})).toBe('1d20+0');
  });

  it('rolls standard dice + flat modifiers deterministically', () => {
    // 0.75 * 20 => floor(15) + 1 = 16
    const res = parseAndRollDice('1d20+5', {}, seqRng([0.75]));
    expect(res.total).toBe(21);
    expect(res.breakdown.groups[0].rolls).toEqual([16]);
    expect(res.breakdown.modifier).toBe(5);
    expect(res.isCrit).toBe(false);
    expect(res.isFumble).toBe(false);
  });

  it('supports advantage (kh1), disadvantage (kl1), drop lowest (4d6dl1), and d100', () => {
    // Advantage: rolls [4, 18] -> keeps [18]
    const adv = parseAndRollDice('2d20kh1+2', {}, seqRng([0.15, 0.85]));
    expect(adv.breakdown.groups[0].rolls).toEqual([4, 18]);
    expect(adv.breakdown.groups[0].kept).toEqual([18]);
    expect(adv.total).toBe(20);

    // Disadvantage: rolls [4, 18] -> keeps [4]
    const dis = parseAndRollDice('2d20kl1', {}, seqRng([0.15, 0.85]));
    expect(dis.breakdown.groups[0].kept).toEqual([4]);
    expect(dis.total).toBe(4);

    // 4d6dl1: rolls [2, 5, 1, 6] -> drops 1 -> sums to 13
    const stat = parseAndRollDice('4d6dl1', {}, seqRng([0.2, 0.7, 0.05, 0.9]));
    expect(stat.breakdown.groups[0].rolls).toEqual([2, 5, 1, 6]);
    expect(stat.total).toBe(13);

    // d100 shorthand
    const pct = parseAndRollDice('d100', {}, seqRng([0.99]));
    expect(pct.total).toBe(100);
  });

  it('detects crit and fumble on d20 kept rolls and rejects invalid expressions', () => {
    const crit = parseAndRollDice('1d20', {}, seqRng([0.99]));
    expect(crit.isCrit).toBe(true);
    expect(crit.isFumble).toBe(false);

    const fumble = parseAndRollDice('1d20', {}, seqRng([0.0]));
    expect(fumble.isFumble).toBe(true);
    expect(fumble.isCrit).toBe(false);

    expect(() => parseAndRollDice('')).toThrow();
    expect(() => parseAndRollDice('0d20')).toThrow();
    expect(() => parseAndRollDice('-5d6')).toThrow();
    expect(() => parseAndRollDice('500d6')).toThrow();
    expect(() => parseAndRollDice('invalid_foo_bar')).toThrow();

    const sub = parseAndRollDice('1d20 - 1d4', {}, seqRng([0.5, 0.25]));
    expect(sub.total).toBe(9);
  });
});
