import { DiceRollBreakdown } from '../types/vault';

export interface DiceRollResult {
  expression: string;
  resolvedExpression: string;
  total: number;
  breakdown: DiceRollBreakdown;
  isCrit: boolean;
  isFumble: boolean;
}

/**
 * Resolves `@{attr}` and `@{attr_name}` references against character attributes.
 */
export function interpolateDiceAttributes(
  rawExpression: string,
  attrs: Record<string, unknown> = {}
): string {
  return rawExpression.replace(/@\{([a-zA-Z0-9_.-]+)\}/g, (_m, key: string) => {
    const val = attrs[key];
    if (typeof val === 'number' && Number.isFinite(val)) return String(val);
    if (typeof val === 'string') {
      const trimmed = val.trim();
      const parsed = Number(trimmed);
      if (trimmed !== '' && Number.isFinite(parsed)) return String(parsed);
      // Allow formula strings without nested recursive loops
      if (/^[0-9dDkKlLhH+\-*/().\s]+$/.test(trimmed)) return `(${trimmed})`;
    }
    return '0';
  });
}

/**
 * Safe recursive-descent arithmetic evaluator (numbers + - * / () only; zero eval).
 */
function evalArithmetic(expr: string): number {
  const tokens: Array<{ type: 'num' | 'op' | 'paren'; val: string }> = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = ch;
      i++;
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        numStr += expr[i];
        i++;
      }
      const parsed = Number(numStr);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid numeric literal "${numStr}" in dice expression.`);
      }
      tokens.push({ type: 'num', val: numStr });
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', val: ch });
      i++;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', val: ch });
      i++;
      continue;
    }
    throw new Error(`Unsupported token "${ch}" in dice expression.`);
  }

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseExpression(): number {
    let val = parseTerm();
    while (peek()?.type === 'op' && (peek()!.val === '+' || peek()!.val === '-')) {
      const op = consume().val;
      const right = parseTerm();
      val = op === '+' ? val + right : val - right;
    }
    return val;
  }

  function parseTerm(): number {
    let val = parseUnary();
    while (peek()?.type === 'op' && (peek()!.val === '*' || peek()!.val === '/')) {
      const op = consume().val;
      const right = parseUnary();
      if (op === '/') {
        val = right === 0 ? 0 : Math.trunc(val / right);
      } else {
        val = val * right;
      }
    }
    return val;
  }

  function parseUnary(): number {
    if (peek()?.type === 'op' && peek()!.val === '-') {
      consume();
      return -parseUnary();
    }
    if (peek()?.type === 'op' && peek()!.val === '+') {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const t = peek();
    if (!t) throw new Error('Unexpected end of dice expression.');
    if (t.type === 'num') {
      consume();
      return Number(t.val);
    }
    if (t.type === 'paren' && t.val === '(') {
      consume();
      const inner = parseExpression();
      const closing = consume();
      if (!closing || closing.val !== ')') {
        throw new Error('Unmatched opening parenthesis in dice expression.');
      }
      return inner;
    }
    throw new Error(`Unexpected token "${t.val}" in dice expression.`);
  }

  if (tokens.length === 0) return 0;
  const result = parseExpression();
  if (pos < tokens.length) {
    throw new Error(`Unexpected trailing token "${tokens[pos].val}".`);
  }
  return result;
}

/**
 * Parses and rolls standard TTRPG dice notation:
 * - `1d20+5`, `2d6-1`, `d100`, `2d20kh1` (advantage), `2d20kl1` (disadvantage), `4d6dl1`, `4d6dh1`
 * - Optional `@{attr}` interpolation
 */
export function parseAndRollDice(
  rawExpression: string,
  attrs: Record<string, unknown> = {},
  rng: () => number = Math.random
): DiceRollResult {
  const trimmed = rawExpression.trim();
  if (!trimmed) {
    throw new Error('Dice expression cannot be empty.');
  }

  const resolvedExpression = interpolateDiceAttributes(trimmed, attrs).trim();
  if (!resolvedExpression) {
    throw new Error('Dice expression resolved to empty.');
  }

  const groups: DiceRollBreakdown['groups'] = [];
  let isCrit = false;
  let isFumble = false;

  const diceRegex = /([+-]?)\s*(\d*)d(\d+)(?:(kh|kl|dh|dl)(\d+))?/gi;
  let lastIndex = 0;
  let arithmeticParts = '';
  let diceTotalSum = 0;
  let foundDice = false;

  let match: RegExpExecArray | null;
  while ((match = diceRegex.exec(resolvedExpression)) !== null) {
    foundDice = true;
    // Append any text before this dice group
    const gap = resolvedExpression.slice(lastIndex, match.index);
    const beforeGroup = (arithmeticParts + gap).trim();
    if (match[1] === '-' && (beforeGroup === '' || /[+\-*/(]$/.test(beforeGroup))) {
      throw new Error(`Dice count cannot be negative in "${trimmed}".`);
    }
    arithmeticParts += gap;
    lastIndex = match.index + match[0].length;

    const signStr = match[1] === '-' ? '-' : '+';
    const sign = signStr === '-' ? -1 : 1;
    const count = match[2] ? parseInt(match[2], 10) : 1;
    const sides = parseInt(match[3], 10);
    const keepDropKind = match[4]?.toLowerCase() as 'kh' | 'kl' | 'dh' | 'dl' | undefined;
    const keepDropCount = match[5] ? parseInt(match[5], 10) : 1;

    if (count < 1 || count > 200) {
      throw new Error(`Dice count (${count}) must be between 1 and 200.`);
    }
    if (sides < 2 || sides > 10000) {
      throw new Error(`Dice sides (d${sides}) must be between 2 and 10000.`);
    }

    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      const r = Math.min(sides, Math.max(1, Math.floor(rng() * sides) + 1));
      rolls.push(r);
    }

    let kept = [...rolls];
    if (keepDropKind) {
      const indexed = rolls.map((val, idx) => ({ val, idx }));
      if (keepDropKind === 'kh') {
        indexed.sort((a, b) => b.val - a.val);
        kept = indexed.slice(0, Math.min(count, keepDropCount)).map((x) => x.val);
      } else if (keepDropKind === 'kl') {
        indexed.sort((a, b) => a.val - b.val);
        kept = indexed.slice(0, Math.min(count, keepDropCount)).map((x) => x.val);
      } else if (keepDropKind === 'dl') {
        indexed.sort((a, b) => a.val - b.val);
        const dropSet = new Set(indexed.slice(0, Math.min(count, keepDropCount)).map((x) => x.idx));
        kept = rolls.filter((_, idx) => !dropSet.has(idx));
      } else if (keepDropKind === 'dh') {
        indexed.sort((a, b) => b.val - a.val);
        const dropSet = new Set(indexed.slice(0, Math.min(count, keepDropCount)).map((x) => x.idx));
        kept = rolls.filter((_, idx) => !dropSet.has(idx));
      }
    }

    const subtotal = sign * kept.reduce((acc, n) => acc + n, 0);
    diceTotalSum += subtotal;

    if (sides === 20 && sign === 1) {
      if (kept.includes(20)) isCrit = true;
      if (kept.includes(1)) isFumble = true;
    }

    const notation = `${count}d${sides}${keepDropKind ? `${keepDropKind}${keepDropCount}` : ''}`;
    groups.push({ notation, rolls, kept, subtotal });

    // Preserve explicit operator if gap ended without one
    if (arithmeticParts.trim().length > 0 && !/[+\-*/(]$/.test(arithmeticParts.trim())) {
      arithmeticParts += signStr;
    } else if (match[1] === '-') {
      arithmeticParts += '-';
    }
    arithmeticParts += String(Math.abs(subtotal));
  }

  arithmeticParts += resolvedExpression.slice(lastIndex);

  if (!foundDice && !/^[0-9+\-*/().\s]+$/.test(resolvedExpression)) {
    throw new Error(`Invalid dice notation: "${trimmed}"`);
  }

  const totalFloat = evalArithmetic(arithmeticParts);
  const total = Math.round(totalFloat);
  const modifier = total - diceTotalSum;

  return {
    expression: rawExpression,
    resolvedExpression,
    total,
    breakdown: { groups, modifier },
    isCrit,
    isFumble: isFumble && !isCrit,
  };
}
