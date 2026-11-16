import { create } from 'zustand';
import { buildSeedDataset } from '../data/seedData';
import { DEFAULT_TEMPLATES } from '../data/templates';
import {
  createBlankBattlemap,
  createSeededSmugglerVaultsBattlemap,
  generateBattlemapFloorUrl,
} from '../lib/battlemapGenerator';
import {
  clearStoredVaultToken,
  getSupabaseClient,
  getVaultSyncTopic,
  isSupabaseConfigured,
  verifyStoredVaultToken,
} from '../lib/supabase';
import { generateCustomTerrain } from '../lib/terrainEditorEngine';
import { generateEntityArtwork } from '../lib/terrainGenerator';
import { createDefaultWorldLayers } from '../lib/worldLayers';
import {
  DEFAULT_NEW_WORLD_SIZE,
  DEFAULT_TERRAIN_SHADING,
  DEFAULT_WATER_SETTINGS,
  FogPresetId,
  createFogVolume,
  heightResForWorldSize,
} from '../lib/worldEnvironment';
import { computeEntityLinksForSource, slugify } from '../lib/wikilinks';
import {
  AssetKind,
  BattlemapData,
  BattlemapDoor,
  BattlemapLight,
  BattlemapProp,
  BattlemapTheme,
  BattlemapToken,
  BattlemapToolMode,
  BattlemapWall,
  BiomePaintKind,
  BrushFalloff,
  EditorMode,
  Entity,
  EntityCategory,
  EntityLink,
  EntityTemplate,
  EntityType,
  FogVolume,
  InspectorSubTab,
  MapCameraView,
  MapGenerationConfig,
  MapKind,
  MapLayerVisibility,
  MapPath,
  MapPathStyle,
  MapPin,
  MapProp,
  MapPropKind,
  MapRenderMode,
  MapRiver,
  MapToolMode,
  PathPoint,
  PinIconType,
  TabItem,
  TerrainCommand,
  TerrainShadingSettings,
  TerrainStampKind,
  VaultAsset,
  VaultMap,
  WaterSettings,
  World,
  WorldAtmospherePreset,
  WorldLayerCategory,
  WorldMapLabel,
  WorldMapLayer,
  WorldMapZone,
  WorldsmithTool,
  ZoneBorderStyle,
} from '../types/vault';

interface HistorySnapshot {
  entities: Entity[];
  entityLinks: EntityLink[];
  mapPins: MapPin[];
  mapPaths: MapPath[];
  maps: VaultMap[];
}

export type SyncStatus = 'demo' | 'connecting' | 'synced' | 'syncing' | 'error';

interface VaultState {
  // Core Data
  world: World;
  entities: Entity[];
  entityLinks: EntityLink[];
  maps: VaultMap[];
  mapPins: MapPin[];
  mapPaths: MapPath[];
  assets: VaultAsset[];
  templates: Record<EntityType, EntityTemplate>;

  // Auth & Realtime
  isAuthenticated: boolean;
  userEmail: string | null;
  syncStatus: SyncStatus;
  lastSyncError: string | null;

  // Navigation & Tabs
  tabs: TabItem[];
  activeTabId: string;
  splitPaneTabId: string | null;
  editorMode: EditorMode;
  inspectorSubTab: InspectorSubTab;
  leftNavOpen: boolean;
  leftNavSection: 'vault' | 'assets' | 'templates';
  rightInspectorCollapsed: boolean;
  gmMode: boolean;
  leftFilterQuery: string;
  selectedSidebarFilter: string | null; // e.g. 'all' | 'favorites' | 'recent' | EntityType

  // Map Viewport State
  mapRenderMode: MapRenderMode;
  mapCameraView: MapCameraView;
  mapToolMode: MapToolMode;
  mapLayers: MapLayerVisibility;
  selectedPinId: string | null;
  hoveredPinId: string | null;
  selectedZoneId: string | null;
  selectedLabelId: string | null;
  activeZoneLayerId: string;
  pendingPinCoord: PathPoint | null;
  drawingPoints: PathPoint[];
  cameraResetSignal: number;
  cameraTopViewSignal: number;
  cameraZoomSignal: { delta: number; seq: number };
  zoneTransformSignal: { action: 'rotate' | 'scale' | 'snap'; value: number; seq: number };
  scaleBarKm: number;

  // 3D Worldsmith Editor State
  worldsmithMode: boolean;
  worldsmithTool: WorldsmithTool;
  brushRadius: number;
  brushStrength: number;
  brushFalloff: BrushFalloff;
  terraceSteps: number;
  activeStampKind: TerrainStampKind;
  activeBiomePaint: BiomePaintKind;
  activePropKind: MapPropKind;
  selectedPropId: string | null;
  selectedFogId: string | null;
  activeFogPreset: FogPresetId;
  terrainCommandSignal: { seq: number; cmd: TerrainCommand | null };
  riverDrawingPoints: PathPoint[];
  mapGeneratorModalOpen: boolean;
  mapGeneratorDefaultKind: MapKind;
  mapGeneratorEditMapId: string | null;

  // 2D Battlemap State
  battlemapMode: 'play' | 'prep';
  battlemapTool: BattlemapToolMode;
  selectedTokenId: string | null;
  selectedDoorId: string | null;
  selectedLightId: string | null;
  selectedPropId2D: string | null;
  snapToGrid: boolean;

  // Modals
  commandPaletteOpen: boolean;
  authModalOpen: boolean;
  settingsModalOpen: boolean;
  newEntryModalOpen: boolean;
  newEntryDefaultType: EntityType;
  newEntryDefaultCategory: EntityCategory;

  // History
  past: HistorySnapshot[];
  future: HistorySnapshot[];

  // Actions
  setGmMode: (val: boolean) => void;
  setEditorMode: (mode: EditorMode) => void;
  setInspectorSubTab: (tab: InspectorSubTab) => void;
  setLeftNavOpen: (open: boolean) => void;
  toggleLeftNav: () => void;
  setLeftNavSection: (section: 'vault' | 'assets' | 'templates') => void;
  setRightInspectorCollapsed: (collapsed: boolean) => void;
  toggleRightInspector: () => void;
  setMapRenderMode: (mode: MapRenderMode) => void;
  setMapCameraView: (view: MapCameraView) => void;
  setMapToolMode: (mode: MapToolMode) => void;
  toggleMapLayer: (layer: keyof MapLayerVisibility) => void;
  setSelectedPinId: (id: string | null) => void;
  setHoveredPinId: (id: string | null) => void;
  setSelectedZoneId: (id: string | null) => void;
  setSelectedLabelId: (id: string | null) => void;
  setActiveZoneLayerId: (layerId: string) => void;
  setPendingPinCoord: (pt: PathPoint | null) => void;
  addDrawingPoint: (pt: PathPoint) => void;
  popDrawingPoint: () => void;
  clearDrawingPoints: () => void;
  finishDrawingPath: (name: string, isRegion: boolean, isGmOnly?: boolean) => Promise<void>;
  triggerCameraReset: () => void;
  triggerTopView: () => void;
  triggerCameraZoom: (delta: number) => void;
  dispatchZoneTransform: (action: 'rotate' | 'scale' | 'snap', value?: number) => void;
  setScaleBarKm: (km: number) => void;

  // World Layers, Zones (Countries/Regions/Religions) & Text Labels
  addWorldLayer: (
    mapId: string,
    payload: { name: string; category: WorldLayerCategory; color: string; opacity?: number }
  ) => WorldMapLayer;
  updateWorldLayer: (mapId: string, layerId: string, patch: Partial<WorldMapLayer>) => void;
  deleteWorldLayer: (mapId: string, layerId: string) => void;
  toggleWorldLayer: (mapId: string, layerId: string) => void;
  soloWorldLayer: (mapId: string, layerId: string | null) => void;
  createMapZone: (
    mapId: string,
    payload: {
      layerId: string;
      name: string;
      points: PathPoint[];
      color: string;
      borderStyle?: ZoneBorderStyle;
      fillOpacity?: number;
      showLabel?: boolean;
      entityId?: string | null;
      is_gm_only?: boolean;
    }
  ) => WorldMapZone;
  updateMapZone: (mapId: string, zoneId: string, patch: Partial<WorldMapZone>) => void;
  deleteMapZone: (mapId: string, zoneId: string) => void;
  createMapLabel: (
    mapId: string,
    payload: Omit<WorldMapLabel, 'id'>
  ) => WorldMapLabel;
  updateMapLabel: (mapId: string, labelId: string, patch: Partial<WorldMapLabel>) => void;
  deleteMapLabel: (mapId: string, labelId: string) => void;

  setCommandPaletteOpen: (open: boolean) => void;
  setAuthModalOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
  openNewEntryModal: (defaultType?: EntityType, defaultCategory?: EntityCategory) => void;
  closeNewEntryModal: () => void;
  setSelectedSidebarFilter: (filter: string | null) => void;

  // Tabs
  setActiveTab: (tabId: string) => void;
  openEntityTab: (entityId: string, inSplit?: boolean) => void;
  openEntityByTitle: (titleOrSlug: string) => void;
  openMapTab: (mapId: string) => void;
  openAssetTab: (assetId: string) => void;
  openTemplateTab: (type: EntityType) => void;
  closeTab: (tabId: string) => void;
  toggleSplitPane: () => void;

  // Data CRUD
  createEntity: (payload: {
    title: string;
    type: EntityType;
    category: EntityCategory;
    summary?: string;
    content?: string;
    gm_secrets?: string;
    tags?: string[];
    metadata?: Record<string, string | number | boolean>;
    cover_image_url?: string | null;
    useTemplate?: boolean;
  }) => Promise<Entity>;
  updateEntity: (id: string, patch: Partial<Entity>) => void;
  deleteEntity: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => void;

  // Assets & Templates
  addAsset: (payload: { name: string; url: string; kind?: AssetKind }) => VaultAsset;
  updateAsset: (id: string, patch: Partial<VaultAsset>) => void;
  deleteAsset: (id: string) => void;
  attachAssetToEntity: (
    entityId: string,
    assetId: string,
    role: 'cover' | 'background' | 'inline',
    opacity?: number
  ) => void;
  updateTemplate: (type: EntityType, patch: Partial<EntityTemplate>) => void;
  resetTemplate: (type: EntityType) => void;

  createMapPin: (payload: {
    map_id: string;
    entity_id: string | null;
    label: string;
    x: number;
    y: number;
    z: number;
    icon_type: PinIconType;
    is_gm_only: boolean;
  }) => Promise<MapPin>;
  linkPinToEntity: (pinId: string, entityId: string) => Promise<void>;
  deleteMapPin: (pinId: string) => Promise<void>;
  deleteMapPath: (pathId: string) => Promise<void>;
  updateMapAssets: (mapId: string, patch: Partial<VaultMap>) => Promise<void>;

