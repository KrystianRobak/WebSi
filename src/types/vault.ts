export type EntityType =
  | 'Character'
  | 'Location'
  | 'Faction'
  | 'Organization'
  | 'Item'
  | 'Bestiary'
  | 'Deity'
  | 'Event'
  | 'Chronicle'
  | 'Session'
  | 'PlotThread'
  | 'Quest'
  | 'PlayerNote'
  | 'Region'
  | 'Culture'
  | 'History'
  | 'Magic'
  | 'Language'
  | 'Campaign';

export type EntityCategory = 'encyclopedia' | 'campaign' | 'world';

export interface World {
  id: string;
  owner_id?: string | null;
  name: string;
  description: string;
}

export interface Entity {
  id: string;
  world_id: string;
  slug: string;
  title: string;
  type: EntityType;
  category: EntityCategory;
  tags: string[];
  summary: string;
  content: string;
  gm_secrets: string;
  cover_image_url?: string | null;
  metadata: Record<string, string | number | boolean>;
  is_favorite: boolean;
  updated_at: string;
}

export interface EntityLink {
  source_id: string;
  target_id: string;
  world_id: string;
}

export interface MapScaleConfig {
  ratio: string;
  elevationSource: string;
  kmPerUnit: number;
}

export type MapKind = '3d' | '2d';

export type TerrainArchetype =
  | 'archipelago'
  | 'fjord'
  | 'basin'
  | 'caldera'
  | 'peninsula'
  | 'continent'
  | 'blank';

export interface MapGenerationConfig {
  seed: number;
  archetype: TerrainArchetype;
  continentScale: number;
  ridgeSharpness: number;
  seaLevel: number;
  valleyDepth: number;
  riverCount: number;
  treeDensity: number;
  rockDensity: number;
  /** Edge length of the square world in scene units (100 = classic size). */
  worldSize?: number;
}

/** Animated ocean / sea surface settings (per map). */
export interface WaterSettings {
  waveHeight: number; // 0..2 multiplier
  waveScale: number; // 0.4..2.5 wavelength multiplier
  waveSpeed: number; // 0..2.5
  windDirection: number; // degrees, 0 = waves travelling toward +X
  choppiness: number; // 0..1 crest sharpness
  foamAmount: number; // 0..2 whitecap + shore foam multiplier
  shoreWaves: number; // 0..2 rolling shoreline breaker bands
  clarity: number; // 0..1 (0 murky, 1 crystal clear)
  deepColor?: string | null; // override (null = from atmosphere)
  shallowColor?: string | null; // override (null = from atmosphere)
}

/** Procedural biome shading settings for the terrain. */
export interface TerrainShadingSettings {
  snowLine: number; // 0..1 normalized height where snow starts
  aridity: number; // 0..1 (0 = lush & green, 1 = deserts & steppe)
  beachWidth: number; // 0..1
  vegetationHue: number; // -1..1 (cooler/teal .. warmer/autumn)
  albedoBlend: number; // 0..1 how much an uploaded albedo image tints the terrain
  colorRichness?: number; // 0.4..2.0 biome saturation / vibrance boost
  rockContrast?: number; // 0.5..2.0 strata & micro-normal cliff sharpness
  lushness?: number; // 0..1.5 procedural meadow/forest blend weight
}

export type FogVolumeShape = 'box' | 'sphere' | 'cylinder';

/** Placeable raymarched volumetric fog region. */
export interface FogVolume {
  id: string;
  name: string;
  shape: FogVolumeShape;
  x: number;
  y: number; // base (bottom) height
  z: number;
  width: number; // X size
  depth: number; // Z size
  height: number; // Y size
  rotY: number;
  color: string;
  density: number; // 0..2
  edgeSoftness: number; // 0..1
  heightFalloff: number; // 0..1 (thicker near the ground)
  noiseScale: number; // 0.2..3
  noiseStrength: number; // 0..1
  windSpeed: number; // 0..3
  windDirection: number; // degrees
  glow: number; // 0..2 emissive self-illumination
  lightScattering: number; // 0..1 sun forward scattering
  visible: boolean;
  is_gm_only: boolean;
}

export interface MapRiver {
  id: string;
  name: string;
  points: PathPoint[];
  width: number;
  depth: number;
}

