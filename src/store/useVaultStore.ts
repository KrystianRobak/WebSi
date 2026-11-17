import { create } from 'zustand';
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
