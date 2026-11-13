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
  | 'peninsula';

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
  | 'ruin';

export interface MapProp {
  id: string;
  kind: MapPropKind;
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
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
  width: number;
  height: number;
  displacement_scale: number;
  scale_config: MapScaleConfig;
  generation_config?: MapGenerationConfig;
  atmosphere?: WorldAtmospherePreset;
  rivers?: MapRiver[];
  props?: MapProp[];
  battlemap?: BattlemapData;
}

export type PinIconType =
  | 'settlement'
  | 'citadel'
  | 'ruin'
  | 'port'
  | 'landmark'
  | 'camp'
  | 'danger';

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
export type MapToolMode = 'select' | 'pin' | 'path' | 'region' | 'link';
export type WorldsmithTool =
  | 'raise'
  | 'valley'
  | 'flatten'
  | 'smooth'
  | 'coast'
  | 'river'
  | 'paint-flora'
  | 'place-mesh'
  | 'edit-mesh'
  | 'erase-mesh';
export type BrushFalloff = 'smooth' | 'peak' | 'plateau';
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
  locations: boolean;
  paths: boolean;
  regions: boolean;
}
