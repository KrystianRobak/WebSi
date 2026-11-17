import type { SupabaseClient } from '@supabase/supabase-js';
import { createSeededSmugglerVaultsBattlemap } from './battlemapGenerator';
import { uploadAssetDataUrlOrBlob } from './supabase';
import { createDefaultWorldLayers } from './worldLayers';
import { buildSeedDataset } from '../data/seedData';
import { SHEET_PRESET_5E } from '../data/sheetPresets';
import {
  CampaignMode,
  Entity,
  EntityLink,
  EntityTemplate,
  FogVolume,
  MapPath,
  MapPin,
  TerrainShadingSettings,
  VaultMap,
  WaterSettings,
  World,
  WorldMapLabel,
  WorldMapLayer,
  WorldMapZone,
} from '../types/vault';

export interface HistorySnapshot {
  entities: Entity[];
  entityLinks: EntityLink[];
  mapPins: MapPin[];
  mapPaths: MapPath[];
  maps: VaultMap[];
}

function normalizeBattlemapPayload(rawInput: unknown, fallbackMap: VaultMap) {
  if (!rawInput || typeof rawInput !== 'object') return undefined;
  const raw = rawInput as Record<string, unknown>;
  const gridSizePx = Number(raw.gridSizePx ?? 56) || 56;
  const widthCells = typeof raw.widthCells === 'number' ? raw.widthCells : undefined;
  const heightCells = typeof raw.heightCells === 'number' ? raw.heightCells : undefined;
  const width = Number(raw.width ?? (widthCells ? widthCells * gridSizePx : fallbackMap.width || 1120));
  const height = Number(raw.height ?? (heightCells ? heightCells * gridSizePx : fallbackMap.height || 840));
  const usesCellCoords = Boolean(widthCells && heightCells && !raw.width && !raw.height);

  const rawTokens = Array.isArray(raw.tokens) ? (raw.tokens as Array<Record<string, unknown>>) : [];
  const tokens = rawTokens.map((t) => {
    const rawX = Number(t.x ?? 0);
    const rawY = Number(t.y ?? 0);
    const isCellCoord = usesCellCoords && rawX <= (widthCells || 40) && rawY <= (heightCells || 40);
    const px = isCellCoord ? (rawX + 0.5) * gridSizePx : rawX;
    const py = isCellCoord ? (rawY + 0.5) * gridSizePx : rawY;
    return {
      id: String(t.id ?? crypto.randomUUID()),
      name: String(t.name ?? 'Token'),
      entity_id: (t.entity_id as string | null) ?? null,
      character_id: (t.character_id as string | null) ?? null,
      owner_user_id: (t.owner_user_id as string | null) ?? null,
      disposition: (t.disposition as 'party' | 'ally' | 'enemy' | 'neutral') ?? 'neutral',
      x: px,
      y: py,
      sizeCells: Number(t.sizeCells ?? 1),
      hp: Number(t.hp ?? 10),
      maxHp: Number(t.maxHp ?? t.hp ?? 10),
      ac: Number(t.ac ?? 10),
      visionRangeFt: Number(t.visionRangeFt ?? 60),
      lightRadiusFt: Number(t.lightRadiusFt ?? 0),
      lightColor: String(t.lightColor ?? '#fef3c7'),
      isHidden: Boolean(t.isHidden ?? t.hidden ?? false),
      badgeColor: t.badgeColor as string | undefined,
      conditions: Array.isArray(t.conditions) ? (t.conditions as string[]) : [],
      elevationFt: typeof t.elevationFt === 'number' ? t.elevationFt : undefined,
      auraRadiusFt: typeof t.auraRadiusFt === 'number' ? t.auraRadiusFt : undefined,
    };
  });

  const rawWalls = Array.isArray(raw.walls) ? (raw.walls as Array<Record<string, unknown>>) : [];
  const walls: NonNullable<VaultMap['battlemap']>['walls'] = [];
  const extraDoors: NonNullable<VaultMap['battlemap']>['doors'] = [];

  for (const w of rawWalls) {
    const scalePt = (v: unknown) =>
      usesCellCoords && Number(v ?? 0) <= Math.max(widthCells || 40, heightCells || 40)
        ? Number(v ?? 0) * gridSizePx
        : Number(v ?? 0);
    if (w.kind === 'secret_door' || w.kind === 'door') {
      extraDoors.push({
        id: String(w.id ?? crypto.randomUUID()),
        label: String(w.label ?? (w.kind === 'secret_door' ? 'Secret Door' : 'Door')),
        x1: scalePt(w.x1),
        y1: scalePt(w.y1),
        x2: scalePt(w.x2),
        y2: scalePt(w.y2),
        isOpen: Boolean(w.isOpen ?? false),
        isLocked: Boolean(w.isLocked ?? false),
        isSecret: Boolean(w.kind === 'secret_door' || w.isSecret || w.hidden),
      });
    } else {
      walls.push({
        id: String(w.id ?? crypto.randomUUID()),
        x1: scalePt(w.x1),
        y1: scalePt(w.y1),
        x2: scalePt(w.x2),
        y2: scalePt(w.y2),
        kind: (w.kind as 'wall' | 'pillar' | 'secret-wall') ?? 'wall',
      });
    }
  }

  const rawDoors = Array.isArray(raw.doors) ? (raw.doors as Array<Record<string, unknown>>) : [];
  const doors = [
    ...extraDoors,
    ...rawDoors.map((d) => ({
      id: String(d.id ?? crypto.randomUUID()),
      label: String(d.label ?? 'Door'),
      x1: Number(d.x1 ?? 0),
      y1: Number(d.y1 ?? 0),
      x2: Number(d.x2 ?? 0),
      y2: Number(d.y2 ?? 0),
      isOpen: Boolean(d.isOpen ?? false),
      isLocked: Boolean(d.isLocked ?? false),
      isSecret: Boolean(d.isSecret ?? d.hidden ?? false),
    })),
  ];

  const rawLights = Array.isArray(raw.lights) ? (raw.lights as Array<Record<string, unknown>>) : [];
  const lights = rawLights.map((l) => {
    const rawX = Number(l.x ?? 0);
    const rawY = Number(l.y ?? 0);
    const isCellCoord = usesCellCoords && rawX <= (widthCells || 40) && rawY <= (heightCells || 40);
    return {
      id: String(l.id ?? crypto.randomUUID()),
      label: String(l.label ?? 'Light'),
      x: isCellCoord ? (rawX + 0.5) * gridSizePx : rawX,
      y: isCellCoord ? (rawY + 0.5) * gridSizePx : rawY,
      radiusFt: Number(l.radiusFt ?? (typeof l.radiusCells === 'number' ? l.radiusCells * 5 : 40)),
      color: String(l.color ?? '#fde68a'),
      intensity: Number(l.intensity ?? 1),
      isOn: l.isOn !== false,
      flicker: Boolean(l.flicker ?? false),
    };
  });

  const rawProps = Array.isArray(raw.props) ? (raw.props as Array<Record<string, unknown>>) : [];
  const rawTraps = Array.isArray(raw.traps) ? (raw.traps as Array<Record<string, unknown>>) : [];
  const props: NonNullable<VaultMap['battlemap']>['props'] = [
    ...rawProps.map((p) => ({
      id: String(p.id ?? crypto.randomUUID()),
      kind: (p.kind as NonNullable<VaultMap['battlemap']>['props'] extends Array<infer T> ? T extends { kind: infer K } ? K : never : never) ?? 'marker',
      label: String(p.label ?? p.name ?? 'Prop'),
      x: Number(p.x ?? 0),
      y: Number(p.y ?? 0),
      widthPx: Number(p.widthPx ?? gridSizePx * 0.7),
      heightPx: Number(p.heightPx ?? gridSizePx * 0.7),
      rotationDeg: Number(p.rotationDeg ?? 0),
      color: String(p.color ?? '#b68d40'),
      notes: p.notes as string | undefined,
      entityId: (p.entityId as string | null) ?? null,
      isSecret: Boolean(p.isSecret ?? p.hidden ?? false),
      blocksLight: Boolean(p.blocksLight ?? false),
    })),
    ...rawTraps.map((tr) => {
      const rawX = Number(tr.x ?? 0);
      const rawY = Number(tr.y ?? 0);
      const isCellCoord = usesCellCoords && rawX <= (widthCells || 40) && rawY <= (heightCells || 40);
      return {
        id: String(tr.id ?? crypto.randomUUID()),
        kind: 'trap' as const,
        label: String(tr.name ?? tr.label ?? 'Trap'),
        x: isCellCoord ? (rawX + 0.5) * gridSizePx : rawX,
        y: isCellCoord ? (rawY + 0.5) * gridSizePx : rawY,
        widthPx: gridSizePx * 0.7,
        heightPx: gridSizePx * 0.7,
        rotationDeg: 0,
        color: '#ef4444',
        isSecret: Boolean(tr.hidden ?? tr.isSecret ?? true),
      };
    }),
  ];

  return {
    theme: (raw.theme as NonNullable<VaultMap['battlemap']>['theme']) ?? 'stone-crypt',
    backgroundUrl: (raw.backgroundUrl as string | null) ?? null,
    width,
    height,
    gridSizePx,
    showGrid: raw.showGrid !== false,
    gridOpacity: Number(raw.gridOpacity ?? 0.35),
    ambientLight: Number(raw.ambientLight ?? 0.45),
    dynamicLighting: raw.dynamicLighting !== false,
    fogOfWarEnabled: Boolean(raw.fogOfWarEnabled ?? true),
    revealedMaskUrl: (raw.revealedMaskUrl as string | null) ?? null,
    tokens,
    walls,
    doors,
    lights,
    props,
    aoeTemplates: Array.isArray(raw.aoeTemplates)
      ? (raw.aoeTemplates as NonNullable<VaultMap['battlemap']>['aoeTemplates'])
      : [],
    sceneNotes: (raw.sceneNotes as string | undefined) ?? undefined,
  };
}

