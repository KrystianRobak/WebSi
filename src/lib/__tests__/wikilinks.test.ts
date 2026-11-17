import { describe, expect, it } from 'vitest';
import {
  extractWikiLinkTargets,
  markdownToHtml,
  sanitizeNoteHtml,
  scopeCustomCss,
} from '../wikilinks';

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

  it('extracts [[WikiLink]] targets and renders wikilink pills', () => {
    const md = 'Visited [[Silverhaven]] and spoke with [[Vaelor|High Marshal]].';
    expect(extractWikiLinkTargets(md)).toEqual(['Silverhaven', 'Vaelor']);
    const html = markdownToHtml(md);
    expect(html).toContain('data-wikilink="Silverhaven"');
    expect(html).toContain('[[High Marshal]]');
  });

  it('sanitizes dangerous markdown image src values', () => {
    const md = '![bad](javascript:alert(1))';
    const html = markdownToHtml(md);
    expect(html).not.toContain('javascript:');
  });
});
