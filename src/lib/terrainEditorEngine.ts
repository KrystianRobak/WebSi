import {
  DEFAULT_DISPLACEMENT,
  SEA_LEVEL_NORM,
  TERRAIN_SIZE,
  sampleTerrainElevation,
} from './terrainGenerator';
import { BIOME_PAINT_PALETTE } from './worldEnvironment';
import {
  BiomePaintKind,
  BrushFalloff,
  MapGenerationConfig,
  MapProp,
  MapRiver,
  PathPoint,
  TerrainStampKind,
  WorldsmithTool,
} from '../types/vault';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16) || 0;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function hash2Seed(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoiseSeed(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2Seed(ix, iy, seed);
  const b = hash2Seed(ix + 1, iy, seed);
  const c = hash2Seed(ix, iy + 1, seed);
  const d = hash2Seed(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbmSeed(x: number, y: number, seed: number, octaves = 5): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * smoothNoiseSeed(x * freq, y * freq, seed + i * 13);
    freq *= 2.03;
    amp *= 0.5;
  }
  return value;
}

function ridgedSeed(x: number, y: number, seed: number, octaves = 5): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    const n = smoothNoiseSeed(x * freq, y * freq, seed + i * 29);
    const r = 1 - Math.abs(n * 2 - 1);
    value += amp * r * r;
    freq *= 2.12;
    amp *= 0.52;
  }
  return value;
}

/**
 * Evaluates a 2D Catmull-Rom spline point at parameter t in [0..1].
 */
export function evalSplinePoint(points: PathPoint[], t: number): PathPoint {
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  if (points.length === 1) return points[0];
  const n = points.length - 1;
  const scaled = clamp(t, 0, 1) * n;
  const idx = Math.min(n - 1, Math.floor(scaled));
  const f = scaled - idx;

  const p0 = points[Math.max(0, idx - 1)];
  const p1 = points[idx];
  const p2 = points[Math.min(n, idx + 1)];
  const p3 = points[Math.min(n, idx + 2)];

  const f2 = f * f;
  const f3 = f2 * f;

  const interp = (a: number, b: number, c: number, d: number) =>
    0.5 *
    (2 * b +
      (-a + c) * f +
      (2 * a - 5 * b + 4 * c - d) * f2 +
      (-a + 3 * b - 3 * c + d) * f3);

  return {
    x: interp(p0.x, p1.x, p2.x, p3.x),
    y: interp(p0.y, p1.y, p2.y, p3.y),
    z: interp(p0.z, p1.z, p2.z, p3.z),
  };
}

/**
 * Carves a river channel & valley banks along a spline, enforcing monotonic downstream flow.
 */
export function carveRiverIntoHeightData(
  heightData: Float32Array,
  resolution: number,
  river: MapRiver,
  displacementScale = DEFAULT_DISPLACEMENT,
  seaLevelNorm = SEA_LEVEL_NORM,
  terrainSize = TERRAIN_SIZE
): void {
  if (river.points.length < 2) return;
  const samples = 90;
  const sampled: Array<{ x: number; z: number; hNorm: number }> = [];

  for (let i = 0; i <= samples; i++) {
    const pt = evalSplinePoint(river.points, i / samples);
    const curY = sampleTerrainElevation(
      heightData,
      resolution,
      pt.x,
      pt.z,
      terrainSize,
      displacementScale
    );
    const curH = curY / Math.max(displacementScale, 0.001);
    sampled.push({ x: pt.x, z: pt.z, hNorm: curH });
  }

  // Enforce monotonically non-increasing elevation downstream
  let runningH = Math.max(sampled[0].hNorm - 0.02, seaLevelNorm + 0.04);
  for (let i = 0; i < sampled.length; i++) {
    const targetBed = Math.max(
      seaLevelNorm - 0.035,
      Math.min(runningH, sampled[i].hNorm - river.depth / Math.max(displacementScale, 1))
    );
    runningH = targetBed;
    sampled[i].hNorm = runningH;
  }

  const bankRadius = river.width * 2.4;
  const pxPerUnit = (resolution - 1) / terrainSize;

  for (const s of sampled) {
    const cx = Math.round((s.x / terrainSize + 0.5) * (resolution - 1));
    const cz = Math.round((s.z / terrainSize + 0.5) * (resolution - 1));
    const rPx = Math.ceil(bankRadius * pxPerUnit);

    const minX = Math.max(0, cx - rPx);
    const maxX = Math.min(resolution - 1, cx + rPx);
    const minZ = Math.max(0, cz - rPx);
    const maxZ = Math.min(resolution - 1, cz + rPx);

    for (let pz = minZ; pz <= maxZ; pz++) {
      const wz = (pz / (resolution - 1) - 0.5) * terrainSize;
      for (let px = minX; px <= maxX; px++) {
        const wx = (px / (resolution - 1) - 0.5) * terrainSize;
        const dist = Math.hypot(wx - s.x, wz - s.z);
        if (dist > bankRadius) continue;

        const t = dist / bankRadius;
        const w = Math.pow(1 - t * t, 2);
        const idx = pz * resolution + px;
        const carved = Math.min(heightData[idx], mix(heightData[idx], s.hNorm, w));
        heightData[idx] = clamp(carved, 0.02, 0.99);
      }
    }
  }
}

