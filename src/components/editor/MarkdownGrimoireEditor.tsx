import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  Columns3,
  Heading2,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  Palette,
  Plus,
  Quote,
  SeparatorHorizontal,
  Table2,
  Type,
  X,
} from 'lucide-react';
import { uploadVaultAsset } from '../../lib/supabase';
import {
  htmlToMarkdown,
  markdownToHtml,
  parseNoteMarkdownStyleBlock,
} from '../../lib/wikilinks';
import { useVaultStore } from '../../store/useVaultStore';
import { Entity } from '../../types/vault';
import { EntityIcon } from '../common/EntityIcon';
import { VaultImageNode } from './ImageExtension';
import { WikiLinkNode } from './WikiLinkExtension';

export type GrimoireCodeSubMode = 'split' | 'raw' | 'visual';

export interface MarkdownGrimoireEditorHandle {
  insertTokenAtCursor: (token: string, selectInnerOffset?: [number, number]) => void;
  wrapSelection: (before: string, after: string, fallback?: string) => void;
  applyStyleProperty: (key: string, val: string) => void;
  applyBlockAlign: (align: 'left' | 'center' | 'right') => void;
  toggleVisualHeading2: () => void;
  toggleVisualBulletList: () => void;
  toggleVisualBlockquote: () => void;
  openEmbedModal: () => void;
}

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

const SLASH_COMMANDS = [
  { id: 'cols2', label: '2 Equal Columns', hint: ':::columns 2', token: '\n\n:::columns 2\n### Left\nNotes...\n:::col\n### Right\nNotes...\n:::\n\n' },
  { id: 'cols3', label: '3 Equal Columns', hint: ':::columns 3', token: '\n\n:::columns 3\n### First\nNotes...\n:::col\n### Second\nNotes...\n:::col\n### Third\nNotes...\n:::\n\n' },
  { id: 'table', label: 'Markdown Table', hint: '| col | col |', token: '\n\n| Column 1 | Column 2 | Value |\n| :--- | :---: | ---: |\n| Entry A | Detail | 100 |\n| Entry B | Detail | 250 |\n\n' },
  { id: 'split', label: 'Page Split / Divider', hint: ':::page-break', token: '\n\n:::page-break New Section\n\n' },
  { id: 'lore', label: 'Lore Callout', hint: '> [!lore]', token: '\n\n> [!lore] Lore Chronicle\n> Ancient whispers tell of...\n\n' },
  { id: 'warn', label: 'Warning Callout', hint: '> [!warning]', token: '\n\n> [!warning] Danger / Hazard\n> Beware the wardens...\n\n' },
  { id: 'stat', label: 'Statblock Box', hint: ':::statblock', token: '\n\n:::statblock Creature / Artifact\n- **Armor Class:** 16\n- **Hit Points:** 92\n- **Trait:** Arcane Resilience\n:::\n\n' },
  { id: 'card', label: 'Highlight Card', hint: ':::card', token: '\n\n:::card Highlight Card\nStyled container card content.\n:::\n\n' },
  { id: 'details', label: 'Collapsible Toggle', hint: ':::details', token: '\n\n:::details Click to Expand\nHidden details revealed on click.\n:::\n\n' },
  { id: 'embed', label: 'Embed Image / Entry', hint: '![[...]]', token: '__OPEN_EMBED__' },
];

