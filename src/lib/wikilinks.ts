import { Entity, EntityLink, VaultAsset } from '../types/vault';

const WIKILINK_REGEX = /(?<!!)\[\[([^\]]+)\]\]/g;

/**
 * Extracts all unique [[WikiLink]] target titles/slugs from note content.
 */
export function extractWikiLinkTargets(content: string): string[] {
  const matches = new Set<string>();
  if (!content) return [];

  // 1. Plain [[Title]] or [[Title|Alias]] syntax
  let m: RegExpExecArray | null;
  const re = new RegExp(WIKILINK_REGEX);
  while ((m = re.exec(content)) !== null) {
    const raw = m[1].split('|')[0].trim();
    if (raw) matches.add(raw);
  }

  // 2. Also scan HTML spans with data-wikilink="..."
  const spanRegex = /data-wikilink="([^"]+)"/g;
  while ((m = spanRegex.exec(content)) !== null) {
    const raw = m[1].trim();
    if (raw) matches.add(raw);
  }

  return Array.from(matches);
}

/**
 * Computes EntityLink rows for a single source entity against the current entity dictionary.
 */
export function computeEntityLinksForSource(
  source: Entity,
  allEntities: Entity[]
): EntityLink[] {
  const targets = extractWikiLinkTargets(source.content);
  const byTitleOrSlug = new Map<string, Entity>();
  for (const e of allEntities) {
    byTitleOrSlug.set(e.title.toLowerCase(), e);
    byTitleOrSlug.set(e.slug.toLowerCase(), e);
  }

  const seen = new Set<string>();
  const links: EntityLink[] = [];
  for (const t of targets) {
    const target = byTitleOrSlug.get(t.toLowerCase());
    if (target && target.id !== source.id && !seen.has(target.id)) {
      seen.add(target.id);
      links.push({
        source_id: source.id,
        target_id: target.id,
        world_id: source.world_id,
      });
    }
  }
  return links;
}

/**
 * Computes all EntityLinks across all entities in the world.
 */
export function computeAllEntityLinks(allEntities: Entity[]): EntityLink[] {
  const links: EntityLink[] = [];
  for (const entity of allEntities) {
    links.push(...computeEntityLinksForSource(entity, allEntities));
  }
  return links;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const IMAGE_LINE_REGEX = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const OBSIDIAN_IMG_REGEX = /!\[\[([^\]]+)\]\]/g;

/**
 * Resolves `asset://slug` or `asset:slug` (or a bare asset slug/name) into an image URL.
 */
export function resolveAssetUrl(rawUrl: string | null | undefined, assets: VaultAsset[] = []): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('asset://') || trimmed.startsWith('asset:')) {
    const key = trimmed.replace(/^asset:\/\//, '').replace(/^asset:/, '').trim().toLowerCase();
    const found = assets.find(
      (a) => a.slug.toLowerCase() === key || a.name.toLowerCase() === key || a.id.toLowerCase() === key
    );
    return found ? found.url : '';
  }
  return trimmed;
}

interface ParsedImageModifiers {
  alt: string;
  opacity: number;
  align: 'left' | 'right' | 'center' | null;
  width: string | null;
  height: string | null;
  radius: string | null;
}

