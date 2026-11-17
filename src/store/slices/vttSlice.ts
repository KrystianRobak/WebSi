import { normalizeCalendarConfig } from '../../data/seedData';
import { createBlankBattlemap, generateBattlemapFloorUrl } from '../../lib/battlemapGenerator';
import { serializeMapRow } from '../../lib/campaignSync';
import { parseAndRollDice } from '../../lib/diceParser';
import { getSupabaseClient } from '../../lib/supabase';
import type {
  BattlemapAoeTemplate,
  BattlemapCombatState,
  BattlemapData,
  BattlemapDoor,
  BattlemapLight,
  BattlemapProp,
  BattlemapToken,
  BattlemapWall,
  DiceRollRecord,
  GuildQuest,
  MapFogShare,
  MapFogState,
  MapQuestBoard,
  TabItem,
  TimelineEvent,
  VaultMap,
} from '../../types/vault';
import { broadcastVaultChange, syncRuntime, type VaultSlice, type VaultState } from './types';

function scheduleVttMapSync(
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
    if (error && /column|schema cache/i.test(error.message)) {
      const retry = await client.from('maps').upsert(serializeMapRow(latestMap, true));
      error = retry.error;
    }
    if (!error) broadcastVaultChange('maps');
    setState({
      syncStatus: error ? 'error' : 'synced',
      lastSyncError: error ? error.message : null,
    });
  }, 550);
  syncRuntime.mapSyncTimers.set(mapId, timer);
}

export type VttSlice = Pick<
  VaultState,
  | 'questBoards'
  | 'guildQuests'
  | 'guildQuestSignups'
  | 'mapFogStates'
  | 'mapFogShares'
  | 'diceRolls'
  | 'diceDrawerOpen'
  | 'timelineEvents'
  | 'battlemapMode'
  | 'battlemapTool'
  | 'selectedTokenId'
  | 'selectedDoorId'
  | 'selectedLightId'
  | 'selectedPropId2D'
  | 'snapToGrid'
  | 'createQuestBoard'
  | 'deleteQuestBoard'
  | 'createGuildQuest'
  | 'updateGuildQuest'
  | 'deleteGuildQuest'
  | 'signupForQuest'
  | 'withdrawFromQuest'
  | 'updateMapFogState'
  | 'upsertMapFogShare'
  | 'revokeMapFogShare'
  | 'setDiceDrawerOpen'
  | 'rollDiceAndPublish'
  | 'createTimelineEvent'
  | 'updateTimelineEvent'
  | 'deleteTimelineEvent'
  | 'stepCampaignCalendar'
  | 'updateCalendarConfig'
  | 'createBattlemap'
  | 'setBattlemapMode'
  | 'setBattlemapTool'
  | 'setSelectedTokenId'
  | 'setSelectedDoorId'
  | 'setSelectedLightId'
  | 'setSelectedPropId2D'
  | 'setSnapToGrid'
  | 'updateBattlemap'
  | 'moveBattlemapToken'
  | 'toggleBattlemapDoor'
  | 'toggleBattlemapDoorLock'
  | 'toggleBattlemapLight'
  | 'addBattlemapToken'
  | 'updateBattlemapToken'
  | 'deleteBattlemapToken'
  | 'addBattlemapWall'
  | 'deleteBattlemapWall'
  | 'addBattlemapDoor'
  | 'deleteBattlemapDoor'
  | 'addBattlemapLight'
  | 'deleteBattlemapLight'
  | 'addBattlemapProp'
  | 'updateBattlemapProp'
  | 'deleteBattlemapProp'
  | 'addAoeTemplate'
  | 'deleteAoeTemplate'
  | 'setBattlemapFogUrl'
  | 'setBattlemapCombatState'
  | 'nextCombatTurn'
  | 'prevCombatTurn'
>;

