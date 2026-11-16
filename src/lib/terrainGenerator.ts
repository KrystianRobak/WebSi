export const TERRAIN_SIZE = 100;
export const TERRAIN_SEGMENTS = 240;
export const DEFAULT_DISPLACEMENT = 16;
export const SEA_LEVEL_NORM = 0.23; // normalized height [0..1] where water plane sits

export interface GeneratedTerrainAssets {
  heightData: Float32Array;
  resolution: number;
  worldSize: number;
  heightmapDataUrl: string;
  albedoDataUrl: string;
}

// Deterministic hash & value noise
function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, octaves = 5): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * smoothNoise(x * freq, y * freq);
    freq *= 2.04;
    amp *= 0.5;
  }
  return value;
}

function ridgedFbm(x: number, y: number, octaves = 5): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    const n = smoothNoise(x * freq, y * freq);
    const ridge = 1 - Math.abs(n * 2 - 1);
    value += amp * ridge * ridge;
    freq *= 2.1;
    amp *= 0.52;
  }
  return value;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixRgb(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number
): [number, number, number] {
  const k = clamp(t, 0, 1);
  return [
    Math.round(mix(c1[0], c2[0], k)),
    Math.round(mix(c1[1], c2[1], k)),
    Math.round(mix(c1[2], c2[2], k)),
  ];
}

const cachedByKey = new Map<string, GeneratedTerrainAssets>();

/**
 * Evaluates procedural Shattered Reach height at world coordinates (wx, wz).
 * Inside [-50..50]^2 it preserves the exact classic landmarks (Oakhaven at (-16,4),
 * Ashen Spire at (18,-17), Sunken Reliquary at (11,22)); outside that core it
 * organically extends into a larger frontier (northern glacier range, eastern
 * steppes & canyons, western sea & outer islands, southern archipelago).
 */
