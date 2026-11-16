import {
  BiomePaintKind,
  FogVolume,
  TerrainShadingSettings,
  TerrainStampKind,
  VaultMap,
  WaterSettings,
} from '../types/vault';
import { SEA_LEVEL_NORM, TERRAIN_SIZE } from './terrainGenerator';

/* -------------------------------------------------------------------------- */
/*                               World sizing                                 */
/* -------------------------------------------------------------------------- */

export const WORLD_SIZE_PRESETS: Array<{ size: number; label: string; desc: string }> = [
  { size: 100, label: 'Classic', desc: '100 × 100 u' },
  { size: 150, label: 'Large', desc: '150 × 150 u' },
  { size: 200, label: 'Huge', desc: '200 × 200 u' },
  { size: 300, label: 'Vast', desc: '300 × 300 u' },
];

/** Default world edge length used for new maps and the seeded demo world. */
export const DEFAULT_NEW_WORLD_SIZE = 200;

export function getWorldSize(map: Pick<VaultMap, 'world_size'> | null | undefined): number {
  const s = map?.world_size;
  return s && Number.isFinite(s) && s >= 40 ? s : TERRAIN_SIZE;
}

export function getSeaLevelNorm(
  map: Pick<VaultMap, 'sea_level' | 'generation_config'> | null | undefined
): number {
  if (map?.sea_level !== undefined && map.sea_level !== null && Number.isFinite(map.sea_level)) {
    return map.sea_level;
  }
  return map?.generation_config?.seaLevel ?? SEA_LEVEL_NORM;
}

/** Heightfield resolution for a given world size (~5 samples per unit, capped at 1024). */
export function heightResForWorldSize(size: number): number {
  if (size <= 100) return 512;
  if (size <= 150) return 768;
  return 1024;
}

/** Terrain mesh segment count for a given world size (keeps ~2.4 verts / unit, capped). */
export function terrainSegmentsForWorldSize(size: number): number {
  return Math.min(512, Math.max(240, Math.round(size * 2.4)));
}

/* -------------------------------------------------------------------------- */
/*                                  Water                                     */
/* -------------------------------------------------------------------------- */

export const DEFAULT_WATER_SETTINGS: WaterSettings = {
  waveHeight: 1,
  waveScale: 1,
  waveSpeed: 1,
  windDirection: 35,
  choppiness: 0.55,
  foamAmount: 1,
  shoreWaves: 1,
  clarity: 0.6,
  deepColor: null,
  shallowColor: null,
};

export function resolveWaterSettings(map: Pick<VaultMap, 'water'> | null | undefined): WaterSettings {
  return { ...DEFAULT_WATER_SETTINGS, ...(map?.water || {}) };
}

export const WATER_PRESETS: Array<{ id: string; label: string; settings: Partial<WaterSettings> }> = [
  { id: 'calm', label: 'Calm Lagoon', settings: { waveHeight: 0.35, choppiness: 0.25, foamAmount: 0.45, shoreWaves: 0.6, clarity: 0.9, waveSpeed: 0.7 } },
  { id: 'default', label: 'Coastal Swell', settings: { waveHeight: 1, choppiness: 0.55, foamAmount: 1, shoreWaves: 1, clarity: 0.6, waveSpeed: 1 } },
  { id: 'storm', label: 'Storm Sea', settings: { waveHeight: 1.9, choppiness: 0.9, foamAmount: 1.8, shoreWaves: 1.7, clarity: 0.25, waveSpeed: 1.6, waveScale: 1.5 } },
  { id: 'tropical', label: 'Tropical Shoals', settings: { waveHeight: 0.6, choppiness: 0.4, foamAmount: 0.8, shoreWaves: 1.1, clarity: 1, deepColor: '#0a4a6e', shallowColor: '#3fd0c9' } },
  { id: 'murky', label: 'Murky Bog Water', settings: { waveHeight: 0.15, choppiness: 0.1, foamAmount: 0.2, shoreWaves: 0.2, clarity: 0.05, deepColor: '#16200f', shallowColor: '#4a5a2a', waveSpeed: 0.4 } },
];

/* -------------------------------------------------------------------------- */
/*                             Terrain shading                                */
/* -------------------------------------------------------------------------- */

export const DEFAULT_TERRAIN_SHADING: TerrainShadingSettings = {
  snowLine: 0.66,
  aridity: 0.3,
  beachWidth: 0.5,
  vegetationHue: 0,
  albedoBlend: 0,
  colorRichness: 1.15,
  rockContrast: 1.1,
  lushness: 1.0,
};

export function resolveTerrainShading(
  map: Pick<VaultMap, 'terrain_shading'> | null | undefined
): TerrainShadingSettings {
  return { ...DEFAULT_TERRAIN_SHADING, ...(map?.terrain_shading || {}) };
}

/* -------------------------------------------------------------------------- */
/*                              Biome painting                                */
/* -------------------------------------------------------------------------- */

