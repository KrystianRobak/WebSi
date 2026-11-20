import { create } from 'zustand';
import {
  createDefaultLocalProfile,
  loadLocalVaultStorage,
  saveLocalVaultStorage,
} from '../lib/localVault';
import { isSupabaseConfigured } from '../lib/supabase';
import { createAuthSlice } from './slices/authSlice';
import { createCampaignSlice } from './slices/campaignSlice';
import { createCharacterSlice } from './slices/characterSlice';
import { createJournalSlice } from './slices/journalSlice';
import type { SyncStatus, VaultState } from './slices/types';
import { createUiSlice } from './slices/uiSlice';
import { createVttSlice } from './slices/vttSlice';
import { createWorldLoreSlice } from './slices/worldLoreSlice';

export type { SyncStatus, VaultState };

export const useVaultStore = create<VaultState>()((...a) => ({
  ...createAuthSlice(...a),
  ...createCampaignSlice(...a),
  ...createWorldLoreSlice(...a),
  ...createCharacterSlice(...a),
  ...createJournalSlice(...a),
  ...createVttSlice(...a),
  ...createUiSlice(...a),
}));

if (typeof window !== 'undefined') {
  let localSaveTimer: ReturnType<typeof setTimeout> | null = null;
  useVaultStore.subscribe((state) => {
    if (isSupabaseConfigured()) return;
    if (!state.isAuthenticated || state.syncStatus !== 'local' || !state.activeCampaignId) return;
    if (!state.world.id || state.world.id !== state.activeCampaignId) return;

    if (localSaveTimer) clearTimeout(localSaveTimer);
    localSaveTimer = setTimeout(() => {
      const s = useVaultStore.getState();
      if (isSupabaseConfigured() || !s.isAuthenticated || s.syncStatus !== 'local') return;
      if (!s.activeCampaignId || !s.world.id) return;

      const current = loadLocalVaultStorage();
      saveLocalVaultStorage({
        version: 1,
        profile: s.profile || current.profile || createDefaultLocalProfile(),
        activeCampaignId: s.activeCampaignId,
        campaigns: {
          ...current.campaigns,
          [s.activeCampaignId]: {
            world: s.world,
            campaignMembers: s.campaignMembers,
            entities: s.entities,
            entityLinks: s.entityLinks,
            maps: s.maps,
            mapPins: s.mapPins,
            mapPaths: s.mapPaths,
            assets: s.assets,
            templates: s.templates,
            sheetTemplates: s.sheetTemplates,
            characters: s.characters,
            questBoards: s.questBoards,
            guildQuests: s.guildQuests,
            guildQuestSignups: s.guildQuestSignups,
            journalPages: s.journalPages,
            journalPageShares: s.journalPageShares,
            mapFogStates: s.mapFogStates,
            mapFogShares: s.mapFogShares,
            diceRolls: s.diceRolls,
            timelineEvents: s.timelineEvents,
          },
        },
      });
    }, 350);
  });
}
