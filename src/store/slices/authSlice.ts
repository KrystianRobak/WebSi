import { DEFAULT_TEMPLATES } from '../../data/templates';
import {
  LOCAL_USER_EMAIL,
  LOCAL_USER_ID,
  buildDefaultLocalVaultStorage,
  clearLocalVaultStorage,
  loadLocalVaultStorage,
  saveLocalVaultStorage,
  type LocalVaultStorage,
} from '../../lib/localVault';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import type { PlayerProfile, TabItem } from '../../types/vault';
import { EMPTY_WORLD, syncRuntime, type VaultSlice, type VaultState } from './types';

function hydrateLocalVaultState(
  set: (partial: Partial<VaultState>) => void,
  storage: LocalVaultStorage
) {
  const worlds = Object.values(storage.campaigns).map((b) => b.world);
  const chosenId =
    storage.activeCampaignId && storage.campaigns[storage.activeCampaignId]
      ? storage.activeCampaignId
      : worlds[0]?.id || null;
  const activeBundle = chosenId ? storage.campaigns[chosenId] : null;
  const firstEntity = activeBundle?.entities[0];
  const firstMap = activeBundle?.maps[0];
  const defaultTabs: TabItem[] = activeBundle
    ? [
        ...(firstEntity
          ? [
              {
                id: `tab-${firstEntity.id}`,
                kind: 'entity' as const,
                targetId: firstEntity.id,
                title: firstEntity.title,
                iconType: firstEntity.type,
              },
            ]
          : []),
        ...(firstMap
          ? [
              {
                id: `tab-map-${firstMap.id}`,
                kind: 'map' as const,
                targetId: firstMap.id,
                title: firstMap.name,
                iconType: 'Map' as const,
              },
            ]
          : []),
      ]
    : [];

  if (!activeBundle) {
    defaultTabs.push({
      id: 'tab-profile-hub',
      kind: 'profile_hub',
      targetId: 'profile_hub',
      title: 'Profile & Campaigns',
      iconType: 'Campaign',
    });
  }

  const preferredPlayMap =
    activeBundle?.maps.find((m) => m.kind === '2d')?.id ?? activeBundle?.maps[0]?.id ?? null;

  set({
    isAuthenticated: true,
    authLoading: false,
    authError: null,
    user: { id: LOCAL_USER_ID, email: LOCAL_USER_EMAIL },
    userEmail: LOCAL_USER_EMAIL,
    profile: storage.profile,
    campaigns: worlds,
    activeCampaignId: chosenId,
    world: activeBundle?.world || EMPTY_WORLD,
    campaignMembers: activeBundle?.campaignMembers || [],
    myRole: 'gm',
    gmMode: true,
    entities: activeBundle?.entities || [],
    entityLinks: activeBundle?.entityLinks || [],
    maps: activeBundle?.maps || [],
    mapPins: activeBundle?.mapPins || [],
    mapPaths: activeBundle?.mapPaths || [],
    assets: activeBundle?.assets || [],
    templates: activeBundle?.templates || { ...DEFAULT_TEMPLATES },
    sheetTemplates: activeBundle?.sheetTemplates || [],
    characters: activeBundle?.characters || [],
    questBoards: activeBundle?.questBoards || [],
    guildQuests: activeBundle?.guildQuests || [],
    guildQuestSignups: activeBundle?.guildQuestSignups || [],
    journalPages: activeBundle?.journalPages || [],
    journalPageShares: activeBundle?.journalPageShares || [],
    mapFogStates: activeBundle?.mapFogStates || [],
    mapFogShares: activeBundle?.mapFogShares || [],
    diceRolls: activeBundle?.diceRolls || [],
    timelineEvents: activeBundle?.timelineEvents || [],
    tabs: defaultTabs,
    activeTabId: defaultTabs[0]?.id || '',
    splitPaneTabId: null,
    playActiveMapId: preferredPlayMap,
    playActiveSection: activeBundle ? 'table' : 'hub',
    past: [],
    future: [],
    syncStatus: 'local',
    lastSyncError: null,
  });
}

function readInviteFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    return code && code.trim() ? code.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

export function clearInviteFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('invite')) {
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  } catch {
    // ignore history errors
  }
}

