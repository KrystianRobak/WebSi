import React from 'react';
import {
  Anchor,
  Castle,
  Compass,
  Landmark,
  Moon,
  Mountain,
  RotateCw,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  Trees,
  Waves,
} from 'lucide-react';
import { useVaultStore } from '../../store/useVaultStore';
import { BrushFalloff, MapPropKind, VaultMap, WorldAtmospherePreset } from '../../types/vault';

const PROP_CATALOG: Array<{
  kind: MapPropKind;
  label: string;
  category: 'Flora' | 'Hero Mesh';
}> = [
  { kind: 'pine', label: 'Boreal Pine', category: 'Flora' },
  { kind: 'oak', label: 'Broad Oak', category: 'Flora' },
  { kind: 'deadwood', label: 'Deadwood', category: 'Flora' },
  { kind: 'boulder', label: 'Boulder', category: 'Flora' },
  { kind: 'tower', label: 'Watchtower', category: 'Hero Mesh' },
  { kind: 'pier', label: 'Harbor Pier', category: 'Hero Mesh' },
  { kind: 'bridge', label: 'Stone Bridge', category: 'Hero Mesh' },
  { kind: 'ruin', label: 'Ancient Ruin', category: 'Hero Mesh' },
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
    activePropKind,
    setActivePropKind,
    selectedPropId,
    setSelectedPropId,
    updateMapProp,
    deleteMapProp,
    deleteRiver,
    setMapGeneratorModalOpen,
    setWorldsmithMode,
    updateMapMetadata,
  } = useVaultStore();

  const propsList = activeMap.props || [];
  const riversList = activeMap.rivers || [];
  const selectedProp = selectedPropId
    ? propsList.find((p) => p.id === selectedPropId) || null
    : null;

  return (
    <div className="space-y-4">
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
        <button
          onClick={() => setWorldsmithMode(false)}
          className="px-2 py-1 rounded text-[10.5px] bg-[#171b23] hover:bg-[#222834] border border-[#2a313e] text-[#cfc8ba]"
        >
          Back to Atlas
        </button>
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
            max={18}
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
            min={0.1}
            max={1}
            step={0.05}
            value={brushStrength}
            onChange={(e) => setBrushStrength(Number(e.target.value))}
            className="w-full accent-[#d4a853]"
          />
        </div>

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

      {/* Mesh / Flora Palette */}
      <div className="space-y-2 pt-2 border-t border-[#181d25]">
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] font-semibold text-[#b8b3a8]">
            Mesh & Flora Palette
          </span>
          <span className="text-[10px] font-mono text-[#6d7685]">{propsList.length} placed</span>
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
                ) : item.kind === 'ruin' ? (
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
              Selected: {selectedProp.kind}
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

      {/* Scene Atmosphere Lighting Presets */}
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
            title="Edit map title, settings & delete"
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

      {/* Procedural Regenerate CTA */}
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
          Procedural base can be sculpted & decorated freely.
        </p>
      </div>
    </div>
  );
};