/**
 * Generates an albedo canvas & PNG data URL directly from heightData (plus optional biome paint).
 */
export function buildTexturesFromHeightData(
  heightData: Float32Array,
  resolution: number,
  seaLevelNorm = SEA_LEVEL_NORM,
  paintData?: Uint8Array | null,
  paintRes = 256
): { heightmapDataUrl: string; albedoDataUrl: string; paintDataUrl?: string } {
  const hCanvas = document.createElement('canvas');
  hCanvas.width = resolution;
  hCanvas.height = resolution;
  const hCtx = hCanvas.getContext('2d')!;
  const hImg = hCtx.createImageData(resolution, resolution);

  const aCanvas = document.createElement('canvas');
  aCanvas.width = resolution;
  aCanvas.height = resolution;
  const aCtx = aCanvas.getContext('2d')!;
  const aImg = aCtx.createImageData(resolution, resolution);

  for (let py = 0; py < resolution; py++) {
    const v = py / (resolution - 1);
    for (let px = 0; px < resolution; px++) {
      const u = px / (resolution - 1);
      const idx = py * resolution + px;
      const h = clamp(heightData[idx], 0, 1);

      const byte = Math.round(h * 255);
      const pIdx = idx * 4;
      hImg.data[pIdx] = byte;
      hImg.data[pIdx + 1] = byte;
      hImg.data[pIdx + 2] = byte;
      hImg.data[pIdx + 3] = 255;

      const micro = fbmSeed(u * 24, v * 24, 17, 3);
      const autumn = fbmSeed(u * 9 + 4.1, v * 9 + 1.3, 41, 3);
      const moisture = fbmSeed(u * 3.6 + 8.1, v * 3.6 + 2.3, 73, 3);

      let r = 52;
      let g = 88;
      let b = 46;

      if (h < seaLevelNorm) {
        const d = clamp((seaLevelNorm - h) / Math.max(seaLevelNorm, 0.01), 0, 1);
        r = Math.round(mix(124, 10, d));
        g = Math.round(mix(142, 32, d));
        b = Math.round(mix(126, 48, d));
      } else if (h < seaLevelNorm + 0.032) {
        const t = (h - seaLevelNorm) / 0.032;
        r = Math.round(mix(178, 86, t));
        g = Math.round(mix(160, 108, t));
        b = Math.round(mix(118, 62, t));
      } else if (h < 0.56) {
        r = Math.round(mix(36, 78, micro));
        g = Math.round(mix(64, 114, micro));
        b = Math.round(mix(38, 54, micro));
        if (moisture < 0.42) {
          const dryT = clamp((0.42 - moisture) * 2.1, 0, 0.8);
          r = Math.round(mix(r, 152, dryT));
          g = Math.round(mix(g, 128, dryT));
          b = Math.round(mix(b, 70, dryT));
        }
        if (autumn > 0.56) {
          const at = clamp((autumn - 0.56) * 2.2, 0, 0.72);
          r = Math.round(mix(r, 156, at));
          g = Math.round(mix(g, 92, at));
          b = Math.round(mix(b, 42, at));
        }
      } else if (h < 0.72) {
        const t = clamp((h - 0.56) / 0.16, 0, 1);
        r = Math.round(mix(88, 106, t));
        g = Math.round(mix(92, 104, t));
        b = Math.round(mix(68, 100, t));
      } else {
        const t = clamp((h - 0.72) / 0.2, 0, 1);
        r = Math.round(mix(108, 224, t));
        g = Math.round(mix(106, 232, t));
        b = Math.round(mix(104, 240, t));
      }

      if (paintData && paintData.length === paintRes * paintRes * 4) {
        const qx = Math.min(paintRes - 1, Math.floor(u * (paintRes - 1)));
        const qy = Math.min(paintRes - 1, Math.floor(v * (paintRes - 1)));
        const qIdx = (qy * paintRes + qx) * 4;
        const pa = paintData[qIdx + 3] / 255;
        if (pa > 0.01) {
          r = Math.round(mix(r, paintData[qIdx], pa));
          g = Math.round(mix(g, paintData[qIdx + 1], pa));
          b = Math.round(mix(b, paintData[qIdx + 2], pa));
        }
      }

      aImg.data[pIdx] = r;
      aImg.data[pIdx + 1] = g;
      aImg.data[pIdx + 2] = b;
      aImg.data[pIdx + 3] = 255;
    }
  }

  hCtx.putImageData(hImg, 0, 0);
  aCtx.putImageData(aImg, 0, 0);

  let paintDataUrl: string | undefined;
  if (paintData && paintData.length === paintRes * paintRes * 4) {
    let anyPaint = false;
    for (let i = 3; i < paintData.length; i += 4) {
      if (paintData[i] > 0) {
        anyPaint = true;
        break;
      }
    }
    if (anyPaint) {
      const pCanvas = document.createElement('canvas');
      pCanvas.width = paintRes;
      pCanvas.height = paintRes;
      const pCtx = pCanvas.getContext('2d')!;
      const pImg = pCtx.createImageData(paintRes, paintRes);
      pImg.data.set(paintData);
      pCtx.putImageData(pImg, 0, 0);
      paintDataUrl = pCanvas.toDataURL('image/png');
    }
  }

  return {
    heightmapDataUrl: hCanvas.toDataURL('image/png'),
    albedoDataUrl: aCanvas.toDataURL('image/png'),
    paintDataUrl,
  };
}

