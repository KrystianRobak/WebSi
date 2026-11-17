import type { StateCreator } from 'zustand';
import { DEFAULT_CALENDAR_CONFIG } from '../../data/seedData';
import type { HistorySnapshot } from '../../lib/campaignSync';
import type { DiceRollResult } from '../../lib/diceParser';
import type { FogPresetId } from '../../lib/worldEnvironment';
import type { getSupabaseClient } from '../../lib/supabase';
import type {
  AssetKind,
  BattlemapAoeTemplate,
  BattlemapCombatState,
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
  CampaignCalendarConfig,
  CampaignMember,
  CampaignMode,
  CampaignRole,
  CharacterRecord,
  CharacterSheetTemplate,
  DiceRollRecord,
  EditorMode,
  Entity,
  EntityCategory,
  EntityLink,
  EntityTemplate,
  EntityType,
  FogVolume,
  GuildQuest,
  GuildQuestSignup,
  InspectorSubTab,
  JournalPage,
  JournalPageShare,
  JournalShareScope,
  MapCameraView,
  MapFogShare,
  MapFogState,
  MapGenerationConfig,
  MapKind,
  MapLayerVisibility,
  MapPath,
  MapPin,
  MapProp,
  MapPropKind,
  MapQuestBoard,
  MapRenderMode,
  MapRiver,
  MapToolMode,
  PathPoint,
  PinIconType,
  PlayerProfile,
  SheetAttributeValue,
  SheetFieldSchema,
  TabItem,
  TerrainCommand,
  TerrainShadingSettings,
  TerrainStampKind,
  TimelineEvent,
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
} from '../../types/vault';

export type SyncStatus = 'offline' | 'connecting' | 'synced' | 'syncing' | 'error';

export type LeftNavSection =
  | 'vault'
  | 'journals'
  | 'characters'
  | 'sheet_studio'
  | 'timeline'
  | 'assets'
  | 'templates'
  | 'profile';

export const EMPTY_WORLD: World = {
  id: '',
  owner_id: null,
  name: 'No Campaign Selected',
  description: '',
  mode: 'normal',
  max_players_per_party: 5,
  calendar_config: DEFAULT_CALENDAR_CONFIG,
};

export const DEFAULT_MAP_LAYERS: MapLayerVisibility = {
  terrain: true,
  vegetation: true,
  rivers: true,
  locations: true,
  paths: true,
  regions: true,
  labels: true,
  questBoards: true,
  fogOfWar: true,
};

export interface AuthUserSummary {
  id: string;
  email: string | null;
}

export type RealtimeChannelHandle = ReturnType<
  NonNullable<ReturnType<typeof getSupabaseClient>>['channel']
>;