  // 3D Worldsmith Actions
  setWorldsmithMode: (on: boolean) => void;
  setWorldsmithTool: (tool: WorldsmithTool) => void;
  setBrushRadius: (r: number) => void;
  setBrushStrength: (s: number) => void;
  setBrushFalloff: (f: BrushFalloff) => void;
  setTerraceSteps: (steps: number) => void;
  setActiveStampKind: (kind: TerrainStampKind) => void;
  setActiveBiomePaint: (kind: BiomePaintKind) => void;
  setActivePropKind: (k: MapPropKind) => void;
  setSelectedPropId: (id: string | null) => void;
  setSelectedFogId: (id: string | null) => void;
  setActiveFogPreset: (preset: FogPresetId) => void;
  dispatchTerrainCommand: (cmd: TerrainCommand) => void;
  addFogVolume: (
    mapId: string,
    at: { x: number; y: number; z: number },
    preset?: FogPresetId,
    overrides?: Partial<FogVolume>
  ) => FogVolume;
  updateFogVolume: (mapId: string, fogId: string, patch: Partial<FogVolume>) => void;
  deleteFogVolume: (mapId: string, fogId: string) => void;
  updateMapEnvironment: (
    mapId: string,
    patch: {
      world_size?: number;
      sea_level?: number;
      displacement_scale?: number;
      water?: Partial<WaterSettings>;
      terrain_shading?: Partial<TerrainShadingSettings>;
      paint_url?: string | null;
    }
  ) => void;
  addRiverPoint: (pt: PathPoint) => void;
  clearRiverPoints: () => void;
  finishRiver: (mapId: string, name: string, width: number, depth: number) => void;
  deleteRiver: (mapId: string, riverId: string) => void;
  addMapProp: (mapId: string, prop: Omit<MapProp, 'id'>) => MapProp;
  updateMapProp: (mapId: string, propId: string, patch: Partial<MapProp>) => void;
  deleteMapProp: (mapId: string, propId: string) => void;
  setMapGeneratorModalOpen: (open: boolean, kind?: MapKind, editMapId?: string | null) => void;
  createCustom3DMap: (name: string, config: MapGenerationConfig) => VaultMap;
  regenerate3DMap: (mapId: string, config: MapGenerationConfig) => void;
  updateMapMetadata: (
    mapId: string,
    patch: {
      name?: string;
      atmosphere?: WorldAtmospherePreset;
      battlemap?: Partial<BattlemapData>;
      regenerateThemeFloor?: boolean;
    }
  ) => void;
  deleteMap: (mapId: string) => void;

  // 2D Battlemap Actions
  createBattlemap: (payload: {
    name: string;
    theme: BattlemapTheme;
    cols?: number;
    rows?: number;
    gridSizePx?: number;
    ambientLight?: number;
    backgroundUrl?: string | null;
  }) => VaultMap;
  setBattlemapMode: (mode: 'play' | 'prep') => void;
  setBattlemapTool: (tool: BattlemapToolMode) => void;
  setSelectedTokenId: (id: string | null) => void;
  setSelectedDoorId: (id: string | null) => void;
  setSelectedLightId: (id: string | null) => void;
  setSelectedPropId2D: (id: string | null) => void;
  setSnapToGrid: (snap: boolean) => void;
  updateBattlemap: (mapId: string, updater: (bm: BattlemapData) => BattlemapData) => void;
  toggleBattlemapDoor: (mapId: string, doorId: string) => void;
  toggleBattlemapDoorLock: (mapId: string, doorId: string) => void;
  toggleBattlemapLight: (mapId: string, lightId: string) => void;
  addBattlemapToken: (mapId: string, token: Omit<BattlemapToken, 'id'>) => BattlemapToken;
  updateBattlemapToken: (mapId: string, tokenId: string, patch: Partial<BattlemapToken>) => void;
  deleteBattlemapToken: (mapId: string, tokenId: string) => void;
  addBattlemapWall: (mapId: string, wall: Omit<BattlemapWall, 'id'>) => void;
  deleteBattlemapWall: (mapId: string, wallId: string) => void;
  addBattlemapDoor: (mapId: string, door: Omit<BattlemapDoor, 'id'>) => void;
  deleteBattlemapDoor: (mapId: string, doorId: string) => void;
  addBattlemapLight: (mapId: string, light: Omit<BattlemapLight, 'id'>) => void;
  deleteBattlemapLight: (mapId: string, lightId: string) => void;
  addBattlemapProp: (mapId: string, prop: Omit<BattlemapProp, 'id'>) => BattlemapProp;
  updateBattlemapProp: (mapId: string, propId: string, patch: Partial<BattlemapProp>) => void;
  deleteBattlemapProp: (mapId: string, propId: string) => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;

  // Supabase Lifecycle
  initSupabaseSync: () => Promise<void>;
  syncFromSupabase: () => Promise<void>;
  seedSupabaseWorld: () => Promise<void>;
  signOutVault: () => Promise<void>;
}

