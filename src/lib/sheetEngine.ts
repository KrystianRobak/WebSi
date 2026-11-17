import { SheetAttributeValue, SheetFieldSchema } from '../types/vault';

export type ComputedValueMap = Record<string, number | string>;
export type RepeatingRow = Record<string, string | number | boolean> & { id: string };

/**
 * Sanitizes custom Roll20-style HTML sheet templates while preserving inputs, selects, textareas, fieldsets, and buttons.
 */
export function sanitizeSheetHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/<iframe\b[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<iframe\b[^>]*\/?>/gi, '')
    .replace(/<object\b[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*\/?>/gi, '')
    .replace(/<applet\b[\s\S]*?>[\s\S]*?<\/applet>/gi, '')
    .replace(/<\/?(meta|link|base|form)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`|[^\s>]+)/gi, '')
    .replace(/(javascript|vbscript)\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, 'data:text/plain')
    .replace(/data\s*:\s*application\//gi, 'data:text/plain');
}

export function sanitizeSheetCss(css: string): string {
  return css
    .replace(/<script\b[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?\s*[a-zA-Z][^>]*>/g, '')
    .replace(/@import\b[^;\r\n]*(?:;|$)/gim, '')
    .replace(/expression\s*\(/gi, 'invalid-expr(')
    .replace(/behavior\s*:/gi, 'invalid-behavior:')
    .replace(/-moz-binding\s*:/gi, 'invalid-binding:')
    .replace(/(javascript|vbscript|data\s*:\s*text\/html)\s*:/gi, 'invalid:');
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'comma' };

function tokenizeFormula(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let raw = ch;
      i += 1;
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) {
        raw += expr[i];
        i += 1;
      }
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        throw new Error(`Invalid number "${raw}" in sheet formula.`);
      }
      tokens.push({ type: 'num', value: num });
      continue;
    }
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let ident = ch;
      i += 1;
      while (
        i < expr.length &&
        ((expr[i] >= 'a' && expr[i] <= 'z') ||
          (expr[i] >= 'A' && expr[i] <= 'Z') ||
          (expr[i] >= '0' && expr[i] <= '9') ||
          expr[i] === '_')
      ) {
        ident += expr[i];
        i += 1;
      }
      tokens.push({ type: 'ident', value: ident.toLowerCase() });
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i += 1;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%') {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    throw new Error(`Unsupported character "${ch}" in sheet formula.`);
  }
  return tokens;
}

const SHEET_FUNCTIONS: Record<string, (args: number[]) => number> = {
  floor: (args) => Math.floor(args[0] ?? 0),
  ceil: (args) => Math.ceil(args[0] ?? 0),
  round: (args) => Math.round(args[0] ?? 0),
  abs: (args) => Math.abs(args[0] ?? 0),
  min: (args) => (args.length ? Math.min(...args) : 0),
  max: (args) => (args.length ? Math.max(...args) : 0),
  clamp: (args) => {
    const val = args[0] ?? 0;
    const lo = args[1] ?? val;
    const hi = args[2] ?? val;
    return Math.min(Math.max(val, lo), hi);
  },
};

/**
 * Safe recursive-descent math evaluator for Roll20-style computed formulas (zero eval / Function).
 */
export function evaluateSafeFormula(
  formula: string,
  lookupAttr: (key: string) => number
): number {
  const substituted = formula.replace(/@\{([a-zA-Z0-9_.-]+)\}/g, (_m, key: string) => {
    const n = lookupAttr(key);
    return Number.isFinite(n) ? String(n) : '0';
  });

  const tokens = tokenizeFormula(substituted);
  if (tokens.length === 0) return 0;

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseExpression(): number {
    let val = parseTerm();
    while (peek()?.type === 'op' && (peek() as { type: 'op'; value: string }).value.match(/^[+-]$/)) {
      const op = (consume() as { type: 'op'; value: string }).value;
      const right = parseTerm();
      val = op === '+' ? val + right : val - right;
    }
    return val;
  }

  function parseTerm(): number {
    let val = parseUnary();
    while (
      peek()?.type === 'op' &&
      ['*', '/', '%'].includes((peek() as { type: 'op'; value: string }).value)
    ) {
      const op = (consume() as { type: 'op'; value: string }).value;
      const right = parseUnary();
      if (op === '*') val *= right;
      else if (op === '/') val = right === 0 ? 0 : val / right;
      else val = right === 0 ? 0 : val % right;
    }
    return val;
  }

  function parseUnary(): number {
    const t = peek();
    if (t?.type === 'op' && t.value === '-') {
      consume();
      return -parseUnary();
    }
    if (t?.type === 'op' && t.value === '+') {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const t = peek();
    if (!t) throw new Error('Unexpected end of formula.');
    if (t.type === 'num') {
      consume();
      return t.value;
    }
    if (t.type === 'ident') {
      consume();
      const fn = SHEET_FUNCTIONS[t.value];
      if (!fn) {
        // Bare identifier treated as attribute lookup fallback or error if call
        if (peek()?.type === 'paren' && (peek() as { type: 'paren'; value: string }).value === '(') {
          throw new Error(`Unsupported sheet function "${t.value}".`);
        }
        return lookupAttr(t.value);
      }
      const open = consume();
      if (!open || open.type !== 'paren' || open.value !== '(') {
        throw new Error(`Expected "(" after function "${t.value}".`);
      }
      const args: number[] = [];
      if (peek() && !(peek()!.type === 'paren' && (peek() as { type: 'paren'; value: string }).value === ')')) {
        args.push(parseExpression());
        while (peek()?.type === 'comma') {
          consume();
          args.push(parseExpression());
        }
      }
      const close = consume();
      if (!close || close.type !== 'paren' || close.value !== ')') {
        throw new Error(`Expected closing ")" after arguments of "${t.value}".`);
      }
      return fn(args);
    }
    if (t.type === 'paren' && t.value === '(') {
      consume();
      const inner = parseExpression();
      const close = consume();
      if (!close || close.type !== 'paren' || close.value !== ')') {
        throw new Error('Unmatched opening parenthesis in formula.');
      }
      return inner;
    }
    throw new Error(`Unexpected token in formula.`);
  }

  const res = parseExpression();
  if (pos < tokens.length) {
    throw new Error('Unexpected trailing token in formula.');
  }
  return Number.isFinite(res) ? res : 0;
}

function toNumericValue(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return 0;
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Merges schema defaults, character attributes, and safely evaluates all computed schema fields.
 */
export function computeSheetState(
  attributes: Record<string, SheetAttributeValue> = {},
  schema?: SheetFieldSchema | null
): {
  merged: Record<string, SheetAttributeValue>;
  computed: Record<string, number>;
  flatLookup: Record<string, SheetAttributeValue>;
} {
  const merged: Record<string, SheetAttributeValue> = {
    ...(schema?.defaults || {}),
    ...attributes,
  };
  const computed: Record<string, number> = {};
  const computedDefs = schema?.computed || {};
  const visiting = new Set<string>();

  const resolveNumber = (key: string): number => {
    if (key in computed) return computed[key];
    if (key in computedDefs && !visiting.has(key)) {
      visiting.add(key);
      try {
        const val = evaluateSafeFormula(computedDefs[key], resolveNumber);
        computed[key] = val;
        return val;
      } catch {
        computed[key] = 0;
        return 0;
      } finally {
        visiting.delete(key);
      }
    }
    return toNumericValue(merged[key]);
  };

  for (const key of Object.keys(computedDefs)) {
    resolveNumber(key);
  }

  const flatLookup: Record<string, SheetAttributeValue> = {
    ...merged,
    ...computed,
  };

  return { merged, computed, flatLookup };
}

/**
 * Resolves `@{field}` placeholders in dice roll formulas or labels using optional row context + sheet attributes + computed values.
 */
export function interpolateSheetRoll(
  rawText: string,
  attributes: Record<string, SheetAttributeValue> = {},
  schema?: SheetFieldSchema | null,
  rowAttrs?: Record<string, string | number | boolean>
): string {
  const { flatLookup } = computeSheetState(attributes, schema);
  const lookup: Record<string, unknown> = {
    ...flatLookup,
    ...(rowAttrs || {}),
  };

  // Strip surrounding [[...]] macro brackets if user wrote "Perception ([[1d20+@{wis_mod}]])"
  const unwrapped = rawText.replace(/\[\[([^\]]+)\]\]/g, '$1');

  return unwrapped.replace(/@\{([a-zA-Z0-9_.-]+)\}/g, (_m, key: string) => {
    const val = lookup[key];
    if (val === undefined || val === null || val === '') return '0';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return val ? '1' : '0';
    return String(val);
  });
}

export function getRepeatingRows(
  attributes: Record<string, SheetAttributeValue> = {},
  sectionName: string
): RepeatingRow[] {
  const key = sectionName.startsWith('repeating_') ? sectionName : `repeating_${sectionName}`;
  const raw = attributes[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, string | number | boolean> => Boolean(item && typeof item === 'object'))
    .map((item, idx) => ({
      ...item,
      id: typeof item.id === 'string' && item.id ? item.id : `row-${idx}`,
    }));
}