export const CLIENT_INSTANCE_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random()}`;

export const syncRuntime = {
  realtimeChannel: null as RealtimeChannelHandle | null,
  entitySyncTimers: new Map<string, ReturnType<typeof setTimeout>>(),
  mapSyncTimers: new Map<string, ReturnType<typeof setTimeout>>(),
  journalSyncTimers: new Map<string, ReturnType<typeof setTimeout>>(),
  characterSyncTimers: new Map<string, ReturnType<typeof setTimeout>>(),
  broadcastSyncDebounce: null as ReturnType<typeof setTimeout> | null,
  realtimeSyncDebounce: null as ReturnType<typeof setTimeout> | null,
  authSubscribed: false,
  authInitInFlight: false,
  lastEntityUndoId: null as string | null,
  lastEntityUndoAt: 0,
};

export function broadcastVaultChange(reason: string): void {
  if (!syncRuntime.realtimeChannel) return;
  syncRuntime.realtimeChannel.send({
    type: 'broadcast',
    event: 'vault-changed',
    payload: { senderId: CLIENT_INSTANCE_ID, reason, ts: Date.now() },
  });
}

export interface VaultState {
  // Auth & Profile
  isAuthenticated: boolean;
  authLoading: boolean;
  authError: string | null;
  user: AuthUserSummary | null;
  userEmail: string | null;
  profile: PlayerProfile | null;
  pendingInviteCode: string | null;

  // Campaigns & Members
  campaigns: World[];
  activeCampaignId: string | null;
  world: World;
  campaignMembers: CampaignMember[];
  myRole: CampaignRole | null;
  syncStatus: SyncStatus;
  lastSyncError: string | null;

  // Core Vault Data (for active campaign)
  entities: Entity[];
  entityLinks: EntityLink[];
  maps: VaultMap[];
  mapPins: MapPin[];
  mapPaths: MapPath[];
  assets: VaultAsset[];
  templates: Record<EntityType, EntityTemplate>;

  // Characters & Roll20 Sheets
  sheetTemplates: CharacterSheetTemplate[];
  characters: CharacterRecord[];

  // West Marches Guild Quests
  questBoards: MapQuestBoard[];
  guildQuests: GuildQuest[];
  guildQuestSignups: GuildQuestSignup[];

  // Player Journals
  journalPages: JournalPage[];
  journalPageShares: JournalPageShare[];

  // Fog of War, Dice & Timeline
  mapFogStates: MapFogState[];
  mapFogShares: MapFogShare[];
  diceRolls: DiceRollRecord[];
  diceDrawerOpen: boolean;
  timelineEvents: TimelineEvent[];

  // Navigation & Tabs
  tabs: TabItem[];
  activeTabId: string;
  splitPaneTabId: string | null;
  editorMode: EditorMode;
  inspectorSubTab: InspectorSubTab;
  inspectorWidth: number;
  leftNavOpen: boolean;
  leftNavSection: LeftNavSection;
  rightInspectorCollapsed: boolean;
  gmMode: boolean;
  leftFilterQuery: string;
  selectedSidebarFilter: string | null;

  // 3D Map Viewport State
  mapRenderMode: MapRenderMode;
  mapCameraView: MapCameraView;
  mapToolMode: MapToolMode;
  mapLayers: MapLayerVisibility;
  selectedPinId: string | null;
  hoveredPinId: string | null;
  selectedZoneId: string | null;
  selectedLabelId: string | null;
  selectedQuestBoardId: string | null;
  activeQuestBoardModalId: string | null;
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
  fogBrushTargetUserId: string; // '__all__' | user_id
  fogBrushRevealMode: boolean;
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
  settingsModalOpen: boolean;
  newEntryModalOpen: boolean;
  newEntryDefaultType: EntityType;
  newEntryDefaultCategory: EntityCategory;

  // History
  past: HistorySnapshot[];
  future: HistorySnapshot[];

  // Permission Helpers
  isEffectiveGm: () => boolean;
  canEditToken: (token: BattlemapToken) => boolean;

  // Auth Actions
  initSupabaseSync: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  signOutVault: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<PlayerProfile, 'display_name' | 'avatar_url' | 'bio'>>) => Promise<void>;
  setPendingInviteCode: (code: string | null) => void;

  // Campaign Lifecycle & Member Actions
  loadMyCampaigns: () => Promise<void>;
  switchCampaign: (campaignId: string) => Promise<void>;
  createCampaign: (payload: {
    name: string;
    description?: string;
    mode: CampaignMode;
    maxPlayersPerParty?: number;
    seedStarter?: boolean;
  }) => Promise<{ worldId: string | null; error: string | null }>;
  importCampaignArchiveJson: (
    rawJson: string,
    options?: { nameOverride?: string; modeOverride?: CampaignMode }
  ) => Promise<{ worldId: string | null; error: string | null }>;
  joinCampaignByInvite: (inviteCode: string) => Promise<{ worldId: string | null; error: string | null }>;
  updateCampaignSettings: (
    patch: Partial<
      Pick<
        World,
        'name' | 'description' | 'mode' | 'max_players_per_party' | 'calendar_config' | 'active_sheet_template_id'
      >
    >
  ) => Promise<{ error: string | null }>;
  regenerateInviteCode: () => Promise<string | null>;
  updateMemberRole: (userId: string, role: CampaignRole) => Promise<{ error: string | null }>;
  removeCampaignMember: (userId: string) => Promise<{ error: string | null }>;
  leaveCampaign: (campaignId: string) => Promise<void>;
  syncFromSupabase: () => Promise<void>;
  seedSupabaseWorld: () => Promise<void>;

  // UI Actions
  setGmMode: (val: boolean) => void;
  setEditorMode: (mode: EditorMode) => void;
  setInspectorSubTab: (tab: InspectorSubTab) => void;
  setInspectorWidth: (width: number) => void;
  setLeftNavOpen: (open: boolean) => void;
  toggleLeftNav: () => void;
  setLeftNavSection: (section: LeftNavSection) => void;
  setRightInspectorCollapsed: (collapsed: boolean) => void;
  toggleRightInspector: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
  openNewEntryModal: (defaultType?: EntityType, defaultCategory?: EntityCategory) => void;
  closeNewEntryModal: () => void;
  setSelectedSidebarFilter: (filter: string | null) => void;
  setLeftFilterQuery: (q: string) => void;

  // Tabs
  setActiveTab: (tabId: string) => void;
  openEntityTab: (entityId: string, inSplit?: boolean) => void;
  openEntityByTitle: (titleOrSlug: string) => void;
  openMapTab: (mapId: string) => void;
  openAssetTab: (assetId: string) => void;
  openTemplateTab: (type: EntityType) => void;
  openJournalTab: (pageId?: string) => void;
  openCharacterTab: (characterId?: string) => void;
  openSheetStudioTab: (templateId?: string) => void;
  openTimelineTab: () => void;
  openProfileHubTab: () => void;
  closeTab: (tabId: string) => void;
  toggleSplitPane: () => void;

  // Map Viewport & 3D Worldsmith Actions
  setMapRenderMode: (mode: MapRenderMode) => void;
  setMapCameraView: (view: MapCameraView) => void;
  setMapToolMode: (mode: MapToolMode) => void;
  toggleMapLayer: (layer: keyof MapLayerVisibility) => void;
  setSelectedPinId: (id: string | null) => void;
  setHoveredPinId: (id: string | null) => void;
  setSelectedZoneId: (id: string | null) => void;
  setSelectedLabelId: (id: string | null) => void;
  setSelectedQuestBoardId: (id: string | null) => void;
  setActiveQuestBoardModalId: (id: string | null) => void;
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

  // World Layers, Zones & Labels
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
  createMapLabel: (mapId: string, payload: Omit<WorldMapLabel, 'id'>) => WorldMapLabel;
  updateMapLabel: (mapId: string, labelId: string, patch: Partial<WorldMapLabel>) => void;
  deleteMapLabel: (mapId: string, labelId: string) => void;

  // Lore Entities, Assets & Entity Templates
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
  setFogBrushTargetUserId: (userId: string) => void;
  setFogBrushRevealMode: (reveal: boolean) => void;
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

  // Undo / Redo
  undo: () => void;
  redo: () => void;

  // Character & Sheet Studio Actions
  createSheetTemplate: (payload: {
    name: string;
    system_label: string;
    html_template: string;
    css_template: string;
    schema_json: SheetFieldSchema;
  }) => Promise<CharacterSheetTemplate | null>;
  updateSheetTemplate: (
    id: string,
    patch: Partial<
      Pick<CharacterSheetTemplate, 'name' | 'system_label' | 'html_template' | 'css_template' | 'schema_json'>
    >
  ) => Promise<void>;
  deleteSheetTemplate: (id: string) => Promise<void>;
  setActiveCampaignSheetTemplate: (templateId: string | null) => Promise<void>;
  createCharacter: (payload: {
    name: string;
    portrait_url?: string | null;
    entity_id?: string | null;
    sheet_template_id?: string | null;
    attributes?: Record<string, SheetAttributeValue>;
    is_active?: boolean;
  }) => Promise<{ character: CharacterRecord | null; error: string | null }>;
  updateCharacter: (
    id: string,
    patch: Partial<
      Pick<CharacterRecord, 'name' | 'portrait_url' | 'entity_id' | 'sheet_template_id' | 'attributes' | 'is_active'>
    >
  ) => Promise<{ error: string | null }>;
  setActiveCharacter: (characterId: string) => Promise<{ error: string | null }>;
  deleteCharacter: (id: string) => Promise<void>;

  // Journal Actions
  createJournalPage: (payload: { title: string; content?: string; tags?: string[] }) => Promise<JournalPage | null>;
  updateJournalPage: (
    pageId: string,
    patch: Partial<Pick<JournalPage, 'title' | 'content' | 'tags' | 'share_scope'>>
  ) => Promise<void>;
  deleteJournalPage: (pageId: string) => Promise<void>;
  updateJournalSharing: (
    pageId: string,
    scope: JournalShareScope,
    shares: Array<{ shared_with_user_id: string; can_edit: boolean }>
  ) => Promise<{ error: string | null }>;

  // VTT Actions: Guild Quests, Fog of War, Dice Roller, Timeline, 2D Battlemap
  createQuestBoard: (payload: {
    map_id: string;
    title: string;
    description?: string;
    x: number;
    y: number;
    z: number;
  }) => Promise<MapQuestBoard | null>;
  deleteQuestBoard: (boardId: string) => Promise<void>;
  createGuildQuest: (payload: {
    board_id: string;
    title: string;
    summary?: string;
    danger_tier?: string;
    reward?: string;
    scheduled_at?: string | null;
    max_players: number;
    linked_entity_id?: string | null;
  }) => Promise<GuildQuest | null>;
  updateGuildQuest: (
    questId: string,
    patch: Partial<
      Pick<
        GuildQuest,
        'title' | 'summary' | 'danger_tier' | 'reward' | 'scheduled_at' | 'max_players' | 'status' | 'linked_entity_id'
      >
    >
  ) => Promise<void>;
  deleteGuildQuest: (questId: string) => Promise<void>;
  signupForQuest: (
    questId: string,
    characterId: string,
    note?: string
  ) => Promise<{ error: string | null }>;
  withdrawFromQuest: (questId: string) => Promise<{ error: string | null }>;

  updateMapFogState: (mapId: string, userId: string, maskUrl: string) => Promise<void>;
  upsertMapFogShare: (
    mapId: string,
    sharedWithUserId: string | null,
    shareAll: boolean
  ) => Promise<void>;
  revokeMapFogShare: (shareId: string) => Promise<void>;

  setDiceDrawerOpen: (open: boolean) => void;
  rollDiceAndPublish: (
    rawExpression: string,
    options?: { label?: string; characterId?: string | null; isGmBlind?: boolean }
  ) => Promise<{ result: DiceRollResult | null; error: string | null }>;

  createTimelineEvent: (payload: {
    title: string;
    date_label: string;
    sort_order: number;
    era: string;
    description: string;
    linked_entity_id?: string | null;
    is_gm_only?: boolean;
  }) => Promise<TimelineEvent | null>;
  updateTimelineEvent: (
    id: string,
    patch: Partial<Omit<TimelineEvent, 'id' | 'campaign_id'>>
  ) => Promise<void>;
  deleteTimelineEvent: (id: string) => Promise<void>;
  stepCampaignCalendar: (deltaDays: number) => Promise<void>;
  updateCalendarConfig: (config: CampaignCalendarConfig) => Promise<void>;

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
  moveBattlemapToken: (mapId: string, tokenId: string, x: number, y: number) => Promise<void>;
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
  addAoeTemplate: (mapId: string, tpl: Omit<BattlemapAoeTemplate, 'id'>) => void;
  deleteAoeTemplate: (mapId: string, aoeId: string) => void;
  setBattlemapFogUrl: (mapId: string, url: string | null) => void;
  setBattlemapCombatState: (mapId: string, combat: BattlemapCombatState | null) => void;
  nextCombatTurn: (mapId: string) => void;
  prevCombatTurn: (mapId: string) => void;
}

export type VaultSlice<T> = StateCreator<VaultState, [], [], T>;
