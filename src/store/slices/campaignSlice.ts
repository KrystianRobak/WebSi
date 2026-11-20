import { SHEET_PRESET_5E } from '../../data/sheetPresets';
import { DEFAULT_CALENDAR_CONFIG } from '../../data/seedData';
import { DEFAULT_TEMPLATES } from '../../data/templates';
import { resolveEffectiveAppMode, setUrlAppMode, storeAppMode } from '../../lib/appRouter';
import { importCampaignJson } from '../../lib/campaignArchive';
import {
  normalizeMapOverlay,
  seedStarterCampaign,
  serializeMapRow,
  serializeTemplateRow,
} from '../../lib/campaignSync';
import {
  buildLocalCampaignBundle,
  createDefaultLocalProfile,
  loadLocalVaultStorage,
  saveLocalVaultStorage,
} from '../../lib/localVault';
import { getSupabaseClient } from '../../lib/supabase';
import type {
  BattlemapToken,
  CampaignMember,
  CampaignRole,
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
} from '../../types/vault';
import {
  CLIENT_INSTANCE_ID,
  EMPTY_WORLD,
  syncRuntime,
  type VaultSlice,
  type VaultState,
} from './types';

function readStoredActiveCampaignId(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return sessionStorage.getItem('aethelgard_active_campaign_id');
  } catch {
    return null;
  }
}

function storeActiveCampaignId(id: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (id) sessionStorage.setItem('aethelgard_active_campaign_id', id);
    else sessionStorage.removeItem('aethelgard_active_campaign_id');
  } catch {
    // ignore storage errors
  }
}

const REALTIME_TABLES = [
  'worlds',
  'campaign_members',
  'entities',
  'entity_links',
  'maps',
  'map_pins',
  'map_paths',
  'vault_assets',
  'entity_templates',
  'character_sheet_templates',
  'characters',
  'map_quest_boards',
  'guild_quests',
  'guild_quest_signups',
  'journal_pages',
  'journal_page_shares',
  'map_fog_states',
  'map_fog_shares',
  'dice_rolls',
  'timeline_events',
];

async function attachRealtimeChannel(
  campaignId: string,
  getState: () => VaultState,
  setState: (partial: Partial<VaultState>) => void
) {
  const client = getSupabaseClient();
  if (!client) return;

  if (syncRuntime.realtimeChannel) {
    await client.removeChannel(syncRuntime.realtimeChannel);
    syncRuntime.realtimeChannel = null;
  }

  let channel = client.channel(`vault-campaign-${campaignId}`);
  channel = channel.on('broadcast', { event: 'vault-changed' }, (msg) => {
    const sender = (msg?.payload as { senderId?: string } | undefined)?.senderId;
    if (sender && sender === CLIENT_INSTANCE_ID) return;
    if (syncRuntime.broadcastSyncDebounce) clearTimeout(syncRuntime.broadcastSyncDebounce);
    syncRuntime.broadcastSyncDebounce = setTimeout(() => {
      getState().syncFromSupabase();
    }, 200);
  });

  for (const table of REALTIME_TABLES) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => {
        if (syncRuntime.realtimeSyncDebounce) clearTimeout(syncRuntime.realtimeSyncDebounce);
        syncRuntime.realtimeSyncDebounce = setTimeout(() => {
          getState().syncFromSupabase();
        }, 220);
      }
    );
  }

  syncRuntime.realtimeChannel = channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      setState({ syncStatus: 'synced' });
    }
  });
}

export type CampaignSlice = Pick<
  VaultState,
  | 'campaigns'
  | 'activeCampaignId'
  | 'world'
  | 'campaignMembers'
  | 'myRole'
  | 'syncStatus'
  | 'lastSyncError'
  | 'isEffectiveGm'
  | 'isStudioEditing'
  | 'canEditToken'
  | 'loadMyCampaigns'
  | 'switchCampaign'
  | 'createCampaign'
  | 'importCampaignArchiveJson'
  | 'joinCampaignByInvite'
  | 'updateCampaignSettings'
  | 'regenerateInviteCode'
  | 'updateMemberRole'
  | 'removeCampaignMember'
  | 'leaveCampaign'
  | 'syncFromSupabase'
  | 'seedSupabaseWorld'
>;