function normalizeCombatState(rawCombat: unknown) {
  if (!rawCombat || typeof rawCombat !== 'object') return null;
  const rc = rawCombat as Record<string, unknown>;
  const activeTurnIndex = Number(rc.activeTurnIndex ?? rc.turnIndex ?? 0);
  const entries = Array.isArray(rc.entries)
    ? (rc.entries as Array<Record<string, unknown>>).map((e) => ({
        id: String(e.id ?? crypto.randomUUID()),
        name: String(e.name ?? 'Combatant'),
        initiative: Number(e.initiative ?? 10),
        tokenId: (e.tokenId as string | null) ?? null,
        characterId: (e.characterId as string | null) ?? null,
        ownerUserId: (e.ownerUserId as string | null) ?? null,
        hp: typeof e.hp === 'number' ? e.hp : undefined,
        maxHp: typeof e.maxHp === 'number' ? e.maxHp : undefined,
        ac: typeof e.ac === 'number' ? e.ac : undefined,
        conditions: Array.isArray(e.conditions) ? (e.conditions as string[]) : [],
        isHidden: Boolean(e.isHidden ?? false),
      }))
    : [];
  return {
    active: rc.active !== false,
    round: Number(rc.round ?? 1),
    activeTurnIndex,
    entries,
  };
}

