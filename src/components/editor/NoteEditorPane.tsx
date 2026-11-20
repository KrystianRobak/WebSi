import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Code2,
  Columns2,
  Eye,
  EyeOff,
  FileText,
  Layers,
  Link2,
  ListTree,
  MapPin,
  Maximize2,
  Minimize2,
  Paintbrush,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { uploadVaultAsset } from '../../lib/supabase';
import {
  extractMarkdownHeadings,
  formatEntityTypeLabel,
  getEntityAppearance,
  getEntityCustomCss,
  getVisibleMetadataEntries,
  markdownToHtml,
  parseNoteMarkdownStyleBlock,
  scopeCustomCss,
  toggleMarkdownTaskAtIndex,
} from '../../lib/wikilinks';
import { useVaultStore } from '../../store/useVaultStore';
import { Entity } from '../../types/vault';
import { EntityIcon } from '../common/EntityIcon';
import {
  GrimoireCodeSubMode,
  GrimoireToolbarMenus,
  MarkdownGrimoireEditor,
  MarkdownGrimoireEditorHandle,
} from './MarkdownGrimoireEditor';
import { WikiLinkHoverCard } from './WikiLinkHoverCard';

const COVER_HEIGHT_CLASS: Record<'md' | 'lg' | 'xl', string> = {
  md: 'h-44',
  lg: 'h-56',
  xl: 'h-72',
};

function findMentionSnippet(content: string, targetTitle: string): string {
  if (!content) return '';
  const needle = targetTitle.toLowerCase();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase().includes(`[[${needle}`)) {
      return trimmed
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
        .replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(/^#+\s*/, '');
    }
  }
  return '';
}

