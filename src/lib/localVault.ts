import { DEFAULT_CALENDAR_CONFIG, buildSeedDataset } from '../data/seedData';
import { SHEET_PRESET_5E } from '../data/sheetPresets';
import { DEFAULT_TEMPLATES } from '../data/templates';
import { createSeededSmugglerVaultsBattlemap } from './battlemapGenerator';
import type {
  CampaignMember,
  CharacterRecord,
  CharacterSheetTemplate,
  DiceRollRecord,
  Entity,
  EntityLink,
  EntityTemplate,
  EntityType,
  GuildQuest,
  GuildQuestSignup,
  JournalPage,
  JournalPageShare,
  MapFogShare,
  MapFogState,
  MapPath,
  MapPin,
  MapQuestBoard,
  PlayerProfile,
  TabItem,
  TimelineEvent,
  VaultAsset,
  VaultMap,
  World,
} from '../types/vault';

export const LOCAL_VAULT_STORAGE_KEY = 'aethelgard_local_vault_v1';
export const LOCAL_USER_ID = 'local-architect';
export const LOCAL_USER_EMAIL = 'local@aethelgard.vault';

export interface LocalCampaignBundle {
  world: World;
  campaignMembers: CampaignMember[];
  entities: Entity[];
  entityLinks: EntityLink[];
  maps: VaultMap[];
  mapPins: MapPin[];
  mapPaths: MapPath[];
  assets: VaultAsset[];
  templates: Record<EntityType, EntityTemplate>;
  sheetTemplates: CharacterSheetTemplate[];
  characters: CharacterRecord[];
  questBoards: MapQuestBoard[];
  guildQuests: GuildQuest[];
  guildQuestSignups: GuildQuestSignup[];
  journalPages: JournalPage[];
  journalPageShares: JournalPageShare[];
  mapFogStates: MapFogState[];
  mapFogShares: MapFogShare[];
  diceRolls: DiceRollRecord[];
  timelineEvents: TimelineEvent[];
}

export interface LocalVaultStorage {
  version: 1;
  profile: PlayerProfile;
  activeCampaignId: string | null;
  campaigns: Record<string, LocalCampaignBundle>;
}

export function createDefaultLocalProfile(): PlayerProfile {
  return {
    id: LOCAL_USER_ID,
    display_name: 'Aethelgard Architect',
    avatar_url: null,
    bio: 'Default Local Browser Vault workspace (connect optional Supabase backend anytime in Settings).',
    updated_at: new Date().toISOString(),
  };
}