/**
 * Generates a custom terrain + rivers + editable 3D props from user parameters.
 */
export function generateCustomTerrain(
  config: MapGenerationConfig,
  resolution = 512,
  displacementScale = DEFAULT_DISPLACEMENT
): {
  heightData: Float32Array;
  heightmapDataUrl: string;
  albedoDataUrl: string;
  rivers: MapRiver[];
  props: MapProp[];
} {
  const heightData = new Float32Array(resolution * resolution);
  const { seed, archetype, continentScale, ridgeSharpness, seaLevel, valleyDepth } = config;
  const worldSize = config.worldSize || TERRAIN_SIZE;

  for (let py = 0; py < resolution; py++) {
    const v = py / (resolution - 1);
    const nv = v - 0.5;
    for (let px = 0; px < resolution; px++) {
      const u = px / (resolution - 1);
      const nu = u - 0.5;
      const distCenter = Math.hypot(nu, nv) * 2;

      const base = fbmSeed(u * continentScale * 3.8, v * continentScale * 3.8, seed, 5);
      const ridges = ridgedSeed(
        u * continentScale * 5.6 + 2.3,
        v * continentScale * 5.6 + 1.1,
        seed + 7,
        5
      );
      const valley = fbmSeed(u * 2.2 + 5.1, v * 2.2 + 3.7, seed + 19, 3);

      let h = 0.14 + base * 0.34 + Math.pow(ridges, 1.35) * (0.26 * ridgeSharpness);

      if (archetype === 'blank') {
        h = seaLevel + 0.05 + (base - 0.5) * 0.04;
      } else if (archetype === 'archipelago') {
        const islands = Math.pow(ridges, 1.75) * 0.42;
        h = 0.08 + base * 0.24 + islands - distCenter * 0.18;
      } else if (archetype === 'fjord') {
        const northWall = clamp((0.55 - v) * 1.4, 0, 1);
        const fjordCut = Math.exp(-Math.pow(nu * 6.5, 2)) * clamp(v * 1.4, 0, 1) * 0.34;
        h += northWall * 0.36 * ridgeSharpness - fjordCut;
      } else if (archetype === 'basin') {
        const rim = clamp((distCenter - 0.35) * 1.15, 0, 1);
        h += rim * 0.35 * ridgeSharpness - (1 - rim) * 0.14 * valleyDepth;
      } else if (archetype === 'caldera') {
        const ring = Math.exp(-Math.pow((distCenter - 0.52) / 0.19, 2));
        const crater = Math.exp(-Math.pow(distCenter / 0.28, 2));
        h = 0.10 + base * 0.22 + ring * 0.54 * ridgeSharpness - crater * 0.32;
      } else if (archetype === 'continent') {
        const contMask = clamp(1 - Math.pow(distCenter * 0.88, 2.2), 0, 1);
        const spine = Math.exp(-Math.pow((nu - Math.sin(v * 4.5) * 0.18) * 3.8, 2));
        h =
          0.06 +
          contMask *
            (0.28 + base * 0.26 + Math.pow(ridges, 1.3) * (0.22 + spine * 0.28) * ridgeSharpness);
      } else {
        // peninsula
        const penMask = clamp(1 - Math.hypot(nu * 1.15, (nv + 0.12) * 1.25) * 1.35, 0, 1);
        h = 0.07 + penMask * (0.34 + base * 0.26 + ridges * 0.35 * ridgeSharpness);
      }

      if (archetype !== 'blank' && valley > 0.55) {
        h -= (valley - 0.55) * 0.48 * valleyDepth;
      }

      heightData[py * resolution + px] = clamp(h, 0.02, 0.99);
    }
  }

  // Generate downstream rivers if requested
  const rivers: MapRiver[] = [];
  const spanScale = worldSize / 100;
  for (let r = 0; r < config.riverCount; r++) {
    const startX = (hash2Seed(r + 1, 3, seed) - 0.5) * 56 * spanScale;
    const startZ = (-30 + hash2Seed(r + 2, 7, seed) * 24) * spanScale;
    const pts: PathPoint[] = [];
    let curX = startX;
    let curZ = startZ;

    for (let step = 0; step < 6; step++) {
      const y = sampleTerrainElevation(
        heightData,
        resolution,
        curX,
        curZ,
        worldSize,
        displacementScale
      );
      pts.push({ x: curX, y, z: curZ });
      curX += (hash2Seed(r * 10 + step, 19, seed) - 0.55) * 10 * spanScale;
      curZ += (8 + hash2Seed(r * 10 + step, 23, seed) * 6) * spanScale;
      if (curZ > 44 * spanScale) break;
    }

    const river: MapRiver = {
      id: `river-${seed}-${r}`,
      name: `River ${r + 1}`,
      points: pts,
      width: 1.55,
      depth: 1.25,
    };
    carveRiverIntoHeightData(heightData, resolution, river, displacementScale, seaLevel, worldSize);
    rivers.push(river);
  }

  // Scatter initial editable trees & boulders
  const props: MapProp[] = [];
  const areaFactor = Math.min(2.6, Math.pow(worldSize / 100, 1.4));
  const targetTrees = Math.round(config.treeDensity * 380 * areaFactor);
  const targetRocks = Math.round(config.rockDensity * 120 * areaFactor);
  const seaY = seaLevel * displacementScale;

  for (let i = 0; i < 3200 && props.length < targetTrees; i++) {
    const rx = (hash2Seed(i, 1, seed + 101) - 0.5) * worldSize * 0.9;
    const rz = (hash2Seed(i, 2, seed + 101) - 0.5) * worldSize * 0.9;
    const y = sampleTerrainElevation(heightData, resolution, rx, rz, worldSize, displacementScale);
    const hNorm = y / Math.max(displacementScale, 0.001);
    if (y < seaY + 0.55 || hNorm > 0.56) continue;

    const yX = sampleTerrainElevation(
      heightData,
      resolution,
      rx + 0.6,
      rz,
      worldSize,
      displacementScale
    );
    const yZ = sampleTerrainElevation(
      heightData,
      resolution,
      rx,
      rz + 0.6,
      worldSize,
      displacementScale
    );
    const slope = Math.hypot(yX - y, yZ - y) / 0.6;
    if (slope > 0.36) continue;

    const kind = hash2Seed(i, 5, seed + 211) > 0.72 ? 'oak' : 'pine';
    props.push({
      id: `prop-tree-${seed}-${i}`,
      kind,
      x: Number(rx.toFixed(2)),
      y: Number(y.toFixed(2)),
      z: Number(rz.toFixed(2)),
      rotY: Number((hash2Seed(i, 9, seed) * Math.PI * 2).toFixed(2)),
      scale: Number((0.55 + hash2Seed(i, 11, seed) * 0.55).toFixed(2)),
    });
  }

  let rockCount = 0;
  for (let i = 0; i < 1600 && rockCount < targetRocks; i++) {
    const rx = (hash2Seed(i, 3, seed + 303) - 0.5) * worldSize * 0.92;
    const rz = (hash2Seed(i, 4, seed + 303) - 0.5) * worldSize * 0.92;
    const y = sampleTerrainElevation(heightData, resolution, rx, rz, worldSize, displacementScale);
    if (y < seaY - 0.1 || y > displacementScale * 0.74) continue;
    rockCount++;
    props.push({
      id: `prop-rock-${seed}-${i}`,
      kind: 'boulder',
      x: Number(rx.toFixed(2)),
      y: Number(y.toFixed(2)),
      z: Number(rz.toFixed(2)),
      rotY: Number((hash2Seed(i, 13, seed) * Math.PI * 2).toFixed(2)),
      scale: Number((0.45 + hash2Seed(i, 17, seed) * 0.65).toFixed(2)),
    });
  }

  const { heightmapDataUrl, albedoDataUrl } = buildTexturesFromHeightData(
    heightData,
    resolution,
    seaLevel
  );

  return { heightData, heightmapDataUrl, albedoDataUrl, rivers, props };
}

