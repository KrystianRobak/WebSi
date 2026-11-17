import { uploadAssetDataUrlOrBlob } from './supabase';
import {
  CampaignCalendarConfig,
  CampaignMode,
  CharacterRecord,
  CharacterSheetTemplate,
  Entity,
  EntityLink,
  EntityTemplate,
  EntityType,
  GuildQuest,
  MapPath,
  MapPin,
  MapQuestBoard,
  TimelineEvent,
  VaultAsset,
  VaultMap,
  World,
} from '../types/vault';

export interface CampaignArchiveV2 {
  version: 2;
  exportedAt: string;
  mode: 'gm' | 'player';
  campaign: {
    name: string;
    description: string;
    mode: CampaignMode;
    max_players_per_party: number;
    calendar_config?: CampaignCalendarConfig | null;
    active_sheet_template_id?: string | null;
  };
  entities: Entity[];
  entityLinks: EntityLink[];
  maps: VaultMap[];
  mapPins: MapPin[];
  mapPaths: MapPath[];
  assets: VaultAsset[];
  entityTemplates: EntityTemplate[];
  sheetTemplates: CharacterSheetTemplate[];
  characters: CharacterRecord[];
  mapQuestBoards: MapQuestBoard[];
  guildQuests: GuildQuest[];
  timelineEvents: TimelineEvent[];
}

export interface ExportCampaignInput {
  isEffectiveGm: boolean;
  world: World;
  entities: Entity[];
  entityLinks: EntityLink[];
  maps: VaultMap[];
  mapPins: MapPin[];
  mapPaths: MapPath[];
  assets: VaultAsset[];
  templates: Record<EntityType, EntityTemplate>;
  sheetTemplates: CharacterSheetTemplate[];
  characters: CharacterRecord[];
  mapQuestBoards: MapQuestBoard[];
  guildQuests: GuildQuest[];
  timelineEvents: TimelineEvent[];
}

export function exportCampaignArchive(input: ExportCampaignInput): CampaignArchiveV2 {
  const gm = input.isEffectiveGm;

  const entities = input.entities.map((e) => ({
    ...e,
    gm_secrets: gm ? e.gm_secrets : '',
  }));

  const maps = input.maps.map((m) => {
    const cleanZones = gm
      ? m.zones
      : (m.zones || []).filter((z) => !z.is_gm_only);
    const cleanLabels = gm
      ? m.labels
      : (m.labels || []).filter((l) => !l.is_gm_only);
    const cleanFogVolumes = gm
      ? m.fog_volumes
      : (m.fog_volumes || []).filter((f) => !f.is_gm_only);
    const cleanBattlemap = m.battlemap
      ? gm
        ? m.battlemap
        : {
            ...m.battlemap,
            tokens: m.battlemap.tokens.filter((t) => !t.isHidden),
            walls: m.battlemap.walls.filter((w) => w.kind !== 'secret-wall'),
            doors: m.battlemap.doors.filter((d) => !d.isSecret),
            props: (m.battlemap.props || []).filter((p) => !p.isSecret),
          }
      : undefined;
    const cleanCombat = m.combat_state
      ? gm
        ? m.combat_state
        : {
            ...m.combat_state,
            entries: m.combat_state.entries.filter((entry) => !entry.isHidden),
          }
      : m.combat_state;

    return {
      ...m,
      zones: cleanZones,
      labels: cleanLabels,
      fog_volumes: cleanFogVolumes,
      battlemap: cleanBattlemap,
      combat_state: cleanCombat,
    };
  });

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    mode: gm ? 'gm' : 'player',
    campaign: {
      name: input.world.name,
      description: input.world.description || '',
      mode: input.world.mode || 'normal',
      max_players_per_party: input.world.max_players_per_party ?? 5,
      calendar_config: input.world.calendar_config ?? null,
      active_sheet_template_id: input.world.active_sheet_template_id ?? null,
    },
    entities,
    entityLinks: input.entityLinks,
    maps,
    mapPins: gm ? input.mapPins : input.mapPins.filter((p) => !p.is_gm_only),
    mapPaths: gm ? input.mapPaths : input.mapPaths.filter((p) => !p.is_gm_only),
    assets: input.assets,
    entityTemplates: Object.values(input.templates),
    sheetTemplates: input.sheetTemplates,
    characters: input.characters,
    mapQuestBoards: input.mapQuestBoards,
    guildQuests: input.guildQuests,
    timelineEvents: gm
      ? input.timelineEvents
      : input.timelineEvents.filter((ev) => !ev.is_gm_only),
  };
}

export interface RemappedCampaignBundle {
  world: World;
  entities: Entity[];
  entityLinks: EntityLink[];
  maps: VaultMap[];
  mapPins: MapPin[];
  mapPaths: MapPath[];
  assets: VaultAsset[];
  entityTemplates: EntityTemplate[];
  sheetTemplates: CharacterSheetTemplate[];
  characters: CharacterRecord[];
  mapQuestBoards: MapQuestBoard[];
  guildQuests: GuildQuest[];
  timelineEvents: TimelineEvent[];
}

