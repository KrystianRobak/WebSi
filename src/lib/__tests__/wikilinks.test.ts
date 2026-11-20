import { describe, expect, it } from 'vitest';
import {
  extractMarkdownHeadings,
  extractWikiLinkTargets,
  htmlToMarkdown,
  markdownToHtml,
  sanitizeNoteHtml,
  scopeCustomCss,
  toggleMarkdownTaskAtIndex,
} from '../wikilinks';
import type { Entity } from '../../types/vault';

const SAMPLE_ENTITIES: Entity[] = [
  {
    id: 'ent-1',
    world_id: 'w-1',
    slug: 'silverhaven',
    title: 'Silverhaven',
    type: 'Location',
    category: 'world',
    tags: [],
    summary: 'Harbor city',
    content: '',
    gm_secrets: '',
    metadata: {},
    is_favorite: false,
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ent-2',
    world_id: 'w-1',
    slug: 'vaelor',
    title: 'Vaelor',
    type: 'Character',
    category: 'encyclopedia',
    tags: [],
    summary: 'High Marshal',
    content: '',
    gm_secrets: '',
    metadata: {},
    is_favorite: false,
    updated_at: '2026-01-01T00:00:00Z',
  },
];

describe('wikilinks sanitization and rendering', () => {
  it('strips script tags, event handlers, javascript: and data:text/html schemes', () => {
    const dirty = `
      <p onclick="alert(1)" onerror=alert(2)>Safe text</p>
      <script>alert("xss")</script>
      <iframe src="https://evil.com"></iframe>
      <img src="javascript:alert(1)" onerror="alert(3)" />
      <a href="data:text/html,<script>alert(1)</script>">Bad link</a>
    `;
    const clean = sanitizeNoteHtml(dirty);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/<iframe/i);
    expect(clean).not.toMatch(/on(click|error)\s*=/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).not.toMatch(/data\s*:\s*text\/html/i);
    expect(clean).toContain('Safe text');
  });

  it('prevents CSS breakouts, @import, and expression() while scoping selectors', () => {
    const evilCss = `
      </style><script>alert(1)</script>
      @import url('https://evil.example/leak.css');
      body { background: expression(alert(1)); }
      h2 { color: #d4a853; }
    `;
    const scoped = scopeCustomCss(evilCss, 'note-scope-123');
    expect(scoped).not.toContain('</style>');
    expect(scoped).not.toMatch(/@import/i);
    expect(scoped).not.toMatch(/expression\s*\(/i);
    expect(scoped).toContain('.note-scope-123 h2 {');
    expect(scoped).toContain('.note-scope-123 {');
  });

  it('extracts [[WikiLink]] targets and renders clean bracketless hyperlinks with unresolved detection', () => {
    const md =
      'Visited [[Silverhaven]], spoke with [[Vaelor|High Marshal]], and heard of [[Lost Citadel]].';
    expect(extractWikiLinkTargets(md)).toEqual(['Silverhaven', 'Vaelor', 'Lost Citadel']);

    const html = markdownToHtml(md, [], SAMPLE_ENTITIES);
    expect(html).toContain('data-wikilink="Silverhaven"');
    expect(html).toContain('>Silverhaven</span>');
    expect(html).toContain('data-wikilink="Vaelor"');
    expect(html).toContain('data-wikilink-alias="High Marshal"');
    expect(html).toContain('>High Marshal</span>');
    expect(html).toContain('wikilink-unresolved');
    expect(html).toContain('>Lost Citadel</span>');
    expect(html).not.toContain('[[');
    expect(html).not.toContain(']]');

    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('[[Silverhaven]]');
    expect(roundTrip).toContain('[[Vaelor|High Marshal]]');
  });

  it('indexes task checkboxes and toggles them cleanly outside fenced code blocks', () => {
    const md = [
      '- [ ] First quest step',
      '```md',
      '- [ ] Ignored code block item',
      '```',
      '- [x] Second quest step',
    ].join('\n');

    const html = markdownToHtml(md);
    expect(html).toContain('data-task-index="0"');
    expect(html).toContain('data-task-index="1"');

    const toggled = toggleMarkdownTaskAtIndex(md, 0);
    expect(toggled).toContain('- [x] First quest step');
    expect(toggled).toContain('- [ ] Ignored code block item');
    expect(toggled).toContain('- [x] Second quest step');
  });

  it('extracts headings for collapsible TOC outline and emits matching IDs', () => {
    const md = '# Overview\n\n## History of [[Silverhaven]]\n\n### Deep Vault';
    const headings = extractMarkdownHeadings(md);
    expect(headings).toHaveLength(3);
    expect(headings[1].text).toBe('History of Silverhaven');
    const html = markdownToHtml(md, [], SAMPLE_ENTITIES);
    expect(html).toContain(`id="${headings[1].id}"`);
  });

  it('sanitizes dangerous markdown image src values', () => {
    const md = '![bad](javascript:alert(1))';
    const html = markdownToHtml(md);
    expect(html).not.toContain('javascript:');
  });
});
