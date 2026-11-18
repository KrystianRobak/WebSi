import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Code2,
  Columns2,
  Layers,
  Link2,
  MapPin,
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
  formatEntityTypeLabel,
  getEntityAppearance,
  getEntityCustomCss,
  getVisibleMetadataEntries,
  markdownToHtml,
  parseNoteMarkdownStyleBlock,
  scopeCustomCss,
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

const COVER_HEIGHT_CLASS: Record<'md' | 'lg' | 'xl', string> = {
  md: 'h-44',
  lg: 'h-60',
  xl: 'h-76',
};

export const NoteEditorPane: React.FC<{ entityId: string }> = ({ entityId }) => {
  const {
    entities,
    assets,
    mapPins,
    maps,
    editorMode,
    setEditorMode,
    gmMode,
    myRole,
    isEffectiveGm,
    updateEntity,
    deleteEntity,
    toggleFavorite,
    addAsset,
    openEntityByTitle,
    openMapTab,
    setSelectedPinId,
    rightInspectorCollapsed,
  } = useVaultStore();

  const canGmEdit = isEffectiveGm();
  const entity = entities.find((e) => e.id === entityId);

  const [codeSubMode, setCodeSubMode] = useState<GrimoireCodeSubMode>('split');
  const [syncScroll, setSyncScroll] = useState(true);
  const [showPropertiesDrawer, setShowPropertiesDrawer] = useState(false);

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

  const updateAppearance = (patch: Record<string, string | number>) => {
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
    const found = entities.find((ent) => ent.title.toLowerCase() === linkTitle.toLowerCase());
    if (found) {
      const rect = target.getBoundingClientRect();
      setHoverPreview({ entity: found, x: rect.left, y: rect.bottom + 8 });
    }
  };

  const handleWikiClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('[data-wikilink]') as HTMLElement | null;
    if (target) {
      const linkTitle = target.getAttribute('data-wikilink');
      if (linkTitle) {
        e.preventDefault();
        openEntityByTitle(linkTitle);
      }
    }
  };

  const coverHeightCls = COVER_HEIGHT_CLASS[appearance.coverHeight];
  const showReadMode = editorMode === 'preview' || !canGmEdit;
  const isGmPreviewingAsPlayer = (myRole === 'gm' || myRole === 'co_gm') && !gmMode;

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
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-[#040507]/50 via-[#06080b]/75 to-[#040507]/92" />
      )}

      {showReadMode ? (
        <div className="relative z-10 flex-1 overflow-y-auto">
          {isGmPreviewingAsPlayer && (
            <div className="px-4 py-1.5 bg-[#0f141e] border-b border-sky-500/25 flex items-center justify-center gap-2 text-[11.5px] text-sky-200/90">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>Player View Active — GM secrets &amp; hidden map pins are masked.</span>
            </div>
          )}
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
              <div className="w-full h-full bg-gradient-to-r from-[#080a0e] via-[#0c0f15] to-[#06080b]" />
            )}
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#06070a] via-[#06070a]/75 to-transparent pointer-events-none" />

            <div className="absolute top-3 right-4 flex items-center gap-1.5">
              {canGmEdit && (
                <>
                  <button
                    onClick={() => {
                      setEditorMode('code');
                      setCodeSubMode('split');
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md dark-glass text-[11.5px] font-medium text-[#d6b16a] hover:border-[#b68d40]"
                  >
                    <Columns2 className="w-3.5 h-3.5" />
                    <span>Edit in Split</span>
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

            <div
              className={`absolute bottom-4 left-6 right-6 mx-auto transition-all duration-300 ease-out ${
                rightInspectorCollapsed ? 'max-w-[1360px]' : 'max-w-5xl'
              }`}
            >
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
              </div>
              <h1 className="font-serif text-3xl font-bold text-[#ede5d6] drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] tracking-wide">
                {entity.title}
              </h1>
            </div>
          </div>

          <div
            className={`py-6 mx-auto space-y-6 transition-all duration-300 ease-out ${
              rightInspectorCollapsed
                ? 'max-w-[1360px] px-8 sm:px-12'
                : 'max-w-5xl px-6 sm:px-8'
            } ${scopeClass}`}
          >
            {(entity.summary || entity.tags.length > 0) && (
              <div className="space-y-3">
                {entity.summary && (
                  <p className="font-editorial text-[17.5px] leading-relaxed text-[#ded8cc] border-l-2 border-[#b68d40]/60 pl-4 py-0.5 italic">
                    {entity.summary}
                  </p>
                )}
                {entity.tags.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1.5 pl-4">
                    {entity.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full bg-[#090b10]/90 border border-[#171c25] text-[10.5px] font-mono text-[#b5a788]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {visibleMetadata.length > 0 && (
              <div className="border-t border-b border-[#131720] py-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1.5">
                  {visibleMetadata.map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-baseline justify-between gap-3 py-1 border-b border-[#10141c]/80"
                    >
                      <span className="text-[11px] font-mono text-[#737c8c] truncate">{k}</span>
                      <span className="text-[12.5px] font-medium text-[#e5ded0] text-right truncate">
                        {String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              style={noteVars as React.CSSProperties}
              className="tiptap py-2 rounded-md"
              onMouseOver={handleWikiMouseOver}
              onMouseLeave={() => setHoverPreview(null)}
              onClick={handleWikiClick}
              dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }}
            />

            {canGmEdit && entity.gm_secrets && (
              <div className="border-l-2 border-red-500/60 bg-red-950/15 px-4 py-3 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span>GM Secret</span>
                </div>
                <p className="text-[13px] text-red-100/90 leading-relaxed whitespace-pre-wrap">
                  {entity.gm_secrets}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex-1 flex flex-col min-h-0">
          <div className="relative z-30 h-[40px] px-3 border-b border-[#12161e] bg-[#050608]/98 flex items-center justify-between gap-2 shrink-0">
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
        <div
          style={{
            position: 'fixed',
            left: Math.min(hoverPreview.x, window.innerWidth - 300),
            top: Math.min(hoverPreview.y, window.innerHeight - 230),
          }}
          className="z-50 w-72 rounded-lg dark-glass shadow-glass p-3 pointer-events-none"
        >
          {hoverPreview.entity.cover_image_url && (
            <div className="h-24 w-full rounded overflow-hidden mb-2 border border-[#171c25]">
              <img
                src={hoverPreview.entity.cover_image_url}
                alt={hoverPreview.entity.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="flex items-center gap-2 mb-1">
            <EntityIcon type={hoverPreview.entity.type} className="w-3.5 h-3.5 text-[#c9a050]" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[#c9a050]">
              {hoverPreview.entity.type}
            </span>
          </div>
          <div className="font-serif text-sm font-semibold text-[#e8dfd0] mb-1">
            {hoverPreview.entity.title}
          </div>
          <p className="text-[11.5px] text-[#aba496] leading-snug line-clamp-3">
            {hoverPreview.entity.summary}
          </p>
        </div>
      )}
    </div>
  );
};
