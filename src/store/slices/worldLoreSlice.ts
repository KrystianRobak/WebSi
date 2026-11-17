import { DEFAULT_TEMPLATES } from '../../data/templates';
import {
  diffAndSyncSnapshot,
  type HistorySnapshot,
  serializeMapRow,
  serializeTemplateRow,
} from '../../lib/campaignSync';
import { getSupabaseClient } from '../../lib/supabase';
import { generateCustomTerrain } from '../../lib/terrainEditorEngine';
import { computeEntityLinksForSource, slugify } from '../../lib/wikilinks';
import {
  DEFAULT_NEW_WORLD_SIZE,
  DEFAULT_TERRAIN_SHADING,
  DEFAULT_WATER_SETTINGS,
  createFogVolume,
  heightResForWorldSize,
} from '../../lib/worldEnvironment';
import { createDefaultWorldLayers } from '../../lib/worldLayers';
import type {
  Entity,
  EntityType,
  MapGenerationConfig,
  MapPath,
  MapPathStyle,
  MapPin,
  MapProp,
  MapRiver,
  TabItem,
  VaultAsset,
  VaultMap,
  WaterSettings,
  TerrainShadingSettings,
  WorldMapLabel,
  WorldMapLayer,
  WorldMapZone,
} from '../../types/vault';
import {
  DEFAULT_MAP_LAYERS,
  broadcastVaultChange,
  syncRuntime,
  type VaultSlice,
  type VaultState,
} from './types';

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

function scheduleMapSync(
  mapId: string,
  getState: () => VaultState,
  setState: (partial: Partial<VaultState>) => void
) {
  const client = getSupabaseClient();
  const state = getState();
  if (!client || !state.isAuthenticated || !state.isEffectiveGm()) return;

  const existing = syncRuntime.mapSyncTimers.get(mapId);
  if (existing) clearTimeout(existing);
  setState({ syncStatus: 'syncing' });
  const timer = setTimeout(async () => {
    syncRuntime.mapSyncTimers.delete(mapId);
    const latestMap = getState().maps.find((m) => m.id === mapId);
    if (!latestMap) return;
    let { error } = await client.from('maps').upsert(serializeMapRow(latestMap, false));
    if (error && /layers|zones|labels|column|schema cache/i.test(error.message)) {
      const retry = await client.from('maps').upsert(serializeMapRow(latestMap, true));
      error = retry.error;
    }
    if (!error) broadcastVaultChange('maps');
    setState({
      syncStatus: error ? 'error' : 'synced',
      lastSyncError: error ? error.message : null,
    });
  }, 600);
  syncRuntime.mapSyncTimers.set(mapId, timer);
}