export function normalizeMapOverlay(m: VaultMap, fallbackSeed?: VaultMap): VaultMap {
  const rawAny = m as VaultMap & {
    kind?: string;
    battlemap_data?: unknown;
  };
  const kindStr: string | undefined = rawAny.kind;
  const combatState = normalizeCombatState(m.combat_state);
  const defaultScaleConfig = {
    ratio: '1 : 250 000',
    elevationSource: 'Heightmap (32-bit)',
    kmPerUnit: 1.8,
  };
  const resolvedScaleConfig =
    m.scale_config && typeof m.scale_config === 'object'
      ? {
          ...defaultScaleConfig,
          ...m.scale_config,
        }
      : defaultScaleConfig;
  const resolvedWidth = m.width || 8192;
  const resolvedHeight = m.height || 8192;

  if (kindStr === '2d' || kindStr === 'battlemap') {
    const normalizedBattlemap =
      normalizeBattlemapPayload(m.battlemap ?? rawAny.battlemap_data, m) ?? m.battlemap;
    return {
      ...m,
      kind: '2d',
      width: resolvedWidth,
      height: resolvedHeight,
      scale_config: resolvedScaleConfig,
      battlemap: normalizedBattlemap,
      combat_state: combatState ?? m.combat_state ?? null,
      fog_of_war_2d: m.fog_of_war_2d ?? normalizedBattlemap?.revealedMaskUrl ?? null,
    };
  }
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
    width: resolvedWidth,
    height: resolvedHeight,
    scale_config: resolvedScaleConfig,
    world_size,
    sea_level,
    paint_url,
    water,
    terrain_shading,
    fog_volumes,
    combat_state: combatState ?? m.combat_state ?? null,
    rivers: m.rivers || [],
    props,
    layers,
    zones,
    labels,
  };
}

