import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildDefaultLocalVaultStorage,
  LOCAL_USER_ID,
} from '../localVault';
import { useVaultStore } from '../../store/useVaultStore';

const prevDocument = (globalThis as { document?: unknown }).document;
const prevLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

beforeAll(() => {
  const memStore = new Map<string, string>();
  (globalThis as { localStorage: Storage }).localStorage = {
    get length() {
      return memStore.size;
    },
    clear: () => memStore.clear(),
    getItem: (k: string) => memStore.get(k) ?? null,
    key: (i: number) => Array.from(memStore.keys())[i] ?? null,
    removeItem: (k: string) => {
      memStore.delete(k);
    },
    setItem: (k: string, v: string) => {
      memStore.set(k, String(v));
    },
  };

  const makeMockCtx = () =>
    new Proxy(
      {
        createImageData: (w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h,
        }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
      },
      {
        get(target, prop) {
          if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
          return () => {};
        },
      }
    );

  (globalThis as { document: unknown }).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 256,
          height: 256,
          getContext: () => makeMockCtx(),
          toDataURL: () => 'data:image/png;base64,stub',
        };
      }
      return {};
    },
  };
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = prevDocument;
  (globalThis as { localStorage?: unknown }).localStorage = prevLocalStorage;
});

describe('Default Local Vault mode (no Supabase required)', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    useVaultStore.setState({
      isAuthenticated: false,
      authLoading: true,
      user: null,
      campaigns: [],
      activeCampaignId: null,
      entities: [],
      maps: [],
      diceRolls: [],
      syncStatus: 'offline',
    });
  });

  it('builds a complete starter campaign with 3D world, 2D battlemap, character, quests, and journals', () => {
    const storage = buildDefaultLocalVaultStorage();
    expect(storage.activeCampaignId).toBeTruthy();
    const bundle = storage.campaigns[storage.activeCampaignId!];
    expect(bundle).toBeDefined();
    expect(bundle.world.owner_id).toBe(LOCAL_USER_ID);
    expect(bundle.entities.length).toBeGreaterThan(5);
    expect(bundle.maps.some((m) => m.kind !== '2d')).toBe(true);
    expect(bundle.maps.some((m) => m.kind === '2d')).toBe(true);
    expect(bundle.characters.length).toBeGreaterThanOrEqual(1);
    expect(bundle.questBoards.length).toBeGreaterThanOrEqual(1);
    expect(bundle.guildQuests.length).toBeGreaterThanOrEqual(1);
    expect(bundle.journalPages.length).toBeGreaterThanOrEqual(1);
    expect(bundle.timelineEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('boots straight into Default Local Vault when Supabase is not configured and supports local actions', async () => {
    await useVaultStore.getState().initSupabaseSync();
    const state = useVaultStore.getState();

    expect(state.isAuthenticated).toBe(true);
    expect(state.authLoading).toBe(false);
    expect(state.syncStatus).toBe('local');
    expect(state.myRole).toBe('gm');
    expect(state.entities.length).toBeGreaterThan(5);
    expect(state.maps.length).toBeGreaterThanOrEqual(2);

    const roll = await state.rollDiceAndPublish('1d20+2', { label: 'Perception' });
    expect(roll.error).toBeNull();
    expect(roll.result?.total).toBeGreaterThanOrEqual(3);
    expect(useVaultStore.getState().diceRolls.length).toBe(1);

    const created = await useVaultStore.getState().createCampaign({
      name: 'Homebrew Rim',
      mode: 'normal',
      seedStarter: false,
    });
    expect(created.error).toBeNull();
    expect(created.worldId).toBeTruthy();
    expect(useVaultStore.getState().world.name).toBe('Homebrew Rim');
  });
});