function tryApplyImageToken(token: string, state: Omit<ParsedImageModifiers, 'alt'>): boolean {
  const t = token.trim();
  const lower = t.toLowerCase();
  if (!t) return true;

  if (lower === 'left' || lower === 'float-left' || lower === 'l') {
    state.align = 'left';
    return true;
  }
  if (lower === 'right' || lower === 'float-right' || lower === 'r') {
    state.align = 'right';
    return true;
  }
  if (lower === 'center' || lower === 'c') {
    state.align = 'center';
    return true;
  }
  if (lower === 'circle' || lower === 'round') {
    state.radius = lower === 'circle' ? '9999px' : '12px';
    return true;
  }
  if (/^\d+$/.test(t)) {
    state.width = `${t}px`;
    return true;
  }
  if (/^\d+(?:\.\d+)?(px|%|rem|em|vw)$/i.test(t)) {
    state.width = t;
    return true;
  }
  const dimX = t.match(/^(\d+)x(\d+)$/i);
  if (dimX) {
    state.width = `${dimX[1]}px`;
    state.height = `${dimX[2]}px`;
    return true;
  }
  const kv = t.match(/^([a-zA-Z-]+)\s*[:=]\s*(.+)$/);
  if (kv) {
    const k = kv[1].toLowerCase();
    const v = sanitizeStyleToken(kv[2].replace(/^['"]|['"]$/g, ''));
    if (!v) return true;
    if (k === 'opacity') {
      const val = parseFloat(v);
      if (!Number.isNaN(val)) {
        state.opacity = val > 1 ? Math.min(1, val / 100) : Math.max(0.05, Math.min(1, val));
      }
      return true;
    }
    if (k === 'float' || k === 'align') {
      const av = v.toLowerCase();
      if (av === 'left' || av === 'right' || av === 'center') state.align = av;
      return true;
    }
    if (k === 'width' || k === 'w' || k === 'size') {
      state.width = /^\d+$/.test(v) ? `${v}px` : v;
      return true;
    }
    if (k === 'height' || k === 'h') {
      state.height = /^\d+$/.test(v) ? `${v}px` : v;
      return true;
    }
    if (k === 'radius' || k === 'rounded') {
      state.radius = v === 'full' ? '9999px' : /^\d+$/.test(v) ? `${v}px` : v;
      return true;
    }
  }
  return false;
}

function parseImageModifiers(rawAlt: string): ParsedImageModifiers {
  const parts = rawAlt.split('|').map((s) => s.trim());
  const state: Omit<ParsedImageModifiers, 'alt'> = {
    opacity: 1,
    align: null,
    width: null,
    height: null,
    radius: null,
  };
  const labelParts: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (tryApplyImageToken(part, state)) continue;
    // Allow space-separated modifier chains like `left 240px` without corrupting normal captions
    const subTokens = part.split(/\s+/);
    if (subTokens.length > 1) {
      const testState = { ...state };
      if (subTokens.every((st) => tryApplyImageToken(st, testState))) {
        Object.assign(state, testState);
        continue;
      }
    }
    labelParts.push(part);
  }
  return { alt: labelParts.join(' | '), ...state };
}

function buildImgTag(rawUrl: string, rawAlt: string, assets: VaultAsset[]): string {
  const { alt, opacity, align, width, height, radius } = parseImageModifiers(rawAlt);
  const trimmedRef = rawUrl.trim();
  const resolved = resolveAssetUrl(trimmedRef, assets) || trimmedRef;
  const isAssetRef = trimmedRef.startsWith('asset://') || trimmedRef.startsWith('asset:');
  const safeSrc = resolved.replace(/"/g, '&quot;');
  const safeAlt = alt.replace(/"/g, '&quot;');
  const refAttr = isAssetRef ? ` data-asset-ref="${trimmedRef.replace(/"/g, '&quot;')}"` : '';

  const classes = ['vault-embedded-img'];
  if (align === 'left') classes.push('vault-img-left');
  else if (align === 'right') classes.push('vault-img-right');
  else if (align === 'center') classes.push('vault-img-center');

  const styles = [`opacity: ${opacity}`];
  if (width) styles.push(`width: ${width}; max-width: 100%`);
  if (height) styles.push(`height: ${height}; max-height: none`);
  if (radius) styles.push(`border-radius: ${radius}`);

  return `<img src="${safeSrc}" alt="${safeAlt}"${refAttr} data-opacity="${opacity}" style="${styles.join('; ')};" class="${classes.join(' ')}" />`;
}

function buildObsidianImgTag(inner: string, assets: VaultAsset[]): string {
  const parts = inner.split('|').map((s) => s.trim());
  const targetKey = parts[0] || '';
  const found = assets.find(
    (a) =>
      a.slug.toLowerCase() === targetKey.toLowerCase() ||
      a.name.toLowerCase() === targetKey.toLowerCase()
  );
  const assetRef = found ? `asset://${found.slug}` : `asset://${targetKey}`;
  const altSpec = parts.slice(1).join('|') || (found ? found.name : targetKey);
  return buildImgTag(assetRef, altSpec, assets);
}

export interface AppearanceConfig {
  bgImage: string | null;
  bgRawRef: string | null;
  bgOpacity: number;
  coverOpacity: number;
  coverHeight: 'md' | 'lg' | 'xl';
}

export function getEntityAppearance(
  metadata: Record<string, string | number | boolean> = {},
  assets: VaultAsset[] = []
): AppearanceConfig {
  const rawBg = typeof metadata._bg_image === 'string' && metadata._bg_image ? metadata._bg_image : null;
  return {
    bgImage: rawBg ? resolveAssetUrl(rawBg, assets) || rawBg : null,
    bgRawRef: rawBg,
    bgOpacity: typeof metadata._bg_opacity === 'number' ? metadata._bg_opacity : 0.22,
    coverOpacity: typeof metadata._cover_opacity === 'number' ? metadata._cover_opacity : 0.95,
    coverHeight:
      metadata._cover_height === 'md' || metadata._cover_height === 'xl'
        ? metadata._cover_height
        : 'lg',
  };
}

export function getVisibleMetadataEntries(
  metadata: Record<string, string | number | boolean> = {}
): Array<[string, string | number | boolean]> {
  return Object.entries(metadata).filter(([k]) => !k.startsWith('_'));
}

export function getEntityCustomCss(
  metadata: Record<string, string | number | boolean> = {}
): string {
  return typeof metadata._custom_css === 'string' ? metadata._custom_css : '';
}

/**
 * Prefixes CSS rules with `.${scopeClass}` so per-note custom CSS stays isolated to that note.
 */
export function scopeCustomCss(css: string, scopeClass: string): string {
  if (!css.trim()) return '';
  return css.replace(/([^{}@]+)\{/g, (match, selectorGroup: string) => {
    const trimmed = selectorGroup.trim();
    if (!trimmed || trimmed.startsWith('@') || trimmed.startsWith('from') || trimmed.startsWith('to')) {
      return match;
    }
    const scoped = trimmed
      .split(',')
      .map((sel) => {
        const s = sel.trim();
        if (!s) return s;
        if (s.includes(scopeClass)) return s;
        if (s === ':root' || s === 'body' || s === '.note') return `.${scopeClass}`;
        return `.${scopeClass} ${s}`;
      })
      .join(', ');
    return `${scoped} {`;
  });
}

/**
 * Strips unsafe script/iframe/event-handler attributes while preserving rich HTML styling tags.
 */
export function sanitizeNoteHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

const FONT_FAMILY_MAP: Record<string, string> = {
  cinzel: "'Cinzel', Georgia, serif",
  display: "'Cinzel', Georgia, serif",
  garamond: "'Cormorant Garamond', Georgia, serif",
  editorial: "'Cormorant Garamond', Georgia, serif",
  serif: "'Cormorant Garamond', Georgia, serif",
  inter: "'Inter', system-ui, sans-serif",
  sans: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
  code: "'JetBrains Mono', monospace",
  jetbrains: "'JetBrains Mono', monospace",
};

function normalizeFontFamily(raw: string): string {
  const cleaned = sanitizeStyleToken(raw.replace(/^['"]|['"]$/g, ''));
  const mapped = FONT_FAMILY_MAP[cleaned.toLowerCase()];
  return mapped || cleaned;
}

function normalizeFontSize(raw: string): string {
  const v = sanitizeStyleToken(raw).toLowerCase();
  if (v === 'xs') return '0.75rem';
  if (v === 'sm') return '0.875rem';
  if (v === 'md' || v === 'base') return '1rem';
  if (v === 'lg') return '1.2rem';
  if (v === 'xl') return '1.45rem';
  if (v === '2xl') return '1.85rem';
  if (v === '3xl') return '2.25rem';
  return /^\d+$/.test(v) ? `${v}px` : sanitizeStyleToken(raw);
}

const NOTE_VAR_KEY_MAP: Record<string, string> = {
  color: '--note-color',
  'text-color': '--note-color',
  'font-size': '--note-font-size',
  size: '--note-font-size',
  'font-family': '--note-font-family',
  font: '--note-font-family',
  'heading-font': '--note-heading-font',
  'line-height': '--note-line-height',
  'heading-color': '--note-heading-color',
  'h1-color': '--note-h1-color',
  'h2-color': '--note-h2-color',
  'h3-color': '--note-h3-color',
  'h1-size': '--note-h1-size',
  'h2-size': '--note-h2-size',
  'h3-size': '--note-h3-size',
  accent: '--note-accent',
  'accent-color': '--note-accent',
  'text-align': '--note-align',
  align: '--note-align',
  bg: '--note-bg',
  background: '--note-bg',
};

function sanitizeStyleToken(val: string): string {
  return val.replace(/[{};<>`]/g, '').replace(/javascript:/gi, '').trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pushCssDeclaration(declarations: string[], rawKey: string, rawVal: string) {
  const k = rawKey.trim().toLowerCase();
  const v = sanitizeStyleToken(rawVal.replace(/^['"]|['"]$/g, ''));
  if (!v) return;
  if (k === 'color' || k === 'c') {
    declarations.push(`color: ${v}`);
  } else if (k === 'size' || k === 'font-size' || k === 'fs') {
    declarations.push(`font-size: ${normalizeFontSize(v)}`);
  } else if (k === 'font' || k === 'font-family' || k === 'ff') {
    declarations.push(`font-family: ${normalizeFontFamily(v)}`);
  } else if (k === 'bg' || k === 'background' || k === 'background-color') {
    declarations.push(`background-color: ${v}; padding: 0.08em 0.42em; border-radius: 5px`);
  } else if (k === 'align' || k === 'text-align') {
    declarations.push(`text-align: ${v}`);
  } else if (k === 'weight' || k === 'font-weight') {
    declarations.push(`font-weight: ${v}`);
  } else if (k === 'line-height' || k === 'lh') {
    declarations.push(`line-height: ${v}`);
  } else if (k === 'letter-spacing' || k === 'tracking') {
    declarations.push(`letter-spacing: ${v}`);
  } else if (k === 'border') {
    declarations.push(`border: ${v}`);
  } else if (k === 'padding' || k === 'pad') {
    declarations.push(`padding: ${/^\d+$/.test(v) ? `${v}px` : v}`);
  } else if (k === 'radius' || k === 'rounded') {
    declarations.push(`border-radius: ${/^\d+$/.test(v) ? `${v}px` : v}`);
  } else if (k === 'transform' || k === 'case') {
    declarations.push(`text-transform: ${v}`);
  } else if (k === 'variant') {
    declarations.push(`font-variant: ${v}`);
  } else if (k === 'shadow' || k === 'glow') {
    declarations.push(`text-shadow: 0 0 12px ${v}`);
  }
}

function buildInlineCssFromSpec(spec: string): string {
  const declarations: string[] = [];
  const parts = spec.split(/[;|]/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const kvRegex = /([a-zA-Z][a-zA-Z0-9-]*)\s*[:=]\s*("(?:[^"]*)"|'(?:[^']*)'|[^\s;|]+)/g;
    const matches = Array.from(part.matchAll(kvRegex));

    if (
      matches.length === 1 &&
      /^\s*[a-zA-Z][a-zA-Z0-9-]*\s*[:=]/.test(part) &&
      !matches[0][2].startsWith('"') &&
      !matches[0][2].startsWith("'")
    ) {
      const singleKv = part.match(/^([a-zA-Z][a-zA-Z0-9-]*)\s*[:=]\s*(.+)$/);
      if (singleKv) {
        pushCssDeclaration(declarations, singleKv[1], singleKv[2]);
        continue;
      }
    }

    let remainder = part;
    if (matches.length > 0) {
      for (const m of matches) {
        pushCssDeclaration(declarations, m[1], m[2]);
      }
      remainder = part.replace(kvRegex, ' ');
    }

    for (const tok of remainder.split(/\s+/)) {
      const t = sanitizeStyleToken(tok);
      const lower = t.toLowerCase();
      if (!t) continue;
      if (/^#[0-9a-f]{3,8}$/i.test(t) || /^(rgb|rgba|hsl)\(/i.test(t)) {
        declarations.push(`color: ${t}`);
      } else if (/^\d+(?:\.\d+)?(px|rem|em|%)$/i.test(t)) {
        declarations.push(`font-size: ${t}`);
      } else if (FONT_FAMILY_MAP[lower]) {
        declarations.push(`font-family: ${FONT_FAMILY_MAP[lower]}`);
      } else if (lower === 'bold') {
        declarations.push('font-weight: 700');
      } else if (lower === 'semibold') {
        declarations.push('font-weight: 600');
      } else if (lower === 'italic') {
        declarations.push('font-style: italic');
      } else if (lower === 'underline') {
        declarations.push('text-decoration: underline');
      } else if (lower === 'strike') {
        declarations.push('text-decoration: line-through');
      } else if (lower === 'uppercase') {
        declarations.push('text-transform: uppercase');
      } else if (lower === 'small-caps' || lower === 'smallcaps') {
        declarations.push('font-variant: small-caps');
      } else if (lower === 'glow') {
        declarations.push('text-shadow: 0 0 12px rgba(212, 168, 83, 0.55)');
      } else if (lower === 'center' || lower === 'left' || lower === 'right' || lower === 'justify') {
        declarations.push(`text-align: ${lower}`);
      }
    }
  }
  return declarations.join('; ');
}

/**
 * Extracts optional Markdown note style settings from either leading YAML style frontmatter
 * or Obsidian comment style directives `%% style: color=#...; font-size=18px %%`.
 */
export function parseNoteMarkdownStyleBlock(raw: string): {
  content: string;
  noteVars: Record<string, string>;
} {
  if (!raw) return { content: '', noteVars: {} };
  const noteVars: Record<string, string> = {};
  let remaining = raw;

  const applyPair = (key: string, val: string) => {
    const cssVar = NOTE_VAR_KEY_MAP[key.toLowerCase()];
    if (!cssVar) return;
    const cleanVal = sanitizeStyleToken(val.replace(/^['"]|['"]$/g, ''));
    if (!cleanVal) return;
    if (cssVar.includes('font') && !cssVar.includes('size')) {
      noteVars[cssVar] = normalizeFontFamily(cleanVal);
    } else if (cssVar.includes('size')) {
      noteVars[cssVar] = normalizeFontSize(cleanVal);
    } else {
      noteVars[cssVar] = cleanVal;
    }
  };

  // 1. Optional leading frontmatter style block
  const fmMatch = remaining.match(/^\s*---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (fmMatch) {
    const blockLines = fmMatch[1].split(/\r?\n/);
    const matchedEntries: Array<[string, string]> = [];
    for (const line of blockLines) {
      const m = line.match(/^\s*([a-zA-Z0-9_-]+)\s*:\s*(.+?)\s*$/);
      if (m && NOTE_VAR_KEY_MAP[m[1].toLowerCase()]) {
        matchedEntries.push([m[1], m[2]]);
      }
    }
    if (matchedEntries.length > 0) {
      for (const [k, v] of matchedEntries) applyPair(k, v);
      remaining = remaining.slice(fmMatch[0].length);
    }
  }

  // 2. Obsidian inline style comment lines: %% style: key=val; key2=val2 %%
  remaining = remaining.replace(/^%%\s*style\s*:\s*([\s\S]*?)\s*%%\s*$/gim, (_, spec: string) => {
    const pairs = spec.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
    for (const pair of pairs) {
      const kv = pair.match(/^([a-zA-Z0-9_-]+)\s*[:=]\s*(.+)$/);
      if (kv) applyPair(kv[1].trim(), kv[2]);
    }
    return '';
  });

  return { content: remaining, noteVars };
}

const RAW_HTML_LINE_RE =
  /^<\/?(div|section|article|aside|header|footer|details|summary|table|thead|tbody|tr|th|td|span|p|h[1-6]|ul|ol|li|blockquote|hr|br|img|figure|figcaption|strong|em|b|i|u|code|pre|style|font)\b/i;

function buildEmbedTag(
  inner: string,
  assets: VaultAsset[],
  entities: Entity[]
): string {
  const parts = inner.split('|').map((s) => s.trim());
  const targetKey = parts[0] || '';
  const lowerKey = targetKey.toLowerCase();

  // 1. Match Vault Asset first
  const matchedAsset = assets.find(
    (a) => a.slug.toLowerCase() === lowerKey || a.name.toLowerCase() === lowerKey || a.id.toLowerCase() === lowerKey
  );
  if (matchedAsset) {
    return buildObsidianImgTag(inner, assets);
  }

  // 2. Match Entity / Note for Obsidian Transclusion Card ![[Entity Title]]
  const matchedEntity = entities.find(
    (e) => e.title.toLowerCase() === lowerKey || e.slug.toLowerCase() === lowerKey
  );
  if (matchedEntity) {
    const mode = parts.slice(1).join(' ').toLowerCase();
    const isCompact = mode.includes('compact') || mode.includes('mini');
    const safeTitle = escapeHtml(matchedEntity.title);
    const safeType = escapeHtml(matchedEntity.type);
    const safeSummary = escapeHtml(matchedEntity.summary || 'Linked campaign dossier entry.');
    const metaBadges = !isCompact
      ? Object.entries(matchedEntity.metadata || {})
          .filter(([k]) => !k.startsWith('_'))
          .slice(0, 3)
          .map(
            ([k, v]) =>
              `<span class="vault-embed-meta"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</span>`
          )
          .join('')
      : '';
    const thumbHtml =
      matchedEntity.cover_image_url && !isCompact
        ? `<img src="${escapeHtml(matchedEntity.cover_image_url)}" alt="${safeTitle}" class="vault-embed-thumb" />`
        : '';

    return `<div class="vault-embed-card" data-wikilink="${safeTitle}">${thumbHtml}<div class="vault-embed-body"><div class="vault-embed-eyebrow">${safeType} • Embedded Entry</div><div class="vault-embed-title">${safeTitle}</div><div class="vault-embed-summary">${safeSummary}</div>${metaBadges ? `<div class="vault-embed-metas">${metaBadges}</div>` : ''}</div></div>`;
  }

  // 3. Fallback: external URL or unresolved asset tag
  if (/^(https?:|data:|\/)/i.test(targetKey)) {
    return buildImgTag(targetKey, parts.slice(1).join('|'), assets);
  }
  return buildObsidianImgTag(inner, assets);
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (trimmed[i] === '|') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += trimmed[i];
    }
  }
  cells.push(cur.trim());
  return cells;
}

function isTableSeparatorLine(line: string): boolean {
  const t = line.trim();
  if (!t.includes('|') || !t.includes('-')) return false;
  const cells = splitTableRow(t);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function getColumnAlign(sepCell: string): 'left' | 'center' | 'right' {
  const c = sepCell.trim();
  if (c.startsWith(':') && c.endsWith(':')) return 'center';
  if (c.endsWith(':')) return 'right';
  return 'left';
}

const CALLOUT_META: Record<string, { label: string; tone: string }> = {
  note: { label: 'Note', tone: 'note' },
  info: { label: 'Info', tone: 'info' },
  tip: { label: 'Tip', tone: 'tip' },
  lore: { label: 'Lore', tone: 'lore' },
  warning: { label: 'Warning', tone: 'warning' },
  danger: { label: 'Hazard', tone: 'danger' },
  secret: { label: 'Secret', tone: 'secret' },
  quote: { label: 'Quote', tone: 'quote' },
  statblock: { label: 'Statblock', tone: 'statblock' },
};

/**
 * Converts rich Markdown + HTML into safe rendered HTML:
 * - Multi-column grids (`:::columns 2 ... :::col ... :::`)
 * - GFM Tables (`| H1 | H2 |` + `| :--- | ---: |`)
 * - Page splits & dividers (`===`, `:::page-break Label`, `--- Label ---`, `---`)
 * - Obsidian callouts (`> [!lore] Title`) & container cards (`:::card Title`, `:::statblock`, `:::details`)
 * - Asset & Note embeds (`![[asset-slug|left|220px]]`, `![[Entity Title]]`)
 * - Inline font/color/style directives (`[text]{color=#eab308 font=Cinzel size=20px}`) & block styles
 */
export function markdownToHtml(
  raw: string,
  assets: VaultAsset[] = [],
  entities: Entity[] = []
): string {
  if (!raw) return '<p></p>';
  const { content: withoutStyleHeader } = parseNoteMarkdownStyleBlock(raw);
  const trimmed = withoutStyleHeader.trim();
  if (!trimmed) return '<p></p>';

  const applyInlineStyleDirectives = (str: string) =>
    str.replace(/\[([^\]]+)\]\{([^}]+)\}/g, (_, text: string, spec: string) => {
      const css = buildInlineCssFromSpec(spec);
      return css ? `<span style="${css}">${text}</span>` : text;
    });

  const formatInline = (input: string) => {
    const placeholders: string[] = [];
    const safe = input
      .replace(/`([^`]+)`/g, (_, code: string) => {
        const idx = placeholders.length;
        placeholders.push(`<code>${escapeHtml(code)}</code>`);
        return `@@INLINE_${idx}@@`;
      })
      .replace(OBSIDIAN_IMG_REGEX, (_, inner: string) => {
        const idx = placeholders.length;
        placeholders.push(buildEmbedTag(inner, assets, entities));
        return `@@INLINE_${idx}@@`;
      })
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, rawAlt: string, url: string) => {
        const idx = placeholders.length;
        placeholders.push(buildImgTag(url, rawAlt, assets));
        return `@@INLINE_${idx}@@`;
      });

    let out = applyInlineStyleDirectives(safe)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/==([^=]+)==/g, '<mark class="vault-mark">$1</mark>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(WIKILINK_REGEX, (_, inner: string) => {
        const [target, alias] = inner.split('|').map((s: string) => s.trim());
        return `<span data-wikilink="${escapeHtml(target)}" class="wikilink-pill">[[${escapeHtml(alias || target)}]]</span>`;
      });

    out = out.replace(/@@INLINE_(\d+)@@/g, (_, idx) => placeholders[Number(idx)] || '');
    return out;
  };

  // Preserve multi-line <style>...</style> blocks verbatim
  const stylePlaceholders: string[] = [];
  const prepared = trimmed.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, (block) => {
    const idx = stylePlaceholders.length;
    stylePlaceholders.push(block);
    return `\n@@STYLE_BLOCK_${idx}@@\n`;
  });

  if (
    prepared.startsWith('<h') ||
    prepared.startsWith('<p') ||
    prepared.startsWith('<ul') ||
    prepared.startsWith('<img')
  ) {
    const restored = prepared
      .replace(OBSIDIAN_IMG_REGEX, (_, inner: string) => buildEmbedTag(inner, assets, entities))
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, rawAlt: string, url: string) => buildImgTag(url, rawAlt, assets))
      .replace(WIKILINK_REGEX, (_, inner: string) => {
        const [target, alias] = inner.split('|').map((s: string) => s.trim());
        return `<span data-wikilink="${escapeHtml(target)}" class="wikilink-pill">[[${escapeHtml(alias || target)}]]</span>`;
      })
      .replace(/@@STYLE_BLOCK_(\d+)@@/g, (_, idx) => stylePlaceholders[Number(idx)] || '');
    return sanitizeNoteHtml(restored);
  }

  const lines = prepared.split(/\r?\n/);
  const htmlParts: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType === 'ul') htmlParts.push('</ul>');
    else if (listType === 'ol') htmlParts.push('</ol>');
    listType = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const l = rawLine.trim();

    const styleMatch = l.match(/^@@STYLE_BLOCK_(\d+)@@$/);
    if (styleMatch) {
      closeList();
      htmlParts.push(stylePlaceholders[Number(styleMatch[1])] || '');
      continue;
    }

    if (!l) {
      closeList();
      continue;
    }

    // 1. Fenced code block ```lang ... ```
    if (l.startsWith('```')) {
      closeList();
      const lang = l.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      htmlParts.push(
        `<pre><code${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}>${escapeHtml(
          codeLines.join('\n')
        )}</code></pre>`
      );
      continue;
    }

    // 2. Multi-column layout block :::columns ... :::col ... :::
    const colsStart = l.match(/^:::\s*(?:columns|cols|grid)(?:\s+(.*))?$/i);
    if (colsStart) {
      closeList();
      const spec = (colsStart[1] || '2').trim();
      const colBuffers: string[][] = [[]];
      let depth = 1;
      i++;
      while (i < lines.length) {
        const innerRaw = lines[i];
        const innerTrim = innerRaw.trim();
        if (/^:::\s*(?:columns|cols|grid|card|statblock|details)\b/i.test(innerTrim)) {
          depth++;
          colBuffers[colBuffers.length - 1].push(innerRaw);
        } else if (innerTrim === ':::') {
          depth--;
          if (depth === 0) break;
          colBuffers[colBuffers.length - 1].push(innerRaw);
        } else if (depth === 1 && (/^:::\s*col\b/i.test(innerTrim) || innerTrim === '|||')) {
          colBuffers.push([]);
        } else {
          colBuffers[colBuffers.length - 1].push(innerRaw);
        }
        i++;
      }

      const ratioMatch = spec.match(/(\d+(?:fr|%)|minmax\([^)]+\))(?:\s+|[:/])(\d+(?:fr|%)|minmax\([^)]+\))(?:\s+|[:/])?(\d+(?:fr|%))?/i);
      let gridTemplate = `repeat(${Math.max(1, colBuffers.length)}, minmax(0, 1fr))`;
      if (/^\d+$/.test(spec)) {
        const n = Math.max(1, Math.min(4, Number(spec)));
        gridTemplate = `repeat(${n}, minmax(0, 1fr))`;
      } else if (ratioMatch) {
        const tracks = spec
          .split(/[\s:/]+/)
          .filter(Boolean)
          .map((t) => (/^\d+$/.test(t) ? `${t}fr` : t));
        if (tracks.length >= 2) gridTemplate = tracks.join(' ');
      }

      const colsHtml = colBuffers
        .map(
          (buf) =>
            `<div class="vault-column">${markdownToHtml(buf.join('\n'), assets, entities)}</div>`
        )
        .join('');
      htmlParts.push(
        `<div class="vault-columns" style="grid-template-columns: ${escapeHtml(gridTemplate)}">${colsHtml}</div>`
      );
      continue;
    }

    // 3. Container blocks: :::card Title, :::statblock Title, :::details Summary, :::style {spec}
    const containerStart = l.match(/^:::\s*(card|statblock|details|box|styled)(?:\s+(.*))?$/i);
    if (containerStart) {
      closeList();
      const kind = containerStart[1].toLowerCase();
      let headerArg = (containerStart[2] || '').trim();
      let boxStyleAttr = '';
      const attrMatch = headerArg.match(/\{([^}]+)\}\s*$/);
      if (attrMatch) {
        const css = buildInlineCssFromSpec(attrMatch[1]);
        if (css) boxStyleAttr = ` style="${css}"`;
        headerArg = headerArg.replace(/\{([^}]+)\}\s*$/, '').trim();
      }
      const innerLines: string[] = [];
      let depth = 1;
      i++;
      while (i < lines.length) {
        const innerRaw = lines[i];
        const innerTrim = innerRaw.trim();
        if (/^:::\s*(?:columns|cols|grid|card|statblock|details|box|styled)\b/i.test(innerTrim)) {
          depth++;
        } else if (innerTrim === ':::') {
          depth--;
          if (depth === 0) break;
        }
        innerLines.push(innerRaw);
        i++;
      }
      const bodyHtml = markdownToHtml(innerLines.join('\n'), assets, entities);
      if (kind === 'details') {
        htmlParts.push(
          `<details class="vault-details"><summary>${formatInline(headerArg || 'Details')}</summary>${bodyHtml}</details>`
        );
      } else if (kind === 'statblock') {
        htmlParts.push(
          `<div class="vault-statblock"${boxStyleAttr}>${
            headerArg ? `<div class="vault-statblock-title">${formatInline(headerArg)}</div>` : ''
          }${bodyHtml}</div>`
        );
      } else {
        htmlParts.push(
          `<div class="vault-card"${boxStyleAttr}>${
            headerArg ? `<div class="vault-card-title">${formatInline(headerArg)}</div>` : ''
          }${bodyHtml}</div>`
        );
      }
      continue;
    }

    // 4. Page Split / Section Break: === or :::page-break Label or :::split Label or --- Label ---
    const pageSplitDirective = l.match(/^:::\s*(?:page-break|pagebreak|split)\s*(.*)$/i);
    const labeledSplit = l.match(/^---\s+(.+?)\s+---$/);
    if (l === '===' || pageSplitDirective || labeledSplit) {
      closeList();
      const splitLabel = pageSplitDirective?.[1]?.trim() || labeledSplit?.[1]?.trim() || '';
      htmlParts.push(
        `<div class="vault-page-split" data-page-break="true">${
          splitLabel
            ? `<span class="vault-page-split-label">${formatInline(splitLabel)}</span>`
            : '<span class="vault-page-split-diamond">◆</span>'
        }</div>`
      );
      continue;
    }

    // 5. GFM Markdown Table (header row + separator row + body rows)
    if (l.includes('|') && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
      closeList();
      const headers = splitTableRow(l);
      const alignments = splitTableRow(lines[i + 1]).map(getColumnAlign);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
        bodyRows.push(splitTableRow(lines[i]));
        i++;
      }
      i--; // step back so loop increment lands on next unread line

      const ths = headers
        .map(
          (cell, idx) =>
            `<th style="text-align: ${alignments[idx] || 'left'}">${formatInline(cell)}</th>`
        )
        .join('');
      const trs = bodyRows
        .map((row) => {
          const tds = headers
            .map((_, idx) => {
              const val = row[idx] ?? '';
              return `<td style="text-align: ${alignments[idx] || 'left'}">${formatInline(val)}</td>`;
            })
            .join('');
          return `<tr>${tds}</tr>`;
        })
        .join('');

      htmlParts.push(
        `<div class="vault-table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`
      );
      continue;
    }

    // 6. Raw HTML line / block tag passthrough
    if (RAW_HTML_LINE_RE.test(l)) {
      if (!/^<\/?(ul|ol|li)\b/i.test(l)) closeList();
      htmlParts.push(
        applyInlineStyleDirectives(l)
          .replace(OBSIDIAN_IMG_REGEX, (_, inner: string) => buildEmbedTag(inner, assets, entities))
          .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, rawAlt: string, url: string) => buildImgTag(url, rawAlt, assets))
          .replace(WIKILINK_REGEX, (_, inner: string) => {
            const [target, alias] = inner.split('|').map((s: string) => s.trim());
            return `<span data-wikilink="${escapeHtml(target)}" class="wikilink-pill">[[${escapeHtml(alias || target)}]]</span>`;
          })
      );
      continue;
    }

    // 7. Standalone ![[asset-slug]] / ![[Entity Title]] embed line (with optional {modifiers})
    const obsMatch = l.match(/^!\[\[([^\]]+)\]\]\s*(?:\{([^}]+)\})?$/);
    if (obsMatch) {
      closeList();
      const combined = obsMatch[2]
        ? `${obsMatch[1]}|${obsMatch[2].replace(/[;|]+/g, '|')}`
        : obsMatch[1];
      htmlParts.push(buildEmbedTag(combined, assets, entities));
      continue;
    }

    // 8. Standalone Markdown image line
    const imgMatch = l.match(IMAGE_LINE_REGEX);
    if (imgMatch) {
      closeList();
      htmlParts.push(buildImgTag(imgMatch[2], imgMatch[1], assets));
      continue;
    }

    // 9. Obsidian Callouts: > [!note] Optional Title
    const calloutStart = l.match(/^>\s*\[!([a-zA-Z0-9_-]+)\]([+-])?\s*(.*)$/);
    if (calloutStart) {
      closeList();
      const rawType = calloutStart[1].toLowerCase();
      const meta = CALLOUT_META[rawType] || { label: rawType, tone: 'note' };
      const titleText = calloutStart[3]?.trim() || meta.label;
      const bodyLines: string[] = [];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('>')) {
        i++;
        bodyLines.push(lines[i].trim().replace(/^>\s?/, ''));
      }
      const innerHtml = bodyLines.length > 0 ? markdownToHtml(bodyLines.join('\n'), assets, entities) : '';
      htmlParts.push(
        `<div class="vault-callout vault-callout-${meta.tone}"><div class="vault-callout-header"><span class="vault-callout-badge">${escapeHtml(
          meta.label
        )}</span><span class="vault-callout-title">${formatInline(titleText)}</span></div>${
          innerHtml ? `<div class="vault-callout-body">${innerHtml}</div>` : ''
        }</div>`
      );
      continue;
    }

    // Standard block rules + trailing `{color=... size=... font=... align=...}`
    let blockStyleAttr = '';
    const trailingAttr = l.match(/\s\{([^}]+)\}\s*$/);
    const cleanedRawLine = trailingAttr ? l.replace(/\s\{([^}]+)\}\s*$/, '') : l;
    if (trailingAttr) {
      const css = buildInlineCssFromSpec(trailingAttr[1]);
      if (css) blockStyleAttr = ` style="${css}"`;
    }

    if (l === '---' || l === '***' || l === '___') {
      closeList();
      htmlParts.push('<hr class="vault-hr" />');
    } else if (cleanedRawLine.startsWith('### ')) {
      closeList();
      htmlParts.push(`<h3${blockStyleAttr}>${formatInline(cleanedRawLine.slice(4))}</h3>`);
    } else if (cleanedRawLine.startsWith('## ')) {
      closeList();
      htmlParts.push(`<h2${blockStyleAttr}>${formatInline(cleanedRawLine.slice(3))}</h2>`);
    } else if (cleanedRawLine.startsWith('# ')) {
      closeList();
      htmlParts.push(`<h1${blockStyleAttr}>${formatInline(cleanedRawLine.slice(2))}</h1>`);
    } else if (l.startsWith('> ')) {
      closeList();
      const quoteLines = [cleanedRawLine.replace(/^>\s?/, '')];
      while (
        i + 1 < lines.length &&
        lines[i + 1].trim().startsWith('>') &&
        !/^>\s*\[!/.test(lines[i + 1].trim())
      ) {
        i++;
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
      }
      htmlParts.push(
        `<blockquote${blockStyleAttr}>${quoteLines.map((ql) => `<p>${formatInline(ql)}</p>`).join('')}</blockquote>`
      );
    } else if (/^[-*]\s+\[( |x|X)\]\s+/.test(l)) {
      if (listType !== 'ul') {
        closeList();
        htmlParts.push('<ul class="vault-task-list">');
        listType = 'ul';
      }
      const checked = /^[-*]\s+\[[xX]\]/.test(l);
      const body = cleanedRawLine.replace(/^[-*]\s+\[( |x|X)\]\s+/, '');
      htmlParts.push(
        `<li class="vault-task-item"><span class="vault-checkbox ${
          checked ? 'checked' : ''
        }">${checked ? '✓' : ''}</span><span${
          checked ? ' class="line-through opacity-60"' : ''
        }>${formatInline(body)}</span></li>`
      );
    } else if (l.startsWith('- ') || l.startsWith('* ')) {
      if (listType !== 'ul') {
        closeList();
        htmlParts.push('<ul>');
        listType = 'ul';
      }
      htmlParts.push(`<li><p>${formatInline(cleanedRawLine.slice(2))}</p></li>`);
    } else if (/^\d+\.\s+/.test(l)) {
      if (listType !== 'ol') {
        closeList();
        htmlParts.push('<ol>');
        listType = 'ol';
      }
      htmlParts.push(`<li><p>${formatInline(cleanedRawLine.replace(/^\d+\.\s+/, ''))}</p></li>`);
    } else {
      closeList();
      htmlParts.push(`<p${blockStyleAttr}>${formatInline(cleanedRawLine)}</p>`);
    }
  }

  closeList();
  return sanitizeNoteHtml(htmlParts.join(''));
}