export const NoteEditorPane: React.FC<{ entityId: string }> = ({ entityId }) => {
  const {
    entities,
    entityLinks,
    assets,
    mapPins,
    maps,
    editorMode,
    setEditorMode,
    gmMode,
    myRole,
    isEffectiveGm,
    updateEntity,
    toggleEntityPlayerVisibility,
    deleteEntity,
    toggleFavorite,
    addAsset,
    openEntityByTitle,
    openEntityTab,
    openMapTab,
    setSelectedPinId,
    rightInspectorCollapsed,
  } = useVaultStore();

  const canGmEdit = isEffectiveGm();
  const entity = entities.find((e) => e.id === entityId);

  const [codeSubMode, setCodeSubMode] = useState<GrimoireCodeSubMode>('split');
  const [syncScroll, setSyncScroll] = useState(true);
  const [showPropertiesDrawer, setShowPropertiesDrawer] = useState(false);
  const [readableWidth, setReadableWidth] = useState(true);
  const [showOutline, setShowOutline] = useState(true);
  const [backlinksOpen, setBacklinksOpen] = useState(true);

  const [titleDraft, setTitleDraft] = useState(entity?.title || '');
  const [summaryDraft, setSummaryDraft] = useState(entity?.summary || '');
  const [secretDraft, setSecretDraft] = useState(entity?.gm_secrets || '');
  const [rawMarkdown, setRawMarkdown] = useState(entity?.content || '');
  const [customCssDraft, setCustomCssDraft] = useState(
    entity ? getEntityCustomCss(entity.metadata) : ''
  );
  const [newTag, setNewTag] = useState('');
  const [newMetaKey, setNewMetaKey] = useState('');
  const [newMetaVal, setNewMetaVal] = useState('');

  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);

  const [hoverPreview, setHoverPreview] = useState<{
    entity: Entity;
    x: number;
    y: number;
  } | null>(null);

  const editorHandleRef = useRef<MarkdownGrimoireEditorHandle>(null);
  const readScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!entity) return;
    setTitleDraft(entity.title);
    setSummaryDraft(entity.summary);
    setSecretDraft(entity.gm_secrets);
    setRawMarkdown(entity.content);
    setCustomCssDraft(getEntityCustomCss(entity.metadata));
  }, [entityId, entity]);

  const readMarkdownBody = useMemo(() => {
    if (!entity?.title) return rawMarkdown;
    const lines = rawMarkdown.split(/\r?\n/);
    const firstNonEmptyIdx = lines.findIndex((l) => l.trim().length > 0);
    if (firstNonEmptyIdx === -1) return rawMarkdown;
    const headingMatch = lines[firstNonEmptyIdx].trim().match(/^#\s+(.+)$/);
    if (
      headingMatch &&
      headingMatch[1].trim().toLowerCase() === entity.title.trim().toLowerCase()
    ) {
      return [
        ...lines.slice(0, firstNonEmptyIdx),
        ...lines.slice(firstNonEmptyIdx + 1),
      ]
        .join('\n')
        .replace(/^\s*\n/, '');
    }
    return rawMarkdown;
  }, [rawMarkdown, entity?.title]);

  const headings = useMemo(
    () => extractMarkdownHeadings(readMarkdownBody),
    [readMarkdownBody]
  );

  const renderedPreviewHtml = useMemo(
    () => markdownToHtml(readMarkdownBody, assets, entities),
    [readMarkdownBody, assets, entities]
  );
  const { noteVars } = useMemo(
    () => parseNoteMarkdownStyleBlock(rawMarkdown),
    [rawMarkdown]
  );
  const scopeClass = `note-scope-${(entity?.id || entityId).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const scopedCss = useMemo(
    () => scopeCustomCss(customCssDraft, scopeClass),
    [customCssDraft, scopeClass]
  );

  const incomingBacklinks = useMemo(() => {
    if (!entity) return [];
    return entityLinks
      .filter((l) => l.target_id === entity.id)
      .map((l) => entities.find((e) => e.id === l.source_id))
      .filter((e): e is Entity => Boolean(e))
      .map((src) => ({
        entity: src,
        snippet: findMentionSnippet(src.content, entity.title),
      }));
  }, [entity, entityLinks, entities]);

  const outgoingReferences = useMemo(() => {
    if (!entity) return [];
    return entityLinks
      .filter((l) => l.source_id === entity.id)
      .map((l) => entities.find((e) => e.id === l.target_id))
      .filter((e): e is Entity => Boolean(e));
  }, [entity, entityLinks, entities]);

  if (!entity) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[#7c8493]">
        Entry not found.
      </div>
    );
  }

  const entityIsGmOnly = Boolean(
    entity.metadata?.is_gm_only || (entity as { is_gm_only?: boolean }).is_gm_only
  );
  if (!canGmEdit && entityIsGmOnly) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[#7c8493]">
        This entry is hidden in Player View.
      </div>
    );
  }

  const appearance = getEntityAppearance(entity.metadata, assets);
  const visibleMetadata = getVisibleMetadataEntries(entity.metadata);
  const linkedPins = mapPins.filter((p) => p.entity_id === entity.id && (canGmEdit || !p.is_gm_only));
  const wordCount = rawMarkdown.trim() ? rawMarkdown.trim().split(/\s+/).length : 0;
  const readTimeMin = Math.max(1, Math.ceil(wordCount / 200));

  const updateAppearance = (patch: Record<string, string | number | boolean>) => {
    if (!canGmEdit) return;
    updateEntity(entity.id, {
      metadata: {
        ...entity.metadata,
        ...patch,
      },
    });
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canGmEdit) return;
    setUploadingCover(true);
    try {
      const url = await uploadVaultAsset(file, 'covers');
      addAsset({ name: file.name.replace(/\.[^.]+$/, ''), url, kind: 'portrait' });
      updateEntity(entity.id, { cover_image_url: url });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canGmEdit) return;
    setUploadingBg(true);
    try {
      const url = await uploadVaultAsset(file, 'backgrounds');
      const created = addAsset({
        name: file.name.replace(/\.[^.]+$/, ''),
        url,
        kind: 'scene',
      });
      updateAppearance({ _bg_image: `asset://${created.slug}` });
    } finally {
      setUploadingBg(false);
    }
  };

  const handleWikiMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('[data-wikilink]') as HTMLElement | null;
    if (!target) {
      if (hoverPreview) setHoverPreview(null);
      return;
    }
    const linkTitle = target.getAttribute('data-wikilink');
    if (!linkTitle) return;
    const found = entities.find(
      (ent) =>
        ent.title.toLowerCase() === linkTitle.toLowerCase() ||
        ent.slug.toLowerCase() === linkTitle.toLowerCase()
    );
    if (found) {
      const rect = target.getBoundingClientRect();
      setHoverPreview({ entity: found, x: rect.left, y: rect.bottom + 8 });
    } else if (hoverPreview) {
      setHoverPreview(null);
    }
  };

  const handleReadBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 1. Interactive checklist toggling in Read Mode
    const checkboxEl = (e.target as HTMLElement).closest('[data-task-index]') as HTMLElement | null;
    if (checkboxEl && canGmEdit) {
      e.preventDefault();
      const idx = Number(checkboxEl.getAttribute('data-task-index'));
      if (!Number.isNaN(idx)) {
        // Compute offset if H1 matching entity title was stripped in readMarkdownBody
        const hadStrippedH1 = readMarkdownBody !== rawMarkdown;
        const nextBody = toggleMarkdownTaskAtIndex(readMarkdownBody, idx);
        const nextFull = hadStrippedH1
          ? `# ${entity.title}\n\n${nextBody}`
          : nextBody;
        setRawMarkdown(nextFull);
        updateEntity(entity.id, { content: nextFull });
      }
      return;
    }

    // 2. Bracketless WikiLink navigation (or stub creation when unresolved in Studio)
    const target = (e.target as HTMLElement).closest('[data-wikilink]') as HTMLElement | null;
    if (target) {
      const linkTitle = target.getAttribute('data-wikilink');
      if (linkTitle) {
        e.preventDefault();
        openEntityByTitle(linkTitle);
      }
    }
  };

  const scrollToHeading = (headingId: string) => {
    const container = readScrollRef.current;
    if (!container) return;
    const el = container.querySelector(`#${CSS.escape(headingId)}`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const coverHeightCls = COVER_HEIGHT_CLASS[appearance.coverHeight];
  const showReadMode = editorMode === 'preview' || !canGmEdit;
  const isGmPreviewingAsPlayer = (myRole === 'gm' || myRole === 'co_gm') && !gmMode;
  const hasOutline = headings.length >= 2;
  const widthClass = readableWidth
    ? 'max-w-[800px] px-6 sm:px-10'
    : rightInspectorCollapsed
    ? 'max-w-[1360px] px-8 sm:px-12'
    : 'max-w-5xl px-6 sm:px-8';

  return (
    <div className="relative h-full bg-[#06070a] flex flex-col overflow-hidden">
      {scopedCss && <style>{scopedCss}</style>}

      {appearance.bgImage && (
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center transition-opacity duration-200"
          style={{
            backgroundImage: `url("${appearance.bgImage}")`,
            opacity: appearance.bgOpacity,
          }}
        />
      )}
      {appearance.bgImage && (
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-[#040507]/50 via-[#06080b]/78 to-[#040507]/94" />
      )}

      {showReadMode ? (
        <div ref={readScrollRef} className="relative z-10 flex-1 overflow-y-auto">
          {isGmPreviewingAsPlayer && (
            <div className="px-4 py-1.5 bg-[#0f141e] border-b border-sky-500/25 flex items-center justify-center gap-2 text-[11.5px] text-sky-200/90">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>Player View Active — GM secrets &amp; hidden map pins are masked.</span>
            </div>
          )}

          {/* Cover Hero */}
          <div
            className={`relative w-full ${coverHeightCls} bg-[#040507] border-b border-[#12161f] overflow-hidden`}
          >
            {entity.cover_image_url ? (
              <img
                src={entity.cover_image_url}
                alt={entity.title}
                style={{ opacity: appearance.coverOpacity }}
                className="w-full h-full object-cover object-center transition-opacity duration-150"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#0b0e16] via-[#0e121b] to-[#06080b]" />
            )}
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#06070a] via-[#06070a]/80 to-transparent pointer-events-none" />

            {/* Subtle Obsidian Floating Controls */}
            <div className="absolute top-3 right-4 flex items-center gap-1.5">
              {hasOutline && (
                <button
                  onClick={() => setShowOutline((v) => !v)}
                  title={showOutline ? 'Hide Note Outline' : 'Show Note Outline'}
                  className={`hidden xl:flex items-center gap-1 px-2 py-1 rounded-md dark-glass-subtle text-[11px] transition-colors ${
                    showOutline ? 'text-[#e2b969] border-[#d4a853]/40' : 'text-[#9aa3b2] hover:text-white'
                  }`}
                >
                  <ListTree className="w-3.5 h-3.5" />
                  <span>Outline</span>
                </button>
              )}
              <button
                onClick={() => setReadableWidth((v) => !v)}
                title={readableWidth ? 'Expand to Full Width' : 'Readable Line Width'}
                className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md dark-glass-subtle text-[11px] text-[#9aa3b2] hover:text-[#e2b969] transition-colors"
              >
                {readableWidth ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
              </button>

              {canGmEdit && (
                <>
                  <button
                    onClick={() => toggleEntityPlayerVisibility(entity.id)}
                    title={
                      entityIsGmOnly
                        ? 'Hidden from Players (click to reveal)'
                        : 'Visible to Players (click to hide)'
                    }
                    className={`flex items-center gap-1 px-2 py-1 rounded-md dark-glass-subtle text-[11px] font-medium transition-colors ${
                      entityIsGmOnly
                        ? 'text-red-300 border-red-500/40'
                        : 'text-emerald-300/90 border-emerald-500/30'
                    }`}
                  >
                    {entityIsGmOnly ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span className="hidden md:inline">{entityIsGmOnly ? 'GM Only' : 'Shared'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setEditorMode('code');
                      setCodeSubMode('split');
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md dark-glass text-[11.5px] font-medium text-[#d6b16a] hover:border-[#b68d40]"
                  >
                    <Columns2 className="w-3.5 h-3.5" />
                    <span>Edit Note</span>
                  </button>
                  <button
                    onClick={() => toggleFavorite(entity.id)}
                    className="p-1.5 rounded-md dark-glass-subtle text-[#b68d40] hover:border-[#b68d40]/50"
                    title="Favorite Entry"
                  >
                    <Star className={`w-3.5 h-3.5 ${entity.is_favorite ? 'fill-[#b68d40]' : ''}`} />
                  </button>
                </>
              )}
            </div>

            <div className={`absolute bottom-4 left-0 right-0 mx-auto transition-all duration-300 ease-out ${widthClass}`}>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#050608]/85 text-[#d6b16a] border border-[#b68d40]/45 backdrop-blur-sm">
                  <EntityIcon type={entity.type} className="w-3 h-3" />
                  {formatEntityTypeLabel(entity.type)}
                </span>
                {linkedPins.map((pin) => {
                  const mapObj = maps.find((m) => m.id === pin.map_id);
                  return (
                    <button
                      key={pin.id}
                      onClick={() => {
                        if (mapObj) {
                          openMapTab(mapObj.id);
                          setSelectedPinId(pin.id);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#050608]/85 text-[#c9a050] border border-[#b68d40]/35 hover:border-[#c9a050] backdrop-blur-sm"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>{mapObj?.name || 'Map'}</span>
                    </button>
                  );
                })}
                <span className="ml-auto hidden sm:inline-flex items-center gap-2 text-[10.5px] font-mono text-[#9ba3b3] bg-[#050608]/75 px-2 py-0.5 rounded border border-[#1a202d]">
                  <span>{wordCount} words</span>
                  <span>·</span>
                  <span>{readTimeMin} min read</span>
                </span>
              </div>
              <h1 className="font-serif text-3xl sm:text-[34px] font-bold text-[#f3ead8] drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)] tracking-wide leading-tight">
                {entity.title}
              </h1>
            </div>
          </div>

          {/* Main Reading Grid: Note Document + Optional Obsidian Outline */}
          <div className="flex justify-center gap-6 px-2 sm:px-4">
            <article
              className={`py-6 flex-1 min-w-0 space-y-6 transition-all duration-300 ease-out ${widthClass} ${scopeClass}`}
            >
              {/* Summary & Tags */}
              {(entity.summary || entity.tags.length > 0) && (
                <div className="space-y-3">
                  {entity.summary && (
                    <p className="font-editorial text-[18px] leading-relaxed text-[#e0d9cc] border-l-2 border-[#d4a853]/65 pl-4 py-0.5 italic">
                      {entity.summary}
                    </p>
                  )}
                  {entity.tags.length > 0 && (
                    <div className="flex items-center flex-wrap gap-1.5 pl-4">
                      {entity.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2.5 py-0.5 rounded-full bg-[#0a0d14]/90 border border-[#1a2130] text-[10.5px] font-mono text-[#c9a866]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Obsidian Properties Card */}
              {visibleMetadata.length > 0 && (
                <div className="rounded-xl bg-[#090c12]/80 border border-[#171d29] px-4 py-3">
                  <div className="text-[9.5px] font-mono uppercase tracking-[0.14em] text-[#7a8496] mb-2">
                    Properties
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
                    {visibleMetadata.map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-baseline justify-between gap-3 py-1 border-b border-[#121722]"
                      >
                        <span className="text-[11px] font-mono text-[#7a8496] truncate">{k}</span>
                        <span className="text-[12.5px] font-medium text-[#ebe3d4] text-right truncate">
                          {String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rendered Note Body */}
              <div
                style={noteVars as React.CSSProperties}
                className="tiptap py-1 rounded-md"
                onMouseOver={handleWikiMouseOver}
                onMouseLeave={() => setHoverPreview(null)}
                onClick={handleReadBodyClick}
                dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }}
              />

              {/* GM Secret Callout */}
              {canGmEdit && entity.gm_secrets && (
                <div className="rounded-xl border border-red-500/35 border-l-4 border-l-red-500/75 bg-red-950/15 px-4 py-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-300">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    <span>GM Secret</span>
                  </div>
                  <p className="text-[13px] text-red-100/90 leading-relaxed whitespace-pre-wrap">
                    {entity.gm_secrets}
                  </p>
                </div>
              )}

              {/* Inline Obsidian Backlinks & Outgoing References Footer */}
              {(incomingBacklinks.length > 0 || outgoingReferences.length > 0) && (
                <section className="pt-5 mt-8 border-t border-[#151b26] space-y-3">
                  <button
                    type="button"
                    onClick={() => setBacklinksOpen((v) => !v)}
                    className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.14em] text-[#9aa3b2] hover:text-[#e2b969] transition-colors"
                  >
                    {backlinksOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#d4a853]" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#d4a853]" />
                    )}
                    <span>
                      References &amp; Linked Mentions ({incomingBacklinks.length} in ·{' '}
                      {outgoingReferences.length} out)
                    </span>
                  </button>

                  {backlinksOpen && (
                    <div className="space-y-4">
                      {incomingBacklinks.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#c9a050]">
                            Linked Mentions ({incomingBacklinks.length})
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {incomingBacklinks.map(({ entity: src, snippet }) => (
                              <button
                                key={src.id}
                                type="button"
                                onClick={() => openEntityTab(src.id)}
                                className="text-left p-3 rounded-lg bg-[#0a0d14] border border-[#171d29] hover:border-[#d4a853]/45 transition-colors group"
                              >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#f0e9db] group-hover:text-[#e2b969] truncate">
                                    <EntityIcon type={src.type} className="w-3.5 h-3.5 text-[#d4a853] shrink-0" />
                                    <span className="truncate">{src.title}</span>
                                  </span>
                                  <ArrowUpRight className="w-3.5 h-3.5 text-[#5c6574] group-hover:text-[#d4a853] shrink-0" />
                                </div>
                                <p className="text-[11.5px] text-[#8d96a6] line-clamp-2 leading-snug">
                                  {snippet || src.summary || 'References this note.'}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {outgoingReferences.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#7e8796]">
                            Referenced Notes ({outgoingReferences.length})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {outgoingReferences.map((tgt) => (
                              <button
                                key={tgt.id}
                                type="button"
                                onClick={() => openEntityTab(tgt.id)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0b0e15] border border-[#1a2130] hover:border-[#d4a853]/45 text-xs text-[#e2b969] transition-colors"
                              >
                                <FileText className="w-3 h-3 text-[#b68d40]" />
                                <span>{tgt.title}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}
            </article>

            {/* Collapsible Desktop TOC / Outline Rail */}
            {hasOutline && showOutline && (
              <aside className="hidden xl:block w-52 shrink-0 py-7 pr-4">
                <div className="sticky top-6 rounded-xl bg-[#090c12]/80 border border-[#151b26] p-3 space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#8b94a5] flex items-center gap-1.5">
                    <ListTree className="w-3 h-3 text-[#d4a853]" />
                    <span>On This Page</span>
                  </div>
                  <nav className="space-y-1 max-h-[65vh] overflow-y-auto">
                    {headings.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => scrollToHeading(h.id)}
                        className={`block w-full text-left text-[11.5px] leading-snug truncate rounded px-1.5 py-1 text-[#96a0b2] hover:text-[#e2b969] hover:bg-[#121722] transition-colors ${
                          h.level === 2 ? 'pl-3' : h.level === 3 ? 'pl-5 text-[11px] text-[#7a8496]' : 'font-medium text-[#d5cebf]'
                        }`}
                      >
                        {h.text}
                      </button>
                    ))}
                  </nav>
                </div>
              </aside>
            )}
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex-1 flex flex-col min-h-0">
          <div className="relative z-30 h-[42px] px-3 border-b border-[#12161e] bg-[#050608]/98 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#0b0e14] text-[#c9a050] border border-[#b68d40]/30 shrink-0">
                <EntityIcon type={entity.type} className="w-3 h-3" />
                <span className="hidden sm:inline">{entity.type}</span>
              </span>
              <input
                aria-label="Entry Title"
                value={titleDraft}
                onChange={(e) => {
                  setTitleDraft(e.target.value);
                  updateEntity(entity.id, { title: e.target.value });
                }}
                placeholder="Untitled Entry..."
                className="flex-1 min-w-0 bg-transparent font-serif text-[16px] font-semibold text-[#ede5d6] focus:outline-none truncate"
              />
              {linkedPins.slice(0, 1).map((pin) => {
                const mapObj = maps.find((m) => m.id === pin.map_id);
                return (
                  <button
                    key={pin.id}
                    onClick={() => {
                      if (mapObj) {
                        openMapTab(mapObj.id);
                        setSelectedPinId(pin.id);
                      }
                    }}
                    className="hidden 2xl:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#0a0d12] text-[#c9a050] border border-[#191f2b] hover:border-[#b68d40]/55 shrink-0"
                    title={`Open ${mapObj?.name || 'Map'} pin`}
                  >
                    <MapPin className="w-2.5 h-2.5" />
                    <span>{mapObj?.name || 'Map'}</span>
                  </button>
                );
              })}
              <button
                onClick={() => toggleEntityPlayerVisibility(entity.id)}
                title={entityIsGmOnly ? 'GM-Only Entry (click to share with players)' : 'Shared with Players (click to hide)'}
                className={`hidden md:flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors shrink-0 ${
                  entityIsGmOnly
                    ? 'bg-red-950/35 border-red-500/35 text-red-300'
                    : 'bg-[#090b0f] border-[#151a23] text-emerald-300/90 hover:border-emerald-500/40'
                }`}
              >
                {entityIsGmOnly ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span className="hidden xl:inline">{entityIsGmOnly ? 'GM Only' : 'Shared'}</span>
              </button>
              <button
                onClick={() => setShowPropertiesDrawer((v) => !v)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors shrink-0 ${
                  showPropertiesDrawer
                    ? 'bg-[#b68d40]/15 border-[#b68d40]/45 text-[#d6b16a]'
                    : 'bg-[#090b0f] border-[#151a23] text-[#848d9c] hover:text-[#e8dfd0] hover:border-[#212835]'
                }`}
                title="Properties, Cover Art, Background, Tags, Custom CSS & GM Secrets"
              >
                <SlidersHorizontal className="w-3 h-3 text-[#b68d40]" />
                <span className="hidden lg:inline">Properties</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <GrimoireToolbarMenus editorRef={editorHandleRef} codeSubMode={codeSubMode} />

              {codeSubMode === 'split' && (
                <button
                  onClick={() => setSyncScroll((v) => !v)}
                  className={`p-1 rounded border transition-colors ${
                    syncScroll
                      ? 'bg-[#0e1219] border-[#b68d40]/35 text-[#c9a050]'
                      : 'border-transparent text-[#636c7a] hover:text-[#cfd6e2]'
                  }`}
                  title={syncScroll ? 'Scroll Sync On' : 'Scroll Sync Off'}
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>
              )}

              <div className="flex items-center bg-[#040507] p-0.5 rounded-md border border-[#131720]">
                <button
                  onClick={() => setCodeSubMode('split')}
                  title="Obsidian Side-by-Side Live Preview + Code"
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    codeSubMode === 'split'
                      ? 'bg-[#10141c] text-[#d6b16a] border border-[#b68d40]/40'
                      : 'text-[#757e8d] hover:text-[#ded8cc] border border-transparent'
                  }`}
                >
                  <Columns2 className="w-3 h-3" />
                  <span className="hidden md:inline">Split</span>
                </button>
                <button
                  onClick={() => setCodeSubMode('raw')}
                  title="Markdown & HTML Source Only"
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    codeSubMode === 'raw'
                      ? 'bg-[#10141c] text-[#d6b16a] border border-[#b68d40]/40'
                      : 'text-[#757e8d] hover:text-[#ded8cc] border border-transparent'
                  }`}
                >
                  <Code2 className="w-3 h-3" />
                  <span className="hidden lg:inline">Source</span>
                </button>
                <button
                  onClick={() => setCodeSubMode('visual')}
                  title="Rich Visual Editor"
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    codeSubMode === 'visual'
                      ? 'bg-[#10141c] text-[#d6b16a] border border-[#b68d40]/40'
                      : 'text-[#757e8d] hover:text-[#ded8cc] border border-transparent'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span className="hidden lg:inline">Visual</span>
                </button>
                <button
                  onClick={() => {
                    setShowPropertiesDrawer(false);
                    setEditorMode('preview');
                  }}
                  title="Full Reading View"
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-[#757e8d] hover:text-[#d6b16a] border border-transparent transition-all"
                >
                  <BookOpen className="w-3 h-3" />
                  <span className="hidden md:inline">Read</span>
                </button>
              </div>

              <span className="hidden xl:inline text-[10px] font-mono text-[#5d6675] px-1">
                {wordCount}w
              </span>

              <button
                onClick={() => toggleFavorite(entity.id)}
                className="p-1 rounded bg-[#090b0f] border border-[#151a23] text-[#b68d40] hover:border-[#b68d40]/50"
                title="Favorite Entry"
              >
                <Star className={`w-3.5 h-3.5 ${entity.is_favorite ? 'fill-[#b68d40]' : ''}`} />
              </button>
              <button
                onClick={() => deleteEntity(entity.id)}
                className="p-1 rounded bg-[#090b0f] border border-[#151a23] text-[#6d7686] hover:text-red-400 hover:border-red-500/40"
                title="Delete Entry"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {showPropertiesDrawer && (
            <div className="border-b border-[#12161e] bg-[#06080b]/98 px-4 py-3 max-h-[46vh] overflow-y-auto shrink-0 z-20">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="rounded-lg bg-[#090b0f] border border-[#141821] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#c9a050]">
                      Metadata &amp; Summary
                    </span>
                    <button
                      onClick={() => setShowPropertiesDrawer(false)}
                      className="text-[#6d7686] hover:text-white lg:hidden"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={summaryDraft}
                    onChange={(e) => {
                      setSummaryDraft(e.target.value);
                      updateEntity(entity.id, { summary: e.target.value });
                    }}
                    placeholder="Map tooltip & codex summary..."
                    className="w-full bg-[#040507] border border-[#141821] rounded px-2 py-1.5 text-xs text-[#ded8cc] focus:outline-none focus:border-[#b68d40]/60 resize-none"
                  />
                  <div className="flex items-center flex-wrap gap-1">
                    <Tag className="w-3 h-3 text-[#b68d40] mr-0.5" />
                    {entity.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#040507] border border-[#171c25] text-[10.5px] font-mono text-[#aba496]"
                      >
                        #{tag}
                        <button
                          onClick={() =>
                            updateEntity(entity.id, {
                              tags: entity.tags.filter((t) => t !== tag),
                            })
                          }
                          className="hover:text-red-400"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const cleaned = newTag.trim().toLowerCase().replace(/\s+/g, '-');
                        if (cleaned && !entity.tags.includes(cleaned)) {
                          updateEntity(entity.id, { tags: [...entity.tags, cleaned] });
                        }
                        setNewTag('');
                      }}
                      className="inline-flex"
                    >
                      <input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="+ tag"
                        className="w-16 bg-transparent text-[10.5px] font-mono text-[#c9a050] placeholder:text-[#525a68] focus:outline-none px-1"
                      />
                    </form>
                  </div>

                  <div className="space-y-1 pt-1 border-t border-[#12161e]">
                    {visibleMetadata.map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-center justify-between gap-2 bg-[#06080c] border border-[#1a202d] rounded-md px-2.5 py-1.5"
                      >
                        <span className="text-[11px] text-[#8b94a5] shrink-0 max-w-[42%] truncate">
                          {k}
                        </span>
                        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                          <input
                            value={String(v)}
                            onChange={(e) =>
                              updateEntity(entity.id, {
                                metadata: { ...entity.metadata, [k]: e.target.value },
                              })
                            }
                            className="bg-transparent text-right text-[11.5px] text-[#f0e9db] focus:outline-none flex-1 min-w-0"
                          />
                          <button
                            onClick={() => {
                              const nextMeta = { ...entity.metadata };
                              delete nextMeta[k];
                              updateEntity(entity.id, { metadata: nextMeta });
                            }}
                            aria-label={`Remove ${k}`}
                            className="text-[#667082] hover:text-red-400 shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!newMetaKey.trim()) return;
                        updateEntity(entity.id, {
                          metadata: { ...entity.metadata, [newMetaKey.trim()]: newMetaVal.trim() },
                        });
                        setNewMetaKey('');
                        setNewMetaVal('');
                      }}
                      className="flex items-center gap-1 pt-1"
                    >
                      <input
                        value={newMetaKey}
                        onChange={(e) => setNewMetaKey(e.target.value)}
                        placeholder="Field"
                        className="flex-1 min-w-0 bg-[#040507] border border-[#141821] rounded px-2 py-1 text-[11px] text-[#ded8cc]"
                      />
                      <input
                        value={newMetaVal}
                        onChange={(e) => setNewMetaVal(e.target.value)}
                        placeholder="Value"
                        className="flex-1 min-w-0 bg-[#040507] border border-[#141821] rounded px-2 py-1 text-[11px] text-[#ded8cc]"
                      />
                      <button
                        type="submit"
                        className="p-1 rounded bg-[#0e1218] border border-[#1c222e] text-[#c9a050]"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </form>
                  </div>
                </div>

                <div className="rounded-lg bg-[#090b0f] border border-[#141821] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#c9a050] flex items-center gap-1">
                      <Layers className="w-3 h-3" /> Cover &amp; Background
                    </span>
                    <div className="flex items-center gap-1">
                      {(['md', 'lg', 'xl'] as const).map((sz) => (
                        <button
                          key={sz}
                          onClick={() => updateAppearance({ _cover_height: sz })}
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono uppercase ${
                            appearance.coverHeight === sz
                              ? 'bg-[#9d7833] text-[#090704] font-bold'
                              : 'bg-[#0e1218] text-[#7a8291]'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <select
                      value=""
                      onChange={(e) => {
                        const chosen = assets.find((a) => a.id === e.target.value);
                        if (chosen) updateEntity(entity.id, { cover_image_url: chosen.url });
                      }}
                      className="flex-1 min-w-0 bg-[#040507] border border-[#171c25] rounded px-2 py-1 text-[11px] text-[#ded8cc]"
                    >
                      <option value="" disabled>
                        Pick Cover Art...
                      </option>
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <label className="cursor-pointer px-2 py-1 rounded bg-[#0e1218] border border-[#1c222e] text-[10.5px] text-[#c9a050] hover:border-[#b68d40]">
                      {uploadingCover ? '...' : 'Upload'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                    </label>
                  </div>
                  <div className="flex items-center gap-2 text-[10.5px] text-[#7a8291]">
                    <span className="w-20 shrink-0">Cover Alpha</span>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={appearance.coverOpacity}
                      onChange={(e) => updateAppearance({ _cover_opacity: parseFloat(e.target.value) })}
                      className="flex-1 accent-[#b68d40]"
                    />
                    <span className="font-mono text-[#c9a050] w-8 text-right">
                      {Math.round(appearance.coverOpacity * 100)}%
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1.5 border-t border-[#12161e]">
                    <select
                      value=""
                      onChange={(e) => {
                        const chosen = assets.find((a) => a.id === e.target.value);
                        if (chosen) updateAppearance({ _bg_image: `asset://${chosen.slug}` });
                      }}
                      className="flex-1 min-w-0 bg-[#040507] border border-[#171c25] rounded px-2 py-1 text-[11px] text-[#ded8cc]"
                    >
                      <option value="" disabled>
                        {appearance.bgRawRef ? 'Change Page BG...' : 'Pick Page Background...'}
                      </option>
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <label className="cursor-pointer px-2 py-1 rounded bg-[#0e1218] border border-[#1c222e] text-[10.5px] text-[#c9a050]">
                      {uploadingBg ? '...' : 'Upload'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
                    </label>
                    {appearance.bgImage && (
                      <button
                        onClick={() => updateAppearance({ _bg_image: '' })}
                        className="text-[10px] text-red-400 hover:underline px-1"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10.5px] text-[#7a8291]">
                    <span className="w-20 shrink-0">BG Alpha</span>
                    <input
                      type="range"
                      min={0}
                      max={0.85}
                      step={0.05}
                      value={appearance.bgOpacity}
                      onChange={(e) => updateAppearance({ _bg_opacity: parseFloat(e.target.value) })}
                      className="flex-1 accent-[#b68d40]"
                    />
                    <span className="font-mono text-[#c9a050] w-8 text-right">
                      {Math.round(appearance.bgOpacity * 100)}%
                    </span>
                  </div>
                </div>

                <div className="rounded-lg bg-[#090b0f] border border-[#141821] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#c9a050] flex items-center gap-1">
                      <Paintbrush className="w-3 h-3" /> Note Scoped CSS
                    </span>
                    <button
                      onClick={() => setShowPropertiesDrawer(false)}
                      className="text-[#6d7686] hover:text-white hidden lg:block"
                      title="Collapse Drawer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={customCssDraft}
                    onChange={(e) => {
                      setCustomCssDraft(e.target.value);
                      updateAppearance({ _custom_css: e.target.value });
                    }}
                    placeholder={`.vault-card { border-color: #b68d40; }\nh2 { letter-spacing: 0.08em; }`}
                    className="w-full bg-[#040507] border border-[#141821] rounded px-2 py-1.5 font-mono text-[11px] text-[#c0c8d0] focus:outline-none focus:border-[#b68d40]"
                  />

                  <div className="pt-1.5 border-t border-red-500/20 space-y-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-300">
                      <AlertTriangle className="w-3 h-3 text-red-400" />
                      GM Secret (Hidden from Players)
                    </span>
                    <textarea
                      rows={2}
                      value={secretDraft}
                      onChange={(e) => {
                        setSecretDraft(e.target.value);
                        updateEntity(entity.id, { gm_secrets: e.target.value });
                      }}
                      placeholder="Hidden GM-only traps, motives, secrets..."
                      className="w-full bg-[#130709] border border-red-500/25 rounded px-2 py-1 text-[11px] text-red-100 placeholder:text-red-300/40 focus:outline-none focus:border-red-400"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <MarkdownGrimoireEditor
            ref={editorHandleRef}
            docId={entity.id}
            value={rawMarkdown}
            updatedAt={entity.updated_at}
            codeSubMode={codeSubMode}
            syncScroll={syncScroll}
            scopeClass={scopeClass}
            coverImageUrl={entity.cover_image_url}
            coverTitle={entity.title}
            coverOpacity={appearance.coverOpacity}
            onChange={(nextMd) => {
              setRawMarkdown(nextMd);
              updateEntity(entity.id, { content: nextMd });
            }}
          />
        </div>
      )}

      {hoverPreview && (
        <WikiLinkHoverCard
          entity={hoverPreview.entity}
          x={hoverPreview.x}
          y={hoverPreview.y}
        />
      )}
    </div>
  );
};
