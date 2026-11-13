import { BattlemapData, BattlemapTheme } from '../types/vault';

const floorCache = new Map<string, string>();

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Generates an atmospheric top-down 2D TTRPG battlemap floor texture as a cached PNG data URL.
 */
export function generateBattlemapFloorUrl(
  theme: BattlemapTheme,
  width = 1280,
  height = 832,
  gridSizePx = 64
): string {
  const key = `${theme}:${width}x${height}:${gridSizePx}`;
  const cached = floorCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  if (theme === 'harbor-tavern') {
    ctx.fillStyle = '#1d1611';
    ctx.fillRect(0, 0, width, height);
    // Warm timber floorboards
    for (let y = 0; y < height; y += 20) {
      const shade = 22 + Math.floor(hash(y) * 14);
      ctx.fillStyle = `rgb(${shade + 12}, ${shade + 4}, ${shade - 4})`;
      ctx.fillRect(0, y, width, 19);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, y + 18, width, 2);
      for (let x = (y % 40) * 3; x < width; x += 128) {
        ctx.fillRect(x, y, 2, 19);
      }
    }
  } else if (theme === 'forest-clearing') {
    const grad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      60,
      width * 0.5,
      height * 0.5,
      width * 0.65
    );
    grad.addColorStop(0, '#2a3323');
    grad.addColorStop(0.65, '#1b2419');
    grad.addColorStop(1, '#10150f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle dirt path & mossy patches
    for (let i = 0; i < 240; i++) {
      const x = hash(i * 3) * width;
      const y = hash(i * 3 + 1) * height;
      const r = 12 + hash(i * 3 + 2) * 36;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(65, 55, 38, 0.16)' : 'rgba(38, 62, 34, 0.18)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // stone-crypt or obsidian-sanctum
    const isObsidian = theme === 'obsidian-sanctum';
    ctx.fillStyle = isObsidian ? '#101319' : '#181b21';
    ctx.fillRect(0, 0, width, height);

    // Flagstone masonry tiles aligned with grid
    const cols = Math.ceil(width / gridSizePx);
    const rows = Math.ceil(height / gridSizePx);
    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        const n = hash(ry * 100 + rx);
        const base = isObsidian ? 18 + n * 10 : 26 + n * 14;
        ctx.fillStyle = isObsidian
          ? `rgb(${base - 2}, ${base}, ${base + 7})`
          : `rgb(${base + 2}, ${base + 1}, ${base - 1})`;
        ctx.fillRect(rx * gridSizePx + 1, ry * gridSizePx + 1, gridSizePx - 2, gridSizePx - 2);

        // Occasional carved crack / gold vein
        if (n > 0.84) {
          ctx.strokeStyle = isObsidian ? 'rgba(212, 168, 83, 0.16)' : 'rgba(0, 0, 0, 0.35)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(rx * gridSizePx + 12, ry * gridSizePx + 14);
          ctx.lineTo(rx * gridSizePx + 36, ry * gridSizePx + 38);
          ctx.lineTo(rx * gridSizePx + 48, ry * gridSizePx + 32);
          ctx.stroke();
        }
      }
    }

    // Central ritual / vault inlay circle
    ctx.strokeStyle = isObsidian ? 'rgba(212, 168, 83, 0.24)' : 'rgba(180, 155, 102, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width * 0.45, height * 0.5, gridSizePx * 2.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width * 0.45, height * 0.5, gridSizePx * 1.45, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Subtle ambient vignette
  const vig = ctx.createRadialGradient(
    width * 0.5,
    height * 0.5,
    width * 0.22,
    width * 0.5,
    height * 0.5,
    width * 0.72
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(6,8,11,0.52)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  const url = canvas.toDataURL('image/png');
  floorCache.set(key, url);
  return url;
}

/**
 * Creates a ready-to-play 2D tactical encounter map ("Oakhaven Smuggler Vaults")
 * showcasing dynamic raycast lighting, open/closed/secret doors, party & enemies.
 */
