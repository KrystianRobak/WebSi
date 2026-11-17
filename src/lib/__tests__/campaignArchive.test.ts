import { describe, expect, it } from 'vitest';
import { exportCampaignArchive, importCampaignJson } from '../campaignArchive';
import { DEFAULT_TEMPLATES } from '../../data/templates';
import type { Entity, MapPin, VaultMap, World } from '../../types/vault';

const sampleWorld: World = {
  id: '11111111-1111-4111-8111-111111111111',
  owner_id: 'gm-1',
  name: 'Origin Realm',
  description: 'Test description',
  mode: 'west_marches',
  max_players_per_party: 4,
  active_sheet_template_id: 'tpl-sheet-1',
};

const sampleEntities: Entity[] = [
  {
    id: 'ent-1',
    world_id: sampleWorld.id,
    slug: 'oakhaven',
    title: 'Oakhaven',
    type: 'Location',
    category: 'encyclopedia',
    tags: ['port'],
    summary: 'Free port',
    content: 'Public lore',
    gm_secrets: 'Secret lich phylactery under dock 3',
    metadata: {},
    is_favorite: true,
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const samplePins: MapPin[] = [
  {
    id: 'pin-pub',
    map_id: 'map-1',
    entity_id: 'ent-1',
    label: 'Oakhaven Gate',
    x: 1,
    y: 2,
    z: 3,
    icon_type: 'port',
    is_gm_only: false,
  },
  {
    id: 'pin-sec',
    map_id: 'map-1',
    entity_id: 'ent-1',
    label: 'Hidden Lair',
    x: 4,
    y: 2,
    z: 5,
    icon_type: 'danger',
    is_gm_only: true,
  },
];

const sampleMaps: VaultMap[] = [
  {
    id: 'map-1',
    world_id: sampleWorld.id,
    name: 'Region Map',
    kind: '3d',
    albedo_url: 'data:image/png;base64,iVBORw0KGgo=',
    width: 1024,
    height: 1024,
    displacement_scale: 12,
    scale_config: { ratio: '1:1000', elevationSource: 'Heightmap', kmPerUnit: 1 },
    battlemap: {
      theme: 'stone-crypt',
      width: 640,
      height: 640,
      gridSizePx: 64,
      ambientLight: 0.4,
      showGrid: true,
      gridOpacity: 0.25,
      dynamicLighting: true,
      tokens: [
        {
          id: 'tok-pub',
          name: 'Hero',
          character_id: 'char-1',
          disposition: 'party',
          x: 64,
          y: 64,
          sizeCells: 1,
          hp: 20,
          maxHp: 20,
          ac: 15,
          visionRangeFt: 60,
          lightRadiusFt: 20,
          lightColor: '#fff',
          isHidden: false,
        },
        {
          id: 'tok-ambush',
          name: 'Hidden Assassin',
          disposition: 'enemy',
          x: 128,
          y: 128,
          sizeCells: 1,
          hp: 15,
          maxHp: 15,
          ac: 14,
          visionRangeFt: 60,
          lightRadiusFt: 0,
          lightColor: '#fff',
          isHidden: true,
        },
      ],
      walls: [{ id: 'w1', x1: 0, y1: 0, x2: 64, y2: 0, kind: 'secret-wall' }],
      doors: [{ id: 'd1', label: 'Secret', x1: 0, y1: 0, x2: 32, y2: 0, isOpen: false, isLocked: false, isSecret: true }],
      lights: [],
    },
  },
];

describe('campaignArchive', () => {
  it('strips GM secrets, hidden pins, and hidden battlemap tokens on player export', () => {
    const archive = exportCampaignArchive({
      isEffectiveGm: false,
      world: sampleWorld,
      entities: sampleEntities,
      entityLinks: [],
      maps: sampleMaps,
      mapPins: samplePins,
      mapPaths: [],
      assets: [],
      templates: DEFAULT_TEMPLATES,
      sheetTemplates: [],
      characters: [],
      mapQuestBoards: [],
      guildQuests: [],
      timelineEvents: [
        {
          id: 'ev-1',
          campaign_id: sampleWorld.id,
          title: 'Public Event',
          date_label: 'Day 1',
          sort_order: 1,
          era: 'First',
          description: 'Public',
          is_gm_only: false,
        },
        {
          id: 'ev-2',
          campaign_id: sampleWorld.id,
          title: 'GM Plot',
          date_label: 'Day 2',
          sort_order: 2,
          era: 'First',
          description: 'Secret',
          is_gm_only: true,
        },
      ],
    });

    expect(archive.version).toBe(2);
    expect(archive.mode).toBe('player');
    expect(archive.entities[0].gm_secrets).toBe('');
    expect(archive.mapPins).toHaveLength(1);
    expect(archive.mapPins[0].id).toBe('pin-pub');
    expect(archive.maps[0].battlemap?.tokens.map((t) => t.id)).toEqual(['tok-pub']);
    expect(archive.maps[0].battlemap?.walls).toHaveLength(0);
    expect(archive.maps[0].battlemap?.doors).toHaveLength(0);
    expect(archive.timelineEvents).toHaveLength(1);
  });

  it('preserves GM data when exported by an effective GM and remaps all UUIDs on import', async () => {
    const gmArchive = exportCampaignArchive({
      isEffectiveGm: true,
      world: sampleWorld,
      entities: sampleEntities,
      entityLinks: [{ source_id: 'ent-1', target_id: 'ent-1', world_id: sampleWorld.id }],
      maps: sampleMaps,
      mapPins: samplePins,
      mapPaths: [],
      assets: [],
      templates: DEFAULT_TEMPLATES,
      sheetTemplates: [
        {
          id: 'tpl-sheet-1',
          campaign_id: sampleWorld.id,
          name: '5e',
          system_label: '5e',
          html_template: '<div/>',
          css_template: '',
          schema_json: {},
        },
      ],
      characters: [
        {
          id: 'char-1',
          campaign_id: sampleWorld.id,
          user_id: 'gm-1',
          name: 'Hero',
          sheet_template_id: 'tpl-sheet-1',
          attributes: { str: 16 },
          is_active: true,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      mapQuestBoards: [],
      guildQuests: [],
      timelineEvents: [],
    });

    expect(gmArchive.entities[0].gm_secrets).toContain('lich');
    expect(gmArchive.mapPins).toHaveLength(2);

    const uploadedCalls: string[] = [];
    const imported = await importCampaignJson(JSON.stringify(gmArchive), 'new-owner-uuid', {
      uploadDataUrl: async (_dataUrl, folder) => {
        uploadedCalls.push(folder);
        return `https://cdn.example.com/${folder}/albedo.png`;
      },
    });

    expect(imported.world.id).not.toBe(sampleWorld.id);
    expect(imported.world.owner_id).toBe('new-owner-uuid');
    expect(imported.entities[0].id).not.toBe('ent-1');
    expect(imported.entities[0].world_id).toBe(imported.world.id);
    expect(imported.maps[0].id).not.toBe('map-1');
    expect(imported.maps[0].albedo_url).toMatch(/^https:\/\/cdn\.example\.com/);
    expect(uploadedCalls.length).toBe(1);

    // Foreign key consistency across remapped records
    expect(imported.mapPins[0].map_id).toBe(imported.maps[0].id);
    expect(imported.mapPins[0].entity_id).toBe(imported.entities[0].id);
    expect(imported.characters[0].sheet_template_id).toBe(imported.sheetTemplates[0].id);
    expect(imported.world.active_sheet_template_id).toBe(imported.sheetTemplates[0].id);
    expect(imported.maps[0].battlemap?.tokens[0].character_id).toBe(imported.characters[0].id);
  });

  it('supports legacy v1 archives and rejects malformed JSON cleanly', async () => {
    await expect(importCampaignJson('{bad json', 'u1')).rejects.toThrow(/invalid/i);
    await expect(importCampaignJson('{"foo":1}', 'u1')).rejects.toThrow(/unsupported/i);

    const legacyV1 = JSON.stringify({
      world: { id: 'old-w', name: 'Legacy World', description: 'V1' },
      entities: sampleEntities,
      entityLinks: [],
      maps: [],
      mapPins: [],
      mapPaths: [],
    });
    const bundle = await importCampaignJson(legacyV1, 'u1');
    expect(bundle.world.mode).toBe('normal');
    expect(bundle.world.name).toContain('Legacy World');
    expect(bundle.entities[0].world_id).toBe(bundle.world.id);
  });
});
