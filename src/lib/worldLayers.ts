import * as THREE from 'three';
import { TERRAIN_SIZE, sampleTerrainElevation } from './terrainGenerator';
import {
  MapPropKind,
  PathPoint,
  WorldLayerCategory,
  WorldMapLayer,
} from '../types/vault';

export const LAYER_CATEGORY_META: Record<
  WorldLayerCategory,
  { label: string; defaultColor: string; description: string }
> = {
  country: {
    label: 'Country / Kingdom',
    defaultColor: '#d4a853',
    description: 'Sovereign realms, duchies, empires & borders',
  },
  region: {
    label: 'Region / Province',
    defaultColor: '#38bdf8',
    description: 'Geographic territories, provinces & marches',
  },
  religion: {
    label: 'Religion / Faith',
    defaultColor: '#c084fc',
    description: 'Sacred domains, pantheons & temple influence',
  },
  culture: {
    label: 'Culture / Peoples',
    defaultColor: '#34d399',
    description: 'Ethno-cultural homelands & linguistic spheres',
  },
  faction: {
    label: 'Faction / Guild',
    defaultColor: '#f87171',
    description: 'Syndicate, order & military control zones',
  },
  climate: {
    label: 'Climate / Biome',
    defaultColor: '#fb923c',
    description: 'Weather zones, magical anomalies & hazards',
  },
  custom: {
    label: 'Custom Layer',
    defaultColor: '#f472b6',
    description: 'Custom campaign or worldbuilding overlay',
  },
};

export function createDefaultWorldLayers(): WorldMapLayer[] {
  return [
    {
      id: 'layer-countries',
      name: 'Countries & Kingdoms',
      category: 'country',
      color: '#d4a853',
      visible: true,
      opacity: 0.34,
      order: 1,
    },
    {
      id: 'layer-regions',
      name: 'Regions & Provinces',
      category: 'region',
      color: '#38bdf8',
      visible: true,
      opacity: 0.26,
      order: 2,
    },
    {
      id: 'layer-religions',
      name: 'Religions & Faiths',
      category: 'religion',
      color: '#c084fc',
      visible: false,
      opacity: 0.32,
      order: 3,
    },
    {
      id: 'layer-cultures',
      name: 'Cultures & Peoples',
      category: 'culture',
      color: '#34d399',
      visible: false,
      opacity: 0.3,
      order: 4,
    },
    {
      id: 'layer-factions',
      name: 'Factions & Influence',
      category: 'faction',
      color: '#f87171',
      visible: false,
      opacity: 0.3,
      order: 5,
    },
  ];
}

export const WORLD_ELEMENT_CATALOG: Array<{
  kind: MapPropKind;
  label: string;
  category: 'Settlement & Structure' | 'Flora & Terrain';
  defaultScale: number;
}> = [
  { kind: 'castle', label: 'Castle / Keep', category: 'Settlement & Structure', defaultScale: 1.15 },
  { kind: 'village', label: 'Village / Town', category: 'Settlement & Structure', defaultScale: 1.15 },
  { kind: 'temple', label: 'Temple / Shrine', category: 'Settlement & Structure', defaultScale: 1.15 },
  { kind: 'tower', label: 'Watchtower', category: 'Settlement & Structure', defaultScale: 1.15 },
  { kind: 'gate', label: 'Fortified Gate', category: 'Settlement & Structure', defaultScale: 1.15 },
  { kind: 'windmill', label: 'Windmill', category: 'Settlement & Structure', defaultScale: 1.1 },
  { kind: 'monolith', label: 'Arcane Monolith', category: 'Settlement & Structure', defaultScale: 1.15 },
  { kind: 'ruin', label: 'Ancient Ruin', category: 'Settlement & Structure', defaultScale: 1.15 },
  { kind: 'pier', label: 'Harbor Pier', category: 'Settlement & Structure', defaultScale: 1.15 },
  { kind: 'bridge', label: 'Stone Bridge', category: 'Settlement & Structure', defaultScale: 1.15 },
  { kind: 'ship', label: 'Sailing Ship', category: 'Settlement & Structure', defaultScale: 1.1 },
  { kind: 'campfire', label: 'Camp / Outpost', category: 'Settlement & Structure', defaultScale: 1.1 },
  { kind: 'pine', label: 'Boreal Pine', category: 'Flora & Terrain', defaultScale: 0.9 },
  { kind: 'oak', label: 'Broad Oak', category: 'Flora & Terrain', defaultScale: 0.9 },
  { kind: 'deadwood', label: 'Deadwood', category: 'Flora & Terrain', defaultScale: 0.9 },
  { kind: 'boulder', label: 'Boulder', category: 'Flora & Terrain', defaultScale: 0.9 },
];

export const ZONE_COLOR_PALETTE = [
  '#d4a853',
  '#38bdf8',
  '#c084fc',
  '#34d399',
  '#f87171',
  '#fb923c',
  '#f472b6',
  '#a3e635',
  '#818cf8',
  '#2dd4bf',
];

