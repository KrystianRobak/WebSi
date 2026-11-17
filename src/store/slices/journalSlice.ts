import { getSupabaseClient } from '../../lib/supabase';
import type { JournalPage, JournalPageShare } from '../../types/vault';
import { broadcastVaultChange, syncRuntime, type VaultSlice, type VaultState } from './types';

export type JournalSlice = Pick<
  VaultState,
  | 'journalPages'
  | 'journalPageShares'
  | 'createJournalPage'
  | 'updateJournalPage'
  | 'deleteJournalPage'
  | 'updateJournalSharing'
>;

export const createJournalSlice: VaultSlice<JournalSlice> = (set, get) => ({
  journalPages: [],
  journalPageShares: [],

  createJournalPage: async ({ title, content = '', tags = [] }) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.user || !state.activeCampaignId) return null;

    const newPage: JournalPage = {
      id: crypto.randomUUID(),
      campaign_id: state.activeCampaignId,
      owner_id: state.user.id,
      title: title.trim() || 'Untitled Journal Page',
      content: content || `# ${title.trim() || 'Untitled Journal Page'}\n\nWrite expedition logs and notes here.`,
      tags,
      share_scope: 'private',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('journal_pages')
      .insert(newPage)
      .select('*')
      .single();

    if (error || !data) {
      set({ syncStatus: 'error', lastSyncError: error?.message || 'Failed to create journal page.' });
      return null;
    }

    const created = data as JournalPage;
    set((s) => ({ journalPages: [created, ...s.journalPages] }));
    broadcastVaultChange('journal_pages');
    return created;
  },

  updateJournalPage: async (pageId, patch) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.user) return;
    const target = state.journalPages.find((p) => p.id === pageId);
    if (!target) return;

    const isOwner = target.owner_id === state.user.id;
    const hasEditShare = state.journalPageShares.some(
      (sh) => sh.page_id === pageId && sh.shared_with_user_id === state.user!.id && sh.can_edit
    );
    if (!isOwner && !hasEditShare) return;

    // Only owner may modify share_scope
    const safePatch = isOwner ? patch : { title: patch.title, content: patch.content, tags: patch.tags };
    const updatedAt = new Date().toISOString();

    set((s) => ({
      journalPages: s.journalPages.map((p) =>
        p.id === pageId ? { ...p, ...safePatch, updated_at: updatedAt } : p
      ),
      tabs: safePatch.title
        ? s.tabs.map((t) =>
            t.kind === 'journal' && t.targetId === pageId ? { ...t, title: safePatch.title! } : t
          )
        : s.tabs,
    }));

    const existingTimer = syncRuntime.journalSyncTimers.get(pageId);
    if (existingTimer) clearTimeout(existingTimer);
    set({ syncStatus: 'syncing' });
    const timer = setTimeout(async () => {
      syncRuntime.journalSyncTimers.delete(pageId);
      const latest = get().journalPages.find((p) => p.id === pageId);
      if (!latest) return;
      const updateBody = isOwner
        ? {
            title: latest.title,
            content: latest.content,
            tags: latest.tags,
            share_scope: latest.share_scope,
            updated_at: latest.updated_at,
          }
        : {
            title: latest.title,
            content: latest.content,
            tags: latest.tags,
            updated_at: latest.updated_at,
          };
      const { error } = await client.from('journal_pages').update(updateBody).eq('id', pageId);
      if (!error) broadcastVaultChange('journal_pages');
      set({
        syncStatus: error ? 'error' : 'synced',
        lastSyncError: error ? error.message : null,
      });
    }, 450);
    syncRuntime.journalSyncTimers.set(pageId, timer);
  },

  deleteJournalPage: async (pageId) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.user) return;
    const target = state.journalPages.find((p) => p.id === pageId);
    if (!target || target.owner_id !== state.user.id) return;

    set((s) => ({
      journalPages: s.journalPages.filter((p) => p.id !== pageId),
      journalPageShares: s.journalPageShares.filter((sh) => sh.page_id !== pageId),
      tabs: s.tabs.filter((t) => !(t.kind === 'journal' && t.targetId === pageId)),
    }));
    await client.from('journal_pages').delete().eq('id', pageId);
    broadcastVaultChange('journal_pages');
  },

  updateJournalSharing: async (pageId, scope, shares) => {
    const client = getSupabaseClient();
    const state = get();
    if (!client || !state.user) return { error: 'Not authenticated.' };
    const target = state.journalPages.find((p) => p.id === pageId);
    if (!target || target.owner_id !== state.user.id) {
      return { error: 'Only the journal owner can change sharing settings.' };
    }

    const { error: scopeErr } = await client
      .from('journal_pages')
      .update({ share_scope: scope, updated_at: new Date().toISOString() })
      .eq('id', pageId);
    if (scopeErr) return { error: scopeErr.message };

    await client.from('journal_page_shares').delete().eq('page_id', pageId);
    const shareRows: JournalPageShare[] =
      scope === 'selected'
        ? shares
            .filter((sh) => sh.shared_with_user_id !== state.user!.id)
            .map((sh) => ({
              page_id: pageId,
              shared_with_user_id: sh.shared_with_user_id,
              can_edit: sh.can_edit,
            }))
        : [];

    if (shareRows.length > 0) {
      const { error: shErr } = await client.from('journal_page_shares').insert(shareRows);
      if (shErr) return { error: shErr.message };
    }

    set((s) => ({
      journalPages: s.journalPages.map((p) =>
        p.id === pageId ? { ...p, share_scope: scope } : p
      ),
      journalPageShares: [
        ...s.journalPageShares.filter((sh) => sh.page_id !== pageId),
        ...shareRows,
      ],
    }));

    broadcastVaultChange('journal_pages');
    return { error: null };
  },
});
