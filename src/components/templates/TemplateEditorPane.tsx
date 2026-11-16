import React, { useMemo, useState } from 'react';
import { Code2, Columns2, Eye, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import { DEFAULT_TEMPLATES } from '../../data/templates';
import { markdownToHtml, parseNoteMarkdownStyleBlock, scopeCustomCss } from '../../lib/wikilinks';
import { useVaultStore } from '../../store/useVaultStore';
import { EntityType } from '../../types/vault';
import { EntityIcon } from '../common/EntityIcon';

export const TemplateEditorPane: React.FC<{ entityType: EntityType }> = ({ entityType }) => {
  const { templates, assets, entities, updateTemplate, resetTemplate } = useVaultStore();
  const tpl = templates[entityType] || DEFAULT_TEMPLATES[entityType];

  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  const scopeClass = `tpl-preview-${entityType.toLowerCase()}`;
  const scopedCss = useMemo(() => scopeCustomCss(tpl.customCss || '', scopeClass), [tpl.customCss, scopeClass]);
  const previewHtml = useMemo(
    () => markdownToHtml(tpl.content, assets, entities),
    [tpl.content, assets, entities]
  );
  const { noteVars } = useMemo(() => parseNoteMarkdownStyleBlock(tpl.content), [tpl.content]);

  return (
    <div className="h-full bg-[#101318] flex flex-col overflow-y-auto p-5">
      <div className="max-w-6xl w-full mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1d222b] pb-3.5">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-[#171b22] border border-[#d4a853]/40 text-[#d4a853]">
              <EntityIcon type={entityType} className="w-5 h-5" />
            </span>
            <div>
              <div className="text-[10.5px] font-mono uppercase tracking-wider text-[#d4a853]">
                Record Template • {entityType}
              </div>
              <input
                value={tpl.label}
                onChange={(e) => updateTemplate(entityType, { label: e.target.value })}
                className="bg-transparent font-serif text-xl font-bold text-[#f5efe2] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#0f1218] p-0.5 rounded-lg border border-[#1d232e]">
              <button
                onClick={() => setViewMode('split')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'split'
                    ? 'bg-[#1c212b] text-[#f3d488] border border-[#d4a853]/35'
                    : 'text-[#7e8796] hover:text-[#e7e2d8] border border-transparent'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span>Live Split</span>
              </button>
              <button
                onClick={() => setViewMode('edit')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'edit'
                    ? 'bg-[#1c212b] text-[#f3ead8] border border-[#d4a853]/35'
                    : 'text-[#7e8796] hover:text-[#e7e2d8] border border-transparent'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Properties</span>
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'preview'
                    ? 'bg-gradient-to-b from-[#2b2417] to-[#1d1810] text-[#f3d488] border border-[#d4a853]/50'
                    : 'text-[#7e8796] hover:text-[#e7e2d8] border border-transparent'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
            </div>

            <button
              onClick={() => resetTemplate(entityType)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0f1218] border border-[#1d232e] hover:border-[#d4a853]/50 text-xs text-[#c9c3b8] transition-colors"
              title="Restore built-in default template"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#d4a853]" />
              <span>Reset Default</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-[#8b93a1]">
          Any new <strong className="text-[#f0cf85]">{entityType}</strong> created from{' '}
          <code className="text-[#d4a853]">+ New Entry</code> or the sidebar will start pre-filled
          with these frontmatter attributes, Markdown/HTML layout, and scoped CSS styles.
        </p>

        {viewMode === 'split' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {scopedCss && <style>{scopedCss}</style>}
            <div className="rounded-lg bg-[#0b0d10] border border-[#1d222b] p-4 space-y-2">
              <div className="text-[10.5px] font-mono uppercase tracking-wider text-[#d4a853]">
                Template Markdown Source
              </div>
              <textarea
                rows={18}
                value={tpl.content}
                onChange={(e) => updateTemplate(entityType, { content: e.target.value })}
                className="w-full bg-transparent font-mono text-[12.5px] leading-relaxed text-[#e0dacd] focus:outline-none resize-y"
              />
            </div>
            <div className="surface-card rounded-xl overflow-hidden min-h-[380px]">
              <div className="px-4 py-2 border-b border-[#1d222b] text-[10px] font-mono uppercase tracking-wider text-[#d4a853]">
                Live Preview
              </div>
              <div
                style={noteVars as React.CSSProperties}
                className={`tiptap ${scopeClass} p-5`}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        ) : viewMode === 'preview' ? (
          <div className="space-y-4">
            {scopedCss && <style>{scopedCss}</style>}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[#1f2533] border border-[#242b3a] rounded-xl overflow-hidden">
              {Object.entries(tpl.metadata).map(([k, v]) => (
                <div key={k} className="bg-[#0f131b]/92 px-3.5 py-2.5">
                  <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#838b9b]">
                    {k}
                  </div>
                  <div className="text-xs font-medium text-[#f4ece0]">{String(v)}</div>
                </div>
              ))}
            </div>
            <div className="surface-card rounded-xl overflow-hidden">
              <div className="gold-hairline opacity-75" />
              <div
                style={noteVars as React.CSSProperties}
                className={`tiptap ${scopeClass} p-6 sm:p-7`}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Default Summary & Tags */}
            <div className="surface-card rounded-xl p-4 space-y-3">
              <div>
                <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-[#7c8594] mb-1">
                  Default Summary Placeholder
                </label>
                <input
                  value={tpl.summaryPlaceholder}
                  onChange={(e) =>
                    updateTemplate(entityType, { summaryPlaceholder: e.target.value })
                  }
                  className="w-full bg-[#0b0d10] border border-[#242a35] rounded px-3 py-1.5 text-xs text-[#e7e2d8] focus:outline-none focus:border-[#d4a853]"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-[#7c8594] mb-1">
                  Default Tags (comma separated)
                </label>
                <input
                  value={tpl.defaultTags.join(', ')}
                  onChange={(e) =>
                    updateTemplate(entityType, {
                      defaultTags: e.target.value
                        .split(',')
                        .map((s) => s.trim().toLowerCase())
                        .filter(Boolean),
                    })
                  }
                  className="w-full bg-[#0b0d10] border border-[#242a35] rounded px-3 py-1.5 font-mono text-xs text-[#e7e2d8] focus:outline-none focus:border-[#d4a853]"
                />
              </div>
            </div>

            {/* Default Frontmatter Fields */}
            <div className="rounded-lg bg-[#141820] border border-[#1f2530] p-4 space-y-2.5">
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#7c8594]">
                Default Frontmatter Attributes
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(tpl.metadata).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-2 bg-[#0b0d10] border border-[#1d222b] rounded px-2.5 py-1.5"
                  >
                    <span className="text-[11px] text-[#8b93a1] truncate">{k}</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        value={String(v)}
                        onChange={(e) =>
                          updateTemplate(entityType, {
                            metadata: { ...tpl.metadata, [k]: e.target.value },
                          })
                        }
                        className="bg-transparent text-right text-xs text-[#f0e9db] focus:outline-none w-32"
                      />
                      <button
                        onClick={() => {
                          const next = { ...tpl.metadata };
                          delete next[k];
                          updateTemplate(entityType, { metadata: next });
                        }}
                        className="text-[#5e6675] hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newKey.trim()) return;
                  updateTemplate(entityType, {
                    metadata: { ...tpl.metadata, [newKey.trim()]: newVal.trim() },
                  });
                  setNewKey('');
                  setNewVal('');
                }}
                className="flex items-center gap-2 pt-1"
              >
                <input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Field name (e.g. Ancestry)"
                  className="flex-1 bg-[#0b0d10] border border-[#1d222b] rounded px-2.5 py-1 text-xs text-[#e7e2d8] focus:outline-none focus:border-[#d4a853]"
                />
                <input
                  value={newVal}
                  onChange={(e) => setNewVal(e.target.value)}
                  placeholder="Default value"
                  className="flex-1 bg-[#0b0d10] border border-[#1d222b] rounded px-2.5 py-1 text-xs text-[#e7e2d8] focus:outline-none focus:border-[#d4a853]"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 rounded bg-[#1a1f28] border border-[#2a3140] text-[#d4a853] hover:border-[#d4a853]"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

            {/* Template Markdown + HTML Body */}
            <div className="rounded-lg bg-[#0b0d10] border border-[#1d222b] p-4 space-y-2">
              <div className="text-[10.5px] font-mono uppercase tracking-wider text-[#d4a853]">
                Template Markdown &amp; HTML Layout ([[WikiLinks]] &amp; ![[Assets]] Supported)
              </div>
              <textarea
                rows={12}
                value={tpl.content}
                onChange={(e) => updateTemplate(entityType, { content: e.target.value })}
                className="w-full bg-transparent font-mono text-[12.5px] leading-relaxed text-[#e0dacd] focus:outline-none resize-y"
              />
            </div>

            {/* Template Scoped CSS */}
            <div className="rounded-lg bg-[#0b0d10] border border-[#1d222b] p-4 space-y-2">
              <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider text-[#d4a853]">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Template Scoped CSS</span>
                </span>
                <span className="text-[#6d7685]">Automatically scoped to notes using it</span>
              </div>
              <textarea
                rows={6}
                value={tpl.customCss}
                onChange={(e) => updateTemplate(entityType, { customCss: e.target.value })}
                placeholder=".my-callout { border: 1px solid #d4a853; padding: 0.75rem; }"
                className="w-full bg-transparent font-mono text-[12px] leading-relaxed text-[#c9d1d9] focus:outline-none resize-y"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