export type MapPropKind =
  | 'pine'
  | 'oak'
  | 'deadwood'
  | 'boulder'
  | 'tower'
  | 'pier'
  | 'bridge'
  | 'ruin'
  | 'castle'
  | 'village'
  | 'temple'
  | 'monolith'
  | 'windmill'
  | 'ship'
  | 'campfire'
  | 'gate';

export interface MapProp {
  id: string;
  kind: MapPropKind;
  name?: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
}

export type WorldLayerCategory =
  | 'country'
  | 'region'
  | 'religion'
  | 'culture'
  | 'faction'
  | 'climate'
  | 'custom';

export interface WorldMapLayer {
  id: string;
  name: string;
  category: WorldLayerCategory;
  color: string;
  visible: boolean;
  opacity: number;
  order: number;
}

export type ZoneBorderStyle = 'solid' | 'dashed' | 'double' | 'none';

export interface WorldMapZone {
  id: string;
  layerId: string;
  name: string;
  points: PathPoint[];
  color: string;
  fillOpacity?: number;
  borderStyle: ZoneBorderStyle;
  borderWidth?: number;
  showLabel: boolean;
  labelScale?: number;
  entityId?: string | null;
  description?: string;
  is_gm_only: boolean;
}

export type MapLabelStyle = 'title' | 'region' | 'sea' | 'callout' | 'note';

export interface WorldMapLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  z: number;
  yOffset: number;
  fontSize: number;
  color: string;
  rotationY: number;
  style: MapLabelStyle;
  layerId?: string | null;
  opacity: number;
  is_gm_only: boolean;
}

export type TokenDisposition = 'party' | 'ally' | 'enemy' | 'neutral';

export interface BattlemapToken {
  id: string;
  name: string;
  entity_id?: string | null;
  disposition: TokenDisposition;
  x: number; // pixel coordinates on battlemap canvas
  y: number;
  sizeCells: number;
  hp: number;
  maxHp: number;
  ac: number;
  visionRangeFt: number;
  lightRadiusFt: number;
  lightColor: string;
  isHidden: boolean; // GM-only hidden enemy/ambush
  badgeColor?: string;
}

export interface BattlemapWall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'wall' | 'pillar' | 'secret-wall';
}

export interface BattlemapDoor {
  id: string;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isOpen: boolean;
  isLocked: boolean;
  isSecret: boolean;
}

export interface BattlemapLight {
  id: string;
  label: string;
  x: number;
  y: number;
  radiusFt: number;
  color: string;
  intensity: number;
  isOn: boolean;
  flicker: boolean;
}

export type BattlemapTheme = 'stone-crypt' | 'harbor-tavern' | 'obsidian-sanctum' | 'forest-clearing';

export type BattlemapPropKind =
  | 'table'
  | 'chest'
  | 'altar'
  | 'pillar'
  | 'statue'
  | 'crate'
  | 'campfire'
  | 'trap'
  | 'hazard'
  | 'marker';

export interface BattlemapProp {
  id: string;
  kind: BattlemapPropKind;
  label: string;
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
  rotationDeg: number;
  color: string;
  notes?: string;
  entityId?: string | null;
  isSecret: boolean;
  blocksLight?: boolean;
}

export type WorldAtmospherePreset =
  | 'golden-hour'
  | 'high-noon'
  | 'moonlit-night'
  | 'crimson-eclipse';

export interface BattlemapData {
  theme: BattlemapTheme;
  backgroundUrl?: string | null;
  width: number;
  height: number;
  gridSizePx: number; // 1 square = 5 ft
  showGrid: boolean;
  gridOpacity: number;
  ambientLight: number; // 0.05 (pitch dark) .. 1.0 (full daylight)
  dynamicLighting: boolean;
  tokens: BattlemapToken[];
  walls: BattlemapWall[];
  doors: BattlemapDoor[];
  lights: BattlemapLight[];
  props?: BattlemapProp[];
  sceneNotes?: string;
}