export const BIOME_PAINT_PALETTE: Array<{ kind: BiomePaintKind; label: string; color: string }> = [
  { kind: 'grass', label: 'Grassland', color: '#5e8f3a' },
  { kind: 'forest', label: 'Deep Forest', color: '#2b4d26' },
  { kind: 'meadow', label: 'Flower Meadow', color: '#93a648' },
  { kind: 'savanna', label: 'Savanna', color: '#b59a4f' },
  { kind: 'sand', label: 'Beach Sand', color: '#d8c38f' },
  { kind: 'desert', label: 'Desert Dunes', color: '#d29a58' },
  { kind: 'swamp', label: 'Swamp & Bog', color: '#4b5530' },
  { kind: 'tundra', label: 'Tundra', color: '#8a8a6c' },
  { kind: 'rock', label: 'Bare Rock', color: '#6f6a66' },
  { kind: 'snow', label: 'Snow & Ice', color: '#eef3f8' },
  { kind: 'volcanic', label: 'Volcanic Ash', color: '#2a2524' },
  { kind: 'autumn', label: 'Autumn Woods', color: '#b8612a' },
  { kind: 'crimson', label: 'Blighted Crimson', color: '#7d1f2c' },
  { kind: 'arcane', label: 'Arcane Glade', color: '#5f4fb3' },
  { kind: 'erase', label: 'Erase Paint', color: '#000000' },
];

export const TERRAIN_STAMPS: Array<{ kind: TerrainStampKind; label: string; desc: string }> = [
  { kind: 'mountain', label: 'Mountain', desc: 'Jagged ridged peak' },
  { kind: 'volcano', label: 'Volcano', desc: 'Cone with summit crater' },
  { kind: 'crater', label: 'Crater', desc: 'Impact bowl with rim' },
  { kind: 'mesa', label: 'Mesa', desc: 'Flat-topped butte' },
  { kind: 'island', label: 'Island', desc: 'Raise land from the sea' },
  { kind: 'lake', label: 'Lake Basin', desc: 'Sink below sea level' },
  { kind: 'canyon', label: 'Canyon', desc: 'Deep linear gorge' },
];

/* -------------------------------------------------------------------------- */
/*                               Fog volumes                                  */
/* -------------------------------------------------------------------------- */

export type FogPresetId = 'valley-mist' | 'sea-fog' | 'swamp-miasma' | 'cursed-shroud' | 'volcanic-ash' | 'sacred-glow';

export const FOG_VOLUME_PRESETS: Array<{ id: FogPresetId; label: string; settings: Partial<FogVolume> }> = [
  {
    id: 'valley-mist',
    label: 'Valley Mist',
    settings: { color: '#c9d4e0', density: 0.7, heightFalloff: 0.75, noiseScale: 1, noiseStrength: 0.55, windSpeed: 0.4, glow: 0, lightScattering: 0.6, edgeSoftness: 0.6, height: 5 },
  },
  {
    id: 'sea-fog',
    label: 'Sea Fog Bank',
    settings: { color: '#b4c3cc', density: 0.85, heightFalloff: 0.5, noiseScale: 0.7, noiseStrength: 0.65, windSpeed: 0.9, glow: 0, lightScattering: 0.7, edgeSoftness: 0.7, height: 6 },
  },
  {
    id: 'swamp-miasma',
    label: 'Swamp Miasma',
    settings: { color: '#8fa25a', density: 1.0, heightFalloff: 0.85, noiseScale: 1.6, noiseStrength: 0.75, windSpeed: 0.25, glow: 0.15, lightScattering: 0.3, edgeSoftness: 0.55, height: 4 },
  },
  {
    id: 'cursed-shroud',
    label: 'Cursed Shroud',
    settings: { color: '#7a4fb8', density: 1.1, heightFalloff: 0.4, noiseScale: 1.3, noiseStrength: 0.85, windSpeed: 0.7, glow: 0.55, lightScattering: 0.2, edgeSoftness: 0.5, height: 8 },
  },
  {
    id: 'volcanic-ash',
    label: 'Volcanic Ash',
    settings: { color: '#4a3c36', density: 1.2, heightFalloff: 0.2, noiseScale: 0.9, noiseStrength: 0.8, windSpeed: 1.4, glow: 0.25, lightScattering: 0.25, edgeSoftness: 0.45, height: 12 },
  },
  {
    id: 'sacred-glow',
    label: 'Sacred Glow',
    settings: { color: '#f3d48a', density: 0.55, heightFalloff: 0.6, noiseScale: 1.1, noiseStrength: 0.5, windSpeed: 0.3, glow: 0.9, lightScattering: 0.9, edgeSoftness: 0.8, height: 6 },
  },
];

export function createFogVolume(
  at: { x: number; y: number; z: number },
  presetId: FogPresetId = 'valley-mist',
  overrides: Partial<FogVolume> = {}
): FogVolume {
  const preset = FOG_VOLUME_PRESETS.find((p) => p.id === presetId) || FOG_VOLUME_PRESETS[0];
  const base: FogVolume = {
    id: `fog-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
    name: preset.label,
    shape: 'box',
    x: at.x,
    y: at.y - 1.5,
    z: at.z,
    width: 18,
    depth: 18,
    height: 5,
    rotY: 0,
    color: '#c9d4e0',
    density: 0.7,
    edgeSoftness: 0.6,
    heightFalloff: 0.7,
    noiseScale: 1,
    noiseStrength: 0.55,
    windSpeed: 0.4,
    windDirection: 30,
    glow: 0,
    lightScattering: 0.6,
    visible: true,
    is_gm_only: false,
  };
  return { ...base, ...preset.settings, ...overrides };
}