export function evaluateShatteredReachHeightAt(wx: number, wz: number): number {
  // Equivalent classic UV where [-50..50] maps to [0..1]
  const u = wx / 100 + 0.5;
  const v = wz / 100 + 0.5;

  const northSlope = clamp(1.0 - v * 1.15, 0, 1);
  const eastBias = clamp(u * 0.42 + 0.12, 0, 1);

  const broad = fbm(u * 4.2 + 1.3, v * 4.2 + 2.1, 5);
  const ridges = ridgedFbm(u * 6.5 + 3.7, v * 6.5 + 0.9, 5);

  let h = 0.14 + northSlope * 0.38 + eastBias * 0.14 + broad * 0.24;

  // Northern Cinder Crown mountain wall (v < 0.46, extending into far north)
  const mountainMask = clamp((0.46 - v) / 0.36, 0, 1.35);
  h += Math.pow(clamp(mountainMask, 0, 1.25), 1.35) * (0.28 + ridges * 0.46);

  // Far-north high glacial saddle & peaks (wz < -52)
  if (wz < -48) {
    const farNorth = clamp((-48 - wz) / 48, 0, 1);
    const glacial = ridgedFbm(u * 5.2 + 9.4, v * 5.2 - 3.1, 5);
    h = mix(h, 0.48 + glacial * 0.44 + broad * 0.12, farNorth * 0.65);
  }

  // Far-east sunlit highlands & sun-baked plateau (wx > 46)
  if (wx > 42) {
    const farEast = clamp((wx - 42) / 52, 0, 1);
    const mesa = fbm(u * 3.1 + 7.2, v * 3.1 + 4.8, 4);
    const canyon = Math.exp(-Math.pow(Math.sin(wz * 0.055 + mesa * 2.2) * 3.2, 2));
    const eastH = 0.34 + mesa * 0.32 + ridges * 0.22 - canyon * 0.16;
    h = mix(h, eastH, farEast * 0.75);
  }

  // Far-west open ocean & outer storm islands (wx < -44)
  if (wx < -42) {
    const farWest = clamp((-42 - wx) / 48, 0, 1);
    const isles = Math.pow(ridgedFbm(u * 9.0 + 2.1, v * 9.0 + 6.3, 4), 2.3) * 0.44;
    const seaH = 0.08 + broad * 0.12 + isles;
    h = mix(h, seaH, farWest * 0.85);
  }

  // Ashen Spire dramatic mountain promontory around (wx = 18, wz = -17)
  const dxSpire = wx - 18;
  const dzSpire = wz - -17;
  const distSpire = Math.sqrt(dxSpire * dxSpire + dzSpire * dzSpire);
  h += Math.exp(-(distSpire * distSpire) / 95) * 0.29;

  // Western Oakhaven bay indentation (wx = -22, wz = 11)
  const dxBay = wx - -22;
  const dzBay = wz - 11;
  const distBay = Math.sqrt(dxBay * dxBay + dzBay * dzBay);
  h -= Math.exp(-(distBay * distBay) / 145) * 0.27;

  // Oakhaven harbor headland shelf (wx = -16, wz = 4) just above sea level
  const dxOak = wx - -16;
  const dzOak = wz - 4;
  const distOak = Math.sqrt(dxOak * dxOak + dzOak * dzOak);
  h += Math.exp(-(distOak * distOak) / 36) * 0.11;

  // Winding central river valley from (4, -18) down toward Oakhaven Bay (-17, 7)
  const riverCenterX = -4 - (wz + 12) * 0.45 + Math.sin(wz * 0.22) * 4.2;
  const riverDist = Math.abs(wx - riverCenterX);
  if (wz > -22 && wz < 14) {
    const carve = Math.exp(-(riverDist * riverDist) / 12) * 0.14;
    h -= carve;
  }

  // Southern Glass Shoals sea channel & shattered island stacks (v > 0.54)
  const shoalMask = clamp((v - 0.54) / 0.38, 0, 1);
  const archipelagoNoise = ridgedFbm(u * 11.5 + 8.1, v * 11.5 + 4.4, 4);
  h -= shoalMask * 0.32;
  h += shoalMask * Math.pow(archipelagoNoise, 2.1) * 0.36;

  // Sunken Reliquary island citadel around (wx = 11, wz = 22)
  const dxRel = wx - 11;
  const dzRel = wz - 22;
  const distRel = Math.sqrt(dxRel * dxRel + dzRel * dzRel);
  h += Math.exp(-(distRel * distRel) / 42) * 0.22;

  return clamp(h, 0.02, 0.99);
}

/**
 * Generates a cohesive heightmap & rich multi-biome albedo matching "The Shattered Reach".
 * Supports any worldSize (default 100 for legacy callers; 200+ for expanded worlds).
 */