export interface VaultMap {
  id: string;
  world_id: string;
  name: string;
  kind?: MapKind; // defaults to '3d'
  albedo_url?: string | null;
  heightmap_url?: string | null;
  paint_url?: string | null;
  width: number;
  height: number;
  displacement_scale: number;
  world_size?: number;
  sea_level?: number;
  scale_config: MapScaleConfig;
  generation_config?: MapGenerationConfig;
  atmosphere?: WorldAtmospherePreset;
  water?: WaterSettings;
  terrain_shading?: TerrainShadingSettings;
  fog_volumes?: FogVolume[];
  rivers?: MapRiver[];
  props?: MapProp[];
  layers?: WorldMapLayer[];
  zones?: WorldMapZone[];
  labels?: WorldMapLabel[];
  battlemap?: BattlemapData;
}

export type PinIconType =
  | 'settlement'
  | 'citadel'
  | 'ruin'
  | 'port'
  | 'landmark'
  | 'camp'
  | 'danger'
  | 'capital'
  | 'temple'
  | 'fortress';

export interface MapPin {
  id: string;
  map_id: string;
  entity_id?: string | null;
  label: string;
  x: number;
  y: number;
  z: number;
  icon_type: PinIconType;
  is_gm_only: boolean;
}

export interface PathPoint {
  x: number;
  y: number;
  z: number;
}

export type MapPathStyle = 'dashed-gold' | 'solid-amber' | 'region-polygon' | 'gm-secret-route';

export interface MapPath {
  id: string;
  map_id: string;
  name: string;
  points: PathPoint[];
  style: MapPathStyle;
  is_gm_only: boolean;
}

export type AssetKind = 'portrait' | 'scene' | 'handout' | 'map';

export interface VaultAsset {
  id: string;
  slug: string;
  name: string;
  url: string;
  kind: AssetKind;
  created_at: string;
}

export interface EntityTemplate {
  type: EntityType;
  label: string;
  summaryPlaceholder: string;
  defaultTags: string[];
  metadata: Record<string, string | number | boolean>;
  content: string;
  customCss: string;
}

export interface TabItem {
  id: string;
  kind: 'map' | 'entity' | 'asset' | 'template';
  targetId: string;
  title: string;
  subtitle?: string;
  iconType: string;
}

export type EditorMode = 'code' | 'preview';
export type MapRenderMode = 'map' | 'terrain';
export type MapCameraView = 'perspective' | 'top';
export type MapToolMode = 'select' | 'pin' | 'text' | 'zone' | 'path' | 'region' | 'element' | 'link';
export type WorldsmithTool =
  | 'raise'
  | 'valley'
  | 'flatten'
  | 'smooth'
  | 'coast'
  | 'ridge'
  | 'noise'
  | 'terrace'
  | 'erode'
  | 'stamp'
  | 'paint-biome'
  | 'river'
  | 'paint-flora'
  | 'place-mesh'
  | 'edit-mesh'
  | 'erase-mesh'
  | 'fog';
export type BrushFalloff = 'smooth' | 'peak' | 'plateau';
export type TerrainStampKind = 'mountain' | 'volcano' | 'crater' | 'mesa' | 'island' | 'lake' | 'canyon';
export type BiomePaintKind =
  | 'grass'
  | 'forest'
  | 'meadow'
  | 'sand'
  | 'desert'
  | 'savanna'
  | 'swamp'
  | 'tundra'
  | 'rock'
  | 'snow'
  | 'volcanic'
  | 'autumn'
  | 'crimson'
  | 'arcane'
  | 'erase';

/** Commands sent from UI to the live 3D terrain scene. */
export type TerrainCommand =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'blank'; preset: 'plains' | 'ocean' | 'hills'; seed?: number }
  | { type: 'smooth-all'; iterations?: number }
  | { type: 'erode-all'; iterations?: number }
  | { type: 'noise-all'; amount?: number }
  | { type: 'raise-all'; delta: number }
  | { type: 'clear-paint' }
  | { type: 'expand'; newWorldSize: number };
export type BattlemapToolMode =
  | 'select'
  | 'place-party'
  | 'place-enemy'
  | 'place-light'
  | 'place-prop'
  | 'draw-wall'
  | 'draw-door'
  | 'erase'
  | 'measure';
export type InspectorSubTab = 'details' | 'connections' | 'references';

export interface MapLayerVisibility {
  terrain: boolean;
  vegetation: boolean;
  rivers: boolean;
  locations: boolean;
  paths: boolean;
  regions: boolean;
  labels: boolean;
}