export interface ImportCampaignOptions {
  campaignNameOverride?: string;
  campaignModeOverride?: CampaignMode;
  uploadDataUrl?: (dataUrl: string, folder: string) => Promise<string>;
}

export async function importCampaignJson(
  rawJson: string,
  ownerUserId: string,
  options: ImportCampaignOptions = {}
): Promise<RemappedCampaignBundle> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Invalid campaign archive JSON syntax.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Campaign archive must be a JSON object.');
  }

  const obj = parsed as Record<string, unknown>;
  const isV2 = obj.version === 2 && obj.campaign && typeof obj.campaign === 'object';
  const hasLegacyWorld = obj.world && typeof obj.world === 'object';

  if (!isV2 && !hasLegacyWorld) {
    throw new Error('Unsupported campaign archive format: missing campaign/world metadata.');
  }

  const newWorldId = crypto.randomUUID();
  const idMap = new Map<string, string>();
  const remapId = (oldId?: string | null): string | null => {
    if (!oldId) return null;
    if (!idMap.has(oldId)) {
      idMap.set(oldId, crypto.randomUUID());
    }
    return idMap.get(oldId)!;
  };
  const remapRequired = (oldId: string): string => remapId(oldId) || crypto.randomUUID();

  const uploader =
    options.uploadDataUrl ||
    (async (dataUrl: string, folder: string) => uploadAssetDataUrlOrBlob(dataUrl, folder));

  const uploadIfDataUrl = async (
    value: string | null | undefined,
    folder: string
  ): Promise<string | null> => {
    if (!value) return value ?? null;
    if (!value.startsWith('data:')) return value;
    try {
      return await uploader(value, `campaigns/${newWorldId}/${folder}`);
    } catch {
      return value;
    }
  };

  if (obj.entities !== undefined && !Array.isArray(obj.entities)) {
    throw new Error('Invalid campaign archive format: entities must be an array.');
  }

  const rawCampaign = (isV2 ? obj.campaign : obj.world) as Record<string, unknown>;
  const rawEntities = Array.isArray(obj.entities) ? (obj.entities as Entity[]) : [];
  const rawLinks = Array.isArray(obj.entityLinks) ? (obj.entityLinks as EntityLink[]) : [];
  const rawMaps = Array.isArray(obj.maps) ? (obj.maps as VaultMap[]) : [];
  const rawPins = Array.isArray(obj.mapPins) ? (obj.mapPins as MapPin[]) : [];
  const rawPaths = Array.isArray(obj.mapPaths) ? (obj.mapPaths as MapPath[]) : [];
  const rawAssets = Array.isArray(obj.assets) ? (obj.assets as VaultAsset[]) : [];
  const rawEntityTemplates = Array.isArray(obj.entityTemplates)
    ? (obj.entityTemplates as EntityTemplate[])
    : [];
  const rawSheetTemplates = Array.isArray(obj.sheetTemplates)
    ? (obj.sheetTemplates as CharacterSheetTemplate[])
    : [];
  const rawCharacters = Array.isArray(obj.characters) ? (obj.characters as CharacterRecord[]) : [];
  const rawBoards = Array.isArray(obj.mapQuestBoards)
    ? (obj.mapQuestBoards as MapQuestBoard[])
    : [];
  const rawQuests = Array.isArray(obj.guildQuests) ? (obj.guildQuests as GuildQuest[]) : [];
  const rawTimeline = Array.isArray(obj.timelineEvents)
    ? (obj.timelineEvents as TimelineEvent[])
    : [];

  // Pre-register IDs so forward references resolve consistently
  rawEntities.forEach((e) => remapRequired(e.id));
  rawMaps.forEach((m) => remapRequired(m.id));
  rawSheetTemplates.forEach((st) => remapRequired(st.id));
  rawCharacters.forEach((c) => remapRequired(c.id));
  rawBoards.forEach((b) => remapRequired(b.id));

  const modeRaw = options.campaignModeOverride || rawCampaign.mode;
  const mode: CampaignMode = modeRaw === 'west_marches' ? 'west_marches' : 'normal';

  const world: World = {
    id: newWorldId,
    owner_id: ownerUserId,
    name:
      options.campaignNameOverride?.trim() ||
      (typeof rawCampaign.name === 'string' && rawCampaign.name.trim()
        ? `${rawCampaign.name.trim()} (Imported)`
        : 'Imported Campaign'),
    description: typeof rawCampaign.description === 'string' ? rawCampaign.description : '',
    mode,
    max_players_per_party:
      typeof rawCampaign.max_players_per_party === 'number'
        ? Math.max(1, rawCampaign.max_players_per_party)
        : 5,
    calendar_config: (rawCampaign.calendar_config as CampaignCalendarConfig | null) ?? null,
    active_sheet_template_id: remapId(
      typeof rawCampaign.active_sheet_template_id === 'string'
        ? rawCampaign.active_sheet_template_id
        : null
    ),
  };

  const sheetTemplates: CharacterSheetTemplate[] = rawSheetTemplates.map((st) => ({
    ...st,
    id: remapRequired(st.id),
    campaign_id: newWorldId,
    updated_by: ownerUserId,
    updated_at: new Date().toISOString(),
  }));

  const entities: Entity[] = await Promise.all(
    rawEntities.map(async (e) => ({
      ...e,
      id: remapRequired(e.id),
      world_id: newWorldId,
      cover_image_url: await uploadIfDataUrl(e.cover_image_url, 'entities'),
      updated_at: new Date().toISOString(),
    }))
  );

  const entityIdSet = new Set(entities.map((e) => e.id));
  const entityLinks: EntityLink[] = rawLinks
    .map((l) => ({
      source_id: remapRequired(l.source_id),
      target_id: remapRequired(l.target_id),
      world_id: newWorldId,
    }))
    .filter((l) => entityIdSet.has(l.source_id) && entityIdSet.has(l.target_id));

  const maps: VaultMap[] = await Promise.all(
    rawMaps.map(async (m) => {
      const nextMapId = remapRequired(m.id);
      return {
        ...m,
        id: nextMapId,
        world_id: newWorldId,
        albedo_url: await uploadIfDataUrl(m.albedo_url, `maps/${nextMapId}`),
        heightmap_url: await uploadIfDataUrl(m.heightmap_url, `maps/${nextMapId}`),
        paint_url: await uploadIfDataUrl(m.paint_url, `maps/${nextMapId}`),
        fog_of_war_2d: await uploadIfDataUrl(m.fog_of_war_2d, `maps/${nextMapId}`),
        zones: (m.zones || []).map((z) => ({
          ...z,
          entityId: z.entityId ? remapId(z.entityId) : null,
        })),
        battlemap: m.battlemap
          ? {
              ...m.battlemap,
              backgroundUrl: await uploadIfDataUrl(m.battlemap.backgroundUrl, `maps/${nextMapId}`),
              revealedMaskUrl: await uploadIfDataUrl(m.battlemap.revealedMaskUrl, `maps/${nextMapId}`),
              tokens: (m.battlemap.tokens || []).map((tok) => ({
                ...tok,
                entity_id: tok.entity_id ? remapId(tok.entity_id) : null,
                character_id: tok.character_id ? remapId(tok.character_id) : null,
                owner_user_id: tok.owner_user_id ? ownerUserId : null,
              })),
            }
          : undefined,
      };
    })
  );

  const mapPins: MapPin[] = rawPins.map((p) => ({
    ...p,
    id: remapRequired(p.id),
    map_id: remapRequired(p.map_id),
    entity_id: p.entity_id ? remapId(p.entity_id) : null,
  }));

  const mapPaths: MapPath[] = rawPaths.map((p) => ({
    ...p,
    id: remapRequired(p.id),
    map_id: remapRequired(p.map_id),
  }));

  const assets: VaultAsset[] = await Promise.all(
    rawAssets.map(async (a) => ({
      ...a,
      id: remapRequired(a.id),
      world_id: newWorldId,
      url: (await uploadIfDataUrl(a.url, 'assets')) || a.url,
    }))
  );

  const activeWmClaimed = new Set<string>();
  const characters: CharacterRecord[] = await Promise.all(
    rawCharacters.map(async (c) => {
      let isActive = Boolean(c.is_active);
      if (mode === 'west_marches' && isActive) {
        if (activeWmClaimed.has(ownerUserId)) {
          isActive = false;
        } else {
          activeWmClaimed.add(ownerUserId);
        }
      }
      return {
        ...c,
        id: remapRequired(c.id),
        campaign_id: newWorldId,
        user_id: ownerUserId,
        portrait_url: await uploadIfDataUrl(c.portrait_url, 'characters'),
        entity_id: c.entity_id ? remapId(c.entity_id) : null,
        sheet_template_id: c.sheet_template_id ? remapId(c.sheet_template_id) : null,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };
    })
  );

  const mapQuestBoards: MapQuestBoard[] = rawBoards.map((b) => ({
    ...b,
    id: remapRequired(b.id),
    map_id: remapRequired(b.map_id),
    campaign_id: newWorldId,
    created_by: ownerUserId,
  }));

  const guildQuests: GuildQuest[] = rawQuests.map((q) => ({
    ...q,
    id: remapRequired(q.id),
    board_id: remapRequired(q.board_id),
    campaign_id: newWorldId,
    linked_entity_id: q.linked_entity_id ? remapId(q.linked_entity_id) : null,
    created_by: ownerUserId,
  }));

  const timelineEvents: TimelineEvent[] = rawTimeline.map((ev) => ({
    ...ev,
    id: remapRequired(ev.id),
    campaign_id: newWorldId,
    linked_entity_id: ev.linked_entity_id ? remapId(ev.linked_entity_id) : null,
    created_by: ownerUserId,
  }));

  return {
    world,
    entities,
    entityLinks,
    maps,
    mapPins,
    mapPaths,
    assets,
    entityTemplates: rawEntityTemplates,
    sheetTemplates,
    characters,
    mapQuestBoards,
    guildQuests,
    timelineEvents,
  };
}
