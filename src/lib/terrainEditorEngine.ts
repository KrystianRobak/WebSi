import {
  DEFAULT_DISPLACEMENT,
  SEA_LEVEL_NORM,
  TERRAIN_SIZE,
  sampleTerrainElevation,
} from './terrainGenerator';
import {
  BrushFalloff,
  MapGenerationConfig,
  MapProp,
  MapRiver,
  PathPoint,
  WorldsmithTool,
} from '../types/vault';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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
  seaLevelNorm = SEA_LEVEL_NORM
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
      TERRAIN_SIZE,
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
  const pxPerUnit = (resolution - 1) / TERRAIN_SIZE;

  for (const s of sampled) {
    const cx = Math.round((s.x / TERRAIN_SIZE + 0.5) * (resolution - 1));
    const cz = Math.round((s.z / TERRAIN_SIZE + 0.5) * (resolution - 1));
    const rPx = Math.ceil(bankRadius * pxPerUnit);

    const minX = Math.max(0, cx - rPx);
    const maxX = Math.min(resolution - 1, cx + rPx);
    const minZ = Math.max(0, cz - rPx);
    const maxZ = Math.min(resolution - 1, cz + rPx);

    for (let pz = minZ; pz <= maxZ; pz++) {
      const wz = (pz / (resolution - 1) - 0.5) * TERRAIN_SIZE;
      for (let px = minX; px <= maxX; px++) {
        const wx = (px / (resolution - 1) - 0.5) * TERRAIN_SIZE;
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
 * Generates an albedo canvas & PNG data URL directly from heightData.
 */
export function buildTexturesFromHeightData(
  heightData: Float32Array,
  resolution: number,
  seaLevelNorm = SEA_LEVEL_NORM
): { heightmapDataUrl: string; albedoDataUrl: string } {
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

      let r = 34;
      let g = 50;
      let b = 33;

      if (h < seaLevelNorm) {
        const d = clamp((seaLevelNorm - h) / Math.max(seaLevelNorm, 0.01), 0, 1);
        r = Math.round(mix(56, 10, d));
        g = Math.round(mix(104, 24, d));
        b = Math.round(mix(110, 34, d));
      } else if (h < seaLevelNorm + 0.03) {
        const t = (h - seaLevelNorm) / 0.03;
        r = Math.round(mix(58, 36, t));
        g = Math.round(mix(66, 48, t));
        b = Math.round(mix(64, 38, t));
      } else if (h < 0.56) {
        r = Math.round(mix(24, 44, micro));
        g = Math.round(mix(40, 64, micro));
        b = Math.round(mix(26, 38, micro));
        if (autumn > 0.58) {
          const at = clamp((autumn - 0.58) * 2.2, 0, 0.65);
          r = Math.round(mix(r, 114, at));
          g = Math.round(mix(g, 74, at));
          b = Math.round(mix(b, 34, at));
        }
      } else {
        const t = clamp((h - 0.56) / 0.34, 0, 1);
        r = Math.round(mix(44, 118, t));
        g = Math.round(mix(52, 125, t));
        b = Math.round(mix(54, 136, t));
      }

      aImg.data[pIdx] = r;
      aImg.data[pIdx + 1] = g;
      aImg.data[pIdx + 2] = b;
      aImg.data[pIdx + 3] = 255;
    }
  }

  hCtx.putImageData(hImg, 0, 0);
  aCtx.putImageData(aImg, 0, 0);

  return {
    heightmapDataUrl: hCanvas.toDataURL('image/png'),
    albedoDataUrl: aCanvas.toDataURL('image/png'),
  };
}

/**
 * Generates a custom 512x512 terrain + rivers + editable 3D props from user parameters.
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

  for (let py = 0; py < resolution; py++) {
    const v = py / (resolution - 1);
    const nv = v - 0.5;
    for (let px = 0; px < resolution; px++) {
      const u = px / (resolution - 1);
      const nu = u - 0.5;
      const distCenter = Math.hypot(nu, nv) * 2;

      const base = fbmSeed(u * continentScale * 3.8, v * continentScale * 3.8, seed, 5);
      const ridges = ridgedSeed(u * continentScale * 5.6 + 2.3, v * continentScale * 5.6 + 1.1, seed + 7, 5);
      const valley = fbmSeed(u * 2.2 + 5.1, v * 2.2 + 3.7, seed + 19, 3);

      let h = 0.14 + base * 0.34 + Math.pow(ridges, 1.35) * (0.26 * ridgeSharpness);

      if (archetype === 'archipelago') {
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
      } else {
        // peninsula
        const penMask = clamp(1 - Math.hypot(nu * 1.15, (nv + 0.12) * 1.25) * 1.35, 0, 1);
        h = 0.07 + penMask * (0.34 + base * 0.26 + ridges * 0.35 * ridgeSharpness);
      }

      // Valley troughs
      if (valley > 0.55) {
        h -= (valley - 0.55) * 0.48 * valleyDepth;
      }

      heightData[py * resolution + px] = clamp(h, 0.02, 0.99);
    }
  }

  // Generate downstream rivers if requested
  const rivers: MapRiver[] = [];
  for (let r = 0; r < config.riverCount; r++) {
    const startX = (hash2Seed(r + 1, 3, seed) - 0.5) * 56;
    const startZ = -30 + hash2Seed(r + 2, 7, seed) * 24;
    const pts: PathPoint[] = [];
    let curX = startX;
    let curZ = startZ;

    for (let step = 0; step < 6; step++) {
      const y = sampleTerrainElevation(heightData, resolution, curX, curZ, TERRAIN_SIZE, displacementScale);
      pts.push({ x: curX, y, z: curZ });
      // Steer gradually toward southern/western sea
      curX += (hash2Seed(r * 10 + step, 19, seed) - 0.55) * 10;
      curZ += 8 + hash2Seed(r * 10 + step, 23, seed) * 6;
      if (curZ > 44) break;
    }

    const river: MapRiver = {
      id: `river-${seed}-${r}`,
      name: `River ${r + 1}`,
      points: pts,
      width: 1.55,
      depth: 1.25,
    };
    carveRiverIntoHeightData(heightData, resolution, river, displacementScale, seaLevel);
    rivers.push(river);
  }

  // Scatter initial editable trees & boulders
  const props: MapProp[] = [];
  const targetTrees = Math.round(config.treeDensity * 380);
  const targetRocks = Math.round(config.rockDensity * 120);
  const seaY = seaLevel * displacementScale;

  for (let i = 0; i < 1600 && props.length < targetTrees; i++) {
    const rx = (hash2Seed(i, 1, seed + 101) - 0.5) * 90;
    const rz = (hash2Seed(i, 2, seed + 101) - 0.5) * 90;
    const y = sampleTerrainElevation(heightData, resolution, rx, rz, TERRAIN_SIZE, displacementScale);
    const hNorm = y / Math.max(displacementScale, 0.001);
    if (y < seaY + 0.55 || hNorm > 0.56) continue;

    const yX = sampleTerrainElevation(heightData, resolution, rx + 0.6, rz, TERRAIN_SIZE, displacementScale);
    const yZ = sampleTerrainElevation(heightData, resolution, rx, rz + 0.6, TERRAIN_SIZE, displacementScale);
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
  for (let i = 0; i < 800 && rockCount < targetRocks; i++) {
    const rx = (hash2Seed(i, 3, seed + 303) - 0.5) * 92;
    const rz = (hash2Seed(i, 4, seed + 303) - 0.5) * 92;
    const y = sampleTerrainElevation(heightData, resolution, rx, rz, TERRAIN_SIZE, displacementScale);
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
  const pxPerUnit = (resolution - 1) / TERRAIN_SIZE;
  const cx = Math.round((worldX / TERRAIN_SIZE + 0.5) * (resolution - 1));
  const cz = Math.round((worldZ / TERRAIN_SIZE + 0.5) * (resolution - 1));
  const rPx = Math.max(1, Math.ceil(opts.radius * pxPerUnit));

  const minX = Math.max(1, cx - rPx);
  const maxX = Math.min(resolution - 2, cx + rPx);
  const minZ = Math.max(1, cz - rPx);
  const maxZ = Math.min(resolution - 2, cz + rPx);

  const deltaAmp = 0.028 * opts.strength * (opts.invert ? -1 : 1);
  const copy = opts.tool === 'smooth' ? heightData.slice() : null;

  for (let pz = minZ; pz <= maxZ; pz++) {
    const wz = (pz / (resolution - 1) - 0.5) * TERRAIN_SIZE;
    for (let px = minX; px <= maxX; px++) {
      const wx = (px / (resolution - 1) - 0.5) * TERRAIN_SIZE;
      const dist = Math.hypot(wx - worldX, wz - worldZ);
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
          (copy[idx] +
            copy[idx - 1] +
            copy[idx + 1] +
            copy[idx - resolution] +
            copy[idx + resolution]) /
          5;
        next = mix(next, avg, clamp(opts.strength * 0.65 * weight, 0, 1));
      } else if (opts.tool === 'coast') {
        const seaTarget = (opts.seaLevelNorm ?? SEA_LEVEL_NORM) - (opts.invert ? -0.06 : 0.08);
        next = mix(next, seaTarget, clamp(opts.strength * 0.4 * weight, 0, 1));
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
