import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Eye, Map as MapIcon, NotebookPen, Plus, Search, Users, X } from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';
import { EntityIcon } from '../common/EntityIcon';

export const CommandPalette: React.FC = () => {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    entities,
    maps,
    characters,
    journalPages,
    timelineEvents,
    openEntityTab,
    openMapTab,
    openCharacterTab,
    openJournalTab,
    openTimelineTab,
    openNewEntryModal,
    myRole,
    gmMode,
    setGmMode,
    isEffectiveGm,
  } = useVaultStore();

  const canSwitchGm = myRole === 'gm' || myRole === 'co_gm';
  const canGmEdit = isEffectiveGm();

  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      } else if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setActiveIdx(0);
    }
  }, [commandPaletteOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchedMaps = maps
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .map((m) => ({
        id: m.id,
        kind: 'map' as const,
        title: m.name,
        subtitle: `${m.kind === '2d' ? '2D Battlemap' : '3D World Map'} • ${m.scale_config?.ratio || '1 : 250 000'}`,
        type: m.kind === '2d' ? '2D Map' : '3D Map',
      }));

    const matchedCharacters = characters
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((c) => ({
        id: c.id,
        kind: 'character' as const,
        title: c.name,
        subtitle: `Character Sheet • ${c.is_active ? 'Active' : 'Inactive'}`,
        type: 'Character',
      }));

    const matchedJournals = journalPages
      .filter(
        (j) =>
          !q ||
          j.title.toLowerCase().includes(q) ||
          j.tags.some((t) => t.toLowerCase().includes(q))
      )
      .slice(0, 8)
      .map((j) => ({
        id: j.id,
        kind: 'journal' as const,
        title: j.title,
        subtitle: `Journal (${j.share_scope})`,
        type: 'Journal',
      }));

    const matchedTimeline = timelineEvents
      .filter(
        (ev) =>
          (canGmEdit || !ev.is_gm_only) &&
          (!q ||
            ev.title.toLowerCase().includes(q) ||
            ev.era.toLowerCase().includes(q) ||
            ev.date_label.toLowerCase().includes(q))
      )
      .slice(0, 6)
      .map((ev) => ({
        id: ev.id,
        kind: 'timeline' as const,
        title: ev.title,
        subtitle: `Timeline • ${ev.date_label}`,
        type: 'Timeline',
      }));

    const matchedEntities = entities
      .filter((e) => {
        const isGmOnly = Boolean(e.metadata?.is_gm_only || (e as { is_gm_only?: boolean }).is_gm_only);
        if (!canGmEdit && isGmOnly) return false;
        return (
          !q ||
          e.title.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q)) ||
          e.summary.toLowerCase().includes(q)
        );
      })
      .slice(0, 12)
      .map((e) => ({
        id: e.id,
        kind: 'entity' as const,
        title: e.title,
        subtitle: `${e.type} • ${e.summary}`,
        type: e.type,
      }));

    return [
      ...matchedMaps,
      ...matchedCharacters,
      ...matchedJournals,
      ...matchedTimeline,
      ...matchedEntities,
    ];
  }, [query, maps, characters, journalPages, timelineEvents, entities, canGmEdit]);

  if (!commandPaletteOpen) return null;

  const handleSelect = (item: (typeof results)[number]) => {
    if (item.kind === 'map') openMapTab(item.id);
    else if (item.kind === 'character') openCharacterTab(item.id);
    else if (item.kind === 'journal') openJournalTab(item.id);
    else if (item.kind === 'timeline') openTimelineTab();
    else openEntityTab(item.id);
    setCommandPaletteOpen(false);
  };

  return (
    <div
      onClick={() => setCommandPaletteOpen(false)}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[14vh] px-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl dark-glass shadow-glass overflow-hidden border border-[#d4a853]/35"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1d222b]">
          <Search className="w-4 h-4 text-[#d4a853]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIdx((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter' && results[activeIdx]) {
                handleSelect(results[activeIdx]);
              }
            }}
            placeholder="Search lore, characters, journals, maps, timeline..."
            className="flex-1 bg-transparent text-sm text-[#f3ead8] placeholder:text-[#6c7585] focus:outline-none"
          />
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="text-[#7c8594] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Actions */}
        <div className="px-3 py-2 bg-[#0b0d10]/70 border-b border-[#181d25] flex items-center gap-2 flex-wrap">
          {canGmEdit && (
            <button
              onClick={() => {
                setCommandPaletteOpen(false);
                openNewEntryModal('Location', 'encyclopedia');
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#171b22] border border-[#272e3a] hover:border-[#d4a853]/50 text-[11px] text-[#e5be58]"
            >
              <Plus className="w-3 h-3" />
              <span>New Entry</span>
            </button>
          )}
          {canSwitchGm && (
            <button
              onClick={() => {
                setGmMode(!gmMode);
                setCommandPaletteOpen(false);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#171b22] border border-[#272e3a] hover:border-[#d4a853]/50 text-[11px] text-[#d5d0c5]"
            >
              <Eye className="w-3 h-3 text-[#d4a853]" />
              <span>Toggle GM Mode ({gmMode ? 'ON' : 'OFF'})</span>
            </button>
          )}
          <button
            onClick={() => {
              openJournalTab();
              setCommandPaletteOpen(false);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#171b22] border border-[#272e3a] hover:border-[#d4a853]/50 text-[11px] text-[#d5d0c5]"
          >
            <NotebookPen className="w-3 h-3 text-[#d4a853]" />
            <span>Journals</span>
          </button>
          <button
            onClick={() => {
              openCharacterTab();
              setCommandPaletteOpen(false);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#171b22] border border-[#272e3a] hover:border-[#d4a853]/50 text-[11px] text-[#d5d0c5]"
          >
            <Users className="w-3 h-3 text-[#d4a853]" />
            <span>Characters</span>
          </button>
          <button
            onClick={() => {
              openTimelineTab();
              setCommandPaletteOpen(false);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#171b22] border border-[#272e3a] hover:border-[#d4a853]/50 text-[11px] text-[#d5d0c5]"
          >
            <Calendar className="w-3 h-3 text-[#d4a853]" />
            <span>Timeline</span>
          </button>
          {maps[0] && (
            <button
              onClick={() => {
                openMapTab(maps[0].id);
                setCommandPaletteOpen(false);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#171b22] border border-[#272e3a] hover:border-[#d4a853]/50 text-[11px] text-[#d5d0c5]"
            >
              <MapIcon className="w-3 h-3 text-[#d4a853]" />
              <span>Focus Map</span>
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[#737c8c]">
              No matching entries in Aethelgard Vault.
            </div>
          ) : (
            results.map((item, idx) => (
              <button
                key={`${item.kind}-${item.id}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setActiveIdx(idx)}
                className={`w-full px-4 py-2 text-left flex items-center justify-between gap-3 transition-colors ${
                  idx === activeIdx
                    ? 'bg-[#d4a853]/15 text-[#f7ecc9]'
                    : 'text-[#d5d0c5] hover:bg-[#161a22]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="p-1.5 rounded bg-[#141820] border border-[#232934] text-[#d4a853] shrink-0">
                    <EntityIcon
                      type={
                        item.kind === 'map'
                          ? 'Map'
                          : item.kind === 'journal'
                          ? 'PlayerNote'
                          : item.kind === 'timeline'
                          ? 'Chronicle'
                          : item.type
                      }
                      className="w-3.5 h-3.5"
                    />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate">{item.title}</div>
                    <div className="text-[11px] text-[#7c8594] truncate">{item.subtitle}</div>
                  </div>
                </div>
                <span className="font-mono text-[10px] text-[#7c8594] shrink-0">{item.type}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