export function serializeMapRow(m: VaultMap, packOverlayInScaleConfig = false) {
  const cleanScale = {
    ...(m.scale_config || {
      ratio: '1 : 250 000',
      elevationSource: 'Heightmap',
      kmPerUnit: 1.6,
    }),
  } as Record<string, unknown>;

  if (packOverlayInScaleConfig) {
    cleanScale._overlay = {
      world_size: m.world_size,
      sea_level: m.sea_level,
      paint_url: m.paint_url ?? null,
      water: m.water,
      terrain_shading: m.terrain_shading,
      fog_volumes: m.fog_volumes ?? [],
      layers: m.layers ?? [],
      zones: m.zones ?? [],
      labels: m.labels ?? [],
    };
  } else {
    delete cleanScale._overlay;
  }

  const combatOut = m.combat_state
    ? {
        ...m.combat_state,
        turnIndex: m.combat_state.activeTurnIndex,
      }
    : null;

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
    world_size: m.world_size ?? 100,
    sea_level: m.sea_level ?? 0.23,
    paint_url: m.paint_url ?? null,
    water: m.water ?? null,
    terrain_shading: m.terrain_shading ?? null,
    fog_volumes: m.fog_volumes ?? [],
    fog_of_war_2d: m.fog_of_war_2d ?? m.battlemap?.revealedMaskUrl ?? null,
    combat_state: combatOut,
    layers: m.layers ?? [],
    zones: m.zones ?? [],
    labels: m.labels ?? [],
  };
}