export type WorldLoreSlice = Pick<
  VaultState,
  | 'entities'
  | 'entityLinks'
  | 'maps'
  | 'mapPins'
  | 'mapPaths'
  | 'assets'
  | 'templates'
  | 'mapRenderMode'
  | 'mapCameraView'
  | 'mapToolMode'
  | 'mapLayers'
  | 'selectedPinId'
  | 'hoveredPinId'
  | 'selectedZoneId'
  | 'selectedLabelId'
  | 'selectedQuestBoardId'
  | 'activeQuestBoardModalId'
  | 'activeZoneLayerId'
  | 'pendingPinCoord'
  | 'drawingPoints'
  | 'cameraResetSignal'
  | 'cameraTopViewSignal'
  | 'cameraZoomSignal'
  | 'zoneTransformSignal'
  | 'scaleBarKm'
  | 'worldsmithMode'
  | 'worldsmithTool'
  | 'brushRadius'
  | 'brushStrength'
  | 'brushFalloff'
  | 'terraceSteps'
  | 'activeStampKind'
  | 'activeBiomePaint'
  | 'activePropKind'
  | 'selectedPropId'
  | 'selectedFogId'
  | 'activeFogPreset'
  | 'fogBrushTargetUserId'
  | 'fogBrushRevealMode'
  | 'terrainCommandSignal'
  | 'riverDrawingPoints'
  | 'mapGeneratorModalOpen'
  | 'mapGeneratorDefaultKind'
  | 'mapGeneratorEditMapId'
  | 'past'
  | 'future'
  | 'setMapRenderMode'
  | 'setMapCameraView'
  | 'setMapToolMode'
  | 'toggleMapLayer'
  | 'setSelectedPinId'
  | 'setHoveredPinId'
  | 'setSelectedZoneId'
  | 'setSelectedLabelId'
  | 'setSelectedQuestBoardId'
  | 'setActiveQuestBoardModalId'
  | 'setActiveZoneLayerId'
  | 'setPendingPinCoord'
  | 'addDrawingPoint'
  | 'popDrawingPoint'
  | 'clearDrawingPoints'
  | 'finishDrawingPath'
  | 'triggerCameraReset'
  | 'triggerTopView'
  | 'triggerCameraZoom'
  | 'dispatchZoneTransform'
  | 'setScaleBarKm'
  | 'addWorldLayer'
  | 'updateWorldLayer'
  | 'deleteWorldLayer'
  | 'toggleWorldLayer'
  | 'soloWorldLayer'
  | 'createMapZone'
  | 'updateMapZone'
  | 'deleteMapZone'
  | 'createMapLabel'
  | 'updateMapLabel'
  | 'deleteMapLabel'
  | 'createEntity'
  | 'updateEntity'
  | 'deleteEntity'
  | 'toggleFavorite'
  | 'addAsset'
  | 'updateAsset'
  | 'deleteAsset'
  | 'attachAssetToEntity'
  | 'updateTemplate'
  | 'resetTemplate'
  | 'createMapPin'
  | 'linkPinToEntity'
  | 'deleteMapPin'
  | 'deleteMapPath'
  | 'updateMapAssets'
  | 'setWorldsmithMode'
  | 'setWorldsmithTool'
  | 'setBrushRadius'
  | 'setBrushStrength'
  | 'setBrushFalloff'
  | 'setTerraceSteps'
  | 'setActiveStampKind'
  | 'setActiveBiomePaint'
  | 'setActivePropKind'
  | 'setSelectedPropId'
  | 'setSelectedFogId'
  | 'setActiveFogPreset'
  | 'setFogBrushTargetUserId'
  | 'setFogBrushRevealMode'
  | 'dispatchTerrainCommand'
  | 'addFogVolume'
  | 'updateFogVolume'
  | 'deleteFogVolume'
  | 'updateMapEnvironment'
  | 'addRiverPoint'
  | 'clearRiverPoints'
  | 'finishRiver'
  | 'deleteRiver'
  | 'addMapProp'
  | 'updateMapProp'
  | 'deleteMapProp'
  | 'setMapGeneratorModalOpen'
  | 'createCustom3DMap'
  | 'regenerate3DMap'
  | 'updateMapMetadata'
  | 'deleteMap'
  | 'undo'
  | 'redo'
>;

