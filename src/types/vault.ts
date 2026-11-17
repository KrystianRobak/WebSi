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

export type CampaignMode = 'normal' | 'west_marches';
export type CampaignRole = 'gm' | 'co_gm' | 'player';

export interface PlayerProfile {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  bio: string;
  updated_at?: string;
}

export interface CampaignCalendarConfig {
  eraName: string;
  currentYear: number;
  currentMonthIndex: number;
  currentDay: number;
  months: Array<{ name: string; days: number }>;
  weekdays: string[];
}

export interface World {
  id: string;
  owner_id?: string | null;
  name: string;
  description: string;
  mode: CampaignMode;
  invite_code?: string | null;
  max_players_per_party?: number;
  calendar_config?: CampaignCalendarConfig | null;
  active_sheet_template_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CampaignMember {
  campaign_id: string;
  user_id: string;
  role: CampaignRole;
  joined_at: string;
  profile?: PlayerProfile;
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
  character_id?: string | null;
  owner_user_id?: string | null;
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
  conditions?: string[];
  elevationFt?: number;
  auraRadiusFt?: number;
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

export type AoeTemplateShape = 'circle' | 'cone' | 'line' | 'square';

export interface BattlemapAoeTemplate {
  id: string;
  shape: AoeTemplateShape;
  label: string;
  x: number;
  y: number;
  radiusFt: number;
  angleDeg: number;
  color: string;
}

export interface CombatTurnEntry {
  id: string;
  name: string;
  initiative: number;
  tokenId?: string | null;
  characterId?: string | null;
  ownerUserId?: string | null;
  hp?: number;
  maxHp?: number;
  ac?: number;
  conditions: string[];
  isHidden?: boolean;
}

export interface BattlemapCombatState {
  active: boolean;
  round: number;
  activeTurnIndex: number;
  entries: CombatTurnEntry[];
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
  fogOfWarEnabled?: boolean;
  revealedMaskUrl?: string | null;
  tokens: BattlemapToken[];
  walls: BattlemapWall[];
  doors: BattlemapDoor[];
  lights: BattlemapLight[];
  props?: BattlemapProp[];
  aoeTemplates?: BattlemapAoeTemplate[];
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
  fog_of_war_2d?: string | null;
  combat_state?: BattlemapCombatState | null;
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
  world_id?: string;
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

// ----------------------------------------------------------------------------
// Character Sheets (Roll20-Style) & Characters
// ----------------------------------------------------------------------------
export interface SheetFieldSchema {
  defaults?: Record<string, string | number | boolean>;
  computed?: Record<string, string>;
  rolls?: Record<string, string>;
}

export interface CharacterSheetTemplate {
  id: string;
  campaign_id: string;
  name: string;
  system_label: string;
  html_template: string;
  css_template: string;
  schema_json: SheetFieldSchema;
  updated_by?: string | null;
  updated_at?: string;
}

export type SheetAttributeValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<Record<string, string | number | boolean>>;

export interface CharacterRecord {
  id: string;
  campaign_id: string;
  user_id: string;
  name: string;
  portrait_url?: string | null;
  entity_id?: string | null;
  sheet_template_id?: string | null;
  attributes: Record<string, SheetAttributeValue>;
  is_active: boolean;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// West Marches Guild Quest Boards & Signups
// ----------------------------------------------------------------------------
export type GuildQuestStatus = 'open' | 'full' | 'in_progress' | 'completed' | 'archived';

export interface MapQuestBoard {
  id: string;
  map_id: string;
  campaign_id: string;
  title: string;
  description: string;
  x: number;
  y: number;
  z: number;
  created_by?: string | null;
  created_at?: string;
}

export interface GuildQuest {
  id: string;
  board_id: string;
  campaign_id: string;
  title: string;
  summary: string;
  danger_tier: string;
  reward: string;
  scheduled_at?: string | null;
  max_players: number;
  status: GuildQuestStatus;
  linked_entity_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface GuildQuestSignup {
  id: string;
  quest_id: string;
  campaign_id: string;
  user_id: string;
  character_id: string;
  note: string;
  signed_up_at: string;
}

// ----------------------------------------------------------------------------
// Player Journals & Sharing
// ----------------------------------------------------------------------------
export type JournalShareScope = 'private' | 'selected' | 'campaign';

export interface JournalPage {
  id: string;
  campaign_id: string;
  owner_id: string;
  title: string;
  content: string;
  tags: string[];
  share_scope: JournalShareScope;
  updated_at: string;
}

export interface JournalPageShare {
  page_id: string;
  shared_with_user_id: string;
  can_edit: boolean;
}

// ----------------------------------------------------------------------------
// Per-Player Fog of War & Sharing
// ----------------------------------------------------------------------------
export interface MapFogState {
  map_id: string;
  user_id: string;
  campaign_id: string;
  mask_url: string;
  updated_at: string;
}

export interface MapFogShare {
  id: string;
  map_id: string;
  campaign_id: string;
  owner_user_id: string;
  shared_with_user_id?: string | null;
  share_all: boolean;
}

// ----------------------------------------------------------------------------
// Dice Roller & Campaign Timeline
// ----------------------------------------------------------------------------
export interface DiceRollBreakdown {
  groups: Array<{
    notation: string;
    rolls: number[];
    kept: number[];
    subtotal: number;
  }>;
  modifier: number;
}

export interface DiceRollRecord {
  id: string;
  campaign_id: string;
  user_id: string;
  character_id?: string | null;
  label: string;
  expression: string;
  total: number;
  breakdown: DiceRollBreakdown;
  is_gm_blind: boolean;
  created_at: string;
}

export interface TimelineEvent {
  id: string;
  campaign_id: string;
  title: string;
  date_label: string;
  sort_order: number;
  era: string;
  description: string;
  linked_entity_id?: string | null;
  is_gm_only: boolean;
  created_by?: string | null;
  created_at?: string;
}

// ----------------------------------------------------------------------------
// Workspace Tabs & Tooling Modes
// ----------------------------------------------------------------------------
export type TabKind =
  | 'map'
  | 'entity'
  | 'asset'
  | 'template'
  | 'journal'
  | 'character'
  | 'sheet_studio'
  | 'timeline'
  | 'profile_hub';

export interface TabItem {
  id: string;
  kind: TabKind;
  targetId: string;
  title: string;
  subtitle?: string;
  iconType: string;
}

export type EditorMode = 'code' | 'preview';
export type MapRenderMode = 'map' | 'terrain';
export type MapCameraView = 'perspective' | 'top';
export type MapToolMode =
  | 'select'
  | 'pin'
  | 'text'
  | 'zone'
  | 'path'
  | 'region'
  | 'element'
  | 'link'
  | 'quest-board'
  | 'fog-brush';
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
  | { type: 'expand'; newWorldSize: number }
  | { type: 'save-textures' };
export type BattlemapToolMode =
  | 'select'
  | 'place-party'
  | 'place-enemy'
  | 'place-light'
  | 'place-prop'
  | 'place-quest-board'
  | 'draw-wall'
  | 'draw-door'
  | 'fog-reveal'
  | 'fog-hide'
  | 'aoe'
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
  questBoards?: boolean;
  fogOfWar?: boolean;
}
