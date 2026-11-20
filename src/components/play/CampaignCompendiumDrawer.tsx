import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookMarked,
  ChevronLeft,
  Eye,
  EyeOff,
  Hammer,
  Image as ImageIcon,
  MapPin,
  Search,
  Swords,
  UserPlus,
  X,
} from 'lucide-react';
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
import type { Entity } from '../../types/vault';
import { EntityIcon } from '../common/EntityIcon';
import { WikiLinkHoverCard } from '../editor/WikiLinkHoverCard';

type CodexCategory =
  | 'all'
  | 'npcs'
  | 'bestiary'
  | 'locations'
  | 'items'
  | 'quests'
  | 'assets'
  | 'secrets';

export const CampaignCompendiumDrawer: React.FC = () => {
  const {
    playCodexOpen,
    playCodexEntityId,
    openPlayCodex,
    closePlayCodex,
    entities,
    assets,
    maps,
    mapPins,
    playActiveMapId,
    setPlayActiveMapId,
    setSelectedPinId,
    isEffectiveGm,
    myRole,
    setAppMode,
    openEntityTab,
    spawnEntityAsBattlemapToken,
    addEntityToInitiative,
    toggleEntityPlayerVisibility,
  } = useVaultStore();

  const effectiveGm = isEffectiveGm();
  const isGmUser = myRole === 'gm' || myRole === 'co_gm';
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CodexCategory>('all');
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{
    entity: Entity;
    x: number;
    y: number;
  } | null>(null);

  const visibleEntities = useMemo(
    () =>
      entities.filter((e) => {
        const isGmOnly = Boolean(
          e.metadata?.is_gm_only || (e as Entity & { is_gm_only?: boolean }).is_gm_only
        );
        return effectiveGm || !isGmOnly;
      }),
    [entities, effectiveGm]
  );

  const filteredEntities = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleEntities.filter((e) => {
      const isGmOnly = Boolean(
        e.metadata?.is_gm_only || (e as Entity & { is_gm_only?: boolean }).is_gm_only
      );
      if (category === 'npcs' && e.type !== 'Character' && e.type !== 'Faction' && e.type !== 'Organization') {
        return false;
      }
      if (category === 'bestiary' && e.type !== 'Bestiary') return false;
      if (category === 'locations' && e.type !== 'Location' && e.type !== 'Region') return false;
      if (category === 'items' && e.type !== 'Item' && e.type !== 'Magic') return false;
      if (category === 'quests' && e.type !== 'Quest' && e.type !== 'PlotThread' && e.type !== 'Session') {
        return false;
      }
      if (category === 'secrets' && !isGmOnly && !e.gm_secrets) return false;

      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [visibleEntities, category, query]);

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => !q || a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q));
  }, [assets, query]);

  const selectedEntity = useMemo(
    () =>
      playCodexEntityId
        ? visibleEntities.find((e) => e.id === playCodexEntityId) || null
        : null,
    [playCodexEntityId, visibleEntities]
  );

  const active2dMap = useMemo(() => {
    const current = maps.find((m) => m.id === playActiveMapId);
    if (current?.kind === '2d') return current;
    return maps.find((m) => m.kind === '2d') || null;
  }, [maps, playActiveMapId]);

  const selectedBody = useMemo(() => {
    if (!selectedEntity) return '';
    const lines = selectedEntity.content.split(/\r?\n/);
    const firstIdx = lines.findIndex((l) => l.trim().length > 0);
    if (firstIdx !== -1) {
      const m = lines[firstIdx].trim().match(/^#\s+(.+)$/);
      if (m && m[1].trim().toLowerCase() === selectedEntity.title.trim().toLowerCase()) {
        return [...lines.slice(0, firstIdx), ...lines.slice(firstIdx + 1)]
          .join('\n')
          .replace(/^\s*\n/, '');
      }
    }
    return selectedEntity.content;
  }, [selectedEntity]);

  const renderedHtml = useMemo(
    () => (selectedEntity ? markdownToHtml(selectedBody, assets, visibleEntities) : ''),
    [selectedEntity, selectedBody, assets, visibleEntities]
  );
  const { noteVars } = useMemo(
    () => parseNoteMarkdownStyleBlock(selectedEntity?.content || ''),
    [selectedEntity?.content]
  );
  const scopeClass = selectedEntity
    ? `codex-scope-${selectedEntity.id.replace(/[^a-zA-Z0-9_-]/g, '')}`
    : '';
  const scopedCss = useMemo(
    () => (selectedEntity ? scopeCustomCss(getEntityCustomCss(selectedEntity.metadata), scopeClass) : ''),
    [selectedEntity, scopeClass]
  );

  if (!playCodexOpen) return null;

  const showToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 2400);
  };

  const handleWikiMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('[data-wikilink]') as HTMLElement | null;
    if (!target) {
      if (hoverPreview) setHoverPreview(null);
      return;
    }
    const linkTitle = target.getAttribute('data-wikilink');
    if (!linkTitle) return;
    const found = visibleEntities.find(
      (ent) =>
        ent.title.toLowerCase() === linkTitle.toLowerCase() ||
        ent.slug.toLowerCase() === linkTitle.toLowerCase()
    );
    if (found) {
      const rect = target.getBoundingClientRect();
      setHoverPreview({ entity: found, x: rect.left, y: rect.bottom + 8 });
    }
  };

  const handleWikiClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('[data-wikilink]') as HTMLElement | null;
    if (!target) return;
    const linkTitle = target.getAttribute('data-wikilink');
    if (!linkTitle) return;
    const found = visibleEntities.find(
      (ent) =>
        ent.title.toLowerCase() === linkTitle.toLowerCase() ||
        ent.slug.toLowerCase() === linkTitle.toLowerCase()
    );
    if (found) {
      e.preventDefault();
      openPlayCodex(found.id);
    }
  };

  const selectedPins = selectedEntity
    ? mapPins.filter((p) => p.entity_id === selectedEntity.id && (effectiveGm || !p.is_gm_only))
    : [];
  const selectedIsGmOnly = Boolean(
    selectedEntity?.metadata?.is_gm_only ||
      (selectedEntity as (Entity & { is_gm_only?: boolean }) | null)?.is_gm_only
  );
  const selectedAppearance = selectedEntity
    ? getEntityAppearance(selectedEntity.metadata, assets)
    : null;

  return (
    <aside
      aria-label={effectiveGm ? 'Campaign Compendium' : 'World Codex'}
      className="fixed right-0 top-12 bottom-0 z-40 w-[440px] max-w-[95vw] bg-[#080b11]/98 backdrop-blur-md border-l border-[#1c2433] shadow-[-20px_0_50px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#161e2b] bg-[#0a0e16] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {selectedEntity ? (
            <button
              type="button"
              onClick={() => openPlayCodex(null)}
              className="p-1 rounded-md bg-[#121824] hover:bg-[#1a2232] text-[#d4a853] shrink-0"
              title="Back to Codex List"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : (
            <BookMarked className="w-4 h-4 text-[#d4a853] shrink-0" />
          )}
          <div className="min-w-0">
            <h2 className="font-serif text-sm font-semibold text-[#f3ead8] truncate">
              {selectedEntity
                ? selectedEntity.title
                : effectiveGm
                ? 'Campaign Compendium (GM Screen)'
                : 'World Codex & Handouts'}
            </h2>
            <p className="text-[10.5px] text-[#7f8a9c] truncate">
              {selectedEntity
                ? `${formatEntityTypeLabel(selectedEntity.type)} · Read-Only Session Reference`
                : effectiveGm
                ? 'Browse world lore, reveal entries, or spawn encounters into play'
                : 'Player-visible world lore, locations, and handouts'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={closePlayCodex}
          aria-label="Close Codex"
          className="p-1.5 rounded-lg text-[#8b94a5] hover:text-white hover:bg-[#141a25] shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {actionToast && (
        <div className="px-4 py-2 bg-emerald-950/75 border-b border-emerald-500/35 text-xs text-emerald-200 font-medium shrink-0">
          {actionToast}
        </div>
      )}

      {selectedEntity ? (
        /* Read-Only Dossier + GM Live Tabletop Actions */
        <div className="flex-1 overflow-y-auto relative">
          {scopedCss && <style>{scopedCss}</style>}
          {selectedAppearance?.bgImage && (
            <div
              className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
              style={{
                backgroundImage: `url("${selectedAppearance.bgImage}")`,
                opacity: selectedAppearance.bgOpacity * 0.65,
              }}
            />
          )}

          <div className={`relative z-10 p-4 space-y-4 ${scopeClass}`}>
            {selectedEntity.cover_image_url && (
              <div className="h-40 w-full rounded-xl overflow-hidden border border-[#1d2534] relative">
                <img
                  src={selectedEntity.cover_image_url}
                  alt={selectedEntity.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#080b11] via-transparent to-transparent" />
                <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#06080c]/85 text-[#d4a853] border border-[#d4a853]/40">
                    <EntityIcon type={selectedEntity.type} className="w-3 h-3" />
                    {formatEntityTypeLabel(selectedEntity.type)}
                  </span>
                  {selectedIsGmOnly && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-red-950/85 text-red-300 border border-red-500/40">
                      GM Hidden
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* GM Live Tabletop Action Bar */}
            {effectiveGm && (
              <div className="rounded-xl bg-[#0d121c] border border-[#d4a853]/35 p-3 space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#d4a853]">
                  Use in Live Session
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {active2dMap && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const tok = spawnEntityAsBattlemapToken(active2dMap.id, selectedEntity.id);
                          if (tok) {
                            setPlayActiveMapId(active2dMap.id);
                            showToast(`Spawned "${tok.name}" on ${active2dMap.name}`);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg btn-gold-metallic text-[11px] font-semibold inline-flex items-center gap-1.5"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Spawn Token ({active2dMap.name})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          addEntityToInitiative(active2dMap.id, selectedEntity.id);
                          setPlayActiveMapId(active2dMap.id);
                          showToast(`Added "${selectedEntity.title}" to Initiative`);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[#141b28] border border-[#243044] hover:border-[#d4a853]/50 text-[11px] text-[#e8dfd0] inline-flex items-center gap-1.5"
                      >
                        <Swords className="w-3.5 h-3.5 text-[#d4a853]" />
                        <span>Add to Initiative</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      toggleEntityPlayerVisibility(selectedEntity.id);
                      showToast(
                        selectedIsGmOnly
                          ? `Revealed "${selectedEntity.title}" to players`
                          : `Hid "${selectedEntity.title}" from players`
                      );
                    }}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] inline-flex items-center gap-1.5 transition-colors ${
                      selectedIsGmOnly
                        ? 'bg-emerald-950/45 border-emerald-500/40 text-emerald-200 hover:bg-emerald-900/45'
                        : 'bg-[#141b28] border-[#243044] text-[#c8c2b6] hover:border-red-500/45 hover:text-red-200'
                    }`}
                  >
                    {selectedIsGmOnly ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>{selectedIsGmOnly ? 'Reveal to Players' : 'Hide from Players'}</span>
                  </button>
                  {selectedPins[0] && (
                    <button
                      type="button"
                      onClick={() => {
                        setPlayActiveMapId(selectedPins[0].map_id);
                        setSelectedPinId(selectedPins[0].id);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#141b28] border border-[#243044] hover:border-[#d4a853]/50 text-[11px] text-[#e2b969] inline-flex items-center gap-1.5"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Locate on Map</span>
                    </button>
                  )}
                  {isGmUser && (
                    <button
                      type="button"
                      onClick={() => {
                        setAppMode('studio');
                        openEntityTab(selectedEntity.id);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#12161f] border border-[#222a3a] hover:border-[#d4a853]/50 text-[11px] text-[#9aa3b2] hover:text-[#f3ead8] inline-flex items-center gap-1"
                    >
                      <Hammer className="w-3 h-3 text-[#d4a853]" />
                      <span>Edit in Studio</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {selectedEntity.summary && (
              <p className="font-editorial text-[16.5px] leading-relaxed text-[#e0d9cc] border-l-2 border-[#d4a853]/60 pl-3.5 italic">
                {selectedEntity.summary}
              </p>
            )}

            {getVisibleMetadataEntries(selectedEntity.metadata).length > 0 && (
              <div className="rounded-lg bg-[#0b0f17] border border-[#1a2232] divide-y divide-[#141a26]">
                {getVisibleMetadataEntries(selectedEntity.metadata).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span className="font-mono text-[11px] text-[#7c8698]">{k}</span>
                    <span className="font-medium text-[#ede5d6]">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            <div
              style={noteVars as React.CSSProperties}
              className="tiptap py-1"
              onMouseOver={handleWikiMouseOver}
              onMouseLeave={() => setHoverPreview(null)}
              onClick={handleWikiClick}
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />

            {effectiveGm && selectedEntity.gm_secrets && (
              <div className="rounded-xl border border-red-500/35 border-l-4 border-l-red-500/75 bg-red-950/20 px-3.5 py-3 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span>GM Secret</span>
                </div>
                <p className="text-xs text-red-100/90 leading-relaxed whitespace-pre-wrap">
                  {selectedEntity.gm_secrets}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Browse & Search Compendium List */
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3 border-b border-[#161e2b] space-y-2.5 shrink-0">
            <div className="flex items-center gap-2 bg-[#05070b] border border-[#1a2230] focus-within:border-[#d4a853]/55 rounded-lg px-2.5 h-8">
              <Search className="w-3.5 h-3.5 text-[#7c8698] shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search NPCs, monsters, locations, items..."
                className="flex-1 bg-transparent text-xs text-[#f3ead8] placeholder:text-[#556070] focus:outline-none"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-[#7c8698] hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 flex-wrap text-[10.5px]">
              {(
                [
                  ['all', 'All'],
                  ['npcs', 'NPCs & Factions'],
                  ['bestiary', 'Bestiary'],
                  ['locations', 'Locations'],
                  ['items', 'Items'],
                  ['quests', 'Quests'],
                  ['assets', 'Handouts'],
                  ...(effectiveGm ? [['secrets', 'GM Secrets'] as const] : []),
                ] as Array<[CodexCategory, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${
                    category === key
                      ? 'bg-[#d4a853]/18 border-[#d4a853]/45 text-[#e2b969]'
                      : 'bg-[#0b0f17] border-[#192130] text-[#8b94a5] hover:text-[#e8e2d5]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {category === 'assets' ? (
              filteredAssets.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#6d7686]">
                  No campaign handouts or artwork found.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {filteredAssets.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-lg bg-[#0b0f17] border border-[#1a2232] overflow-hidden"
                    >
                      <img src={a.url} alt={a.name} className="w-full h-24 object-cover" />
                      <div className="p-2">
                        <div className="text-xs font-medium text-[#ede5d6] truncate flex items-center gap-1">
                          <ImageIcon className="w-3 h-3 text-[#d4a853] shrink-0" />
                          <span className="truncate">{a.name}</span>
                        </div>
                        <div className="text-[10px] font-mono text-[#7c8698] uppercase mt-0.5">
                          {a.kind}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : filteredEntities.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#6d7686]">
                No matching campaign entries.
              </div>
            ) : (
              filteredEntities.map((ent) => {
                const isGmOnly = Boolean(
                  ent.metadata?.is_gm_only || (ent as Entity & { is_gm_only?: boolean }).is_gm_only
                );
                return (
                  <div
                    key={ent.id}
                    className="rounded-xl bg-[#0b0f17] border border-[#192130] hover:border-[#d4a853]/45 p-3 transition-colors space-y-2"
                  >
                    <div className="flex items-start gap-2.5">
                      {ent.cover_image_url ? (
                        <img
                          src={ent.cover_image_url}
                          alt={ent.title}
                          className="w-11 h-11 rounded-lg object-cover border border-[#232c3d] shrink-0"
                        />
                      ) : (
                        <span className="w-11 h-11 rounded-lg bg-[#101622] border border-[#1f2838] flex items-center justify-center text-[#d4a853] shrink-0">
                          <EntityIcon type={ent.type} className="w-5 h-5" />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openPlayCodex(ent.id)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-[#f3ead8] hover:text-[#e2b969] truncate">
                            {ent.title}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-[#131926] text-[#c9a050]">
                            {ent.type}
                          </span>
                          {isGmOnly && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-red-950/70 text-red-300 border border-red-500/35">
                              GM Only
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#8d96a6] line-clamp-2 mt-0.5">
                          {ent.summary || 'Open dossier...'}
                        </p>
                      </button>
                    </div>

                    {effectiveGm && (
                      <div className="flex items-center gap-1.5 pt-1.5 border-t border-[#141b27]">
                        {active2dMap && (
                          <button
                            type="button"
                            onClick={() => {
                              const tok = spawnEntityAsBattlemapToken(active2dMap.id, ent.id);
                              if (tok) {
                                setPlayActiveMapId(active2dMap.id);
                                showToast(`Spawned "${tok.name}" on ${active2dMap.name}`);
                              }
                            }}
                            className="px-2 py-1 rounded bg-[#141b28] hover:bg-[#d4a853]/18 border border-[#222c3f] hover:border-[#d4a853]/45 text-[10.5px] text-[#e2b969] inline-flex items-center gap-1"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>Spawn</span>
                          </button>
                        )}
                        {active2dMap && (
                          <button
                            type="button"
                            onClick={() => {
                              addEntityToInitiative(active2dMap.id, ent.id);
                              setPlayActiveMapId(active2dMap.id);
                              showToast(`Added "${ent.title}" to Initiative`);
                            }}
                            className="px-2 py-1 rounded bg-[#141b28] hover:bg-[#1c2536] border border-[#222c3f] text-[10.5px] text-[#ded8cc] inline-flex items-center gap-1"
                          >
                            <Swords className="w-3 h-3 text-[#d4a853]" />
                            <span>Initiative</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleEntityPlayerVisibility(ent.id)}
                          className="ml-auto px-2 py-1 rounded bg-[#121722] border border-[#1f2737] text-[10.5px] text-[#9aa3b2] hover:text-white inline-flex items-center gap-1"
                          title={isGmOnly ? 'Reveal to Players' : 'Hide from Players'}
                        >
                          {isGmOnly ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3" />}
                          <span>{isGmOnly ? 'Reveal' : 'Hide'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {hoverPreview && (
        <WikiLinkHoverCard
          entity={hoverPreview.entity}
          x={hoverPreview.x}
          y={hoverPreview.y}
        />
      )}
    </aside>
  );
};
