import React, { useEffect, useState } from 'react';
import {
  Anchor,
  ArrowDownToLine,
  ArrowUpFromLine,
  Castle,
  Cloud,
  Compass,
  Droplets,
  Eye,
  EyeOff,
  Flame,
  Home,
  Landmark,
  Layers,
  Minus,
  Moon,
  Mountain,
  Paintbrush,
  Plus,
  Redo2,
  RotateCw,
  Route,
  Settings2,
  Shield,
  Ship,
  Sparkles,
  Stamp,
  Sun,
  Trash2,
  Trees,
  TrendingUp,
  Undo2,
  Wand2,
  Waves,
  Wind,
} from 'lucide-react';
import { DEFAULT_DISPLACEMENT } from '../../lib/terrainGenerator';
import {
  BIOME_PAINT_PALETTE,
  FOG_VOLUME_PRESETS,
  FogPresetId,
  TERRAIN_STAMPS,
  WATER_PRESETS,
  WORLD_SIZE_PRESETS,
  getSeaLevelNorm,
  getWorldSize,
  resolveTerrainShading,
  resolveWaterSettings,
} from '../../lib/worldEnvironment';
import { WORLD_ELEMENT_CATALOG } from '../../lib/worldLayers';
import { useVaultStore } from '../../store/useVaultStore';
import {
  BrushFalloff,
  FogVolumeShape,
  MapPropKind,
  VaultMap,
  WorldAtmospherePreset,
  WorldsmithTool,
} from '../../types/vault';

const PROP_CATALOG: Array<{
  kind: MapPropKind;
  label: string;
  category: 'Flora' | 'Hero Mesh';
}> = WORLD_ELEMENT_CATALOG.map((item) => ({
  kind: item.kind,
  label: item.label,
  category: item.category === 'Flora & Terrain' ? 'Flora' : 'Hero Mesh',
}));

type InspectorStudioTab = 'sculpt' | 'environment' | 'fog' | 'props';

const SCULPT_QUICK_TOOLS: Array<{
  id: WorldsmithTool;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'raise', label: 'Raise', icon: ArrowUpFromLine },
  { id: 'valley', label: 'Valley', icon: ArrowDownToLine },
  { id: 'ridge', label: 'Ridge', icon: TrendingUp },
  { id: 'noise', label: 'Detail', icon: Sparkles },
  { id: 'terrace', label: 'Terrace', icon: Layers },
  { id: 'erode', label: 'Erode', icon: Droplets },
  { id: 'flatten', label: 'Flatten', icon: Minus },
  { id: 'smooth', label: 'Smooth', icon: Wand2 },
  { id: 'coast', label: 'Coast', icon: Waves },
  { id: 'river', label: 'River', icon: Route },
];

