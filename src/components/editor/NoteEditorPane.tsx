import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BookOpen,
  CheckSquare,
  Code2,
  Columns2,
  Columns3,
  Eye,
  Heading2,
  Highlighter,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  Layers,
  Link2,
  List,
  MapPin,
  Paintbrush,
  Palette,
  PanelLeft,
  Plus,
  Quote,
  SeparatorHorizontal,
  SlidersHorizontal,
  Sparkles,
  Star,
  Table2,
  Tag,
  Trash2,
  Type,
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
  md: 'h-44',
  lg: 'h-60',
  xl: 'h-76',
};

const COLOR_SWATCHES = [
  { label: 'Ivory', value: '#f3ead8' },
  { label: 'Gold', value: '#d4a853' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Crimson', value: '#f87171' },
  { label: 'Emerald', value: '#34d399' },
  { label: 'Azure', value: '#60a5fa' },
  { label: 'Violet', value: '#c084fc' },
  { label: 'Muted Slate', value: '#94a3b8' },
];

const FONT_OPTIONS = [
  { label: 'Default', value: '' },
  { label: 'Inter (Sans)', value: 'inter' },
  { label: 'Garamond (Serif)', value: 'garamond' },
  { label: 'Cinzel (Display)', value: 'cinzel' },
  { label: 'JetBrains Mono', value: 'mono' },
];

const SIZE_OPTIONS = [
  { label: 'XS', value: 'xs' },
  { label: 'SM', value: 'sm' },
  { label: 'Base', value: 'md' },
  { label: 'LG', value: 'lg' },
  { label: 'XL', value: 'xl' },
  { label: '2XL', value: '2xl' },
];

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

  // Obsidian-style sub-modes in Edit: 'split' (Side-by-Side Live Preview), 'raw' (Source Only), 'visual' (TipTap Rich Text)
  const [codeSubMode, setCodeSubMode] = useState<'split' | 'raw' | 'visual'>('split');
  const [splitPercent, setSplitPercent] = useState(50);
  const [syncScroll, setSyncScroll] = useState(true);
  const [showPropertiesDrawer, setShowPropertiesDrawer] = useState(false);

  // Toolbar popovers
  const [openMenu, setOpenMenu] = useState<'style' | 'columns' | 'elements' | null>(null);
  const [customTextColor, setCustomTextColor] = useState('#d4a853');
  const [customBgColor, setCustomBgColor] = useState('#2b2417');

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

  // Asset / Entry Embed Modal state
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [embedModalOpen, setEmbedModalOpen] = useState(false);
  const [embedTab, setEmbedTab] = useState<'asset' | 'entry'>('asset');
  const [embedRef, setEmbedRef] = useState('');
  const [embedPreviewUrl, setEmbedPreviewUrl] = useState('');
  const [embedAlt, setEmbedAlt] = useState('');
  const [embedOpacity, setEmbedOpacity] = useState(1);
  const [embedAlign, setEmbedAlign] = useState<'none' | 'left' | 'right' | 'center'>('none');
  const [embedWidth, setEmbedWidth] = useState('');
  const [uploadingEmbed, setUploadingEmbed] = useState(false);

  // Raw textarea autocomplete for [[Notes]] and ![[Assets/Entries]]
  const [rawTrigger, setRawTrigger] = useState<{
    kind: 'note' | 'asset';
    query: string;
    startIdx: number;
    endIdx: number;
  } | null>(null);

  const rawTextareaRef = useRef<HTMLTextAreaElement>(null);
  const livePreviewScrollRef = useRef<HTMLDivElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isResizingSplitRef = useRef(false);

  const [suggestion, setSuggestion] = useState<SuggestionState>({
    active: false,
    query: '',
    rect: null,
    command: null,
  });
  const [selectedSuggestIdx, setSelectedSuggestIdx] = useState(0);

  // Hover preview over [[WikiLink]] pills & embed cards
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
      const matchedAssets = assets
        .filter((a) => a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q))
        .slice(0, 5)
        .map((a) => ({ kind: 'asset' as const, item: a }));
      const matchedEntries = entities
        .filter((e) => e.id !== entityId && e.title.toLowerCase().includes(q))
        .slice(0, 4)
        .map((e) => ({ kind: 'entity' as const, item: e }));
      return [...matchedAssets, ...matchedEntries];
    }
    return entities
      .filter((e) => e.id !== entityId && e.title.toLowerCase().includes(q))
      .slice(0, 8)
      .map((e) => ({ kind: 'entity' as const, item: e }));
  }, [rawTrigger, assets, entities, entityId]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        VaultImageNode,
        Placeholder.configure({
          placeholder:
            'Write campaign lore... Type [[ to link any entity, or embed via ![[slug]].',
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
      content: markdownToHtml(entity?.content || '', assets, entities),
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
      const targetHtml = markdownToHtml(entity.content, assetsRef.current, entitiesRef.current);
      if (editor.getHTML() !== targetHtml) {
        editor.commands.setContent(targetHtml, false);
      }
    }
  }, [entityId, entity?.updated_at, editor]);

  // Drag handler for Split Mode divider
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizingSplitRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.max(28, Math.min(72, pct)));
    };
    const onUp = () => {
      isResizingSplitRef.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Safe unconditionally-ordered memos (before any early return)
  const renderedPreviewHtml = useMemo(
    () => markdownToHtml(rawMarkdown, assets, entities),
    [rawMarkdown, assets, entities]
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

  const appearance = getEntityAppearance(entity.metadata, assets);
  const visibleMetadata = getVisibleMetadataEntries(entity.metadata);
  const linkedPins = mapPins.filter((p) => p.entity_id === entity.id && (gmMode || !p.is_gm_only));
  const lineCount = Math.max(1, rawMarkdown.split(/\r?\n/).length);
  const wordCount = rawMarkdown.trim() ? rawMarkdown.trim().split(/\s+/).length : 0;

  const commitMarkdown = (nextMd: string, nextCursorPos?: number) => {
    setRawMarkdown(nextMd);
    updateEntity(entity.id, { content: nextMd });
    if (editor) {
      editor.commands.setContent(markdownToHtml(nextMd, assets, entities), false);
    }
    if (typeof nextCursorPos === 'number') {
      requestAnimationFrame(() => {
        const ta = rawTextareaRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(nextCursorPos, nextCursorPos);
        }
      });
    }
  };

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

  const insertTokenAtCursor = (token: string, selectInnerOffset?: [number, number]) => {
    const ta = rawTextareaRef.current;
    const start = ta ? ta.selectionStart : rawMarkdown.length;
    const end = ta ? ta.selectionEnd : rawMarkdown.length;
    const nextMd = rawMarkdown.slice(0, start) + token + rawMarkdown.slice(end);
    const cursorPos = selectInnerOffset ? start + selectInnerOffset[0] : start + token.length;
    commitMarkdown(nextMd, cursorPos);
    if (selectInnerOffset && ta) {
      requestAnimationFrame(() => {
        rawTextareaRef.current?.setSelectionRange(
          start + selectInnerOffset[0],
          start + selectInnerOffset[1]
        );
      });
    }
  };

  const wrapSelection = (before: string, after: string, fallback = 'text') => {
    if (codeSubMode === 'visual' && editor) {
      if (before === '**') editor.chain().focus().toggleBold().run();
      else if (before === '*') editor.chain().focus().toggleItalic().run();
      return;
    }
    const ta = rawTextareaRef.current;
    const start = ta ? ta.selectionStart : rawMarkdown.length;
    const end = ta ? ta.selectionEnd : rawMarkdown.length;
    const selected = rawMarkdown.slice(start, end) || fallback;
    const replacement = `${before}${selected}${after}`;
    const nextMd = rawMarkdown.slice(0, start) + replacement + rawMarkdown.slice(end);
    commitMarkdown(nextMd);
    requestAnimationFrame(() => {
      if (rawTextareaRef.current) {
        rawTextareaRef.current.focus();
        rawTextareaRef.current.setSelectionRange(
          start + before.length,
          start + before.length + selected.length
        );
      }
    });
  };

  // Applies style directive `[selected]{key=val}` OR note-level `%% style: key=val %%`
  const applyStyleProperty = (key: string, val: string) => {
    const ta = rawTextareaRef.current;
    const start = ta ? ta.selectionStart : 0;
    const end = ta ? ta.selectionEnd : 0;

    if (ta && end > start) {
      const selected = rawMarkdown.slice(start, end);
      // Merge into existing `[text]{...}` if exact match
      const existingMatch = selected.match(/^\[([\s\S]*)\]\{([^}]*)\}$/);
      if (existingMatch) {
        const innerText = existingMatch[1];
        const pairs = existingMatch[2]
          .split(/[;\s]+/)
          .filter(Boolean)
          .filter((p) => !p.toLowerCase().startsWith(`${key.toLowerCase()}=`));
        if (val) pairs.push(`${key}=${val}`);
        const replaced = pairs.length ? `[${innerText}]{${pairs.join(' ')}}` : innerText;
        commitMarkdown(rawMarkdown.slice(0, start) + replaced + rawMarkdown.slice(end));
        return;
      }
      if (!val) return;
      const wrapped = `[${selected}]{${key}=${val}}`;
      commitMarkdown(rawMarkdown.slice(0, start) + wrapped + rawMarkdown.slice(end));
      return;
    }

    // No text selected -> update note-wide Obsidian style directive (`%% style: ... %%`)
    const directiveRe = /^%%\s*style\s*:\s*([\s\S]*?)\s*%%/im;
    const match = rawMarkdown.match(directiveRe);
    if (match) {
      const pairs = match[1]
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((p) => !p.toLowerCase().startsWith(`${key.toLowerCase()}=`));
      if (val) pairs.push(`${key}=${val}`);
      const nextHeader = pairs.length ? `%% style: ${pairs.join('; ')} %%` : '';
      const nextMd = nextHeader
        ? rawMarkdown.replace(directiveRe, nextHeader)
        : rawMarkdown.replace(directiveRe, '').replace(/^\n+/, '');
      commitMarkdown(nextMd);
    } else if (val) {
      const nextMd = `%% style: ${key}=${val} %%\n\n${rawMarkdown}`;
      commitMarkdown(nextMd);
    }
  };

  const applyBlockAlign = (align: 'left' | 'center' | 'right') => {
    const ta = rawTextareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const lineStart = rawMarkdown.lastIndexOf('\n', pos - 1) + 1;
    const rawLineEnd = rawMarkdown.indexOf('\n', pos);
    const lineEnd = rawLineEnd === -1 ? rawMarkdown.length : rawLineEnd;
    const line = rawMarkdown.slice(lineStart, lineEnd);
    const stripped = line.replace(/\s+\{align=(?:left|center|right)\}\s*$/i, '');
    const updatedLine = `${stripped} {align=${align}}`;
    commitMarkdown(rawMarkdown.slice(0, lineStart) + updatedLine + rawMarkdown.slice(lineEnd));
  };

  const insertImageIntoContent = (
    refOrUrl: string,
    resolvedDisplayUrl: string,
    alt: string,
    opacity = 1,
    align: 'none' | 'left' | 'right' | 'center' = 'none',
    width = ''
  ) => {
    if (!refOrUrl.trim()) return;
    const cleanRef = refOrUrl.trim();
    const cleanAlt = alt.trim();
    const mods: string[] = [];
    if (align !== 'none') mods.push(align);
    if (width.trim()) mods.push(width.trim());
    if (opacity < 0.99) mods.push(`opacity=${Math.round(opacity * 100)}`);

    let mdTag = '';
    if (cleanRef.startsWith('asset://')) {
      const slug = cleanRef.replace(/^asset:\/\//, '');
      mdTag = mods.length ? `\n\n![[${slug}|${mods.join('|')}]]\n\n` : `\n\n![[${slug}]]\n\n`;
    } else {
      const altParts = [cleanAlt, ...mods].filter(Boolean).join('|');
      mdTag = `\n\n![${altParts}](${cleanRef})\n\n`;
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
      editor.commands.setContent(markdownToHtml(val, assets, entities), false);
    }

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

  const handleRawKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && rawTrigger) {
      setRawTrigger(null);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      insertTokenAtCursor('  ');
    }
  };

  const handleRawScroll = () => {
    if (!syncScroll || codeSubMode !== 'split') return;
    const ta = rawTextareaRef.current;
    const preview = livePreviewScrollRef.current;
    if (!ta || !preview) return;
    const maxTa = Math.max(1, ta.scrollHeight - ta.clientHeight);
    const ratio = ta.scrollTop / maxTa;
    preview.scrollTop = ratio * Math.max(0, preview.scrollHeight - preview.clientHeight);
  };

  const applyRawAutocomplete = (replacement: string) => {
    if (!rawTrigger) return;
    const nextMd =
      rawMarkdown.slice(0, rawTrigger.startIdx) +
      replacement +
      rawMarkdown.slice(rawTrigger.endIdx);
    const cursorAfter = rawTrigger.startIdx + replacement.length;
    setRawTrigger(null);
    commitMarkdown(nextMd, cursorAfter);
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
    <div className="relative h-full bg-[#0e1116] flex flex-col overflow-hidden">
      {/* Inject Per-Note Scoped CSS */}
      {scopedCss && <style>{scopedCss}</style>}

      {/* Full-Page Background Layer */}
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
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-[#0b0d10]/40 via-[#0e1117]/65 to-[#0b0d10]/88" />
      )}

      {/* ===================================================================== */}
      {/* READING / PREVIEW MODE: Clean Distraction-Free Grimoire View          */}
      {/* ===================================================================== */}
      {editorMode === 'preview' ? (
        <div className="relative z-10 flex-1 overflow-y-auto">
          {/* Hero Cover Banner */}
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
              <div className="w-full h-full bg-gradient-to-r from-[#131720] via-[#171c26] to-[#0f1218]" />
            )}
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#0e1116] via-[#0e1116]/70 to-transparent pointer-events-none" />

            {/* Top-Right Quick Reading Actions */}
            <div className="absolute top-3 right-4 flex items-center gap-1.5">
              <button
                onClick={() => {
                  setEditorMode('code');
                  setCodeSubMode('split');
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md dark-glass text-[11.5px] font-medium text-[#f0cf85] hover:border-[#eab308]"
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span>Edit in Split</span>
              </button>
              <button
                onClick={() => toggleFavorite(entity.id)}
                className="p-1.5 rounded-md dark-glass-subtle text-[#d4a853] hover:border-[#d4a853]/50"
                title="Favorite Entry"
              >
                <Star className={`w-3.5 h-3.5 ${entity.is_favorite ? 'fill-[#d4a853]' : ''}`} />
              </button>
            </div>

            <div
              className={`absolute bottom-4 left-6 right-6 mx-auto transition-all duration-300 ease-out ${
                rightInspectorCollapsed ? 'max-w-[1360px]' : 'max-w-5xl'
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
                      <span>{mapObj?.name || 'Map'}</span>
                    </button>
                  );
                })}
              </div>
              <h1 className="font-serif text-3xl font-bold text-[#f7f1e5] drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] tracking-wide">
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
        </div>
      ) : (
        /* ===================================================================== */
        /* OBSIDIAN UNIFIED WORKSPACE: Header + Ribbon + Shared Split Workspace  */
        /* ===================================================================== */
        <div className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* 1. Compact Note Title & Workspace View Bar */}
          <div className="h-[44px] px-4 border-b border-[#1a202a] bg-[#0c0f14]/95 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#151922] text-[#d4a853] border border-[#d4a853]/30 shrink-0">
                <EntityIcon type={entity.type} className="w-3 h-3" />
                {entity.type}
              </span>
              <input
                value={titleDraft}
                onChange={(e) => {
                  setTitleDraft(e.target.value);
                  updateEntity(entity.id, { title: e.target.value });
                }}
                placeholder="Untitled Entry..."
                className="flex-1 min-w-0 bg-transparent font-serif text-[17px] font-semibold text-[#f5efe2] focus:outline-none truncate"
              />
              {linkedPins.slice(0, 2).map((pin) => {
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
                    className="hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#131720] text-[#d4a853] border border-[#242b38] hover:border-[#d4a853]/60 shrink-0"
                  >
                    <MapPin className="w-2.5 h-2.5" />
                    <span>{mapObj?.name || 'Map'}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Workspace View Switcher: Live Split | Source | Visual | Reading */}
              <div className="flex items-center bg-[#090b0f] p-0.5 rounded-md border border-[#1c222d]">
                <button
                  onClick={() => setCodeSubMode('split')}
                  title="Obsidian Side-by-Side Live Preview + Code"
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                    codeSubMode === 'split'
                      ? 'bg-[#1c222e] text-[#f3d488] border border-[#d4a853]/40'
                      : 'text-[#848d9c] hover:text-[#e7e2d8] border border-transparent'
                  }`}
                >
                  <Columns2 className="w-3 h-3" />
                  <span>Live Split</span>
                </button>
                <button
                  onClick={() => setCodeSubMode('raw')}
                  title="Markdown & HTML Source Only"
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                    codeSubMode === 'raw'
                      ? 'bg-[#1c222e] text-[#f3d488] border border-[#d4a853]/40'
                      : 'text-[#848d9c] hover:text-[#e7e2d8] border border-transparent'
                  }`}
                >
                  <Code2 className="w-3 h-3" />
                  <span className="hidden md:inline">Source</span>
                </button>
                <button
                  onClick={() => setCodeSubMode('visual')}
                  title="Rich Visual Editor"
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                    codeSubMode === 'visual'
                      ? 'bg-[#1c222e] text-[#f3d488] border border-[#d4a853]/40'
                      : 'text-[#848d9c] hover:text-[#e7e2d8] border border-transparent'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span className="hidden md:inline">Visual</span>
                </button>
                <button
                  onClick={() => setEditorMode('preview')}
                  title="Full Reading View"
                  className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[#848d9c] hover:text-[#f3d488] border border-transparent transition-all"
                >
                  <BookOpen className="w-3 h-3" />
                  <span className="hidden lg:inline">Read</span>
                </button>
              </div>

              {/* Properties, Art, BG & CSS Drawer Toggle */}
              <button
                onClick={() => setShowPropertiesDrawer((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                  showPropertiesDrawer
                    ? 'bg-[#d4a853]/15 border-[#d4a853]/50 text-[#f3d488]'
                    : 'bg-[#12161e] border-[#1f2531] text-[#9aa3b2] hover:text-[#f3ead8] hover:border-[#2d3546]'
                }`}
                title="Properties, Cover Art, Background, Tags, Custom CSS & GM Secrets"
              >
                <SlidersHorizontal className="w-3 h-3 text-[#d4a853]" />
                <span className="hidden sm:inline">Properties &amp; Style</span>
              </button>

              <button
                onClick={() => toggleFavorite(entity.id)}
                className="p-1.5 rounded-md bg-[#12161e] border border-[#1f2531] text-[#d4a853] hover:border-[#d4a853]/50"
                title="Favorite Entry"
              >
                <Star className={`w-3.5 h-3.5 ${entity.is_favorite ? 'fill-[#d4a853]' : ''}`} />
              </button>
              <button
                onClick={() => deleteEntity(entity.id)}
                className="p-1.5 rounded-md bg-[#12161e] border border-[#1f2531] text-[#7c8594] hover:text-red-400 hover:border-red-500/40"
                title="Delete Entry"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 2. Collapsible Obsidian Properties, Art, Background & CSS Drawer */}
          {showPropertiesDrawer && (
            <div className="border-b border-[#1d222b] bg-[#0b0e13]/95 px-4 py-3 max-h-[46vh] overflow-y-auto shrink-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* Summary, Tags & Attributes */}
                <div className="rounded-lg bg-[#12161f] border border-[#1e2430] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#d4a853]">
                      Metadata &amp; Summary
                    </span>
                    <button
                      onClick={() => setShowPropertiesDrawer(false)}
                      className="text-[#7c8594] hover:text-white lg:hidden"
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
                    className="w-full bg-[#0b0d10] border border-[#1d222b] rounded px-2 py-1.5 text-xs text-[#dfd9cc] focus:outline-none focus:border-[#d4a853]/60 resize-none"
                  />
                  <div className="flex items-center flex-wrap gap-1">
                    <Tag className="w-3 h-3 text-[#d4a853] mr-0.5" />
                    {entity.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0b0d10] border border-[#242a36] text-[10.5px] font-mono text-[#b8b1a3]"
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
                        className="w-16 bg-transparent text-[10.5px] font-mono text-[#d4a853] placeholder:text-[#5b6472] focus:outline-none px-1"
                      />
                    </form>
                  </div>

                  {/* Frontmatter key-value pairs */}
                  <div className="space-y-1 pt-1 border-t border-[#1b202b]">
                    {visibleMetadata.map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-center justify-between gap-1.5 bg-[#0b0d10] border border-[#1d222b] rounded px-2 py-1"
                      >
                        <span className="text-[10.5px] text-[#8b93a1] truncate">{k}</span>
                        <div className="flex items-center gap-1">
                          <input
                            value={String(v)}
                            onChange={(e) =>
                              updateEntity(entity.id, {
                                metadata: { ...entity.metadata, [k]: e.target.value },
                              })
                            }
                            className="bg-transparent text-right text-[11px] text-[#f0e9db] focus:outline-none w-28"
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
                        className="flex-1 min-w-0 bg-[#0b0d10] border border-[#1d222b] rounded px-2 py-1 text-[11px] text-[#e7e2d8]"
                      />
                      <input
                        value={newMetaVal}
                        onChange={(e) => setNewMetaVal(e.target.value)}
                        placeholder="Value"
                        className="flex-1 min-w-0 bg-[#0b0d10] border border-[#1d222b] rounded px-2 py-1 text-[11px] text-[#e7e2d8]"
                      />
                      <button
                        type="submit"
                        className="p-1 rounded bg-[#1a1f28] border border-[#2a3140] text-[#d4a853]"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </form>
                  </div>
                </div>

                {/* Cover & Page Background Controls */}
                <div className="rounded-lg bg-[#12161f] border border-[#1e2430] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#d4a853] flex items-center gap-1">
                      <Layers className="w-3 h-3" /> Cover &amp; Background
                    </span>
                    <div className="flex items-center gap-1">
                      {(['md', 'lg', 'xl'] as const).map((sz) => (
                        <button
                          key={sz}
                          onClick={() => updateAppearance({ _cover_height: sz })}
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono uppercase ${
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

                  {/* Cover picker */}
                  <div className="flex items-center gap-1.5">
                    <select
                      value=""
                      onChange={(e) => {
                        const chosen = assets.find((a) => a.id === e.target.value);
                        if (chosen) updateEntity(entity.id, { cover_image_url: chosen.url });
                      }}
                      className="flex-1 min-w-0 bg-[#0b0d10] border border-[#232934] rounded px-2 py-1 text-[11px] text-[#e7e2d8]"
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
                    <label className="cursor-pointer px-2 py-1 rounded bg-[#1a1f28] border border-[#2a3140] text-[10.5px] text-[#d4a853] hover:border-[#d4a853]">
                      {uploadingCover ? '...' : 'Upload'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                    </label>
                  </div>
                  <div className="flex items-center gap-2 text-[10.5px] text-[#8b93a1]">
                    <span className="w-20 shrink-0">Cover Alpha</span>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={appearance.coverOpacity}
                      onChange={(e) => updateAppearance({ _cover_opacity: parseFloat(e.target.value) })}
                      className="flex-1 accent-[#d4a853]"
                    />
                    <span className="font-mono text-[#d4a853] w-8 text-right">
                      {Math.round(appearance.coverOpacity * 100)}%
                    </span>
                  </div>

                  {/* BG picker */}
                  <div className="flex items-center gap-1.5 pt-1.5 border-t border-[#1b202b]">
                    <select
                      value=""
                      onChange={(e) => {
                        const chosen = assets.find((a) => a.id === e.target.value);
                        if (chosen) updateAppearance({ _bg_image: `asset://${chosen.slug}` });
                      }}
                      className="flex-1 min-w-0 bg-[#0b0d10] border border-[#232934] rounded px-2 py-1 text-[11px] text-[#e7e2d8]"
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
                    <label className="cursor-pointer px-2 py-1 rounded bg-[#1a1f28] border border-[#2a3140] text-[10.5px] text-[#d4a853]">
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
                  <div className="flex items-center gap-2 text-[10.5px] text-[#8b93a1]">
                    <span className="w-20 shrink-0">BG Alpha</span>
                    <input
                      type="range"
                      min={0}
                      max={0.85}
                      step={0.05}
                      value={appearance.bgOpacity}
                      onChange={(e) => updateAppearance({ _bg_opacity: parseFloat(e.target.value) })}
                      className="flex-1 accent-[#d4a853]"
                    />
                    <span className="font-mono text-[#d4a853] w-8 text-right">
                      {Math.round(appearance.bgOpacity * 100)}%
                    </span>
                  </div>
                </div>

                {/* Scoped Custom CSS & GM Secret */}
                <div className="rounded-lg bg-[#12161f] border border-[#1e2430] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#d4a853] flex items-center gap-1">
                      <Paintbrush className="w-3 h-3" /> Note Scoped CSS
                    </span>
                    <button
                      onClick={() => setShowPropertiesDrawer(false)}
                      className="text-[#7c8594] hover:text-white hidden lg:block"
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
                    placeholder={`.vault-card { border-color: #d4a853; }\nh2 { letter-spacing: 0.08em; }`}
                    className="w-full bg-[#0b0d10] border border-[#1d222b] rounded px-2 py-1.5 font-mono text-[11px] text-[#c9d1d9] focus:outline-none focus:border-[#d4a853]"
                  />

                  {gmMode && (
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
                        className="w-full bg-[#1a0a0e] border border-red-500/30 rounded px-2 py-1 text-[11px] text-red-100 placeholder:text-red-300/40 focus:outline-none focus:border-red-400"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. Obsidian Markdown & Typography Formatting Ribbon */}
          <div className="px-3 py-1.5 border-b border-[#181e28] bg-[#10141c] flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-0.5 flex-wrap">
              {/* Inline Markdown controls */}
              <button
                onClick={() => wrapSelection('**', '**', 'bold')}
                title="Bold"
                className="p-1.5 rounded text-[#9aa3b2] hover:text-[#f3ead8] hover:bg-[#19202c]"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => wrapSelection('*', '*', 'italic')}
                title="Italic"
                className="p-1.5 rounded text-[#9aa3b2] hover:text-[#f3ead8] hover:bg-[#19202c]"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => wrapSelection('==', '==', 'highlight')}
                title="Highlight (==text==)"
                className="p-1.5 rounded text-[#9aa3b2] hover:text-[#f3d488] hover:bg-[#19202c]"
              >
                <Highlighter className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  if (codeSubMode === 'visual' && editor) {
                    editor.chain().focus().toggleHeading({ level: 2 }).run();
                  } else {
                    insertTokenAtCursor('\n## ');
                  }
                }}
                title="Heading 2"
                className="p-1.5 rounded text-[#9aa3b2] hover:text-[#f3ead8] hover:bg-[#19202c]"
              >
                <Heading2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  if (codeSubMode === 'visual' && editor) {
                    editor.chain().focus().toggleBulletList().run();
                  } else {
                    insertTokenAtCursor('\n- ');
                  }
                }}
                title="Bullet List"
                className="p-1.5 rounded text-[#9aa3b2] hover:text-[#f3ead8] hover:bg-[#19202c]"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => insertTokenAtCursor('\n- [ ] Task item\n')}
                title="Checklist Item"
                className="p-1.5 rounded text-[#9aa3b2] hover:text-[#f3ead8] hover:bg-[#19202c]"
              >
                <CheckSquare className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  if (codeSubMode === 'visual' && editor) {
                    editor.chain().focus().toggleBlockquote().run();
                  } else {
                    insertTokenAtCursor('\n> ');
                  }
                }}
                title="Blockquote"
                className="p-1.5 rounded text-[#9aa3b2] hover:text-[#f3ead8] hover:bg-[#19202c]"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>

              <span className="w-px h-4 bg-[#1f2633] mx-1" />

              {/* Fonts, Size & Color Styling Popover */}
              <div className="relative">
                <button
                  onClick={() => setOpenMenu((m) => (m === 'style' ? null : 'style'))}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    openMenu === 'style'
                      ? 'bg-[#222938] text-[#f3d488]'
                      : 'text-[#c2c9d4] hover:bg-[#19202c]'
                  }`}
                  title="Manipulate Fonts, Sizes, Colors & Alignment"
                >
                  <Palette className="w-3.5 h-3.5 text-[#d4a853]" />
                  <span>Font &amp; Color</span>
                </button>
                {openMenu === 'style' && (
                  <div className="absolute left-0 mt-1.5 w-72 rounded-lg dark-glass shadow-glass p-3 space-y-3 z-40 border border-[#d4a853]/35">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#d4a853]">
                        Typography &amp; Color
                      </span>
                      <button
                        onClick={() => setOpenMenu(null)}
                        className="text-[#7c8594] hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-[10px] text-[#848d9c]">
                      Select text to style inline <code className="text-[#d4a853]">[text]{'{...}'}</code>, or leave unselected to style the whole note.
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span className="text-[10px] text-[#9aa3b2] flex items-center gap-1">
                          <Type className="w-3 h-3 text-[#d4a853]" /> Font Family
                        </span>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            applyStyleProperty('font', e.target.value);
                            setOpenMenu(null);
                          }}
                          className="w-full bg-[#0b0d10] border border-[#242b38] rounded px-1.5 py-1 text-[11px] text-[#e7e2d8]"
                        >
                          {FONT_OPTIONS.map((f) => (
                            <option key={f.label} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] text-[#9aa3b2]">Font Size</span>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) applyStyleProperty('size', e.target.value);
                            setOpenMenu(null);
                          }}
                          className="w-full bg-[#0b0d10] border border-[#242b38] rounded px-1.5 py-1 text-[11px] text-[#e7e2d8]"
                        >
                          <option value="" disabled>
                            Choose size...
                          </option>
                          {SIZE_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label} ({s.value})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] text-[#9aa3b2]">Text Color</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {COLOR_SWATCHES.map((sw) => (
                          <button
                            key={sw.value}
                            type="button"
                            title={sw.label}
                            onClick={() => {
                              applyStyleProperty('color', sw.value);
                              setOpenMenu(null);
                            }}
                            className="w-5 h-5 rounded-full border border-white/25 hover:scale-110 transition-transform"
                            style={{ backgroundColor: sw.value }}
                          />
                        ))}
                        <label
                          title="Custom Text Color"
                          className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0b0d10] border border-[#242b38] text-[10px] text-[#c9c3b8] cursor-pointer"
                        >
                          <input
                            type="color"
                            value={customTextColor}
                            onChange={(e) => {
                              setCustomTextColor(e.target.value);
                              applyStyleProperty('color', e.target.value);
                            }}
                            className="w-4 h-4 bg-transparent border-0 cursor-pointer"
                          />
                          <span>Pick</span>
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#1e2532]">
                      <label className="flex items-center gap-1.5 text-[10.5px] text-[#9aa3b2] cursor-pointer">
                        <input
                          type="color"
                          value={customBgColor}
                          onChange={(e) => {
                            setCustomBgColor(e.target.value);
                            applyStyleProperty('bg', e.target.value);
                          }}
                          className="w-4 h-4 bg-transparent border-0 cursor-pointer"
                        />
                        <span>Text Highlight BG</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            applyBlockAlign('left');
                            setOpenMenu(null);
                          }}
                          className="p-1 rounded bg-[#151a24] text-[#9aa3b2] hover:text-white"
                          title="Align Left"
                        >
                          <AlignLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            applyBlockAlign('center');
                            setOpenMenu(null);
                          }}
                          className="p-1 rounded bg-[#151a24] text-[#9aa3b2] hover:text-white"
                          title="Align Center"
                        >
                          <AlignCenter className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            applyBlockAlign('right');
                            setOpenMenu(null);
                          }}
                          className="p-1 rounded bg-[#151a24] text-[#9aa3b2] hover:text-white"
                          title="Align Right"
                        >
                          <AlignRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Columns Layout Popover */}
              <div className="relative">
                <button
                  onClick={() => setOpenMenu((m) => (m === 'columns' ? null : 'columns'))}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    openMenu === 'columns'
                      ? 'bg-[#222938] text-[#f3d488]'
                      : 'text-[#c2c9d4] hover:bg-[#19202c]'
                  }`}
                  title="Insert Multi-Column Grid"
                >
                  <Columns3 className="w-3.5 h-3.5 text-[#d4a853]" />
                  <span>Columns</span>
                </button>
                {openMenu === 'columns' && (
                  <div className="absolute left-0 mt-1.5 w-52 rounded-lg dark-glass shadow-glass p-1.5 space-y-0.5 z-40 border border-[#d4a853]/35">
                    <button
                      onClick={() => {
                        insertTokenAtCursor(
                          '\n\n:::columns 2\n### Column One\nLeft column notes.\n:::col\n### Column Two\nRight column notes.\n:::\n\n'
                        );
                        setOpenMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#e7e2d8] hover:bg-[#d4a853]/15"
                    >
                      2 Equal Columns
                    </button>
                    <button
                      onClick={() => {
                        insertTokenAtCursor(
                          '\n\n:::columns 3\n### First\nNotes...\n:::col\n### Second\nNotes...\n:::col\n### Third\nNotes...\n:::\n\n'
                        );
                        setOpenMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#e7e2d8] hover:bg-[#d4a853]/15"
                    >
                      3 Equal Columns
                    </button>
                    <button
                      onClick={() => {
                        insertTokenAtCursor(
                          '\n\n:::columns 1:2\n:::card Sidebar\nQuick facts or portrait here.\n:::\n:::col\n## Main Chronicle\nPrimary narrative details.\n:::\n\n'
                        );
                        setOpenMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#e7e2d8] hover:bg-[#d4a853]/15"
                    >
                      Sidebar + Main (1:2)
                    </button>
                    <button
                      onClick={() => {
                        insertTokenAtCursor(
                          '\n\n:::columns 2:1\n## Main Section\nPrimary prose...\n:::col\n:::statblock Quick Stats\n- **CR:** 5\n- **HP:** 78\n:::\n:::\n\n'
                        );
                        setOpenMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#e7e2d8] hover:bg-[#d4a853]/15"
                    >
                      Main + Statblock (2:1)
                    </button>
                  </div>
                )}
              </div>

              {/* Table Button */}
              <button
                onClick={() =>
                  insertTokenAtCursor(
                    '\n\n| Column 1 | Column 2 | Value |\n| :--- | :---: | ---: |\n| Entry A | Detail | 100 |\n| Entry B | Detail | 250 |\n\n'
                  )
                }
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[#c2c9d4] hover:bg-[#19202c]"
                title="Insert Markdown Table"
              >
                <Table2 className="w-3.5 h-3.5 text-[#d4a853]" />
                <span>Table</span>
              </button>

              {/* Page Split Button */}
              <button
                onClick={() => insertTokenAtCursor('\n\n:::page-break New Section\n\n')}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[#c2c9d4] hover:bg-[#19202c]"
                title="Insert Page Split / Section Break (=== or :::page-break)"
              >
                <SeparatorHorizontal className="w-3.5 h-3.5 text-[#d4a853]" />
                <span>Split Page</span>
              </button>

              {/* Callouts & Container Blocks Popover */}
              <div className="relative">
                <button
                  onClick={() => setOpenMenu((m) => (m === 'elements' ? null : 'elements'))}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    openMenu === 'elements'
                      ? 'bg-[#222938] text-[#f3d488]'
                      : 'text-[#c2c9d4] hover:bg-[#19202c]'
                  }`}
                  title="Insert Callouts, Cards, Statblocks & Spoilers"
                >
                  <PanelLeft className="w-3.5 h-3.5 text-[#d4a853]" />
                  <span>Blocks</span>
                </button>
                {openMenu === 'elements' && (
                  <div className="absolute left-0 mt-1.5 w-56 rounded-lg dark-glass shadow-glass p-1.5 space-y-0.5 z-40 border border-[#d4a853]/35">
                    <button
                      onClick={() => {
                        insertTokenAtCursor('\n\n> [!lore] Lore Chronicle\n> Ancient whispers tell of...\n\n');
                        setOpenMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#f3d488] hover:bg-[#d4a853]/15"
                    >
                      Lore Callout ([!lore])
                    </button>
                    <button
                      onClick={() => {
                        insertTokenAtCursor('\n\n> [!warning] Danger / Hazard\n> Beware the wardens...\n\n');
                        setOpenMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded text-xs text-amber-300 hover:bg-[#d4a853]/15"
                    >
                      Warning Callout ([!warning])
                    </button>
                    <button
                      onClick={() => {
                        insertTokenAtCursor('\n\n> [!tip] GM Note\n> Helpful reminder...\n\n');
                        setOpenMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded text-xs text-emerald-300 hover:bg-[#d4a853]/15"
                    >
                      Tip Callout ([!tip])
                    </button>
                    <button
                      onClick={() => {
                        insertTokenAtCursor(
                          '\n\n:::statblock Creature / Artifact\n- **Armor Class:** 16\n- **Hit Points:** 92\n- **Trait:** Arcane Resilience\n:::\n\n'
                        );
                        setOpenMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#e7e2d8] hover:bg-[#d4a853]/15"
                    >
                      Statblock Box (:::statblock)
                    </button>
                    <button
                      onClick={() => {
                        insertTokenAtCursor(
                          '\n\n:::card Highlight Card\nStyled container card content.\n:::\n\n'
                        );
                        setOpenMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#e7e2d8] hover:bg-[#d4a853]/15"
                    >
                      Container Card (:::card)
                    </button>
                    <button
                      onClick={() => {
                        insertTokenAtCursor(
                          '\n\n:::details Click to Expand Spoiler\nHidden details revealed on click.\n:::\n\n'
                        );
                        setOpenMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#e7e2d8] hover:bg-[#d4a853]/15"
                    >
                      Collapsible Toggle (:::details)
                    </button>
                  </div>
                )}
              </div>

              {/* Embed Asset or Entry */}
              <button
                onClick={() => {
                  setEmbedTab('asset');
                  setEmbedRef('');
                  setEmbedPreviewUrl('');
                  setEmbedAlt('');
                  setEmbedOpacity(1);
                  setEmbedAlign('none');
                  setEmbedWidth('');
                  setEmbedModalOpen(true);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-[#181e29] border border-[#d4a853]/35 text-[#f0cf85] hover:border-[#eab308]"
                title="Embed Image, Asset, or Transcluded Note Card ![[...]]"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                <span>Embed</span>
              </button>
            </div>

            {/* Right Status & Scroll Sync */}
            <div className="flex items-center gap-2 text-[10.5px] font-mono text-[#737c8c]">
              {codeSubMode === 'split' && (
                <button
                  onClick={() => setSyncScroll((v) => !v)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
                    syncScroll
                      ? 'bg-[#19202c] border-[#d4a853]/35 text-[#d4a853]'
                      : 'border-transparent text-[#6f7887] hover:text-[#cfd6e2]'
                  }`}
                  title="Synchronize Code & Live Preview scrolling"
                >
                  <Link2 className="w-3 h-3" />
                  <span className="hidden xl:inline">Sync</span>
                </button>
              )}
              <span className="hidden sm:inline">{wordCount} words</span>
              <span className="hidden md:inline text-[#4c5564]">·</span>
              <span className="hidden md:inline text-emerald-400/80">Saved</span>
            </div>
          </div>

          {/* 4. Main Shared Working Space */}
          {codeSubMode === 'visual' ? (
            /* Rich TipTap Visual Mode */
            <div className="flex-1 overflow-y-auto p-6">
              <div
                className={`mx-auto rounded-xl bg-[#11151d]/92 border border-[#1d222b] overflow-hidden ${
                  rightInspectorCollapsed ? 'max-w-5xl' : 'max-w-4xl'
                }`}
              >
                <div
                  className="min-h-[420px] p-6"
                  style={noteVars as React.CSSProperties}
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
            </div>
          ) : (
            /* Obsidian Live Split (Code + Live Preview side by side) OR Source Only */
            <div
              ref={splitContainerRef}
              className="flex-1 flex min-h-0 overflow-hidden"
            >
              {/* Left Pane: Obsidian Monospace Source Editor */}
              <div
                style={codeSubMode === 'split' ? { width: `${splitPercent}%` } : { width: '100%' }}
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
                className="relative h-full flex flex-col min-w-0 bg-[#0b0e13]/95"
              >
                <div className="h-7 px-3.5 border-b border-[#161b24] bg-[#0d1016] flex items-center justify-between text-[10px] font-mono text-[#737c8c] shrink-0">
                  <span className="uppercase tracking-wider text-[#d4a853]/85">Markdown Source</span>
                  <span>[[Link]] · ![[Embed]] · :::columns · === split</span>
                </div>

                <div className="relative flex-1 flex min-h-0 overflow-hidden">
                  {/* Subtle Line Gutter */}
                  <div
                    aria-hidden
                    className="hidden sm:block w-10 py-4 pr-2 text-right font-mono text-[11px] leading-[1.65] text-[#3f4857] select-none overflow-hidden bg-[#0a0c11] border-r border-[#141922]"
                  >
                    {Array.from({ length: Math.min(lineCount, 400) }, (_, idx) => (
                      <div key={idx}>{idx + 1}</div>
                    ))}
                  </div>

                  <textarea
                    ref={rawTextareaRef}
                    value={rawMarkdown}
                    onChange={handleRawMarkdownChange}
                    onKeyDown={handleRawKeyDown}
                    onScroll={handleRawScroll}
                    spellCheck={false}
                    placeholder="Start writing in Obsidian Markdown... Try :::columns 2, | tables |, === page splits, [styled text]{color=#d4a853 font=cinzel}, > [!lore], or ![[Entry/Asset]]."
                    className="flex-1 h-full w-full bg-transparent px-4 py-4 font-mono text-[13px] leading-[1.65] text-[#e4ded1] placeholder:text-[#4c5566] focus:outline-none resize-none overflow-y-auto"
                  />
                </div>

                {/* Inline [[ / ![[ Autocomplete Popover */}
                {rawTrigger && rawMatches.length > 0 && (
                  <div className="absolute left-12 bottom-4 z-40 w-80 rounded-lg dark-glass shadow-glass py-1.5 border border-[#d4a853]/45">
                    <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#d4a853] border-b border-[#1d222b]">
                      {rawTrigger.kind === 'asset'
                        ? 'Embed Asset or Entry (![[...]])'
                        : 'Link World Entry ([[...]])'}
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {rawMatches.map((match) => {
                        if (match.kind === 'asset') {
                          const a = match.item;
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
                        const ent = match.item;
                        const prefix = rawTrigger.kind === 'asset' ? '!' : '';
                        return (
                          <button
                            key={ent.id}
                            type="button"
                            onClick={() => applyRawAutocomplete(`${prefix}[[${ent.title}]]`)}
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
                  </div>
                )}
              </div>

              {/* Center Draggable Resize Divider + Right Live Preview Pane */}
              {codeSubMode === 'split' && (
                <>
                  <div
                    onMouseDown={() => {
                      isResizingSplitRef.current = true;
                    }}
                    title="Drag to resize Code / Live Preview split"
                    className="w-[5px] bg-[#141821] hover:bg-[#d4a853]/50 border-x border-[#1c222d] cursor-col-resize transition-colors shrink-0 flex items-center justify-center group"
                  >
                    <span className="w-[1px] h-8 bg-[#2c3445] group-hover:bg-[#f3d488]" />
                  </div>

                  <div
                    ref={livePreviewScrollRef}
                    className={`flex-1 h-full overflow-y-auto bg-[#0f1319]/92 ${scopeClass}`}
                  >
                    <div className="sticky top-0 z-10 h-7 px-4 border-b border-[#161b24] bg-[#0d1118]/90 backdrop-blur-sm flex items-center justify-between text-[10px] font-mono text-[#7c8594]">
                      <span className="flex items-center gap-1.5 uppercase tracking-wider text-[#d4a853]/90">
                        <Eye className="w-3 h-3" /> Live Preview
                      </span>
                      <button
                        onClick={() => setEditorMode('preview')}
                        className="text-[#8e97a6] hover:text-[#f3d488]"
                      >
                        Full Reading View →
                      </button>
                    </div>

                    <div className="px-6 py-5 max-w-4xl mx-auto">
                      {entity.cover_image_url && (
                        <div className="mb-4 h-28 rounded-lg overflow-hidden border border-[#1f2633] relative">
                          <img
                            src={entity.cover_image_url}
                            alt={entity.title}
                            style={{ opacity: appearance.coverOpacity }}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#0f1319] via-transparent to-transparent" />
                          <div className="absolute bottom-2 left-3 font-serif text-lg font-bold text-[#f7f1e5]">
                            {entity.title}
                          </div>
                        </div>
                      )}

                      <div
                        style={noteVars as React.CSSProperties}
                        className="tiptap"
                        onMouseOver={handleWikiMouseOver}
                        onMouseLeave={() => setHoverPreview(null)}
                        onClick={handleWikiClick}
                        dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* Link / Embed Vault Asset OR Transcluded Note Card Modal               */}
      {/* ===================================================================== */}
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
              <div className="flex items-center gap-2">
                <ImagePlus className="w-4 h-4 text-[#d4a853]" />
                <span className="font-serif text-sm font-semibold text-[#f3ead8]">
                  Embed Element into Note
                </span>
              </div>
              <button
                onClick={() => setEmbedModalOpen(false)}
                className="text-[#858d9b] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 pt-3 flex items-center gap-1 border-b border-[#1d222b]">
              <button
                onClick={() => setEmbedTab('asset')}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                  embedTab === 'asset'
                    ? 'border-[#d4a853] text-[#f3d488]'
                    : 'border-transparent text-[#858d9b] hover:text-white'
                }`}
              >
                Image / Vault Asset
              </button>
              <button
                onClick={() => setEmbedTab('entry')}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                  embedTab === 'entry'
                    ? 'border-[#d4a853] text-[#f3d488]'
                    : 'border-transparent text-[#858d9b] hover:text-white'
                }`}
              >
                Transclude World Entry
              </button>
            </div>

            {embedTab === 'entry' ? (
              <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                <p className="text-[11px] text-[#8b93a1]">
                  Click any entry to embed it as a rich interactive preview card via{' '}
                  <code className="text-[#d4a853]">![[Title]]</code>.
                </p>
                <div className="space-y-1">
                  {entities
                    .filter((e) => e.id !== entity.id)
                    .map((ent) => (
                      <button
                        key={ent.id}
                        type="button"
                        onClick={() => {
                          insertTokenAtCursor(`\n\n![[${ent.title}]]\n\n`);
                          setEmbedModalOpen(false);
                        }}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#0d1016] border border-[#1e2532] hover:border-[#d4a853]/60 text-left transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <EntityIcon type={ent.type} className="w-4 h-4 text-[#d4a853] shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-[#f3ead8] truncate">
                              {ent.title}
                            </div>
                            <div className="text-[10.5px] text-[#7c8594] truncate">
                              {ent.summary || ent.type}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-[#d4a853] shrink-0">
                          Embed
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#d4a853]">
                      Select from Vault Assets
                    </span>
                    <label className="cursor-pointer px-2.5 py-1 rounded bg-[#1a1f28] border border-[#d4a853]/40 text-[11px] text-[#f0cf85] hover:border-[#eab308]">
                      {uploadingEmbed ? 'Uploading...' : '+ Upload Image'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleEmbedFileUpload(e.target.files?.[0])}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1">
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
                      Asset Reference or URL
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
                    <label className="block text-[11px] text-[#9aa3b2] mb-1">Caption / Width</label>
                    <div className="flex gap-1.5">
                      <input
                        value={embedAlt}
                        onChange={(e) => setEmbedAlt(e.target.value)}
                        placeholder="Alt caption"
                        className="flex-1 min-w-0 bg-[#0b0d10] border border-[#242a35] rounded px-2 py-1.5 text-xs text-[#e7e2d8]"
                      />
                      <input
                        value={embedWidth}
                        onChange={(e) => setEmbedWidth(e.target.value)}
                        placeholder="260px"
                        className="w-16 bg-[#0b0d10] border border-[#242a35] rounded px-2 py-1.5 font-mono text-xs text-[#e7e2d8]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1">
                    {(['none', 'left', 'center', 'right'] as const).map((al) => (
                      <button
                        key={al}
                        type="button"
                        onClick={() => setEmbedAlign(al)}
                        className={`px-2 py-1 rounded text-[10.5px] capitalize border ${
                          embedAlign === al
                            ? 'bg-[#d4a853]/20 border-[#d4a853]/60 text-[#f3d488]'
                            : 'bg-[#0b0d10] border-[#242a35] text-[#8b93a1]'
                        }`}
                      >
                        {al}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[10.5px] text-[#9aa3b2]">Alpha</span>
                    <input
                      type="range"
                      min={0.15}
                      max={1}
                      step={0.05}
                      value={embedOpacity}
                      onChange={(e) => setEmbedOpacity(parseFloat(e.target.value))}
                      className="flex-1 accent-[#d4a853]"
                    />
                    <span className="font-mono text-[10.5px] text-[#d4a853]">
                      {Math.round(embedOpacity * 100)}%
                    </span>
                  </div>
                </div>

                {embedPreviewUrl && (
                  <div className="rounded bg-[#0b0d10] border border-[#1d222b] p-2">
                    <img
                      src={embedPreviewUrl}
                      alt={embedAlt}
                      style={{ opacity: embedOpacity }}
                      className="max-h-28 mx-auto rounded object-contain"
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
                      insertImageIntoContent(
                        embedRef,
                        embedPreviewUrl,
                        embedAlt,
                        embedOpacity,
                        embedAlign,
                        embedWidth
                      );
                      setEmbedModalOpen(false);
                    }}
                    className="px-4 py-1.5 rounded btn-gold-metallic text-xs font-semibold disabled:opacity-40"
                  >
                    Insert into Note
                  </button>
                </div>
              </div>
            )}
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

      {/* Hover Preview Card over [[WikiLinks]] & Embed Cards */}
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