export const createVttSlice: VaultSlice<VttSlice> = (set, get) => ({
  questBoards: [],
  guildQuests: [],
  guildQuestSignups: [],
  mapFogStates: [],
  mapFogShares: [],
  diceRolls: [],
  diceDrawerOpen: false,
  timelineEvents: [],

  battlemapMode: 'play',
  battlemapTool: 'select',
  selectedTokenId: null,
  selectedDoorId: null,
  selectedLightId: null,
  selectedPropId2D: null,
  snapToGrid: true,

  // --- West Marches Guild Quest Boards ---
  createQuestBoard: async (payload) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.user || !state.activeCampaignId || !state.isEffectiveGm()) return null;

    const board: MapQuestBoard = {
      id: crypto.randomUUID(),
      map_id: payload.map_id,
      campaign_id: state.activeCampaignId,
      title: payload.title.trim() || 'Guild Bounty Board',
      description: payload.description?.trim() || '',
      x: payload.x,
      y: payload.y,
      z: payload.z,
      created_by: state.user.id,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('map_quest_boards')
      .insert(board)
      .select('*')
      .single();

    if (error || !data) {
      set({ syncStatus: 'error', lastSyncError: error?.message || 'Failed to place quest board.' });
      return null;
    }
    const created = data as MapQuestBoard;
    set((s) => ({
      questBoards: [...s.questBoards, created],
      selectedQuestBoardId: created.id,
      activeQuestBoardModalId: created.id,
      mapToolMode: 'select',
    }));
    broadcastVaultChange('map_quest_boards');
    return created;
  },

  deleteQuestBoard: async (boardId) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.isEffectiveGm()) return;
    set((s) => ({
      questBoards: s.questBoards.filter((b) => b.id !== boardId),
      guildQuests: s.guildQuests.filter((q) => q.board_id !== boardId),
      selectedQuestBoardId: s.selectedQuestBoardId === boardId ? null : s.selectedQuestBoardId,
      activeQuestBoardModalId:
        s.activeQuestBoardModalId === boardId ? null : s.activeQuestBoardModalId,
    }));
    await client.from('map_quest_boards').delete().eq('id', boardId);
    broadcastVaultChange('map_quest_boards');
  },

  createGuildQuest: async (payload) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.user || !state.activeCampaignId || !state.isEffectiveGm()) return null;

    const quest: GuildQuest = {
      id: crypto.randomUUID(),
      board_id: payload.board_id,
      campaign_id: state.activeCampaignId,
      title: payload.title.trim() || 'Frontier Expedition',
      summary: payload.summary?.trim() || '',
      danger_tier: payload.danger_tier?.trim() || 'Tier 1',
      reward: payload.reward?.trim() || 'Gold & Glory',
      scheduled_at: payload.scheduled_at ?? null,
      max_players: Math.max(1, Math.round(payload.max_players || 4)),
      status: 'open',
      linked_entity_id: payload.linked_entity_id ?? null,
      created_by: state.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('guild_quests')
      .insert(quest)
      .select('*')
      .single();

    if (error || !data) {
      set({ syncStatus: 'error', lastSyncError: error?.message || 'Failed to create quest.' });
      return null;
    }
    const created = data as GuildQuest;
    set((s) => ({ guildQuests: [...s.guildQuests, created] }));
    broadcastVaultChange('guild_quests');
    return created;
  },

  updateGuildQuest: async (questId, patch) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.isEffectiveGm()) return;
    const updatedAt = new Date().toISOString();
    set((s) => ({
      guildQuests: s.guildQuests.map((q) =>
        q.id === questId ? { ...q, ...patch, updated_at: updatedAt } : q
      ),
    }));
    const { error } = await client
      .from('guild_quests')
      .update({ ...patch, updated_at: updatedAt })
      .eq('id', questId);
    if (error) set({ syncStatus: 'error', lastSyncError: error.message });
    else broadcastVaultChange('guild_quests');
  },

  deleteGuildQuest: async (questId) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.isEffectiveGm()) return;
    set((s) => ({
      guildQuests: s.guildQuests.filter((q) => q.id !== questId),
      guildQuestSignups: s.guildQuestSignups.filter((sg) => sg.quest_id !== questId),
    }));
    await client.from('guild_quests').delete().eq('id', questId);
    broadcastVaultChange('guild_quests');
  },

  signupForQuest: async (questId, characterId, note = '') => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.user) return { error: 'Not authenticated.' };
    const { error } = await client.rpc('signup_for_guild_quest', {
      p_quest_id: questId,
      p_character_id: characterId,
      p_note: note,
    });
    if (error) {
      return { error: error.message };
    }
    await get().syncFromSupabase();
    broadcastVaultChange('guild_quest_signups');
    return { error: null };
  },

  withdrawFromQuest: async (questId) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.user) return { error: 'Not authenticated.' };
    const { error } = await client.rpc('withdraw_from_guild_quest', {
      p_quest_id: questId,
    });
    if (error) return { error: error.message };
    await get().syncFromSupabase();
    broadcastVaultChange('guild_quest_signups');
    return { error: null };
  },

  // --- Per-Player Fog of War & Peer Sharing ---
  updateMapFogState: async (mapId, userId, maskUrl) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.activeCampaignId || !state.isEffectiveGm()) return;

    const now = new Date().toISOString();
    const targetIds =
      userId === '__all__'
        ? Array.from(
            new Set([
              ...state.campaignMembers.map((m) => m.user_id),
              ...(state.user?.id ? [state.user.id] : []),
            ])
          ).filter(Boolean)
        : [userId];

    if (targetIds.length === 0) return;

    const rows: MapFogState[] = targetIds.map((uid) => ({
      map_id: mapId,
      user_id: uid,
      campaign_id: state.activeCampaignId!,
      mask_url: maskUrl,
      updated_at: now,
    }));

    set((s) => {
      const next = [...s.mapFogStates];
      for (const row of rows) {
        const idx = next.findIndex(
          (f) => f.map_id === mapId && f.user_id === row.user_id
        );
        if (idx >= 0) next[idx] = row;
        else next.push(row);
      }
      return { mapFogStates: next };
    });

    const { error } = await client
      .from('map_fog_states')
      .upsert(rows, { onConflict: 'map_id,user_id' });
    if (error) {
      set({ syncStatus: 'error', lastSyncError: error.message });
    } else {
      broadcastVaultChange('map_fog_states');
    }
  },

  upsertMapFogShare: async (mapId, sharedWithUserId, shareAll) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.user || !state.activeCampaignId) return;

    const row: MapFogShare = {
      id: crypto.randomUUID(),
      map_id: mapId,
      campaign_id: state.activeCampaignId,
      owner_user_id: state.user.id,
      shared_with_user_id: shareAll ? null : sharedWithUserId,
      share_all: shareAll,
    };

    const { data, error } = await client
      .from('map_fog_shares')
      .insert(row)
      .select('*')
      .single();

    if (!error && data) {
      const created = data as MapFogShare;
      set((s) => ({ mapFogShares: [...s.mapFogShares, created] }));
      broadcastVaultChange('map_fog_shares');
    } else if (error) {
      set({ syncStatus: 'error', lastSyncError: error.message });
    }
  },

  revokeMapFogShare: async (shareId) => {
    const client = getSupabaseClient();
    if (!client) return;
    set((s) => ({ mapFogShares: s.mapFogShares.filter((sh) => sh.id !== shareId) }));
    await client.from('map_fog_shares').delete().eq('id', shareId);
    broadcastVaultChange('map_fog_shares');
  },

  // --- Dice Roller ---
  setDiceDrawerOpen: (open) => set({ diceDrawerOpen: open }),

  rollDiceAndPublish: async (rawExpression, options = {}) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.user || !state.activeCampaignId) {
      return { result: null, error: 'Sign into an active campaign to roll dice.' };
    }

    const activeChar = options.characterId
      ? state.characters.find((c) => c.id === options.characterId)
      : state.characters.find((c) => c.user_id === state.user!.id && c.is_active);

    const attrs = (activeChar?.attributes || {}) as Record<string, unknown>;

    try {
      const result = parseAndRollDice(rawExpression, attrs);
      const isGmBlind = Boolean(options.isGmBlind && state.isEffectiveGm());
      const rollRecord: DiceRollRecord = {
        id: crypto.randomUUID(),
        campaign_id: state.activeCampaignId,
        user_id: state.user.id,
        character_id: activeChar?.id ?? null,
        label: options.label?.trim() || 'Dice Roll',
        expression: result.resolvedExpression,
        total: result.total,
        breakdown: result.breakdown,
        is_gm_blind: isGmBlind,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await client
        .from('dice_rolls')
        .insert(rollRecord)
        .select('*')
        .single();

      if (error) {
        return { result: null, error: error.message };
      }
      const saved = (data as DiceRollRecord) || rollRecord;
      set((s) => ({
        diceRolls: [saved, ...s.diceRolls.filter((r) => r.id !== saved.id)].slice(0, 60),
      }));
      broadcastVaultChange('dice_rolls');
      return { result, error: null };
    } catch (err) {
      return {
        result: null,
        error: err instanceof Error ? err.message : 'Invalid dice expression.',
      };
    }
  },

  // --- Timeline & Fantasy Calendar ---
  createTimelineEvent: async (payload) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.user || !state.activeCampaignId || !state.isEffectiveGm()) return null;

    const ev: TimelineEvent = {
      id: crypto.randomUUID(),
      campaign_id: state.activeCampaignId,
      title: payload.title.trim() || 'Chronicle Event',
      date_label: payload.date_label.trim(),
      sort_order: payload.sort_order,
      era: payload.era.trim(),
      description: payload.description.trim(),
      linked_entity_id: payload.linked_entity_id ?? null,
      is_gm_only: Boolean(payload.is_gm_only),
      created_by: state.user.id,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('timeline_events')
      .insert(ev)
      .select('*')
      .single();
    if (error || !data) {
      set({ syncStatus: 'error', lastSyncError: error?.message || 'Failed to add event.' });
      return null;
    }
    const created = data as TimelineEvent;
    set((s) => ({
      timelineEvents: [...s.timelineEvents, created].sort(
        (a, b) => a.sort_order - b.sort_order
      ),
    }));
    broadcastVaultChange('timeline_events');
    return created;
  },

  updateTimelineEvent: async (id, patch) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.isEffectiveGm()) return;
    set((s) => ({
      timelineEvents: s.timelineEvents
        .map((ev) => (ev.id === id ? { ...ev, ...patch } : ev))
        .sort((a, b) => a.sort_order - b.sort_order),
    }));
    const { error } = await client.from('timeline_events').update(patch).eq('id', id);
    if (error) set({ syncStatus: 'error', lastSyncError: error.message });
    else broadcastVaultChange('timeline_events');
  },

  deleteTimelineEvent: async (id) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.isEffectiveGm()) return;
    set((s) => ({
      timelineEvents: s.timelineEvents.filter((ev) => ev.id !== id),
    }));
    await client.from('timeline_events').delete().eq('id', id);
    broadcastVaultChange('timeline_events');
  },

  stepCampaignCalendar: async (deltaDays) => {
    const state = get();
    if (!state.isEffectiveGm()) return;
    const cal = normalizeCalendarConfig(state.world.calendar_config);
    const months = cal.months;
    let year = cal.currentYear;
    let monthIdx = Math.max(0, Math.min(months.length - 1, cal.currentMonthIndex));
    let day = cal.currentDay + deltaDays;

    while (day > (months[monthIdx]?.days ?? 30)) {
      day -= months[monthIdx]?.days ?? 30;
      monthIdx++;
      if (monthIdx >= months.length) {
        monthIdx = 0;
        year++;
      }
    }
    while (day < 1) {
      monthIdx--;
      if (monthIdx < 0) {
        monthIdx = months.length - 1;
        year = Math.max(1, year - 1);
      }
      day += months[monthIdx]?.days ?? 30;
    }

    await get().updateCampaignSettings({
      calendar_config: { ...cal, currentYear: year, currentMonthIndex: monthIdx, currentDay: day },
    });
  },

  updateCalendarConfig: async (config) => {
    await get().updateCampaignSettings({ calendar_config: config });
  },

  // --- 2D Battlemap Actions ---
  createBattlemap: ({
    name,
    theme,
    cols = 20,
    rows = 13,
    gridSizePx = 64,
    ambientLight,
    backgroundUrl,
  }) => {
    const state = get();
    const bm = createBlankBattlemap(theme, cols, rows, gridSizePx);
    if (ambientLight !== undefined) bm.ambientLight = ambientLight;
    if (backgroundUrl) bm.backgroundUrl = backgroundUrl;
    else bm.backgroundUrl = generateBattlemapFloorUrl(theme, bm.width, bm.height, gridSizePx);

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
      battlemapMode: 'prep',
      mapGeneratorModalOpen: false,
      mapGeneratorEditMapId: null,
    }));

    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      set({ syncStatus: 'syncing' });
      client
        .from('maps')
        .insert(serializeMapRow(newMap, false))
        .then(async ({ error }) => {
          let finalError = error;
          if (finalError && /column|schema cache/i.test(finalError.message)) {
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

  setBattlemapMode: (mode) =>
    set((s) => {
      if (mode === 'prep' && !s.isEffectiveGm()) return s;
      return {
        battlemapMode: mode,
        battlemapTool:
          mode === 'play' &&
          (s.battlemapTool === 'place-light' ||
            s.battlemapTool === 'place-prop' ||
            s.battlemapTool === 'place-quest-board' ||
            s.battlemapTool === 'draw-wall' ||
            s.battlemapTool === 'draw-door' ||
            s.battlemapTool === 'fog-reveal' ||
            s.battlemapTool === 'fog-hide' ||
            s.battlemapTool === 'erase')
            ? 'select'
            : s.battlemapTool,
      };
    }),
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
    if (!get().isEffectiveGm()) return;
    set((s) => ({
      maps: s.maps.map((m) => {
        if (m.id !== mapId || !m.battlemap) return m;
        return { ...m, battlemap: updater(m.battlemap) };
      }),
    }));
    scheduleVttMapSync(mapId, get, set);
  },

  moveBattlemapToken: async (mapId, tokenId, x, y) => {
    const state = get();
    const map = state.maps.find((m) => m.id === mapId);
    const token = map?.battlemap?.tokens.find((t) => t.id === tokenId);
    if (!token || !state.canEditToken(token)) return;

    if (state.isEffectiveGm()) {
      get().updateBattlemapToken(mapId, tokenId, { x, y });
      return;
    }

    // Player-scoped token move via SECURITY DEFINER Postgres RPC
    set((s) => ({
      maps: s.maps.map((m) =>
        m.id === mapId && m.battlemap
          ? {
              ...m,
              battlemap: {
                ...m.battlemap,
                tokens: m.battlemap.tokens.map((t) => (t.id === tokenId ? { ...t, x, y } : t)),
              },
            }
          : m
      ),
    }));

    const client = getSupabaseClient();
    if (client && state.isAuthenticated) {
      const { error } = await client.rpc('move_my_battlemap_token', {
        p_map_id: mapId,
        p_token_id: tokenId,
        p_x: x,
        p_y: y,
      });
      if (error) {
        set({ syncStatus: 'error', lastSyncError: error.message });
        await get().syncFromSupabase();
      } else {
        broadcastVaultChange('maps');
      }
    }
  },

  toggleBattlemapDoor: (mapId, doorId) => {
    if (!get().isEffectiveGm()) return;
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      doors: bm.doors.map((d) => (d.id === doorId ? { ...d, isOpen: !d.isOpen } : d)),
    }));
  },

  toggleBattlemapDoorLock: (mapId, doorId) => {
    if (!get().isEffectiveGm()) return;
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      doors: bm.doors.map((d) => (d.id === doorId ? { ...d, isLocked: !d.isLocked } : d)),
    }));
  },

  toggleBattlemapLight: (mapId, lightId) => {
    if (!get().isEffectiveGm()) return;
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      lights: bm.lights.map((l) => (l.id === lightId ? { ...l, isOn: !l.isOn } : l)),
    }));
  },

  addBattlemapToken: (mapId, token) => {
    const newTok: BattlemapToken = {
      id: `tok-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...token,
    };
    if (!get().isEffectiveGm()) return newTok;
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      tokens: [...bm.tokens, newTok],
    }));
    set({ selectedTokenId: newTok.id });
    return newTok;
  },

  updateBattlemapToken: (mapId, tokenId, patch) => {
    if (!get().isEffectiveGm()) return;
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      tokens: bm.tokens.map((t) => (t.id === tokenId ? { ...t, ...patch } : t)),
    }));
  },

  deleteBattlemapToken: (mapId, tokenId) => {
    if (!get().isEffectiveGm()) return;
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      tokens: bm.tokens.filter((t) => t.id !== tokenId),
    }));
    if (get().selectedTokenId === tokenId) set({ selectedTokenId: null });
  },

  addBattlemapWall: (mapId, wall) => {
    if (!get().isEffectiveGm()) return;
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      walls: [...bm.walls, { id: `wall-${Date.now()}`, ...wall }],
    }));
  },

  deleteBattlemapWall: (mapId, wallId) => {
    if (!get().isEffectiveGm()) return;
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      walls: bm.walls.filter((w) => w.id !== wallId),
    }));
  },

  addBattlemapDoor: (mapId, door) => {
    if (!get().isEffectiveGm()) return;
    const id = `door-${Date.now()}`;
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      doors: [...bm.doors, { id, ...door }],
    }));
    set({ selectedDoorId: id });
  },

  deleteBattlemapDoor: (mapId, doorId) => {
    if (!get().isEffectiveGm()) return;
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      doors: bm.doors.filter((d) => d.id !== doorId),
    }));
    if (get().selectedDoorId === doorId) set({ selectedDoorId: null });
  },

  addBattlemapLight: (mapId, light) => {
    if (!get().isEffectiveGm()) return;
    const id = `light-${Date.now()}`;
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      lights: [...bm.lights, { id, ...light }],
    }));
    set({ selectedLightId: id });
  },

  deleteBattlemapLight: (mapId, lightId) => {
    if (!get().isEffectiveGm()) return;
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
    if (!get().isEffectiveGm()) return newProp;
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

  updateBattlemapProp: (mapId, propId, patch) => {
    if (!get().isEffectiveGm()) return;
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      props: (bm.props || []).map((p) => (p.id === propId ? { ...p, ...patch } : p)),
    }));
  },

  deleteBattlemapProp: (mapId, propId) => {
    if (!get().isEffectiveGm()) return;
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      props: (bm.props || []).filter((p) => p.id !== propId),
    }));
    if (get().selectedPropId2D === propId) set({ selectedPropId2D: null });
  },

  addAoeTemplate: (mapId, tpl) => {
    if (!get().isEffectiveGm()) return;
    const next: BattlemapAoeTemplate = {
      id: `aoe-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...tpl,
    };
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      aoeTemplates: [...(bm.aoeTemplates || []), next],
    }));
  },

  deleteAoeTemplate: (mapId, aoeId) => {
    if (!get().isEffectiveGm()) return;
    get().updateBattlemap(mapId, (bm) => ({
      ...bm,
      aoeTemplates: (bm.aoeTemplates || []).filter((a) => a.id !== aoeId),
    }));
  },

  setBattlemapFogUrl: (mapId, url) => {
    if (!get().isEffectiveGm()) return;
    set((s) => ({
      maps: s.maps.map((m) =>
        m.id === mapId
          ? {
              ...m,
              fog_of_war_2d: url,
              battlemap: m.battlemap ? { ...m.battlemap, revealedMaskUrl: url } : m.battlemap,
            }
          : m
      ),
    }));
    scheduleVttMapSync(mapId, get, set);
  },

  setBattlemapCombatState: (mapId, combat) => {
    if (!get().isEffectiveGm()) return;
    set((s) => ({
      maps: s.maps.map((m) => (m.id === mapId ? { ...m, combat_state: combat } : m)),
    }));
    scheduleVttMapSync(mapId, get, set);
  },

  nextCombatTurn: (mapId) => {
    if (!get().isEffectiveGm()) return;
    const map = get().maps.find((m) => m.id === mapId);
    const combat = map?.combat_state;
    if (!combat || combat.entries.length === 0) return;
    let nextIdx = combat.activeTurnIndex + 1;
    let nextRound = combat.round;
    if (nextIdx >= combat.entries.length) {
      nextIdx = 0;
      nextRound += 1;
    }
    get().setBattlemapCombatState(mapId, {
      ...combat,
      active: true,
      activeTurnIndex: nextIdx,
      round: nextRound,
    });
  },

  prevCombatTurn: (mapId) => {
    if (!get().isEffectiveGm()) return;
    const map = get().maps.find((m) => m.id === mapId);
    const combat = map?.combat_state;
    if (!combat || combat.entries.length === 0) return;
    let prevIdx = combat.activeTurnIndex - 1;
    let prevRound = combat.round;
    if (prevIdx < 0) {
      prevIdx = combat.entries.length - 1;
      prevRound = Math.max(1, prevRound - 1);
    }
    get().setBattlemapCombatState(mapId, {
      ...combat,
      active: true,
      activeTurnIndex: prevIdx,
      round: prevRound,
    });
  },
});