export function createSeededSmugglerVaultsBattlemap(): BattlemapData {
  const g = 64;
  const width = 1280; // 20 squares
  const height = 832; // 13 squares

  return {
    theme: 'stone-crypt',
    backgroundUrl: generateBattlemapFloorUrl('stone-crypt', width, height, g),
    width,
    height,
    gridSizePx: g,
    showGrid: true,
    gridOpacity: 0.22,
    ambientLight: 0.12,
    dynamicLighting: true,
    walls: [
      // Outer perimeter walls
      { id: 'w-top', x1: g, y1: g, x2: 19 * g, y2: g, kind: 'wall' },
      { id: 'w-bot', x1: g, y1: 12 * g, x2: 19 * g, y2: 12 * g, kind: 'wall' },
      { id: 'w-left', x1: g, y1: g, x2: g, y2: 12 * g, kind: 'wall' },
      { id: 'w-right', x1: 19 * g, y1: g, x2: 19 * g, y2: 12 * g, kind: 'wall' },

      // West entry foyer divider (with Door 1 gap between y=5g..6g)
      { id: 'w-foyer-n', x1: 5 * g, y1: g, x2: 5 * g, y2: 5 * g, kind: 'wall' },
      { id: 'w-foyer-s', x1: 5 * g, y1: 6 * g, x2: 5 * g, y2: 12 * g, kind: 'wall' },

      // East vault inner chamber (with Door 2 at top y=3g..4g and Secret Door 3 at bottom y=9g..10g)
      { id: 'w-east-top', x1: 13 * g, y1: g, x2: 13 * g, y2: 3 * g, kind: 'wall' },
      { id: 'w-east-mid', x1: 13 * g, y1: 4 * g, x2: 13 * g, y2: 9 * g, kind: 'wall' },
      { id: 'w-east-bot', x1: 13 * g, y1: 10 * g, x2: 13 * g, y2: 12 * g, kind: 'wall' },

      // Central hall stone pillars (cast dramatic tactical ray shadows)
      { id: 'p-1a', x1: 8 * g, y1: 3 * g, x2: 8.6 * g, y2: 3 * g, kind: 'pillar' },
      { id: 'p-1b', x1: 8 * g, y1: 3 * g, x2: 8 * g, y2: 3.6 * g, kind: 'pillar' },
      { id: 'p-2a', x1: 8 * g, y1: 9.4 * g, x2: 8.6 * g, y2: 9.4 * g, kind: 'pillar' },
      { id: 'p-2b', x1: 8 * g, y1: 9.4 * g, x2: 8 * g, y2: 10 * g, kind: 'pillar' },
    ],
    doors: [
      {
        id: 'door-iron-foyer',
        label: 'Iron Vault Gate',
        x1: 5 * g,
        y1: 5 * g,
        x2: 5 * g,
        y2: 6 * g,
        isOpen: false,
        isLocked: true,
        isSecret: false,
      },
      {
        id: 'door-guard-north',
        label: 'Guardroom Arch',
        x1: 13 * g,
        y1: 3 * g,
        x2: 13 * g,
        y2: 4 * g,
        isOpen: true,
        isLocked: false,
        isSecret: false,
      },
      {
        id: 'door-secret-smuggler',
        label: 'Secret Brick Door',
        x1: 13 * g,
        y1: 9 * g,
        x2: 13 * g,
        y2: 10 * g,
        isOpen: false,
        isLocked: false,
        isSecret: true,
      },
    ],
    lights: [
      {
        id: 'l-foyer-torch',
        label: 'Foyer Sconce',
        x: 2.5 * g,
        y: 3.5 * g,
        radiusFt: 25,
        color: '#f59e0b',
        intensity: 0.9,
        isOn: true,
        flicker: true,
      },
      {
        id: 'l-central-brazier',
        label: 'Arcane Brazier',
        x: 9 * g,
        y: 6.5 * g,
        radiusFt: 35,
        color: '#38bdf8',
        intensity: 0.95,
        isOn: true,
        flicker: true,
      },
      {
        id: 'l-east-altar',
        label: 'Crimson Shrine Candle',
        x: 16.5 * g,
        y: 6.5 * g,
        radiusFt: 25,
        color: '#ef4444',
        intensity: 0.85,
        isOn: true,
        flicker: true,
      },
    ],
    tokens: [
      {
        id: 'tok-kaelen',
        name: 'Kaelen Voss',
        entity_id: 'ent-kaelen',
        disposition: 'party',
        x: 3.5 * g,
        y: 5.5 * g,
        sizeCells: 1,
        hp: 42,
        maxHp: 46,
        ac: 16,
        visionRangeFt: 60,
        lightRadiusFt: 20,
        lightColor: '#fcd34d',
        isHidden: false,
      },
      {
        id: 'tok-vaelora',
        name: 'Lady Vaelora',
        entity_id: 'ent-vaelora',
        disposition: 'party',
        x: 2.5 * g,
        y: 7.5 * g,
        sizeCells: 1,
        hp: 34,
        maxHp: 34,
        ac: 14,
        visionRangeFt: 60,
        lightRadiusFt: 0,
        lightColor: '#fde68a',
        isHidden: false,
      },
      {
        id: 'tok-enforcer-1',
        name: 'Shadow Enforcer',
        disposition: 'enemy',
        x: 10.5 * g,
        y: 4.5 * g,
        sizeCells: 1,
        hp: 28,
        maxHp: 28,
        ac: 15,
        visionRangeFt: 60,
        lightRadiusFt: 0,
        lightColor: '#ef4444',
        isHidden: false,
      },
      {
        id: 'tok-cultist-1',
        name: 'Guild Arcanist',
        disposition: 'enemy',
        x: 15.5 * g,
        y: 5.5 * g,
        sizeCells: 1,
        hp: 22,
        maxHp: 22,
        ac: 13,
        visionRangeFt: 60,
        lightRadiusFt: 0,
        lightColor: '#ef4444',
        isHidden: false,
      },
      {
        id: 'tok-assassin-gm',
        name: 'Vesper Ambush Blade',
        disposition: 'enemy',
        x: 11.5 * g,
        y: 9.5 * g,
        sizeCells: 1,
        hp: 36,
        maxHp: 36,
        ac: 16,
        visionRangeFt: 60,
        lightRadiusFt: 0,
        lightColor: '#ef4444',
        isHidden: true,
      },
    ],
    props: [
      {
        id: 'prop-crates-foyer',
        kind: 'crate',
        label: 'Smuggler Contraband',
        x: 2.5 * g,
        y: 2.2 * g,
        widthPx: 54,
        heightPx: 44,
        rotationDeg: 10,
        color: '#8b5e34',
        notes: 'Contains 4 sealed flasks of Alchemist Fire and Shadow Guild ledger.',
        isSecret: false,
        blocksLight: true,
      },
      {
        id: 'prop-altar-east',
        kind: 'altar',
        label: 'Obsidian Sanctum Altar',
        x: 16.8 * g,
        y: 6.5 * g,
        widthPx: 56,
        heightPx: 86,
        rotationDeg: 0,
        color: '#b91c1c',
        notes: 'DC 14 Arcana identifies the blood-rune siphon linked to the Reliquary.',
        isSecret: false,
        blocksLight: false,
      },
      {
        id: 'prop-chest-vault',
        kind: 'chest',
        label: 'Ironbound Strongbox',
        x: 17.5 * g,
        y: 2.3 * g,
        widthPx: 46,
        heightPx: 34,
        rotationDeg: 0,
        color: '#d4a853',
        notes: 'DC 15 Thieves Tools. Holds 320 gp and Harbor Key.',
        isSecret: false,
        blocksLight: false,
      },
      {
        id: 'prop-trap-plate',
        kind: 'trap',
        label: 'Needle Pressure Plate',
        x: 6.5 * g,
        y: 5.5 * g,
        widthPx: 52,
        heightPx: 52,
        rotationDeg: 0,
        color: '#ef4444',
        notes: 'DC 15 Perception to spot. Triggers 2d8 poison dart volley from Iron Vault Gate.',
        isSecret: true,
        blocksLight: false,
      },
      {
        id: 'prop-marker-ambush',
        kind: 'marker',
        label: 'Ambush Trigger A1',
        x: 10.5 * g,
        y: 7.5 * g,
        widthPx: 34,
        heightPx: 34,
        rotationDeg: 0,
        color: '#eab308',
        notes: 'When players step past central brazier, Vesper Ambush Blade attacks from stealth.',
        entityId: 'ent-oakhaven',
        isSecret: true,
        blocksLight: false,
      },
    ],
    sceneNotes: 'Vault beneath Oakhaven Harbor guarded by Shadow Guild enforcers.',
  };
}

export function createBlankBattlemap(
  theme: BattlemapTheme = 'stone-crypt',
  cols = 20,
  rows = 13,
  gridSizePx = 64
): BattlemapData {
  const width = cols * gridSizePx;
  const height = rows * gridSizePx;
  return {
    theme,
    backgroundUrl: generateBattlemapFloorUrl(theme, width, height, gridSizePx),
    width,
    height,
    gridSizePx,
    showGrid: true,
    gridOpacity: 0.22,
    ambientLight: 0.28,
    dynamicLighting: true,
    walls: [],
    doors: [],
    lights: [
      {
        id: `light-${Date.now()}`,
        label: 'Central Lantern',
        x: Math.round(cols / 2) * gridSizePx - gridSizePx * 0.5,
        y: Math.round(rows / 2) * gridSizePx - gridSizePx * 0.5,
        radiusFt: 35,
        color: '#f59e0b',
        intensity: 0.95,
        isOn: true,
        flicker: true,
      },
    ],
    tokens: [],
    props: [],
  };
}