export function generateShatteredReachTerrain(
  resolution = 512,
  worldSize = TERRAIN_SIZE
): GeneratedTerrainAssets {
  const key = `${resolution}:${worldSize}`;
  const hit = cachedByKey.get(key);
  if (hit) return hit;

  const heightData = new Float32Array(resolution * resolution);
  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = resolution;
  heightCanvas.height = resolution;
  const hCtx = heightCanvas.getContext('2d')!;
  const hImg = hCtx.createImageData(resolution, resolution);

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = resolution;
  albedoCanvas.height = resolution;
  const aCtx = albedoCanvas.getContext('2d')!;
  const aImg = aCtx.createImageData(resolution, resolution);

  // Pass 1: Compute heightfield
  for (let py = 0; py < resolution; py++) {
    const v = py / (resolution - 1); // 0 = North (-Z), 1 = South (+Z)
    const wz = (v - 0.5) * worldSize;

    for (let px = 0; px < resolution; px++) {
      const u = px / (resolution - 1); // 0 = West (-X), 1 = East (+X)
      const wx = (u - 0.5) * worldSize;

      const h = evaluateShatteredReachHeightAt(wx, wz);
      heightData[py * resolution + px] = h;

      const byte = Math.round(h * 255);
      const idx = (py * resolution + px) * 4;
      hImg.data[idx] = byte;
      hImg.data[idx + 1] = byte;
      hImg.data[idx + 2] = byte;
      hImg.data[idx + 3] = 255;
    }
  }

  // Pass 2: Paint rich multi-biome albedo with moisture/temperature gradients & slope shading
  const slopeScale = 28 * (resolution / 512) * (100 / worldSize);
  for (let py = 0; py < resolution; py++) {
    const v = py / (resolution - 1);
    const wz = (v - 0.5) * worldSize;

    for (let px = 0; px < resolution; px++) {
      const u = px / (resolution - 1);
      const wx = (u - 0.5) * worldSize;

      const h = heightData[py * resolution + px];
      const hL = heightData[py * resolution + Math.max(0, px - 1)];
      const hR = heightData[py * resolution + Math.min(resolution - 1, px + 1)];
      const hU = heightData[Math.max(0, py - 1) * resolution + px];
      const hD = heightData[Math.min(resolution - 1, py + 1) * resolution + px];
      const slope = Math.sqrt((hR - hL) * (hR - hL) + (hD - hU) * (hD - hU)) * slopeScale;

      const nu = wx / 100 + 0.5;
      const nv = wz / 100 + 0.5;
      const micro = fbm(nu * 26, nv * 26, 3);
      const autumnPatch = fbm(nu * 9 + 5.2, nv * 9 + 1.8, 3);
      const moisture = fbm(nu * 3.5 + 8.4, nv * 3.5 + 2.7, 3);
      const dryBias = clamp((wx - 15) / 65, 0, 1) * 0.55 + clamp(1 - moisture * 1.25, 0, 0.65);

      let color: [number, number, number];

      if (h < SEA_LEVEL_NORM) {
        const depth = clamp((SEA_LEVEL_NORM - h) / SEA_LEVEL_NORM, 0, 1);
        const deepSea: [number, number, number] = [10, 32, 48];
        const shoalTeal: [number, number, number] = [32, 96, 108];
        const shoreSand: [number, number, number] = [146, 152, 128];
        color =
          depth < 0.18
            ? mixRgb(shoreSand, shoalTeal, depth / 0.18)
            : mixRgb(shoalTeal, deepSea, (depth - 0.18) / 0.82);
      } else if (h < SEA_LEVEL_NORM + 0.032) {
        // Warm golden beach sand & coastal shingle
        const t = (h - SEA_LEVEL_NORM) / 0.032;
        const sand: [number, number, number] = [176, 158, 118];
        const duneGrass: [number, number, number] = [94, 112, 68];
        color = mixRgb(sand, duneGrass, t);
      } else if (h < 0.56) {
        // Lowland & midland biomes: lush meadow, deep boreal forest, golden savanna/steppe, autumn groves
        const forestDark: [number, number, number] = [34, 62, 38];
        const meadowLush: [number, number, number] = [74, 110, 52];
        const savannaGold: [number, number, number] = [148, 126, 68];
        const terracotta: [number, number, number] = [156, 102, 62];
        const autumnAmber: [number, number, number] = [158, 92, 42];
        color = mixRgb(forestDark, meadowLush, clamp(micro * 1.25, 0, 1));
        if (dryBias > 0.25) {
          const dryCol = mixRgb(savannaGold, terracotta, clamp((dryBias - 0.4) * 1.8, 0, 1));
          color = mixRgb(color, dryCol, clamp((dryBias - 0.25) * 1.35, 0, 0.82));
        }
        if (autumnPatch > 0.56) {
          color = mixRgb(color, autumnAmber, clamp((autumnPatch - 0.56) * 2.4, 0, 0.76));
        }
      } else if (h < 0.72) {
        // Highland heather, tundra & granite
        const tundra: [number, number, number] = [88, 92, 68];
        const heather: [number, number, number] = [96, 78, 86];
        const granite: [number, number, number] = [104, 102, 98];
        const base = mixRgb(tundra, heather, clamp((autumnPatch - 0.35) * 1.6, 0, 0.65));
        color = mixRgb(base, granite, (h - 0.56) / 0.16);
      } else {
        // Alpine rock & snow
        const granite: [number, number, number] = [108, 106, 104];
        const alpine: [number, number, number] = [218, 226, 236];
        const snowWeight = clamp((h - 0.71) / 0.16 - slope * 0.35, 0, 0.92);
        color = mixRgb(granite, alpine, snowWeight);
      }

      // Steep cliff strata exposure
      if (h > SEA_LEVEL_NORM + 0.015 && slope > 0.24) {
        const cliffFactor = clamp((slope - 0.24) * 1.8, 0, 0.86);
        const cliffWarm: [number, number, number] = [98, 86, 76];
        const cliffSlate: [number, number, number] = [68, 72, 80];
        const cliffCol = mixRgb(cliffSlate, cliffWarm, dryBias);
        color = mixRgb(color, cliffCol, cliffFactor);
      }

      // Subtle warm settlement torchlight glow baked into albedo
      const glowPoints: Array<[number, number, number]> = [
        [-16, 4, 3.8], // Oakhaven
        [18, -17, 2.4], // Ashen Spire
        [11, 22, 3.0], // The Sunken Reliquary
      ];
      for (const [gx, gz, radius] of glowPoints) {
        const d2 = (wx - gx) * (wx - gx) + (wz - gz) * (wz - gz);
        const glow = Math.exp(-d2 / (radius * radius)) * (0.45 + 0.35 * micro);
        if (glow > 0.02) {
          color = mixRgb(color, [235, 168, 72], clamp(glow * 0.7, 0, 0.65));
        }
      }

      const idx = (py * resolution + px) * 4;
      aImg.data[idx] = color[0];
      aImg.data[idx + 1] = color[1];
      aImg.data[idx + 2] = color[2];
      aImg.data[idx + 3] = 255;
    }
  }

  hCtx.putImageData(hImg, 0, 0);
  aCtx.putImageData(aImg, 0, 0);

  const built: GeneratedTerrainAssets = {
    heightData,
    resolution,
    worldSize,
    heightmapDataUrl: heightCanvas.toDataURL('image/png'),
    albedoDataUrl: albedoCanvas.toDataURL('image/png'),
  };
  cachedByKey.set(key, built);
  return built;
}