export function buildLocalCampaignBundle(options: {
  worldId?: string;
  name?: string;
  description?: string;
  mode?: 'normal' | 'west_marches';
  maxPlayersPerParty?: number;
  seedStarter?: boolean;
  ownerProfile?: PlayerProfile;
}): { bundle: LocalCampaignBundle; initialTabs: TabItem[]; activeTabId: string } {
  const profile = options.ownerProfile || createDefaultLocalProfile();
  const now = new Date().toISOString();

  if (options.seedStarter === false) {
    const worldId = options.worldId || crypto.randomUUID();
    const tplId = crypto.randomUUID();
    const world: World = {
      id: worldId,
      owner_id: LOCAL_USER_ID,
      name: options.name?.trim() || 'Untitled Campaign',
      description: options.description?.trim() || '',
      mode: options.mode || 'west_marches',
      max_players_per_party: Math.max(1, options.maxPlayersPerParty ?? 5),
      active_sheet_template_id: tplId,
      calendar_config: DEFAULT_CALENDAR_CONFIG,
      invite_code: worldId.replace(/-/g, '').slice(0, 8).toUpperCase(),
      updated_at: now,
    };

    const sheetTpl: CharacterSheetTemplate = {
      id: tplId,
      campaign_id: worldId,
      name: SHEET_PRESET_5E.name,
      system_label: SHEET_PRESET_5E.system_label,
      html_template: SHEET_PRESET_5E.html_template,
      css_template: SHEET_PRESET_5E.css_template,
      schema_json: SHEET_PRESET_5E.schema_json,
      updated_by: LOCAL_USER_ID,
      updated_at: now,
    };

    const hubTab: TabItem = {
      id: 'tab-profile-hub',
      kind: 'profile_hub',
      targetId: 'profile_hub',
      title: 'Profile & Campaigns',
      iconType: 'Campaign',
    };

    return {
      bundle: {
        world,
        campaignMembers: [
          {
            campaign_id: worldId,
            user_id: LOCAL_USER_ID,
            role: 'gm',
            joined_at: now,
            profile,
          },
        ],
        entities: [],
        entityLinks: [],
        maps: [],
        mapPins: [],
        mapPaths: [],
        assets: [],
        templates: { ...DEFAULT_TEMPLATES },
        sheetTemplates: [sheetTpl],
        characters: [],
        questBoards: [],
        guildQuests: [],
        guildQuestSignups: [],
        journalPages: [],
        journalPageShares: [],
        mapFogStates: [],
        mapFogShares: [],
        diceRolls: [],
        timelineEvents: [],
      },
      initialTabs: [hubTab],
      activeTabId: hubTab.id,
    };
  }

  const seed = buildSeedDataset();
  const worldId = options.worldId || seed.world.id;
  const tplId = `sheet-5e-${worldId}`;
  const seeded2dMapId = `map-smuggler-vaults-${worldId}`;

  const world: World = {
    ...seed.world,
    id: worldId,
    owner_id: LOCAL_USER_ID,
    name: options.name?.trim() || seed.world.name,
    description: options.description?.trim() || seed.world.description,
    mode: options.mode || seed.world.mode,
    max_players_per_party: options.maxPlayersPerParty ?? seed.world.max_players_per_party,
    active_sheet_template_id: tplId,
    invite_code: seed.world.invite_code || 'LOCALWM1',
    updated_at: now,
  };

  const sheetTpl: CharacterSheetTemplate = {
    id: tplId,
    campaign_id: worldId,
    name: SHEET_PRESET_5E.name,
    system_label: SHEET_PRESET_5E.system_label,
    html_template: SHEET_PRESET_5E.html_template,
    css_template: SHEET_PRESET_5E.css_template,
    schema_json: SHEET_PRESET_5E.schema_json,
    updated_by: LOCAL_USER_ID,
    updated_at: now,
  };

  const maps: VaultMap[] = [
    ...seed.maps.map((m) => ({ ...m, world_id: worldId })),
    {
      id: seeded2dMapId,
      world_id: worldId,
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
      combat_state: {
        active: true,
        round: 1,
        activeTurnIndex: 0,
        entries: [
          {
            id: 'init-seraphina',
            name: 'Seraphina Vance',
            initiative: 19,
            hp: 38,
            maxHp: 42,
            ac: 16,
            conditions: [],
          },
          {
            id: 'init-enforcer',
            name: 'Shadow Enforcer',
            initiative: 14,
            hp: 28,
            maxHp: 28,
            ac: 15,
            conditions: [],
          },
        ],
      },
    },
  ];

  const starterChar: CharacterRecord = {
    id: `char-seraphina-${worldId}`,
    campaign_id: worldId,
    user_id: LOCAL_USER_ID,
    name: 'Seraphina Vance',
    portrait_url: seed.assets[3]?.url ?? null,
    entity_id: 'ent-lady-vaelora',
    sheet_template_id: tplId,
    attributes: {
      char_name: 'Seraphina Vance',
      class_level: 'Chronomancer Mage 6',
      prof: 3,
      ac: 16,
      hp: 38,
      max_hp: 42,
      str: 10,
      dex: 16,
      con: 14,
      int: 19,
      wis: 13,
      cha: 15,
      attacks_notes: 'Shatterglass Lance (+7 to hit, 2d8+4 force)\nTemporal Echo (Reaction, once/rest)',
      features_notes: 'Investigating Shadow Guild smuggling beneath Oakhaven Old Lighthouse.',
    },
    is_active: true,
    updated_at: now,
  };

  const boardId = `board-oakhaven-${worldId}`;
  const questBoards: MapQuestBoard[] = [
    {
      id: boardId,
      map_id: seeded2dMapId,
      campaign_id: worldId,
      title: 'Oakhaven Lantern Guild Board',
      description: 'Active West Marches contracts posted outside the Harbor Magistracy.',
      x: 0,
      y: 0,
      z: 0,
      created_by: LOCAL_USER_ID,
      created_at: now,
    },
  ];

  const guildQuests: GuildQuest[] = [
    {
      id: `quest-lighthouse-${worldId}`,
      board_id: boardId,
      campaign_id: worldId,
      title: 'Shadows Beneath the Old Lighthouse',
      summary: 'Trace the midnight smuggler barges slipping beneath the basalt sea-gate at low tide.',
      danger_tier: 'Tier II (Lv 5–7)',
      reward: '650 gp + Guild Writ',
      scheduled_at: 'Next Expedition',
      max_players: 5,
      status: 'open',
      linked_entity_id: 'ent-oakhaven',
      created_by: LOCAL_USER_ID,
      created_at: now,
      updated_at: now,
    },
    {
      id: `quest-spire-${worldId}`,
      board_id: boardId,
      campaign_id: worldId,
      title: 'Escort to Ashen Spire Observatory',
      summary: 'Carry the Obsidian Astrolabe across the high ridge before the eclipse conjunction.',
      danger_tier: 'Tier III (Lv 7+)',
      reward: '900 gp + 1 Rare Relic',
      scheduled_at: 'Open Roster',
      max_players: 4,
      status: 'in_progress',
      linked_entity_id: 'ent-ashen-spire',
      created_by: LOCAL_USER_ID,
      created_at: now,
      updated_at: now,
    },
  ];

  const journalPages: JournalPage[] = [
    {
      id: `journal-day1-${worldId}`,
      campaign_id: worldId,
      owner_id: LOCAL_USER_ID,
      title: 'Expedition Log — Oakhaven Harbor',
      content: `# Expedition Log — Oakhaven Harbor\n\nMet Harbor-Master [[Kaelen Voss]] by the Salt-Iron Docks. Three Magistracy dock-wardens changed shifts early near [[The Glass Shoals]].\n\n- [x] Secure charter pass from [[Oakhaven]]\n- [ ] Inspect the Old Lighthouse cellar at low tide`,
      tags: ['session-log', 'oakhaven'],
      share_scope: 'campaign',
      updated_at: now,
    },
  ];

  const timelineEvents: TimelineEvent[] = [
    {
      id: `tl-1-${worldId}`,
      campaign_id: worldId,
      title: 'Founding of the Oakhaven Charter',
      date_label: '3 Embertide, Year 412',
      sort_order: 10,
      era: 'Age of Cinders',
      description: 'Independent captains establish the West Marches free port on the western rim.',
      linked_entity_id: 'ent-oakhaven',
      is_gm_only: false,
      created_by: LOCAL_USER_ID,
      created_at: now,
    },
    {
      id: `tl-2-${worldId}`,
      campaign_id: worldId,
      title: 'Whispers Beneath the Shoals',
      date_label: '14 Embertide, Year 412',
      sort_order: 20,
      era: 'Age of Cinders',
      description: 'Smugglers uncover a sealed clockwork gate leading toward The Sunken Reliquary.',
      linked_entity_id: 'ent-sunken-reliquary',
      is_gm_only: false,
      created_by: LOCAL_USER_ID,
      created_at: now,
    },
  ];

  return {
    bundle: {
      world,
      campaignMembers: [
        {
          campaign_id: worldId,
          user_id: LOCAL_USER_ID,
          role: 'gm',
          joined_at: now,
          profile,
        },
      ],
      entities: seed.entities.map((e) => ({ ...e, world_id: worldId })),
      entityLinks: seed.entityLinks,
      maps,
      mapPins: seed.mapPins,
      mapPaths: seed.mapPaths,
      assets: seed.assets.map((a) => ({ ...a, world_id: worldId })),
      templates: { ...DEFAULT_TEMPLATES },
      sheetTemplates: [sheetTpl],
      characters: [starterChar],
      questBoards,
      guildQuests,
      guildQuestSignups: [],
      journalPages,
      journalPageShares: [],
      mapFogStates: [],
      mapFogShares: [],
      diceRolls: [],
      timelineEvents,
    },
    initialTabs: seed.initialTabs,
    activeTabId: 'tab-oakhaven',
  };
}