export const createCampaignSlice: VaultSlice<CampaignSlice> = (set, get) => ({
  campaigns: [],
  activeCampaignId: readStoredActiveCampaignId(),
  world: EMPTY_WORLD,
  campaignMembers: [],
  myRole: null,
  syncStatus: 'offline',
  lastSyncError: null,

  isEffectiveGm: () => {
    const s = get();
    return (s.myRole === 'gm' || s.myRole === 'co_gm') && s.gmMode;
  },

  isStudioEditing: () => {
    const s = get();
    return s.appMode === 'studio' && (s.myRole === 'gm' || s.myRole === 'co_gm') && s.gmMode;
  },

  canEditToken: (token: BattlemapToken) => {
    const s = get();
    if ((s.myRole === 'gm' || s.myRole === 'co_gm') && s.gmMode) return true;
    if (!s.user || token.isHidden) return false;
    if (token.owner_user_id && token.owner_user_id === s.user.id) return true;
    if (token.character_id) {
      return s.characters.some((c) => c.id === token.character_id && c.user_id === s.user!.id);
    }
    return false;
  },

  loadMyCampaigns: async () => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.user) return;

    set({ syncStatus: 'syncing', lastSyncError: null });
    const { data: worldsData, error } = await client
      .from('worlds')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      set({ syncStatus: 'error', lastSyncError: error.message });
      return;
    }

    const worlds = (worldsData || []) as World[];
    set({ campaigns: worlds });

    if (worlds.length === 0) {
      storeActiveCampaignId(null);
      set({
        activeCampaignId: null,
        world: EMPTY_WORLD,
        campaignMembers: [],
        myRole: null,
        entities: [],
        entityLinks: [],
        maps: [],
        mapPins: [],
        mapPaths: [],
        assets: [],
        sheetTemplates: [],
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
        tabs: [
          {
            id: 'tab-profile-hub',
            kind: 'profile_hub',
            targetId: 'profile_hub',
            title: 'Profile & Campaigns',
            iconType: 'Campaign',
          },
        ],
        activeTabId: 'tab-profile-hub',
        syncStatus: 'synced',
      });
      return;
    }

    const chosenId =
      state.activeCampaignId && worlds.some((w) => w.id === state.activeCampaignId)
        ? state.activeCampaignId
        : worlds[0].id;

    storeActiveCampaignId(chosenId);
    set({ activeCampaignId: chosenId });
    await get().syncFromSupabase();
    await attachRealtimeChannel(chosenId, get, set);
  },

  switchCampaign: async (campaignId) => {
    const state = get();
    if (!campaignId) return;
    if (state.activeCampaignId === campaignId && state.world.id === campaignId) return;

    const client = getSupabaseClient();
    if (!client) {
      const storage = loadLocalVaultStorage();
      const target = storage.campaigns[campaignId];
      if (!target) return;
      saveLocalVaultStorage({ ...storage, activeCampaignId: campaignId });
      storeActiveCampaignId(campaignId);
      const firstEnt = target.entities[0];
      const firstMap = target.maps[0];
      const nextTabs: TabItem[] = [
        ...(firstEnt
          ? [{ id: `tab-${firstEnt.id}`, kind: 'entity' as const, targetId: firstEnt.id, title: firstEnt.title, iconType: firstEnt.type }]
          : []),
        ...(firstMap
          ? [{ id: `tab-map-${firstMap.id}`, kind: 'map' as const, targetId: firstMap.id, title: firstMap.name, iconType: 'Map' as const }]
          : []),
      ];
      if (nextTabs.length === 0) {
        nextTabs.push({
          id: 'tab-profile-hub',
          kind: 'profile_hub',
          targetId: 'profile_hub',
          title: 'Profile & Campaigns',
          iconType: 'Campaign',
        });
      }
      set({
        activeCampaignId: campaignId,
        world: target.world,
        campaignMembers: target.campaignMembers,
        myRole: 'gm',
        entities: target.entities,
        entityLinks: target.entityLinks,
        maps: target.maps,
        mapPins: target.mapPins,
        mapPaths: target.mapPaths,
        assets: target.assets,
        templates: target.templates,
        sheetTemplates: target.sheetTemplates,
        characters: target.characters,
        questBoards: target.questBoards,
        guildQuests: target.guildQuests,
        guildQuestSignups: target.guildQuestSignups,
        journalPages: target.journalPages,
        journalPageShares: target.journalPageShares,
        mapFogStates: target.mapFogStates,
        mapFogShares: target.mapFogShares,
        diceRolls: target.diceRolls,
        timelineEvents: target.timelineEvents,
        tabs: nextTabs,
        activeTabId: nextTabs[0]?.id || '',
        splitPaneTabId: null,
        playActiveMapId: target.maps.find((m) => m.kind === '2d')?.id ?? target.maps[0]?.id ?? null,
        past: [],
        future: [],
      });
      return;
    }

    storeActiveCampaignId(campaignId);
    set({
      activeCampaignId: campaignId,
      past: [],
      future: [],
      selectedPinId: null,
      selectedZoneId: null,
      selectedLabelId: null,
      selectedQuestBoardId: null,
      selectedTokenId: null,
      selectedDoorId: null,
      selectedLightId: null,
      selectedPropId2D: null,
      tabs: [],
      activeTabId: '',
      splitPaneTabId: null,
    });
    await get().syncFromSupabase();
    await attachRealtimeChannel(campaignId, get, set);
  },

  createCampaign: async ({ name, description = '', mode, maxPlayersPerParty = 5, seedStarter = false }) => {
    const client = getSupabaseClient();
    const state = get();
    if (!state.user) {
      return { worldId: null, error: 'You must be signed in to create a campaign.' };
    }

    const cleanName = name.trim();
    if (!cleanName) {
      return { worldId: null, error: 'Campaign name is required.' };
    }

    const worldId = crypto.randomUUID();

    if (!client) {
      const storage = loadLocalVaultStorage();
      const { bundle } = buildLocalCampaignBundle({
        worldId,
        name: cleanName,
        description,
        mode,
        maxPlayersPerParty,
        seedStarter,
        ownerProfile: state.profile || storage.profile || createDefaultLocalProfile(),
      });
      const nextStorage = {
        ...storage,
        activeCampaignId: worldId,
        campaigns: { ...storage.campaigns, [worldId]: bundle },
      };
      saveLocalVaultStorage(nextStorage);
      set({
        campaigns: Object.values(nextStorage.campaigns).map((b) => b.world),
        activeCampaignId: worldId,
        world: bundle.world,
        campaignMembers: bundle.campaignMembers,
        myRole: 'gm',
        gmMode: true,
        entities: bundle.entities,
        entityLinks: bundle.entityLinks,
        maps: bundle.maps,
        mapPins: bundle.mapPins,
        mapPaths: bundle.mapPaths,
        assets: bundle.assets,
        templates: bundle.templates,
        sheetTemplates: bundle.sheetTemplates,
        characters: bundle.characters,
        questBoards: bundle.questBoards,
        guildQuests: bundle.guildQuests,
        guildQuestSignups: bundle.guildQuestSignups,
        journalPages: bundle.journalPages,
        journalPageShares: bundle.journalPageShares,
        mapFogStates: bundle.mapFogStates,
        mapFogShares: bundle.mapFogShares,
        diceRolls: bundle.diceRolls,
        timelineEvents: bundle.timelineEvents,
        playActiveMapId: bundle.maps.find((m) => m.kind === '2d')?.id ?? bundle.maps[0]?.id ?? null,
      });
      return { worldId, error: null };
    }

    if (seedStarter) {
      const res = await seedStarterCampaign(client, state.user.id, {
        worldId,
        name: cleanName,
        description,
        mode,
        maxPlayersPerParty,
      });
      if (res.error) return { worldId: null, error: res.error };
    } else {
      const { error: wErr } = await client.from('worlds').insert({
        id: worldId,
        owner_id: state.user.id,
        name: cleanName,
        description: description.trim(),
        mode,
        max_players_per_party: Math.max(1, maxPlayersPerParty),
        calendar_config: DEFAULT_CALENDAR_CONFIG,
      });
      if (wErr) return { worldId: null, error: wErr.message };

      const tplId = crypto.randomUUID();
      const { error: stErr } = await client.from('character_sheet_templates').insert({
        id: tplId,
        campaign_id: worldId,
        name: SHEET_PRESET_5E.name,
        system_label: SHEET_PRESET_5E.system_label,
        html_template: SHEET_PRESET_5E.html_template,
        css_template: SHEET_PRESET_5E.css_template,
        schema_json: SHEET_PRESET_5E.schema_json,
        updated_by: state.user.id,
      });
      if (!stErr) {
        await client
          .from('worlds')
          .update({ active_sheet_template_id: tplId })
          .eq('id', worldId);
      }
    }

    set({ activeCampaignId: worldId, gmMode: true });
    storeActiveCampaignId(worldId);
    await get().loadMyCampaigns();
    return { worldId, error: null };
  },

  importCampaignArchiveJson: async (rawJson, options) => {
    const client = getSupabaseClient();
    const state = get();
    if (!state.user) {
      return { worldId: null, error: 'Sign in before importing a campaign archive.' };
    }

    try {
      const bundle = await importCampaignJson(rawJson, state.user.id, {
        campaignNameOverride: options?.nameOverride,
        campaignModeOverride: options?.modeOverride,
      });

      if (!client) {
        const storage = loadLocalVaultStorage();
        const ownerProf = state.profile || storage.profile || createDefaultLocalProfile();
        const tplMap = { ...DEFAULT_TEMPLATES };
        for (const tpl of bundle.entityTemplates) {
          tplMap[tpl.type] = tpl;
        }
        const localBundle = {
          world: bundle.world,
          campaignMembers: [
            {
              campaign_id: bundle.world.id,
              user_id: state.user.id,
              role: 'gm' as const,
              joined_at: new Date().toISOString(),
              profile: ownerProf,
            },
          ],
          entities: bundle.entities,
          entityLinks: bundle.entityLinks,
          maps: bundle.maps,
          mapPins: bundle.mapPins,
          mapPaths: bundle.mapPaths,
          assets: bundle.assets,
          templates: tplMap,
          sheetTemplates: bundle.sheetTemplates,
          characters: bundle.characters,
          questBoards: bundle.mapQuestBoards,
          guildQuests: bundle.guildQuests,
          guildQuestSignups: [],
          journalPages: [],
          journalPageShares: [],
          mapFogStates: [],
          mapFogShares: [],
          diceRolls: [],
          timelineEvents: bundle.timelineEvents,
        };
        const nextStorage = {
          ...storage,
          activeCampaignId: bundle.world.id,
          campaigns: { ...storage.campaigns, [bundle.world.id]: localBundle },
        };
        saveLocalVaultStorage(nextStorage);
        set({
          campaigns: Object.values(nextStorage.campaigns).map((b) => b.world),
          activeCampaignId: bundle.world.id,
          world: localBundle.world,
          campaignMembers: localBundle.campaignMembers,
          myRole: 'gm',
          gmMode: true,
          entities: localBundle.entities,
          entityLinks: localBundle.entityLinks,
          maps: localBundle.maps,
          mapPins: localBundle.mapPins,
          mapPaths: localBundle.mapPaths,
          assets: localBundle.assets,
          templates: localBundle.templates,
          sheetTemplates: localBundle.sheetTemplates,
          characters: localBundle.characters,
          questBoards: localBundle.questBoards,
          guildQuests: localBundle.guildQuests,
          guildQuestSignups: [],
          journalPages: [],
          journalPageShares: [],
          mapFogStates: [],
          mapFogShares: [],
          diceRolls: [],
          timelineEvents: localBundle.timelineEvents,
          playActiveMapId: localBundle.maps.find((m) => m.kind === '2d')?.id ?? localBundle.maps[0]?.id ?? null,
        });
        return { worldId: bundle.world.id, error: null };
      }

      const { error: wErr } = await client.from('worlds').insert({
        id: bundle.world.id,
        owner_id: state.user.id,
        name: bundle.world.name,
        description: bundle.world.description,
        mode: bundle.world.mode,
        max_players_per_party: bundle.world.max_players_per_party ?? 5,
        calendar_config: bundle.world.calendar_config ?? DEFAULT_CALENDAR_CONFIG,
      });
      if (wErr) return { worldId: null, error: wErr.message };

      if (bundle.sheetTemplates.length > 0) {
        await client.from('character_sheet_templates').insert(bundle.sheetTemplates);
        if (bundle.world.active_sheet_template_id) {
          await client
            .from('worlds')
            .update({ active_sheet_template_id: bundle.world.active_sheet_template_id })
            .eq('id', bundle.world.id);
        }
      }

      if (bundle.entities.length > 0) {
        const { error: eErr } = await client.from('entities').insert(bundle.entities);
        if (eErr) return { worldId: null, error: eErr.message };
      }
      if (bundle.entityLinks.length > 0) {
        await client.from('entity_links').upsert(bundle.entityLinks);
      }

      if (bundle.maps.length > 0) {
        let { error: mErr } = await client
          .from('maps')
          .insert(bundle.maps.map((m) => serializeMapRow(m, false)));
        if (mErr && /column|schema cache/i.test(mErr.message)) {
          const retry = await client
            .from('maps')
            .insert(bundle.maps.map((m) => serializeMapRow(m, true)));
          mErr = retry.error;
        }
        if (mErr) return { worldId: null, error: mErr.message };
      }

      if (bundle.mapPins.length > 0) {
        await client.from('map_pins').insert(bundle.mapPins);
      }
      if (bundle.mapPaths.length > 0) {
        await client.from('map_paths').insert(bundle.mapPaths);
      }
      if (bundle.assets.length > 0) {
        await client.from('vault_assets').insert(bundle.assets);
      }
      if (bundle.entityTemplates.length > 0) {
        await client
          .from('entity_templates')
          .upsert(bundle.entityTemplates.map((tpl) => serializeTemplateRow(bundle.world.id, tpl)));
      }
      if (bundle.characters.length > 0) {
        await client.from('characters').insert(bundle.characters);
      }
      if (bundle.mapQuestBoards.length > 0) {
        await client.from('map_quest_boards').insert(bundle.mapQuestBoards);
      }
      if (bundle.guildQuests.length > 0) {
        await client.from('guild_quests').insert(bundle.guildQuests);
      }
      if (bundle.timelineEvents.length > 0) {
        await client.from('timeline_events').insert(bundle.timelineEvents);
      }

      set({ activeCampaignId: bundle.world.id, gmMode: true });
      storeActiveCampaignId(bundle.world.id);
      await get().loadMyCampaigns();
      return { worldId: bundle.world.id, error: null };
    } catch (err) {
      return {
        worldId: null,
        error: err instanceof Error ? err.message : 'Failed to import campaign JSON.',
      };
    }
  },

  joinCampaignByInvite: async (inviteCode) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client) {
      return { worldId: null, error: 'Joining remote campaigns by invite requires a Supabase connection in Settings.' };
    }
    if (!state.user) {
      return { worldId: null, error: 'You must be signed in to join a campaign.' };
    }
    const clean = inviteCode.trim();
    if (!clean) return { worldId: null, error: 'Enter a valid invite code.' };

    const { data, error } = await client.rpc('join_campaign_by_invite', {
      p_invite_code: clean,
    });
    if (error || !data) {
      return { worldId: null, error: error?.message || 'Invalid or expired invite code.' };
    }

    const joinedWorldId = String(data);
    storeActiveCampaignId(joinedWorldId);
    set({ activeCampaignId: joinedWorldId, pendingInviteCode: null });
    await get().loadMyCampaigns();
    return { worldId: joinedWorldId, error: null };
  },

  updateCampaignSettings: async (patch) => {
    const client = getSupabaseClient();
    const state = get();
    if (!state.activeCampaignId) return { error: 'No active campaign.' };
    if (state.myRole !== 'gm' && state.myRole !== 'co_gm') {
      return { error: 'Only a GM or Co-GM can update campaign settings.' };
    }

    if (!client) {
      const updated: World = {
        ...state.world,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      set((s) => ({
        world: updated,
        campaigns: s.campaigns.map((c) => (c.id === updated.id ? updated : c)),
      }));
      return { error: null };
    }

    const { data, error } = await client
      .from('worlds')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', state.activeCampaignId)
      .select('*')
      .single();

    if (error) return { error: error.message };
    const updated = data as World;
    set((s) => ({
      world: updated,
      campaigns: s.campaigns.map((c) => (c.id === updated.id ? updated : c)),
    }));
    return { error: null };
  },

  regenerateInviteCode: async () => {
    const client = getSupabaseClient();
    const state = get();
    if (!state.activeCampaignId) return null;
    if (state.myRole !== 'gm' && state.myRole !== 'co_gm') return null;
    const newCode = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    if (!client) {
      const updated: World = { ...state.world, invite_code: newCode, updated_at: new Date().toISOString() };
      set((s) => ({
        world: updated,
        campaigns: s.campaigns.map((c) => (c.id === updated.id ? updated : c)),
      }));
      return newCode;
    }
    const { data, error } = await client
      .from('worlds')
      .update({ invite_code: newCode, updated_at: new Date().toISOString() })
      .eq('id', state.activeCampaignId)
      .select('*')
      .single();
    if (error || !data) return null;
    const updated = data as World;
    set((s) => ({
      world: updated,
      campaigns: s.campaigns.map((c) => (c.id === updated.id ? updated : c)),
    }));
    return updated.invite_code || newCode;
  },

  updateMemberRole: async (userId, role) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.activeCampaignId) return { error: 'No active campaign.' };
    if (state.world.owner_id && state.world.owner_id === userId) {
      return { error: 'Campaign owner role cannot be modified here.' };
    }

    const { error } = await client
      .from('campaign_members')
      .update({ role })
      .eq('campaign_id', state.activeCampaignId)
      .eq('user_id', userId);

    if (error) return { error: error.message };
    set((s) => ({
      campaignMembers: s.campaignMembers.map((m) =>
        m.user_id === userId ? { ...m, role } : m
      ),
    }));
    return { error: null };
  },

  removeCampaignMember: async (userId) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.activeCampaignId) return { error: 'No active campaign.' };
    if (state.world.owner_id && state.world.owner_id === userId) {
      return { error: 'Cannot remove the campaign owner.' };
    }

    const { error } = await client
      .from('campaign_members')
      .delete()
      .eq('campaign_id', state.activeCampaignId)
      .eq('user_id', userId);

    if (error) return { error: error.message };
    set((s) => ({
      campaignMembers: s.campaignMembers.filter((m) => m.user_id !== userId),
    }));
    return { error: null };
  },

  leaveCampaign: async (campaignId) => {
    const client = getSupabaseClient();
    const state = get();
    if (!state.user) return;
    if (!client) {
      const storage = loadLocalVaultStorage();
      const remaining = { ...storage.campaigns };
      delete remaining[campaignId];
      const nextId = Object.keys(remaining)[0] || null;
      saveLocalVaultStorage({ ...storage, activeCampaignId: nextId, campaigns: remaining });
      if (nextId) {
        set({
          campaigns: Object.values(remaining).map((b) => b.world),
        });
        await get().switchCampaign(nextId);
      } else {
        set({
          campaigns: [],
          activeCampaignId: null,
          world: EMPTY_WORLD,
          entities: [],
          maps: [],
        });
      }
      return;
    }
    await client
      .from('campaign_members')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('user_id', state.user.id);
    if (state.activeCampaignId === campaignId) {
      set({ activeCampaignId: null });
      storeActiveCampaignId(null);
    }
    await get().loadMyCampaigns();
  },

  seedSupabaseWorld: async () => {
    const client = getSupabaseClient();
    const state = get();
    if (!client) {
      get().resetLocalVault();
      return;
    }
    if (!state.user) return;
    const res = await seedStarterCampaign(client, state.user.id, {
      mode: 'west_marches',
    });
    if (!res.error) {
      set({ activeCampaignId: res.worldId });
      storeActiveCampaignId(res.worldId);
      await get().loadMyCampaigns();
    } else {
      set({ syncStatus: 'error', lastSyncError: res.error });
    }
  },

  syncFromSupabase: async () => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.isAuthenticated || !state.user) return;

    const cid = state.activeCampaignId;
    if (!cid) {
      await get().loadMyCampaigns();
      return;
    }

    set({ syncStatus: 'syncing', lastSyncError: null });
    try {
      const { data: worldData, error: wErr } = await client
        .from('worlds')
        .select('*')
        .eq('id', cid)
        .maybeSingle();

      if (wErr) throw wErr;
      if (!worldData) {
        // Campaign was deleted or user lost access
        set({ activeCampaignId: null });
        storeActiveCampaignId(null);
        await get().loadMyCampaigns();
        return;
      }

      const activeWorld = worldData as World;

      const [
        memRes,
        entRes,
        linkRes,
        mapRes,
        assetRes,
        tplRes,
        sheetTplRes,
        charRes,
        boardRes,
        questRes,
        signupRes,
        journalRes,
        fogStateRes,
        fogShareRes,
        diceRes,
        timelineRes,
      ] = await Promise.all([
        client.from('campaign_members').select('*').eq('campaign_id', cid),
        client.from('entities').select('*').eq('world_id', cid),
        client.from('entity_links').select('*').eq('world_id', cid),
        client.from('maps').select('*').eq('world_id', cid),
        client.from('vault_assets').select('*').eq('world_id', cid),
        client.from('entity_templates').select('*').eq('world_id', cid),
        client.from('character_sheet_templates').select('*').eq('campaign_id', cid),
        client.from('characters').select('*').eq('campaign_id', cid),
        client.from('map_quest_boards').select('*').eq('campaign_id', cid),
        client.from('guild_quests').select('*').eq('campaign_id', cid),
        client.from('guild_quest_signups').select('*').eq('campaign_id', cid),
        client.from('journal_pages').select('*').eq('campaign_id', cid),
        client.from('map_fog_states').select('*').eq('campaign_id', cid),
        client.from('map_fog_shares').select('*').eq('campaign_id', cid),
        client
          .from('dice_rolls')
          .select('*')
          .eq('campaign_id', cid)
          .order('created_at', { ascending: false })
          .limit(60),
        client
          .from('timeline_events')
          .select('*')
          .eq('campaign_id', cid)
          .order('sort_order', { ascending: true }),
      ]);

      if (entRes.error) throw entRes.error;
      if (mapRes.error) throw mapRes.error;

      const rawMembers = (memRes.data || []) as CampaignMember[];
      const memberIds = rawMembers.map((m) => m.user_id);
      let profilesById = new Map<string, PlayerProfile>();
      if (memberIds.length > 0) {
        const { data: profRows } = await client
          .from('profiles')
          .select('*')
          .in('id', memberIds);
        profilesById = new Map(
          ((profRows || []) as PlayerProfile[]).map((p) => [p.id, p])
        );
      }

      const campaignMembers: CampaignMember[] = rawMembers.map((m) => ({
        ...m,
        profile: profilesById.get(m.user_id),
      }));

      const myMember = campaignMembers.find((m) => m.user_id === state.user!.id);
      const myRole: CampaignRole =
        myMember?.role ||
        (activeWorld.owner_id === state.user.id ? 'gm' : 'player');

      const loadedMaps = ((mapRes.data || []) as VaultMap[]).map((m) => normalizeMapOverlay(m));
      const mapIds = loadedMaps.map((m) => m.id);

      let loadedPins: MapPin[] = [];
      let loadedPaths: MapPath[] = [];
      if (mapIds.length > 0) {
        const [pinRes, pathRes] = await Promise.all([
          client.from('map_pins').select('*').in('map_id', mapIds),
          client.from('map_paths').select('*').in('map_id', mapIds),
        ]);
        loadedPins = (pinRes.data || []) as MapPin[];
        loadedPaths = (pathRes.data || []) as MapPath[];
      }

      const loadedJournals = (journalRes.data || []) as JournalPage[];
      const journalIds = loadedJournals.map((j) => j.id);
      let loadedJournalShares: JournalPageShare[] = [];
      if (journalIds.length > 0) {
        const { data: shareRows } = await client
          .from('journal_page_shares')
          .select('*')
          .in('page_id', journalIds);
        loadedJournalShares = (shareRows || []) as JournalPageShare[];
      }

      const loadedEntities = (entRes.data || []) as Entity[];
      const loadedLinks = (linkRes.data || []) as EntityLink[];
      const loadedAssets = (assetRes.data || []) as VaultAsset[];
      const loadedSheetTemplates = (sheetTplRes.data || []) as CharacterSheetTemplate[];
      const loadedCharacters = (charRes.data || []) as CharacterRecord[];
      const loadedBoards = (boardRes.data || []) as MapQuestBoard[];
      const loadedQuests = (questRes.data || []) as GuildQuest[];
      const loadedSignups = (signupRes.data || []) as GuildQuestSignup[];
      const loadedFogStates = (fogStateRes.data || []) as MapFogState[];
      const loadedFogShares = (fogShareRes.data || []) as MapFogShare[];
      const loadedDiceRolls = (diceRes.data || []) as DiceRollRecord[];
      const loadedTimeline = (timelineRes.data || []) as TimelineEvent[];

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
      const mergedEntities = loadedEntities.map((e) =>
        syncRuntime.entitySyncTimers.has(e.id)
          ? prevState.entities.find((pe) => pe.id === e.id) || e
          : e
      );
      const mergedMaps = loadedMaps.map((m) =>
        syncRuntime.mapSyncTimers.has(m.id)
          ? prevState.maps.find((pm) => pm.id === m.id) || m
          : m
      );
      const mergedCharacters = loadedCharacters.map((c) =>
        syncRuntime.characterSyncTimers.has(c.id)
          ? prevState.characters.find((pc) => pc.id === c.id) || c
          : c
      );
      const mergedJournals = loadedJournals.map((j) =>
        syncRuntime.journalSyncTimers.has(j.id)
          ? prevState.journalPages.find((pj) => pj.id === j.id) || j
          : j
      );
      // Keep valid Studio tabs or open sensible initial Studio tab
      const validTabs: TabItem[] = [];
      for (const tab of prevState.tabs) {
        if (tab.kind === 'entity') {
          const hit = loadedEntities.find((e) => e.id === tab.targetId);
          if (hit) validTabs.push({ ...tab, title: hit.title });
        } else if (tab.kind === 'map') {
          const hit = loadedMaps.find((m) => m.id === tab.targetId);
          if (hit) validTabs.push({ ...tab, title: hit.name });
        } else if (tab.kind === 'asset') {
          const hit = loadedAssets.find((a) => a.id === tab.targetId);
          if (hit) validTabs.push({ ...tab, title: hit.name });
        } else if (
          tab.kind === 'template' ||
          tab.kind === 'sheet_studio' ||
          tab.kind === 'timeline' ||
          tab.kind === 'profile_hub'
        ) {
          validTabs.push(tab);
        }
      }

      if (validTabs.length === 0) {
        if (loadedMaps[0]) {
          validTabs.push({
            id: `tab-map-${loadedMaps[0].id}`,
            kind: 'map',
            targetId: loadedMaps[0].id,
            title: loadedMaps[0].name,
            iconType: 'Map',
          });
        } else if (loadedEntities[0]) {
          validTabs.push({
            id: `tab-${loadedEntities[0].id}`,
            kind: 'entity',
            targetId: loadedEntities[0].id,
            title: loadedEntities[0].title,
            iconType: loadedEntities[0].type,
          });
        } else {
          validTabs.push({
            id: 'tab-profile-hub',
            kind: 'profile_hub',
            targetId: 'profile_hub',
            title: 'Profile & Campaigns',
            iconType: 'Campaign',
          });
        }
      }

      const nextActiveTabId = validTabs.some((t) => t.id === prevState.activeTabId)
        ? prevState.activeTabId
        : validTabs[0]?.id || '';

      const effectiveGmMode =
        myRole === 'gm' || myRole === 'co_gm' ? prevState.gmMode : false;

      const resolvedAppMode = resolveEffectiveAppMode(prevState.appMode, myRole);
      if (resolvedAppMode !== prevState.appMode) {
        storeAppMode(resolvedAppMode);
        setUrlAppMode(resolvedAppMode, true);
      }

      const nextPlayMapId =
        prevState.playActiveMapId && mergedMaps.some((m) => m.id === prevState.playActiveMapId)
          ? prevState.playActiveMapId
          : mergedMaps.find((m) => m.kind === '2d')?.id || mergedMaps[0]?.id || null;

      set((s) => ({
        world: activeWorld,
        campaigns: s.campaigns.some((c) => c.id === activeWorld.id)
          ? s.campaigns.map((c) => (c.id === activeWorld.id ? activeWorld : c))
          : [...s.campaigns, activeWorld],
        campaignMembers,
        myRole,
        gmMode: effectiveGmMode,
        appMode: resolvedAppMode,
        playActiveMapId: nextPlayMapId,
        entities: mergedEntities,
        entityLinks: loadedLinks,
        maps: mergedMaps,
        mapPins: loadedPins,
        mapPaths: loadedPaths,
        assets: loadedAssets,
        templates: mergedTemplates,
        sheetTemplates: loadedSheetTemplates,
        characters: mergedCharacters,
        questBoards: loadedBoards,
        guildQuests: loadedQuests,
        guildQuestSignups: loadedSignups,
        journalPages: mergedJournals,
        journalPageShares: loadedJournalShares,
        mapFogStates: loadedFogStates,
        mapFogShares: loadedFogShares,
        diceRolls: loadedDiceRolls,
        timelineEvents: loadedTimeline,
        tabs: validTabs,
        activeTabId: nextActiveTabId,
        syncStatus: 'synced',
      }));
    } catch (err) {
      set({
        syncStatus: 'error',
        lastSyncError: err instanceof Error ? err.message : 'Failed to sync with Supabase',
      });
    }
  },
});