/**
 * Converts HTML back to readable Markdown preserving [[WikiLinks]] and ![alt|opacity](asset://slug).
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  if (!html.trim().startsWith('<')) return html;

  return html
    .replace(/<img[^>]*>/gi, (tag) => {
      const refMatch = tag.match(/data-asset-ref="([^"]+)"/i);
      const srcMatch = tag.match(/src="([^"]+)"/i);
      const altMatch = tag.match(/alt="([^"]*)"/i);
      const opMatch = tag.match(/data-opacity="([^"]+)"/i);
      const targetSrc = refMatch ? refMatch[1] : srcMatch ? srcMatch[1] : '';
      const alt = altMatch ? altMatch[1] : '';
      const op = opMatch ? parseFloat(opMatch[1]) : 1;
      if (!targetSrc) return '';
      const altSpec =
        op < 0.99 ? `${alt ? `${alt}|` : ''}opacity=${Math.round(op * 100)}` : alt;
      return `\n\n![${altSpec}](${targetSrc})\n\n`;
    })
    .replace(/<span[^>]*data-wikilink="([^"]+)"[^>]*>.*?<\/span>/gi, '[[$1]]')
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<blockquote[^>]*><p>(.*?)<\/p><\/blockquote>/gi, '> $1\n\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<li[^>]*><p>(.*?)<\/p><\/li>/gi, '- $1\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<ul[^>]*>/gi, '')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
