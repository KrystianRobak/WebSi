import React, { useState } from 'react';
import { Dices, Grid, Mountain, Sparkles, Sun, Trash2, Trees, Upload, Waves, X } from 'lucide-react';
import { uploadVaultAsset } from '../../lib/supabase';
import { useVaultStore } from '../../store/useVaultStore';
import {
  BattlemapTheme,
  MapGenerationConfig,
  TerrainArchetype,
  WorldAtmospherePreset,
} from '../../types/vault';

const ARCHETYPES: Array<{ id: TerrainArchetype; label: string; desc: string }> = [
  { id: 'archipelago', label: 'Shattered Archipelago', desc: 'Island chains & reef shoals' },
  { id: 'fjord', label: 'Alpine Fjord', desc: 'Glacial sea inlet & jagged cliffs' },
  { id: 'basin', label: 'Highland Basin', desc: 'Mountain ring & central valley' },
  { id: 'caldera', label: 'Volcanic Caldera', desc: 'Crater rim & central sea' },
  { id: 'peninsula', label: 'Coastal Peninsula', desc: 'Headland harbor & rolling hills' },
];

const BATTLEMAP_THEMES: Array<{ id: BattlemapTheme; label: string; desc: string }> = [
  { id: 'stone-crypt', label: 'Stone Crypt & Vault', desc: 'Flagstone masonry & ritual inlay' },
  { id: 'harbor-tavern', label: 'Harbor Tavern / Deck', desc: 'Warm timber floorboards' },
  { id: 'obsidian-sanctum', label: 'Obsidian Sanctum', desc: 'Dark gilded basalt flagstones' },
  { id: 'forest-clearing', label: 'Woodland Ambush', desc: 'Mossy clearing & dirt trails' },
];

