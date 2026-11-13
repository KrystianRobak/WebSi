import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  AlertTriangle,
  Bold,
  Code2,
  Eye,
  Heading2,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  Layers,
  List,
  MapPin,
  Paintbrush,
  Plus,
  Quote,
  Sliders,
  Sparkles,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { uploadVaultAsset } from '../../lib/supabase';
import {
  getEntityAppearance,
  getEntityCustomCss,
  getVisibleMetadataEntries,
  htmlToMarkdown,
  markdownToHtml,
  parseNoteMarkdownStyleBlock,
  scopeCustomCss,
} from '../../lib/wikilinks';
import { useVaultStore } from '../../store/useVaultStore';
import { Entity } from '../../types/vault';
import { EntityIcon } from '../common/EntityIcon';
import { VaultImageNode } from './ImageExtension';
import { WikiLinkNode } from './WikiLinkExtension';

interface SuggestionState {
  active: boolean;
  query: string;
  rect: DOMRect | null;
  command: ((item: { title: string }) => void) | null;
}

const COVER_HEIGHT_CLASS: Record<'md' | 'lg' | 'xl', string> = {
  md: 'h-48',
  lg: 'h-64',
  xl: 'h-80',
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
    updateEntity,
    deleteEntity,
    toggleFavorite,
    addAsset,
    openEntityByTitle,
    openMapTab,
    openAssetTab,
    setSelectedPinId,
    rightInspectorCollapsed,
  } = useVaultStore();

  const entity = entities.find((e) => e.id === entityId);

  const [codeSubMode, setCodeSubMode] = useState<'raw' | 'visual'>('raw');
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

  // Image & Opacity Controls
  const [showArtStudio, setShowArtStudio] = useState(true);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [embedModalOpen, setEmbedModalOpen] = useState(false);
  const [embedRef, setEmbedRef] = useState('');
  const [embedPreviewUrl, setEmbedPreviewUrl] = useState('');
  const [embedAlt, setEmbedAlt] = useState('');
  const [embedOpacity, setEmbedOpacity] = useState(1);
  const [uploadingEmbed, setUploadingEmbed] = useState(false);

  // Raw textarea autocomplete for [[Notes]] and ![[Assets]]
  const [rawTrigger, setRawTrigger] = useState<{
    kind: 'note' | 'asset';
    query: string;
    startIdx: number;
    endIdx: number;
  } | null>(null);

  const rawTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [suggestion, setSuggestion] = useState<SuggestionState>({
    active: false,
    query: '',
    rect: null,
    command: null,
  });
  const [selectedSuggestIdx, setSelectedSuggestIdx] = useState(0);

  // Hover preview over [[WikiLink]] pills
  const [hoverPreview, setHoverPreview] = useState<{
    entity: Entity;
    x: number;
    y: number;
  } | null>(null);

  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  const suggestionItems = useMemo(() => {
    const q = suggestion.query.toLowerCase();
    return entities
      .filter((e) => e.id !== entityId && e.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [entities, entityId, suggestion.query]);

  const rawMatches = useMemo(() => {
    if (!rawTrigger) return [];
    const q = rawTrigger.query.toLowerCase();
    if (rawTrigger.kind === 'asset') {
      return assets
        .filter((a) => a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q))
        .slice(0, 8);
    }
    return entities
      .filter((e) => e.id !== entityId && e.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [rawTrigger, assets, entities, entityId]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        VaultImageNode,
        Placeholder.configure({
          placeholder:
            'Write campaign lore... Type [[ to link any entity, or embed assets via ![[asset-slug]].',
        }),
        WikiLinkNode.configure({
          suggestion: {
            char: '[[',
            allowSpaces: true,
            items: ({ query }) => {
              const q = query.toLowerCase();
              return entitiesRef.current
                .filter((e) => e.title.toLowerCase().includes(q))
                .slice(0, 8);
            },
            render: () => ({
              onStart: (props) => {
                setSelectedSuggestIdx(0);
                setSuggestion({
                  active: true,
                  query: props.query,
                  rect: props.clientRect?.() || null,
                  command: props.command,
                });
              },
              onUpdate: (props) => {
                setSelectedSuggestIdx(0);
                setSuggestion({
                  active: true,
                  query: props.query,
                  rect: props.clientRect?.() || null,
                  command: props.command,
                });
              },
              onKeyDown: (props) => {
                if (props.event.key === 'Escape') {
                  setSuggestion((s) => ({ ...s, active: false }));
                  return true;
                }
                return false;
              },
              onExit: () => {
                setSuggestion((s) => ({ ...s, active: false }));
              },
            }),
          },
        }),
      ],
      content: markdownToHtml(entity?.content || '', assets),
      onUpdate: ({ editor: ed }) => {
        const md = htmlToMarkdown(ed.getHTML());
        setRawMarkdown(md);
        updateEntity(entityId, { content: md });
      },
    },
    [entityId]
  );

  // Sync local drafts when switching tabs or receiving realtime updates
  useEffect(() => {
    if (!entity) return;
    setTitleDraft(entity.title);
    setSummaryDraft(entity.summary);
    setSecretDraft(entity.gm_secrets);
    setRawMarkdown(entity.content);
    setCustomCssDraft(getEntityCustomCss(entity.metadata));
    if (editor && !editor.isFocused) {
      const targetHtml = markdownToHtml(entity.content, assetsRef.current);
      if (editor.getHTML() !== targetHtml) {
        editor.commands.setContent(targetHtml, false);
      }
    }
  }, [entityId, entity?.updated_at]);

  if (!entity) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[#7c8493]">
        Entry not found.
      </div>
    );
  }

  const appearance = getEntityAppearance(entity.metadata, assets);
  const visibleMetadata = getVisibleMetadataEntries(entity.metadata);
  const linkedPins = mapPins.filter((p) => p.entity_id === entity.id && (gmMode || !p.is_gm_only));
  const renderedPreviewHtml = useMemo(
    () => markdownToHtml(entity.content, assets),
    [entity.content, assets]
  );
  const { noteVars } = useMemo(
    () => parseNoteMarkdownStyleBlock(entity.content),
    [entity.content]
  );

  const scopeClass = `note-scope-${entity.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const scopedCss = useMemo(
    () => scopeCustomCss(customCssDraft, scopeClass),
    [customCssDraft, scopeClass]
  );

  const updateAppearance = (patch: Record<string, string | number>) => {
    updateEntity(entity.id, {
      metadata: {
        ...entity.metadata,
        ...patch,
      },
    });
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
    if (!file) return;
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

  const insertTokenAtCursor = (token: string) => {
    const ta = rawTextareaRef.current;
    const start = ta ? ta.selectionStart : rawMarkdown.length;
    const end = ta ? ta.selectionEnd : rawMarkdown.length;
    const nextMd = rawMarkdown.slice(0, start) + token + rawMarkdown.slice(end);
    setRawMarkdown(nextMd);
    updateEntity(entity.id, { content: nextMd });
    if (editor) {
      editor.commands.setContent(markdownToHtml(nextMd, assets), false);
    }
  };

  const insertImageIntoContent = (
    refOrUrl: string,
    resolvedDisplayUrl: string,
    alt: string,
    opacity = 1
  ) => {
    if (!refOrUrl.trim()) return;
    const cleanRef = refOrUrl.trim();
    const cleanAlt = alt.trim();

    // Use short Obsidian ![[slug]] syntax when referencing a Vault Asset!
    let mdTag = '';
    if (cleanRef.startsWith('asset://')) {
      const slug = cleanRef.replace(/^asset:\/\//, '');
      mdTag =
        opacity < 0.99
          ? `\n\n![[${slug}|opacity=${Math.round(opacity * 100)}]]\n\n`
          : `\n\n![[${slug}]]\n\n`;
    } else {
      mdTag =
        opacity < 0.99
          ? `\n\n![${cleanAlt ? `${cleanAlt}|` : ''}opacity=${Math.round(opacity * 100)}](${cleanRef})\n\n`
          : `\n\n![${cleanAlt}](${cleanRef})\n\n`;
    }

    if (codeSubMode === 'visual' && editor) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'vaultImage',
          attrs: {
            src: resolvedDisplayUrl || cleanRef,
            alt: cleanAlt,
            assetRef: cleanRef.startsWith('asset://') ? cleanRef : null,
            opacity,
          },
        })
        .run();
    } else {
      insertTokenAtCursor(mdTag);
    }
  };

  const handleEmbedFileUpload = async (file?: File) => {
    if (!file) return;
    setUploadingEmbed(true);
    try {
      const url = await uploadVaultAsset(file, 'inline');
      const created = addAsset({
        name: file.name.replace(/\.[^.]+$/, ''),
        url,
        kind: 'handout',
      });
      setEmbedRef(`asset://${created.slug}`);
      setEmbedPreviewUrl(created.url);
      if (!embedAlt) setEmbedAlt(created.name);
    } finally {
      setUploadingEmbed(false);
    }
  };

  const handlePasteOrDropImage = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const imgFile = Array.from(files).find((f) => f.type.startsWith('image/'));
    if (!imgFile) return;
    const url = await uploadVaultAsset(imgFile, 'inline');
    const created = addAsset({
      name: imgFile.name.replace(/\.[^.]+$/, ''),
      url,
      kind: 'handout',
    });
    insertImageIntoContent(`asset://${created.slug}`, created.url, created.name, 1);
  };

  const handleRawMarkdownChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart || 0;
    setRawMarkdown(val);
    updateEntity(entity.id, { content: val });
    if (editor) {
      editor.commands.setContent(markdownToHtml(val, assets), false);
    }

    // Detect ![[query or [[query before cursor
    const before = val.slice(0, cursor);
    const assetTriggerMatch = before.match(/!\[\[([^\]]*)$/);
    if (assetTriggerMatch) {
      setRawTrigger({
        kind: 'asset',
        query: assetTriggerMatch[1],
        startIdx: cursor - assetTriggerMatch[0].length,
        endIdx: cursor,
      });
      return;
    }
    const noteTriggerMatch = before.match(/(?<!\!)\[\[([^\]]*)$/);
    if (noteTriggerMatch) {
      setRawTrigger({
        kind: 'note',
        query: noteTriggerMatch[1],
        startIdx: cursor - noteTriggerMatch[0].length,
        endIdx: cursor,
      });
      return;
    }
    setRawTrigger(null);
  };

  const applyRawAutocomplete = (replacement: string) => {
    if (!rawTrigger) return;
    const nextMd =
      rawMarkdown.slice(0, rawTrigger.startIdx) +
      replacement +
      rawMarkdown.slice(rawTrigger.endIdx);
    setRawMarkdown(nextMd);
    updateEntity(entity.id, { content: nextMd });
    if (editor) {
      editor.commands.setContent(markdownToHtml(nextMd, assets), false);
    }
    setRawTrigger(null);
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

  return (
    <div className="relative h-full bg-[#101318] flex flex-col overflow-hidden">
      {/* Inject Per-Note Scoped CSS */}
      {scopedCss && <style>{scopedCss}</style>}

      {/* Optional Full-Page Background Image Layer with Custom Opacity */}
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
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-[#0b0d10]/35 via-[#0e1117]/55 to-[#0b0d10]/85" />
      )}

      {/* Main Scrollable Content */}
      <div className="relative z-10 flex-1 overflow-y-auto">
        {/* Hero Cover Art Banner */}
        <div
          className={`relative w-full ${coverHeightCls} bg-[#0b0d10] border-b border-[#1d222b] overflow-hidden`}
        >
          {entity.cover_image_url ? (
            <img
              src={entity.cover_image_url}
              alt={entity.title}
              style={{ opacity: appearance.coverOpacity }}
              className="w-full h-full object-cover object-center transition-opacity duration-150"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-[#141820] via-[#181c26] to-[#101318]" />
          )}

          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#101318] via-[#101318]/65 to-transparent pointer-events-none" />

          {/* Top-Right Cover Actions (Authoring buttons hidden cleanly in Preview Mode) */}
          <div className="absolute top-3 right-4 flex items-center gap-2">
            {editorMode === 'code' && (
              <>
                <button
                  onClick={() => setEditorMode('preview')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md dark-glass text-[11.5px] font-medium text-[#f0cf85] hover:border-[#eab308]"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>

                <label className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1 rounded-md dark-glass-subtle text-[11px] text-[#e7e2d8] hover:border-[#d4a853]/50">
                  <ImagePlus className="w-3.5 h-3.5 text-[#d4a853]" />
                  <span>{uploadingCover ? 'Uploading...' : 'Change Art'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                </label>
              </>
            )}

            <button
              onClick={() => toggleFavorite(entity.id)}
              className="p-1.5 rounded-md dark-glass-subtle text-[#d4a853] hover:border-[#d4a853]/50"
              title="Favorite Entry"
            >
              <Star className={`w-3.5 h-3.5 ${entity.is_favorite ? 'fill-[#d4a853]' : ''}`} />
            </button>

            {editorMode === 'code' && (
              <button
                onClick={() => deleteEntity(entity.id)}
                className="p-1.5 rounded-md dark-glass-subtle text-[#8b93a1] hover:text-red-400"
                title="Delete Entry"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Title & Category Badges */}
          <div
            className={`absolute bottom-4 left-6 right-6 mx-auto transition-all duration-300 ease-out ${
              rightInspectorCollapsed ? 'max-w-[1360px]' : 'max-w-6xl'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#0b0d10]/80 text-[#f0cf85] border border-[#d4a853]/50 backdrop-blur-sm">
                <EntityIcon type={entity.type} className="w-3 h-3" />
                {entity.type}
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
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#0b0d10]/80 text-[#d4a853] border border-[#d4a853]/35 hover:border-[#eab308] backdrop-blur-sm"
                  >
                    <MapPin className="w-3 h-3" />
                    <span>Pinned on {mapObj?.name || 'Map'}</span>
                  </button>
                );
              })}
            </div>

            {editorMode === 'code' ? (
              <input
                value={titleDraft}
                onChange={(e) => {
                  setTitleDraft(e.target.value);
                  updateEntity(entity.id, { title: e.target.value });
                }}
                className="w-full bg-transparent font-serif text-3xl font-bold text-[#f7f1e5] drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] focus:outline-none tracking-wide"
              />
            ) : (
              <h1 className="font-serif text-3xl font-bold text-[#f7f1e5] drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] tracking-wide">
                {entity.title}
              </h1>
            )}
          </div>
        </div>

        {/* ===================================================================== */}
        {/* PREVIEW MODE: Clean, Distraction-Free Grimoire Reading View           */}
        {/* ===================================================================== */}
        {editorMode === 'preview' ? (
          <div
            className={`py-6 mx-auto space-y-6 transition-all duration-300 ease-out ${
              rightInspectorCollapsed
                ? 'max-w-[1360px] px-8 sm:px-12'
                : 'max-w-6xl px-6 sm:px-8'
            } ${scopeClass}`}
          >
            {(entity.summary || entity.tags.length > 0) && (
              <div className="space-y-3">
                {entity.summary && (
                  <p className="font-editorial text-[17.5px] leading-relaxed text-[#e6dfd1] border-l-2 border-[#d4a853]/70 pl-4 py-0.5 italic">
                    {entity.summary}
                  </p>
                )}
                {entity.tags.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1.5 pl-4">
                    {entity.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full bg-[#131720]/85 border border-[#252c3b] text-[10.5px] font-mono text-[#c5b99b]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {visibleMetadata.length > 0 && (
              <div className="border-t border-b border-[#1d222b] py-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1.5">
                  {visibleMetadata.map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-baseline justify-between gap-3 py-1 border-b border-[#171c24]/70"
                    >
                      <span className="text-[11px] font-mono text-[#7c8594] truncate">{k}</span>
                      <span className="text-[12.5px] font-medium text-[#ede6d8] text-right truncate">
                        {String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Flat Obsidian-Style Reading Canvas (Customizable directly via Markdown) */}
            <div
              style={noteVars as React.CSSProperties}
              className="tiptap py-2 rounded-md"
              onMouseOver={handleWikiMouseOver}
              onMouseLeave={() => setHoverPreview(null)}
              onClick={handleWikiClick}
              dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }}
            />

            {gmMode && entity.gm_secrets && (
              <div className="border-l-2 border-red-500/75 bg-red-950/15 px-4 py-3 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span>GM Secret</span>
                </div>
                <p className="text-[13px] text-red-100/95 leading-relaxed whitespace-pre-wrap">
                  {entity.gm_secrets}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* =================================================================== */
          /* CODE / AUTHORING MODE: Full Controls, Assets, HTML/CSS & Editors    */
          /* =================================================================== */
          <div
            className={`py-5 mx-auto space-y-5 transition-all duration-300 ease-out ${
              rightInspectorCollapsed ? 'max-w-[1360px] px-8 sm:px-12' : 'max-w-6xl px-6'
            }`}
          >
            {/* Authoring Sub-Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#12161e]/90 border border-[#1f2530] px-3 py-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCodeSubMode('raw')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${
                    codeSubMode === 'raw'
                      ? 'bg-[#252b36] text-[#f0cf85] border border-[#d4a853]/40'
                      : 'text-[#8b93a1] hover:text-white'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Markdown / HTML Code</span>
                </button>
                <button
                  onClick={() => setCodeSubMode('visual')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${
                    codeSubMode === 'visual'
                      ? 'bg-[#252b36] text-[#f0cf85] border border-[#d4a853]/40'
                      : 'text-[#8b93a1] hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Visual Rich Text</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEmbedRef('');
                    setEmbedPreviewUrl('');
                    setEmbedAlt('');
                    setEmbedOpacity(1);
                    setEmbedModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1c212b] border border-[#d4a853]/40 hover:border-[#eab308] text-xs text-[#f0cf85]"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Link / Embed Asset</span>
                </button>
                <button
                  onClick={() => setShowArtStudio((v) => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border ${
                    showArtStudio
                      ? 'bg-[#d4a853]/15 border-[#d4a853]/50 text-[#f0cf85]'
                      : 'bg-[#171b22] border-[#242a35] text-[#9aa3b2]'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Art, BG &amp; CSS</span>
                </button>
              </div>
            </div>

            {/* Art, Background, Opacity & Custom CSS Studio */}
            {showArtStudio && (
              <div className="rounded-lg bg-[#141820]/90 border border-[#242a35] p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#d4a853] flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Art, Page Background &amp; Opacity Controls</span>
                  </span>
                  {entity.cover_image_url && (
                    <button
                      onClick={() =>
                        updateAppearance({ _bg_image: entity.cover_image_url || '' })
                      }
                      className="text-[11px] text-[#d4a853] hover:underline"
                    >
                      Use Cover Art as Page Background
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Cover Art Controls */}
                  <div className="rounded-md bg-[#0b0d10]/80 border border-[#1d222b] p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-medium text-[#e7e2d8]">
                      <span>Hero Cover Art</span>
                      <div className="flex items-center gap-1">
                        {(['md', 'lg', 'xl'] as const).map((sz) => (
                          <button
                            key={sz}
                            onClick={() => updateAppearance({ _cover_height: sz })}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                              appearance.coverHeight === sz
                                ? 'bg-[#d4a853] text-[#14110b] font-bold'
                                : 'bg-[#171b22] text-[#8b93a1]'
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value=""
                        onChange={(e) => {
                          const chosen = assets.find((a) => a.id === e.target.value);
                          if (chosen) updateEntity(entity.id, { cover_image_url: chosen.url });
                        }}
                        className="flex-1 bg-[#12161e] border border-[#232934] rounded px-2 py-1 text-[11px] text-[#e7e2d8]"
                      >
                        <option value="" disabled>
                          Pick from Vault Assets...
                        </option>
                        {assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} (![[{a.slug}]])
                          </option>
                        ))}
                      </select>
                      <label className="cursor-pointer px-2.5 py-1 rounded bg-[#1a1f28] border border-[#2a3140] text-[11px] text-[#d4a853] hover:border-[#d4a853]">
                        {uploadingCover ? '...' : 'Upload'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleCoverUpload}
                        />
                      </label>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-[#8b93a1] mb-1">
                        <span>Hero Art Opacity</span>
                        <span className="font-mono text-[#d4a853]">
                          {Math.round(appearance.coverOpacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={appearance.coverOpacity}
                        onChange={(e) =>
                          updateAppearance({ _cover_opacity: parseFloat(e.target.value) })
                        }
                        className="w-full accent-[#d4a853]"
                      />
                    </div>
                  </div>

                  {/* Page Background Controls */}
                  <div className="rounded-md bg-[#0b0d10]/80 border border-[#1d222b] p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-medium text-[#e7e2d8]">
                      <span>Full-Page Background Image</span>
                      {appearance.bgImage && (
                        <button
                          onClick={() => updateAppearance({ _bg_image: '' })}
                          className="text-[10.5px] text-red-400 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value=""
                        onChange={(e) => {
                          const chosen = assets.find((a) => a.id === e.target.value);
                          if (chosen) updateAppearance({ _bg_image: `asset://${chosen.slug}` });
                        }}
                        className="flex-1 bg-[#12161e] border border-[#232934] rounded px-2 py-1 text-[11px] text-[#e7e2d8]"
                      >
                        <option value="" disabled>
                          {appearance.bgRawRef
                            ? `Active: ${appearance.bgRawRef.slice(0, 28)}`
                            : 'Pick from Vault Assets...'}
                        </option>
                        {assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      <label className="cursor-pointer px-2.5 py-1 rounded bg-[#1a1f28] border border-[#2a3140] text-[11px] text-[#d4a853] hover:border-[#d4a853]">
                        {uploadingBg ? '...' : 'Upload'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleBgUpload}
                        />
                      </label>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-[#8b93a1] mb-1">
                        <span>Background Opacity</span>
                        <span className="font-mono text-[#d4a853]">
                          {Math.round(appearance.bgOpacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={0.85}
                        step={0.05}
                        value={appearance.bgOpacity}
                        onChange={(e) =>
                          updateAppearance({ _bg_opacity: parseFloat(e.target.value) })
                        }
                        className="w-full accent-[#d4a853]"
                      />
                    </div>
                  </div>
                </div>

                {/* Scoped Custom CSS Editor */}
                <div className="rounded-md bg-[#0b0d10]/80 border border-[#1d222b] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#d4a853] flex items-center gap-1.5">
                      <Paintbrush className="w-3.5 h-3.5" />
                      <span>Custom Note CSS (Scoped to this Note)</span>
                    </span>
                    <span className="text-[10px] font-mono text-[#6d7685]">
                      e.g. .dossier-banner, h2, blockquote
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={customCssDraft}
                    onChange={(e) => {
                      setCustomCssDraft(e.target.value);
                      updateAppearance({ _custom_css: e.target.value });
                    }}
                    placeholder={`.custom-card {\n  border: 1px solid #d4a853;\n  background: rgba(212, 168, 83, 0.08);\n  padding: 0.75rem 1rem;\n  border-radius: 8px;\n}`}
                    className="w-full bg-[#101319] border border-[#1d222b] rounded px-2.5 py-2 font-mono text-[11.5px] text-[#c9d1d9] focus:outline-none focus:border-[#d4a853]"
                  />
                </div>
              </div>
            )}

            {/* Summary & Tags Editor */}
            <div className="rounded-lg bg-[#141820]/90 border border-[#1f2530] p-3.5 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#7c8594] mb-1">
                  Map Tooltip &amp; Codex Summary
                </label>
                <textarea
                  rows={2}
                  value={summaryDraft}
                  onChange={(e) => {
                    setSummaryDraft(e.target.value);
                    updateEntity(entity.id, { summary: e.target.value });
                  }}
                  className="w-full bg-[#0b0d10] border border-[#1d222b] rounded px-2.5 py-1.5 text-xs text-[#dfd9cc] focus:outline-none focus:border-[#d4a853]/60 resize-none"
                />
              </div>

              <div className="flex items-center flex-wrap gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[#d4a853] mr-1" />
                {entity.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0b0d10] border border-[#242a36] text-[11px] font-mono text-[#b8b1a3]"
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
                  className="inline-flex items-center"
                >
                  <input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="+ tag"
                    className="w-20 bg-transparent text-[11px] font-mono text-[#d4a853] placeholder:text-[#5b6472] focus:outline-none px-1.5"
                  />
                </form>
              </div>
            </div>

            {/* Frontmatter Attributes Editor */}
            <div className="rounded-lg bg-[#141820]/90 border border-[#1f2530] p-3.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#7c8594] mb-2">
                Frontmatter Attributes
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {visibleMetadata.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-2 bg-[#0b0d10] border border-[#1d222b] rounded px-2.5 py-1.5"
                  >
                    <span className="text-[11px] text-[#8b93a1] truncate">{k}</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        value={String(v)}
                        onChange={(e) =>
                          updateEntity(entity.id, {
                            metadata: { ...entity.metadata, [k]: e.target.value },
                          })
                        }
                        className="bg-transparent text-right text-[11.5px] text-[#f0e9db] font-medium focus:outline-none w-32"
                      />
                      <button
                        onClick={() => {
                          const nextMeta = { ...entity.metadata };
                          delete nextMeta[k];
                          updateEntity(entity.id, { metadata: nextMeta });
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
                  if (!newMetaKey.trim()) return;
                  updateEntity(entity.id, {
                    metadata: { ...entity.metadata, [newMetaKey.trim()]: newMetaVal.trim() },
                  });
                  setNewMetaKey('');
                  setNewMetaVal('');
                }}
                className="mt-2.5 flex items-center gap-2"
              >
                <input
                  value={newMetaKey}
                  onChange={(e) => setNewMetaKey(e.target.value)}
                  placeholder="Attribute (e.g. Population)"
                  className="flex-1 bg-[#0b0d10] border border-[#1d222b] rounded px-2.5 py-1 text-xs text-[#e7e2d8] focus:outline-none focus:border-[#d4a853]/50"
                />
                <input
                  value={newMetaVal}
                  onChange={(e) => setNewMetaVal(e.target.value)}
                  placeholder="Value"
                  className="flex-1 bg-[#0b0d10] border border-[#1d222b] rounded px-2.5 py-1 text-xs text-[#e7e2d8] focus:outline-none focus:border-[#d4a853]/50"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 rounded bg-[#1a1f28] border border-[#2a3140] text-xs text-[#d4a853] hover:border-[#d4a853]"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

            {/* Body Editor: Raw Markdown / HTML Code OR Visual TipTap */}
            {codeSubMode === 'raw' ? (
              <div
                onDrop={(e) => {
                  if (e.dataTransfer.files?.length) {
                    e.preventDefault();
                    handlePasteOrDropImage(e.dataTransfer.files);
                  }
                }}
                onPaste={(e) => {
                  if (e.clipboardData.files?.length) {
                    e.preventDefault();
                    handlePasteOrDropImage(e.clipboardData.files);
                  }
                }}
                className="relative rounded-lg bg-[#0b0d10]/90 border border-[#1d222b] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wider text-[#d4a853] mb-2">
                  <span>
                    Markdown + HTML Source ([[Note]], ![[asset-slug]], [text]{'{'}color=#eab308 size=20px{'}'}, --- font-size/color ---)
                  </span>
                  <span className="text-[#6d7685]">Type [[ or ![[ to autocomplete</span>
                </div>
                <textarea
                  ref={rawTextareaRef}
                  value={rawMarkdown}
                  onChange={handleRawMarkdownChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && rawTrigger) {
                      setRawTrigger(null);
                    }
                  }}
                  rows={16}
                  className="w-full bg-transparent font-mono text-[13px] leading-relaxed text-[#e0dacd] focus:outline-none resize-y"
                />

                {/* Inline Autocomplete for [[Notes]] and ![[Assets]] in Code Mode */}
                {rawTrigger && rawMatches.length > 0 && (
                  <div className="mt-2 w-72 rounded-lg dark-glass shadow-glass py-1.5 border border-[#d4a853]/40">
                    <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#d4a853] border-b border-[#1d222b]">
                      {rawTrigger.kind === 'asset' ? 'Link Vault Asset' : 'Link World Entry'}
                    </div>
                    {rawMatches.map((item) => {
                      if (rawTrigger.kind === 'asset') {
                        const a = item as (typeof assets)[number];
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => applyRawAutocomplete(`![[${a.slug}]]`)}
                            className="w-full px-2.5 py-1.5 text-left flex items-center gap-2 text-xs text-[#e7e2d8] hover:bg-[#d4a853]/15"
                          >
                            <img
                              src={a.url}
                              alt={a.name}
                              className="w-5 h-5 rounded object-cover border border-[#2a3140]"
                            />
                            <span className="truncate flex-1">{a.name}</span>
                            <span className="font-mono text-[10px] text-[#d4a853]">
                              ![[{a.slug}]]
                            </span>
                          </button>
                        );
                      }
                      const ent = item as Entity;
                      return (
                        <button
                          key={ent.id}
                          type="button"
                          onClick={() => applyRawAutocomplete(`[[${ent.title}]]`)}
                          className="w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 text-xs text-[#e7e2d8] hover:bg-[#d4a853]/15"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <EntityIcon type={ent.type} className="w-3.5 h-3.5 text-[#d4a853]" />
                            <span className="truncate">{ent.title}</span>
                          </span>
                          <span className="font-mono text-[10px] text-[#7c8493]">{ent.type}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg bg-[#12161d]/90 border border-[#1d222b] overflow-hidden">
                {editor && (
                  <div className="h-9 px-4 bg-[#141821] border-b border-[#1d222b] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={`p-1.5 rounded text-xs ${
                          editor.isActive('bold')
                            ? 'bg-[#d4a853]/20 text-[#f0cf85]'
                            : 'text-[#8b93a1] hover:text-white'
                        }`}
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={`p-1.5 rounded text-xs ${
                          editor.isActive('italic')
                            ? 'bg-[#d4a853]/20 text-[#f0cf85]'
                            : 'text-[#8b93a1] hover:text-white'
                        }`}
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        className={`p-1.5 rounded text-xs ${
                          editor.isActive('heading', { level: 2 })
                            ? 'bg-[#d4a853]/20 text-[#f0cf85]'
                            : 'text-[#8b93a1] hover:text-white'
                        }`}
                      >
                        <Heading2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={`p-1.5 rounded text-xs ${
                          editor.isActive('bulletList')
                            ? 'bg-[#d4a853]/20 text-[#f0cf85]'
                            : 'text-[#8b93a1] hover:text-white'
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        className={`p-1.5 rounded text-xs ${
                          editor.isActive('blockquote')
                            ? 'bg-[#d4a853]/20 text-[#f0cf85]'
                            : 'text-[#8b93a1] hover:text-white'
                        }`}
                      >
                        <Quote className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setEmbedRef('');
                          setEmbedPreviewUrl('');
                          setEmbedAlt('');
                          setEmbedOpacity(1);
                          setEmbedModalOpen(true);
                        }}
                        className="p-1.5 rounded text-xs text-[#d4a853] hover:bg-[#d4a853]/15"
                        title="Embed Asset"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                      </button>
                      <span className="ml-2 text-[11px] text-[#6d7685] font-mono">
                        Type <span className="text-[#d4a853]">[[</span> to link
                      </span>
                    </div>
                    <span className="text-[11px] text-[#6d7685] font-mono">Auto-saved</span>
                  </div>
                )}

                <div
                  className="min-h-[260px] p-5"
                  onDrop={(e) => {
                    if (e.dataTransfer.files?.length) {
                      e.preventDefault();
                      handlePasteOrDropImage(e.dataTransfer.files);
                    }
                  }}
                  onPaste={(e) => {
                    if (e.clipboardData.files?.length) {
                      e.preventDefault();
                      handlePasteOrDropImage(e.clipboardData.files);
                    }
                  }}
                  onMouseOver={handleWikiMouseOver}
                  onMouseLeave={() => setHoverPreview(null)}
                  onClick={handleWikiClick}
                >
                  <EditorContent editor={editor} />
                </div>
              </div>
            )}

            {/* Editable [GM SECRET] Block */}
            {gmMode && (
              <div className="rounded-lg bg-[#230e13]/90 border border-red-500/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-300">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    [GM SECRET] Hidden Lore, Traps &amp; Motives
                  </span>
                  <span className="text-[10.5px] font-mono text-red-300/70">
                    Stripped when GM Mode is OFF
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={secretDraft}
                  onChange={(e) => {
                    setSecretDraft(e.target.value);
                    updateEntity(entity.id, { gm_secrets: e.target.value });
                  }}
                  placeholder="Write hidden GM-only secrets, trap DCs, or NPC betrayals..."
                  className="w-full bg-[#14080b]/80 border border-red-500/25 rounded px-3 py-2 text-xs text-red-100 placeholder:text-red-300/40 focus:outline-none focus:border-red-400"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Link / Embed Vault Asset Modal */}
      {embedModalOpen && (
        <div
          onClick={() => setEmbedModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-xl dark-glass shadow-glass border border-[#d4a853]/40 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[#1d222b] flex items-center justify-between">
              <span className="font-serif text-sm font-semibold text-[#f3ead8] flex items-center gap-2">
                <ImagePlus className="w-4 h-4 text-[#d4a853]" />
                Link or Upload Vault Asset
              </span>
              <button
                onClick={() => setEmbedModalOpen(false)}
                className="text-[#858d9b] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Vault Asset Thumbnail Gallery */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#d4a853]">
                    Select from Vault Assets
                  </span>
                  <label className="cursor-pointer px-2.5 py-1 rounded bg-[#1a1f28] border border-[#d4a853]/40 text-[11px] text-[#f0cf85] hover:border-[#eab308]">
                    {uploadingEmbed ? 'Uploading...' : '+ Upload New Asset'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleEmbedFileUpload(e.target.files?.[0])}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto p-1">
                  {assets.map((asset) => {
                    const selected = embedRef === `asset://${asset.slug}`;
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => {
                          setEmbedRef(`asset://${asset.slug}`);
                          setEmbedPreviewUrl(asset.url);
                          setEmbedAlt(asset.name);
                        }}
                        onDoubleClick={() => openAssetTab(asset.id)}
                        className={`rounded-md overflow-hidden border text-left transition-all ${
                          selected
                            ? 'border-[#eab308] ring-1 ring-[#eab308]'
                            : 'border-[#242a35] hover:border-[#d4a853]/50'
                        }`}
                      >
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-full h-14 object-cover bg-[#0b0d10]"
                        />
                        <div className="px-1.5 py-1 bg-[#0b0d10] text-[10px] text-[#d5d0c5] truncate">
                          {asset.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-[#9aa3b2] mb-1">
                    Asset Reference or External URL
                  </label>
                  <input
                    value={embedRef}
                    onChange={(e) => {
                      setEmbedRef(e.target.value);
                      setEmbedPreviewUrl(e.target.value);
                    }}
                    placeholder="asset://slug or https://..."
                    className="w-full bg-[#0b0d10] border border-[#242a35] rounded px-2.5 py-1.5 font-mono text-xs text-[#e7e2d8] focus:outline-none focus:border-[#d4a853]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9aa3b2] mb-1">Caption / Alt</label>
                  <input
                    value={embedAlt}
                    onChange={(e) => setEmbedAlt(e.target.value)}
                    placeholder="e.g. Crest of House Vaelora"
                    className="w-full bg-[#0b0d10] border border-[#242a35] rounded px-2.5 py-1.5 text-xs text-[#e7e2d8] focus:outline-none focus:border-[#d4a853]"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-[#9aa3b2] mb-1">
                  <span>Embedded Image Opacity</span>
                  <span className="font-mono text-[#d4a853]">{Math.round(embedOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.15}
                  max={1}
                  step={0.05}
                  value={embedOpacity}
                  onChange={(e) => setEmbedOpacity(parseFloat(e.target.value))}
                  className="w-full accent-[#d4a853]"
                />
              </div>

              {embedPreviewUrl && (
                <div className="rounded bg-[#0b0d10] border border-[#1d222b] p-2">
                  <img
                    src={embedPreviewUrl}
                    alt={embedAlt}
                    style={{ opacity: embedOpacity }}
                    className="max-h-32 mx-auto rounded object-contain"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1d222b]">
                <button
                  onClick={() => setEmbedModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-[#171b22] text-xs text-[#9aa3b2]"
                >
                  Cancel
                </button>
                <button
                  disabled={!embedRef.trim()}
                  onClick={() => {
                    insertImageIntoContent(embedRef, embedPreviewUrl, embedAlt, embedOpacity);
                    setEmbedModalOpen(false);
                  }}
                  className="px-4 py-1.5 rounded btn-gold-metallic text-xs font-semibold disabled:opacity-40"
                >
                  Insert into Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* [[WikiLink]] Autocomplete Popup (Visual TipTap) */}
      {suggestion.active && suggestionItems.length > 0 && suggestion.rect && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(suggestion.rect.left, window.innerWidth - 280),
            top: Math.min(suggestion.rect.bottom + 6, window.innerHeight - 240),
          }}
          className="z-50 w-64 rounded-lg dark-glass shadow-glass py-1.5 overflow-hidden"
        >
          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#d4a853] border-b border-[#1d222b]">
            Link World Entity
          </div>
          {suggestionItems.map((item, idx) => (
            <button
              key={item.id}
              onMouseDown={(e) => {
                e.preventDefault();
                suggestion.command?.({ title: item.title });
              }}
              className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                idx === selectedSuggestIdx
                  ? 'bg-[#d4a853]/20 text-[#f7ecc9]'
                  : 'text-[#d5d0c5] hover:bg-[#1a1f29]'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <EntityIcon type={item.type} className="w-3.5 h-3.5 text-[#d4a853] shrink-0" />
                <span className="truncate">{item.title}</span>
              </span>
              <span className="text-[10px] font-mono text-[#7c8493] shrink-0">{item.type}</span>
            </button>
          ))}
        </div>
      )}

      {/* Hover Preview Card over [[WikiLinks]] */}
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
            <div className="h-24 w-full rounded overflow-hidden mb-2 border border-[#242a35]">
              <img
                src={hoverPreview.entity.cover_image_url}
                alt={hoverPreview.entity.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="flex items-center gap-2 mb-1">
            <EntityIcon type={hoverPreview.entity.type} className="w-3.5 h-3.5 text-[#d4a853]" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[#d4a853]">
              {hoverPreview.entity.type}
            </span>
          </div>
          <div className="font-serif text-sm font-semibold text-[#f3ead8] mb-1">
            {hoverPreview.entity.title}
          </div>
          <p className="text-[11.5px] text-[#b8b1a3] leading-snug line-clamp-3">
            {hoverPreview.entity.summary}
          </p>
        </div>
      )}
    </div>
  );
};
