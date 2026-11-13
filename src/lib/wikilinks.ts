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

function pushCssDeclaration(declarations: string[], rawKey: string, rawVal: string) {
  const k = rawKey.trim().toLowerCase();
  const v = sanitizeStyleToken(rawVal.replace(/^['"]|['"]$/g, ''));
  if (!v) return;
  if (k === 'color' || k === 'c') declarations.push(`color: ${v}`);
  else if (k === 'size' || k === 'font-size' || k === 'fs') {
    declarations.push(`font-size: ${/^\d+$/.test(v) ? `${v}px` : v}`);
  } else if (k === 'font' || k === 'font-family' || k === 'ff') {
    declarations.push(`font-family: ${v}`);
  } else if (k === 'bg' || k === 'background' || k === 'background-color') {
    declarations.push(`background-color: ${v}; padding: 0.06em 0.35em; border-radius: 4px`);
  } else if (k === 'align' || k === 'text-align') {
    declarations.push(`text-align: ${v}`);
  } else if (k === 'weight' || k === 'font-weight') {
    declarations.push(`font-weight: ${v}`);
  } else if (k === 'line-height' || k === 'lh') {
    declarations.push(`line-height: ${v}`);
  } else if (k === 'letter-spacing' || k === 'tracking') {
    declarations.push(`letter-spacing: ${v}`);
  }
}

function buildInlineCssFromSpec(spec: string): string {
  const declarations: string[] = [];
  const parts = spec.split(/[;|]/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const kvRegex = /([a-zA-Z][a-zA-Z0-9-]*)\s*[:=]\s*("(?:[^"]*)"|'(?:[^']*)'|[^\s;|]+)/g;
    const matches = Array.from(part.matchAll(kvRegex));

    // Single `key: value with spaces` pair (e.g. `font-family: Cinzel, serif`)
    if (matches.length === 1 && /^\s*[a-zA-Z][a-zA-Z0-9-]*\s*[:=]/.test(part) && !matches[0][2].startsWith('"') && !matches[0][2].startsWith("'")) {
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

    // Space-separated bare shorthand tokens like {#eab308 22px bold center}
    for (const tok of remainder.split(/\s+/)) {
      const t = sanitizeStyleToken(tok);
      if (!t) continue;
      if (/^#[0-9a-f]{3,8}$/i.test(t) || /^(rgb|rgba|hsl)\(/i.test(t)) {
        declarations.push(`color: ${t}`);
      } else if (/^\d+(?:\.\d+)?(px|rem|em|%)$/i.test(t)) {
        declarations.push(`font-size: ${t}`);
      } else if (t === 'bold') {
        declarations.push('font-weight: 700');
      } else if (t === 'italic') {
        declarations.push('font-style: italic');
      } else if (t === 'underline') {
        declarations.push('text-decoration: underline');
      } else if (t === 'center' || t === 'left' || t === 'right') {
        declarations.push(`text-align: ${t}`);
      }
    }
  }
  return declarations.join('; ');
}

/**
 * Extracts optional Markdown note style settings from either leading YAML style frontmatter:
 * ```md
 * ---
 * font-size: 18px
 * color: #f3ead8
 * heading-color: #eab308
 * font-family: Cinzel
 * ---
 * ```
 * or Obsidian comment style directives `%% style: color=#...; font-size=18px %%`.
 */
export function parseNoteMarkdownStyleBlock(raw: string): {
  content: string;
  noteVars: Record<string, string>;
} {
  if (!raw) return { content: '', noteVars: {} };
  const noteVars: Record<string, string> = {};
  let remaining = raw;

  // 1. Optional leading frontmatter style block
  const fmMatch = remaining.match(/^\s*---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (fmMatch) {
    const blockLines = fmMatch[1].split(/\r?\n/);
    const matchedKeys: Array<[string, string]> = [];
    for (const line of blockLines) {
      const m = line.match(/^\s*([a-zA-Z0-9_-]+)\s*:\s*(.+?)\s*$/);
      if (!m) continue;
      const cssVar = NOTE_VAR_KEY_MAP[m[1].toLowerCase()];
      const cleanVal = sanitizeStyleToken(m[2].replace(/^['"]|['"]$/g, ''));
      if (cssVar && cleanVal) {
        matchedKeys.push([cssVar, /^\d+$/.test(cleanVal) && cssVar.includes('size') ? `${cleanVal}px` : cleanVal]);
      }
    }
    if (matchedKeys.length > 0) {
      for (const [k, v] of matchedKeys) noteVars[k] = v;
      remaining = remaining.slice(fmMatch[0].length);
    }
  }

  // 2. Obsidian inline style comment lines: %% style: key=val; key2=val2 %%
  remaining = remaining.replace(/^%%\s*style\s*:\s*([\s\S]*?)\s*%%\s*$/gim, (_, spec: string) => {
    const pairs = spec.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
    for (const pair of pairs) {
      const kv = pair.match(/^([a-zA-Z0-9_-]+)\s*[:=]\s*(.+)$/);
      if (!kv) continue;
      const cssVar = NOTE_VAR_KEY_MAP[kv[1].trim().toLowerCase()];
      const cleanVal = sanitizeStyleToken(kv[2].replace(/^['"]|['"]$/g, ''));
      if (cssVar && cleanVal) {
        noteVars[cssVar] = /^\d+$/.test(cleanVal) && cssVar.includes('size') ? `${cleanVal}px` : cleanVal;
      }
    }
    return '';
  });

  return { content: remaining, noteVars };
}

const RAW_HTML_LINE_RE = /^<\/?(div|section|article|aside|header|footer|details|summary|table|thead|tbody|tr|th|td|span|p|h[1-6]|ul|ol|li|blockquote|hr|br|img|figure|figcaption|strong|em|b|i|u|code|pre|style|font)\b/i;

/**
 * Converts mixed Markdown + HTML (with [[WikiLinks]], ![[asset]], ![alt](url), and inline `[text]{color=... size=...}` styling) into safe HTML.
 */
export function markdownToHtml(raw: string, assets: VaultAsset[] = []): string {
  if (!raw) return '<p></p>';
  const { content: withoutStyleHeader } = parseNoteMarkdownStyleBlock(raw);
  const trimmed = withoutStyleHeader.trim();
  if (!trimmed) return '<p></p>';

  const applyInlineStyleDirectives = (str: string) =>
    str.replace(/\[([^\]]+)\]\{([^}]+)\}/g, (_, text: string, spec: string) => {
      const css = buildInlineCssFromSpec(spec);
      return css ? `<span style="${css}">${text}</span>` : text;
    });

  const resolveInlineTokens = (str: string) =>
    applyInlineStyleDirectives(str)
      .replace(OBSIDIAN_IMG_REGEX, (_, inner) => buildObsidianImgTag(inner, assets))
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, rawAlt, url) => buildImgTag(url, rawAlt, assets))
      .replace(WIKILINK_REGEX, (_, inner) => {
        const [target, alias] = inner.split('|').map((s: string) => s.trim());
        return `<span data-wikilink="${target}" class="wikilink-pill">[[${alias || target}]]</span>`;
      });

  // Preserve multi-line <style>...</style> blocks verbatim before line-by-line parsing
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
    const restored = resolveInlineTokens(prepared).replace(
      /@@STYLE_BLOCK_(\d+)@@/g,
      (_, idx) => stylePlaceholders[Number(idx)] || ''
    );
    return sanitizeNoteHtml(restored);
  }

  const lines = prepared.split('\n');
  const htmlParts: string[] = [];
  let inList = false;

  for (const line of lines) {
    const l = line.trim();
    const styleMatch = l.match(/^@@STYLE_BLOCK_(\d+)@@$/);
    if (styleMatch) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(stylePlaceholders[Number(styleMatch[1])] || '');
      continue;
    }
    if (!l) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      continue;
    }

    // Raw HTML line / block tag passthrough (still resolves [[WikiLinks]] and ![[Assets]]!)
    if (RAW_HTML_LINE_RE.test(l)) {
      if (inList && !/^<\/?(ul|ol|li)\b/i.test(l)) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(resolveInlineTokens(l));
      continue;
    }

    // Pure Obsidian image embed line: ![[asset-slug]], ![[asset-slug|left|240px]], or ![[asset-slug]] {left 240px}
    const obsMatch = l.match(/^!\[\[([^\]]+)\]\]\s*(?:\{([^}]+)\})?$/);
    if (obsMatch) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      const combined = obsMatch[2] ? `${obsMatch[1]}|${obsMatch[2].replace(/[;|]+/g, '|')}` : obsMatch[1];
      htmlParts.push(buildObsidianImgTag(combined, assets));
      continue;
    }

    // Pure Markdown image line: ![alt](url)
    const imgMatch = l.match(IMAGE_LINE_REGEX);
    if (imgMatch) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(buildImgTag(imgMatch[2], imgMatch[1], assets));
      continue;
    }

    // Extract inline images & inline HTML spans BEFORE escaping stray angle brackets
    const imgPlaceholders: string[] = [];
    const withPlaceholders = l
      .replace(OBSIDIAN_IMG_REGEX, (_, inner) => {
        const idx = imgPlaceholders.length;
        imgPlaceholders.push(buildObsidianImgTag(inner, assets));
        return `@@IMG_${idx}@@`;
      })
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, rawAlt, url) => {
        const idx = imgPlaceholders.length;
        imgPlaceholders.push(buildImgTag(url, rawAlt, assets));
        return `@@IMG_${idx}@@`;
      });

    let formatted = applyInlineStyleDirectives(withPlaceholders)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(WIKILINK_REGEX, (_, inner) => {
        const [target, alias] = inner.split('|').map((s: string) => s.trim());
        return `<span data-wikilink="${target}" class="wikilink-pill">[[${alias || target}]]</span>`;
      });

    formatted = formatted.replace(/@@IMG_(\d+)@@/g, (_, idx) => imgPlaceholders[Number(idx)] || '');

    // Optional trailing block attribute: `{color=#... size=... align=center}`
    let blockStyleAttr = '';
    const trailingAttr = l.match(/\s\{([^}]+)\}\s*$/);
    const cleanedHeadingLine = trailingAttr
      ? formatted.replace(/\s\{([^}]+)\}\s*$/, '')
      : formatted;
    if (trailingAttr) {
      const css = buildInlineCssFromSpec(trailingAttr[1]);
      if (css) blockStyleAttr = ` style="${css}"`;
    }

    if (l === '---' || l === '***') {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push('<hr />');
    } else if (l.startsWith('### ')) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(`<h3${blockStyleAttr}>${cleanedHeadingLine.slice(4)}</h3>`);
    } else if (l.startsWith('## ')) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(`<h2${blockStyleAttr}>${cleanedHeadingLine.slice(3)}</h2>`);
    } else if (l.startsWith('# ')) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(`<h1${blockStyleAttr}>${cleanedHeadingLine.slice(2)}</h1>`);
    } else if (l.startsWith('> ')) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(`<blockquote${blockStyleAttr}><p>${cleanedHeadingLine.slice(2)}</p></blockquote>`);
    } else if (l.startsWith('- ') || l.startsWith('* ')) {
      if (!inList) {
        htmlParts.push('<ul>');
        inList = true;
      }
      htmlParts.push(`<li><p>${formatted.slice(2)}</p></li>`);
    } else {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(`<p${blockStyleAttr}>${cleanedHeadingLine}</p>`);
    }
  }

  if (inList) htmlParts.push('</ul>');
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