const seed = buildSeedDataset();
const CLIENT_INSTANCE_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random()}`;
const entitySyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const mapSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
let broadcastSyncDebounce: ReturnType<typeof setTimeout> | null = null;
const ASSETS_STORAGE_KEY = 'aethelgard_vault_assets_v1';
const TEMPLATES_STORAGE_KEY = 'aethelgard_vault_templates_v1';
const MAPS_STORAGE_KEY = 'aethelgard_vault_maps_v1';
const LOCAL_VAULT_STORAGE_KEY = 'aethelgard_vault_local_data_v1';

function broadcastVaultChange(reason: string) {
  if (!realtimeChannel) return;
  realtimeChannel.send({
    type: 'broadcast',
    event: 'vault-changed',
    payload: { senderId: CLIENT_INSTANCE_ID, reason, ts: Date.now() },
  });
}

function normalizeMapOverlay(m: VaultMap, fallbackSeed?: VaultMap): VaultMap {
  if (m.kind === '2d') return m;
  const scaleCfg = (m.scale_config || {}) as VaultMap['scale_config'] & {
    _overlay?: {
      layers?: WorldMapLayer[];
      zones?: WorldMapZone[];
      labels?: WorldMapLabel[];
      world_size?: number;
      sea_level?: number;
      paint_url?: string | null;
      water?: WaterSettings;
      terrain_shading?: TerrainShadingSettings;
      fog_volumes?: FogVolume[];
    };
  };
  const packed = scaleCfg._overlay;
  const layers =
    m.layers && m.layers.length > 0
      ? m.layers
      : packed?.layers && packed.layers.length > 0
      ? packed.layers
      : fallbackSeed?.layers && fallbackSeed.layers.length > 0
      ? fallbackSeed.layers
      : createDefaultWorldLayers();
  const zones = m.zones ?? packed?.zones ?? fallbackSeed?.zones ?? [];
  const labels = m.labels ?? packed?.labels ?? fallbackSeed?.labels ?? [];
  const props =
    m.props && m.props.length > 0
      ? m.props
      : m.props !== undefined
      ? m.props
      : fallbackSeed?.props ?? [];

  // Upgrade legacy cached demo map that didn't have world_size yet so returning users see the expanded 200x200 world & fog volumes
  const isLegacyDemoUpgrade =
    Boolean(fallbackSeed?.world_size) && !m.world_size && !packed?.world_size;

  const world_size = m.world_size ?? packed?.world_size ?? fallbackSeed?.world_size;
  const sea_level = m.sea_level ?? packed?.sea_level ?? fallbackSeed?.sea_level;
  const paint_url = m.paint_url ?? packed?.paint_url ?? fallbackSeed?.paint_url ?? null;
  const water = m.water ?? packed?.water ?? fallbackSeed?.water;
  const terrain_shading =
    m.terrain_shading ?? packed?.terrain_shading ?? fallbackSeed?.terrain_shading;
  const fog_volumes =
    m.fog_volumes ?? packed?.fog_volumes ?? fallbackSeed?.fog_volumes ?? [];

  return {
    ...m,
    kind: m.kind || '3d',
    heightmap_url:
      isLegacyDemoUpgrade && fallbackSeed?.heightmap_url
        ? fallbackSeed.heightmap_url
        : m.heightmap_url,
    albedo_url:
      isLegacyDemoUpgrade && fallbackSeed?.albedo_url
        ? fallbackSeed.albedo_url
        : m.albedo_url,
    world_size,
    sea_level,
    paint_url,
    water,
    terrain_shading,
    fog_volumes,
    rivers: m.rivers || [],
    props,
    layers,
    zones,
    labels,
  };
}

function serializeMapRow(m: VaultMap, packOverlayInScaleConfig = false) {
  const cleanScale = { ...(m.scale_config || { ratio: '1 : 250 000', elevationSource: 'Heightmap', kmPerUnit: 1.6 }) } as Record<string, unknown>;
  const existingOverlay = (cleanScale._overlay && typeof cleanScale._overlay === 'object'
    ? cleanScale._overlay
    : {}) as Record<string, unknown>;

  const envOverlay: Record<string, unknown> = {
    ...existingOverlay,
    world_size: m.world_size,
    sea_level: m.sea_level,
    paint_url: m.paint_url ?? null,
    water: m.water,
    terrain_shading: m.terrain_shading,
    fog_volumes: m.fog_volumes ?? [],
  };

  if (packOverlayInScaleConfig) {
    cleanScale._overlay = {
      ...envOverlay,
      layers: m.layers ?? [],
      zones: m.zones ?? [],
      labels: m.labels ?? [],
    };
  } else {
    cleanScale._overlay = envOverlay;
  }

  const base = {
    id: m.id,
    world_id: m.world_id,
    name: m.name,
    kind: m.kind || '3d',
    albedo_url: m.albedo_url ?? null,
    heightmap_url: m.heightmap_url ?? null,
    width: m.width,
    height: m.height,
    displacement_scale: m.displacement_scale,
    scale_config: cleanScale,
    generation_config: m.generation_config ?? null,
    atmosphere: m.atmosphere ?? null,
    rivers: m.rivers ?? [],
    props: m.props ?? [],
    battlemap: m.battlemap ?? null,
  };

  if (packOverlayInScaleConfig) {
    return base;
  }

  return {
    ...base,
    layers: m.layers ?? [],
    zones: m.zones ?? [],
    labels: m.labels ?? [],
  };
}

function serializeTemplateRow(worldId: string, tpl: EntityTemplate) {
  return {
    world_id: worldId,
    type: tpl.type,
    label: tpl.label,
    summary_placeholder: tpl.summaryPlaceholder,
    default_tags: tpl.defaultTags,
    metadata: tpl.metadata,
    content: tpl.content,
    custom_css: tpl.customCss,
    updated_at: new Date().toISOString(),
  };
}

function scheduleMapSync(
  mapId: string,
  getState: () => VaultState,
  setState: (partial: Partial<VaultState>) => void
) {
  const client = getSupabaseClient();
  const state = getState();
  if (!client || !state.isAuthenticated) return;

  const existing = mapSyncTimers.get(mapId);
  if (existing) clearTimeout(existing);
  setState({ syncStatus: 'syncing' });
  const timer = setTimeout(async () => {
    const latestMap = getState().maps.find((m) => m.id === mapId);
    if (!latestMap) return;
    let { error } = await client.from('maps').upsert(serializeMapRow(latestMap, false));
    if (error && /layers|zones|labels|column/i.test(error.message)) {
      const retry = await client.from('maps').upsert(serializeMapRow(latestMap, true));
      error = retry.error;
    }
    if (!error) broadcastVaultChange('maps');
    setState({
      syncStatus: error ? 'error' : 'synced',
      lastSyncError: error ? error.message : null,
    });
  }, 650);
  mapSyncTimers.set(mapId, timer);
}

interface LocalVaultSnapshot {
  entities: Entity[];
  entityLinks: EntityLink[];
  mapPins: MapPin[];
  mapPaths: MapPath[];
}

function loadInitialLocalVaultData() {
  try {
    const raw = localStorage.getItem(LOCAL_VAULT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalVaultSnapshot>;
      if (Array.isArray(parsed.entities) && parsed.entities.length > 0) {
        return {
          entities: parsed.entities,
          entityLinks: Array.isArray(parsed.entityLinks) ? parsed.entityLinks : seed.entityLinks,
          mapPins: Array.isArray(parsed.mapPins) ? parsed.mapPins : seed.mapPins,
          mapPaths: Array.isArray(parsed.mapPaths) ? parsed.mapPaths : seed.mapPaths,
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return {
    entities: seed.entities,
    entityLinks: seed.entityLinks,
    mapPins: seed.mapPins,
    mapPaths: seed.mapPaths,
  };
}

const initialLocalVault = loadInitialLocalVaultData();

function saveLocalVaultData(state: {
  entities: Entity[];
  entityLinks: EntityLink[];
  mapPins: MapPin[];
  mapPaths: MapPath[];
  isAuthenticated?: boolean;
}) {
  if (state.isAuthenticated) return;
  try {
    localStorage.setItem(
      LOCAL_VAULT_STORAGE_KEY,
      JSON.stringify({
        entities: state.entities,
        entityLinks: state.entityLinks,
        mapPins: state.mapPins,
        mapPaths: state.mapPaths,
      })
    );
  } catch {
    // ignore quota errors
  }
}

function buildInitialMaps(): VaultMap[] {
  const base3D: VaultMap[] = seed.maps.map((m) => normalizeMapOverlay(m, m));
  const seedById = new Map(seed.maps.map((m) => [m.id, m]));
  const seeded2D: VaultMap = {
    id: 'map-smuggler-vaults',
    world_id: seed.world.id,
    name: 'Oakhaven Smuggler Vaults (2D)',
    kind: '2d',
    width: 1280,
    height: 832,
    displacement_scale: 0,
    scale_config: {
      ratio: '1 sq = 5 ft',
      elevationSource: '2D Tactical Grid',
      kmPerUnit: 0.0015,
    },
    battlemap: createSeededSmugglerVaultsBattlemap(),
  };
  const defaults = [...base3D, seeded2D];
  try {
    const raw = localStorage.getItem(MAPS_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as VaultMap[];
      if (Array.isArray(saved) && saved.length > 0) {
        const savedById = new Map(saved.map((m) => [m.id, m]));
        const mergedDefaults = defaults.map((d) => {
          const hit = savedById.get(d.id);
          return hit ? normalizeMapOverlay(hit, seedById.get(d.id)) : d;
        });
        const customMaps = saved
          .filter((m) => !defaults.some((d) => d.id === m.id))
          .map((m) => normalizeMapOverlay(m));
        return [...mergedDefaults, ...customMaps];
      }
    }
  } catch {
    // ignore storage errors
  }
  return defaults;
}

function saveMapsToStorage(maps: VaultMap[]) {
  try {
    localStorage.setItem(MAPS_STORAGE_KEY, JSON.stringify(maps));
  } catch {
    // Quota fallback: strip heavy procedural 3D base64 data URLs on maps with generation_config (regenerated on load)
    try {
      const compact = maps.map((m) =>
        m.kind === '3d' && m.generation_config
          ? { ...m, heightmap_url: undefined, albedo_url: undefined }
          : m
      );
      localStorage.setItem(MAPS_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // ignore if still over quota
    }
  }
}

function buildSeedAssets(): VaultAsset[] {
  const now = new Date().toISOString();
  const base: VaultAsset[] = [
    {
      id: 'asset-oakhaven-harbor',
      slug: 'oakhaven-harbor',
      name: 'Oakhaven Harbor',
      url: generateEntityArtwork('#d4a853', 'harbor'),
      kind: 'scene',
      created_at: now,
    },
    {
      id: 'asset-ashen-spire',
      slug: 'ashen-spire-peak',
      name: 'Ashen Spire Citadel',
      url: generateEntityArtwork('#eab308', 'spire'),
      kind: 'scene',
      created_at: now,
    },
    {
      id: 'asset-sunken-reliquary',
      slug: 'sunken-reliquary-ruins',
      name: 'The Sunken Reliquary',
      url: generateEntityArtwork('#38bdf8', 'reliquary'),
      kind: 'scene',
      created_at: now,
    },
    {
      id: 'asset-vaelora-portrait',
      slug: 'lady-vaelora-portrait',
      name: 'Lady Vaelora Portrait',
      url: generateEntityArtwork('#d4a853', 'character'),
      kind: 'portrait',
      created_at: now,
    },
    {
      id: 'asset-shadow-guild-crest',
      slug: 'shadow-guild-crest',
      name: 'Shadow Guild Crest',
      url: generateEntityArtwork('#a855f7', 'guild'),
      kind: 'handout',
      created_at: now,
    },
  ];
  try {
    const raw = localStorage.getItem(ASSETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as VaultAsset[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return base;
}

function saveAssetsToStorage(assets: VaultAsset[]) {
  try {
    localStorage.setItem(ASSETS_STORAGE_KEY, JSON.stringify(assets));
  } catch {
    // ignore quota errors
  }
}

function loadInitialTemplates(): Record<EntityType, EntityTemplate> {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<EntityType, EntityTemplate>>;
      return { ...DEFAULT_TEMPLATES, ...parsed };
    }
  } catch {
    // ignore storage errors
  }
  return { ...DEFAULT_TEMPLATES };
}

function saveTemplatesToStorage(templates: Record<EntityType, EntityTemplate>) {
  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // ignore storage errors
  }
}

function pushSnapshot(state: VaultState): Partial<VaultState> {
  const snap: HistorySnapshot = {
    entities: state.entities,
    entityLinks: state.entityLinks,
    mapPins: state.mapPins,
    mapPaths: state.mapPaths,
    maps: state.maps,
  };
  return {
    past: [...state.past.slice(-19), snap],
    future: [],
  };
}

let realtimeChannel: ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>['channel']> | null =
  null;

export const useVaultStore = create<VaultState>((set, get) => ({
  world: seed.world,
  entities: initialLocalVault.entities,
  entityLinks: initialLocalVault.entityLinks,
  maps: buildInitialMaps(),
  mapPins: initialLocalVault.mapPins,
  mapPaths: initialLocalVault.mapPaths,
  assets: buildSeedAssets(),
  templates: loadInitialTemplates(),

  isAuthenticated: false,
  userEmail: null,
  syncStatus: 'demo',
  lastSyncError: null,

  tabs: seed.initialTabs,
  activeTabId: seed.activeTabId,
  splitPaneTabId: null,
  editorMode: 'preview',
  inspectorSubTab: 'details',
  leftNavOpen: false,
  leftNavSection: 'vault',
  rightInspectorCollapsed: true,
  gmMode: true,
  leftFilterQuery: '',
  selectedSidebarFilter: null,

  mapRenderMode: 'map',
  mapCameraView: 'perspective',
  mapToolMode: 'select',
  mapLayers: {
    terrain: true,
    vegetation: true,
    rivers: true,
    locations: true,
    paths: true,
    regions: true,
    labels: true,
  },
  selectedPinId: null,
  hoveredPinId: null,
  selectedZoneId: null,
  selectedLabelId: null,
  activeZoneLayerId: 'layer-countries',
  pendingPinCoord: null,
  drawingPoints: [],
  cameraResetSignal: 0,
  cameraTopViewSignal: 0,
  cameraZoomSignal: { delta: 0, seq: 0 },
  zoneTransformSignal: { action: 'snap', value: 0, seq: 0 },
  scaleBarKm: 40,

  worldsmithMode: false,
  worldsmithTool: 'raise',
  brushRadius: 7,
  brushStrength: 0.45,
  brushFalloff: 'smooth',
  terraceSteps: 8,
  activeStampKind: 'mountain',
  activeBiomePaint: 'grass',
  activePropKind: 'village',
  selectedPropId: null,
  selectedFogId: null,
  activeFogPreset: 'valley-mist',
  terrainCommandSignal: { seq: 0, cmd: null },
  riverDrawingPoints: [],
  mapGeneratorModalOpen: false,
  mapGeneratorDefaultKind: '3d',
  mapGeneratorEditMapId: null,

  battlemapMode: 'play',
  battlemapTool: 'select',
  selectedTokenId: null,
  selectedDoorId: null,
  selectedLightId: null,
  selectedPropId2D: null,
  snapToGrid: true,

  commandPaletteOpen: false,
  authModalOpen: false,
  settingsModalOpen: false,
  newEntryModalOpen: false,
  newEntryDefaultType: 'Location',
  newEntryDefaultCategory: 'encyclopedia',

  past: [],
  future: [],

  setGmMode: (val) =>
    set((s) => ({
      gmMode: val,
      selectedPinId:
        !val && s.selectedPinId && s.mapPins.find((p) => p.id === s.selectedPinId)?.is_gm_only
          ? null
          : s.selectedPinId,
    })),

  setEditorMode: (mode) => set({ editorMode: mode }),
  setInspectorSubTab: (tab) => set({ inspectorSubTab: tab }),
  setLeftNavOpen: (open) => set({ leftNavOpen: open }),
  toggleLeftNav: () => set((s) => ({ leftNavOpen: !s.leftNavOpen })),
  setLeftNavSection: (section) => set({ leftNavSection: section, leftNavOpen: true }),
  setRightInspectorCollapsed: (collapsed) => set({ rightInspectorCollapsed: collapsed }),
  toggleRightInspector: () =>
    set((s) => ({ rightInspectorCollapsed: !s.rightInspectorCollapsed })),
  setMapRenderMode: (mode) => set({ mapRenderMode: mode }),
  setMapCameraView: (view) =>
    set((s) => ({
      mapCameraView: view,
      cameraTopViewSignal: view === 'top' ? s.cameraTopViewSignal + 1 : s.cameraTopViewSignal,
      cameraResetSignal: view === 'perspective' ? s.cameraResetSignal + 1 : s.cameraResetSignal,
    })),
  setMapToolMode: (mode) =>
    set({
      mapToolMode: mode,
      drawingPoints: mode === 'path' || mode === 'region' || mode === 'zone' ? get().drawingPoints : [],
      pendingPinCoord: null,
    }),

  toggleMapLayer: (layer) =>
    set((s) => ({
      mapLayers: { ...s.mapLayers, [layer]: !s.mapLayers[layer] },
    })),

  setSelectedPinId: (id) =>
    set({
      selectedPinId: id,
      ...(id ? { selectedZoneId: null, selectedLabelId: null, selectedPropId: null } : {}),
    }),
  setHoveredPinId: (id) => set({ hoveredPinId: id }),
  setSelectedZoneId: (id) =>
    set({
      selectedZoneId: id,
      ...(id ? { selectedPinId: null, selectedLabelId: null, selectedPropId: null } : {}),
    }),
  setSelectedLabelId: (id) =>
    set({
      selectedLabelId: id,
      ...(id ? { selectedPinId: null, selectedZoneId: null, selectedPropId: null } : {}),
    }),
  setActiveZoneLayerId: (layerId) => set({ activeZoneLayerId: layerId }),
  setPendingPinCoord: (pt) => set({ pendingPinCoord: pt }),

  addDrawingPoint: (pt) => set((s) => ({ drawingPoints: [...s.drawingPoints, pt] })),
  popDrawingPoint: () => set((s) => ({ drawingPoints: s.drawingPoints.slice(0, -1) })),
  clearDrawingPoints: () => set({ drawingPoints: [] }),

  finishDrawingPath: async (name, isRegion, isGmOnly = false) => {
    const state = get();
    if (state.drawingPoints.length < 2) return;
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    const activeMapId =
      activeTab?.kind === 'map' ? activeTab.targetId : state.maps[0]?.id;
    if (!activeMapId) return;

    const style: MapPathStyle = isRegion
      ? 'region-polygon'
      : isGmOnly
      ? 'gm-secret-route'
      : 'dashed-gold';

    const newPath: MapPath = {
      id: crypto.randomUUID ? crypto.randomUUID() : `path-${Date.now()}`,
      map_id: activeMapId,
      name: name || (isRegion ? 'New Region' : 'New Trail'),
      points: state.drawingPoints,
      style,
      is_gm_only: isGmOnly,
    };

    set((s) => ({
      ...pushSnapshot(s),
      mapPaths: [...s.mapPaths, newPath],
      drawingPoints: [],
      mapToolMode: 'select',
    }));

    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      set({ syncStatus: 'syncing' });
      const { error } = await client.from('map_paths').insert(newPath);
      if (!error) broadcastVaultChange('map_paths');
      set({
        syncStatus: error ? 'error' : 'synced',
        lastSyncError: error ? error.message : null,
      });
    }
  },

  triggerCameraReset: () =>
    set((s) => ({ mapCameraView: 'perspective', cameraResetSignal: s.cameraResetSignal + 1 })),
  triggerTopView: () =>
    set((s) => ({ mapCameraView: 'top', cameraTopViewSignal: s.cameraTopViewSignal + 1 })),
  triggerCameraZoom: (delta) =>
    set((s) => ({ cameraZoomSignal: { delta, seq: s.cameraZoomSignal.seq + 1 } })),
  dispatchZoneTransform: (action, value = 0) =>
    set((s) => ({ zoneTransformSignal: { action, value, seq: s.zoneTransformSignal.seq + 1 } })),
  setScaleBarKm: (km) => set({ scaleBarKm: km }),

  addWorldLayer: (mapId, { name, category, color, opacity = 0.32 }) => {
    const existing = get().maps.find((m) => m.id === mapId)?.layers || createDefaultWorldLayers();
    const newLayer: WorldMapLayer = {
      id: `layer-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: name.trim() || 'Custom Layer',
      category,
      color,
      visible: true,
      opacity,
      order: existing.length + 1,
    };
    set((s) => {
      const nextMaps = s.maps.map((m) => {
        if (m.id !== mapId) return m;
        const baseLayers = m.layers && m.layers.length > 0 ? m.layers : createDefaultWorldLayers();
        return { ...m, layers: [...baseLayers, newLayer] };
      });
      saveMapsToStorage(nextMaps);
      return { ...pushSnapshot(s), maps: nextMaps, activeZoneLayerId: newLayer.id };
    });
    scheduleMapSync(mapId, get, set);
    return newLayer;
  },

  updateWorldLayer: (mapId, layerId, patch) => {
    set((s) => {
      const nextMaps = s.maps.map((m) => {
        if (m.id !== mapId) return m;
        const baseLayers = m.layers && m.layers.length > 0 ? m.layers : createDefaultWorldLayers();
        return {
          ...m,
          layers: baseLayers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
        };
      });
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps };
    });
    scheduleMapSync(mapId, get, set);
  },

  deleteWorldLayer: (mapId, layerId) => {
    set((s) => {
      const nextMaps = s.maps.map((m) => {
        if (m.id !== mapId) return m;
        const baseLayers = m.layers && m.layers.length > 0 ? m.layers : createDefaultWorldLayers();
        const remaining = baseLayers.filter((l) => l.id !== layerId);
        return {
          ...m,
          layers: remaining,
          zones: (m.zones || []).filter((z) => z.layerId !== layerId),
        };
      });
      saveMapsToStorage(nextMaps);
      const updatedMap = nextMaps.find((m) => m.id === mapId);
      const fallbackLayerId = updatedMap?.layers?.[0]?.id || 'layer-countries';
      return {
        ...pushSnapshot(s),
        maps: nextMaps,
        activeZoneLayerId: s.activeZoneLayerId === layerId ? fallbackLayerId : s.activeZoneLayerId,
      };
    });
    scheduleMapSync(mapId, get, set);
  },

  toggleWorldLayer: (mapId, layerId) => {
    set((s) => {
      const nextMaps = s.maps.map((m) => {
        if (m.id !== mapId) return m;
        const baseLayers = m.layers && m.layers.length > 0 ? m.layers : createDefaultWorldLayers();
        return {
          ...m,
          layers: baseLayers.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)),
        };
      });
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps };
    });
    scheduleMapSync(mapId, get, set);
  },

  soloWorldLayer: (mapId, layerId) => {
    set((s) => {
      const nextMaps = s.maps.map((m) => {
        if (m.id !== mapId) return m;
        const baseLayers = m.layers && m.layers.length > 0 ? m.layers : createDefaultWorldLayers();
        return {
          ...m,
          layers: baseLayers.map((l) => ({
            ...l,
            visible: layerId === null ? true : l.id === layerId,
          })),
        };
      });
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps };
    });
    scheduleMapSync(mapId, get, set);
  },

  createMapZone: (mapId, payload) => {
    const newZone: WorldMapZone = {
      id: `zone-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      layerId: payload.layerId,
      name: payload.name.trim() || 'New Territory',
      points: payload.points,
      color: payload.color,
      borderStyle: payload.borderStyle || 'solid',
      borderWidth: payload.borderStyle === 'double' ? 2.8 : 2.1,
      fillOpacity: payload.fillOpacity,
      showLabel: payload.showLabel ?? true,
      labelScale: 1.0,
      entityId: payload.entityId ?? null,
      is_gm_only: payload.is_gm_only ?? false,
    };
    set((s) => {
      const nextMaps = s.maps.map((m) => {
        if (m.id !== mapId) return m;
        const baseLayers = m.layers && m.layers.length > 0 ? m.layers : createDefaultWorldLayers();
        // Ensure target layer is visible when creating a zone on it
        const layers = baseLayers.map((l) =>
          l.id === payload.layerId ? { ...l, visible: true } : l
        );
        return {
          ...m,
          layers,
          zones: [...(m.zones || []), newZone],
        };
      });
      saveMapsToStorage(nextMaps);
      return {
        ...pushSnapshot(s),
        maps: nextMaps,
        drawingPoints: [],
        mapToolMode: 'select',
        selectedZoneId: newZone.id,
        selectedPinId: null,
        selectedLabelId: null,
        selectedPropId: null,
      };
    });
    scheduleMapSync(mapId, get, set);
    return newZone;
  },

  updateMapZone: (mapId, zoneId, patch) => {
    set((s) => {
      const nextMaps = s.maps.map((m) =>
        m.id === mapId
          ? {
              ...m,
              zones: (m.zones || []).map((z) => (z.id === zoneId ? { ...z, ...patch } : z)),
            }
          : m
      );
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps };
    });
    scheduleMapSync(mapId, get, set);
  },

  deleteMapZone: (mapId, zoneId) => {
    set((s) => {
      const nextMaps = s.maps.map((m) =>
        m.id === mapId
          ? { ...m, zones: (m.zones || []).filter((z) => z.id !== zoneId) }
          : m
      );
      saveMapsToStorage(nextMaps);
      return {
        ...pushSnapshot(s),
        maps: nextMaps,
        selectedZoneId: s.selectedZoneId === zoneId ? null : s.selectedZoneId,
      };
    });
    scheduleMapSync(mapId, get, set);
  },

  createMapLabel: (mapId, payload) => {
    const newLabel: WorldMapLabel = {
      id: `lbl-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...payload,
    };
    set((s) => {
      const nextMaps = s.maps.map((m) =>
        m.id === mapId ? { ...m, labels: [...(m.labels || []), newLabel] } : m
      );
      saveMapsToStorage(nextMaps);
      return {
        ...pushSnapshot(s),
        maps: nextMaps,
        selectedLabelId: newLabel.id,
        selectedPinId: null,
        selectedZoneId: null,
        selectedPropId: null,
      };
    });
    scheduleMapSync(mapId, get, set);
    return newLabel;
  },

  updateMapLabel: (mapId, labelId, patch) => {
    set((s) => {
      const nextMaps = s.maps.map((m) =>
        m.id === mapId
          ? {
              ...m,
              labels: (m.labels || []).map((l) => (l.id === labelId ? { ...l, ...patch } : l)),
            }
          : m
      );
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps };
    });
    scheduleMapSync(mapId, get, set);
  },

  deleteMapLabel: (mapId, labelId) => {
    set((s) => {
      const nextMaps = s.maps.map((m) =>
        m.id === mapId
          ? { ...m, labels: (m.labels || []).filter((l) => l.id !== labelId) }
          : m
      );
      saveMapsToStorage(nextMaps);
      return {
        ...pushSnapshot(s),
        maps: nextMaps,
        selectedLabelId: s.selectedLabelId === labelId ? null : s.selectedLabelId,
      };
    });
    scheduleMapSync(mapId, get, set);
  },

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setAuthModalOpen: (open) => set({ authModalOpen: open }),
  setSettingsModalOpen: (open) => set({ settingsModalOpen: open }),
  openNewEntryModal: (defaultType = 'Location', defaultCategory = 'encyclopedia') =>
    set({
      newEntryModalOpen: true,
      newEntryDefaultType: defaultType,
      newEntryDefaultCategory: defaultCategory,
    }),
  closeNewEntryModal: () => set({ newEntryModalOpen: false }),
  setSelectedSidebarFilter: (filter) => set({ selectedSidebarFilter: filter }),

  setActiveTab: (tabId) => set({ activeTabId: tabId, selectedPinId: null }),

  openEntityTab: (entityId, inSplit = false) => {
    const state = get();
    const entity = state.entities.find((e) => e.id === entityId);
    if (!entity) return;

    const existing = state.tabs.find((t) => t.kind === 'entity' && t.targetId === entityId);
    if (existing) {
      if (inSplit) {
        set({ splitPaneTabId: existing.id });
      } else {
        set({ activeTabId: existing.id, selectedPinId: null });
      }
      return;
    }

    const newTab: TabItem = {
      id: `tab-${entity.id}`,
      kind: 'entity',
      targetId: entity.id,
      title: entity.title,
      iconType: entity.type,
    };

    if (inSplit) {
      set({ tabs: [...state.tabs, newTab], splitPaneTabId: newTab.id });
    } else {
      set({ tabs: [...state.tabs, newTab], activeTabId: newTab.id, selectedPinId: null });
    }
  },

  openEntityByTitle: (titleOrSlug) => {
    const state = get();
    const norm = titleOrSlug.trim().toLowerCase();
    const found = state.entities.find(
      (e) => e.title.toLowerCase() === norm || e.slug.toLowerCase() === norm
    );
    if (found) {
      state.openEntityTab(found.id);
    }
  },

  openMapTab: (mapId) => {
    const state = get();
    const map = state.maps.find((m) => m.id === mapId);
    if (!map) return;
    const existing = state.tabs.find((t) => t.kind === 'map' && t.targetId === mapId);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const newTab: TabItem = {
      id: `tab-map-${map.id}`,
      kind: 'map',
      targetId: map.id,
      title: map.name,
      iconType: 'Map',
    };
    set({ tabs: [...state.tabs, newTab], activeTabId: newTab.id });
  },

  openAssetTab: (assetId) => {
    const state = get();
    const asset = state.assets.find((a) => a.id === assetId);
    if (!asset) return;
    const existing = state.tabs.find((t) => t.kind === 'asset' && t.targetId === assetId);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const newTab: TabItem = {
      id: `tab-asset-${asset.id}`,
      kind: 'asset',
      targetId: asset.id,
      title: asset.name,
      iconType: 'Asset',
    };
    set({ tabs: [...state.tabs, newTab], activeTabId: newTab.id });
  },

  openTemplateTab: (type) => {
    const state = get();
    const existing = state.tabs.find((t) => t.kind === 'template' && t.targetId === type);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const tpl = state.templates[type] || DEFAULT_TEMPLATES[type];
    const newTab: TabItem = {
      id: `tab-tpl-${type}`,
      kind: 'template',
      targetId: type,
      title: `Template: ${tpl.label}`,
      iconType: type,
    };
    set({ tabs: [...state.tabs, newTab], activeTabId: newTab.id });
  },

  closeTab: (tabId) =>
    set((s) => {
      if (s.tabs.length <= 1) return s;
      const idx = s.tabs.findIndex((t) => t.id === tabId);
      const nextTabs = s.tabs.filter((t) => t.id !== tabId);
      let nextActive = s.activeTabId;
      if (s.activeTabId === tabId) {
        const fallback = nextTabs[Math.max(0, idx - 1)] || nextTabs[0];
        nextActive = fallback.id;
      }
      const nextSplit = s.splitPaneTabId === tabId ? null : s.splitPaneTabId;
      return { tabs: nextTabs, activeTabId: nextActive, splitPaneTabId: nextSplit };
    }),

  toggleSplitPane: () =>
    set((s) => {
      if (s.splitPaneTabId) {
        return { splitPaneTabId: null };
      }
      const other = s.tabs.find((t) => t.id !== s.activeTabId) || s.tabs[0];
      return { splitPaneTabId: other ? other.id : null };
    }),

  createEntity: async (payload) => {
    const state = get();
    const id = crypto.randomUUID ? crypto.randomUUID() : `ent-${Date.now()}`;
    const baseSlug = slugify(payload.title) || `entry-${Date.now()}`;
    const uniqueSlug = state.entities.some((e) => e.slug === baseSlug)
      ? `${baseSlug}-${Math.floor(Math.random() * 1000)}`
      : baseSlug;

    const useTpl = payload.useTemplate !== false;
    const tpl = state.templates[payload.type] || DEFAULT_TEMPLATES[payload.type];

    const mergedTags =
      payload.tags && payload.tags.length > 0
        ? payload.tags
        : useTpl && tpl
        ? tpl.defaultTags
        : [];

    const mergedMeta: Record<string, string | number | boolean> = {
      ...(useTpl && tpl ? tpl.metadata : {}),
      ...(payload.metadata || {}),
    };
    if (useTpl && tpl?.customCss && !mergedMeta._custom_css) {
      mergedMeta._custom_css = tpl.customCss;
    }

    const defaultContent =
      useTpl && tpl
        ? `# ${payload.title.trim()}\n\n${tpl.content}`
        : `# ${payload.title.trim()}\n\nWrite lore, hooks, and [[WikiLinks]] here.`;

    const newEntity: Entity = {
      id,
      world_id: state.world.id,
      slug: uniqueSlug,
      title: payload.title.trim(),
      type: payload.type,
      category: payload.category,
      tags: mergedTags,
      summary:
        payload.summary ||
        (useTpl && tpl ? tpl.summaryPlaceholder : `${payload.type} in ${state.world.name}.`),
      content: payload.content || defaultContent,
      gm_secrets: payload.gm_secrets || '',
      cover_image_url: payload.cover_image_url || null,
      metadata: mergedMeta,
      is_favorite: false,
      updated_at: new Date().toISOString(),
    };

    const nextEntities = [...state.entities, newEntity];
    const newLinks = computeEntityLinksForSource(newEntity, nextEntities);

    set((s) => {
      const nextEntities = [...s.entities, newEntity];
      const nextLinks = [...s.entityLinks, ...newLinks];
      saveLocalVaultData({
        entities: nextEntities,
        entityLinks: nextLinks,
        mapPins: s.mapPins,
        mapPaths: s.mapPaths,
        isAuthenticated: s.isAuthenticated,
      });
      return {
        ...pushSnapshot(s),
        entities: nextEntities,
        entityLinks: nextLinks,
      };
    });

    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      set({ syncStatus: 'syncing' });
      const { error } = await client.from('entities').insert(newEntity);
      if (!error && newLinks.length > 0) {
        await client.from('entity_links').upsert(newLinks);
      }
      if (!error) broadcastVaultChange('entities');
      set({
        syncStatus: error ? 'error' : 'synced',
        lastSyncError: error ? error.message : null,
      });
    }

    return newEntity;
  },

  addAsset: ({ name, url, kind = 'scene' }) => {
    const state = get();
    const cleanName = name.trim() || `Asset ${state.assets.length + 1}`;
    const baseSlug = slugify(cleanName) || `asset-${Date.now()}`;
    const uniqueSlug = state.assets.some((a) => a.slug === baseSlug)
      ? `${baseSlug}-${Math.floor(Math.random() * 1000)}`
      : baseSlug;

    const newAsset: VaultAsset = {
      id: crypto.randomUUID(),
      slug: uniqueSlug,
      name: cleanName,
      url,
      kind,
      created_at: new Date().toISOString(),
    };
    const nextAssets = [newAsset, ...state.assets];
    saveAssetsToStorage(nextAssets);
    set({ assets: nextAssets });

    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      set({ syncStatus: 'syncing' });
      client
        .from('vault_assets')
        .upsert({ ...newAsset, world_id: state.world.id })
        .then(({ error }) => {
          if (!error) broadcastVaultChange('vault_assets');
          set({
            syncStatus: error ? 'error' : 'synced',
            lastSyncError: error ? error.message : null,
          });
        });
    }
    return newAsset;
  },

  updateAsset: (id, patch) => {
    const state = get();
    set((s) => {
      const nextAssets = s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a));
      saveAssetsToStorage(nextAssets);
      const nextTabs = s.tabs.map((t) =>
        t.kind === 'asset' && t.targetId === id && patch.name
          ? { ...t, title: patch.name }
          : t
      );
      return { assets: nextAssets, tabs: nextTabs };
    });
    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      client
        .from('vault_assets')
        .update(patch)
        .eq('id', id)
        .then(({ error }) => {
          if (error) set({ syncStatus: 'error', lastSyncError: error.message });
        });
    }
  },

  deleteAsset: (id) => {
    const state = get();
    set((s) => {
      const nextAssets = s.assets.filter((a) => a.id !== id);
      saveAssetsToStorage(nextAssets);
      return {
        assets: nextAssets,
        tabs: s.tabs.filter((t) => !(t.kind === 'asset' && t.targetId === id)),
      };
    });
    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      client
        .from('vault_assets')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) set({ syncStatus: 'error', lastSyncError: error.message });
        });
    }
  },

  attachAssetToEntity: (entityId, assetId, role, opacity = 1) => {
    const state = get();
    const entity = state.entities.find((e) => e.id === entityId);
    const asset = state.assets.find((a) => a.id === assetId);
    if (!entity || !asset) return;

    if (role === 'cover') {
      state.updateEntity(entityId, { cover_image_url: asset.url });
    } else if (role === 'background') {
      state.updateEntity(entityId, {
        metadata: { ...entity.metadata, _bg_image: `asset://${asset.slug}` },
      });
    } else {
      const token =
        opacity < 0.99
          ? `\n\n![[${asset.slug}|opacity=${Math.round(opacity * 100)}]]`
          : `\n\n![[${asset.slug}]]`;
      state.updateEntity(entityId, { content: `${entity.content.trim()}${token}\n` });
    }
  },

  updateTemplate: (type, patch) => {
    const state = get();
    const current = state.templates[type] || DEFAULT_TEMPLATES[type];
    const updatedTpl: EntityTemplate = { ...current, ...patch };
    set((s) => {
      const next = { ...s.templates, [type]: updatedTpl };
      saveTemplatesToStorage(next);
      return { templates: next };
    });
    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      set({ syncStatus: 'syncing' });
      client
        .from('entity_templates')
        .upsert(serializeTemplateRow(state.world.id, updatedTpl))
        .then(({ error }) => {
          if (!error) broadcastVaultChange('entity_templates');
          set({
            syncStatus: error ? 'error' : 'synced',
            lastSyncError: error ? error.message : null,
          });
        });
    }
  },

  resetTemplate: (type) => {
    const state = get();
    const resetTpl = { ...DEFAULT_TEMPLATES[type] };
    set((s) => {
      const next = { ...s.templates, [type]: resetTpl };
      saveTemplatesToStorage(next);
      return { templates: next };
    });
    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      client
        .from('entity_templates')
        .upsert(serializeTemplateRow(state.world.id, resetTpl))
        .then(({ error }) => {
          if (error) set({ syncStatus: 'error', lastSyncError: error.message });
        });
    }
  },

  updateEntity: (id, patch) => {
    const state = get();
    const prev = state.entities.find((e) => e.id === id);
    if (!prev) return;

    const updated: Entity = {
      ...prev,
      ...patch,
      updated_at: new Date().toISOString(),
    };

    const nextEntities = state.entities.map((e) => (e.id === id ? updated : e));
    const refreshedSourceLinks = computeEntityLinksForSource(updated, nextEntities);
    const otherLinks = state.entityLinks.filter((l) => l.source_id !== id);
    const nextLinks = [...otherLinks, ...refreshedSourceLinks];

    const nextTabs = state.tabs.map((t) =>
      t.kind === 'entity' && t.targetId === id ? { ...t, title: updated.title } : t
    );

      set({
        entities: nextEntities,
        entityLinks: nextLinks,
        tabs: nextTabs,
      });
      saveLocalVaultData({
        entities: nextEntities,
        entityLinks: nextLinks,
        mapPins: state.mapPins,
        mapPaths: state.mapPaths,
        isAuthenticated: state.isAuthenticated,
      });

    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      const existingTimer = entitySyncTimers.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      set({ syncStatus: 'syncing' });
      const timer = setTimeout(async () => {
        const latestEntity = get().entities.find((e) => e.id === id);
        if (!latestEntity) return;
        const { error } = await client.from('entities').upsert(latestEntity);
        if (!error) {
          await client.from('entity_links').delete().eq('source_id', id);
          const linksForSource = get().entityLinks.filter((l) => l.source_id === id);
          if (linksForSource.length > 0) {
            await client.from('entity_links').upsert(linksForSource);
          }
          broadcastVaultChange('entities');
        }
        set({
          syncStatus: error ? 'error' : 'synced',
          lastSyncError: error ? error.message : null,
        });
      }, 650);
      entitySyncTimers.set(id, timer);
    }
  },

  deleteEntity: async (id) => {
    const state = get();
    set((s) => {
      const nextEntities = s.entities.filter((e) => e.id !== id);
      const nextLinks = s.entityLinks.filter((l) => l.source_id !== id && l.target_id !== id);
      const nextPins = s.mapPins.map((p) => (p.entity_id === id ? { ...p, entity_id: null } : p));
      saveLocalVaultData({
        entities: nextEntities,
        entityLinks: nextLinks,
        mapPins: nextPins,
        mapPaths: s.mapPaths,
        isAuthenticated: s.isAuthenticated,
      });
      return {
        ...pushSnapshot(s),
        entities: nextEntities,
        entityLinks: nextLinks,
        mapPins: nextPins,
        tabs: s.tabs.filter((t) => !(t.kind === 'entity' && t.targetId === id)),
      };
    });

    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      await client.from('entities').delete().eq('id', id);
      broadcastVaultChange('entities');
    }
  },

  toggleFavorite: (id) => {
    const ent = get().entities.find((e) => e.id === id);
    if (!ent) return;
    get().updateEntity(id, { is_favorite: !ent.is_favorite });
  },

  createMapPin: async (payload) => {
    const state = get();
    const newPin: MapPin = {
      id: crypto.randomUUID ? crypto.randomUUID() : `pin-${Date.now()}`,
      ...payload,
    };

    set((s) => ({
      ...pushSnapshot(s),
      mapPins: [...s.mapPins, newPin],
      pendingPinCoord: null,
      mapToolMode: 'select',
      selectedPinId: newPin.id,
    }));

    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      set({ syncStatus: 'syncing' });
      const { error } = await client.from('map_pins').insert(newPin);
      if (!error) broadcastVaultChange('map_pins');
      set({
        syncStatus: error ? 'error' : 'synced',
        lastSyncError: error ? error.message : null,
      });
    }

    return newPin;
  },

  linkPinToEntity: async (pinId, entityId) => {
    const state = get();
    const entity = state.entities.find((e) => e.id === entityId);
    set((s) => ({
      ...pushSnapshot(s),
      mapPins: s.mapPins.map((p) =>
        p.id === pinId ? { ...p, entity_id: entityId, label: entity ? entity.title : p.label } : p
      ),
    }));

    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      await client
        .from('map_pins')
        .update({ entity_id: entityId, label: entity?.title })
        .eq('id', pinId);
      broadcastVaultChange('map_pins');
    }
  },

  deleteMapPin: async (pinId) => {
    const state = get();
    set((s) => ({
      ...pushSnapshot(s),
      mapPins: s.mapPins.filter((p) => p.id !== pinId),
      selectedPinId: s.selectedPinId === pinId ? null : s.selectedPinId,
    }));

    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      await client.from('map_pins').delete().eq('id', pinId);
      broadcastVaultChange('map_pins');
    }
  },

  deleteMapPath: async (pathId) => {
    const state = get();
    set((s) => ({
      ...pushSnapshot(s),
      mapPaths: s.mapPaths.filter((p) => p.id !== pathId),
    }));

    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      await client.from('map_paths').delete().eq('id', pathId);
      broadcastVaultChange('map_paths');
    }
  },

  updateMapAssets: async (mapId, patch) => {
    set((s) => {
      const nextMaps = s.maps.map((m) => (m.id === mapId ? { ...m, ...patch } : m));
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps };
    });
    scheduleMapSync(mapId, get, set);
  },

  setWorldsmithMode: (on) =>
    set({
      worldsmithMode: on,
      mapToolMode: 'select',
      riverDrawingPoints: [],
      selectedPropId: null,
      selectedFogId: null,
    }),

  setWorldsmithTool: (tool) =>
    set({
      worldsmithTool: tool,
      riverDrawingPoints: tool === 'river' ? get().riverDrawingPoints : [],
    }),

  setBrushRadius: (r) => set({ brushRadius: r }),
  setBrushStrength: (s) => set({ brushStrength: s }),
  setBrushFalloff: (f) => set({ brushFalloff: f }),
  setTerraceSteps: (steps) => set({ terraceSteps: Math.max(2, Math.min(24, Math.round(steps))) }),
  setActiveStampKind: (kind) => set({ activeStampKind: kind }),
  setActiveBiomePaint: (kind) => set({ activeBiomePaint: kind }),
  setActivePropKind: (k) => set({ activePropKind: k }),
  setSelectedPropId: (id) => set({ selectedPropId: id }),
  setSelectedFogId: (id) => set({ selectedFogId: id }),
  setActiveFogPreset: (preset) => set({ activeFogPreset: preset }),
  dispatchTerrainCommand: (cmd) =>
    set((s) => ({
      terrainCommandSignal: { seq: s.terrainCommandSignal.seq + 1, cmd },
    })),

  addFogVolume: (mapId, at, preset, overrides) => {
    const newFog = createFogVolume(at, preset || get().activeFogPreset, overrides);
    set((s) => {
      const nextMaps = s.maps.map((m) =>
        m.id === mapId ? { ...m, fog_volumes: [...(m.fog_volumes || []), newFog] } : m
      );
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps, selectedFogId: newFog.id };
    });
    scheduleMapSync(mapId, get, set);
    return newFog;
  },

  updateFogVolume: (mapId, fogId, patch) => {
    set((s) => {
      const nextMaps = s.maps.map((m) =>
        m.id === mapId
          ? {
              ...m,
              fog_volumes: (m.fog_volumes || []).map((f) =>
                f.id === fogId ? { ...f, ...patch } : f
              ),
            }
          : m
      );
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps };
    });
    scheduleMapSync(mapId, get, set);
  },

  deleteFogVolume: (mapId, fogId) => {
    set((s) => {
      const nextMaps = s.maps.map((m) =>
        m.id === mapId
          ? { ...m, fog_volumes: (m.fog_volumes || []).filter((f) => f.id !== fogId) }
          : m
      );
      saveMapsToStorage(nextMaps);
      return {
        maps: nextMaps,
        selectedFogId: s.selectedFogId === fogId ? null : s.selectedFogId,
      };
    });
    scheduleMapSync(mapId, get, set);
  },

  updateMapEnvironment: (mapId, patch) => {
    set((s) => {
      const nextMaps = s.maps.map((m) => {
        if (m.id !== mapId) return m;
        const nextWater: WaterSettings | undefined = patch.water
          ? { ...(m.water || DEFAULT_WATER_SETTINGS), ...patch.water }
          : m.water;
        const nextShading: TerrainShadingSettings | undefined = patch.terrain_shading
          ? { ...(m.terrain_shading || DEFAULT_TERRAIN_SHADING), ...patch.terrain_shading }
          : m.terrain_shading;
        const nextGenConfig =
          patch.sea_level !== undefined && m.generation_config
            ? { ...m.generation_config, seaLevel: patch.sea_level }
            : m.generation_config;
        return {
          ...m,
          world_size: patch.world_size !== undefined ? patch.world_size : m.world_size,
          sea_level: patch.sea_level !== undefined ? patch.sea_level : m.sea_level,
          displacement_scale:
            patch.displacement_scale !== undefined
              ? patch.displacement_scale
              : m.displacement_scale,
          paint_url: patch.paint_url !== undefined ? patch.paint_url : m.paint_url,
          water: nextWater,
          terrain_shading: nextShading,
          generation_config: nextGenConfig,
        };
      });
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps };
    });
    scheduleMapSync(mapId, get, set);
  },

  addRiverPoint: (pt) => set((s) => ({ riverDrawingPoints: [...s.riverDrawingPoints, pt] })),
  clearRiverPoints: () => set({ riverDrawingPoints: [] }),

  finishRiver: (mapId, name, width, depth) => {
    set((s) => {
      if (s.riverDrawingPoints.length < 2) return s;
      const river: MapRiver = {
        id: `river-${Date.now()}`,
        name: name.trim() || 'Carved River',
        points: s.riverDrawingPoints,
        width,
        depth,
      };
      const nextMaps = s.maps.map((m) =>
        m.id === mapId ? { ...m, rivers: [...(m.rivers || []), river] } : m
      );
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps, riverDrawingPoints: [] };
    });
    scheduleMapSync(mapId, get, set);
  },

  deleteRiver: (mapId, riverId) => {
    set((s) => {
      const nextMaps = s.maps.map((m) =>
        m.id === mapId
          ? { ...m, rivers: (m.rivers || []).filter((r) => r.id !== riverId) }
          : m
      );
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps };
    });
    scheduleMapSync(mapId, get, set);
  },

  addMapProp: (mapId, prop) => {
    const newProp: MapProp = {
      id: `prop-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      ...prop,
    };
    set((s) => {
      const nextMaps = s.maps.map((m) =>
        m.id === mapId ? { ...m, props: [...(m.props || []), newProp] } : m
      );
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps };
    });
    scheduleMapSync(mapId, get, set);
    return newProp;
  },

  updateMapProp: (mapId, propId, patch) => {
    set((s) => {
      const nextMaps = s.maps.map((m) =>
        m.id === mapId
          ? {
              ...m,
              props: (m.props || []).map((p) => (p.id === propId ? { ...p, ...patch } : p)),
            }
          : m
      );
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps };
    });
    scheduleMapSync(mapId, get, set);
  },

  deleteMapProp: (mapId, propId) => {
    set((s) => {
      const nextMaps = s.maps.map((m) =>
        m.id === mapId
          ? { ...m, props: (m.props || []).filter((p) => p.id !== propId) }
          : m
      );
      saveMapsToStorage(nextMaps);
      return {
        maps: nextMaps,
        selectedPropId: s.selectedPropId === propId ? null : s.selectedPropId,
      };
    });
    scheduleMapSync(mapId, get, set);
  },

  setMapGeneratorModalOpen: (open, kind = '3d', editMapId = null) =>
    set({
      mapGeneratorModalOpen: open,
      mapGeneratorDefaultKind: kind,
      mapGeneratorEditMapId: editMapId,
    }),

  updateMapMetadata: (mapId, patch) => {
    set((s) => {
      const nextMaps = s.maps.map((m) => {
        if (m.id !== mapId) return m;
        let nextBm = m.battlemap;
        if (nextBm && patch.battlemap) {
          const merged = { ...nextBm, ...patch.battlemap };
          if (patch.regenerateThemeFloor && !patch.battlemap.backgroundUrl) {
            merged.backgroundUrl = generateBattlemapFloorUrl(
              merged.theme,
              merged.width,
              merged.height,
              merged.gridSizePx
            );
          }
          // Clamp all 2D coordinates cleanly if map bounds shrank
          const clampX = (v: number) => Math.max(16, Math.min(merged.width - 16, v));
          const clampY = (v: number) => Math.max(16, Math.min(merged.height - 16, v));
          merged.tokens = merged.tokens.map((t) => ({ ...t, x: clampX(t.x), y: clampY(t.y) }));
          merged.lights = merged.lights.map((l) => ({ ...l, x: clampX(l.x), y: clampY(l.y) }));
          merged.props = (merged.props || []).map((p) => ({ ...p, x: clampX(p.x), y: clampY(p.y) }));
          nextBm = merged;
        }
        return {
          ...m,
          name: patch.name !== undefined ? patch.name.trim() || m.name : m.name,
          atmosphere: patch.atmosphere ?? m.atmosphere,
          width: nextBm ? nextBm.width : m.width,
          height: nextBm ? nextBm.height : m.height,
          battlemap: nextBm,
        };
      });
      saveMapsToStorage(nextMaps);
      const nextTabs =
        patch.name !== undefined
          ? s.tabs.map((t) =>
              t.kind === 'map' && t.targetId === mapId
                ? { ...t, title: patch.name!.trim() || t.title }
                : t
            )
          : s.tabs;
      return {
        ...pushSnapshot(s),
        maps: nextMaps,
        tabs: nextTabs,
        mapGeneratorModalOpen: false,
        mapGeneratorEditMapId: null,
      };
    });
    scheduleMapSync(mapId, get, set);
  },

  deleteMap: (mapId) => {
    const state = get();
    if (state.maps.length <= 1) return;
    set((s) => {
      if (s.maps.length <= 1) return s;
      const nextMaps = s.maps.filter((m) => m.id !== mapId);
      saveMapsToStorage(nextMaps);
      const nextTabs = s.tabs.filter((t) => !(t.kind === 'map' && t.targetId === mapId));
      const nextActive =
        s.tabs.find((t) => t.id === s.activeTabId)?.targetId === mapId
          ? nextTabs[0]?.id || ''
          : s.activeTabId;
      return { ...pushSnapshot(s), maps: nextMaps, tabs: nextTabs, activeTabId: nextActive };
    });
    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      client
        .from('maps')
        .delete()
        .eq('id', mapId)
        .then(({ error }) => {
          if (error) set({ syncStatus: 'error', lastSyncError: error.message });
        });
    }
  },

  createCustom3DMap: (name, config) => {
    const state = get();
    const worldSize = config.worldSize || DEFAULT_NEW_WORLD_SIZE;
    const heightRes = heightResForWorldSize(worldSize);
    const fullConfig: MapGenerationConfig = { ...config, worldSize };
    const generated = generateCustomTerrain(fullConfig, heightRes, 16);
    const id = crypto.randomUUID();
    const mapTitle = name.trim() || 'Custom World Map';
    const newMap: VaultMap = {
      id,
      world_id: state.world.id,
      name: mapTitle,
      kind: '3d',
      heightmap_url: generated.heightmapDataUrl,
      albedo_url: generated.albedoDataUrl,
      paint_url: null,
      width: 8192,
      height: 8192,
      displacement_scale: 16,
      world_size: worldSize,
      sea_level: config.seaLevel,
      scale_config: {
        ratio: '1 : 250 000',
        elevationSource: `Custom (${config.archetype})`,
        kmPerUnit: 1.5,
      },
      generation_config: fullConfig,
      rivers: generated.rivers,
      props: generated.props,
      fog_volumes: [],
      layers: createDefaultWorldLayers(),
      zones: [],
      labels: [
        {
          id: `lbl-title-${Date.now()}`,
          text: mapTitle.toUpperCase(),
          x: 0,
          y: config.seaLevel * 16 + 4.5,
          z: -2,
          yOffset: 2.0,
          fontSize: 2.4,
          color: '#e9dec7',
          rotationY: -0.08,
          style: 'title',
          layerId: null,
          opacity: 0.6,
          is_gm_only: false,
        },
      ],
    };
    const nextMaps = [...state.maps, newMap];
    saveMapsToStorage(nextMaps);
    const newTab: TabItem = {
      id: `tab-map-${id}`,
      kind: 'map',
      targetId: id,
      title: newMap.name,
      iconType: 'Map',
    };
    set({
      maps: nextMaps,
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
      worldsmithMode: true,
      mapGeneratorModalOpen: false,
    });
    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      set({ syncStatus: 'syncing' });
      client
        .from('maps')
        .insert(serializeMapRow(newMap, false))
        .then(async ({ error }) => {
          let finalError = error;
          if (finalError && /layers|zones|labels|column/i.test(finalError.message)) {
            const retry = await client.from('maps').insert(serializeMapRow(newMap, true));
            finalError = retry.error;
          }
          if (!finalError) broadcastVaultChange('maps');
          set({
            syncStatus: finalError ? 'error' : 'synced',
            lastSyncError: finalError ? finalError.message : null,
          });
        });
    }
    return newMap;
  },

  regenerate3DMap: (mapId, config) => {
    const worldSize = config.worldSize || DEFAULT_NEW_WORLD_SIZE;
    const heightRes = heightResForWorldSize(worldSize);
    const fullConfig: MapGenerationConfig = { ...config, worldSize };
    const generated = generateCustomTerrain(fullConfig, heightRes, 16);
    set((s) => {
      const nextMaps = s.maps.map((m) =>
        m.id === mapId
          ? {
              ...m,
              heightmap_url: generated.heightmapDataUrl,
              albedo_url: generated.albedoDataUrl,
              paint_url: null,
              world_size: worldSize,
              sea_level: config.seaLevel,
              generation_config: fullConfig,
              rivers: generated.rivers,
              props: generated.props,
              scale_config: {
                ...m.scale_config,
                elevationSource: `Custom (${config.archetype})`,
              },
            }
          : m
      );
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps, worldsmithMode: true, mapGeneratorModalOpen: false };
    });
    scheduleMapSync(mapId, get, set);
  },

  createBattlemap: ({ name, theme, cols = 20, rows = 13, gridSizePx = 64, ambientLight, backgroundUrl }) => {
    const state = get();
    const bm = createBlankBattlemap(theme, cols, rows, gridSizePx);
    if (ambientLight !== undefined) {
      bm.ambientLight = ambientLight;
    }
    if (backgroundUrl) {
      bm.backgroundUrl = backgroundUrl;
    }
    const id = crypto.randomUUID();
    const newMap: VaultMap = {
      id,
      world_id: state.world.id,
      name: name.trim() || 'Tactical Combat Map (2D)',
      kind: '2d',
      width: bm.width,
      height: bm.height,
      displacement_scale: 0,
      scale_config: {
        ratio: '1 sq = 5 ft',
        elevationSource: '2D Tactical Grid',
        kmPerUnit: 0.0015,
      },
      battlemap: bm,
    };
    const nextMaps = [...state.maps, newMap];
    saveMapsToStorage(nextMaps);
    const newTab: TabItem = {
      id: `tab-map-${id}`,
      kind: 'map',
      targetId: id,
      title: newMap.name,
      iconType: 'Map',
    };
    set({
      maps: nextMaps,
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
      battlemapMode: 'prep',
      mapGeneratorModalOpen: false,
      mapGeneratorEditMapId: null,
    });
    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      set({ syncStatus: 'syncing' });
      client
        .from('maps')
        .insert(serializeMapRow(newMap))
        .then(({ error }) => {
          if (!error) broadcastVaultChange('maps');
          set({
            syncStatus: error ? 'error' : 'synced',
            lastSyncError: error ? error.message : null,
          });
        });
    }
    return newMap;
  },

  setBattlemapMode: (mode) =>
    set((s) => ({
      battlemapMode: mode,
      battlemapTool:
        mode === 'play' &&
        (s.battlemapTool === 'place-light' ||
          s.battlemapTool === 'place-prop' ||
          s.battlemapTool === 'draw-wall' ||
          s.battlemapTool === 'draw-door' ||
          s.battlemapTool === 'erase')
          ? 'select'
          : s.battlemapTool,
    })),
  setBattlemapTool: (tool) => set({ battlemapTool: tool }),
  setSelectedTokenId: (id) =>
    set({ selectedTokenId: id, selectedDoorId: null, selectedLightId: null, selectedPropId2D: null }),
  setSelectedDoorId: (id) =>
    set({ selectedDoorId: id, selectedTokenId: null, selectedLightId: null, selectedPropId2D: null }),
  setSelectedLightId: (id) =>
    set({ selectedLightId: id, selectedTokenId: null, selectedDoorId: null, selectedPropId2D: null }),
  setSelectedPropId2D: (id) =>
    set({ selectedPropId2D: id, selectedTokenId: null, selectedDoorId: null, selectedLightId: null }),
  setSnapToGrid: (snap) => set({ snapToGrid: snap }),

  updateBattlemap: (mapId, updater) => {
    set((s) => {
      const nextMaps = s.maps.map((m) => {
        if (m.id !== mapId || !m.battlemap) return m;
        return { ...m, battlemap: updater(m.battlemap) };
      });
      saveMapsToStorage(nextMaps);
      return { maps: nextMaps };
    });
    scheduleMapSync(mapId, get, set);
  },

  toggleBattlemapDoor: (mapId, doorId) =>
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      doors: bm.doors.map((d) => (d.id === doorId ? { ...d, isOpen: !d.isOpen } : d)),
    })),

  toggleBattlemapDoorLock: (mapId, doorId) =>
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      doors: bm.doors.map((d) => (d.id === doorId ? { ...d, isLocked: !d.isLocked } : d)),
    })),

  toggleBattlemapLight: (mapId, lightId) =>
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      lights: bm.lights.map((l) => (l.id === lightId ? { ...l, isOn: !l.isOn } : l)),
    })),

  addBattlemapToken: (mapId, token) => {
    const newTok: BattlemapToken = {
      id: `tok-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...token,
    };
    set((s) => ({ ...pushSnapshot(s) }));
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      tokens: [...bm.tokens, newTok],
    }));
    set({ selectedTokenId: newTok.id });
    return newTok;
  },

  updateBattlemapToken: (mapId, tokenId, patch) =>
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      tokens: bm.tokens.map((t) => (t.id === tokenId ? { ...t, ...patch } : t)),
    })),

  deleteBattlemapToken: (mapId, tokenId) => {
    set((s) => ({ ...pushSnapshot(s) }));
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      tokens: bm.tokens.filter((t) => t.id !== tokenId),
    }));
    if (get().selectedTokenId === tokenId) set({ selectedTokenId: null });
  },

  addBattlemapWall: (mapId, wall) => {
    set((s) => ({ ...pushSnapshot(s) }));
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      walls: [...bm.walls, { id: `wall-${Date.now()}`, ...wall }],
    }));
  },

  deleteBattlemapWall: (mapId, wallId) => {
    set((s) => ({ ...pushSnapshot(s) }));
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      walls: bm.walls.filter((w) => w.id !== wallId),
    }));
  },

  addBattlemapDoor: (mapId, door) => {
    const id = `door-${Date.now()}`;
    set((s) => ({ ...pushSnapshot(s) }));
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      doors: [...bm.doors, { id, ...door }],
    }));
    set({ selectedDoorId: id });
  },

  deleteBattlemapDoor: (mapId, doorId) => {
    set((s) => ({ ...pushSnapshot(s) }));
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      doors: bm.doors.filter((d) => d.id !== doorId),
    }));
    if (get().selectedDoorId === doorId) set({ selectedDoorId: null });
  },

  addBattlemapLight: (mapId, light) => {
    const id = `light-${Date.now()}`;
    set((s) => ({ ...pushSnapshot(s) }));
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      lights: [...bm.lights, { id, ...light }],
    }));
    set({ selectedLightId: id });
  },

  deleteBattlemapLight: (mapId, lightId) => {
    set((s) => ({ ...pushSnapshot(s) }));
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      lights: bm.lights.filter((l) => l.id !== lightId),
    }));
    if (get().selectedLightId === lightId) set({ selectedLightId: null });
  },

  addBattlemapProp: (mapId, prop) => {
    const newProp: BattlemapProp = {
      id: `prop2d-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...prop,
    };
    set((s) => ({ ...pushSnapshot(s) }));
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      props: [...(bm.props || []), newProp],
    }));
    set({
      selectedPropId2D: newProp.id,
      selectedTokenId: null,
      selectedDoorId: null,
      selectedLightId: null,
    });
    return newProp;
  },

  updateBattlemapProp: (mapId, propId, patch) =>
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      props: (bm.props || []).map((p) => (p.id === propId ? { ...p, ...patch } : p)),
    })),

  deleteBattlemapProp: (mapId, propId) => {
    set((s) => ({ ...pushSnapshot(s) }));
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      props: (bm.props || []).filter((p) => p.id !== propId),
    }));
    if (get().selectedPropId2D === propId) set({ selectedPropId2D: null });
  },

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      const current: HistorySnapshot = {
        entities: s.entities,
        entityLinks: s.entityLinks,
        mapPins: s.mapPins,
        mapPaths: s.mapPaths,
        maps: s.maps,
      };
      saveMapsToStorage(previous.maps);
      saveLocalVaultData({
        entities: previous.entities,
        entityLinks: previous.entityLinks,
        mapPins: previous.mapPins,
        mapPaths: previous.mapPaths,
        isAuthenticated: s.isAuthenticated,
      });
      return {
        ...previous,
        past: s.past.slice(0, -1),
        future: [current, ...s.future],
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      const current: HistorySnapshot = {
        entities: s.entities,
        entityLinks: s.entityLinks,
        mapPins: s.mapPins,
        mapPaths: s.mapPaths,
        maps: s.maps,
      };
      saveMapsToStorage(next.maps);
      saveLocalVaultData({
        entities: next.entities,
        entityLinks: next.entityLinks,
        mapPins: next.mapPins,
        mapPaths: next.mapPaths,
        isAuthenticated: s.isAuthenticated,
      });
      return {
        ...next,
        past: [...s.past, current],
        future: s.future.slice(1),
      };
    }),

  initSupabaseSync: async () => {
    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured()) {
      set({ syncStatus: 'demo', isAuthenticated: false, userEmail: null });
      return;
    }

    set({ syncStatus: 'connecting', lastSyncError: null });
    const valid = await verifyStoredVaultToken();
    if (!valid) {
      clearStoredVaultToken();
      set({ syncStatus: 'demo', isAuthenticated: false, userEmail: null });
      return;
    }

    set({ isAuthenticated: true, userEmail: 'Vault Token' });
    await get().syncFromSupabase();

    if (realtimeChannel) {
      await client.removeChannel(realtimeChannel);
    }

    const topic = await getVaultSyncTopic();
    realtimeChannel = client
      .channel(topic)
      .on('broadcast', { event: 'vault-changed' }, (msg) => {
        const sender = (msg?.payload as { senderId?: string } | undefined)?.senderId;
        if (sender && sender === CLIENT_INSTANCE_ID) return;
        if (broadcastSyncDebounce) clearTimeout(broadcastSyncDebounce);
        broadcastSyncDebounce = setTimeout(() => {
          get().syncFromSupabase();
        }, 250);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          set({ syncStatus: 'synced' });
        }
      });
  },

  syncFromSupabase: async () => {
    const client = getSupabaseClient();
    if (!client) return;

    set({ syncStatus: 'syncing', lastSyncError: null });
    try {
      const { data: worlds, error: wErr } = await client.from('worlds').select('*').limit(1);
      if (wErr) throw wErr;

      if (!worlds || worlds.length === 0) {
        // First time this GM logs into Supabase: upload current workspace into cloud
        await get().seedSupabaseWorld();
        return;
      }

      const activeWorld = worlds[0] as World;
      const [entRes, linkRes, mapRes, pinRes, pathRes, assetRes, tplRes] = await Promise.all([
        client.from('entities').select('*').eq('world_id', activeWorld.id),
        client.from('entity_links').select('*').eq('world_id', activeWorld.id),
        client.from('maps').select('*').eq('world_id', activeWorld.id),
        client.from('map_pins').select('*'),
        client.from('map_paths').select('*'),
        client.from('vault_assets').select('*').eq('world_id', activeWorld.id),
        client.from('entity_templates').select('*').eq('world_id', activeWorld.id),
      ]);

      if (entRes.error) throw entRes.error;
      if (mapRes.error) throw mapRes.error;

      const loadedEntities = (entRes.data || []) as Entity[];
      const loadedLinks = (linkRes.data || []) as EntityLink[];
      const loadedMaps = ((mapRes.data || []) as VaultMap[]).map((m) => normalizeMapOverlay(m));
      const mapIds = new Set(loadedMaps.map((m) => m.id));
      const loadedPins = ((pinRes.data || []) as MapPin[]).filter((p) => mapIds.has(p.map_id));
      const loadedPaths = ((pathRes.data || []) as MapPath[]).filter((p) => mapIds.has(p.map_id));
      const loadedAssets = (assetRes.data || []) as VaultAsset[];

      const mergedTemplates: Record<EntityType, EntityTemplate> = { ...DEFAULT_TEMPLATES };
      for (const row of (tplRes.data || []) as Array<{
        type: EntityType;
        label: string;
        summary_placeholder: string;
        default_tags: string[];
        metadata: Record<string, string | number | boolean>;
        content: string;
        custom_css: string;
      }>) {
        mergedTemplates[row.type] = {
          type: row.type,
          label: row.label,
          summaryPlaceholder: row.summary_placeholder || '',
          defaultTags: row.default_tags || [],
          metadata: row.metadata || {},
          content: row.content || '',
          customCss: row.custom_css || '',
        };
      }

      const prevState = get();
      // Remap open tabs so local demo IDs seamlessly rebind to cloud UUIDs
      const remappedTabs: TabItem[] = [];
      for (const tab of prevState.tabs) {
        if (tab.kind === 'entity') {
          const oldEnt = prevState.entities.find((e) => e.id === tab.targetId);
          const match =
            loadedEntities.find((e) => e.id === tab.targetId) ||
            (oldEnt ? loadedEntities.find((e) => e.slug === oldEnt.slug || e.title === oldEnt.title) : undefined);
          if (match) {
            remappedTabs.push({ ...tab, targetId: match.id, title: match.title });
          }
        } else if (tab.kind === 'map') {
          const oldMap = prevState.maps.find((m) => m.id === tab.targetId);
          const match =
            loadedMaps.find((m) => m.id === tab.targetId) ||
            (oldMap ? loadedMaps.find((m) => m.name === oldMap.name) : loadedMaps[0]);
          if (match) {
            remappedTabs.push({ ...tab, targetId: match.id, title: match.name });
          }
        } else if (tab.kind === 'asset') {
          const oldAsset = prevState.assets.find((a) => a.id === tab.targetId);
          const match =
            loadedAssets.find((a) => a.id === tab.targetId) ||
            (oldAsset ? loadedAssets.find((a) => a.slug === oldAsset.slug) : undefined);
          if (match) {
            remappedTabs.push({ ...tab, targetId: match.id, title: match.name });
          }
        } else {
          remappedTabs.push(tab);
        }
      }

      if (remappedTabs.length === 0 && loadedEntities[0]) {
        remappedTabs.push({
          id: `tab-${loadedEntities[0].id}`,
          kind: 'entity',
          targetId: loadedEntities[0].id,
          title: loadedEntities[0].title,
          iconType: loadedEntities[0].type,
        });
      }

      const nextActiveTabId = remappedTabs.some((t) => t.id === prevState.activeTabId)
        ? prevState.activeTabId
        : remappedTabs[0]?.id || '';

      const finalMaps = loadedMaps.length > 0 ? loadedMaps : prevState.maps;
      const finalAssets = loadedAssets.length > 0 ? loadedAssets : prevState.assets;
      saveMapsToStorage(finalMaps);
      saveAssetsToStorage(finalAssets);
      saveTemplatesToStorage(mergedTemplates);

      set({
        world: activeWorld,
        entities: loadedEntities,
        entityLinks: loadedLinks,
        maps: finalMaps,
        mapPins: loadedPins,
        mapPaths: loadedPaths,
        assets: finalAssets,
        templates: mergedTemplates,
        tabs: remappedTabs,
        activeTabId: nextActiveTabId,
        syncStatus: 'synced',
      });
    } catch (err) {
      set({
        syncStatus: 'error',
        lastSyncError: err instanceof Error ? err.message : 'Failed to sync with Supabase',
      });
    }
  },

  seedSupabaseWorld: async () => {
    const client = getSupabaseClient();
    if (!client) return;

    const currentState = get();
    const freshSeed = buildSeedDataset();
    const idMap = new Map<string, string>();
    const toUuid = (oldId: string) => {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(oldId)) {
        return oldId;
      }
      if (!idMap.has(oldId)) {
        idMap.set(oldId, crypto.randomUUID());
      }
      return idMap.get(oldId)!;
    };

    const sourceEntities =
      currentState.entities.length > 0 ? currentState.entities : freshSeed.entities;
    const sourceLinks =
      currentState.entityLinks.length > 0 ? currentState.entityLinks : freshSeed.entityLinks;
    const sourceMaps = currentState.maps.length > 0 ? currentState.maps : freshSeed.maps;
    const sourcePins = currentState.mapPins.length > 0 ? currentState.mapPins : freshSeed.mapPins;
    const sourcePaths =
      currentState.mapPaths.length > 0 ? currentState.mapPaths : freshSeed.mapPaths;
    const sourceAssets = currentState.assets;

    const worldUuid = toUuid(currentState.world.id || freshSeed.world.id);
    const worldRow: World = {
      ...currentState.world,
      id: worldUuid,
      owner_id: null,
    };

    const { error: wErr } = await client.from('worlds').insert(worldRow);
    if (wErr) {
      set({ syncStatus: 'error', lastSyncError: wErr.message });
      return;
    }

    const entityRows = sourceEntities.map((e) => ({
      ...e,
      id: toUuid(e.id),
      world_id: worldUuid,
    }));
    if (entityRows.length > 0) {
      const { error } = await client.from('entities').insert(entityRows);
      if (error) {
        set({ syncStatus: 'error', lastSyncError: error.message });
        return;
      }
    }

    const linkRows = sourceLinks.map((l) => ({
      source_id: toUuid(l.source_id),
      target_id: toUuid(l.target_id),
      world_id: worldUuid,
    }));
    if (linkRows.length > 0) {
      await client.from('entity_links').insert(linkRows);
    }

    const remappedMaps = sourceMaps.map((m) => ({
      ...m,
      id: toUuid(m.id),
      world_id: worldUuid,
      zones: (m.zones || []).map((z) => ({
        ...z,
        entityId: z.entityId ? toUuid(z.entityId) : null,
      })),
    }));
    const mapRows = remappedMaps.map((m) => serializeMapRow(m, false));
    if (mapRows.length > 0) {
      let { error } = await client.from('maps').insert(mapRows);
      if (error && /layers|zones|labels|column/i.test(error.message)) {
        const retry = await client.from('maps').insert(remappedMaps.map((m) => serializeMapRow(m, true)));
        error = retry.error;
      }
      if (error) {
        set({ syncStatus: 'error', lastSyncError: error.message });
        return;
      }
    }

    const pinRows = sourcePins.map((p) => ({
      ...p,
      id: toUuid(p.id),
      map_id: toUuid(p.map_id),
      entity_id: p.entity_id ? toUuid(p.entity_id) : null,
    }));
    if (pinRows.length > 0) {
      await client.from('map_pins').insert(pinRows);
    }

    const pathRows = sourcePaths.map((p) => ({
      ...p,
      id: toUuid(p.id),
      map_id: toUuid(p.map_id),
    }));
    if (pathRows.length > 0) {
      await client.from('map_paths').insert(pathRows);
    }

    if (sourceAssets.length > 0) {
      const assetRows = sourceAssets.map((a) => ({
        ...a,
        id: toUuid(a.id),
        world_id: worldUuid,
      }));
      await client.from('vault_assets').insert(assetRows);
    }

    const templateRows = Object.values(currentState.templates).map((tpl) =>
      serializeTemplateRow(worldUuid, tpl)
    );
    if (templateRows.length > 0) {
      await client.from('entity_templates').upsert(templateRows);
    }

    await get().syncFromSupabase();
  },

  signOutVault: async () => {
    const client = getSupabaseClient();
    if (client && realtimeChannel) {
      await client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    clearStoredVaultToken();
    set({ isAuthenticated: false, userEmail: null, syncStatus: 'demo' });
  },
}));