export function serializeTemplateRow(worldId: string, tpl: EntityTemplate) {
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

/**
 * Computes diffs between two history snapshots (for undo/redo) and persists them
 * directly to Supabase Postgres.
 */
export async function diffAndSyncSnapshot(
  client: SupabaseClient,
  worldId: string,
  prevSnap: HistorySnapshot,
  nextSnap: HistorySnapshot
): Promise<{ error: string | null }> {
  try {
    // 1. Entities diff
    const prevEntMap = new Map(prevSnap.entities.map((e) => [e.id, e]));
    const nextEntMap = new Map(nextSnap.entities.map((e) => [e.id, e]));
    const deletedEntityIds = prevSnap.entities
      .filter((e) => !nextEntMap.has(e.id))
      .map((e) => e.id);
    const upsertedEntities = nextSnap.entities.filter((e) => {
      const p = prevEntMap.get(e.id);
      return !p || JSON.stringify(p) !== JSON.stringify(e);
    });

    if (deletedEntityIds.length > 0) {
      const { error } = await client.from('entities').delete().in('id', deletedEntityIds);
      if (error) return { error: error.message };
    }
    if (upsertedEntities.length > 0) {
      const { error } = await client.from('entities').upsert(upsertedEntities);
      if (error) return { error: error.message };
    }

    // 2. Entity Links diff
    if (JSON.stringify(prevSnap.entityLinks) !== JSON.stringify(nextSnap.entityLinks)) {
      await client.from('entity_links').delete().eq('world_id', worldId);
      if (nextSnap.entityLinks.length > 0) {
        const { error } = await client.from('entity_links').upsert(nextSnap.entityLinks);
        if (error) return { error: error.message };
      }
    }

    // 3. Map Pins diff
    const prevPinMap = new Map(prevSnap.mapPins.map((p) => [p.id, p]));
    const nextPinMap = new Map(nextSnap.mapPins.map((p) => [p.id, p]));
    const deletedPinIds = prevSnap.mapPins
      .filter((p) => !nextPinMap.has(p.id))
      .map((p) => p.id);
    const upsertedPins = nextSnap.mapPins.filter((p) => {
      const prevP = prevPinMap.get(p.id);
      return !prevP || JSON.stringify(prevP) !== JSON.stringify(p);
    });
    if (deletedPinIds.length > 0) {
      const { error } = await client.from('map_pins').delete().in('id', deletedPinIds);
      if (error) return { error: error.message };
    }
    if (upsertedPins.length > 0) {
      const { error } = await client.from('map_pins').upsert(upsertedPins);
      if (error) return { error: error.message };
    }

    // 4. Map Paths diff
    const prevPathMap = new Map(prevSnap.mapPaths.map((p) => [p.id, p]));
    const nextPathMap = new Map(nextSnap.mapPaths.map((p) => [p.id, p]));
    const deletedPathIds = prevSnap.mapPaths
      .filter((p) => !nextPathMap.has(p.id))
      .map((p) => p.id);
    const upsertedPaths = nextSnap.mapPaths.filter((p) => {
      const prevP = prevPathMap.get(p.id);
      return !prevP || JSON.stringify(prevP) !== JSON.stringify(p);
    });
    if (deletedPathIds.length > 0) {
      const { error } = await client.from('map_paths').delete().in('id', deletedPathIds);
      if (error) return { error: error.message };
    }
    if (upsertedPaths.length > 0) {
      const { error } = await client.from('map_paths').upsert(upsertedPaths);
      if (error) return { error: error.message };
    }

    // 5. Maps diff
    const prevMapMap = new Map(prevSnap.maps.map((m) => [m.id, m]));
    const nextMapMap = new Map(nextSnap.maps.map((m) => [m.id, m]));
    const deletedMapIds = prevSnap.maps
      .filter((m) => !nextMapMap.has(m.id))
      .map((m) => m.id);
    const upsertedMaps = nextSnap.maps.filter((m) => {
      const prevM = prevMapMap.get(m.id);
      return !prevM || JSON.stringify(prevM) !== JSON.stringify(m);
    });
    if (deletedMapIds.length > 0) {
      const { error } = await client.from('maps').delete().in('id', deletedMapIds);
      if (error) return { error: error.message };
    }
    if (upsertedMaps.length > 0) {
      let { error } = await client
        .from('maps')
        .upsert(upsertedMaps.map((m) => serializeMapRow(m, false)));
      if (error && /column|schema cache/i.test(error.message)) {
        const retry = await client
          .from('maps')
          .upsert(upsertedMaps.map((m) => serializeMapRow(m, true)));
        error = retry.error;
      }
      if (error) return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to sync undo/redo snapshot' };
  }
}

async function maybeUploadDataUrl(
  url: string | null | undefined,
  folder: string
): Promise<string | null> {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('data:')) {
    try {
      return await uploadAssetDataUrlOrBlob(url, folder);
    } catch {
      return url;
    }
  }
  return url;
}

/**
 * Lazily generates and uploads the starter Aethelgard campaign into Supabase
 * when creating a new campaign with "Include Starter Realm" checked (or manually seeded).
 */
export async function seedStarterCampaign(
  client: SupabaseClient,
  ownerUserId: string,
  options: {
    worldId?: string;
    name?: string;
    description?: string;
    mode?: CampaignMode;
    maxPlayersPerParty?: number;
    existingWorldCreated?: boolean;
  } = {}
): Promise<{ worldId: string; error: string | null }> {
  const seed = buildSeedDataset();
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

  const worldUuid = options.worldId || crypto.randomUUID();
  idMap.set(seed.world.id, worldUuid);

  const mode: CampaignMode = options.mode || seed.world.mode || 'west_marches';
  const maxPlayers = options.maxPlayersPerParty ?? seed.world.max_players_per_party ?? 5;

  const sheetTemplateId = crypto.randomUUID();
  const folderPrefix = `campaigns/${worldUuid}`;

  if (!options.existingWorldCreated) {
    const worldRow: Partial<World> = {
      id: worldUuid,
      owner_id: ownerUserId,
      name: options.name?.trim() || seed.world.name,
      description: options.description?.trim() ?? seed.world.description,
      mode,
      max_players_per_party: maxPlayers,
      calendar_config: seed.world.calendar_config,
    };
    const { error: wErr } = await client.from('worlds').insert(worldRow);
    if (wErr) return { worldId: worldUuid, error: wErr.message };
  }

  // Insert default Roll20 character sheet template and link it to the world
  const { error: sheetErr } = await client.from('character_sheet_templates').insert({
    id: sheetTemplateId,
    campaign_id: worldUuid,
    name: SHEET_PRESET_5E.name,
    system_label: SHEET_PRESET_5E.system_label,
    html_template: SHEET_PRESET_5E.html_template,
    css_template: SHEET_PRESET_5E.css_template,
    schema_json: SHEET_PRESET_5E.schema_json,
    updated_by: ownerUserId,
  });
  if (!sheetErr) {
    await client
      .from('worlds')
      .update({ active_sheet_template_id: sheetTemplateId })
      .eq('id', worldUuid);
  }

  // Upload entity covers & insert entities
  const entityRows = await Promise.all(
    seed.entities.map(async (e) => ({
      ...e,
      id: toUuid(e.id),
      world_id: worldUuid,
      cover_image_url: await maybeUploadDataUrl(e.cover_image_url, `${folderPrefix}/entities`),
    }))
  );
  if (entityRows.length > 0) {
    const { error } = await client.from('entities').insert(entityRows);
    if (error) return { worldId: worldUuid, error: error.message };
  }

  const linkRows = seed.entityLinks.map((l) => ({
    source_id: toUuid(l.source_id),
    target_id: toUuid(l.target_id),
    world_id: worldUuid,
  }));
  if (linkRows.length > 0) {
    await client.from('entity_links').upsert(linkRows);
  }

  // Build 3D + 2D starter maps and upload terrain / floor textures to Storage
  const bm2d = createSeededSmugglerVaultsBattlemap();
  const seeded2dMap: VaultMap = {
    id: 'map-smuggler-vaults',
    world_id: worldUuid,
    name: 'Oakhaven Smuggler Vaults (2D)',
    kind: '2d',
    width: bm2d.width,
    height: bm2d.height,
    displacement_scale: 0,
    scale_config: {
      ratio: '1 sq = 5 ft',
      elevationSource: '2D Tactical Grid',
      kmPerUnit: 0.0015,
    },
    battlemap: bm2d,
  };
  const allSeedMaps = [...seed.maps, seeded2dMap];
  const preparedMaps: VaultMap[] = await Promise.all(
    allSeedMaps.map(async (m) => {
      const mapUuid = toUuid(m.id);
      const albedoUrl = await maybeUploadDataUrl(m.albedo_url, `${folderPrefix}/maps/${mapUuid}`);
      const heightUrl = await maybeUploadDataUrl(m.heightmap_url, `${folderPrefix}/maps/${mapUuid}`);
      const bmBg = m.battlemap?.backgroundUrl
        ? await maybeUploadDataUrl(m.battlemap.backgroundUrl, `${folderPrefix}/maps/${mapUuid}`)
        : null;
      return {
        ...m,
        id: mapUuid,
        world_id: worldUuid,
        albedo_url: albedoUrl,
        heightmap_url: heightUrl,
        zones: (m.zones || []).map((z) => ({
          ...z,
          entityId: z.entityId ? toUuid(z.entityId) : null,
        })),
        battlemap: m.battlemap ? { ...m.battlemap, backgroundUrl: bmBg } : undefined,
      };
    })
  );

  let { error: mapErr } = await client
    .from('maps')
    .insert(preparedMaps.map((m) => serializeMapRow(m, false)));
  if (mapErr && /column|schema cache/i.test(mapErr.message)) {
    const retry = await client
      .from('maps')
      .insert(preparedMaps.map((m) => serializeMapRow(m, true)));
    mapErr = retry.error;
  }
  if (mapErr) return { worldId: worldUuid, error: mapErr.message };

  const pinRows = seed.mapPins.map((p) => ({
    ...p,
    id: toUuid(p.id),
    map_id: toUuid(p.map_id),
    entity_id: p.entity_id ? toUuid(p.entity_id) : null,
  }));
  if (pinRows.length > 0) {
    await client.from('map_pins').insert(pinRows);
  }

  const pathRows = seed.mapPaths.map((p) => ({
    ...p,
    id: toUuid(p.id),
    map_id: toUuid(p.map_id),
  }));
  if (pathRows.length > 0) {
    await client.from('map_paths').insert(pathRows);
  }

  const assetRows = await Promise.all(
    seed.assets.map(async (a) => ({
      ...a,
      id: toUuid(a.id),
      world_id: worldUuid,
      url: (await maybeUploadDataUrl(a.url, `${folderPrefix}/assets`)) || a.url,
    }))
  );
  if (assetRows.length > 0) {
    await client.from('vault_assets').insert(assetRows);
  }

  // Starter timeline event & West Marches quest board
  const mainMapUuid = preparedMaps[0]?.id;
  if (mainMapUuid && mode === 'west_marches') {
    const boardId = crypto.randomUUID();
    const { error: boardErr } = await client.from('map_quest_boards').insert({
      id: boardId,
      map_id: mainMapUuid,
      campaign_id: worldUuid,
      title: 'Oakhaven Guild Bounty Board',
      description: 'Chartered expeditions along the Shattered Reach frontier.',
      x: -15,
      y: 2.5,
      z: 5,
      created_by: ownerUserId,
    });
    if (!boardErr) {
      await client.from('guild_quests').insert({
        id: crypto.randomUUID(),
        board_id: boardId,
        campaign_id: worldUuid,
        title: 'Low-Tide Survey of The Sunken Reliquary',
        summary: 'Chart the outer Choir Nave before the twin-moon tide returns.',
        danger_tier: 'Tier 2',
        reward: '450 gp + Salvage Charter',
        max_players: maxPlayers,
        status: 'open',
        created_by: ownerUserId,
      });
    }
  }

  await client.from('timeline_events').insert({
    id: crypto.randomUUID(),
    campaign_id: worldUuid,
    title: 'Charter of the Shattered Reach Signed',
    date_label: 'Year 412, Embertide 1',
    sort_order: 1,
    era: 'Age of Cinders',
    description: 'Expedition companies gathered at Oakhaven Harbor.',
    is_gm_only: false,
    created_by: ownerUserId,
  });

  return { worldId: worldUuid, error: null };
}