export const WorldsmithInspectorSection: React.FC<{ activeMap: VaultMap }> = ({
  activeMap,
}) => {
  const {
    worldsmithTool,
    setWorldsmithTool,
    brushRadius,
    setBrushRadius,
    brushStrength,
    setBrushStrength,
    brushFalloff,
    setBrushFalloff,
    terraceSteps,
    setTerraceSteps,
    activeStampKind,
    setActiveStampKind,
    activeBiomePaint,
    setActiveBiomePaint,
    activePropKind,
    setActivePropKind,
    selectedPropId,
    setSelectedPropId,
    selectedFogId,
    setSelectedFogId,
    activeFogPreset,
    setActiveFogPreset,
    dispatchTerrainCommand,
    addFogVolume,
    updateFogVolume,
    deleteFogVolume,
    updateMapEnvironment,
    updateMapProp,
    deleteMapProp,
    deleteRiver,
    setMapGeneratorModalOpen,
    setWorldsmithMode,
    updateMapMetadata,
  } = useVaultStore();

  const [studioTab, setStudioTab] = useState<InspectorStudioTab>('sculpt');

  useEffect(() => {
    if (worldsmithTool === 'fog') {
      setStudioTab('fog');
    } else if (
      worldsmithTool === 'paint-flora' ||
      worldsmithTool === 'place-mesh' ||
      worldsmithTool === 'erase-mesh'
    ) {
      setStudioTab('props');
    } else if (worldsmithTool !== 'edit-mesh') {
      setStudioTab('sculpt');
    }
  }, [worldsmithTool]);

  useEffect(() => {
    if (selectedFogId) setStudioTab('fog');
  }, [selectedFogId]);

  useEffect(() => {
    if (selectedPropId) setStudioTab('props');
  }, [selectedPropId]);

  const propsList = activeMap.props || [];
  const riversList = activeMap.rivers || [];
  const fogList = activeMap.fog_volumes || [];
  const selectedProp = selectedPropId
    ? propsList.find((p) => p.id === selectedPropId) || null
    : null;
  const selectedFog = selectedFogId
    ? fogList.find((f) => f.id === selectedFogId) || null
    : null;

  const worldSize = getWorldSize(activeMap);
  const seaLevel = getSeaLevelNorm(activeMap);
  const displacementScale = activeMap.displacement_scale ?? DEFAULT_DISPLACEMENT;
  const water = resolveWaterSettings(activeMap);
  const shading = resolveTerrainShading(activeMap);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#d4a853]">
            Worldsmith Studio
          </div>
          <h2 className="font-serif text-[14.5px] font-semibold text-[#f3ead8] truncate">
            {activeMap.name}
          </h2>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => dispatchTerrainCommand({ type: 'undo' })}
            title="Undo Sculpt (Ctrl+Z)"
            aria-label="Undo Sculpt"
            className="p-1.5 rounded bg-[#171b23] hover:bg-[#222834] border border-[#2a313e] text-[#cfc8ba] hover:text-white"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => dispatchTerrainCommand({ type: 'redo' })}
            title="Redo Sculpt (Ctrl+Shift+Z)"
            aria-label="Redo Sculpt"
            className="p-1.5 rounded bg-[#171b23] hover:bg-[#222834] border border-[#2a313e] text-[#cfc8ba] hover:text-white"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => dispatchTerrainCommand({ type: 'save-textures' })}
            title="Upload Baked Heightmap & Albedo to Supabase Storage"
            className="px-2 py-1 rounded text-[10.5px] btn-gold-metallic font-semibold"
          >
            Save Terrain
          </button>
          <button
            onClick={() => setWorldsmithMode(false)}
            className="px-2 py-1 rounded text-[10.5px] bg-[#171b23] hover:bg-[#222834] border border-[#2a313e] text-[#cfc8ba]"
          >
            Atlas
          </button>
        </div>
      </div>

      {/* Studio Sub-Tabs */}
      <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-[#0d1016] border border-[#1d222b]">
        {(
          [
            { id: 'sculpt', label: 'Sculpt' },
            { id: 'environment', label: 'Ocean' },
            { id: 'fog', label: `Fog (${fogList.length})` },
            { id: 'props', label: 'Props' },
          ] as Array<{ id: InspectorStudioTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStudioTab(tab.id)}
            className={`py-1 px-1 rounded text-[10.5px] font-medium transition-colors truncate ${
              studioTab === tab.id
                ? 'bg-[#d4a853]/22 text-[#f5df9d] border border-[#d4a853]/55'
                : 'text-[#8e97a6] hover:text-[#e7e2d8]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* TAB 1: SCULPT, STAMPS, BIOME PAINTER, WORLD SIZE & GLOBAL SHAPING  */}
      {/* ------------------------------------------------------------------ */}
      {studioTab === 'sculpt' && (
        <div className="space-y-3.5">
          {/* Quick Sculpting Brushes */}
          <div className="grid grid-cols-5 gap-1">
            {SCULPT_QUICK_TOOLS.map((t) => {
              const Icon = t.icon;
              const active = worldsmithTool === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setWorldsmithTool(t.id)}
                  className={`flex flex-col items-center gap-0.5 py-1.5 px-1 rounded border text-[9.5px] transition-colors ${
                    active
                      ? 'bg-[#d4a853]/20 border-[#d4a853]/65 text-[#f5df9d]'
                      : 'bg-[#12161e] border-[#1d222b] text-[#9aa3b2] hover:text-white hover:border-[#2c3442]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="truncate w-full text-center">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Brush Tuning */}
          <div className="rounded-md bg-[#12161e] border border-[#1d222b] p-2.5 space-y-2.5 text-[11.5px]">
            <div className="flex items-center justify-between">
              <span className="text-[#858d9b]">Active Tool</span>
              <span className="font-mono text-[#e5be58] uppercase text-[10.5px]">
                {worldsmithTool}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[#b8b3a8]">
                <span>Brush Radius</span>
                <span className="font-mono text-[#e7e2d8]">{brushRadius.toFixed(1)} u</span>
              </div>
              <input
                type="range"
                min={2}
                max={36}
                step={0.5}
                value={brushRadius}
                onChange={(e) => setBrushRadius(Number(e.target.value))}
                className="w-full accent-[#d4a853]"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[#b8b3a8]">
                <span>Sculpt Strength</span>
                <span className="font-mono text-[#e7e2d8]">{Math.round(brushStrength * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={brushStrength}
                onChange={(e) => setBrushStrength(Number(e.target.value))}
                className="w-full accent-[#d4a853]"
              />
            </div>

            {worldsmithTool === 'terrace' && (
              <div className="space-y-1">
                <div className="flex justify-between text-[#b8b3a8]">
                  <span>Terrace Steps</span>
                  <span className="font-mono text-[#e7e2d8]">{terraceSteps}</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={24}
                  step={1}
                  value={terraceSteps}
                  onChange={(e) => setTerraceSteps(Number(e.target.value))}
                  className="w-full accent-[#d4a853]"
                />
              </div>
            )}

            <div className="space-y-1">
              <span className="text-[#b8b3a8]">Brush Falloff</span>
              <div className="grid grid-cols-3 gap-1">
                {(['smooth', 'peak', 'plateau'] as BrushFalloff[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setBrushFalloff(f)}
                    className={`py-1 rounded text-[10.5px] capitalize border transition-colors ${
                      brushFalloff === f
                        ? 'bg-[#d4a853]/20 border-[#d4a853]/60 text-[#f5df9d]'
                        : 'bg-[#171b23] border-[#252b36] text-[#9aa3b2]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Landform Stamps */}
          <div className="space-y-2 pt-2 border-t border-[#181d25]">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#b8b3a8] flex items-center gap-1.5">
                <Stamp className="w-3.5 h-3.5 text-[#d4a853]" />
                Landform Stamps
              </span>
              <span className="text-[10px] text-[#6d7685]">Shift+Click inverts</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {TERRAIN_STAMPS.map((st) => {
                const active = worldsmithTool === 'stamp' && activeStampKind === st.kind;
                return (
                  <button
                    key={st.kind}
                    onClick={() => {
                      setActiveStampKind(st.kind);
                      setWorldsmithTool('stamp');
                    }}
                    className={`px-2 py-1.5 rounded border text-left transition-colors ${
                      active
                        ? 'bg-[#d4a853]/20 border-[#d4a853]/65 text-[#f5df9d]'
                        : 'bg-[#12161e] border-[#1d222b] text-[#c7c2b7] hover:border-[#303744]'
                    }`}
                  >
                    <div className="text-[11px] font-medium leading-tight">{st.label}</div>
                    <div className="text-[9.5px] text-[#7a8393] truncate">{st.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Biome Paint Brush */}
          <div className="space-y-2 pt-2 border-t border-[#181d25]">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#b8b3a8] flex items-center gap-1.5">
                <Paintbrush className="w-3.5 h-3.5 text-emerald-400" />
                Biome Paint Layer
              </span>
              <button
                onClick={() => dispatchTerrainCommand({ type: 'clear-paint' })}
                className="text-[10px] text-[#8d96a6] hover:text-red-300"
              >
                Clear Paint
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {BIOME_PAINT_PALETTE.map((swatch) => {
                const active =
                  worldsmithTool === 'paint-biome' && activeBiomePaint === swatch.kind;
                return (
                  <button
                    key={swatch.kind}
                    onClick={() => {
                      setActiveBiomePaint(swatch.kind);
                      setWorldsmithTool('paint-biome');
                    }}
                    className={`px-2 py-1.5 rounded-md border text-[11px] flex items-center gap-1.5 transition-colors ${
                      active
                        ? 'bg-[#d4a853]/20 border-[#d4a853]/65 text-[#f5df9d]'
                        : 'bg-[#12161e] border-[#1d222b] text-[#d4cfc4] hover:border-[#303744]'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/25"
                      style={{
                        backgroundColor: swatch.kind === 'erase' ? 'transparent' : swatch.color,
                      }}
                    />
                    <span className="truncate">{swatch.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Global World Shaping & Dimensions */}
          <div className="space-y-2.5 pt-2 border-t border-[#181d25]">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#b8b3a8]">
                Global Shaping &amp; Scale
              </span>
              <span className="text-[10px] font-mono text-[#e5be58]">
                {worldSize} × {worldSize} u
              </span>
            </div>

            {/* Blank Canvases */}
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  ['ocean', 'Blank Ocean'],
                  ['plains', 'Flat Plains'],
                  ['hills', 'Rolling Hills'],
                ] as const
              ).map(([preset, label]) => (
                <button
                  key={preset}
                  onClick={() =>
                    dispatchTerrainCommand({ type: 'blank', preset, seed: Date.now() })
                  }
                  className="py-1.5 px-1.5 rounded bg-[#12161e] hover:bg-[#1a202c] border border-[#222936] text-[10px] text-[#d4cfc4] transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Global Filters */}
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => dispatchTerrainCommand({ type: 'smooth-all', iterations: 2 })}
                className="py-1.5 px-1.5 rounded bg-[#12161e] hover:bg-[#1a202c] border border-[#222936] text-[10px] text-[#c7c2b7]"
              >
                Smooth All
              </button>
              <button
                onClick={() => dispatchTerrainCommand({ type: 'erode-all', iterations: 5 })}
                className="py-1.5 px-1.5 rounded bg-[#12161e] hover:bg-[#1a202c] border border-[#222936] text-[10px] text-[#c7c2b7]"
              >
                Thermal Erode
              </button>
              <button
                onClick={() => dispatchTerrainCommand({ type: 'noise-all', amount: 0.35 })}
                className="py-1.5 px-1.5 rounded bg-[#12161e] hover:bg-[#1a202c] border border-[#222936] text-[10px] text-[#c7c2b7]"
              >
                Add Detail
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => dispatchTerrainCommand({ type: 'raise-all', delta: 0.03 })}
                className="py-1 px-2 rounded bg-[#12161e] hover:bg-[#1a202c] border border-[#222936] text-[10.5px] text-[#c7c2b7]"
              >
                Raise Land +
              </button>
              <button
                onClick={() => dispatchTerrainCommand({ type: 'raise-all', delta: -0.03 })}
                className="py-1 px-2 rounded bg-[#12161e] hover:bg-[#1a202c] border border-[#222936] text-[10.5px] text-[#c7c2b7]"
              >
                Lower Land −
              </button>
            </div>

            {/* World Size Presets */}
            <div className="space-y-1">
              <span className="text-[10.5px] text-[#9aa3b2]">World Dimensions</span>
              <div className="grid grid-cols-4 gap-1">
                {WORLD_SIZE_PRESETS.map((preset) => {
                  const active = Math.abs(worldSize - preset.size) < 5;
                  return (
                    <button
                      key={preset.size}
                      disabled={active}
                      onClick={() =>
                        dispatchTerrainCommand({ type: 'expand', newWorldSize: preset.size })
                      }
                      className={`py-1 px-1 rounded border text-[10px] transition-colors ${
                        active
                          ? 'bg-[#d4a853]/20 border-[#d4a853]/65 text-[#f5df9d]'
                          : 'bg-[#12161e] border-[#1d222b] text-[#9aa3b2] hover:text-white'
                      }`}
                    >
                      <div className="font-semibold">{preset.size}u</div>
                      <div className="text-[8.5px] opacity-75">{preset.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sea Level & Relief */}
            <div className="rounded-md bg-[#12161e] border border-[#1d222b] p-2.5 space-y-2 text-[11px]">
              <div className="space-y-0.5">
                <div className="flex justify-between text-[#b8b3a8]">
                  <span>Sea Level</span>
                  <span className="font-mono text-[#e7e2d8]">{Math.round(seaLevel * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.55}
                  step={0.01}
                  value={seaLevel}
                  onChange={(e) =>
                    updateMapEnvironment(activeMap.id, { sea_level: Number(e.target.value) })
                  }
                  className="w-full accent-[#d4a853]"
                />
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between text-[#b8b3a8]">
                  <span>Peak Elevation Scale</span>
                  <span className="font-mono text-[#e7e2d8]">{displacementScale.toFixed(1)} u</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={24}
                  step={0.5}
                  value={displacementScale}
                  onChange={(e) =>
                    updateMapEnvironment(activeMap.id, {
                      displacement_scale: Number(e.target.value),
                    })
                  }
                  className="w-full accent-[#d4a853]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* TAB 2: OCEAN WATER WAVES, BIOME SHADING & ATMOSPHERE               */}
      {/* ------------------------------------------------------------------ */}
      {studioTab === 'environment' && (
        <div className="space-y-3.5">
          {/* Water Presets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#b8b3a8] flex items-center gap-1.5">
                <Waves className="w-3.5 h-3.5 text-sky-400" />
                Ocean Waves &amp; Foam
              </span>
              <button
                onClick={() =>
                  updateMapEnvironment(activeMap.id, {
                    water: { deepColor: null, shallowColor: null },
                  })
                }
                className="text-[10px] text-[#8e97a6] hover:text-[#e5be58]"
              >
                Auto Tint
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {WATER_PRESETS.map((wp) => (
                <button
                  key={wp.id}
                  onClick={() => updateMapEnvironment(activeMap.id, { water: wp.settings })}
                  className="px-2 py-1.5 rounded bg-[#12161e] hover:bg-[#191f2a] border border-[#1d222b] hover:border-[#344054] text-left text-[10.5px] text-[#d4cfc4]"
                >
                  {wp.label}
                </button>
              ))}
            </div>

            <div className="rounded-md bg-[#12161e] border border-[#1d222b] p-2.5 space-y-2 text-[11px]">
              {(
                [
                  ['Wave Height', water.waveHeight, 0, 2, 0.05, 'waveHeight', (v: number) => `${Math.round(v * 100)}%`],
                  ['Wave Scale', water.waveScale, 0.4, 2.5, 0.05, 'waveScale', (v: number) => `${v.toFixed(2)}×`],
                  ['Wave Speed', water.waveSpeed, 0, 2.5, 0.05, 'waveSpeed', (v: number) => `${v.toFixed(2)}×`],
                  ['Choppiness', water.choppiness, 0, 1, 0.05, 'choppiness', (v: number) => `${Math.round(v * 100)}%`],
                  ['Foam & Whitecaps', water.foamAmount, 0, 2, 0.05, 'foamAmount', (v: number) => `${Math.round(v * 100)}%`],
                  ['Shore Breakers', water.shoreWaves, 0, 2, 0.05, 'shoreWaves', (v: number) => `${Math.round(v * 100)}%`],
                  ['Water Clarity', water.clarity, 0, 1, 0.05, 'clarity', (v: number) => `${Math.round(v * 100)}%`],
                  ['Wind Direction', water.windDirection, 0, 360, 5, 'windDirection', (v: number) => `${Math.round(v)}°`],
                ] as const
              ).map(([label, val, min, max, step, key, fmt]) => (
                <div key={key} className="space-y-0.5">
                  <div className="flex justify-between text-[#b8b3a8]">
                    <span>{label}</span>
                    <span className="font-mono text-[#e7e2d8]">{fmt(val)}</span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={val}
                    onChange={(e) =>
                      updateMapEnvironment(activeMap.id, {
                        water: { [key]: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-[#d4a853]"
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center justify-between gap-1 text-[10.5px] text-[#9aa3b2]">
                  <span>Deep Color</span>
                  <input
                    type="color"
                    value={water.deepColor || '#072238'}
                    onChange={(e) =>
                      updateMapEnvironment(activeMap.id, { water: { deepColor: e.target.value } })
                    }
                    className="w-7 h-5 rounded bg-transparent border border-[#2c3442] cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between gap-1 text-[10.5px] text-[#9aa3b2]">
                  <span>Shoal Color</span>
                  <input
                    type="color"
                    value={water.shallowColor || '#2aa1ab'}
                    onChange={(e) =>
                      updateMapEnvironment(activeMap.id, {
                        water: { shallowColor: e.target.value },
                      })
                    }
                    className="w-7 h-5 rounded bg-transparent border border-[#2c3442] cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Terrain Biome Color & Shading */}
          <div className="space-y-2 pt-2 border-t border-[#181d25]">
            <span className="text-[11.5px] font-semibold text-[#b8b3a8] flex items-center gap-1.5">
              <Mountain className="w-3.5 h-3.5 text-emerald-400" />
              Terrain Biomes &amp; Palette
            </span>
            <div className="rounded-md bg-[#12161e] border border-[#1d222b] p-2.5 space-y-2 text-[11px]">
              <div className="space-y-0.5">
                <div className="flex justify-between text-[#b8b3a8]">
                  <span>Snow Line</span>
                  <span className="font-mono text-[#e7e2d8]">
                    {Math.round(shading.snowLine * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.35}
                  max={0.95}
                  step={0.02}
                  value={shading.snowLine}
                  onChange={(e) =>
                    updateMapEnvironment(activeMap.id, {
                      terrain_shading: { snowLine: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-[#d4a853]"
                />
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between text-[#b8b3a8]">
                  <span>Aridity (Lush ↔ Desert)</span>
                  <span className="font-mono text-[#e7e2d8]">
                    {Math.round(shading.aridity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={shading.aridity}
                  onChange={(e) =>
                    updateMapEnvironment(activeMap.id, {
                      terrain_shading: { aridity: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-[#d4a853]"
                />
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between text-[#b8b3a8]">
                  <span>Beach Sand Margin</span>
                  <span className="font-mono text-[#e7e2d8]">
                    {Math.round(shading.beachWidth * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={shading.beachWidth}
                  onChange={(e) =>
                    updateMapEnvironment(activeMap.id, {
                      terrain_shading: { beachWidth: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-[#d4a853]"
                />
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between text-[#b8b3a8]">
                  <span>Color Richness</span>
                  <span className="font-mono text-[#e7e2d8]">
                    {Math.round((shading.colorRichness ?? 1.15) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={1.8}
                  step={0.05}
                  value={shading.colorRichness ?? 1.15}
                  onChange={(e) =>
                    updateMapEnvironment(activeMap.id, {
                      terrain_shading: { colorRichness: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-[#d4a853]"
                />
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between text-[#b8b3a8]">
                  <span>Foliage Lushness</span>
                  <span className="font-mono text-[#e7e2d8]">
                    {Math.round((shading.lushness ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1.5}
                  step={0.05}
                  value={shading.lushness ?? 1}
                  onChange={(e) =>
                    updateMapEnvironment(activeMap.id, {
                      terrain_shading: { lushness: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-[#d4a853]"
                />
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between text-[#b8b3a8]">
                  <span>Cliff Rock Contrast</span>
                  <span className="font-mono text-[#e7e2d8]">
                    {Math.round((shading.rockContrast ?? 1.1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={1.8}
                  step={0.05}
                  value={shading.rockContrast ?? 1.1}
                  onChange={(e) =>
                    updateMapEnvironment(activeMap.id, {
                      terrain_shading: { rockContrast: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-[#d4a853]"
                />
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between text-[#b8b3a8]">
                  <span>Foliage Hue (Boreal ↔ Autumn)</span>
                  <span className="font-mono text-[#e7e2d8]">
                    {shading.vegetationHue > 0 ? '+' : ''}
                    {shading.vegetationHue.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={shading.vegetationHue}
                  onChange={(e) =>
                    updateMapEnvironment(activeMap.id, {
                      terrain_shading: { vegetationHue: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-[#d4a853]"
                />
              </div>
              {activeMap.albedo_url && (
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[#b8b3a8]">
                    <span>Albedo Image Tint</span>
                    <span className="font-mono text-[#e7e2d8]">
                      {Math.round(shading.albedoBlend * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={shading.albedoBlend}
                    onChange={(e) =>
                      updateMapEnvironment(activeMap.id, {
                        terrain_shading: { albedoBlend: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-[#d4a853]"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Scene Atmosphere Presets */}
          <div className="space-y-2 pt-2 border-t border-[#181d25]">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#b8b3a8] flex items-center gap-1.5">
                {(activeMap.atmosphere || 'golden-hour') === 'moonlit-night' ? (
                  <Moon className="w-3.5 h-3.5 text-sky-400" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-[#d4a853]" />
                )}
                Scene Atmosphere
              </span>
              <button
                onClick={() => setMapGeneratorModalOpen(true, '3d', activeMap.id)}
                className="text-[10.5px] text-[#d4a853] hover:underline flex items-center gap-1"
              >
                <Settings2 className="w-3 h-3" />
                Edit Map
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'golden-hour', label: 'Golden Dusk' },
                  { id: 'high-noon', label: 'High Noon' },
                  { id: 'moonlit-night', label: 'Moonlit Vigil' },
                  { id: 'crimson-eclipse', label: 'Blood Eclipse' },
                ] as Array<{ id: WorldAtmospherePreset; label: string }>
              ).map((preset) => {
                const active = (activeMap.atmosphere || 'golden-hour') === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => updateMapMetadata(activeMap.id, { atmosphere: preset.id })}
                    className={`px-2 py-1.5 rounded text-[11px] font-medium border transition-colors ${
                      active
                        ? 'bg-[#d4a853]/18 border-[#d4a853]/65 text-[#f3d18a]'
                        : 'bg-[#12161e] border-[#1d222b] text-[#9ea6b4] hover:text-[#e7e2d8] hover:border-[#2c3442]'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* TAB 3: VOLUMETRIC FOG VOLUMES & SETTINGS                           */}
      {/* ------------------------------------------------------------------ */}
      {studioTab === 'fog' && (
        <div className="space-y-3.5">
          {/* Placement Triggers */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setWorldsmithTool('fog')}
              className={`py-1.5 px-2 rounded border text-[11px] font-medium flex items-center justify-center gap-1.5 ${
                worldsmithTool === 'fog'
                  ? 'bg-[#d4a853]/22 border-[#d4a853]/70 text-[#f5df9d]'
                  : 'bg-[#12161e] border-[#1d222b] text-[#d8d3c8] hover:border-[#343e4f]'
              }`}
            >
              <Cloud className="w-3.5 h-3.5 text-sky-300" />
              <span>Click Map to Place</span>
            </button>
            <button
              onClick={() => {
                addFogVolume(activeMap.id, { x: 0, y: 2.5, z: 0 }, activeFogPreset);
                setWorldsmithTool('fog');
              }}
              className="py-1.5 px-2 rounded bg-[#151b24] hover:bg-[#1e2633] border border-[#2a3342] text-[11px] text-[#e5be58] flex items-center justify-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add at Center</span>
            </button>
          </div>

          {/* Fog Presets */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-[#b8b3a8]">Fog Presets</span>
            <div className="grid grid-cols-2 gap-1">
              {FOG_VOLUME_PRESETS.map((preset) => {
                const active = activeFogPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setActiveFogPreset(preset.id as FogPresetId);
                      if (selectedFog) {
                        updateFogVolume(activeMap.id, selectedFog.id, {
                          name: preset.label,
                          ...preset.settings,
                        });
                      }
                    }}
                    className={`px-2 py-1.5 rounded border text-left text-[10.5px] flex items-center gap-1.5 transition-colors ${
                      active
                        ? 'bg-[#d4a853]/20 border-[#d4a853]/65 text-[#f5df9d]'
                        : 'bg-[#12161e] border-[#1d222b] text-[#c7c2b7] hover:border-[#303744]'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/30"
                      style={{ backgroundColor: preset.settings.color || '#c9d4e0' }}
                    />
                    <span className="truncate">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Placed Fog Volumes List */}
          <div className="space-y-1.5 pt-2 border-t border-[#181d25]">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#b8b3a8]">
                Placed Fog Volumes ({fogList.length})
              </span>
            </div>
            {fogList.length > 0 ? (
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {fogList.map((f) => {
                  const isSel = f.id === selectedFogId;
                  return (
                    <div
                      key={f.id}
                      onClick={() => setSelectedFogId(isSel ? null : f.id)}
                      className={`flex items-center justify-between px-2 py-1.5 rounded border text-[11px] cursor-pointer ${
                        isSel
                          ? 'bg-[#d4a853]/18 border-[#d4a853]/65 text-[#f5df9d]'
                          : 'bg-[#12161e] border-[#1d222b] text-[#d8d3c8] hover:border-[#2e3646]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/25"
                          style={{ backgroundColor: f.color }}
                        />
                        <span className="truncate">{f.name}</span>
                        {f.is_gm_only && (
                          <span className="text-[9px] px-1 rounded bg-purple-900/50 text-purple-200 border border-purple-500/40">
                            GM
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateFogVolume(activeMap.id, f.id, { visible: !f.visible });
                          }}
                          className="p-0.5 text-[#8d96a6] hover:text-white"
                          title={f.visible ? 'Hide Fog' : 'Show Fog'}
                        >
                          {f.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteFogVolume(activeMap.id, f.id);
                          }}
                          className="p-0.5 text-[#8d96a6] hover:text-red-400"
                          title="Delete Fog Volume"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] text-[#6a7383] italic">
                No fog volumes placed yet. Select Fog tool and click the map!
              </div>
            )}
          </div>

          {/* Selected Fog Volume Settings */}
          {selectedFog && (
            <div className="space-y-2.5 pt-2 border-t border-[#181d25]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#d4a853]">
                  Fog Settings: {selectedFog.name}
                </span>
              </div>

              <div className="rounded-md bg-[#12161e] border border-[#d4a853]/35 p-2.5 space-y-2.5 text-[11px]">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={selectedFog.name}
                    onChange={(e) =>
                      updateFogVolume(activeMap.id, selectedFog.id, { name: e.target.value })
                    }
                    className="flex-1 bg-[#0b0d10] border border-[#242a36] rounded px-2 py-1 text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
                  />
                  <input
                    type="color"
                    value={selectedFog.color}
                    onChange={(e) =>
                      updateFogVolume(activeMap.id, selectedFog.id, { color: e.target.value })
                    }
                    className="w-8 h-7 rounded bg-transparent border border-[#2c3442] cursor-pointer"
                    title="Fog Tint Color"
                  />
                </div>

                {/* Shape */}
                <div className="grid grid-cols-3 gap-1">
                  {(['box', 'sphere', 'cylinder'] as FogVolumeShape[]).map((sh) => (
                    <button
                      key={sh}
                      onClick={() =>
                        updateFogVolume(activeMap.id, selectedFog.id, { shape: sh })
                      }
                      className={`py-1 rounded text-[10.5px] capitalize border ${
                        selectedFog.shape === sh
                          ? 'bg-[#d4a853]/20 border-[#d4a853]/60 text-[#f5df9d]'
                          : 'bg-[#171b23] border-[#252b36] text-[#9aa3b2]'
                      }`}
                    >
                      {sh}
                    </button>
                  ))}
                </div>

                {/* Position */}
                <div className="grid grid-cols-3 gap-1.5 font-mono text-[#9aa3b2]">
                  {(
                    [
                      ['X', 'x', selectedFog.x],
                      ['Base Y', 'y', selectedFog.y],
                      ['Z', 'z', selectedFog.z],
                    ] as const
                  ).map(([lbl, key, val]) => (
                    <label key={key} className="space-y-0.5">
                      <span className="text-[10px]">{lbl}</span>
                      <input
                        type="number"
                        step={0.5}
                        value={val}
                        onChange={(e) =>
                          updateFogVolume(activeMap.id, selectedFog.id, {
                            [key]: Number(e.target.value),
                          })
                        }
                        className="w-full bg-[#0b0d10] border border-[#242a36] rounded px-1.5 py-0.5 text-[#f3ead8]"
                      />
                    </label>
                  ))}
                </div>

                {/* Sliders */}
                {(
                  [
                    ['Width (X)', selectedFog.width, 4, 160, 1, 'width', (v: number) => `${v} u`],
                    ['Depth (Z)', selectedFog.depth, 4, 160, 1, 'depth', (v: number) => `${v} u`],
                    ['Height (Y)', selectedFog.height, 1.5, 45, 0.5, 'height', (v: number) => `${v.toFixed(1)} u`],
                    ['Density', selectedFog.density, 0.05, 2, 0.05, 'density', (v: number) => `${Math.round(v * 100)}%`],
                    ['Edge Softness', selectedFog.edgeSoftness, 0.05, 1, 0.05, 'edgeSoftness', (v: number) => `${Math.round(v * 100)}%`],
                    ['Height Falloff', selectedFog.heightFalloff, 0, 1, 0.05, 'heightFalloff', (v: number) => `${Math.round(v * 100)}%`],
                    ['Wisp Scale', selectedFog.noiseScale, 0.2, 3, 0.1, 'noiseScale', (v: number) => `${v.toFixed(1)}×`],
                    ['Wisp Contrast', selectedFog.noiseStrength, 0, 1, 0.05, 'noiseStrength', (v: number) => `${Math.round(v * 100)}%`],
                    ['Drift Speed', selectedFog.windSpeed, 0, 3, 0.1, 'windSpeed', (v: number) => `${v.toFixed(1)}×`],
                    ['Drift Angle', selectedFog.windDirection, 0, 360, 5, 'windDirection', (v: number) => `${Math.round(v)}°`],
                    ['Emissive Glow', selectedFog.glow, 0, 2, 0.05, 'glow', (v: number) => `${Math.round(v * 100)}%`],
                    ['Sun Scatter', selectedFog.lightScattering, 0, 1, 0.05, 'lightScattering', (v: number) => `${Math.round(v * 100)}%`],
                    ['Volume Rotation', (selectedFog.rotY * 180) / Math.PI, 0, 360, 5, 'rotY', (v: number) => `${Math.round(v)}°`],
                  ] as const
                ).map(([label, val, min, max, step, key, fmt]) => (
                  <div key={key} className="space-y-0.5">
                    <div className="flex justify-between text-[#b8b3a8]">
                      <span>{label}</span>
                      <span className="font-mono text-[#e7e2d8]">{fmt(val)}</span>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={val}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        updateFogVolume(activeMap.id, selectedFog.id, {
                          [key]: key === 'rotY' ? (raw * Math.PI) / 180 : raw,
                        });
                      }}
                      className="w-full accent-[#d4a853]"
                    />
                  </div>
                ))}

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-1.5 text-[11px] text-[#c7c2b7] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFog.visible}
                      onChange={(e) =>
                        updateFogVolume(activeMap.id, selectedFog.id, {
                          visible: e.target.checked,
                        })
                      }
                      className="accent-[#d4a853]"
                    />
                    <span>Visible</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-[#c7c2b7] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFog.is_gm_only}
                      onChange={(e) =>
                        updateFogVolume(activeMap.id, selectedFog.id, {
                          is_gm_only: e.target.checked,
                        })
                      }
                      className="accent-[#d4a853]"
                    />
                    <span>GM-Only Fog</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* TAB 4: PROPS, FLORA & RIVERS                                       */}
      {/* ------------------------------------------------------------------ */}
      {studioTab === 'props' && (
        <div className="space-y-3.5">
          {/* Mesh / Flora Palette */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#b8b3a8]">
                Mesh &amp; Flora Palette
              </span>
              <span className="text-[10px] font-mono text-[#6d7685]">
                {propsList.length} placed
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {PROP_CATALOG.map((item) => {
                const active = activePropKind === item.kind;
                return (
                  <button
                    key={item.kind}
                    onClick={() => {
                      setActivePropKind(item.kind);
                      if (item.category === 'Hero Mesh') {
                        setWorldsmithTool('place-mesh');
                      } else if (
                        worldsmithTool !== 'paint-flora' &&
                        worldsmithTool !== 'place-mesh'
                      ) {
                        setWorldsmithTool('paint-flora');
                      }
                    }}
                    className={`px-2 py-1.5 rounded border text-left text-[11px] flex items-center gap-1.5 transition-colors ${
                      active
                        ? 'bg-[#d4a853]/20 border-[#d4a853]/65 text-[#f5df9d]'
                        : 'bg-[#12161e] border-[#1d222b] text-[#c7c2b7] hover:border-[#303744]'
                    }`}
                  >
                    {item.category === 'Flora' ? (
                      item.kind === 'boulder' ? (
                        <Mountain className="w-3 h-3 text-[#9aa3b2] shrink-0" />
                      ) : (
                        <Trees className="w-3 h-3 text-emerald-400 shrink-0" />
                      )
                    ) : item.kind === 'pier' ? (
                      <Anchor className="w-3 h-3 text-sky-300 shrink-0" />
                    ) : item.kind === 'ship' ? (
                      <Ship className="w-3 h-3 text-sky-300 shrink-0" />
                    ) : item.kind === 'village' ? (
                      <Home className="w-3 h-3 text-amber-300 shrink-0" />
                    ) : item.kind === 'campfire' ? (
                      <Flame className="w-3 h-3 text-orange-400 shrink-0" />
                    ) : item.kind === 'windmill' ? (
                      <Wind className="w-3 h-3 text-[#e5be58] shrink-0" />
                    ) : item.kind === 'gate' ? (
                      <Shield className="w-3 h-3 text-[#d4a853] shrink-0" />
                    ) : item.kind === 'monolith' ? (
                      <Sparkles className="w-3 h-3 text-sky-400 shrink-0" />
                    ) : item.kind === 'ruin' || item.kind === 'temple' ? (
                      <Landmark className="w-3 h-3 text-[#d4a853] shrink-0" />
                    ) : (
                      <Castle className="w-3 h-3 text-[#d4a853] shrink-0" />
                    )}
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Prop Transform Inspector */}
          {selectedProp && (
            <div className="space-y-2 pt-2 border-t border-[#181d25]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#d4a853]">
                  Selected: {selectedProp.name || selectedProp.kind}
                </span>
                <button
                  onClick={() => {
                    deleteMapProp(activeMap.id, selectedProp.id);
                    setSelectedPropId(null);
                  }}
                  className="p-1 rounded bg-[#181d26] hover:bg-red-950/50 text-red-400"
                  title="Delete Mesh"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="rounded-md bg-[#12161e] border border-[#d4a853]/35 p-2.5 space-y-2 text-[11px]">
                <label className="block space-y-0.5 text-[#9aa3b2]">
                  <span>Element Name (Optional)</span>
                  <input
                    type="text"
                    value={selectedProp.name || ''}
                    placeholder={`e.g. ${selectedProp.kind}`}
                    onChange={(e) =>
                      updateMapProp(activeMap.id, selectedProp.id, {
                        name: e.target.value,
                      })
                    }
                    className="w-full bg-[#0b0d10] border border-[#242a36] rounded px-2 py-1 text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2 font-mono text-[#9aa3b2]">
                  <label className="space-y-0.5">
                    <span>X</span>
                    <input
                      type="number"
                      step={0.5}
                      value={selectedProp.x}
                      onChange={(e) =>
                        updateMapProp(activeMap.id, selectedProp.id, {
                          x: Number(e.target.value),
                        })
                      }
                      className="w-full bg-[#0b0d10] border border-[#242a36] rounded px-1.5 py-0.5 text-[#f3ead8]"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span>Z</span>
                    <input
                      type="number"
                      step={0.5}
                      value={selectedProp.z}
                      onChange={(e) =>
                        updateMapProp(activeMap.id, selectedProp.id, {
                          z: Number(e.target.value),
                        })
                      }
                      className="w-full bg-[#0b0d10] border border-[#242a36] rounded px-1.5 py-0.5 text-[#f3ead8]"
                    />
                  </label>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[#b8b3a8]">
                    <span className="flex items-center gap-1">
                      <RotateCw className="w-3 h-3" /> Rotation
                    </span>
                    <span className="font-mono text-[#e7e2d8]">
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
                    className="w-full accent-[#d4a853]"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[#b8b3a8]">
                    <span>Scale</span>
                    <span className="font-mono text-[#e7e2d8]">
                      {selectedProp.scale.toFixed(2)}×
                    </span>
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
                    className="w-full accent-[#d4a853]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Rivers List */}
          <div className="space-y-2 pt-2 border-t border-[#181d25]">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#b8b3a8] flex items-center gap-1.5">
                <Waves className="w-3.5 h-3.5 text-sky-400" />
                Carved Rivers ({riversList.length})
              </span>
              <button
                onClick={() => setWorldsmithTool('river')}
                className="text-[10.5px] text-[#d4a853] hover:underline"
              >
                + Draw River
              </button>
            </div>
            {riversList.length > 0 ? (
              <div className="space-y-1">
                {riversList.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#12161e] border border-[#1d222b] text-[11.5px]"
                  >
                    <span className="text-[#d8d3c8] truncate">{r.name}</span>
                    <button
                      onClick={() => deleteRiver(activeMap.id, r.id)}
                      className="text-[#6d7685] hover:text-red-400"
                      title="Remove River Ribbon"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-[#6a7383] italic">
                No custom carved rivers yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Procedural Regenerate CTA (always visible at bottom) */}
      <div className="pt-2 border-t border-[#181d25]">
        <button
          onClick={() => setMapGeneratorModalOpen(true, '3d')}
          className="w-full py-2 px-3 rounded btn-gold-metallic text-xs font-semibold flex items-center justify-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Custom Terrain Generator...</span>
        </button>
        <p className="mt-1.5 text-[10.5px] text-[#6d7685] flex items-center gap-1">
          <Compass className="w-3 h-3 shrink-0" />
          Procedural base can be sculpted, painted &amp; expanded freely.
        </p>
      </div>
    </div>
  );
};