export interface TerrainBrushOptions {
  tool: WorldsmithTool;
  radius: number;
  strength: number;
  falloff: BrushFalloff;
  targetHeightNorm?: number;
  seaLevelNorm?: number;
  invert?: boolean;
  terrainSize?: number;
  terraceSteps?: number;
  strokeDir?: { x: number; z: number } | null;
}

/**
 * Applies a terrain sculpting brush stroke onto heightData and returns modified world bounds.
 */
export function applyTerrainBrush(
  heightData: Float32Array,
  resolution: number,
  worldX: number,
  worldZ: number,
  opts: TerrainBrushOptions
): { minWx: number; maxWx: number; minWz: number; maxWz: number } {
  const terrainSize = opts.terrainSize || TERRAIN_SIZE;
  const pxPerUnit = (resolution - 1) / terrainSize;
  const cx = Math.round((worldX / terrainSize + 0.5) * (resolution - 1));
  const cz = Math.round((worldZ / terrainSize + 0.5) * (resolution - 1));
  const rPx = Math.max(1, Math.ceil(opts.radius * pxPerUnit));

  const minX = Math.max(1, cx - rPx);
  const maxX = Math.min(resolution - 2, cx + rPx);
  const minZ = Math.max(1, cz - rPx);
  const maxZ = Math.min(resolution - 2, cz + rPx);

  const deltaAmp = 0.028 * opts.strength * (opts.invert ? -1 : 1);
  const copy = opts.tool === 'smooth' || opts.tool === 'erode' ? heightData.slice() : null;
  const steps = Math.max(3, opts.terraceSteps || 8);

  // Unit tangent / normal for directional ridge brush
  let dirX = opts.strokeDir?.x ?? 0.707;
  let dirZ = opts.strokeDir?.z ?? 0.707;
  const dirLen = Math.hypot(dirX, dirZ) || 1;
  dirX /= dirLen;
  dirZ /= dirLen;
  const perpX = -dirZ;
  const perpZ = dirX;

  for (let pz = minZ; pz <= maxZ; pz++) {
    const wz = (pz / (resolution - 1) - 0.5) * terrainSize;
    for (let px = minX; px <= maxX; px++) {
      const wx = (px / (resolution - 1) - 0.5) * terrainSize;
      const dx = wx - worldX;
      const dz = wz - worldZ;
      const dist = Math.hypot(dx, dz);
      if (dist > opts.radius) continue;

      const t = dist / opts.radius;
      let weight = Math.pow(1 - t * t, 2);
      if (opts.falloff === 'peak') {
        weight = Math.pow(1 - t, 2.2);
      } else if (opts.falloff === 'plateau') {
        weight = t < 0.55 ? 1 : Math.pow(1 - (t - 0.55) / 0.45, 2);
      }

      const idx = pz * resolution + px;
      let next = heightData[idx];

      if (opts.tool === 'raise') {
        const ridgeGrit = 0.72 + 0.56 * smoothNoiseSeed(wx * 0.45, wz * 0.45, 9);
        next += deltaAmp * weight * ridgeGrit;
      } else if (opts.tool === 'valley') {
        next -= deltaAmp * weight * 1.1;
      } else if (opts.tool === 'flatten') {
        const target = opts.targetHeightNorm ?? SEA_LEVEL_NORM + 0.08;
        next = mix(next, target, clamp(opts.strength * 0.45 * weight, 0, 1));
      } else if (opts.tool === 'smooth' && copy) {
        const avg =
          (copy[idx] * 2 +
            copy[idx - 1] +
            copy[idx + 1] +
            copy[idx - resolution] +
            copy[idx + resolution] +
            copy[idx - resolution - 1] * 0.5 +
            copy[idx - resolution + 1] * 0.5 +
            copy[idx + resolution - 1] * 0.5 +
            copy[idx + resolution + 1] * 0.5) /
          8;
        next = mix(next, avg, clamp(opts.strength * 0.72 * weight, 0, 1));
      } else if (opts.tool === 'coast') {
        const seaTarget = (opts.seaLevelNorm ?? SEA_LEVEL_NORM) - (opts.invert ? -0.06 : 0.08);
        next = mix(next, seaTarget, clamp(opts.strength * 0.4 * weight, 0, 1));
      } else if (opts.tool === 'ridge') {
        // Sharp spine along stroke direction with ridged noise
        const across = Math.abs(dx * perpX + dz * perpZ) / Math.max(opts.radius * 0.55, 0.25);
        const along = Math.abs(dx * dirX + dz * dirZ) / Math.max(opts.radius, 0.25);
        const crest = Math.max(0, 1 - across) * Math.max(0, 1 - along * along);
        const craggy = 0.65 + 0.7 * ridgedSeed(wx * 0.22, wz * 0.22, 31, 3);
        next += deltaAmp * 1.45 * Math.pow(crest, 1.4) * craggy;
      } else if (opts.tool === 'noise') {
        const r = ridgedSeed(wx * 0.26, wz * 0.26, 53, 4) - 0.42;
        next += deltaAmp * 1.6 * weight * r;
      } else if (opts.tool === 'terrace') {
        const quantized = Math.round(next * steps) / steps;
        next = mix(next, quantized, clamp(opts.strength * 0.55 * weight, 0, 1));
      } else if (opts.tool === 'erode' && copy) {
        // Local thermal + hydraulic gully relaxation
        const nL = copy[idx - 1];
        const nR = copy[idx + 1];
        const nU = copy[idx - resolution];
        const nD = copy[idx + resolution];
        const minN = Math.min(nL, nR, nU, nD);
        const avgN = (nL + nR + nU + nD) * 0.25;
        const slope = Math.max(0, copy[idx] - minN);
        const talus = 0.006;
        if (slope > talus) {
          const gully = smoothNoiseSeed(wx * 0.55, wz * 0.55, 79);
          const drop = (slope - talus) * (0.35 + 0.4 * gully) * opts.strength * weight;
          next = mix(copy[idx] - drop, avgN, 0.25 * weight * opts.strength);
        } else {
          next = mix(copy[idx], avgN, 0.18 * weight * opts.strength);
        }
      }

      heightData[idx] = clamp(next, 0.02, 0.99);
    }
  }

  return {
    minWx: worldX - opts.radius - 1,
    maxWx: worldX + opts.radius + 1,
    minWz: worldZ - opts.radius - 1,
    maxWz: worldZ + opts.radius + 1,
  };
}