export const createWorldLoreSlice: VaultSlice<WorldLoreSlice> = (set, get) => ({
  entities: [],
  entityLinks: [],
  maps: [],
  mapPins: [],
  mapPaths: [],
  assets: [],
  templates: { ...DEFAULT_TEMPLATES },

  mapRenderMode: 'map',
  mapCameraView: 'perspective',
  mapToolMode: 'select',
  mapLayers: { ...DEFAULT_MAP_LAYERS },
  selectedPinId: null,
  hoveredPinId: null,
  selectedZoneId: null,
  selectedLabelId: null,
  selectedQuestBoardId: null,
  activeQuestBoardModalId: null,
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
  fogBrushTargetUserId: '__all__',
  fogBrushRevealMode: true,
  terrainCommandSignal: { seq: 0, cmd: null },
  riverDrawingPoints: [],
  mapGeneratorModalOpen: false,
  mapGeneratorDefaultKind: '3d',
  mapGeneratorEditMapId: null,

  past: [],
  future: [],

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
      ...(id ? { selectedZoneId: null, selectedLabelId: null, selectedPropId: null, selectedQuestBoardId: null } : {}),
    }),
  setHoveredPinId: (id) => set({ hoveredPinId: id }),
  setSelectedZoneId: (id) =>
    set({
      selectedZoneId: id,
      ...(id ? { selectedPinId: null, selectedLabelId: null, selectedPropId: null, selectedQuestBoardId: null } : {}),
    }),
  setSelectedLabelId: (id) =>
    set({
      selectedLabelId: id,
      ...(id ? { selectedPinId: null, selectedZoneId: null, selectedPropId: null, selectedQuestBoardId: null } : {}),
    }),
  setSelectedQuestBoardId: (id) =>
    set({
      selectedQuestBoardId: id,
      ...(id ? { selectedPinId: null, selectedZoneId: null, selectedLabelId: null, selectedPropId: null } : {}),
    }),
  setActiveQuestBoardModalId: (id) => set({ activeQuestBoardModalId: id }),
  setActiveZoneLayerId: (layerId) => set({ activeZoneLayerId: layerId }),
  setPendingPinCoord: (pt) => set({ pendingPinCoord: pt }),

  addDrawingPoint: (pt) => set((s) => ({ drawingPoints: [...s.drawingPoints, pt] })),
  popDrawingPoint: () => set((s) => ({ drawingPoints: s.drawingPoints.slice(0, -1) })),
  clearDrawingPoints: () => set({ drawingPoints: [] }),

  finishDrawingPath: async (name, isRegion, isGmOnly = false) => {
    const state = get();
    if (!state.isEffectiveGm()) return;
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
      id: crypto.randomUUID(),
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
    if (!get().isEffectiveGm()) return newLayer;
    set((s) => {
      const nextMaps = s.maps.map((m) => {
        if (m.id !== mapId) return m;
        const baseLayers = m.layers && m.layers.length > 0 ? m.layers : createDefaultWorldLayers();
        return { ...m, layers: [...baseLayers, newLayer] };
      });
      return { ...pushSnapshot(s), maps: nextMaps, activeZoneLayerId: newLayer.id };
    });
    scheduleMapSync(mapId, get, set);
    return newLayer;
  },

  updateWorldLayer: (mapId, layerId, patch) => {
    if (!get().isEffectiveGm()) return;
    set((s) => {
      const nextMaps = s.maps.map((m) => {
        if (m.id !== mapId) return m;
        const baseLayers = m.layers && m.layers.length > 0 ? m.layers : createDefaultWorldLayers();
        return {
          ...m,
          layers: baseLayers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
        };
      });
      return { maps: nextMaps };
    });
    scheduleMapSync(mapId, get, set);
  },

  deleteWorldLayer: (mapId, layerId) => {
    if (!get().isEffectiveGm()) return;
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
      return { maps: nextMaps };
    });
    if (get().isEffectiveGm()) scheduleMapSync(mapId, get, set);
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
      return { maps: nextMaps };
    });
    if (get().isEffectiveGm()) scheduleMapSync(mapId, get, set);
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
    if (!get().isEffectiveGm()) return newZone;
    set((s) => {
      const nextMaps = s.maps.map((m) => {
        if (m.id !== mapId) return m;
        const baseLayers = m.layers && m.layers.length > 0 ? m.layers : createDefaultWorldLayers();
        const layers = baseLayers.map((l) =>
          l.id === payload.layerId ? { ...l, visible: true } : l
        );
        return {
          ...m,
          layers,
          zones: [...(m.zones || []), newZone],
        };
      });
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
    if (!get().isEffectiveGm()) return;
    set((s) => ({
      maps: s.maps.map((m) =>
        m.id === mapId
          ? {
              ...m,
              zones: (m.zones || []).map((z) => (z.id === zoneId ? { ...z, ...patch } : z)),
            }
          : m
      ),
    }));
    scheduleMapSync(mapId, get, set);
  },

  deleteMapZone: (mapId, zoneId) => {
    if (!get().isEffectiveGm()) return;
    set((s) => ({
      ...pushSnapshot(s),
      maps: s.maps.map((m) =>
        m.id === mapId
          ? { ...m, zones: (m.zones || []).filter((z) => z.id !== zoneId) }
          : m
      ),
      selectedZoneId: s.selectedZoneId === zoneId ? null : s.selectedZoneId,
    }));
    scheduleMapSync(mapId, get, set);
  },

  createMapLabel: (mapId, payload) => {
    const newLabel: WorldMapLabel = {
      id: `lbl-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...payload,
    };
    if (!get().isEffectiveGm()) return newLabel;
    set((s) => ({
      ...pushSnapshot(s),
      maps: s.maps.map((m) =>
        m.id === mapId ? { ...m, labels: [...(m.labels || []), newLabel] } : m
      ),
      selectedLabelId: newLabel.id,
      selectedPinId: null,
      selectedZoneId: null,
      selectedPropId: null,
    }));
    scheduleMapSync(mapId, get, set);
    return newLabel;
  },

  updateMapLabel: (mapId, labelId, patch) => {
    if (!get().isEffectiveGm()) return;
    set((s) => ({
      maps: s.maps.map((m) =>
        m.id === mapId
          ? {
              ...m,
              labels: (m.labels || []).map((l) => (l.id === labelId ? { ...l, ...patch } : l)),
            }
          : m
      ),
    }));
    scheduleMapSync(mapId, get, set);
  },

  deleteMapLabel: (mapId, labelId) => {
    if (!get().isEffectiveGm()) return;
    set((s) => ({
      ...pushSnapshot(s),
      maps: s.maps.map((m) =>
        m.id === mapId
          ? { ...m, labels: (m.labels || []).filter((l) => l.id !== labelId) }
          : m
      ),
      selectedLabelId: s.selectedLabelId === labelId ? null : s.selectedLabelId,
    }));
    scheduleMapSync(mapId, get, set);
  },

  createEntity: async (payload) => {
    const state = get();
    const id = crypto.randomUUID();
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

    if (!state.isEffectiveGm() || !state.world.id) return newEntity;

    const nextEntities = [...state.entities, newEntity];
    const newLinks = computeEntityLinksForSource(newEntity, nextEntities);

    set((s) => ({
      ...pushSnapshot(s),
      entities: [...s.entities, newEntity],
      entityLinks: [...s.entityLinks, ...newLinks],
    }));

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

  updateEntity: (id, patch) => {
    const state = get();
    if (!state.isEffectiveGm()) return;
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

    const now = Date.now();
    const shouldPushUndo =
      syncRuntime.lastEntityUndoId !== id || now - syncRuntime.lastEntityUndoAt > 1200;
    const undoPatch = shouldPushUndo ? pushSnapshot(state) : {};
    syncRuntime.lastEntityUndoId = id;
    syncRuntime.lastEntityUndoAt = now;

    set({
      ...undoPatch,
      entities: nextEntities,
      entityLinks: nextLinks,
      tabs: nextTabs,
    });

    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      const existingTimer = syncRuntime.entitySyncTimers.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      set({ syncStatus: 'syncing' });
      const timer = setTimeout(async () => {
        syncRuntime.entitySyncTimers.delete(id);
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
      syncRuntime.entitySyncTimers.set(id, timer);
    }
  },

  deleteEntity: async (id) => {
    const state = get();
    if (!state.isEffectiveGm()) return;
    set((s) => ({
      ...pushSnapshot(s),
      entities: s.entities.filter((e) => e.id !== id),
      entityLinks: s.entityLinks.filter((l) => l.source_id !== id && l.target_id !== id),
      mapPins: s.mapPins.map((p) => (p.entity_id === id ? { ...p, entity_id: null } : p)),
      tabs: s.tabs.filter((t) => !(t.kind === 'entity' && t.targetId === id)),
    }));

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

  addAsset: ({ name, url, kind = 'scene' }) => {
    const state = get();
    const cleanName = name.trim() || `Asset ${state.assets.length + 1}`;
    const baseSlug = slugify(cleanName) || `asset-${Date.now()}`;
    const uniqueSlug = state.assets.some((a) => a.slug === baseSlug)
      ? `${baseSlug}-${Math.floor(Math.random() * 1000)}`
      : baseSlug;

    const newAsset: VaultAsset = {
      id: crypto.randomUUID(),
      world_id: state.world.id,
      slug: uniqueSlug,
      name: cleanName,
      url,
      kind,
      created_at: new Date().toISOString(),
    };
    if (!state.isEffectiveGm()) return newAsset;

    set({ assets: [newAsset, ...state.assets] });

    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      set({ syncStatus: 'syncing' });
      client
        .from('vault_assets')
        .upsert(newAsset)
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
    if (!state.isEffectiveGm()) return;
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      tabs: s.tabs.map((t) =>
        t.kind === 'asset' && t.targetId === id && patch.name
          ? { ...t, title: patch.name }
          : t
      ),
    }));
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
    if (!state.isEffectiveGm()) return;
    set((s) => ({
      assets: s.assets.filter((a) => a.id !== id),
      tabs: s.tabs.filter((t) => !(t.kind === 'asset' && t.targetId === id)),
    }));
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
    if (!state.isEffectiveGm()) return;
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
    if (!state.isEffectiveGm()) return;
    const current = state.templates[type] || DEFAULT_TEMPLATES[type];
    const updatedTpl = { ...current, ...patch };
    set((s) => ({
      templates: { ...s.templates, [type]: updatedTpl },
    }));
    const client = getSupabaseClient();
    if (client && state.isAuthenticated && state.world.id) {
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
    if (!state.isEffectiveGm()) return;
    const resetTpl = { ...DEFAULT_TEMPLATES[type] };
    set((s) => ({
      templates: { ...s.templates, [type]: resetTpl },
    }));
    const client = getSupabaseClient();
    if (client && state.isAuthenticated && state.world.id) {
      client
        .from('entity_templates')
        .upsert(serializeTemplateRow(state.world.id, resetTpl))
        .then(({ error }) => {
          if (error) set({ syncStatus: 'error', lastSyncError: error.message });
        });
    }
  },

  createMapPin: async (payload) => {
    const state = get();
    const newPin: MapPin = {
      id: crypto.randomUUID(),
      ...payload,
    };
    if (!state.isEffectiveGm()) return newPin;

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
    if (!state.isEffectiveGm()) return;
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
    if (!state.isEffectiveGm()) return;
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
    if (!state.isEffectiveGm()) return;
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
    if (!get().isEffectiveGm()) return;
    set((s) => ({
      maps: s.maps.map((m) => (m.id === mapId ? { ...m, ...patch } : m)),
    }));
    scheduleMapSync(mapId, get, set);
  },

  setWorldsmithMode: (on) =>
    set((s) => {
      if (on && !s.isEffectiveGm()) return s;
      return {
        worldsmithMode: on,
        mapToolMode: 'select',
        riverDrawingPoints: [],
        selectedPropId: null,
        selectedFogId: null,
        // F25: auto-open RightInspector when entering Worldsmith mode
        rightInspectorCollapsed: on ? false : s.rightInspectorCollapsed,
      };
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
  setFogBrushTargetUserId: (userId) => set({ fogBrushTargetUserId: userId }),
  setFogBrushRevealMode: (reveal) => set({ fogBrushRevealMode: reveal }),
  dispatchTerrainCommand: (cmd) =>
    set((s) => ({
      terrainCommandSignal: { seq: s.terrainCommandSignal.seq + 1, cmd },
    })),

  addFogVolume: (mapId, at, preset, overrides) => {
    const newFog = createFogVolume(at, preset || get().activeFogPreset, overrides);
    if (!get().isEffectiveGm()) return newFog;
    set((s) => ({
      maps: s.maps.map((m) =>
        m.id === mapId ? { ...m, fog_volumes: [...(m.fog_volumes || []), newFog] } : m
      ),
      selectedFogId: newFog.id,
    }));
    scheduleMapSync(mapId, get, set);
    return newFog;
  },

  updateFogVolume: (mapId, fogId, patch) => {
    if (!get().isEffectiveGm()) return;
    set((s) => ({
      maps: s.maps.map((m) =>
        m.id === mapId
          ? {
              ...m,
              fog_volumes: (m.fog_volumes || []).map((f) =>
                f.id === fogId ? { ...f, ...patch } : f
              ),
            }
          : m
      ),
    }));
    scheduleMapSync(mapId, get, set);
  },

  deleteFogVolume: (mapId, fogId) => {
    if (!get().isEffectiveGm()) return;
    set((s) => ({
      maps: s.maps.map((m) =>
        m.id === mapId
          ? { ...m, fog_volumes: (m.fog_volumes || []).filter((f) => f.id !== fogId) }
          : m
      ),
      selectedFogId: s.selectedFogId === fogId ? null : s.selectedFogId,
    }));
    scheduleMapSync(mapId, get, set);
  },

  updateMapEnvironment: (mapId, patch) => {
    if (!get().isEffectiveGm()) return;
    set((s) => ({
      maps: s.maps.map((m) => {
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
      }),
    }));
    scheduleMapSync(mapId, get, set);
  },

  addRiverPoint: (pt) => set((s) => ({ riverDrawingPoints: [...s.riverDrawingPoints, pt] })),
  clearRiverPoints: () => set({ riverDrawingPoints: [] }),

  finishRiver: (mapId, name, width, depth) => {
    if (!get().isEffectiveGm()) return;
    set((s) => {
      if (s.riverDrawingPoints.length < 2) return s;
      const river: MapRiver = {
        id: `river-${Date.now()}`,
        name: name.trim() || 'Carved River',
        points: s.riverDrawingPoints,
        width,
        depth,
      };
      return {
        maps: s.maps.map((m) =>
          m.id === mapId ? { ...m, rivers: [...(m.rivers || []), river] } : m
        ),
        riverDrawingPoints: [],
      };
    });
    scheduleMapSync(mapId, get, set);
  },

  deleteRiver: (mapId, riverId) => {
    if (!get().isEffectiveGm()) return;
    set((s) => ({
      maps: s.maps.map((m) =>
        m.id === mapId
          ? { ...m, rivers: (m.rivers || []).filter((r) => r.id !== riverId) }
          : m
      ),
    }));
    scheduleMapSync(mapId, get, set);
  },

  addMapProp: (mapId, prop) => {
    const newProp: MapProp = {
      id: `prop-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      ...prop,
    };
    if (!get().isEffectiveGm()) return newProp;
    set((s) => ({
      maps: s.maps.map((m) =>
        m.id === mapId ? { ...m, props: [...(m.props || []), newProp] } : m
      ),
    }));
    scheduleMapSync(mapId, get, set);
    return newProp;
  },

  updateMapProp: (mapId, propId, patch) => {
    if (!get().isEffectiveGm()) return;
    set((s) => ({
      maps: s.maps.map((m) =>
        m.id === mapId
          ? {
              ...m,
              props: (m.props || []).map((p) => (p.id === propId ? { ...p, ...patch } : p)),
            }
          : m
      ),
    }));
    scheduleMapSync(mapId, get, set);
  },

  deleteMapProp: (mapId, propId) => {
    if (!get().isEffectiveGm()) return;
    set((s) => ({
      maps: s.maps.map((m) =>
        m.id === mapId
          ? { ...m, props: (m.props || []).filter((p) => p.id !== propId) }
          : m
      ),
      selectedPropId: s.selectedPropId === propId ? null : s.selectedPropId,
    }));
    scheduleMapSync(mapId, get, set);
  },

  setMapGeneratorModalOpen: (open, kind = '3d', editMapId = null) =>
    set({
      mapGeneratorModalOpen: open,
      mapGeneratorDefaultKind: kind,
      mapGeneratorEditMapId: editMapId,
    }),

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
    if (!state.isEffectiveGm() || !state.world.id) return newMap;

    const newTab: TabItem = {
      id: `tab-map-${id}`,
      kind: 'map',
      targetId: id,
      title: newMap.name,
      iconType: 'Map',
    };
    set((s) => ({
      maps: [...s.maps, newMap],
      tabs: [...s.tabs, newTab],
      activeTabId: newTab.id,
      worldsmithMode: true,
      rightInspectorCollapsed: false,
      mapGeneratorModalOpen: false,
    }));

    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      set({ syncStatus: 'syncing' });
      client
        .from('maps')
        .insert(serializeMapRow(newMap, false))
        .then(async ({ error }) => {
          let finalError = error;
          if (finalError && /layers|zones|labels|column|schema cache/i.test(finalError.message)) {
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
    if (!get().isEffectiveGm()) return;
    const worldSize = config.worldSize || DEFAULT_NEW_WORLD_SIZE;
    const heightRes = heightResForWorldSize(worldSize);
    const fullConfig: MapGenerationConfig = { ...config, worldSize };
    const generated = generateCustomTerrain(fullConfig, heightRes, 16);
    set((s) => ({
      maps: s.maps.map((m) =>
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
      ),
      worldsmithMode: true,
      rightInspectorCollapsed: false,
      mapGeneratorModalOpen: false,
    }));
    scheduleMapSync(mapId, get, set);
  },

  updateMapMetadata: (mapId, patch) => {
    if (!get().isEffectiveGm()) return;
    set((s) => {
      const nextMaps = s.maps.map((m) => {
        if (m.id !== mapId) return m;
        let nextBm = m.battlemap;
        if (nextBm && patch.battlemap) {
          const merged = { ...nextBm, ...patch.battlemap };
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
    if (!state.isEffectiveGm() || state.maps.length <= 1) return;
    set((s) => {
      if (s.maps.length <= 1) return s;
      const nextMaps = s.maps.filter((m) => m.id !== mapId);
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

  undo: () => {
    const state = get();
    if (state.past.length === 0) return;
    syncRuntime.lastEntityUndoId = null;
    syncRuntime.lastEntityUndoAt = 0;
    syncRuntime.entitySyncTimers.forEach((t) => clearTimeout(t));
    syncRuntime.entitySyncTimers.clear();
    syncRuntime.mapSyncTimers.forEach((t) => clearTimeout(t));
    syncRuntime.mapSyncTimers.clear();
    const previous = state.past[state.past.length - 1];
    const current: HistorySnapshot = {
      entities: state.entities,
      entityLinks: state.entityLinks,
      mapPins: state.mapPins,
      mapPaths: state.mapPaths,
      maps: state.maps,
    };
    set({
      ...previous,
      past: state.past.slice(0, -1),
      future: [current, ...state.future],
    });
    const client = getSupabaseClient();
    if (client && state.isAuthenticated && state.world.id && state.isEffectiveGm()) {
      set({ syncStatus: 'syncing' });
      diffAndSyncSnapshot(client, state.world.id, current, previous).then(({ error }) => {
        if (!error) broadcastVaultChange('undo');
        set({ syncStatus: error ? 'error' : 'synced', lastSyncError: error });
      });
    }
  },

  redo: () => {
    const state = get();
    if (state.future.length === 0) return;
    syncRuntime.lastEntityUndoId = null;
    syncRuntime.lastEntityUndoAt = 0;
    syncRuntime.entitySyncTimers.forEach((t) => clearTimeout(t));
    syncRuntime.entitySyncTimers.clear();
    syncRuntime.mapSyncTimers.forEach((t) => clearTimeout(t));
    syncRuntime.mapSyncTimers.clear();
    const next = state.future[0];
    const current: HistorySnapshot = {
      entities: state.entities,
      entityLinks: state.entityLinks,
      mapPins: state.mapPins,
      mapPaths: state.mapPaths,
      maps: state.maps,
    };
    set({
      ...next,
      past: [...state.past, current],
      future: state.future.slice(1),
    });
    const client = getSupabaseClient();
    if (client && state.isAuthenticated && state.world.id && state.isEffectiveGm()) {
      set({ syncStatus: 'syncing' });
      diffAndSyncSnapshot(client, state.world.id, current, next).then(({ error }) => {
        if (!error) broadcastVaultChange('redo');
        set({ syncStatus: error ? 'error' : 'synced', lastSyncError: error });
      });
    }
  },
});