export type AuthSlice = Pick<
  VaultState,
  | 'isAuthenticated'
  | 'authLoading'
  | 'authError'
  | 'user'
  | 'userEmail'
  | 'profile'
  | 'pendingInviteCode'
  | 'initSupabaseSync'
  | 'signInWithPassword'
  | 'signUpWithPassword'
  | 'requestPasswordReset'
  | 'signOutVault'
  | 'enterLocalVault'
  | 'resetLocalVault'
  | 'updateProfile'
  | 'setPendingInviteCode'
>;

export const createAuthSlice: VaultSlice<AuthSlice> = (set, get) => ({
  isAuthenticated: false,
  authLoading: true,
  authError: null,
  user: null,
  userEmail: null,
  profile: null,
  pendingInviteCode: readInviteFromUrl(),

  setPendingInviteCode: (code) => set({ pendingInviteCode: code ? code.trim().toUpperCase() : null }),

  enterLocalVault: () => {
    const storage = loadLocalVaultStorage();
    hydrateLocalVaultState(set, storage);
  },

  resetLocalVault: () => {
    clearLocalVaultStorage();
    const fresh = buildDefaultLocalVaultStorage();
    saveLocalVaultStorage(fresh);
    hydrateLocalVaultState(set, fresh);
  },

  initSupabaseSync: async () => {
    const inviteFromUrl = readInviteFromUrl();
    if (inviteFromUrl) {
      set({ pendingInviteCode: inviteFromUrl });
    }

    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured()) {
      const storage = loadLocalVaultStorage();
      hydrateLocalVaultState(set, storage);
      return;
    }

    set({ syncStatus: 'connecting', authLoading: true, lastSyncError: null });

    if (!syncRuntime.authSubscribed) {
      syncRuntime.authSubscribed = true;
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          set({
            isAuthenticated: false,
            user: null,
            userEmail: null,
            profile: null,
            campaigns: [],
            activeCampaignId: null,
            world: EMPTY_WORLD,
            campaignMembers: [],
            myRole: null,
            syncStatus: 'offline',
            authLoading: false,
          });
          return;
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          if (syncRuntime.authInitInFlight) return;
          const authUser = { id: session.user.id, email: session.user.email || null };
          set({
            isAuthenticated: true,
            user: authUser,
            userEmail: authUser.email,
            authLoading: false,
          });
        }
      });
    }

    syncRuntime.authInitInFlight = true;
    try {
      const { data: sessionData, error: sessionErr } = await client.auth.getSession();
      if (sessionErr || !sessionData.session?.user) {
        set({
          isAuthenticated: false,
          authLoading: false,
          user: null,
          userEmail: null,
          profile: null,
          syncStatus: 'offline',
        });
        return;
      }

      const sessionUser = sessionData.session.user;
      set({
        isAuthenticated: true,
        user: { id: sessionUser.id, email: sessionUser.email || null },
        userEmail: sessionUser.email || null,
        authLoading: true,
      });

      // Load or ensure profile
      const { data: profData } = await client
        .from('profiles')
        .select('*')
        .eq('id', sessionUser.id)
        .maybeSingle();

      if (profData) {
        set({ profile: profData as PlayerProfile });
      } else {
        const fallbackName =
          (sessionUser.user_metadata?.display_name as string | undefined)?.trim() ||
          sessionUser.email?.split('@')[0] ||
          'Adventurer';
        const createdProf: PlayerProfile = {
          id: sessionUser.id,
          display_name: fallbackName,
          avatar_url: null,
          bio: '',
        };
        await client.from('profiles').upsert(createdProf);
        set({ profile: createdProf });
      }

      // Redeem pending invite link if present
      const pendingCode = get().pendingInviteCode || readInviteFromUrl();
      if (pendingCode) {
        const res = await get().joinCampaignByInvite(pendingCode);
        if (res.worldId) {
          set({ pendingInviteCode: null, activeCampaignId: res.worldId });
          clearInviteFromUrl();
        }
      }

      await get().loadMyCampaigns();
      set({ authLoading: false });
    } finally {
      syncRuntime.authInitInFlight = false;
    }
  },

  signInWithPassword: async (email, password) => {
    const client = getSupabaseClient();
    if (!client) {
      return { error: 'Supabase is not configured. Check your environment settings.' };
    }
    set({ authError: null });
    syncRuntime.authInitInFlight = true;
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.user) {
        const msg = error?.message || 'Unable to sign in.';
        set({ authError: msg });
        return { error: msg };
      }

      await get().initSupabaseSync();
      return { error: null };
    } finally {
      syncRuntime.authInitInFlight = false;
    }
  },

  signUpWithPassword: async (email, password, displayName) => {
    const client = getSupabaseClient();
    if (!client) {
      return { error: 'Supabase is not configured. Check your environment settings.' };
    }
    set({ authError: null });
    const cleanName = displayName.trim() || email.split('@')[0] || 'Adventurer';
    syncRuntime.authInitInFlight = true;
    try {
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: cleanName,
          },
        },
      });
      if (error) {
        set({ authError: error.message });
        return { error: error.message };
      }

      if (!data.session) {
        return { error: null, needsConfirmation: true };
      }

      await get().initSupabaseSync();
      return { error: null, needsConfirmation: false };
    } finally {
      syncRuntime.authInitInFlight = false;
    }
  },

  requestPasswordReset: async (email) => {
    const client = getSupabaseClient();
    if (!client) {
      return { error: 'Supabase is not configured.' };
    }
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined;
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    return { error: error ? error.message : null };
  },

  signOutVault: async () => {
    const client = getSupabaseClient();
    if (client && syncRuntime.realtimeChannel) {
      await client.removeChannel(syncRuntime.realtimeChannel);
      syncRuntime.realtimeChannel = null;
    }
    syncRuntime.entitySyncTimers.forEach((t) => clearTimeout(t));
    syncRuntime.entitySyncTimers.clear();
    syncRuntime.mapSyncTimers.forEach((t) => clearTimeout(t));
    syncRuntime.mapSyncTimers.clear();
    syncRuntime.journalSyncTimers.forEach((t) => clearTimeout(t));
    syncRuntime.journalSyncTimers.clear();
    syncRuntime.characterSyncTimers.forEach((t) => clearTimeout(t));
    syncRuntime.characterSyncTimers.clear();
    if (syncRuntime.broadcastSyncDebounce) clearTimeout(syncRuntime.broadcastSyncDebounce);
    if (syncRuntime.realtimeSyncDebounce) clearTimeout(syncRuntime.realtimeSyncDebounce);

    if (client) {
      await client.auth.signOut();
    }

    set({
      isAuthenticated: false,
      authLoading: false,
      authError: null,
      user: null,
      userEmail: null,
      profile: null,
      campaigns: [],
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
      templates: { ...DEFAULT_TEMPLATES },
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
      tabs: [],
      activeTabId: '',
      splitPaneTabId: null,
      past: [],
      future: [],
      syncStatus: 'offline',
      lastSyncError: null,
    });
  },

  updateProfile: async (patch) => {
    const client = getSupabaseClient();
    const state = get();
    if (!state.user) return;
    const nextProfile: PlayerProfile = {
      id: state.user.id,
      display_name: patch.display_name ?? state.profile?.display_name ?? 'Adventurer',
      avatar_url: patch.avatar_url !== undefined ? patch.avatar_url : state.profile?.avatar_url ?? null,
      bio: patch.bio ?? state.profile?.bio ?? '',
      updated_at: new Date().toISOString(),
    };
    set((s) => ({
      profile: nextProfile,
      campaignMembers: s.campaignMembers.map((m) =>
        m.user_id === nextProfile.id ? { ...m, profile: nextProfile } : m
      ),
    }));
    if (!client) return;
    const { data: updatedRows, error: updateErr } = await client
      .from('profiles')
      .update({
        display_name: nextProfile.display_name,
        avatar_url: nextProfile.avatar_url,
        bio: nextProfile.bio,
        updated_at: nextProfile.updated_at,
      })
      .eq('id', state.user.id)
      .select('id');
    let error = updateErr;
    if (!error && (!updatedRows || updatedRows.length === 0)) {
      const upsertRes = await client.from('profiles').upsert(nextProfile);
      error = upsertRes.error;
    }
    if (error) {
      set({ syncStatus: 'error', lastSyncError: error.message });
    }
  },
});