export const GrimoireToolbarMenus: React.FC<{
  editorRef: React.RefObject<MarkdownGrimoireEditorHandle>;
  codeSubMode: GrimoireCodeSubMode;
}> = ({ editorRef, codeSubMode }) => {
  const [openMenu, setOpenMenu] = useState<'style' | 'insert' | null>(null);
  const [customTextColor, setCustomTextColor] = useState('#d4a853');
  const [customBgColor, setCustomBgColor] = useState('#2b2417');

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu((m) => (m === 'insert' ? null : 'insert'))}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
            openMenu === 'insert'
              ? 'bg-[#121620] border-[#b68d40]/55 text-[#d6b16a]'
              : 'bg-[#090b0f] border-[#151a23] text-[#ded8cc] hover:border-[#b68d40]/45'
          }`}
          title="Insert Columns, Tables, Splits, Callouts, Blocks or Embeds (or type / in Markdown)"
        >
          <Plus className="w-3 h-3 text-[#b68d40]" />
          <span>Insert</span>
        </button>
        {openMenu === 'insert' && (
          <div className="absolute right-0 mt-1.5 w-72 rounded-lg dark-glass shadow-glass p-2 space-y-2 z-50 border border-[#b68d40]/35">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#c9a050]">
                Insert Layout &amp; Blocks
              </span>
              <button onClick={() => setOpenMenu(null)} className="text-[#7c8594] hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-1">
              <span className="px-1 text-[10px] text-[#7a8290] flex items-center gap-1">
                <Columns3 className="w-3 h-3 text-[#b68d40]" /> Multi-Column Grid
              </span>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => {
                    editorRef.current?.insertTokenAtCursor(
                      '\n\n:::columns 2\n### Column One\nLeft column notes.\n:::col\n### Column Two\nRight column notes.\n:::\n\n'
                    );
                    setOpenMenu(null);
                  }}
                  className="text-left px-2 py-1 rounded text-[11px] bg-[#090b0f] hover:bg-[#b68d40]/15 text-[#ded8cc] border border-[#141821]"
                >
                  2 Equal Columns
                </button>
                <button
                  onClick={() => {
                    editorRef.current?.insertTokenAtCursor(
                      '\n\n:::columns 3\n### First\nNotes...\n:::col\n### Second\nNotes...\n:::col\n### Third\nNotes...\n:::\n\n'
                    );
                    setOpenMenu(null);
                  }}
                  className="text-left px-2 py-1 rounded text-[11px] bg-[#090b0f] hover:bg-[#b68d40]/15 text-[#ded8cc] border border-[#141821]"
                >
                  3 Equal Columns
                </button>
                <button
                  onClick={() => {
                    editorRef.current?.insertTokenAtCursor(
                      '\n\n:::columns 1:2\n:::card Sidebar\nQuick facts or portrait here.\n:::\n:::col\n## Main Chronicle\nPrimary narrative details.\n:::\n\n'
                    );
                    setOpenMenu(null);
                  }}
                  className="text-left px-2 py-1 rounded text-[11px] bg-[#090b0f] hover:bg-[#b68d40]/15 text-[#ded8cc] border border-[#141821]"
                >
                  Sidebar + Main (1:2)
                </button>
                <button
                  onClick={() => {
                    editorRef.current?.insertTokenAtCursor(
                      '\n\n:::columns 2:1\n## Main Section\nPrimary prose...\n:::col\n:::statblock Quick Stats\n- **CR:** 5\n- **HP:** 78\n:::\n:::\n\n'
                    );
                    setOpenMenu(null);
                  }}
                  className="text-left px-2 py-1 rounded text-[11px] bg-[#090b0f] hover:bg-[#b68d40]/15 text-[#ded8cc] border border-[#141821]"
                >
                  Main + Stats (2:1)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1 pt-1.5 border-t border-[#141821]">
              <button
                onClick={() => {
                  editorRef.current?.insertTokenAtCursor(
                    '\n\n| Column 1 | Column 2 | Value |\n| :--- | :---: | ---: |\n| Entry A | Detail | 100 |\n| Entry B | Detail | 250 |\n\n'
                  );
                  setOpenMenu(null);
                }}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] text-[#ded8cc] bg-[#090b0f] hover:bg-[#b68d40]/15 border border-[#141821]"
              >
                <Table2 className="w-3.5 h-3.5 text-[#b68d40]" />
                <span>Table</span>
              </button>
              <button
                onClick={() => {
                  editorRef.current?.insertTokenAtCursor('\n\n:::page-break New Section\n\n');
                  setOpenMenu(null);
                }}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] text-[#ded8cc] bg-[#090b0f] hover:bg-[#b68d40]/15 border border-[#141821]"
              >
                <SeparatorHorizontal className="w-3.5 h-3.5 text-[#b68d40]" />
                <span>Split Page</span>
              </button>
            </div>

            <div className="space-y-0.5 pt-1.5 border-t border-[#141821]">
              <button
                onClick={() => {
                  editorRef.current?.insertTokenAtCursor('\n\n> [!lore] Lore Chronicle\n> Ancient whispers tell of...\n\n');
                  setOpenMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded text-xs text-[#d6b16a] hover:bg-[#b68d40]/15 flex items-center justify-between"
              >
                <span>Lore Callout</span>
                <span className="font-mono text-[10px] text-[#606876]">[!lore]</span>
              </button>
              <button
                onClick={() => {
                  editorRef.current?.insertTokenAtCursor('\n\n> [!warning] Danger / Hazard\n> Beware the wardens...\n\n');
                  setOpenMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded text-xs text-amber-300/90 hover:bg-[#b68d40]/15 flex items-center justify-between"
              >
                <span>Warning Callout</span>
                <span className="font-mono text-[10px] text-[#606876]">[!warning]</span>
              </button>
              <button
                onClick={() => {
                  editorRef.current?.insertTokenAtCursor('\n\n> [!tip] Note\n> Helpful reminder...\n\n');
                  setOpenMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded text-xs text-emerald-300/90 hover:bg-[#b68d40]/15 flex items-center justify-between"
              >
                <span>Tip Callout</span>
                <span className="font-mono text-[10px] text-[#606876]">[!tip]</span>
              </button>
              <button
                onClick={() => {
                  editorRef.current?.insertTokenAtCursor(
                    '\n\n:::statblock Creature / Artifact\n- **Armor Class:** 16\n- **Hit Points:** 92\n- **Trait:** Arcane Resilience\n:::\n\n'
                  );
                  setOpenMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded text-xs text-[#ded8cc] hover:bg-[#b68d40]/15 flex items-center justify-between"
              >
                <span>Statblock Box</span>
                <span className="font-mono text-[10px] text-[#606876]">:::statblock</span>
              </button>
              <button
                onClick={() => {
                  editorRef.current?.insertTokenAtCursor('\n\n:::card Highlight Card\nStyled container card content.\n:::\n\n');
                  setOpenMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded text-xs text-[#ded8cc] hover:bg-[#b68d40]/15 flex items-center justify-between"
              >
                <span>Container Card</span>
                <span className="font-mono text-[10px] text-[#606876]">:::card</span>
              </button>
              <button
                onClick={() => {
                  editorRef.current?.insertTokenAtCursor('\n\n:::details Click to Expand Spoiler\nHidden details revealed on click.\n:::\n\n');
                  setOpenMenu(null);
                }}
                className="w-full text-left px-2 py-1 rounded text-xs text-[#ded8cc] hover:bg-[#b68d40]/15 flex items-center justify-between"
              >
                <span>Collapsible Spoiler</span>
                <span className="font-mono text-[10px] text-[#606876]">:::details</span>
              </button>
            </div>

            <div className="pt-1.5 border-t border-[#141821]">
              <button
                onClick={() => {
                  setOpenMenu(null);
                  editorRef.current?.openEmbedModal();
                }}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-[#090b0f] border border-[#b68d40]/35 text-[#d6b16a] hover:border-[#c9a050]"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                <span>Embed Image, Asset or Entry ![[...]]</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu((m) => (m === 'style' ? null : 'style'))}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
            openMenu === 'style'
              ? 'bg-[#121620] border-[#b68d40]/55 text-[#d6b16a]'
              : 'bg-[#090b0f] border-[#151a23] text-[#a9b1be] hover:text-[#e8dfd0] hover:border-[#b68d40]/45'
          }`}
          title="Formatting, Fonts, Sizes, Colors & Alignment"
        >
          <Palette className="w-3 h-3 text-[#b68d40]" />
          <span>Aa Style</span>
        </button>
        {openMenu === 'style' && (
          <div className="absolute right-0 mt-1.5 w-76 rounded-lg dark-glass shadow-glass p-3 space-y-3 z-50 border border-[#b68d40]/35">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#c9a050]">
                Format &amp; Typography
              </span>
              <button onClick={() => setOpenMenu(null)} className="text-[#737c8c] hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-0.5 p-1 rounded-md bg-[#040507] border border-[#131720]">
              <button
                onClick={() => editorRef.current?.wrapSelection('**', '**', 'bold')}
                title="Bold"
                className="p-1.5 rounded text-[#8e97a6] hover:text-[#e8dfd0] hover:bg-[#10141c]"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editorRef.current?.wrapSelection('*', '*', 'italic')}
                title="Italic"
                className="p-1.5 rounded text-[#8e97a6] hover:text-[#e8dfd0] hover:bg-[#10141c]"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editorRef.current?.wrapSelection('==', '==', 'highlight')}
                title="Highlight (==text==)"
                className="p-1.5 rounded text-[#8e97a6] hover:text-[#d6b16a] hover:bg-[#10141c]"
              >
                <Highlighter className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  if (codeSubMode === 'visual') editorRef.current?.toggleVisualHeading2();
                  else editorRef.current?.insertTokenAtCursor('\n## ');
                  setOpenMenu(null);
                }}
                title="Heading 2"
                className="p-1.5 rounded text-[#8e97a6] hover:text-[#e8dfd0] hover:bg-[#10141c]"
              >
                <Heading2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  if (codeSubMode === 'visual') editorRef.current?.toggleVisualBulletList();
                  else editorRef.current?.insertTokenAtCursor('\n- ');
                  setOpenMenu(null);
                }}
                title="Bullet List"
                className="p-1.5 rounded text-[#8e97a6] hover:text-[#e8dfd0] hover:bg-[#10141c]"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  editorRef.current?.insertTokenAtCursor('\n- [ ] Task item\n');
                  setOpenMenu(null);
                }}
                title="Checklist Item"
                className="p-1.5 rounded text-[#8e97a6] hover:text-[#e8dfd0] hover:bg-[#10141c]"
              >
                <CheckSquare className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  if (codeSubMode === 'visual') editorRef.current?.toggleVisualBlockquote();
                  else editorRef.current?.insertTokenAtCursor('\n> ');
                  setOpenMenu(null);
                }}
                title="Blockquote"
                className="p-1.5 rounded text-[#8e97a6] hover:text-[#e8dfd0] hover:bg-[#10141c]"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[10px] text-[#7a8291]">
              Select text to style inline <code className="text-[#c9a050]">[text]{'{...}'}</code>, or leave unselected to style the whole note.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] text-[#8e97a6] flex items-center gap-1">
                  <Type className="w-3 h-3 text-[#b68d40]" /> Font Family
                </span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    editorRef.current?.applyStyleProperty('font', e.target.value);
                    setOpenMenu(null);
                  }}
                  className="w-full bg-[#040507] border border-[#181e28] rounded px-1.5 py-1 text-[11px] text-[#ded8cc]"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.label} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-[#8e97a6]">Font Size</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) editorRef.current?.applyStyleProperty('size', e.target.value);
                    setOpenMenu(null);
                  }}
                  className="w-full bg-[#040507] border border-[#181e28] rounded px-1.5 py-1 text-[11px] text-[#ded8cc]"
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
              <span className="text-[10px] text-[#8e97a6]">Text Color</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {COLOR_SWATCHES.map((sw) => (
                  <button
                    key={sw.value}
                    type="button"
                    title={sw.label}
                    onClick={() => {
                      editorRef.current?.applyStyleProperty('color', sw.value);
                      setOpenMenu(null);
                    }}
                    className="w-5 h-5 rounded-full border border-white/25 hover:scale-110 transition-transform"
                    style={{ backgroundColor: sw.value }}
                  />
                ))}
                <label
                  title="Custom Text Color"
                  className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#040507] border border-[#181e28] text-[10px] text-[#bdb7ac] cursor-pointer"
                >
                  <input
                    type="color"
                    value={customTextColor}
                    onChange={(e) => {
                      setCustomTextColor(e.target.value);
                      editorRef.current?.applyStyleProperty('color', e.target.value);
                    }}
                    className="w-4 h-4 bg-transparent border-0 cursor-pointer"
                  />
                  <span>Pick</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#141822]">
              <label className="flex items-center gap-1.5 text-[10.5px] text-[#8e97a6] cursor-pointer">
                <input
                  type="color"
                  value={customBgColor}
                  onChange={(e) => {
                    setCustomBgColor(e.target.value);
                    editorRef.current?.applyStyleProperty('bg', e.target.value);
                  }}
                  className="w-4 h-4 bg-transparent border-0 cursor-pointer"
                />
                <span>Text Highlight BG</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    editorRef.current?.applyBlockAlign('left');
                    setOpenMenu(null);
                  }}
                  className="p-1 rounded bg-[#0d1016] text-[#8e97a6] hover:text-white"
                  title="Align Left"
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    editorRef.current?.applyBlockAlign('center');
                    setOpenMenu(null);
                  }}
                  className="p-1 rounded bg-[#0d1016] text-[#8e97a6] hover:text-white"
                  title="Align Center"
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    editorRef.current?.applyBlockAlign('right');
                    setOpenMenu(null);
                  }}
                  className="p-1 rounded bg-[#0d1016] text-[#8e97a6] hover:text-white"
                  title="Align Right"
                >
                  <AlignRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface MarkdownGrimoireEditorProps {
  docId: string;
  value: string;
  updatedAt?: string;
  readOnly?: boolean;
  codeSubMode: GrimoireCodeSubMode;
  syncScroll?: boolean;
  scopeClass?: string;
  coverImageUrl?: string | null;
  coverTitle?: string;
  coverOpacity?: number;
  placeholder?: string;
  onChange: (nextMd: string) => void;
}