export function buildDefaultLocalVaultStorage(): LocalVaultStorage {
  const profile = createDefaultLocalProfile();
  const { bundle } = buildLocalCampaignBundle({
    seedStarter: true,
    ownerProfile: profile,
  });

  return {
    version: 1,
    profile,
    activeCampaignId: bundle.world.id,
    campaigns: {
      [bundle.world.id]: bundle,
    },
  };
}

export function loadLocalVaultStorage(): LocalVaultStorage {
  if (typeof localStorage === 'undefined') {
    return buildDefaultLocalVaultStorage();
  }
  try {
    const raw = localStorage.getItem(LOCAL_VAULT_STORAGE_KEY);
    if (!raw) {
      const fresh = buildDefaultLocalVaultStorage();
      saveLocalVaultStorage(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<LocalVaultStorage>;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !parsed.campaigns ||
      Object.keys(parsed.campaigns).length === 0
    ) {
      const fresh = buildDefaultLocalVaultStorage();
      saveLocalVaultStorage(fresh);
      return fresh;
    }
    return {
      version: 1,
      profile: parsed.profile || createDefaultLocalProfile(),
      activeCampaignId:
        parsed.activeCampaignId && parsed.campaigns[parsed.activeCampaignId]
          ? parsed.activeCampaignId
          : Object.keys(parsed.campaigns)[0],
      campaigns: parsed.campaigns,
    };
  } catch {
    return buildDefaultLocalVaultStorage();
  }
}

export function saveLocalVaultStorage(data: LocalVaultStorage): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_VAULT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Fallback if storage quota is tight (e.g., large terrain heightmaps): omit large data URLs
    try {
      const compactCampaigns: Record<string, LocalCampaignBundle> = {};
      for (const [id, bundle] of Object.entries(data.campaigns)) {
        compactCampaigns[id] = {
          ...bundle,
          maps: bundle.maps.map((m) => ({
            ...m,
            heightmap_url:
              m.heightmap_url && m.heightmap_url.length > 180_000 ? null : m.heightmap_url,
          })),
        };
      }
      localStorage.setItem(
        LOCAL_VAULT_STORAGE_KEY,
        JSON.stringify({ ...data, campaigns: compactCampaigns })
      );
    } catch {
      // ignore unrecoverable storage quota errors
    }
  }
}

export function clearLocalVaultStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LOCAL_VAULT_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export async function sourceToLocalDataUrl(source: File | Blob | string): Promise<string> {
  if (typeof source === 'string') return source;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read local file.'));
    reader.readAsDataURL(source);
  });
}
