import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Castle,
  ChevronRight,
  Compass,
  Eye,
  EyeOff,
  FileCode2,
  FilePlus2,
  Globe,
  Image as ImageIcon,
  Layers,
  Link2,
  Magnet,
  MapPin,
  Maximize2,
  Minimize2,
  Network,
  PanelRightClose,
  Pentagon,
  Plus,
  RotateCcw,
  RotateCw,
  Route,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  LABEL_COLOR_PALETTE,
  LAYER_CATEGORY_META,
  ZONE_COLOR_PALETTE,
  createDefaultWorldLayers,
} from '../../lib/worldLayers';
import { getVisibleMetadataEntries } from '../../lib/wikilinks';
import { useVaultStore } from '../../store/useVaultStore';
import {
  EntityType,
  MapLabelStyle,
  WorldLayerCategory,
  ZoneBorderStyle,
} from '../../types/vault';
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
    isEffectiveGm,
    mapLayers,
    toggleMapLayer,
    mapCameraView,
    triggerCameraReset,
    triggerTopView,
    setMapToolMode,
    mapToolMode,
    selectedPinId,
    setSelectedPinId,
    selectedZoneId,
    setSelectedZoneId,
    selectedLabelId,
    setSelectedLabelId,
    selectedPropId,
    setSelectedPropId,
    addWorldLayer,
    updateWorldLayer,
    deleteWorldLayer,
    toggleWorldLayer,
    soloWorldLayer,
    updateMapZone,
    deleteMapZone,
    dispatchZoneTransform,
    updateMapLabel,
    deleteMapLabel,
    updateMapProp,
    deleteMapProp,
    openEntityTab,
    openMapTab,
    openNewEntryModal,
    deleteMapPath,
    worldsmithMode,
    setWorldsmithMode,
    setRightInspectorCollapsed,
    user,
    campaignMembers,
    mapFogShares,
    upsertMapFogShare,
    revokeMapFogShare,
  } = useVaultStore();

  const canGmEdit = isEffectiveGm();
  const [mapInspectorTab, setMapInspectorTab] = useState<'layers' | 'elements'>('layers');
  const [newLayerOpen, setNewLayerOpen] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerCat, setNewLayerCat] = useState<WorldLayerCategory>('custom');
  const [newLayerColor, setNewLayerColor] = useState(LAYER_CATEGORY_META.custom.defaultColor);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isMapFocused = activeTab?.kind === 'map';
  const isAssetFocused = activeTab?.kind === 'asset';
  const isTemplateFocused = activeTab?.kind === 'template';

  const activeMap = isMapFocused
    ? maps.find((m) => m.id === activeTab.targetId) || maps[0]
    : maps[0];

  const worldLayers = useMemo(
    () =>
      activeMap?.layers && activeMap.layers.length > 0
        ? activeMap.layers
        : createDefaultWorldLayers(),
    [activeMap?.layers]
  );

  const zonesOnMap = activeMap
    ? (activeMap.zones || []).filter((z) => canGmEdit || !z.is_gm_only)
    : [];
  const labelsOnMap = activeMap
    ? (activeMap.labels || []).filter((l) => canGmEdit || !l.is_gm_only)
    : [];
  const heroPropsOnMap = activeMap
    ? (activeMap.props || []).filter(
        (p) =>
          p.kind !== 'pine' &&
          p.kind !== 'oak' &&
          p.kind !== 'deadwood' &&
          p.kind !== 'boulder'
      )
    : [];

  const selectedZone = selectedZoneId
    ? (activeMap?.zones || []).find((z) => z.id === selectedZoneId && (canGmEdit || !z.is_gm_only)) || null
    : null;
  const selectedLabel = selectedLabelId
    ? (activeMap?.labels || []).find((l) => l.id === selectedLabelId && (canGmEdit || !l.is_gm_only)) || null
    : null;
  const selectedProp = selectedPropId
    ? (activeMap?.props || []).find((p) => p.id === selectedPropId) || null
    : null;

  const focusedPin = selectedPinId
    ? mapPins.find((p) => p.id === selectedPinId && (canGmEdit || !p.is_gm_only))
    : null;
  const focusedEntityId = isMapFocused
    ? focusedPin?.entity_id || selectedZone?.entityId || null
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
    ? mapPins.filter((p) => p.map_id === activeMap.id && (canGmEdit || !p.is_gm_only))
    : [];

  const pathsOnMap = activeMap
    ? mapPaths.filter((p) => p.map_id === activeMap.id && (canGmEdit || !p.is_gm_only))
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
        .map((e) => entities.find((ent) => ent.id === e.target_id))
        .filter((e): e is NonNullable<typeof e> => Boolean(e))
    : [];

  return (
    <aside className="h-full bg-[#07090d] border-l border-[#12161f] flex flex-col select-none overflow-hidden">
      {/* Top Sub-Tabs: Details | Connections | References + Collapse */}
      <div className="h-[38px] px-2 border-b border-[#12161f] flex items-center justify-between bg-[#050608] shrink-0">
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
                  active ? 'text-[#d6b16a]' : 'text-[#757e8d] hover:text-[#ded8cc]'
                }`}
              >
                <span>{tab.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-1 right-1 h-[2px] bg-[#b68d40] rounded-t" />
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setRightInspectorCollapsed(true)}
          title="Collapse Inspector Drawer"
          aria-label="Collapse Inspector Drawer"
          className="p-1.5 rounded text-[#6d7686] hover:text-[#d6b16a] hover:bg-[#0e1218] transition-colors shrink-0"
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
            ) : isMapFocused && activeMap && worldsmithMode && canGmEdit ? (
              <WorldsmithInspectorSection activeMap={activeMap} />
            ) : isMapFocused && activeMap ? (
              <>
                {/* Compact Map Header & Camera View Switcher */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="p-1.5 rounded bg-[#0c0f15] border border-[#b68d40]/30 text-[#c9a050] shrink-0">
                        <EntityIcon type="Map" className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-serif text-[13.5px] font-semibold text-[#e8dfd0] truncate">
                          {activeMap.name}
                        </h2>
                        <div className="text-[10px] font-mono text-[#6d7686]">
                          {activeMap.scale_config?.ratio || '1 : 250 000'} · {activeMap.width || 8192}×{activeMap.height || 8192}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick 3D vs Whole World Top View Toggle */}
                  <div className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-[#040507] border border-[#12161f]">
                    <button
                      onClick={() => triggerCameraReset()}
                      className={`py-1 rounded text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
                        mapCameraView === 'perspective'
                          ? 'bg-[#10141c] text-[#d6b16a] border border-[#b68d40]/45'
                          : 'text-[#7e8796] hover:text-white'
                      }`}
                    >
                      <Compass className="w-3 h-3" />
                      <span>3D Camera</span>
                    </button>
                    <button
                      onClick={() => triggerTopView()}
                      className={`py-1 rounded text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
                        mapCameraView === 'top'
                          ? 'btn-gold-metallic font-semibold'
                          : 'text-[#7e8796] hover:text-white'
                      }`}
                    >
                      <Globe className="w-3 h-3" />
                      <span>Whole World</span>
                    </button>
                  </div>
                </div>

                {/* Contextual Selected Zone Editor */}
                {selectedZone && (
                  <div className="rounded-lg bg-[#090b0f] border border-[#b68d40]/40 p-2.5 space-y-2.5 text-[11.5px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-mono uppercase tracking-wider text-[#c9a050] flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: selectedZone.color }}
                        />
                        Selected Zone
                        <span className="text-[9.5px] text-[#7a8290] normal-case">
                          ({selectedZone.points.length} pts)
                        </span>
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteMapZone(activeMap.id, selectedZone.id)}
                          className="p-1 rounded hover:bg-red-950/50 text-red-400"
                          title="Delete Zone"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setSelectedZoneId(null)}
                          className="p-1 rounded hover:bg-[#141821] text-[#7a8290]"
                          title="Close"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="rounded bg-[#040507] border border-[#181d26] px-2 py-1.5 text-[10px] leading-relaxed text-[#9aa3b2]">
                      Drag gizmo center or X/Z arrows to move • Drag corner points • Click green edge dots to add / Shift+click to remove. Points stick to land & sea.
                    </div>

                    <input
                      type="text"
                      value={selectedZone.name}
                      onChange={(e) =>
                        updateMapZone(activeMap.id, selectedZone.id, { name: e.target.value })
                      }
                      className="w-full bg-[#040507] border border-[#141821] rounded px-2 py-1 text-xs text-[#e8dfd0] focus:outline-none focus:border-[#b68d40]"
                    />

                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-[#7a8290]">World Layer</span>
                        <select
                          value={selectedZone.layerId}
                          onChange={(e) =>
                            updateMapZone(activeMap.id, selectedZone.id, {
                              layerId: e.target.value,
                            })
                          }
                          className="w-full bg-[#040507] border border-[#141821] rounded px-1.5 py-1 text-[11px] text-[#ded8cc]"
                        >
                          {worldLayers.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-[#7a8290]">Border Style</span>
                        <select
                          value={selectedZone.borderStyle}
                          onChange={(e) =>
                            updateMapZone(activeMap.id, selectedZone.id, {
                              borderStyle: e.target.value as ZoneBorderStyle,
                            })
                          }
                          className="w-full bg-[#040507] border border-[#141821] rounded px-1.5 py-1 text-[11px] text-[#ded8cc]"
                        >
                          <option value="solid">Solid</option>
                          <option value="dashed">Dashed</option>
                          <option value="double">Imperial Double</option>
                          <option value="none">Fill Only</option>
                        </select>
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {ZONE_COLOR_PALETTE.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() =>
                            updateMapZone(activeMap.id, selectedZone.id, { color: col })
                          }
                          className={`w-4 h-4 rounded-full border ${
                            selectedZone.color === col ? 'border-white scale-110' : 'border-white/20'
                          }`}
                          style={{ backgroundColor: col }}
                        />
                      ))}
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10.5px] text-[#8891a0]">
                        <span>Fill Opacity</span>
                        <span className="font-mono">
                          {Math.round((selectedZone.fillOpacity ?? 0.34) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.05}
                        max={0.75}
                        step={0.03}
                        value={selectedZone.fillOpacity ?? 0.34}
                        onChange={(e) =>
                          updateMapZone(activeMap.id, selectedZone.id, {
                            fillOpacity: Number(e.target.value),
                          })
                        }
                        className="w-full accent-[#b68d40]"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10.5px] text-[#8891a0]">
                        <span>Border Width</span>
                        <span className="font-mono">
                          {(selectedZone.borderWidth ?? 2.6).toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.8}
                        max={5.0}
                        step={0.2}
                        value={selectedZone.borderWidth ?? 2.6}
                        onChange={(e) =>
                          updateMapZone(activeMap.id, selectedZone.id, {
                            borderWidth: Number(e.target.value),
                          })
                        }
                        className="w-full accent-[#b68d40]"
                      />
                    </div>

                    {/* Geometry Transform Bar (Rotates, Scales & Snaps Polygon to Land/Sea) */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-[#7a8290]">Shape & Surface Fit</span>
                      <div className="grid grid-cols-5 gap-1">
                        <button
                          type="button"
                          onClick={() => dispatchZoneTransform('rotate', -15)}
                          className="flex items-center justify-center gap-0.5 py-1 rounded bg-[#040507] border border-[#141821] hover:border-[#b68d40]/60 text-[10px] text-[#ded8cc]"
                          title="Rotate -15°"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>15°</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => dispatchZoneTransform('rotate', 15)}
                          className="flex items-center justify-center gap-0.5 py-1 rounded bg-[#040507] border border-[#141821] hover:border-[#b68d40]/60 text-[10px] text-[#ded8cc]"
                          title="Rotate +15°"
                        >
                          <RotateCw className="w-3 h-3" />
                          <span>15°</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => dispatchZoneTransform('scale', 0.9)}
                          className="flex items-center justify-center gap-0.5 py-1 rounded bg-[#040507] border border-[#141821] hover:border-[#b68d40]/60 text-[10px] text-[#ded8cc]"
                          title="Shrink 10%"
                        >
                          <Minimize2 className="w-3 h-3" />
                          <span>-10%</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => dispatchZoneTransform('scale', 1.1)}
                          className="flex items-center justify-center gap-0.5 py-1 rounded bg-[#040507] border border-[#141821] hover:border-[#b68d40]/60 text-[10px] text-[#ded8cc]"
                          title="Expand 10%"
                        >
                          <Maximize2 className="w-3 h-3" />
                          <span>+10%</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => dispatchZoneTransform('snap')}
                          className="flex items-center justify-center gap-0.5 py-1 rounded bg-[#040507] border border-[#141821] hover:border-[#b68d40]/60 text-[10px] text-[#c9a050]"
                          title="Snap all boundary points to land/sea surface"
                        >
                          <Magnet className="w-3 h-3" />
                          <span>Snap</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-[#cfc8ba] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedZone.showLabel}
                          onChange={(e) =>
                            updateMapZone(activeMap.id, selectedZone.id, {
                              showLabel: e.target.checked,
                            })
                          }
                          className="accent-[#b68d40]"
                        />
                        <span>Show Label</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px] text-red-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedZone.is_gm_only}
                          onChange={(e) =>
                            updateMapZone(activeMap.id, selectedZone.id, {
                              is_gm_only: e.target.checked,
                            })
                          }
                          className="accent-red-500"
                        />
                        <span>GM Only</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <select
                        value={selectedZone.entityId || ''}
                        onChange={(e) =>
                          updateMapZone(activeMap.id, selectedZone.id, {
                            entityId: e.target.value || null,
                          })
                        }
                        className="flex-1 bg-[#040507] border border-[#141821] rounded px-1.5 py-1 text-[11px] text-[#d5cfc4]"
                      >
                        <option value="">No linked Vault note</option>
                        {entities.map((ent) => (
                          <option key={ent.id} value={ent.id}>
                            [{ent.type}] {ent.title}
                          </option>
                        ))}
                      </select>
                      {selectedZone.entityId && (
                        <button
                          onClick={() => openEntityTab(selectedZone.entityId!)}
                          className="p-1.5 rounded bg-[#141821] hover:bg-[#1e2430] text-[#c9a050]"
                          title="Open linked entry"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Contextual Selected Text Label Editor */}
                {selectedLabel && (
                  <div className="rounded-lg bg-[#090b0f] border border-[#b68d40]/40 p-2.5 space-y-2.5 text-[11.5px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-mono uppercase tracking-wider text-[#c9a050] flex items-center gap-1.5">
                        <Type className="w-3.5 h-3.5" />
                        Selected Text Label
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteMapLabel(activeMap.id, selectedLabel.id)}
                          className="p-1 rounded hover:bg-red-950/50 text-red-400"
                          title="Delete Label"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setSelectedLabelId(null)}
                          className="p-1 rounded hover:bg-[#141821] text-[#7a8290]"
                          title="Close"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={selectedLabel.text}
                      onChange={(e) =>
                        updateMapLabel(activeMap.id, selectedLabel.id, { text: e.target.value })
                      }
                      className="w-full bg-[#040507] border border-[#141821] rounded px-2 py-1 text-xs text-[#e8dfd0] focus:outline-none focus:border-[#b68d40]"
                    />

                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-[#7a8290]">Style</span>
                        <select
                          value={selectedLabel.style}
                          onChange={(e) =>
                            updateMapLabel(activeMap.id, selectedLabel.id, {
                              style: e.target.value as MapLabelStyle,
                            })
                          }
                          className="w-full bg-[#040507] border border-[#141821] rounded px-1.5 py-1 text-[11px] text-[#ded8cc]"
                        >
                          <option value="title">World Title</option>
                          <option value="region">Region / Country</option>
                          <option value="sea">Sea / Ocean</option>
                          <option value="callout">Callout Pill</option>
                          <option value="note">Small Note</option>
                        </select>
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-[#7a8290]">Layer Visibility</span>
                        <select
                          value={selectedLabel.layerId || ''}
                          onChange={(e) =>
                            updateMapLabel(activeMap.id, selectedLabel.id, {
                              layerId: e.target.value || null,
                            })
                          }
                          className="w-full bg-[#040507] border border-[#141821] rounded px-1.5 py-1 text-[11px] text-[#ded8cc]"
                        >
                          <option value="">Global (Always On)</option>
                          {worldLayers.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {LABEL_COLOR_PALETTE.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() =>
                            updateMapLabel(activeMap.id, selectedLabel.id, { color: col })
                          }
                          className={`w-4 h-4 rounded-full border ${
                            selectedLabel.color === col ? 'border-white scale-110' : 'border-white/20'
                          }`}
                          style={{ backgroundColor: col }}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10.5px] text-[#8891a0]">
                      <label className="space-y-0.5">
                        <div className="flex justify-between">
                          <span>Size</span>
                          <span className="font-mono">{selectedLabel.fontSize.toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min={0.7}
                          max={4.5}
                          step={0.1}
                          value={selectedLabel.fontSize}
                          onChange={(e) =>
                            updateMapLabel(activeMap.id, selectedLabel.id, {
                              fontSize: Number(e.target.value),
                            })
                          }
                          className="w-full accent-[#b68d40]"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <div className="flex justify-between">
                          <span>Rotation</span>
                          <span className="font-mono">
                            {Math.round(((selectedLabel.rotationY || 0) * 180) / Math.PI)}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-3.14}
                          max={3.14}
                          step={0.05}
                          value={selectedLabel.rotationY || 0}
                          onChange={(e) =>
                            updateMapLabel(activeMap.id, selectedLabel.id, {
                              rotationY: Number(e.target.value),
                            })
                          }
                          className="w-full accent-[#b68d40]"
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-between text-[10.5px] text-[#8891a0]">
                      <span>Tip: Drag label on map to reposition</span>
                      <label className="flex items-center gap-1 text-red-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedLabel.is_gm_only}
                          onChange={(e) =>
                            updateMapLabel(activeMap.id, selectedLabel.id, {
                              is_gm_only: e.target.checked,
                            })
                          }
                          className="accent-red-500"
                        />
                        <span>GM Only</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Contextual Selected 3D Element Editor */}
                {canGmEdit && selectedProp && (
                  <div className="rounded-lg bg-[#090b0f] border border-[#b68d40]/40 p-2.5 space-y-2 text-[11.5px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-mono uppercase tracking-wider text-[#c9a050] flex items-center gap-1.5">
                        <Castle className="w-3.5 h-3.5" />
                        Element: {selectedProp.kind}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteMapProp(activeMap.id, selectedProp.id)}
                          className="p-1 rounded hover:bg-red-950/50 text-red-400"
                          title="Delete Element"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setSelectedPropId(null)}
                          className="p-1 rounded hover:bg-[#141821] text-[#7a8290]"
                          title="Close"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={selectedProp.name || ''}
                      placeholder={`Optional name (e.g. ${selectedProp.kind})`}
                      onChange={(e) =>
                        updateMapProp(activeMap.id, selectedProp.id, { name: e.target.value })
                      }
                      className="w-full bg-[#040507] border border-[#141821] rounded px-2 py-1 text-xs text-[#e8dfd0] focus:outline-none focus:border-[#b68d40]"
                    />

                    <div className="grid grid-cols-2 gap-2 text-[10.5px] text-[#8891a0]">
                      <label className="space-y-0.5">
                        <div className="flex justify-between">
                          <span>Rotation</span>
                          <span className="font-mono">
                            {Math.round((selectedProp.rotY * 180) / Math.PI)}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={6.28}
                          step={0.1}
                          value={selectedProp.rotY}
                          onChange={(e) =>
                            updateMapProp(activeMap.id, selectedProp.id, {
                              rotY: Number(e.target.value),
                            })
                          }
                          className="w-full accent-[#b68d40]"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <div className="flex justify-between">
                          <span>Scale</span>
                          <span className="font-mono">{selectedProp.scale.toFixed(1)}×</span>
                        </div>
                        <input
                          type="range"
                          min={0.4}
                          max={3}
                          step={0.05}
                          value={selectedProp.scale}
                          onChange={(e) =>
                            updateMapProp(activeMap.id, selectedProp.id, {
                              scale: Number(e.target.value),
                            })
                          }
                          className="w-full accent-[#b68d40]"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* Segmented Map Inspector Tabs: Layers vs Tools & Items */}
                <div className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-[#040507] border border-[#12161f]">
                  <button
                    onClick={() => setMapInspectorTab('layers')}
                    className={`py-1 rounded text-[11px] font-medium transition-colors ${
                      mapInspectorTab === 'layers'
                        ? 'bg-[#10141c] text-[#d6b16a] border border-[#b68d40]/35'
                        : 'text-[#757e8d] hover:text-[#ded8cc]'
                    }`}
                  >
                    Layers ({worldLayers.length})
                  </button>
                  <button
                    onClick={() => setMapInspectorTab('elements')}
                    className={`py-1 rounded text-[11px] font-medium transition-colors ${
                      mapInspectorTab === 'elements'
                        ? 'bg-[#10141c] text-[#d6b16a] border border-[#b68d40]/35'
                        : 'text-[#757e8d] hover:text-[#ded8cc]'
                    }`}
                  >
                    Tools &amp; Items ({zonesOnMap.length + labelsOnMap.length + pinsOnMap.length})
                  </button>
                </div>

                {mapInspectorTab === 'layers' ? (
                  <>
                {/* World Overlay Layers (Countries, Regions, Religions, Custom) */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[#c9a050] tracking-wide flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      World Layers ({worldLayers.length})
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => soloWorldLayer(activeMap.id, null)}
                        className="text-[10.5px] text-[#7e8796] hover:text-[#d6b16a]"
                      >
                        All On
                      </button>
                      {canGmEdit && (
                        <button
                          onClick={() => setNewLayerOpen((v) => !v)}
                          className="text-[10.5px] text-[#c9a050] hover:underline flex items-center gap-0.5"
                        >
                          <Plus className="w-3 h-3" />
                          Layer
                        </button>
                      )}
                    </div>
                  </div>

                  {canGmEdit && newLayerOpen && (
                    <div className="p-2 rounded-md bg-[#090b0f] border border-[#b68d40]/35 space-y-2 text-[11px]">
                      <input
                        type="text"
                        value={newLayerName}
                        onChange={(e) => setNewLayerName(e.target.value)}
                        placeholder="Layer name (e.g. Trade Guilds)"
                        className="w-full bg-[#040507] border border-[#171c25] rounded px-2 py-1 text-xs text-[#e8dfd0] focus:outline-none focus:border-[#b68d40]"
                      />
                      <select
                        value={newLayerCat}
                        onChange={(e) => {
                          const cat = e.target.value as WorldLayerCategory;
                          setNewLayerCat(cat);
                          setNewLayerColor(LAYER_CATEGORY_META[cat].defaultColor);
                        }}
                        className="w-full bg-[#040507] border border-[#171c25] rounded px-2 py-1 text-xs text-[#ccc6ba]"
                      >
                        {(Object.keys(LAYER_CATEGORY_META) as WorldLayerCategory[]).map((cat) => (
                          <option key={cat} value={cat}>
                            {LAYER_CATEGORY_META[cat].label}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          {ZONE_COLOR_PALETTE.slice(0, 6).map((col) => (
                            <button
                              key={col}
                              type="button"
                              onClick={() => setNewLayerColor(col)}
                              className={`w-4 h-4 rounded-full border ${
                                newLayerColor === col ? 'border-white scale-110' : 'border-white/20'
                              }`}
                              style={{ backgroundColor: col }}
                            />
                          ))}
                        </div>
                        <button
                          onClick={() => {
                            if (!newLayerName.trim()) return;
                            addWorldLayer(activeMap.id, {
                              name: newLayerName,
                              category: newLayerCat,
                              color: newLayerColor,
                            });
                            setNewLayerName('');
                            setNewLayerOpen(false);
                          }}
                          className="px-2.5 py-1 rounded btn-gold-metallic text-[11px] font-semibold"
                        >
                          Create
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    {worldLayers.map((layer) => {
                      const zoneCount = (activeMap.zones || []).filter(
                        (z) => z.layerId === layer.id
                      ).length;
                      return (
                        <div
                          key={layer.id}
                          className={`p-1.5 rounded border transition-colors ${
                            layer.visible
                              ? 'bg-[#0a0d12] border-[#161b25]'
                              : 'bg-transparent border-[#10141c] opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <button
                              onClick={() => toggleWorldLayer(activeMap.id, layer.id)}
                              className="flex items-center gap-2 min-w-0 flex-1 text-left"
                            >
                              {layer.visible ? (
                                <Eye className="w-3.5 h-3.5 text-[#b68d40] shrink-0" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5 text-[#525a68] shrink-0" />
                              )}
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/25"
                                style={{ backgroundColor: layer.color }}
                              />
                              <span className="text-[11.5px] text-[#ded8cc] truncate">
                                {layer.name}
                              </span>
                            </button>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="font-mono text-[10px] text-[#6d7686]">
                                {zoneCount}
                              </span>
                              <button
                                onClick={() => soloWorldLayer(activeMap.id, layer.id)}
                                className="px-1.5 py-0.5 rounded bg-[#10141c] hover:bg-[#b68d40]/20 text-[9.5px] text-[#848d9c] hover:text-[#d6b16a]"
                                title="Solo this layer"
                              >
                                Solo
                              </button>
                              {canGmEdit && worldLayers.length > 1 && (
                                <button
                                  onClick={() => deleteWorldLayer(activeMap.id, layer.id)}
                                  className="p-0.5 text-[#555d6c] hover:text-red-400"
                                  title="Delete layer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          {layer.visible && canGmEdit && (
                            <div className="mt-1 flex items-center gap-2 pl-6 pr-1">
                              <span className="text-[9.5px] text-[#6d7686]">Opacity</span>
                              <input
                                type="range"
                                min={0.08}
                                max={0.75}
                                step={0.03}
                                value={layer.opacity}
                                onChange={(e) =>
                                  updateWorldLayer(activeMap.id, layer.id, {
                                    opacity: Number(e.target.value),
                                  })
                                }
                                className="flex-1 accent-[#b68d40] h-1"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Base Map Layers (7) */}
                <div className="space-y-1.5 pt-2 border-t border-[#12161f]">
                  <div className="text-[11px] font-semibold text-[#a8a196] tracking-wide">
                    Base Layers (7)
                  </div>
                  <div className="space-y-0.5">
                    {(
                      [
                        ['terrain', 'Terrain (Elevation)'],
                        ['vegetation', 'Biome, Flora & Elements'],
                        ['rivers', 'Rivers & Streams'],
                        ['locations', 'Locations & Pins'],
                        ['paths', 'Paths / Trails'],
                        ['regions', 'All Overlay Zones'],
                        ['labels', 'Map Text Labels'],
                        ['questBoards', 'Guild Quest Boards'],
                        ['fogOfWar', 'Fog of War Shroud'],
                      ] as Array<[keyof typeof mapLayers, string]>
                    ).map(([key, label]) => {
                      const visible = mapLayers[key];
                      return (
                        <button
                          key={key}
                          onClick={() => toggleMapLayer(key)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-1 rounded text-[11.5px] transition-colors ${
                            visible
                              ? 'bg-[#0a0d12] text-[#ded8cc] hover:bg-[#10141c]'
                              : 'bg-transparent text-[#5c6574] hover:bg-[#0a0d12]/60'
                          }`}
                        >
                          {visible ? (
                            <Eye className="w-3.5 h-3.5 text-[#b68d40]" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-[#525a68]" />
                          )}
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                  </>
                ) : (
                  <>
                {/* Map Tools Grid */}
                {canGmEdit && (
                <div className="space-y-2 pt-1">
                  <div className="text-[11px] font-semibold text-[#a8a196] tracking-wide">
                    Map Tools
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'pin', label: 'Add Pin', icon: MapPin },
                        { id: 'text', label: 'Add Text', icon: Type },
                        { id: 'zone', label: 'Add Zone', icon: Pentagon },
                        { id: 'element', label: '3D Element', icon: Castle },
                        { id: 'path', label: 'Add Route', icon: Route },
                        { id: 'link', label: 'Link Entry', icon: Link2 },
                      ] as const
                    ).map((tool) => {
                      const Icon = tool.icon;
                      const isActive =
                        mapToolMode === tool.id ||
                        (tool.id === 'zone' && mapToolMode === 'region');
                      return (
                        <button
                          key={tool.id}
                          onClick={() => {
                            if (tool.id === 'link') {
                              openNewEntryModal('Location', 'encyclopedia');
                            } else {
                              setMapToolMode(isActive ? 'select' : tool.id);
                            }
                          }}
                          className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-md border text-[10px] leading-tight text-center transition-all ${
                            isActive
                              ? 'bg-[#141008] border-[#b68d40] text-[#d6b16a] shadow-gold-sm'
                              : 'bg-[#090b0f] border-[#141821] text-[#848d9c] hover:border-[#b68d40]/45 hover:text-[#e8dfd0]'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 text-[#b68d40]" />
                          <span>{tool.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                )}

                {/* Zones / Territories List */}
                <div className="space-y-1.5 pt-2 border-t border-[#12161f]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] font-semibold text-[#a8a196]">
                      Zones &amp; Realms ({zonesOnMap.length})
                    </span>
                    {canGmEdit && (
                      <button
                        onClick={() => {
                          setWorldsmithMode(false);
                          setMapToolMode('zone');
                        }}
                        className="text-[10.5px] text-[#c9a050] hover:underline"
                      >
                        + Draw Zone
                      </button>
                    )}
                  </div>
                  {zonesOnMap.length === 0 ? (
                    <div className="text-[11px] text-[#5c6574] italic">
                      No countries, regions or faiths drawn yet.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {zonesOnMap.map((zone) => {
                        const layer = worldLayers.find((l) => l.id === zone.layerId);
                        const active = selectedZoneId === zone.id;
                        return (
                          <div
                            key={zone.id}
                            className={`flex items-center justify-between px-2 py-1.5 rounded border text-[11px] ${
                              active
                                ? 'bg-[#141008] border-[#b68d40]/60 text-[#e6d7b4]'
                                : 'bg-[#090b0f] border-[#141821] text-[#bdb7ac] hover:border-[#222835]'
                            }`}
                          >
                            <button
                              onClick={() => {
                                setWorldsmithMode(false);
                                setMapToolMode('select');
                                setSelectedZoneId(zone.id);
                              }}
                              className="flex items-center gap-2 min-w-0 flex-1 text-left"
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: zone.color }}
                              />
                              <span className="truncate font-medium">{zone.name}</span>
                              {layer && (
                                <span className="text-[9.5px] text-[#6d7686] truncate">
                                  ({layer.name.split(' ')[0]})
                                </span>
                              )}
                            </button>
                            {canGmEdit && (
                              <button
                                onClick={() => deleteMapZone(activeMap.id, zone.id)}
                                className="text-[#5c6574] hover:text-red-400 ml-1.5 shrink-0"
                                title="Delete Zone"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Text Labels List */}
                <div className="space-y-1.5 pt-2 border-t border-[#12161f]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] font-semibold text-[#a8a196]">
                      Text Labels ({labelsOnMap.length})
                    </span>
                    {canGmEdit && (
                      <button
                        onClick={() => setMapToolMode('text')}
                        className="text-[10.5px] text-[#c9a050] hover:underline"
                      >
                        + Add Text
                      </button>
                    )}
                  </div>
                  {labelsOnMap.length > 0 && (
                    <div className="space-y-1">
                      {labelsOnMap.map((lbl) => (
                        <div
                          key={lbl.id}
                          className={`flex items-center justify-between px-2 py-1.5 rounded border text-[11px] ${
                            selectedLabelId === lbl.id
                              ? 'bg-[#141008] border-[#b68d40]/60 text-[#e6d7b4]'
                              : 'bg-[#090b0f] border-[#141821] text-[#bdb7ac] hover:border-[#222835]'
                          }`}
                        >
                          <button
                            onClick={() => setSelectedLabelId(lbl.id)}
                            className="flex items-center gap-2 min-w-0 flex-1 text-left"
                          >
                            <Type className="w-3 h-3 text-[#b68d40] shrink-0" />
                            <span className="truncate">{lbl.text}</span>
                            <span className="text-[9.5px] font-mono text-[#6d7686] uppercase">
                              {lbl.style}
                            </span>
                          </button>
                          {canGmEdit && (
                            <button
                              onClick={() => deleteMapLabel(activeMap.id, lbl.id)}
                              className="text-[#5c6574] hover:text-red-400 ml-1.5 shrink-0"
                              title="Delete Label"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Placed 3D Elements List */}
                {heroPropsOnMap.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-[#12161f]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] font-semibold text-[#a8a196]">
                        3D Elements ({heroPropsOnMap.length})
                      </span>
                      {canGmEdit && (
                        <button
                          onClick={() => setMapToolMode('element')}
                          className="text-[10.5px] text-[#c9a050] hover:underline"
                        >
                          + Place
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {heroPropsOnMap.map((prop) => (
                        <div
                          key={prop.id}
                          className={`flex items-center justify-between px-2 py-1.5 rounded border text-[11px] ${
                            selectedPropId === prop.id
                              ? 'bg-[#141008] border-[#b68d40]/60 text-[#e6d7b4]'
                              : 'bg-[#090b0f] border-[#141821] text-[#bdb7ac] hover:border-[#222835]'
                          }`}
                        >
                          <button
                            onClick={() => setSelectedPropId(prop.id)}
                            className="flex items-center gap-2 min-w-0 flex-1 text-left"
                          >
                            <Castle className="w-3 h-3 text-[#b68d40] shrink-0" />
                            <span className="truncate capitalize">
                              {prop.name || prop.kind}
                            </span>
                          </button>
                          {canGmEdit && (
                            <button
                              onClick={() => deleteMapProp(activeMap.id, prop.id)}
                              className="text-[#5c6574] hover:text-red-400 ml-1.5 shrink-0"
                              title="Delete Element"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Linked Entries List */}
                <div className="space-y-2 pt-2 border-t border-[#12161f]">
                  <div className="text-[11.5px] font-semibold text-[#a8a196] tracking-wide">
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
                              ? 'bg-[#141008] border-[#b68d40]/60 shadow-gold-sm'
                              : 'bg-[#090b0f] border-[#141821] hover:border-[#b68d40]/40 hover:bg-[#0e1218]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {ent?.cover_image_url ? (
                              <img
                                src={ent.cover_image_url}
                                alt={ent.title}
                                className="w-9 h-9 rounded object-cover border border-[#1d2330] shrink-0"
                              />
                            ) : (
                              <span className="p-1.5 rounded bg-[#0c0f15] border border-[#181d27] text-[#b68d40] shrink-0">
                                <EntityIcon
                                  type={ent?.type || pin.icon_type}
                                  className="w-3.5 h-3.5"
                                />
                              </span>
                            )}
                            <div className="min-w-0">
                              <div className="text-[12.5px] font-semibold text-[#e8dfd0] truncate group-hover:text-[#d6b16a]">
                                {ent?.title || pin.label}
                              </div>
                              <div className="text-[11px] text-[#757e8d] truncate">
                                {ent?.summary || 'Map marker'}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#565f6e] group-hover:text-[#b68d40] shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Paths & Routes List */}
                {pathsOnMap.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-[#12161f]">
                    <div className="text-[11px] font-semibold text-[#757e8d]">
                      Routes &amp; Legacy Polygons ({pathsOnMap.length})
                    </div>
                    {pathsOnMap.map((path) => (
                      <div
                        key={path.id}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#090b0f] border border-[#141821] text-[11px] text-[#bdb7ac]"
                      >
                        <span className="truncate">{path.name}</span>
                        {canGmEdit && (
                          <button
                            onClick={() => deleteMapPath(path.id)}
                            className="text-[#5c6574] hover:text-red-400 ml-2 shrink-0"
                            title="Delete path"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                  </>
                )}

                {/* Peer Fog-of-War Map Showings Sharing */}
                {user && (
                  <div className="space-y-2 pt-2.5 border-t border-[#12161f]">
                    <div className="text-[11.5px] font-semibold text-[#c9a050]">
                      Share My Map Showings
                    </div>
                    <p className="text-[10.5px] text-[#7c8596] leading-snug">
                      Let fellow party members see regions revealed to you on this map.
                    </p>
                    <div className="space-y-1.5">
                      {(() => {
                        const myShares = mapFogShares.filter(
                          (sh) =>
                            sh.map_id === activeMap.id && sh.owner_user_id === user.id
                        );
                        const shareAllRow = myShares.find((sh) => sh.share_all);
                        const peers = campaignMembers.filter(
                          (m) => m.user_id !== user.id
                        );
                        return (
                          <>
                            <label className="flex items-center justify-between px-2 py-1.5 rounded bg-[#090b0f] border border-[#141821] text-[11px] text-[#e8dfd0] cursor-pointer">
                              <span>All Campaign Members</span>
                              <input
                                type="checkbox"
                                checked={Boolean(shareAllRow)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    upsertMapFogShare(activeMap.id, null, true);
                                  } else if (shareAllRow) {
                                    revokeMapFogShare(shareAllRow.id);
                                  }
                                }}
                                className="accent-[#d4a853]"
                              />
                            </label>
                            {peers.map((peer) => {
                              const peerShare = myShares.find(
                                (sh) =>
                                  !sh.share_all &&
                                  sh.shared_with_user_id === peer.user_id
                              );
                              const peerLabel =
                                peer.profile?.display_name || peer.user_id.slice(0, 8);
                              return (
                                <label
                                  key={peer.user_id}
                                  className="flex items-center justify-between px-2 py-1.5 rounded bg-[#090b0f] border border-[#141821] text-[11px] text-[#c7c2b7] cursor-pointer"
                                >
                                  <span className="truncate">{peerLabel}</span>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(peerShare)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        upsertMapFogShare(activeMap.id, peer.user_id, false);
                                      } else if (peerShare) {
                                        revokeMapFogShare(peerShare.id);
                                      }
                                    }}
                                    className="accent-[#d4a853]"
                                  />
                                </label>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </>
            ) : focusedEntity ? (
              /* Entity Inspector Details */
              <div className="space-y-3.5">
                {focusedEntity.cover_image_url && (
                  <div className="rounded-lg overflow-hidden border border-[#171c25] bg-[#040507]">
                    <img
                      src={focusedEntity.cover_image_url}
                      alt={focusedEntity.title}
                      className="w-full h-40 object-cover"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded bg-[#0c0f15] border border-[#b68d40]/30 text-[#c9a050]">
                    <EntityIcon type={focusedEntity.type} className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#c9a050]">
                      {focusedEntity.type}
                    </div>
                    <h2 className="font-serif text-[14.5px] font-semibold text-[#e8dfd0] truncate">
                      {focusedEntity.title}
                    </h2>
                  </div>
                </div>

                <p className="text-xs text-[#aba496] leading-relaxed">{focusedEntity.summary}</p>

                {getVisibleMetadataEntries(focusedEntity.metadata).length > 0 && (
                  <div className="rounded-md bg-[#090b0f] border border-[#141821] divide-y divide-[#11151d] text-[11.5px]">
                    {getVisibleMetadataEntries(focusedEntity.metadata).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between px-2.5 py-1.5">
                        <span className="text-[#757e8d]">{k}</span>
                        <span className="text-[#ded8cc] font-medium">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-[#12161f] space-y-2">
                  <div className="text-[11px] font-semibold text-[#a8a196]">Map Presence</div>
                  {mapPins.filter((p) => p.entity_id === focusedEntity.id).length === 0 ? (
                    <div className="text-[11px] text-[#5c6574] italic">
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
                            className="w-full flex items-center justify-between px-2.5 py-2 rounded bg-[#090b0f] border border-[#141821] hover:border-[#b68d40]/50 text-xs text-[#c9a050]"
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
                <div className="rounded-lg overflow-hidden border border-[#171c25] bg-[#040507] p-2">
                  <img
                    src={focusedAsset.url}
                    alt={focusedAsset.name}
                    className="w-full h-36 object-contain rounded"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded bg-[#0c0f15] border border-[#b68d40]/30 text-[#c9a050]">
                    <ImageIcon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#c9a050]">
                      Vault Asset • {focusedAsset.kind}
                    </div>
                    <h2 className="font-serif text-[14.5px] font-semibold text-[#e8dfd0] truncate">
                      {focusedAsset.name}
                    </h2>
                  </div>
                </div>

                <div className="surface-card rounded-lg divide-y divide-[#12161f] text-[11.5px]">
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[#757e8d]">Reference Slug</span>
                    <code className="font-mono text-[#c9a050] text-[11px]">
                      asset://{focusedAsset.slug}
                    </code>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[#757e8d]">Inline Syntax</span>
                    <code className="font-mono text-[#bdb7ac] text-[11px]">
                      ![[{focusedAsset.slug}]]
                    </code>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#12161f] space-y-2">
                  <div className="text-[11px] font-semibold text-[#a8a196]">
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
                        <div className="text-[11px] text-[#5c6574] italic">
                          Not embedded in any entry yet. Use Attach controls to link it.
                        </div>
                      );
                    }
                    return refs.map((ent) => (
                      <button
                        key={ent.id}
                        onClick={() => openEntityTab(ent.id)}
                        className="w-full flex items-center justify-between px-2.5 py-2 rounded bg-[#090b0f] border border-[#141821] hover:border-[#b68d40]/50 text-xs text-[#ded8cc]"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <EntityIcon type={ent.type} className="w-3.5 h-3.5 text-[#b68d40]" />
                          <span className="truncate">{ent.title}</span>
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#5c6574] shrink-0" />
                      </button>
                    ));
                  })()}
                </div>
              </div>
            ) : focusedTemplate ? (
              /* Template Dossier in Inspector */
              <div className="space-y-3.5">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded bg-[#0c0f15] border border-[#b68d40]/30 text-[#c9a050]">
                    <FileCode2 className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#c9a050]">
                      Record Blueprint
                    </div>
                    <h2 className="font-serif text-[14.5px] font-semibold text-[#e8dfd0] truncate">
                      {focusedTemplate.label}
                    </h2>
                  </div>
                </div>

                <div className="surface-card rounded-lg divide-y divide-[#12161f] text-[11.5px]">
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[#757e8d]">Target Type</span>
                    <span className="text-[#c9a050] font-medium">{focusedTemplate.type}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[#757e8d]">Default Attributes</span>
                    <span className="font-mono text-[#ded8cc]">
                      {Object.keys(focusedTemplate.metadata).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[#757e8d]">Vault Records</span>
                    <span className="font-mono text-[#ded8cc]">
                      {entities.filter((e) => e.type === focusedTemplate.type).length}
                    </span>
                  </div>
                </div>

                {canGmEdit && (
                  <button
                    onClick={() => openNewEntryModal(focusedTemplate.type, 'encyclopedia')}
                    className="w-full btn-gold-metallic py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                    <span>New {focusedTemplate.type} From Template</span>
                  </button>
                )}
              </div>
            ) : null}
          </>
        )}

        {inspectorSubTab === 'connections' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#ded8cc]">
                <Network className="w-3.5 h-3.5 text-[#b68d40]" />
                <span>Knowledge Graph</span>
              </div>
              <span className="text-[10.5px] font-mono text-[#6d7686]">Interactive 2D</span>
            </div>
            <ConnectionsGraph focusEntityId={focusedEntityId} />
            <div className="text-[11px] text-[#757e8d] leading-relaxed">
              Edges are derived live from <code className="text-[#c9a050]">[[WikiLinks]]</code>{' '}
              across your vault notes. Drag to pan, scroll to zoom, or click any node to open its
              grimoire entry.
            </div>
          </div>
        )}

        {inspectorSubTab === 'references' && (
          <div className="space-y-4">
            {!focusedEntity ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[#c9a050]">
                  World Backlinks Overview
                </div>
                <p className="text-xs text-[#757e8d]">
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
                        className="w-full flex items-center justify-between px-2.5 py-2 rounded bg-[#090b0f] border border-[#141821] hover:border-[#b68d40]/40 text-xs"
                      >
                        <span className="text-[#ded8cc] font-medium truncate">{ent.title}</span>
                        <span className="font-mono text-[11px] text-[#c9a050]">
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
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#c9a050] mb-2">
                    Incoming Backlinks ({incomingLinks.length})
                  </div>
                  {incomingLinks.length === 0 ? (
                    <div className="text-xs text-[#5c6574] italic">
                      No other notes reference {focusedEntity.title} yet.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {incomingLinks.map((src) => (
                        <button
                          key={src.id}
                          onClick={() => openEntityTab(src.id)}
                          className="w-full text-left p-2.5 rounded-lg bg-[#090b0f] border border-[#141821] hover:border-[#b68d40]/45 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-[#e8dfd0] truncate">
                              <EntityIcon type={src.type} className="w-3.5 h-3.5 text-[#b68d40]" />
                              {src.title}
                            </span>
                            <span className="text-[10px] font-mono text-[#6d7686]">{src.type}</span>
                          </div>
                          <p className="text-[11px] text-[#757e8d] line-clamp-2">{src.summary}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-[#12161f]">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#757e8d] mb-2">
                    Outgoing Links ({outgoingLinks.length})
                  </div>
                  {outgoingLinks.length === 0 ? (
                    <div className="text-xs text-[#5c6574] italic">No outgoing WikiLinks.</div>
                  ) : (
                    <div className="space-y-1">
                      {outgoingLinks.map((tgt) => (
                        <button
                          key={tgt.id}
                          onClick={() => openEntityTab(tgt.id)}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-[#090b0f] border border-[#141821] hover:border-[#b68d40]/40 text-xs text-[#ccc6ba]"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <EntityIcon type={tgt.type} className="w-3 h-3 text-[#b68d40]" />
                            <span className="truncate">{tgt.title}</span>
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-[#5c6574]" />
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
