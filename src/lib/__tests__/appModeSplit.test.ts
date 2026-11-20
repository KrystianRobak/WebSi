import { describe, expect, it } from 'vitest';
import { parseAppModeFromHash, resolveEffectiveAppMode } from '../appRouter';
import { useVaultStore } from '../../store/useVaultStore';
import type { Entity, VaultMap } from '../../types/vault';

describe('appRouter and dual-mode state isolation', () => {
  it('parses #/studio and #/play from URL hash and enforces player role restriction', () => {
    expect(parseAppModeFromHash('#/studio')).toBe('studio');
    expect(parseAppModeFromHash('#/play')).toBe('play');
    expect(parseAppModeFromHash('#/play/table')).toBe('play');
    expect(parseAppModeFromHash('')).toBeNull();

    expect(resolveEffectiveAppMode('studio', 'gm')).toBe('studio');
    expect(resolveEffectiveAppMode('studio', 'co_gm')).toBe('studio');
    expect(resolveEffectiveAppMode('studio', 'player')).toBe('play');
    expect(resolveEffectiveAppMode('play', 'gm')).toBe('play');
  });

  it('resets authoring modes when switching to Play Mode and routes entity links to Codex', () => {
    const store = useVaultStore.getState();
    const sampleEntity: Entity = {
      id: 'ent-codex-1',
      world_id: 'w-1',
      slug: 'emerald-keep',
      title: 'Emerald Keep',
      type: 'Location',
      category: 'world',
      tags: [],
      summary: 'A fortified tower',
      content: 'Details',
      gm_secrets: 'Secret tunnel',
      metadata: { is_gm_only: false },
      is_favorite: false,
      updated_at: '2026-01-01T00:00:00Z',
    };
    const sampleMap: VaultMap = {
      id: 'map-2d-1',
      world_id: 'w-1',
      name: 'Keep Courtyard',
      kind: '2d',
      width: 960,
      height: 720,
      displacement_scale: 0,
      scale_config: { ratio: '1 sq = 5 ft', elevationSource: '2D', kmPerUnit: 0.0015 },
    };

    useVaultStore.setState({
      myRole: 'gm',
      gmMode: true,
      appMode: 'studio',
      worldsmithMode: true,
      battlemapMode: 'prep',
      mapToolMode: 'pin',
      entities: [sampleEntity],
      maps: [sampleMap],
      tabs: [],
      playCodexOpen: false,
      playCodexEntityId: null,
    });

    store.setAppMode('play', { syncUrl: false });
    const afterPlay = useVaultStore.getState();
    expect(afterPlay.appMode).toBe('play');
    expect(afterPlay.worldsmithMode).toBe(false);
    expect(afterPlay.battlemapMode).toBe('play');
    expect(afterPlay.mapToolMode).toBe('select');
    expect(afterPlay.playActiveMapId).toBe('map-2d-1');

    // In Play Mode, opening an entity by title opens the read-only Codex drawer instead of Studio editor tabs
    afterPlay.openEntityByTitle('Emerald Keep');
    const afterOpen = useVaultStore.getState();
    expect(afterOpen.playCodexOpen).toBe(true);
    expect(afterOpen.playCodexEntityId).toBe('ent-codex-1');
    expect(afterOpen.tabs).toHaveLength(0);

    // Switching back to Studio opens entity in Studio tabs
    afterOpen.setAppMode('studio', { syncUrl: false });
    useVaultStore.getState().openEntityByTitle('Emerald Keep');
    const afterStudio = useVaultStore.getState();
    expect(afterStudio.appMode).toBe('studio');
    expect(afterStudio.playCodexOpen).toBe(false);
    expect(afterStudio.tabs.some((t) => t.kind === 'entity' && t.targetId === 'ent-codex-1')).toBe(true);
  });
});
