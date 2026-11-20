import { getSupabaseClient } from '../../lib/supabase';
import type { CharacterRecord, CharacterSheetTemplate } from '../../types/vault';
import { broadcastVaultChange, syncRuntime, type VaultSlice, type VaultState } from './types';

export type CharacterSlice = Pick<
  VaultState,
  | 'sheetTemplates'
  | 'characters'
  | 'createSheetTemplate'
  | 'updateSheetTemplate'
  | 'deleteSheetTemplate'
  | 'setActiveCampaignSheetTemplate'
  | 'createCharacter'
  | 'updateCharacter'
  | 'setActiveCharacter'
  | 'deleteCharacter'
>;

export const createCharacterSlice: VaultSlice<CharacterSlice> = (set, get) => ({
  sheetTemplates: [],
  characters: [],

  createSheetTemplate: async (payload) => {
    const client = getSupabaseClient();
    const state = get();
    if (!state.user || !state.activeCampaignId) return null;
    if (!state.isEffectiveGm()) return null;

    const row: CharacterSheetTemplate = {
      id: crypto.randomUUID(),
      campaign_id: state.activeCampaignId,
      name: payload.name.trim() || 'Custom Sheet',
      system_label: payload.system_label.trim() || 'Custom',
      html_template: payload.html_template,
      css_template: payload.css_template,
      schema_json: payload.schema_json || { defaults: {}, computed: {} },
      updated_by: state.user.id,
      updated_at: new Date().toISOString(),
    };

    set((s) => ({ sheetTemplates: [...s.sheetTemplates, row] }));
    if (client) {
      const { error } = await client.from('character_sheet_templates').insert(row);
      if (error) {
        set({ syncStatus: 'error', lastSyncError: error.message });
        return null;
      }
      broadcastVaultChange('character_sheet_templates');
    }
    return row;
  },

  updateSheetTemplate: async (id, patch) => {
    const client = getSupabaseClient();
    const state = get();
    if (!state.user || !state.isEffectiveGm()) return;
    const updatedAt = new Date().toISOString();

    set((s) => ({
      sheetTemplates: s.sheetTemplates.map((t) =>
        t.id === id ? { ...t, ...patch, updated_by: s.user?.id, updated_at: updatedAt } : t
      ),
    }));

    if (client) {
      const { error } = await client
        .from('character_sheet_templates')
        .update({ ...patch, updated_by: state.user.id, updated_at: updatedAt })
        .eq('id', id);

      if (error) {
        set({ syncStatus: 'error', lastSyncError: error.message });
      } else {
        broadcastVaultChange('character_sheet_templates');
      }
    }
  },

  deleteSheetTemplate: async (id) => {
    const client = getSupabaseClient();
    const state = get();
    if (!state.isEffectiveGm()) return;
    set((s) => ({
      sheetTemplates: s.sheetTemplates.filter((t) => t.id !== id),
    }));
    if (client) {
      await client.from('character_sheet_templates').delete().eq('id', id);
      broadcastVaultChange('character_sheet_templates');
    }
  },

  setActiveCampaignSheetTemplate: async (templateId) => {
    await get().updateCampaignSettings({ active_sheet_template_id: templateId });
  },

  createCharacter: async (payload) => {
    const client = getSupabaseClient();
    const state = get();
    if (!state.user || !state.activeCampaignId) {
      return { character: null, error: 'You must be in an active campaign to create a character.' };
    }

    const activeTplId =
      payload.sheet_template_id ??
      state.world.active_sheet_template_id ??
      state.sheetTemplates[0]?.id ??
      null;
    const tpl = state.sheetTemplates.find((t) => t.id === activeTplId);
    const defaultAttrs = tpl?.schema_json?.defaults ? { ...tpl.schema_json.defaults } : {};
    const mergedAttrs = {
      ...defaultAttrs,
      char_name: payload.name.trim(),
      ...(payload.attributes || {}),
    };

    const existingActiveForMe = state.characters.filter(
      (c) => c.user_id === state.user!.id && c.is_active
    );
    const wantActive =
      payload.is_active !== undefined
        ? payload.is_active
        : state.world.mode === 'west_marches'
        ? existingActiveForMe.length === 0
        : true;

    if (state.world.mode === 'west_marches' && wantActive && existingActiveForMe.length > 0) {
      return {
        character: null,
        error:
          'West Marches campaigns allow only 1 active character per player. Retiring/deactivating your current character or creating as inactive/archived is required.',
      };
    }

    const row: CharacterRecord = {
      id: crypto.randomUUID(),
      campaign_id: state.activeCampaignId,
      user_id: state.user.id,
      name: payload.name.trim() || 'Unnamed Adventurer',
      portrait_url: payload.portrait_url ?? null,
      entity_id: payload.entity_id ?? null,
      sheet_template_id: activeTplId,
      attributes: mergedAttrs,
      is_active: wantActive,
      updated_at: new Date().toISOString(),
    };

    if (!client) {
      set((s) => ({ characters: [...s.characters, row] }));
      return { character: row, error: null };
    }

    const { data, error } = await client
      .from('characters')
      .insert(row)
      .select('*')
      .single();

    if (error || !data) {
      return { character: null, error: error?.message || 'Failed to create character.' };
    }

    const created = data as CharacterRecord;
    set((s) => ({ characters: [...s.characters, created] }));
    broadcastVaultChange('characters');
    return { character: created, error: null };
  },

  updateCharacter: async (id, patch) => {
    const client = getSupabaseClient();
    const state = get();
    if (!state.user) return { error: 'Not authenticated.' };

    const target = state.characters.find((c) => c.id === id);
    if (!target) return { error: 'Character not found.' };
    if (target.user_id !== state.user.id && !state.isEffectiveGm()) {
      return { error: 'Only the character owner or GM can edit this sheet.' };
    }

    const updatedAt = new Date().toISOString();
    set((s) => ({
      characters: s.characters.map((c) =>
        c.id === id ? { ...c, ...patch, updated_at: updatedAt } : c
      ),
      tabs: patch.name
        ? s.tabs.map((t) =>
            t.kind === 'character' && t.targetId === id ? { ...t, title: patch.name! } : t
          )
        : s.tabs,
    }));

    if (!client) return { error: null };

    // Debounce frequent sheet attribute typing updates
    const isAttrOnly =
      Object.keys(patch).length === 1 && patch.attributes !== undefined;
    if (isAttrOnly) {
      const existingTimer = syncRuntime.characterSyncTimers.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      set({ syncStatus: 'syncing' });
      const timer = setTimeout(async () => {
        syncRuntime.characterSyncTimers.delete(id);
        const latest = get().characters.find((c) => c.id === id);
        if (!latest) return;
        const { error } = await client
          .from('characters')
          .update({ attributes: latest.attributes, updated_at: latest.updated_at })
          .eq('id', id);
        if (!error) broadcastVaultChange('characters');
        set({
          syncStatus: error ? 'error' : 'synced',
          lastSyncError: error ? error.message : null,
        });
      }, 450);
      syncRuntime.characterSyncTimers.set(id, timer);
      return { error: null };
    }

    const { error } = await client
      .from('characters')
      .update({ ...patch, updated_at: updatedAt })
      .eq('id', id);

    if (error) {
      set({ syncStatus: 'error', lastSyncError: error.message });
      return { error: error.message };
    }
    broadcastVaultChange('characters');
    return { error: null };
  },

  setActiveCharacter: async (characterId) => {
    const client = getSupabaseClient();
    const state = get();
    if (!state.user) return { error: 'Not authenticated.' };
    const target = state.characters.find((c) => c.id === characterId);
    if (!target) return { error: 'Character not found.' };

    // In West Marches mode, deactivate any existing active character owned by this user first
    if (state.world.mode === 'west_marches') {
      const others = state.characters.filter(
        (c) => c.user_id === target.user_id && c.is_active && c.id !== characterId
      );
      if (client) {
        for (const other of others) {
          const { error: deactErr } = await client
            .from('characters')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', other.id);
          if (deactErr) return { error: deactErr.message };
        }
      }
      set((s) => ({
        characters: s.characters.map((c) =>
          c.user_id === target.user_id && c.id !== characterId
            ? { ...c, is_active: false }
            : c
        ),
      }));
    }

    return get().updateCharacter(characterId, { is_active: true });
  },

  deleteCharacter: async (id) => {
    const client = getSupabaseClient();
    const state = get();
    if (!state.user) return;
    const target = state.characters.find((c) => c.id === id);
    if (!target) return;
    if (target.user_id !== state.user.id && !state.isEffectiveGm()) return;

    set((s) => ({
      characters: s.characters.filter((c) => c.id !== id),
      tabs: s.tabs.filter((t) => !(t.kind === 'character' && t.targetId === id)),
    }));
    if (client) {
      await client.from('characters').delete().eq('id', id);
      broadcastVaultChange('characters');
    }
  },
});