/**
 * Stamps a parametric landform (mountain, volcano, crater, mesa, island, lake, canyon) at (worldX, worldZ).
 */
export function applyTerrainStamp(
  heightData: Float32Array,
  resolution: number,
  worldX: number,
  worldZ: number,
  opts: {
    stamp: TerrainStampKind;
    radius: number;
    strength: number;
    seaLevelNorm?: number;
    terrainSize?: number;
    invert?: boolean;
    seed?: number;
  }
): void {
  const terrainSize = opts.terrainSize || TERRAIN_SIZE;
  const sea = opts.seaLevelNorm ?? SEA_LEVEL_NORM;
  const seed = opts.seed ?? Math.round((worldX + 500) * 13 + (worldZ + 500) * 31);
  const pxPerUnit = (resolution - 1) / terrainSize;
  const cx = Math.round((worldX / terrainSize + 0.5) * (resolution - 1));
  const cz = Math.round((worldZ / terrainSize + 0.5) * (resolution - 1));
  const rPx = Math.max(2, Math.ceil(opts.radius * pxPerUnit));

  const minX = Math.max(1, cx - rPx);
  const maxX = Math.min(resolution - 2, cx + rPx);
  const minZ = Math.max(1, cz - rPx);
  const maxZ = Math.min(resolution - 2, cz + rPx);
  const sign = opts.invert ? -1 : 1;
  const amp = clamp(opts.strength, 0.1, 1.5);

  const angle = hash2Seed(worldX, worldZ, seed) * Math.PI;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  for (let pz = minZ; pz <= maxZ; pz++) {
    const wz = (pz / (resolution - 1) - 0.5) * terrainSize;
    for (let px = minX; px <= maxX; px++) {
      const wx = (px / (resolution - 1) - 0.5) * terrainSize;
      const dx = wx - worldX;
      const dz = wz - worldZ;
      const dist = Math.hypot(dx, dz);
      if (dist > opts.radius) continue;

      const t = dist / opts.radius; // 0 at center, 1 at rim
      const idx = pz * resolution + px;
      const cur = heightData[idx];
      const ridge = ridgedSeed(wx * 0.24, wz * 0.24, seed, 4);
      const detail = fbmSeed(wx * 0.35, wz * 0.35, seed + 17, 3);
      let next = cur;

      if (opts.stamp === 'mountain') {
        const cone = Math.pow(1 - t, 1.75) * (0.55 + 0.65 * ridge);
        next = cur + sign * cone * 0.42 * amp;
      } else if (opts.stamp === 'volcano') {
        const cone = Math.pow(1 - t * t, 1.45) * (0.75 + 0.35 * ridge);
        const crater = t < 0.34 ? Math.pow(1 - t / 0.34, 1.8) * 0.58 : 0;
        next = cur + sign * (cone - crater) * 0.48 * amp;
      } else if (opts.stamp === 'crater') {
        const bowl = t < 0.68 ? -Math.pow(1 - (t / 0.68) * (t / 0.68), 1.4) * 0.28 : 0;
        const rim = Math.exp(-Math.pow((t - 0.72) / 0.14, 2)) * 0.12 * (0.7 + 0.5 * detail);
        next = cur + sign * (bowl + rim) * amp;
      } else if (opts.stamp === 'mesa') {
        const plateau =
          t < 0.56
            ? 1
            : t < 0.85
            ? Math.pow(1 - (t - 0.56) / 0.29, 2.4)
            : 0;
        const strata = Math.round(plateau * 5) / 5;
        const target = Math.max(cur, sea + 0.18) + 0.26 * amp;
        next = mix(cur, target - (1 - strata) * 0.24 * amp, plateau * (0.85 + 0.15 * detail));
      } else if (opts.stamp === 'island') {
        const falloff = Math.pow(1 - t * t, 1.8);
        const target = sea + 0.06 + (0.14 + 0.22 * ridge) * amp * falloff;
        next = mix(cur, Math.max(cur, target), falloff);
      } else if (opts.stamp === 'lake') {
        const falloff = Math.pow(1 - t * t, 1.8);
        const target = Math.max(0.03, sea - 0.12 * amp);
        next = mix(cur, Math.min(cur, target), falloff);
      } else if (opts.stamp === 'canyon') {
        const rx = dx * cosA - dz * sinA;
        const rz = dx * sinA + dz * cosA;
        const meander = Math.sin((rx / opts.radius) * Math.PI * 1.5) * opts.radius * 0.16;
        const cross = Math.abs(rz - meander) / (opts.radius * 0.34);
        const along = 1 - Math.pow(rx / opts.radius, 2);
        if (cross < 1 && along > 0) {
          const wall = Math.pow(1 - cross * cross, 2.2) * along;
          next = cur - sign * wall * 0.28 * amp;
        }
      }

      heightData[idx] = clamp(next, 0.02, 0.99);
    }
  }
}

