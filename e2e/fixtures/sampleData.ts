import crypto from 'node:crypto';
import zlib from 'node:zlib';

export interface TestUserCredentials {
  email: string;
  password: string;
  displayName: string;
}

export function makeUserCredentials(prefix = 'player'): TestUserCredentials {
  const suffix = crypto.randomBytes(4).toString('hex');
  return {
    email: `${prefix}.${suffix}@aethelgard.test`,
    password: `VaultPass!${suffix}`,
    displayName: `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}-${suffix}`,
  };
}

export function makeInviteCode(prefix = 'INV'): string {
  const cleanPrefix =
    prefix
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 4) || 'INV';
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${cleanPrefix}${suffix}`;
}

// Pure PNG encoder (CRC32 + zlib IDAT) with zero native image dependencies
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

export function createPngBuffer(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number] = [255, 255, 255, 255],
): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type 6 = RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const stride = 1 + width * 4;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4;
      raw[px] = rgba[0];
      raw[px + 1] = rgba[1];
      raw[px + 2] = rgba[2];
      raw[px + 3] = rgba[3];
    }
  }

  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function createPngDataUrl(
  width = 1,
  height = 1,
  rgba: readonly [number, number, number, number] = [64, 180, 120, 255],
): string {
  return `data:image/png;base64,${createPngBuffer(width, height, rgba).toString('base64')}`;
}

export function create256FogPngBuffer(fillValue = 255): Buffer {
  return createPngBuffer(256, 256, [fillValue, fillValue, fillValue, 255]);
}

export const TINY_PNG_BUFFER = createPngBuffer(1, 1, [200, 100, 50, 255]);
export const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BUFFER.toString('base64')}`;

export interface Roll20SheetDefinition {
  name: string;
  description: string;
  html: string;
  css: string;
  schemaJson: string;
}

export const ROLL20_CUSTOM_SHEET_SAMPLE: Roll20SheetDefinition = {
  name: 'Aethelgard Custom Adventurer Sheet',
  description: 'Roll20-compatible HTML/CSS/JSON sheet with attr_* bindings, computed modifiers, repeating rows, and [[roll]] triggers',
  html: `<div class="sheet-root">
  <h2 class="sheet-title">Adventurer Sheet</h2>
  <div class="sheet-grid">
    <label>Character Name <input type="text" name="attr_character_name" /></label>
    <label>Strength <input type="number" name="attr_strength" value="16" /></label>
    <label>STR Mod <input type="number" name="attr_str_mod" readonly /></label>
    <label>Proficiency <input type="number" name="attr_proficiency" value="2" /></label>
    <label>Attack Bonus <input type="number" name="attr_attack_bonus" readonly /></label>
  </div>
  <div class="sheet-actions">
    <button type="button" data-roll="[[1d20+@{attack_bonus}]]" data-roll-label="Longsword Strike">
      Roll Longsword [[1d20+@{attack_bonus}]]
    </button>
    <button type="button" data-roll="[[1d8+@{str_mod}]]" data-roll-label="Longsword Damage">
      Roll Damage [[1d8+@{str_mod}]]
    </button>
  </div>
  <fieldset class="repeating_weapons">
    <input type="text" name="attr_weapon_name" placeholder="Weapon" />
    <input type="text" name="attr_weapon_dice" value="1d6" />
  </fieldset>
</div>`,
  css: `.sheet-root { font-family: Georgia, serif; padding: 12px; color: #f5e6c8; background: #1e1b18; }
.sheet-title { color: #d4af37; margin-bottom: 8px; }
.sheet-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.sheet-actions { margin-top: 12px; display: flex; gap: 8px; }`,
  schemaJson: JSON.stringify(
    {
      defaults: {
        character_name: 'Unnamed Hero',
        strength: 10,
        proficiency: 2,
      },
      computed: {
        str_mod: 'floor((@{strength} - 10) / 2)',
        attack_bonus: '@{str_mod} + @{proficiency}',
      },
      macros: {
        strike: '1d20+@{attack_bonus}',
      },
    },
    null,
    2,
  ),
};

export const XSS_AND_CSS_PAYLOADS = {
  scriptTag: '<p>Innocent lore</p><script>window.__e2eXssTriggered = true;</script>',
  imgOnError: '<img src="invalid://broken-host" onerror="window.__e2eXssTriggered = true;" alt="broken" />',
  javascriptHref: '<a href="javascript:window.__e2eXssTriggered=true">Trap Link</a>',
  svgOnload: '<svg onload="window.__e2eXssTriggered = true;"><circle cx="5" cy="5" r="4" /></svg>',
  cssBreakout:
    '<style>} body, #root { background: rgb(255, 0, 123) !important; opacity: 0.05 !important; } .x {</style><p>Note text</p>',
  combinedDangerousNote: [
    '<p>Expedition notes referencing [[Aldric the Bold]]</p>',
    '<script>window.__e2eXssTriggered = true;</script>',
    '<img src="invalid://bad" onerror="window.__e2eXssTriggered = true;" />',
    '<a href="javascript:window.__e2eXssTriggered=true">Unsafe link</a>',
    '<svg onload="window.__e2eXssTriggered = true;"></svg>',
    '<style>} body { background: rgb(255, 0, 123) !important; } .leak {</style>',
  ].join('\n'),
} as const;