export const MarkdownGrimoireEditor = forwardRef<
  MarkdownGrimoireEditorHandle,
  MarkdownGrimoireEditorProps
>(
  (
    {
      docId,
      value,
      updatedAt,
      readOnly = false,
      codeSubMode,
      syncScroll = true,
      scopeClass = '',
      coverImageUrl,
      coverTitle,
      coverOpacity = 0.95,
      placeholder = 'Type / for blocks (columns, tables, page splits, callouts, embeds), [[ to link notes, or [text]{color=#b68d40 font=cinzel}...',
      onChange,
    },
    ref
  ) => {
    const { entities, assets, addAsset, openEntityByTitle, openAssetTab } = useVaultStore();

    const [rawMarkdown, setRawMarkdown] = useState(value);
    const [splitPercent, setSplitPercent] = useState(50);
    const [hasSelection, setHasSelection] = useState(false);

    // Embed Modal
    const [embedModalOpen, setEmbedModalOpen] = useState(false);
    const [embedTab, setEmbedTab] = useState<'asset' | 'entry'>('asset');
    const [embedRef, setEmbedRef] = useState('');
    const [embedPreviewUrl, setEmbedPreviewUrl] = useState('');
    const [embedAlt, setEmbedAlt] = useState('');
    const [embedOpacity, setEmbedOpacity] = useState(1);
    const [embedAlign, setEmbedAlign] = useState<'none' | 'left' | 'right' | 'center'>('none');
    const [embedWidth, setEmbedWidth] = useState('');
    const [uploadingEmbed, setUploadingEmbed] = useState(false);

    // Autocomplete
    const [rawTrigger, setRawTrigger] = useState<{
      kind: 'note' | 'asset' | 'slash';
      query: string;
      startIdx: number;
      endIdx: number;
    } | null>(null);

    const [suggestion, setSuggestion] = useState<{
      active: boolean;
      query: string;
      rect: DOMRect | null;
      command: ((item: { title: string }) => void) | null;
    }>({
      active: false,
      query: '',
      rect: null,
      command: null,
    });
    const [selectedSuggestIdx, setSelectedSuggestIdx] = useState(0);

    const [hoverPreview, setHoverPreview] = useState<{
      entity: Entity;
      x: number;
      y: number;
    } | null>(null);

    const rawTextareaRef = useRef<HTMLTextAreaElement>(null);
    const livePreviewScrollRef = useRef<HTMLDivElement>(null);
    const splitContainerRef = useRef<HTMLDivElement>(null);
    const isResizingSplitRef = useRef(false);
    const entitiesRef = useRef(entities);
    entitiesRef.current = entities;
    const assetsRef = useRef(assets);
    assetsRef.current = assets;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const suggestionItems = useMemo(() => {
      const q = suggestion.query.toLowerCase();
      return entities
        .filter((e) => e.id !== docId && e.title.toLowerCase().includes(q))
        .slice(0, 8);
    }, [entities, docId, suggestion.query]);

    const rawMatches = useMemo(() => {
      if (!rawTrigger) return [];
      const q = rawTrigger.query.toLowerCase();
      if (rawTrigger.kind === 'asset') {
        const matchedAssets = assets
          .filter((a) => a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q))
          .slice(0, 5)
          .map((a) => ({ kind: 'asset' as const, item: a }));
        const matchedEntries = entities
          .filter((e) => e.id !== docId && e.title.toLowerCase().includes(q))
          .slice(0, 4)
          .map((e) => ({ kind: 'entity' as const, item: e }));
        return [...matchedAssets, ...matchedEntries];
      }
      return entities
        .filter((e) => e.id !== docId && e.title.toLowerCase().includes(q))
        .slice(0, 8)
        .map((e) => ({ kind: 'entity' as const, item: e }));
    }, [rawTrigger, assets, entities, docId]);

    const filteredSlashCommands = useMemo(() => {
      if (rawTrigger?.kind !== 'slash') return [];
      const q = rawTrigger.query.toLowerCase();
      return SLASH_COMMANDS.filter(
        (c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q)
      );
    }, [rawTrigger]);

    const renderedPreviewHtml = useMemo(
      () => markdownToHtml(rawMarkdown, assets, entities),
      [rawMarkdown, assets, entities]
    );
    const { noteVars } = useMemo(
      () => parseNoteMarkdownStyleBlock(rawMarkdown),
      [rawMarkdown]
    );

    const editor = useEditor(
      {
        editable: !readOnly,
        extensions: [
          StarterKit,
          VaultImageNode,
          Placeholder.configure({
            placeholder: 'Write campaign lore... Type [[ to link any entity, or embed via ![[slug]].',
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
        content: markdownToHtml(value || '', assets, entities),
        onUpdate: ({ editor: ed }) => {
          const md = htmlToMarkdown(ed.getHTML());
          setRawMarkdown(md);
          onChangeRef.current(md);
        },
      },
      [docId, readOnly]
    );

    useEffect(() => {
      setRawMarkdown(value);
      if (editor && !editor.isFocused) {
        const targetHtml = markdownToHtml(value, assetsRef.current, entitiesRef.current);
        if (editor.getHTML() !== targetHtml) {
          editor.commands.setContent(targetHtml, false);
        }
      }
    }, [docId, updatedAt, value, editor]);

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

    const commitMarkdown = (nextMd: string, nextCursorPos?: number) => {
      if (readOnly) return;
      setRawMarkdown(nextMd);
      onChangeRef.current(nextMd);
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

    const insertTokenAtCursor = (token: string, selectInnerOffset?: [number, number]) => {
      if (readOnly) return;
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
      if (readOnly) return;
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

    const applyStyleProperty = (key: string, val: string) => {
      if (readOnly) return;
      const ta = rawTextareaRef.current;
      const start = ta ? ta.selectionStart : 0;
      const end = ta ? ta.selectionEnd : 0;

      if (ta && end > start) {
        const selected = rawMarkdown.slice(start, end);
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
      if (readOnly) return;
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

    useImperativeHandle(ref, () => ({
      insertTokenAtCursor,
      wrapSelection,
      applyStyleProperty,
      applyBlockAlign,
      toggleVisualHeading2: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
      toggleVisualBulletList: () => editor?.chain().focus().toggleBulletList().run(),
      toggleVisualBlockquote: () => editor?.chain().focus().toggleBlockquote().run(),
      openEmbedModal: () => {
        setEmbedTab('asset');
        setEmbedRef('');
        setEmbedPreviewUrl('');
        setEmbedAlt('');
        setEmbedOpacity(1);
        setEmbedAlign('none');
        setEmbedWidth('');
        setEmbedModalOpen(true);
      },
    }));

    const insertImageIntoContent = (
      refOrUrl: string,
      resolvedDisplayUrl: string,
      alt: string,
      opacity = 1,
      align: 'none' | 'left' | 'right' | 'center' = 'none',
      width = ''
    ) => {
      if (!refOrUrl.trim() || readOnly) return;
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
      if (!file || readOnly) return;
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
      if (!files || files.length === 0 || readOnly) return;
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
      if (readOnly) return;
      const val = e.target.value;
      const cursor = e.target.selectionStart || 0;
      setRawMarkdown(val);
      onChangeRef.current(val);
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
      const slashMatch = before.match(/(?:^|\s)\/([a-z0-9-]*)$/i);
      if (slashMatch) {
        const tokenLen = slashMatch[1].length + 1;
        setRawTrigger({
          kind: 'slash',
          query: slashMatch[1],
          startIdx: cursor - tokenLen,
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
      const cursorAfter = rawTrigger.startIdx + replacement.length;
      setRawTrigger(null);
      commitMarkdown(nextMd, cursorAfter);
    };

    const handleRawKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape' && rawTrigger) {
        setRawTrigger(null);
        return;
      }
      if (e.key === 'Enter' && rawTrigger?.kind === 'slash' && filteredSlashCommands.length > 0) {
        e.preventDefault();
        const chosen = filteredSlashCommands[0];
        if (chosen.token === '__OPEN_EMBED__') {
          const nextMd = rawMarkdown.slice(0, rawTrigger.startIdx) + rawMarkdown.slice(rawTrigger.endIdx);
          setRawTrigger(null);
          commitMarkdown(nextMd, rawTrigger.startIdx);
          setEmbedTab('asset');
          setEmbedModalOpen(true);
        } else {
          applyRawAutocomplete(chosen.token);
        }
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

    const lineCount = Math.max(1, rawMarkdown.split(/\r?\n/).length);

    return (
      <>
        {codeSubMode === 'visual' ? (
          <div className="flex-1 overflow-y-auto p-6 bg-[#06070a]">
            <div className="max-w-4xl mx-auto rounded-xl bg-[#07090d]/95 border border-[#12161e] overflow-hidden">
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
          <div ref={splitContainerRef} className="flex-1 flex min-h-0 overflow-hidden">
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
              className="relative h-full flex flex-col min-w-0 bg-[#050609]/98"
            >
              <div className="relative flex-1 flex min-h-0 overflow-hidden">
                <div
                  aria-hidden
                  className="hidden sm:block w-10 py-4 pr-2 text-right font-mono text-[11px] leading-[1.65] text-[#303744] select-none overflow-hidden bg-[#030406] border-r border-[#0e1118]"
                >
                  {Array.from({ length: Math.min(lineCount, 400) }, (_, idx) => (
                    <div key={idx}>{idx + 1}</div>
                  ))}
                </div>

                <textarea
                  ref={rawTextareaRef}
                  readOnly={readOnly}
                  value={rawMarkdown}
                  onChange={handleRawMarkdownChange}
                  onKeyDown={handleRawKeyDown}
                  onScroll={handleRawScroll}
                  onSelect={() => {
                    const ta = rawTextareaRef.current;
                    setHasSelection(Boolean(ta && ta.selectionEnd > ta.selectionStart));
                  }}
                  onMouseUp={() => {
                    const ta = rawTextareaRef.current;
                    setHasSelection(Boolean(ta && ta.selectionEnd > ta.selectionStart));
                  }}
                  onKeyUp={() => {
                    const ta = rawTextareaRef.current;
                    setHasSelection(Boolean(ta && ta.selectionEnd > ta.selectionStart));
                  }}
                  spellCheck={false}
                  placeholder={placeholder}
                  className="flex-1 h-full w-full bg-transparent px-4 py-4 font-mono text-[13px] leading-[1.65] text-[#dad3c5] placeholder:text-[#414a59] focus:outline-none resize-none overflow-y-auto"
                />
              </div>

              {!readOnly && hasSelection && !rawTrigger && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 px-2 py-1 rounded-full dark-glass shadow-glass border border-[#b68d40]/45">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      wrapSelection('**', '**', 'bold');
                    }}
                    className="p-1 rounded-full text-[#ccc6ba] hover:text-white hover:bg-[#141923]"
                    title="Bold"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      wrapSelection('*', '*', 'italic');
                    }}
                    className="p-1 rounded-full text-[#ccc6ba] hover:text-white hover:bg-[#141923]"
                    title="Italic"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      wrapSelection('==', '==', 'highlight');
                    }}
                    className="p-1 rounded-full text-[#d6b16a] hover:bg-[#141923]"
                    title="Highlight (==text==)"
                  >
                    <Highlighter className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-px h-3.5 bg-[#1b212d] mx-0.5" />
                  {[
                    { label: 'Gold', color: '#b68d40' },
                    { label: 'Crimson', color: '#e06c6c' },
                    { label: 'Azure', color: '#6098e0' },
                  ].map((sw) => (
                    <button
                      key={sw.color}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyStyleProperty('color', sw.color);
                      }}
                      title={`Color: ${sw.label}`}
                      className="w-4 h-4 mx-0.5 rounded-full border border-white/30 hover:scale-110 transition-transform"
                      style={{ backgroundColor: sw.color }}
                    />
                  ))}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyStyleProperty('font', 'cinzel');
                    }}
                    title="Cinzel Display Font"
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-serif font-semibold text-[#d6b16a] hover:bg-[#141923]"
                  >
                    Cinzel
                  </button>
                </div>
              )}

              {!readOnly && rawTrigger?.kind === 'slash' && filteredSlashCommands.length > 0 && (
                <div className="absolute left-12 bottom-4 z-40 w-80 rounded-lg dark-glass shadow-glass py-1.5 border border-[#b68d40]/40">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#c9a050] border-b border-[#141821]">
                    Obsidian Slash Commands (/...)
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {filteredSlashCommands.map((cmd, idx) => (
                      <button
                        key={cmd.id}
                        type="button"
                        onClick={() => {
                          if (cmd.token === '__OPEN_EMBED__') {
                            const nextMd =
                              rawMarkdown.slice(0, rawTrigger.startIdx) +
                              rawMarkdown.slice(rawTrigger.endIdx);
                            setRawTrigger(null);
                            commitMarkdown(nextMd, rawTrigger.startIdx);
                            setEmbedTab('asset');
                            setEmbedModalOpen(true);
                          } else {
                            applyRawAutocomplete(cmd.token);
                          }
                        }}
                        className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                          idx === 0
                            ? 'bg-[#b68d40]/15 text-[#e6d7b4]'
                            : 'text-[#ded8cc] hover:bg-[#b68d40]/15'
                        }`}
                      >
                        <span>{cmd.label}</span>
                        <span className="font-mono text-[10px] text-[#737c8c]">{cmd.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!readOnly && rawTrigger && rawTrigger.kind !== 'slash' && rawMatches.length > 0 && (
                <div className="absolute left-12 bottom-4 z-40 w-80 rounded-lg dark-glass shadow-glass py-1.5 border border-[#b68d40]/40">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#c9a050] border-b border-[#141821]">
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
                            className="w-full px-2.5 py-1.5 text-left flex items-center gap-2 text-xs text-[#ded8cc] hover:bg-[#b68d40]/15"
                          >
                            <img
                              src={a.url}
                              alt={a.name}
                              className="w-5 h-5 rounded object-cover border border-[#1a202c]"
                            />
                            <span className="truncate flex-1">{a.name}</span>
                            <span className="font-mono text-[10px] text-[#c9a050]">
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
                          className="w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 text-xs text-[#ded8cc] hover:bg-[#b68d40]/15"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <EntityIcon type={ent.type} className="w-3.5 h-3.5 text-[#c9a050]" />
                            <span className="truncate">{ent.title}</span>
                          </span>
                          <span className="font-mono text-[10px] text-[#737c8c]">{ent.type}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {codeSubMode === 'split' && (
              <>
                <div
                  onMouseDown={() => {
                    isResizingSplitRef.current = true;
                  }}
                  title="Drag to resize Code / Live Preview split"
                  className="w-[4px] bg-[#0b0d12] hover:bg-[#b68d40]/50 border-x border-[#12161f] cursor-col-resize transition-colors shrink-0 flex items-center justify-center group"
                >
                  <span className="w-[1px] h-8 bg-[#1e2430] group-hover:bg-[#d6b16a]" />
                </div>

                <div
                  ref={livePreviewScrollRef}
                  className={`flex-1 h-full overflow-y-auto bg-[#07090d]/96 ${scopeClass}`}
                >
                  <div className="px-6 py-5 max-w-4xl mx-auto">
                    {coverImageUrl && (
                      <div className="mb-4 h-28 rounded-lg overflow-hidden border border-[#141821] relative">
                        <img
                          src={coverImageUrl}
                          alt={coverTitle || 'Cover'}
                          style={{ opacity: coverOpacity }}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#07090d] via-transparent to-transparent" />
                        {coverTitle && (
                          <div className="absolute bottom-2 left-3 font-serif text-lg font-bold text-[#ede5d6]">
                            {coverTitle}
                          </div>
                        )}
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

        {embedModalOpen && (
          <div
            onClick={() => setEmbedModalOpen(false)}
            className="fixed inset-0 z-50 bg-black/78 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-xl dark-glass shadow-glass border border-[#b68d40]/35 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[#141821] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImagePlus className="w-4 h-4 text-[#c9a050]" />
                  <span className="font-serif text-sm font-semibold text-[#e8dfd0]">
                    Embed Element into Note
                  </span>
                </div>
                <button
                  onClick={() => setEmbedModalOpen(false)}
                  className="text-[#757e8d] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-4 pt-3 flex items-center gap-1 border-b border-[#141821]">
                <button
                  onClick={() => setEmbedTab('asset')}
                  className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                    embedTab === 'asset'
                      ? 'border-[#b68d40] text-[#d6b16a]'
                      : 'border-transparent text-[#757e8d] hover:text-white'
                  }`}
                >
                  Image / Vault Asset
                </button>
                <button
                  onClick={() => setEmbedTab('entry')}
                  className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                    embedTab === 'entry'
                      ? 'border-[#b68d40] text-[#d6b16a]'
                      : 'border-transparent text-[#757e8d] hover:text-white'
                  }`}
                >
                  Transclude World Entry
                </button>
              </div>

              {embedTab === 'entry' ? (
                <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                  <p className="text-[11px] text-[#7a8291]">
                    Click any entry to embed it as a rich interactive preview card via{' '}
                    <code className="text-[#c9a050]">![[Title]]</code>.
                  </p>
                  <div className="space-y-1">
                    {entities
                      .filter((e) => e.id !== docId)
                      .map((ent) => (
                        <button
                          key={ent.id}
                          type="button"
                          onClick={() => {
                            insertTokenAtCursor(`\n\n![[${ent.title}]]\n\n`);
                            setEmbedModalOpen(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#050608] border border-[#141821] hover:border-[#b68d40]/55 text-left transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <EntityIcon type={ent.type} className="w-4 h-4 text-[#c9a050] shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-[#e8dfd0] truncate">
                                {ent.title}
                              </div>
                              <div className="text-[10.5px] text-[#6d7686] truncate">
                                {ent.summary || ent.type}
                              </div>
                            </div>
                          </div>
                          <span className="font-mono text-[10px] text-[#c9a050] shrink-0">Embed</span>
                        </button>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#c9a050]">
                        Select from Vault Assets
                      </span>
                      <label className="cursor-pointer px-2.5 py-1 rounded bg-[#0e1218] border border-[#b68d40]/40 text-[11px] text-[#d6b16a] hover:border-[#b68d40]">
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
                                ? 'border-[#b68d40] ring-1 ring-[#b68d40]'
                                : 'border-[#171c25] hover:border-[#b68d40]/50'
                            }`}
                          >
                            <img
                              src={asset.url}
                              alt={asset.name}
                              className="w-full h-14 object-cover bg-[#040507]"
                            />
                            <div className="px-1.5 py-1 bg-[#040507] text-[10px] text-[#ccc6ba] truncate">
                              {asset.name}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-[#848d9c] mb-1">
                        Asset Reference or URL
                      </label>
                      <input
                        value={embedRef}
                        onChange={(e) => {
                          setEmbedRef(e.target.value);
                          setEmbedPreviewUrl(e.target.value);
                        }}
                        placeholder="asset://slug or https://..."
                        className="w-full bg-[#040507] border border-[#171c25] rounded px-2.5 py-1.5 font-mono text-xs text-[#ded8cc] focus:outline-none focus:border-[#b68d40]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#848d9c] mb-1">Caption / Width</label>
                      <div className="flex gap-1.5">
                        <input
                          value={embedAlt}
                          onChange={(e) => setEmbedAlt(e.target.value)}
                          placeholder="Alt caption"
                          className="flex-1 min-w-0 bg-[#040507] border border-[#171c25] rounded px-2 py-1.5 text-xs text-[#ded8cc]"
                        />
                        <input
                          value={embedWidth}
                          onChange={(e) => setEmbedWidth(e.target.value)}
                          placeholder="260px"
                          className="w-16 bg-[#040507] border border-[#171c25] rounded px-2 py-1.5 font-mono text-xs text-[#ded8cc]"
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
                              ? 'bg-[#b68d40]/18 border-[#b68d40]/55 text-[#d6b16a]'
                              : 'bg-[#040507] border-[#171c25] text-[#7a8291]'
                          }`}
                        >
                          {al}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-[10.5px] text-[#848d9c]">Alpha</span>
                      <input
                        type="range"
                        min={0.15}
                        max={1}
                        step={0.05}
                        value={embedOpacity}
                        onChange={(e) => setEmbedOpacity(parseFloat(e.target.value))}
                        className="flex-1 accent-[#b68d40]"
                      />
                      <span className="font-mono text-[10.5px] text-[#c9a050]">
                        {Math.round(embedOpacity * 100)}%
                      </span>
                    </div>
                  </div>

                  {embedPreviewUrl && (
                    <div className="rounded bg-[#040507] border border-[#141821] p-2">
                      <img
                        src={embedPreviewUrl}
                        alt={embedAlt}
                        style={{ opacity: embedOpacity }}
                        className="max-h-28 mx-auto rounded object-contain"
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-[#141821]">
                    <button
                      onClick={() => setEmbedModalOpen(false)}
                      className="px-3 py-1.5 rounded bg-[#0e1218] text-xs text-[#848d9c]"
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

        {suggestion.active && suggestionItems.length > 0 && suggestion.rect && (
          <div
            style={{
              position: 'fixed',
              left: Math.min(suggestion.rect.left, window.innerWidth - 280),
              top: Math.min(suggestion.rect.bottom + 6, window.innerHeight - 240),
            }}
            className="z-50 w-64 rounded-lg dark-glass shadow-glass py-1.5 overflow-hidden"
          >
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#c9a050] border-b border-[#141821]">
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
                    ? 'bg-[#b68d40]/18 text-[#e6d7b4]'
                    : 'text-[#ccc6ba] hover:bg-[#10141c]'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <EntityIcon type={item.type} className="w-3.5 h-3.5 text-[#c9a050] shrink-0" />
                  <span className="truncate">{item.title}</span>
                </span>
                <span className="text-[10px] font-mono text-[#6d7686] shrink-0">{item.type}</span>
              </button>
            ))}
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
      </>
    );
  }
);
MarkdownGrimoireEditor.displayName = 'MarkdownGrimoireEditor';