/**
 * Applies a biome color paint brush stroke onto the RGBA paint buffer.
 */
export function applyBiomePaintBrush(
  paintData: Uint8Array,
  paintRes: number,
  worldX: number,
  worldZ: number,
  opts: {
    biome: BiomePaintKind;
    radius: number;
    strength: number;
    falloff: BrushFalloff;
    terrainSize?: number;
    invert?: boolean;
  }
): void {
  const terrainSize = opts.terrainSize || TERRAIN_SIZE;
  const pxPerUnit = (paintRes - 1) / terrainSize;
  const cx = Math.round((worldX / terrainSize + 0.5) * (paintRes - 1));
  const cz = Math.round((worldZ / terrainSize + 0.5) * (paintRes - 1));
  const rPx = Math.max(1, Math.ceil(opts.radius * pxPerUnit));

  const minX = Math.max(0, cx - rPx);
  const maxX = Math.min(paintRes - 1, cx + rPx);
  const minZ = Math.max(0, cz - rPx);
  const maxZ = Math.min(paintRes - 1, cz + rPx);

  const entry = BIOME_PAINT_PALETTE.find((b) => b.kind === opts.biome) || BIOME_PAINT_PALETTE[0];
  const [tr, tg, tb] = hexToRgb(entry.color);
  const isErase = opts.biome === 'erase' || Boolean(opts.invert);

  for (let pz = minZ; pz <= maxZ; pz++) {
    const wz = (pz / (paintRes - 1) - 0.5) * terrainSize;
    for (let px = minX; px <= maxX; px++) {
      const wx = (px / (paintRes - 1) - 0.5) * terrainSize;
      const dist = Math.hypot(wx - worldX, wz - worldZ);
      if (dist > opts.radius) continue;

      const t = dist / opts.radius;
      let weight = Math.pow(1 - t * t, 2);
      if (opts.falloff === 'peak') weight = Math.pow(1 - t, 2);
      else if (opts.falloff === 'plateau') weight = t < 0.6 ? 1 : Math.pow(1 - (t - 0.6) / 0.4, 2);

      const pIdx = (pz * paintRes + px) * 4;
      const curA = paintData[pIdx + 3] / 255;

      if (isErase) {
        const nextA = Math.max(0, curA - weight * opts.strength * 0.45);
        paintData[pIdx + 3] = Math.round(nextA * 255);
      } else {
        const blend = clamp(weight * opts.strength * 0.42, 0, 1);
        const nextA = clamp(curA + blend * (1 - curA * 0.5), 0, 0.95);
        const colorMix = curA < 0.02 ? 1 : clamp(blend / Math.max(nextA, 0.05), 0, 1);
        paintData[pIdx] = Math.round(mix(paintData[pIdx], tr, colorMix));
        paintData[pIdx + 1] = Math.round(mix(paintData[pIdx + 1], tg, colorMix));
        paintData[pIdx + 2] = Math.round(mix(paintData[pIdx + 2], tb, colorMix));
        paintData[pIdx + 3] = Math.round(nextA * 255);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                        Global landscape operations                         */
/* -------------------------------------------------------------------------- */

export function applyGlobalBlankTerrain(
  heightData: Float32Array,
  resolution: number,
  mode: 'plains' | 'ocean' | 'hills',
  seaLevelNorm = SEA_LEVEL_NORM,
  seed = 101
): void {
  for (let py = 0; py < resolution; py++) {
    const v = py / (resolution - 1);
    for (let px = 0; px < resolution; px++) {
      const u = px / (resolution - 1);
      const n = fbmSeed(u * 4.2, v * 4.2, seed, 4);
      let h = seaLevelNorm + 0.05;
      if (mode === 'ocean') {
        h = Math.max(0.03, seaLevelNorm - 0.11 + (n - 0.5) * 0.04);
      } else if (mode === 'plains') {
        h = seaLevelNorm + 0.055 + (n - 0.5) * 0.035;
      } else {
        const r = ridgedSeed(u * 5.2, v * 5.2, seed + 19, 4);
        h = seaLevelNorm + 0.04 + n * 0.22 + r * 0.16;
      }
      heightData[py * resolution + px] = clamp(h, 0.02, 0.99);
    }
  }
}

export function applyGlobalSmooth(
  heightData: Float32Array,
  resolution: number,
  strength = 0.5
): void {
  const copy = heightData.slice();
  const k = clamp(strength, 0.05, 1);
  for (let py = 1; py < resolution - 1; py++) {
    for (let px = 1; px < resolution - 1; px++) {
      const idx = py * resolution + px;
      const avg =
        (copy[idx] * 2 +
          copy[idx - 1] +
          copy[idx + 1] +
          copy[idx - resolution] +
          copy[idx + resolution]) /
        6;
      heightData[idx] = mix(copy[idx], avg, k);
    }
  }
}

export function applyGlobalThermalErosion(
  heightData: Float32Array,
  resolution: number,
  iterations = 6
): void {
  const talus = 0.0045;
  const temp = new Float32Array(heightData.length);
  for (let iter = 0; iter < iterations; iter++) {
    temp.set(heightData);
    for (let py = 1; py < resolution - 1; py++) {
      for (let px = 1; px < resolution - 1; px++) {
        const idx = py * resolution + px;
        const h = temp[idx];
        const nL = temp[idx - 1];
        const nR = temp[idx + 1];
        const nU = temp[idx - resolution];
        const nD = temp[idx + resolution];
        const minN = Math.min(nL, nR, nU, nD);
        const maxN = Math.max(nL, nR, nU, nD);
        const avgN = (nL + nR + nU + nD) * 0.25;
        if (h - minN > talus) {
          heightData[idx] = clamp(h - (h - minN - talus) * 0.35, 0.02, 0.99);
        } else if (maxN - h > talus) {
          heightData[idx] = clamp(mix(h, avgN, 0.22), 0.02, 0.99);
        }
      }
    }
  }
}

export function applyGlobalNoiseDetail(
  heightData: Float32Array,
  resolution: number,
  amount = 0.05,
  seed = 77
): void {
  for (let py = 0; py < resolution; py++) {
    const v = py / (resolution - 1);
    for (let px = 0; px < resolution; px++) {
      const u = px / (resolution - 1);
      const idx = py * resolution + px;
      const r = ridgedSeed(u * 14, v * 14, seed, 4) - 0.45;
      heightData[idx] = clamp(heightData[idx] + r * amount, 0.02, 0.99);
    }
  }
}

export function applyGlobalHeightOffset(heightData: Float32Array, deltaNorm: number): void {
  for (let i = 0; i < heightData.length; i++) {
    heightData[i] = clamp(heightData[i] + deltaNorm, 0.02, 0.99);
  }
}