export function makeSampleEntityPayload(
  worldId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const title = typeof overrides.title === 'string' ? overrides.title : 'Aldric the Bold';
  const slug =
    typeof overrides.slug === 'string'
      ? overrides.slug
      : `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${crypto.randomBytes(2).toString('hex')}`;
  return {
    world_id: worldId,
    slug,
    title,
    type: 'NPC',
    category: 'encyclopedia',
    tags: ['guild', 'npc'],
    summary: 'Veteran quartermaster of the Guildhall',
    content: '<p>Guards the coastal supply depot.</p>',
    gm_secrets: 'Secretly holds the vault key.',
    metadata: {},
    is_favorite: false,
    ...overrides,
  };
}

export function makeSampleMapPayload(
  worldId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    world_id: worldId,
    name: 'Outer Reach',
    kind: '3d',
    world_size: 200,
    sea_level: 0,
    battlemap: null,
    ...overrides,
  };
}

export function makeSampleTimelineEventPayload(
  campaignId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    campaign_id: campaignId,
    title: 'Founding of the Guild',
    date_label: 'Year 1042, Frostfall 1',
    sort_order: 1,
    era: 'Age of Embers',
    description: 'Charter signed at High Harbor.',
    linked_entity_id: null,
    is_gm_only: false,
    ...overrides,
  };
}

export function makeSampleCharacterPayload(
  campaignId: string,
  userId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    campaign_id: campaignId,
    user_id: userId,
    name: 'Kaelen Stormblade',
    sheet_template_id: null,
    attributes: { strength: 16, proficiency: 2 },
    is_active: true,
    ...overrides,
  };
}

export function makeSampleGuildQuestPayload(
  campaignId: string,
  boardId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    campaign_id: campaignId,
    board_id: boardId,
    title: 'Clear the Sunken Crypt',
    summary: 'Investigate undead sightings beneath the western sea caves.',
    danger_tier: 'Standard',
    reward: '250 gp',
    max_players: 4,
    status: 'open',
    ...overrides,
  };
}

export function createValidCampaignArchiveV2(overrides: {
  name?: string;
  mode?: 'normal' | 'west_marches';
  includeDataUrlImage?: boolean;
} = {}): Record<string, unknown> {
  const worldId = crypto.randomUUID();
  const mapId = crypto.randomUUID();
  const entityId = crypto.randomUUID();
  const pinId = crypto.randomUUID();
  const templateId = crypto.randomUUID();
  const timelineId = crypto.randomUUID();
  const paintDataUrl = overrides.includeDataUrlImage ? createPngDataUrl(4, 4, [90, 130, 80, 255]) : null;

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    campaign: {
      id: worldId,
      name: overrides.name ?? 'Shattered Coast Archive',
      description: 'Imported CampaignArchiveV2 test world',
      mode: overrides.mode ?? 'west_marches',
      max_players_per_party: 4,
      calendar_config: {
        eraName: 'Age of Embers',
        months: [
          { name: 'Frostfall', days: 30 },
          { name: 'Suncrest', days: 30 },
          { name: 'Ashwind', days: 30 },
        ],
        weekdays: ['Moonday', 'Tideday', 'Starday'],
        currentYear: 1042,
        currentMonthIndex: 0,
        currentDay: 1,
      },
    },
    entities: [
      {
        id: entityId,
        world_id: worldId,
        slug: 'aldric-the-bold',
        title: 'Aldric the Bold',
        type: 'NPC',
        category: 'encyclopedia',
        summary: 'Veteran quartermaster of the Guildhall',
        content: '<p>Guards the coastal supply depot.</p>',
        tags: ['guild', 'npc'],
        gm_secrets: 'Secretly holds the vault key.',
        metadata: {},
        is_favorite: false,
      },
    ],
    maps: [
      {
        id: mapId,
        world_id: worldId,
        name: 'Outer Reach',
        kind: '3d',
        world_size: 200,
        sea_level: 0,
        paint_url: paintDataUrl,
        battlemap: null,
      },
    ],
    mapPins: [
      {
        id: pinId,
        map_id: mapId,
        entity_id: entityId,
        label: 'Guildhall Watch',
        x: 10,
        y: 2,
        z: -5,
        icon_type: 'settlement',
        is_gm_only: false,
      },
    ],
    mapPaths: [],
    timelineEvents: [
      {
        id: timelineId,
        campaign_id: worldId,
        title: 'Founding of the Guild',
        date_label: 'Year 1042, Frostfall 1',
        sort_order: 1,
        era: 'Age of Embers',
        description: 'Charter signed at High Harbor.',
        linked_entity_id: entityId,
        is_gm_only: false,
      },
    ],
    sheetTemplates: [
      {
        id: templateId,
        campaign_id: worldId,
        name: ROLL20_CUSTOM_SHEET_SAMPLE.name,
        system_label: 'Custom',
        html_template: ROLL20_CUSTOM_SHEET_SAMPLE.html,
        css_template: ROLL20_CUSTOM_SHEET_SAMPLE.css,
        schema_json: JSON.parse(ROLL20_CUSTOM_SHEET_SAMPLE.schemaJson) as Record<string, unknown>,
      },
    ],
  };
}

export const MALFORMED_ARCHIVES = {
  invalidJson: '{ "version": 2, broken json',
  emptyObject: JSON.stringify({}),
  unsupportedVersion: JSON.stringify({ version: 99, campaign: { name: 'Invalid Version' } }),
  missingCampaign: JSON.stringify({ version: 2, entities: [] }),
  invalidEntitiesType: JSON.stringify({
    version: 2,
    campaign: { id: '00000000-0000-4000-8000-000000000001', name: 'Bad Entities' },
    entities: 'not-an-array',
  }),
} as const;
