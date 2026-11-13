import React from 'react';
import {
  ArrowUpRight,
  ChevronRight,
  Eye,
  EyeOff,
  FileCode2,
  FilePlus2,
  Image as ImageIcon,
  Link2,
  MapPin,
  Network,
  PanelRightClose,
  Route,
  Square,
  Trash2,
} from 'lucide-react';
import { getVisibleMetadataEntries } from '../../lib/wikilinks';
import { useVaultStore } from '../../store/useVaultStore';
import { EntityType } from '../../types/vault';
import { EntityIcon } from '../common/EntityIcon';
import { BattlemapInspectorSection } from '../inspector/BattlemapInspectorSection';
import { ConnectionsGraph } from '../inspector/ConnectionsGraph';
import { WorldsmithInspectorSection } from '../inspector/WorldsmithInspectorSection';

export const RightInspector: React.FC = () => {
  const {
    tabs,
    activeTabId,
    inspectorSubTab,
    setInspectorSubTab,
    maps,
    mapPins,
    mapPaths,
    entities,
    assets,
    templates,
    entityLinks,
    gmMode,
    mapLayers,
    toggleMapLayer,
    setMapToolMode,
    mapToolMode,
    selectedPinId,
    setSelectedPinId,
    openEntityTab,
    openMapTab,
    openNewEntryModal,
    deleteMapPath,
    worldsmithMode,
    setRightInspectorCollapsed,
  } = useVaultStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isMapFocused = activeTab?.kind === 'map';
  const isAssetFocused = activeTab?.kind === 'asset';
  const isTemplateFocused = activeTab?.kind === 'template';

  const activeMap = isMapFocused
    ? maps.find((m) => m.id === activeTab.targetId) || maps[0]
    : maps[0];

  const focusedPin = selectedPinId ? mapPins.find((p) => p.id === selectedPinId) : null;
  const focusedEntityId = isMapFocused
    ? focusedPin?.entity_id || null
    : activeTab?.kind === 'entity'
    ? activeTab.targetId
    : null;

  const focusedEntity = focusedEntityId
    ? entities.find((e) => e.id === focusedEntityId)
    : null;

  const focusedAsset = isAssetFocused
    ? assets.find((a) => a.id === activeTab?.targetId) || null
    : null;

  const focusedTemplate = isTemplateFocused
    ? templates[activeTab?.targetId as EntityType] || null
    : null;

  const pinsOnMap = activeMap
    ? mapPins.filter((p) => p.map_id === activeMap.id && (gmMode || !p.is_gm_only))
    : [];

  const pathsOnMap = activeMap
    ? mapPaths.filter((p) => p.map_id === activeMap.id && (gmMode || !p.is_gm_only))
    : [];

  // Backlinks & Outgoing links for focused entity (or all map entities when map is active)
  const incomingLinks = focusedEntityId
    ? entityLinks
        .filter((l) => l.target_id === focusedEntityId)
        .map((l) => entities.find((e) => e.id === l.source_id))
        .filter((e): e is NonNullable<typeof e> => Boolean(e))
    : [];

  const outgoingLinks = focusedEntityId
    ? entityLinks
        .filter((l) => l.source_id === focusedEntityId)
        .map((l) => entities.find((e) => e.id === l.target_id))
        .filter((e): e is NonNullable<typeof e> => Boolean(e))
    : [];

  return (
    <aside className="h-full bg-[#0e1116] border-l border-[#1d222b] flex flex-col select-none overflow-hidden">
      {/* Top Sub-Tabs: Details | Connections | References + Collapse */}
      <div className="h-[38px] px-2 border-b border-[#1d222b] flex items-center justify-between bg-[#11141a] shrink-0">
        <div className="flex items-center justify-around flex-1 h-full">
          {(
            [
              { id: 'details', label: 'Details' },
              { id: 'connections', label: 'Connections' },
              { id: 'references', label: 'References' },
            ] as const
          ).map((tab) => {
            const active = inspectorSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setInspectorSubTab(tab.id)}
                className={`relative h-full px-2.5 text-[12px] font-medium transition-colors ${
                  active ? 'text-[#f0cf85]' : 'text-[#858d9b] hover:text-[#dfd9cc]'
                }`}
              >
                <span>{tab.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-1 right-1 h-[2px] bg-[#d4a853] rounded-t" />
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setRightInspectorCollapsed(true)}
          title="Collapse Inspector Drawer"
          aria-label="Collapse Inspector Drawer"
          className="p-1.5 rounded text-[#7e8796] hover:text-[#f0cf85] hover:bg-[#191f2a] transition-colors shrink-0"
        >
          <PanelRightClose className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {inspectorSubTab === 'details' && (
          <>
            {isMapFocused && activeMap?.kind === '2d' ? (
              <BattlemapInspectorSection activeMap={activeMap} />
            ) : isMapFocused && activeMap && worldsmithMode ? (
              <WorldsmithInspectorSection activeMap={activeMap} />
            ) : isMapFocused && activeMap ? (
              <>
                {/* Map Header & Metadata Table */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded bg-[#181d26] border border-[#d4a853]/30 text-[#d4a853]">
                      <EntityIcon type="Map" className="w-4 h-4" />
                    </span>
                    <h2 className="font-serif text-[14.5px] font-semibold text-[#f3ead8] truncate">
                      {activeMap.name}
                    </h2>
                  </div>

                  <div className="rounded-md bg-[#12161e] border border-[#1d222b] divide-y divide-[#1a1f28] text-[12px]">
                    <div className="flex items-center justify-between px-2.5 py-2">
                      <span className="text-[#858d9b]">Scale</span>
                      <span className="font-mono text-[#e7e2d8]">
                        {activeMap.scale_config.ratio}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-2">
                      <span className="text-[#858d9b]">Size</span>
                      <span className="font-mono text-[#e7e2d8]">
                        {activeMap.width} × {activeMap.height}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-2">
                      <span className="text-[#858d9b]">Elevation Source</span>
                      <span className="font-mono text-[11px] text-[#e7e2d8]">
                        {activeMap.scale_config.elevationSource}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Layers Toggle List (5) */}
                <div className="space-y-2 pt-1 border-t border-[#181d25]">
                  <div className="text-[11.5px] font-semibold text-[#b8b3a8] tracking-wide">
                    Layers (5)
                  </div>
                  <div className="space-y-1">
                    {(
                      [
                        ['terrain', 'Terrain (Elevation)'],
                        ['vegetation', 'Vegetation'],
                        ['locations', 'Locations'],
                        ['paths', 'Paths / Trails'],
                        ['regions', 'Regions'],
                      ] as Array<[keyof typeof mapLayers, string]>
                    ).map(([key, label]) => {
                      const visible = mapLayers[key];
                      return (
                        <button
                          key={key}
                          onClick={() => toggleMapLayer(key)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded text-[12px] transition-colors ${
                            visible
                              ? 'bg-[#141820] text-[#e7e2d8] hover:bg-[#1a1f29]'
                              : 'bg-transparent text-[#646d7c] hover:bg-[#141820]/60'
                          }`}
                        >
                          {visible ? (
                            <Eye className="w-3.5 h-3.5 text-[#d4a853]" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-[#5b6370]" />
                          )}
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Map Tools Grid */}
                <div className="space-y-2 pt-2 border-t border-[#181d25]">
                  <div className="text-[11.5px] font-semibold text-[#b8b3a8] tracking-wide">
                    Map Tools
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(
                      [
                        { id: 'pin', label: 'Add Location', icon: MapPin },
                        { id: 'path', label: 'Add Path', icon: Route },
                        { id: 'region', label: 'Region', icon: Square },
                        { id: 'note', label: 'Map Note', icon: FilePlus2 },
                        { id: 'link', label: 'Link Entry', icon: Link2 },
                      ] as const
                    ).map((tool) => {
                      const Icon = tool.icon;
                      const isActive = mapToolMode === tool.id;
                      return (
                        <button
                          key={tool.id}
                          onClick={() => {
                            if (tool.id === 'note' || tool.id === 'link') {
                              openNewEntryModal('Location', 'encyclopedia');
                            } else {
                              setMapToolMode(isActive ? 'select' : tool.id);
                            }
                          }}
                          className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-md border text-[10px] leading-tight text-center transition-all ${
                            isActive
                              ? 'bg-[#2a2214] border-[#d4a853] text-[#f7ecc9] shadow-gold-sm'
                              : 'bg-[#12161e] border-[#1d222b] text-[#9aa3b2] hover:border-[#d4a853]/45 hover:text-[#f3ead8]'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 text-[#d4a853]" />
                          <span className="line-clamp-2">{tool.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Linked Entries List */}
                <div className="space-y-2 pt-2 border-t border-[#181d25]">
                  <div className="text-[11.5px] font-semibold text-[#b8b3a8] tracking-wide">
                    Linked Entries ({pinsOnMap.length})
                  </div>
                  <div className="space-y-2">
                    {pinsOnMap.map((pin) => {
                      const ent = entities.find((e) => e.id === pin.entity_id);
                      const isSelected = selectedPinId === pin.id;
                      return (
                        <button
                          key={pin.id}
                          onClick={() => setSelectedPinId(pin.id)}
                          onDoubleClick={() => ent && openEntityTab(ent.id)}
                          className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between gap-2 group ${
                            isSelected
                              ? 'bg-[#1f1a12] border-[#d4a853]/70 shadow-gold-sm'
                              : 'bg-[#12161e] border-[#1d222b] hover:border-[#d4a853]/40 hover:bg-[#161b25]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {ent?.cover_image_url ? (
                              <img
                                src={ent.cover_image_url}
                                alt={ent.title}
                                className="w-9 h-9 rounded object-cover border border-[#2b3342] shrink-0"
                              />
                            ) : (
                              <span className="p-1.5 rounded bg-[#181d27] border border-[#252c38] text-[#d4a853] shrink-0">
                                <EntityIcon
                                  type={ent?.type || pin.icon_type}
                                  className="w-3.5 h-3.5"
                                />
                              </span>
                            )}
                            <div className="min-w-0">
                              <div className="text-[12.5px] font-semibold text-[#f3ead8] truncate group-hover:text-[#f0cf85]">
                                {ent?.title || pin.label}
                              </div>
                              <div className="text-[11px] text-[#858d9b] truncate">
                                {ent?.summary || 'Map marker'}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#5e6675] group-hover:text-[#d4a853] shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Paths & Regions List */}
                {pathsOnMap.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-[#181d25]">
                    <div className="text-[11px] font-semibold text-[#858d9b]">
                      Routes &amp; Regions ({pathsOnMap.length})
                    </div>
                    {pathsOnMap.map((path) => (
                      <div
                        key={path.id}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#12161e] border border-[#1d222b] text-[11px] text-[#c9c3b8]"
                      >
                        <span className="truncate">{path.name}</span>
                        <button
                          onClick={() => deleteMapPath(path.id)}
                          className="text-[#646d7c] hover:text-red-400 ml-2 shrink-0"
                          title="Delete path"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : focusedEntity ? (
              /* Entity Inspector Details */
              <div className="space-y-3.5">
                {focusedEntity.cover_image_url && (
                  <div className="rounded-lg overflow-hidden border border-[#242a35] bg-[#0b0d10]">
                    <img
                      src={focusedEntity.cover_image_url}
                      alt={focusedEntity.title}
                      className="w-full h-40 object-cover"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded bg-[#181d26] border border-[#d4a853]/30 text-[#d4a853]">
                    <EntityIcon type={focusedEntity.type} className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#d4a853]">
                      {focusedEntity.type}
                    </div>
                    <h2 className="font-serif text-[14.5px] font-semibold text-[#f3ead8] truncate">
                      {focusedEntity.title}
                    </h2>
                  </div>
                </div>

                <p className="text-xs text-[#b8b1a3] leading-relaxed">{focusedEntity.summary}</p>

                {getVisibleMetadataEntries(focusedEntity.metadata).length > 0 && (
                  <div className="rounded-md bg-[#12161e] border border-[#1d222b] divide-y divide-[#1a1f28] text-[11.5px]">
                    {getVisibleMetadataEntries(focusedEntity.metadata).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between px-2.5 py-1.5">
                        <span className="text-[#858d9b]">{k}</span>
                        <span className="text-[#e7e2d8] font-medium">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-[#181d25] space-y-2">
                  <div className="text-[11px] font-semibold text-[#b8b3a8]">Map Presence</div>
                  {mapPins.filter((p) => p.entity_id === focusedEntity.id).length === 0 ? (
                    <div className="text-[11px] text-[#646d7c] italic">
                      Not pinned on any world map yet.
                    </div>
                  ) : (
                    mapPins
                      .filter((p) => p.entity_id === focusedEntity.id)
                      .map((pin) => {
                        const m = maps.find((mp) => mp.id === pin.map_id);
                        return (
                          <button
                            key={pin.id}
                            onClick={() => {
                              if (m) {
                                openMapTab(m.id);
                                setSelectedPinId(pin.id);
                              }
                            }}
                            className="w-full flex items-center justify-between px-2.5 py-2 rounded bg-[#12161e] border border-[#1d222b] hover:border-[#d4a853]/50 text-xs text-[#e5be58]"
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <MapPin className="w-3.5 h-3.5" />
                              <span className="truncate">{m?.name || 'World Map'}</span>
                            </span>
                            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        );
                      })
                  )}
                </div>
              </div>
            ) : focusedAsset ? (
              /* Asset Dossier in Inspector */
              <div className="space-y-3.5">
                <div className="rounded-lg overflow-hidden border border-[#242a35] bg-[#090b0f] p-2">
                  <img
                    src={focusedAsset.url}
                    alt={focusedAsset.name}
                    className="w-full h-36 object-contain rounded"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded bg-[#181d26] border border-[#d4a853]/30 text-[#d4a853]">
                    <ImageIcon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#d4a853]">
                      Vault Asset • {focusedAsset.kind}
                    </div>
                    <h2 className="font-serif text-[14.5px] font-semibold text-[#f3ead8] truncate">
                      {focusedAsset.name}
                    </h2>
                  </div>
                </div>

                <div className="surface-card rounded-lg divide-y divide-[#1a1f28] text-[11.5px]">
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[#858d9b]">Reference Slug</span>
                    <code className="font-mono text-[#e5be58] text-[11px]">
                      asset://{focusedAsset.slug}
                    </code>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[#858d9b]">Inline Syntax</span>
                    <code className="font-mono text-[#c9c3b8] text-[11px]">
                      ![[{focusedAsset.slug}]]
                    </code>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#181d25] space-y-2">
                  <div className="text-[11px] font-semibold text-[#b8b3a8]">
                    Entries Referencing Asset
                  </div>
                  {(() => {
                    const refs = entities.filter(
                      (e) =>
                        e.content.includes(`![[${focusedAsset.slug}`) ||
                        e.content.includes(`asset://${focusedAsset.slug}`) ||
                        e.cover_image_url === focusedAsset.url ||
                        String(e.metadata?._bg_image || '') === `asset://${focusedAsset.slug}`
                    );
                    if (refs.length === 0) {
                      return (
                        <div className="text-[11px] text-[#646d7c] italic">
                          Not embedded in any entry yet. Use Attach controls to link it.
                        </div>
                      );
                    }
                    return refs.map((ent) => (
                      <button
                        key={ent.id}
                        onClick={() => openEntityTab(ent.id)}
                        className="w-full flex items-center justify-between px-2.5 py-2 rounded bg-[#12161e] border border-[#1d222b] hover:border-[#d4a853]/50 text-xs text-[#e7e2d8]"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <EntityIcon type={ent.type} className="w-3.5 h-3.5 text-[#d4a853]" />
                          <span className="truncate">{ent.title}</span>
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#646d7c] shrink-0" />
                      </button>
                    ));
                  })()}
                </div>
              </div>
            ) : focusedTemplate ? (
              /* Template Dossier in Inspector */
              <div className="space-y-3.5">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded bg-[#181d26] border border-[#d4a853]/30 text-[#d4a853]">
                    <FileCode2 className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#d4a853]">
                      Record Blueprint
                    </div>
                    <h2 className="font-serif text-[14.5px] font-semibold text-[#f3ead8] truncate">
                      {focusedTemplate.label}
                    </h2>
                  </div>
                </div>

                <div className="surface-card rounded-lg divide-y divide-[#1a1f28] text-[11.5px]">
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[#858d9b]">Target Type</span>
                    <span className="text-[#e5be58] font-medium">{focusedTemplate.type}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[#858d9b]">Default Attributes</span>
                    <span className="font-mono text-[#e7e2d8]">
                      {Object.keys(focusedTemplate.metadata).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[#858d9b]">Vault Records</span>
                    <span className="font-mono text-[#e7e2d8]">
                      {entities.filter((e) => e.type === focusedTemplate.type).length}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => openNewEntryModal(focusedTemplate.type, 'encyclopedia')}
                  className="w-full btn-gold-metallic py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  <span>New {focusedTemplate.type} From Template</span>
                </button>
              </div>
            ) : null}
          </>
        )}

        {inspectorSubTab === 'connections' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#e7e2d8]">
                <Network className="w-3.5 h-3.5 text-[#d4a853]" />
                <span>Knowledge Graph</span>
              </div>
              <span className="text-[10.5px] font-mono text-[#7c8594]">Interactive 2D</span>
            </div>
            <ConnectionsGraph focusEntityId={focusedEntityId} />
            <div className="text-[11px] text-[#858d9b] leading-relaxed">
              Edges are derived live from <code className="text-[#d4a853]">[[WikiLinks]]</code>{' '}
              across your vault notes. Drag to pan, scroll to zoom, or click any node to open its
              grimoire entry.
            </div>
          </div>
        )}

        {inspectorSubTab === 'references' && (
          <div className="space-y-4">
            {!focusedEntity ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#d4a853]">
                  World Backlinks Overview
                </div>
                <p className="text-xs text-[#858d9b]">
                  Select a pinned location on the map or open an entity tab to inspect its
                  bidirectional backlinks.
                </p>
                <div className="space-y-1.5 pt-2">
                  {pinsOnMap.map((pin) => {
                    const ent = entities.find((e) => e.id === pin.entity_id);
                    if (!ent) return null;
                    const refsCount = entityLinks.filter((l) => l.target_id === ent.id).length;
                    return (
                      <button
                        key={pin.id}
                        onClick={() => openEntityTab(ent.id)}
                        className="w-full flex items-center justify-between px-2.5 py-2 rounded bg-[#12161e] border border-[#1d222b] hover:border-[#d4a853]/40 text-xs"
                      >
                        <span className="text-[#e7e2d8] font-medium truncate">{ent.title}</span>
                        <span className="font-mono text-[11px] text-[#d4a853]">
                          {refsCount} backlinks
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#d4a853] mb-2">
                    Incoming Backlinks ({incomingLinks.length})
                  </div>
                  {incomingLinks.length === 0 ? (
                    <div className="text-xs text-[#646d7c] italic">
                      No other notes reference {focusedEntity.title} yet.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {incomingLinks.map((src) => (
                        <button
                          key={src.id}
                          onClick={() => openEntityTab(src.id)}
                          className="w-full text-left p-2.5 rounded-lg bg-[#12161e] border border-[#1d222b] hover:border-[#d4a853]/45 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-[#f3ead8] truncate">
                              <EntityIcon type={src.type} className="w-3.5 h-3.5 text-[#d4a853]" />
                              {src.title}
                            </span>
                            <span className="text-[10px] font-mono text-[#7c8594]">{src.type}</span>
                          </div>
                          <p className="text-[11px] text-[#858d9b] line-clamp-2">{src.summary}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-[#181d25]">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#858d9b] mb-2">
                    Outgoing Links ({outgoingLinks.length})
                  </div>
                  {outgoingLinks.length === 0 ? (
                    <div className="text-xs text-[#646d7c] italic">No outgoing WikiLinks.</div>
                  ) : (
                    <div className="space-y-1">
                      {outgoingLinks.map((tgt) => (
                        <button
                          key={tgt.id}
                          onClick={() => openEntityTab(tgt.id)}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-[#12161e] border border-[#1d222b] hover:border-[#d4a853]/40 text-xs text-[#dcd7cc]"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <EntityIcon type={tgt.type} className="w-3 h-3 text-[#d4a853]" />
                            <span className="truncate">{tgt.title}</span>
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-[#646d7c]" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