export const MapGeneratorModal: React.FC<{ targetMapId?: string }> = ({ targetMapId }) => {
  const {
    mapGeneratorModalOpen,
    mapGeneratorDefaultKind,
    mapGeneratorEditMapId,
    setMapGeneratorModalOpen,
    createCustom3DMap,
    regenerate3DMap,
    createBattlemap,
    updateMapMetadata,
    deleteMap,
    addAsset,
    maps,
    assets,
  } = useVaultStore();

  const editingMap = mapGeneratorEditMapId
    ? maps.find((m) => m.id === mapGeneratorEditMapId) || null
    : null;
  const existingMap =
    !editingMap && targetMapId
      ? maps.find((m) => m.id === targetMapId && m.kind !== '2d') || null
      : null;

  const [kind, setKind] = useState<'3d' | '2d'>(mapGeneratorDefaultKind);
  const [name, setName] = useState(existingMap ? existingMap.name : 'New Custom Realm');
  const [regenCurrent, setRegenCurrent] = useState(Boolean(existingMap));
  const [atmosphere, setAtmosphere] = useState<WorldAtmospherePreset>('golden-hour');

  const [config, setConfig] = useState<MapGenerationConfig>(
    existingMap?.generation_config || {
      seed: Math.floor(Math.random() * 9000) + 1000,
      archetype: 'peninsula',
      continentScale: 1.0,
      ridgeSharpness: 1.15,
      seaLevel: 0.24,
      valleyDepth: 0.45,
      riverCount: 1,
      treeDensity: 0.75,
      rockDensity: 0.55,
    }
  );

  // 2D Battlemap form state
  const [bmTheme, setBmTheme] = useState<BattlemapTheme>('stone-crypt');
  const [bmCols, setBmCols] = useState(20);
  const [bmRows, setBmRows] = useState(13);
  const [bmGridPx, setBmGridPx] = useState(64);
  const [bmAmbient, setBmAmbient] = useState(0.24);
  const [bmBgAsset, setBmBgAsset] = useState('');
  const [bmCustomUrl, setBmCustomUrl] = useState<string | null>(null);

  React.useEffect(() => {
    if (!mapGeneratorModalOpen) return;

    if (editingMap) {
      const editKind = editingMap.kind === '2d' ? '2d' : '3d';
      setKind(editKind);
      setName(editingMap.name);
      setRegenCurrent(false);
      setAtmosphere(editingMap.atmosphere || 'golden-hour');
      if (editingMap.generation_config) {
        setConfig(editingMap.generation_config);
      }
      if (editingMap.battlemap) {
        const bm = editingMap.battlemap;
        setBmTheme(bm.theme);
        setBmCols(Math.max(8, Math.round(bm.width / bm.gridSizePx)));
        setBmRows(Math.max(6, Math.round(bm.height / bm.gridSizePx)));
        setBmGridPx(bm.gridSizePx);
        setBmAmbient(bm.ambientLight);
        const matchedAsset = bm.backgroundUrl
          ? assets.find((a) => a.url === bm.backgroundUrl)
          : null;
        setBmBgAsset(matchedAsset?.id || '');
        setBmCustomUrl(
          bm.backgroundUrl && !bm.backgroundUrl.startsWith('data:image/png;base64,') && !matchedAsset
            ? bm.backgroundUrl
            : null
        );
      }
      return;
    }

    setKind(mapGeneratorDefaultKind);
    setRegenCurrent(Boolean(existingMap) && mapGeneratorDefaultKind === '3d');
    setName(
      mapGeneratorDefaultKind === '2d'
        ? 'Dungeon Encounter Map'
        : existingMap?.name || 'New Custom Realm'
    );
    setBmBgAsset('');
    setBmCustomUrl(null);
    setBmGridPx(64);
    setBmAmbient(0.24);
  }, [mapGeneratorModalOpen, mapGeneratorDefaultKind, existingMap, editingMap, assets]);

  if (!mapGeneratorModalOpen) return null;

  const handleUploadFloorImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadVaultAsset(file, 'maps');
    const cleanName = file.name.replace(/\.[^.]+$/, '');
    const created = addAsset({ name: cleanName, url, kind: 'map' });
    setBmBgAsset(created.id);
    setBmCustomUrl(url);
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const chosenAsset = assets.find((a) => a.id === bmBgAsset);
    const resolvedBg = chosenAsset?.url || bmCustomUrl || null;

    if (editingMap) {
      if (editingMap.kind === '2d' && editingMap.battlemap) {
        const nextW = bmCols * bmGridPx;
        const nextH = bmRows * bmGridPx;
        updateMapMetadata(editingMap.id, {
          name: name || editingMap.name,
          battlemap: {
            theme: bmTheme,
            width: nextW,
            height: nextH,
            gridSizePx: bmGridPx,
            ambientLight: bmAmbient,
            backgroundUrl: resolvedBg || undefined,
          },
          regenerateThemeFloor: !resolvedBg,
        });
      } else {
        updateMapMetadata(editingMap.id, {
          name: name || editingMap.name,
          atmosphere,
        });
      }
      return;
    }

    if (kind === '2d') {
      createBattlemap({
        name: name || 'Tactical Combat Map (2D)',
        theme: bmTheme,
        cols: bmCols,
        rows: bmRows,
        gridSizePx: bmGridPx,
        ambientLight: bmAmbient,
        backgroundUrl: resolvedBg,
      });
      return;
    }

    if (regenCurrent && existingMap) {
      regenerate3DMap(existingMap.id, config);
    } else {
      createCustom3DMap(name || 'Custom World Map', config);
    }
  };

  return (
    <div
      onClick={() => setMapGeneratorModalOpen(false)}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl dark-glass shadow-glass border border-[#d4a853]/40 overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-[#1d222b] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#eab308]" />
            <h3 className="font-serif text-base font-semibold text-[#f3ead8]">
              {editingMap ? `Edit Map: ${editingMap.name}` : 'Map Architect & Terrain Generator'}
            </h3>
          </div>
          <button
            onClick={() => setMapGeneratorModalOpen(false)}
            className="text-[#858d9b] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* 3D World Map vs 2D Tactical Combat Map Switch (creation only) */}
          {!editingMap && (
            <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[#0b0d10] border border-[#1d222b]">
              <button
                type="button"
                onClick={() => {
                  setKind('3d');
                  if (name === 'Dungeon Encounter Map') setName('New Custom Realm');
                }}
                className={`flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-all ${
                  kind === '3d'
                    ? 'bg-[#1c212b] text-[#f3d68a] border border-[#d4a853]/45'
                    : 'text-[#8b93a1] hover:text-white'
                }`}
              >
                <Mountain className="w-3.5 h-3.5" />
                <span>3D World Terrain Map</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setKind('2d');
                  setRegenCurrent(false);
                  if (name === 'New Custom Realm' || name === existingMap?.name) {
                    setName('Dungeon Encounter Map');
                  }
                }}
                className={`flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium transition-all ${
                  kind === '2d'
                    ? 'bg-[#1c212b] text-[#f3d68a] border border-[#d4a853]/45'
                    : 'text-[#8b93a1] hover:text-white'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>2D Tactical Combat Map</span>
              </button>
            </div>
          )}

          {/* Map Name + Optional Replace Current */}
          <div className="space-y-2">
            <label className="block text-[11px] text-[#9aa3b2]">Map Title</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#0b0d10] border border-[#242a35] rounded-md px-3 py-2 text-xs text-[#f3ead8] focus:outline-none focus:border-[#d4a853]"
            />
            {!editingMap && kind === '3d' && existingMap && (
              <label className="flex items-center gap-2 text-[11.5px] text-[#c9c3b8] pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={regenCurrent}
                  onChange={(e) => setRegenCurrent(e.target.checked)}
                  className="accent-[#d4a853]"
                />
                <span>Regenerate active map ({existingMap.name}) instead of creating a new tab</span>
              </label>
            )}
          </div>

          {editingMap && kind === '3d' ? (
            <div className="space-y-3 bg-[#0e1116] border border-[#1d222b] rounded-lg p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#e5be58]">
                <Sun className="w-3.5 h-3.5" />
                <span>3D Scene Atmosphere &amp; Lighting Preset</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['golden-hour', 'Golden Dusk'],
                    ['high-noon', 'High Noon'],
                    ['moonlit-night', 'Moonlit Vigil'],
                    ['crimson-eclipse', 'Blood Eclipse'],
                  ] as Array<[WorldAtmospherePreset, string]>
                ).map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAtmosphere(preset)}
                    className={`px-3 py-2 rounded-md border text-left text-xs transition-colors ${
                      atmosphere === preset
                        ? 'bg-[#1d1912] border-[#d4a853]/65 text-[#f3ead8]'
                        : 'bg-[#0b0d10] border-[#1d222b] text-[#9aa3b2] hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : kind === '3d' ? (
            <div className="space-y-4">
              {/* Archetype Grid */}
              <div>
                <label className="block text-[11px] text-[#9aa3b2] mb-1.5">World Archetype</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ARCHETYPES.map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => setConfig((c) => ({ ...c, archetype: a.id }))}
                      className={`text-left px-3 py-2 rounded-lg border transition-all ${
                        config.archetype === a.id
                          ? 'bg-[#1d1912] border-[#d4a853]/65 text-[#f3ead8]'
                          : 'bg-[#0e1116] border-[#1d222b] text-[#9aa3b2] hover:border-[#2c3444]'
                      }`}
                    >
                      <div className="text-xs font-semibold text-[#e6c478]">{a.label}</div>
                      <div className="text-[10.5px] text-[#838b9b]">{a.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Seed + Sliders */}
              <div className="grid grid-cols-2 gap-3 bg-[#0e1116] border border-[#1d222b] rounded-lg p-3.5">
                <div className="col-span-2 flex items-center justify-between gap-2 pb-2 border-b border-[#191f2a]">
                  <span className="text-xs text-[#c9c3b8]">Terrain Seed</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={config.seed}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, seed: parseInt(e.target.value, 10) || 1 }))
                      }
                      className="w-24 bg-[#0b0d10] border border-[#242a35] rounded px-2 py-1 font-mono text-xs text-[#f0cf85]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setConfig((c) => ({
                          ...c,
                          seed: Math.floor(Math.random() * 90000) + 1000,
                        }))
                      }
                      className="p-1.5 rounded bg-[#171b22] border border-[#2a3140] text-[#d4a853] hover:border-[#d4a853]"
                      title="Randomize Seed"
                    >
                      <Dices className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-[#9aa3b2]">
                    <span className="flex items-center gap-1">
                      <Mountain className="w-3 h-3 text-[#d4a853]" /> Ridge Sharpness
                    </span>
                    <span className="font-mono text-[#e5be58]">
                      {config.ridgeSharpness.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={1.8}
                    step={0.05}
                    value={config.ridgeSharpness}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, ridgeSharpness: parseFloat(e.target.value) }))
                    }
                    className="w-full accent-[#d4a853]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-[#9aa3b2]">
                    <span className="flex items-center gap-1">
                      <Waves className="w-3 h-3 text-sky-400" /> Sea Level
                    </span>
                    <span className="font-mono text-[#e5be58]">
                      {Math.round(config.seaLevel * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.08}
                    max={0.42}
                    step={0.01}
                    value={config.seaLevel}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, seaLevel: parseFloat(e.target.value) }))
                    }
                    className="w-full accent-[#d4a853]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-[#9aa3b2]">
                    <span>Valley Carving</span>
                    <span className="font-mono text-[#e5be58]">
                      {Math.round(config.valleyDepth * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.valleyDepth}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, valleyDepth: parseFloat(e.target.value) }))
                    }
                    className="w-full accent-[#d4a853]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-[#9aa3b2]">
                    <span>Auto Rivers</span>
                    <span className="font-mono text-[#e5be58]">{config.riverCount}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={4}
                    step={1}
                    value={config.riverCount}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, riverCount: parseInt(e.target.value, 10) }))
                    }
                    className="w-full accent-[#d4a853]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-[#9aa3b2]">
                    <span className="flex items-center gap-1">
                      <Trees className="w-3 h-3 text-emerald-400" /> Forest Density
                    </span>
                    <span className="font-mono text-[#e5be58]">
                      {Math.round(config.treeDensity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.treeDensity}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, treeDensity: parseFloat(e.target.value) }))
                    }
                    className="w-full accent-[#d4a853]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-[#9aa3b2]">
                    <span>Boulder Scatter</span>
                    <span className="font-mono text-[#e5be58]">
                      {Math.round(config.rockDensity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.rockDensity}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, rockDensity: parseFloat(e.target.value) }))
                    }
                    className="w-full accent-[#d4a853]"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] text-[#9aa3b2] mb-1.5">
                  Tactical Floor Theme
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {BATTLEMAP_THEMES.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setBmTheme(t.id)}
                      className={`text-left px-3 py-2 rounded-lg border transition-all ${
                        bmTheme === t.id
                          ? 'bg-[#1d1912] border-[#d4a853]/65 text-[#f3ead8]'
                          : 'bg-[#0e1116] border-[#1d222b] text-[#9aa3b2] hover:border-[#2c3444]'
                      }`}
                    >
                      <div className="text-xs font-semibold text-[#e6c478]">{t.label}</div>
                      <div className="text-[10.5px] text-[#838b9b]">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-[#9aa3b2] mb-1">
                    Columns (5ft)
                  </label>
                  <input
                    type="number"
                    min={8}
                    max={48}
                    value={bmCols}
                    onChange={(e) => setBmCols(parseInt(e.target.value, 10) || 20)}
                    className="w-full bg-[#0b0d10] border border-[#242a35] rounded px-3 py-1.5 font-mono text-xs text-[#e7e2d8]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9aa3b2] mb-1">
                    Rows (5ft)
                  </label>
                  <input
                    type="number"
                    min={6}
                    max={36}
                    value={bmRows}
                    onChange={(e) => setBmRows(parseInt(e.target.value, 10) || 13)}
                    className="w-full bg-[#0b0d10] border border-[#242a35] rounded px-3 py-1.5 font-mono text-xs text-[#e7e2d8]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9aa3b2] mb-1">
                    Cell Size (px)
                  </label>
                  <input
                    type="number"
                    min={40}
                    max={96}
                    step={8}
                    value={bmGridPx}
                    onChange={(e) => setBmGridPx(parseInt(e.target.value, 10) || 64)}
                    className="w-full bg-[#0b0d10] border border-[#242a35] rounded px-3 py-1.5 font-mono text-xs text-[#e7e2d8]"
                  />
                </div>
              </div>

              {/* Ambient Darkness Preset */}
              <div>
                <div className="flex justify-between text-[11px] text-[#9aa3b2] mb-1">
                  <span className="flex items-center gap-1">
                    <Sun className="w-3 h-3 text-[#d4a853]" /> Starting Ambient Light
                  </span>
                  <span className="font-mono text-[#e5be58]">{Math.round(bmAmbient * 100)}%</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      [0.08, 'Pitch Dark'],
                      [0.24, 'Dim Vault'],
                      [0.55, 'Dusk'],
                      [0.95, 'Daylight'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setBmAmbient(val)}
                      className={`py-1.5 rounded text-[11px] border transition-colors ${
                        Math.abs(bmAmbient - val) < 0.08
                          ? 'bg-[#1d1912] border-[#d4a853]/65 text-[#f3d68a]'
                          : 'bg-[#0e1116] border-[#1d222b] text-[#9aa3b2] hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] text-[#9aa3b2]">
                    Backdrop Floor Image (Vault Asset or Upload)
                  </label>
                  <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#171c25] hover:bg-[#232a36] border border-[#2a3242] text-[10.5px] text-[#e5be58] cursor-pointer">
                    <Upload className="w-3 h-3" />
                    <span>Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadFloorImage}
                      className="hidden"
                    />
                  </label>
                </div>
                <select
                  value={bmBgAsset}
                  onChange={(e) => {
                    setBmBgAsset(e.target.value);
                    setBmCustomUrl(null);
                  }}
                  className="w-full bg-[#0b0d10] border border-[#242a35] rounded px-2.5 py-2 text-xs text-[#e7e2d8]"
                >
                  <option value="">Use Procedural Floor Theme</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (asset://{a.slug})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between gap-2">
            <div>
              {editingMap && maps.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    deleteMap(editingMap.id);
                    setMapGeneratorModalOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-md bg-red-950/40 hover:bg-red-900/50 border border-red-500/40 text-xs text-red-200 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Map</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMapGeneratorModalOpen(false)}
                className="px-3.5 py-1.5 rounded-md bg-[#161a22] text-xs text-[#b8b3a8] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-gold-metallic px-4 py-1.5 rounded-md text-xs font-semibold"
              >
                {editingMap
                  ? 'Save Scene Settings'
                  : kind === '2d'
                  ? 'Create 2D Combat Map'
                  : regenCurrent
                  ? 'Regenerate & Sculpt'
                  : 'Generate & Shape Map'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