/**
 * Samples the terrain height at world [x, z] coordinates using bilinear interpolation.
 */
export function sampleTerrainElevation(
  heightData: Float32Array,
  resolution: number,
  worldX: number,
  worldZ: number,
  terrainSize = TERRAIN_SIZE,
  displacementScale = DEFAULT_DISPLACEMENT
): number {
  const u = clamp(worldX / terrainSize + 0.5, 0, 1);
  const v = clamp(worldZ / terrainSize + 0.5, 0, 1);

  const fx = u * (resolution - 1);
  const fy = v * (resolution - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(resolution - 1, x0 + 1);
  const y1 = Math.min(resolution - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const h00 = heightData[y0 * resolution + x0];
  const h10 = heightData[y0 * resolution + x1];
  const h01 = heightData[y1 * resolution + x0];
  const h11 = heightData[y1 * resolution + x1];

  const h = mix(mix(h00, h10, tx), mix(h01, h11, tx), ty);
  return h * displacementScale;
}

/**
 * Extracts normalized [0..1] grayscale height data from a loaded HTMLImageElement / Canvas.
 */
export function extractHeightDataFromImage(
  image: HTMLImageElement | HTMLCanvasElement,
  resolution = 512
): Float32Array {
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d');
  const out = new Float32Array(resolution * resolution);
  if (!ctx) return out;
  ctx.drawImage(image, 0, 0, resolution, resolution);
  const imgData = ctx.getImageData(0, 0, resolution, resolution).data;
  for (let i = 0; i < out.length; i++) {
    out[i] = imgData[i * 4] / 255;
  }
  return out;
}

/**
 * Resamples an existing heightfield from oldWorldSize to newWorldSize while keeping
 * existing world-space coordinates in place, filling newly revealed outer frontier
 * with smooth procedural continuation.
 */
export function expandHeightDataToWorldSize(
  oldHeightData: Float32Array,
  oldRes: number,
  oldWorldSize: number,
  newWorldSize: number,
  newRes: number,
  seaLevelNorm = SEA_LEVEL_NORM,
  seed = 1337
): Float32Array {
  const out = new Float32Array(newRes * newRes);
  const halfOld = oldWorldSize * 0.5;
  const feather = Math.max(4, oldWorldSize * 0.08);

  for (let py = 0; py < newRes; py++) {
    const v = py / (newRes - 1);
    const wz = (v - 0.5) * newWorldSize;
    for (let px = 0; px < newRes; px++) {
      const u = px / (newRes - 1);
      const wx = (u - 0.5) * newWorldSize;

      // Distance inside the old box (>0 inside, <=0 outside)
      const dxIn = halfOld - Math.abs(wx);
      const dzIn = halfOld - Math.abs(wz);
      const insideMargin = Math.min(dxIn, dzIn);

      // Procedural continuation height in the outer ring
      const nu = wx / 100 + 0.5 + (seed % 97) * 0.13;
      const nv = wz / 100 + 0.5 + (seed % 53) * 0.19;
      const nBroad = fbm(nu * 3.2, nv * 3.2, 5);
      const nRidge = ridgedFbm(nu * 5.4 + 2.1, nv * 5.4 + 0.7, 4);
      const edgeFade = clamp(1 - Math.hypot(wx, wz) / (newWorldSize * 0.56), 0, 1);
      const procH = clamp(
        seaLevelNorm * 0.75 + edgeFade * (0.12 + nBroad * 0.24 + Math.pow(nRidge, 1.5) * 0.28),
        0.03,
        0.96
      );

      if (insideMargin <= 0) {
        out[py * newRes + px] = procH;
      } else {
        const oldH =
          sampleTerrainElevation(oldHeightData, oldRes, wx, wz, oldWorldSize, 1);
        const w = clamp(insideMargin / feather, 0, 1);
        const smoothW = w * w * (3 - 2 * w);
        out[py * newRes + px] = mix(procH, oldH, smoothW);
      }
    }
  }
  return out;
}

/**
 * Generates evocative dark-fantasy SVG cover artwork data URLs for seeded entities.
 */
export function generateEntityArtwork(
  accentHex: string,
  motif: 'harbor' | 'spire' | 'reliquary' | 'character' | 'guild' | 'scroll'
): string {
  const motifs: Record<string, string> = {
    harbor: `
      <path d="M0 135 Q60 118 120 128 T240 122 T360 132 L360 180 L0 180 Z" fill="#0d222c"/>
      <path d="M35 126 L55 78 L75 126 Z" fill="#181c24" stroke="${accentHex}" stroke-width="1"/>
      <rect x="85" y="92" width="46" height="36" fill="#141820" stroke="${accentHex}" stroke-opacity="0.6"/>
      <polygon points="82,92 108,70 134,92" fill="#1f242e" stroke="${accentHex}" stroke-width="1"/>
      <circle cx="108" cy="108" r="4" fill="#eab308"/>
      <circle cx="195" cy="112" r="3" fill="#eab308"/>
      <path d="M180 125 L195 62 L210 125 Z" fill="#181c24" stroke="${accentHex}" stroke-width="0.9"/>
      <path d="M235 125 Q280 95 340 120" fill="none" stroke="${accentHex}" stroke-opacity="0.4" stroke-dasharray="4 4"/>
    `,
    spire: `
      <polygon points="30,170 120,42 210,170" fill="#161a22" stroke="#2c3340"/>
      <polygon points="130,170 215,24 315,170" fill="#12161d" stroke="${accentHex}" stroke-opacity="0.5"/>
      <rect x="198" y="18" width="16" height="58" fill="#1b2029" stroke="${accentHex}" stroke-width="1.2"/>
      <polygon points="194,18 206,4 218,18" fill="${accentHex}"/>
      <circle cx="206" cy="34" r="9" fill="#eab308" fill-opacity="0.35"/>
      <circle cx="206" cy="34" r="3.5" fill="#fef08a"/>
    `,
    reliquary: `
      <path d="M0 130 Q90 118 180 128 T360 124 L360 180 L0 180 Z" fill="#0b1f27"/>
      <rect x="120" y="74" width="120" height="56" fill="#141922" stroke="${accentHex}" stroke-opacity="0.65"/>
      <rect x="134" y="84" width="12" height="46" fill="#232a38"/>
      <rect x="158" y="84" width="12" height="46" fill="#232a38"/>
      <rect x="190" y="84" width="12" height="46" fill="#232a38"/>
      <rect x="214" y="84" width="12" height="46" fill="#232a38"/>
      <polygon points="114,74 180,44 246,74" fill="#1c222e" stroke="${accentHex}" stroke-width="1.2"/>
      <circle cx="180" cy="102" r="14" fill="${accentHex}" fill-opacity="0.22"/>
      <circle cx="180" cy="102" r="5" fill="#facc15"/>
    `,
    character: `
      <circle cx="180" cy="70" r="34" fill="#191e27" stroke="${accentHex}" stroke-width="1.4"/>
      <path d="M120 165 C120 122 240 122 240 165" fill="#151922" stroke="${accentHex}" stroke-opacity="0.7"/>
      <circle cx="180" cy="70" r="46" fill="none" stroke="${accentHex}" stroke-opacity="0.25" stroke-dasharray="3 5"/>
      <polygon points="180,18 184,28 194,28 186,34 189,44 180,38 171,44 174,34 166,28 176,28" fill="${accentHex}" fill-opacity="0.7"/>
    `,
    guild: `
      <polygon points="180,26 238,60 220,136 140,136 122,60" fill="#141820" stroke="${accentHex}" stroke-width="1.3"/>
      <path d="M180 42 L204 92 L180 120 L156 92 Z" fill="none" stroke="${accentHex}" stroke-width="1.4"/>
      <circle cx="180" cy="84" r="8" fill="${accentHex}"/>
    `,
    scroll: `
      <rect x="75" y="34" width="210" height="112" rx="8" fill="#151921" stroke="${accentHex}" stroke-opacity="0.6"/>
      <line x1="100" y1="62" x2="260" y2="62" stroke="${accentHex}" stroke-opacity="0.45" stroke-width="2"/>
      <line x1="100" y1="84" x2="238" y2="84" stroke="#64748b" stroke-opacity="0.45" stroke-width="2"/>
      <line x1="100" y1="104" x2="220" y2="104" stroke="#64748b" stroke-opacity="0.45" stroke-width="2"/>
      <circle cx="242" cy="118" r="14" fill="#7f1d1d" stroke="${accentHex}" stroke-width="1.2"/>
    `,
  };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 180">
    <defs>
      <radialGradient id="g" cx="50%" cy="35%" r="75%">
        <stop offset="0%" stop-color="${accentHex}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#0b0d10" stop-opacity="1"/>
      </radialGradient>
    </defs>
    <rect width="360" height="180" fill="#0b0d10"/>
    <rect width="360" height="180" fill="url(#g)"/>
    ${motifs[motif] || motifs.scroll}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