export const LABEL_COLOR_PALETTE = [
  '#f2e8d2',
  '#e5be58',
  '#93c5d4',
  '#cbd5e1',
  '#c084fc',
  '#fca5a5',
  '#6ee7b7',
];

export function computePolygonCentroid(points: PathPoint[]): { x: number; z: number } {
  if (points.length === 0) return { x: 0, z: 0 };
  if (points.length < 3) {
    const sx = points.reduce((acc, p) => acc + p.x, 0);
    const sz = points.reduce((acc, p) => acc + p.z, 0);
    return { x: sx / points.length, z: sz / points.length };
  }

  let area2 = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.z - b.x * a.z;
    area2 += cross;
    cx += (a.x + b.x) * cross;
    cz += (a.z + b.z) * cross;
  }

  if (Math.abs(area2) < 1e-4) {
    const sx = points.reduce((acc, p) => acc + p.x, 0);
    const sz = points.reduce((acc, p) => acc + p.z, 0);
    return { x: sx / points.length, z: sz / points.length };
  }

  return {
    x: cx / (3 * area2),
    z: cz / (3 * area2),
  };
}

/**
 * Triangulates a polygon in XZ, adaptively subdivides large triangles so the mesh hugs
 * mountain ridges & valleys smoothly without clipping, and elevates each vertex to terrain/sea.
 */
export function buildTerrainConformingPolygonGeometry(
  points: PathPoint[],
  heightData: Float32Array,
  heightRes: number,
  displacementScale: number,
  seaY: number,
  yOffset = 0.22,
  terrainSize = TERRAIN_SIZE
): THREE.BufferGeometry | null {
  if (points.length < 3) return null;

  const contour = points.map((p) => new THREE.Vector2(p.x, p.z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  if (!triangles || triangles.length === 0) return null;

  type Tri = [number, number, number, number, number, number];
  let tris: Tri[] = triangles.map(([ia, ib, ic]) => [
    contour[ia].x,
    contour[ia].y,
    contour[ib].x,
    contour[ib].y,
    contour[ic].x,
    contour[ic].y,
  ]);

  const maxEdgeLen = 2.4;
  const maxTris = 2400;
  for (let pass = 0; pass < 4 && tris.length < maxTris; pass++) {
    let subdivided = false;
    const next: Tri[] = [];
    for (const tri of tris) {
      const [ax, az, bx, bz, cx, cz] = tri;
      const dAB = Math.hypot(bx - ax, bz - az);
      const dBC = Math.hypot(cx - bx, cz - bz);
      const dCA = Math.hypot(ax - cx, az - cz);
      if (Math.max(dAB, dBC, dCA) > maxEdgeLen && next.length + 4 <= maxTris) {
        const abx = (ax + bx) * 0.5;
        const abz = (az + bz) * 0.5;
        const bcx = (bx + cx) * 0.5;
        const bcz = (bz + cz) * 0.5;
        const cax = (cx + ax) * 0.5;
        const caz = (cz + az) * 0.5;
        next.push([ax, az, abx, abz, cax, caz]);
        next.push([abx, abz, bx, bz, bcx, bcz]);
        next.push([cax, caz, bcx, bcz, cx, cz]);
        next.push([abx, abz, bcx, bcz, cax, caz]);
        subdivided = true;
      } else {
        next.push(tri);
      }
    }
    tris = next;
    if (!subdivided) break;
  }

  const positions = new Float32Array(tris.length * 9);
  const sampleY = (wx: number, wz: number) => {
    const ty = sampleTerrainElevation(
      heightData,
      heightRes,
      wx,
      wz,
      terrainSize,
      displacementScale
    );
    return Math.max(seaY + 0.05, ty) + yOffset;
  };

  for (let i = 0; i < tris.length; i++) {
    const [ax, az, bx, bz, cx, cz] = tris[i];
    const base = i * 9;
    positions[base] = ax;
    positions[base + 1] = sampleY(ax, az);
    positions[base + 2] = az;

    positions[base + 3] = bx;
    positions[base + 4] = sampleY(bx, bz);
    positions[base + 5] = bz;

    positions[base + 6] = cx;
    positions[base + 7] = sampleY(cx, cz);
    positions[base + 8] = cz;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

export function sampleClosedBorderPoints(
  points: PathPoint[],
  heightData: Float32Array,
  heightRes: number,
  displacementScale: number,
  seaY: number,
  yOffset = 0.34,
  terrainSize = TERRAIN_SIZE
): Array<[number, number, number]> {
  if (points.length < 2) return [];
  const closed = [...points, points[0]];
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < closed.length - 1; i++) {
    const a = closed[i];
    const b = closed[i + 1];
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(4, Math.min(36, Math.ceil(dist / 1.2)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const ty = sampleTerrainElevation(
        heightData,
        heightRes,
        x,
        z,
        terrainSize,
        displacementScale
      );
      out.push([x, Math.max(seaY + 0.06, ty) + yOffset, z]);
    }
  }
  if (out.length > 0) {
    out.push(out[0]);
  }
  return out;
}
