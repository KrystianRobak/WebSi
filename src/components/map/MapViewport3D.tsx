import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Castle,
  Check,
  Cloud,
  Compass,
  Droplets,
  Eraser,
  Eye,
  EyeOff,
  Globe,
  Hammer,
  Layers,
  Link2,
  Map as MapIcon,
  MapPin,
  Minus,
  MousePointer,
  Mountain,
  Move,
  Paintbrush,
  Pentagon,
  Plus,
  Redo2,
  Route,
  ScrollText,
  Settings2,
  Sparkles,
  Stamp,
  Trees,
  TrendingUp,
  Type,
  Undo2,
  Wand2,
  Waves,
  Wrench,
  X,
} from 'lucide-react';
import { uploadAssetDataUrlOrBlob } from '../../lib/supabase';
import {
  buildFogDataTexture,
  createFogMask,
  loadMaskFromUrl,
  maskToCanvasBlob,
  paintFogCircle,
  unionFogMasks,
  worldXZToMaskNorm,
} from '../../lib/fogOfWarMask';
import {
  SEA_WATER_FRAGMENT_SHADER,
  SEA_WATER_VERTEX_SHADER,
  TERRAIN_MAP_CHUNK,
  TERRAIN_NORMAL_CHUNK,
  TERRAIN_ROUGHNESS_CHUNK,
  TERRAIN_SHADER_COMMON,
} from '../../lib/terrainShaders';
import {
  DEFAULT_DISPLACEMENT,
  SEA_LEVEL_NORM,
  TERRAIN_SIZE,
  expandHeightDataToWorldSize,
  extractHeightDataFromImage,
  generateShatteredReachTerrain,
  sampleTerrainElevation,
} from '../../lib/terrainGenerator';
import {
  applyBiomePaintBrush,
  applyGlobalBlankTerrain,
  applyGlobalHeightOffset,
  applyGlobalNoiseDetail,
  applyGlobalSmooth,
  applyGlobalThermalErosion,
  applyTerrainBrush,
  applyTerrainStamp,
  buildTexturesFromHeightData,
  carveRiverIntoHeightData,
} from '../../lib/terrainEditorEngine';
import {
  getSeaLevelNorm,
  getWorldSize,
  heightResForWorldSize,
  resolveTerrainShading,
  resolveWaterSettings,
  terrainSegmentsForWorldSize,
} from '../../lib/worldEnvironment';
import {
  LABEL_COLOR_PALETTE,
  LAYER_CATEGORY_META,
  WORLD_ELEMENT_CATALOG,
  ZONE_COLOR_PALETTE,
  createDefaultWorldLayers,
  sampleLandOrSeaElevation,
  snapPointToLandOrSea,
  transformPolygonPointsOnSurface,
  translatePolygonPointsOnSurface,
} from '../../lib/worldLayers';
import { useShallow } from 'zustand/react/shallow';
import { useVaultStore } from '../../store/useVaultStore';
import {
  Entity,
  FogVolume,
  MapLabelStyle,
  MapPath,
  MapPin as MapPinType,
  MapProp,
  MapPropKind,
  PathPoint,
  TerrainShadingSettings,
  VaultMap,
  ViewportSurface,
  WaterSettings,
  WorldAtmospherePreset,
  WorldLayerCategory,
  WorldMapLabel,
  WorldMapZone,
  WorldsmithTool,
  ZoneBorderStyle,
} from '../../types/vault';
import { EntityIcon } from '../common/EntityIcon';
import { GuildQuestBoardModal } from '../quests/GuildQuestBoardModal';
import { PinEntitySlideOver } from './PinEntitySlideOver';
import {
  BrushCursorRing,
  FogVolumes3D,
  QuestBoards3D,
  TerrainLabels3D,
  TerrainProps3D,
  TerrainRivers3D,
  TerrainZones3D,
  ZoneGizmoDragMode,
} from './WorldsmithMeshes3D';

const ATMOSPHERE_PRESETS: Record<
  WorldAtmospherePreset,
  {
    bg: string;
    fog: string;
    hemiSky: string;
    hemiGround: string;
    hemiIntensity: number;
    sunColor: string;
    sunIntensity: number;
    sunPos: [number, number, number];
    fillColor: string;
    fillIntensity: number;
    waterDeep: string;
    waterMid: string;
    waterShallow: string;
    skyHorizon: string;
    skyZenith: string;
  }
> = {
  'golden-hour': {
    bg: '#090b0e',
    fog: '#090b0e',
    hemiSky: '#85a1c2',
    hemiGround: '#181512',
    hemiIntensity: 0.78,
    sunColor: '#ffd28a',
    sunIntensity: 2.65,
    sunPos: [-48, 36, 18],
    fillColor: '#7ca3cf',
    fillIntensity: 1.0,
    waterDeep: '#041320',
    waterMid: '#0b3b4c',
    waterShallow: '#22878e',
    skyHorizon: '#2d4358',
    skyZenith: '#0d1521',
  },
  'high-noon': {
    bg: '#101824',
    fog: '#131d2b',
    hemiSky: '#cfe4ff',
    hemiGround: '#24201b',
    hemiIntensity: 0.96,
    sunColor: '#fff5e0',
    sunIntensity: 2.9,
    sunPos: [-12, 68, 22],
    fillColor: '#98bce3',
    fillIntensity: 1.1,
    waterDeep: '#072238',
    waterMid: '#0f5573',
    waterShallow: '#2aa1ab',
    skyHorizon: '#4c7399',
    skyZenith: '#162842',
  },
  'moonlit-night': {
    bg: '#050811',
    fog: '#060a14',
    hemiSky: '#3b588c',
    hemiGround: '#0a0d14',
    hemiIntensity: 0.46,
    sunColor: '#a6c8ff',
    sunIntensity: 1.65,
    sunPos: [38, 44, -26],
    fillColor: '#36507a',
    fillIntensity: 0.7,
    waterDeep: '#030a14',
    waterMid: '#092236',
    waterShallow: '#17526b',
    skyHorizon: '#162844',
    skyZenith: '#050914',
  },
  'crimson-eclipse': {
    bg: '#12070a',
    fog: '#18090d',
    hemiSky: '#964758',
    hemiGround: '#1a0c0e',
    hemiIntensity: 0.6,
    sunColor: '#ff7a5c',
    sunIntensity: 2.25,
    sunPos: [-42, 28, 24],
    fillColor: '#a64d79',
    fillIntensity: 0.85,
    waterDeep: '#12080d',
    waterMid: '#2a121b',
    waterShallow: '#5d2932',
    skyHorizon: '#4a1d26',
    skyZenith: '#14080d',
  },
};

export interface TerrainActionsHandle {
  carveRiver: (name: string, width: number, depth: number) => void;
}

export interface LabelDraftConfig {
  text: string;
  style: MapLabelStyle;
  fontSize: number;
  color: string;
  layerId: string;
}

export interface ElementDraftConfig {
  kind: MapPropKind;
  name: string;
  scale: number;
}

export interface FogBrushDraftConfig {
  targetUserId: string;
  reveal: boolean;
  radius: number;
}

interface TerrainSceneProps {
  mapData: VaultMap;
  terrainActionsRef: React.MutableRefObject<TerrainActionsHandle | null>;
  labelDraftRef: React.MutableRefObject<LabelDraftConfig>;
  elementDraftRef: React.MutableRefObject<ElementDraftConfig>;
  fogDraftRef: React.MutableRefObject<FogBrushDraftConfig>;
  fogCommandSignal: { seq: number; action: 'reveal-all' | 'reset-shroud' };
}

function buildLiveHeightDataTexture(heightData: Float32Array, res: number): THREE.DataTexture {
  const bytes = new Uint8Array(res * res * 4);
  for (let i = 0; i < res * res; i++) {
    const v = Math.max(0, Math.min(255, Math.round(heightData[i] * 255)));
    bytes[i * 4] = v;
    bytes[i * 4 + 1] = v;
    bytes[i * 4 + 2] = v;
    bytes[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(bytes, res, res, THREE.RGBAFormat);
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function syncLiveHeightDataTexture(tex: THREE.DataTexture, heightData: Float32Array, res: number): void {
  const data = tex.image?.data as Uint8Array | undefined;
  if (!data || data.length !== res * res * 4) return;
  for (let i = 0; i < res * res; i++) {
    const v = Math.max(0, Math.min(255, Math.round(heightData[i] * 255)));
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  tex.needsUpdate = true;
}

function buildLivePaintDataTexture(paintData: Uint8Array, res: number): THREE.DataTexture {
  const copy = new Uint8Array(paintData.length);
  copy.set(paintData);
  const tex = new THREE.DataTexture(copy, res, res, THREE.RGBAFormat);
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function syncLivePaintDataTexture(tex: THREE.DataTexture, paintData: Uint8Array): void {
  const data = tex.image?.data as Uint8Array | undefined;
  if (!data || data.length !== paintData.length) return;
  data.set(paintData);
  tex.needsUpdate = true;
}

function extractRgbaDataFromImage(img: HTMLImageElement | HTMLCanvasElement, res: number): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, res, res);
  const { data } = ctx.getImageData(0, 0, res, res);
  return new Uint8Array(data);
}

const DEFAULT_CAMERA_POS = new THREE.Vector3(-6, 54, 78);
const DEFAULT_TARGET = new THREE.Vector3(0, 3.2, 2);
const TOP_TARGET = new THREE.Vector3(0, 0, 0);
const noopRaycast = () => null;
const meshRaycast = THREE.Mesh.prototype.raycast;

interface SeaLevelWaterProps {
  seaY: number;
  terrainSize: number;
  heightTex: THREE.Texture | null;
  fogTex?: THREE.Texture | null;
  fogGmAlpha?: number;
  displacementScale: number;
  waterSettings: WaterSettings;
  wireframe?: boolean;
  atmosphereKey?: WorldAtmospherePreset;
  disableRaycast?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: () => void;
}

/**
 * High-quality single-pass bathymetry-driven GLSL water shader:
 * - 6-wave directional Gerstner vertex swell with wind direction, choppiness, and crest Jacobian tracking.
 * - Analytic multi-octave wave normals + capillary ripples + FBM foam noise.
 * - Subsurface turquoise wave-crest scattering, open-water whitecaps, and multi-band animated shore breakers & lacy foam.
 */
const SeaLevelWater: React.FC<SeaLevelWaterProps> = React.memo(({
  seaY,
  terrainSize,
  heightTex,
  fogTex = null,
  fogGmAlpha = 1.0,
  displacementScale,
  waterSettings,
  wireframe = false,
  atmosphereKey = 'golden-hour',
  disableRaycast = false,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) => {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uHeightMap: { value: null as THREE.Texture | null },
      uHasHeightMap: { value: 0 },
      uFogTex: { value: null as THREE.Texture | null },
      uHasFogTex: { value: 0 },
      uFogGmAlpha: { value: 1.0 },
      uTerrainSize: { value: terrainSize },
      uDisplacementScale: { value: DEFAULT_DISPLACEMENT },
      uSeaY: { value: SEA_LEVEL_NORM * DEFAULT_DISPLACEMENT },
      uWaveHeight: { value: 1.0 },
      uWaveScale: { value: 1.0 },
      uWaveSpeed: { value: 1.0 },
      uChoppiness: { value: 0.72 },
      uFoamAmount: { value: 1.15 },
      uShoreWaves: { value: 1.2 },
      uClarity: { value: 1.0 },
      uWindDir: { value: new THREE.Vector2(0.82, 0.57) },
      uSunDir: { value: new THREE.Vector3(-48, 36, 18).normalize() },
      uFillDir: { value: new THREE.Vector3(42, 22, -38).normalize() },
      uDeepColor: { value: new THREE.Color('#041320') },
      uMidColor: { value: new THREE.Color('#0b3b4c') },
      uShallowColor: { value: new THREE.Color('#22878e') },
      uSunColor: { value: new THREE.Color('#ffd28a') },
      uFillColor: { value: new THREE.Color('#7ca3cf') },
      uSkyHorizon: { value: new THREE.Color('#2d4358') },
      uSkyZenith: { value: new THREE.Color('#0d1521') },
      uFoamColor: { value: new THREE.Color('#e8f3f6') },
      uFogColor: { value: new THREE.Color('#090b0e') },
      uFogNear: { value: 110.0 },
      uFogFar: { value: 260.0 },
      uWireframe: { value: 0.0 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    if (!matRef.current) return;
    const atmo = ATMOSPHERE_PRESETS[atmosphereKey] || ATMOSPHERE_PRESETS['golden-hour'];
    const u = matRef.current.uniforms;
    u.uHeightMap.value = heightTex;
    u.uHasHeightMap.value = heightTex ? 1.0 : 0.0;
    u.uFogTex.value = fogTex;
    u.uHasFogTex.value = fogTex ? 1.0 : 0.0;
    u.uFogGmAlpha.value = fogGmAlpha;
    u.uTerrainSize.value = terrainSize;
    u.uDisplacementScale.value = displacementScale;
    u.uSeaY.value = seaY;
    u.uWaveHeight.value = waterSettings.waveHeight;
    u.uWaveScale.value = waterSettings.waveScale;
    u.uWaveSpeed.value = waterSettings.waveSpeed;
    u.uChoppiness.value = waterSettings.choppiness;
    u.uFoamAmount.value = waterSettings.foamAmount;
    u.uShoreWaves.value = waterSettings.shoreWaves;
    u.uClarity.value = waterSettings.clarity;
    const rad = (waterSettings.windDirection * Math.PI) / 180;
    u.uWindDir.value.set(Math.cos(rad), Math.sin(rad));
    u.uWireframe.value = wireframe ? 1.0 : 0.0;
    u.uSunDir.value.set(...atmo.sunPos).normalize();
    u.uSunColor.value.set(atmo.sunColor);
    u.uFillColor.value.set(atmo.fillColor);
    const deepHex = waterSettings.deepColor || atmo.waterDeep;
    const shallowHex = waterSettings.shallowColor || atmo.waterShallow;
    u.uDeepColor.value.set(deepHex);
    u.uShallowColor.value.set(shallowHex);
    u.uMidColor.value.set(deepHex).lerp(new THREE.Color(shallowHex), 0.45);
    u.uSkyHorizon.value.set(atmo.skyHorizon);
    u.uSkyZenith.value.set(atmo.skyZenith);
    u.uFogColor.value.set(atmo.fog);
  }, [heightTex, fogTex, fogGmAlpha, terrainSize, displacementScale, seaY, waterSettings, wireframe, atmosphereKey]);

  useFrame(({ clock, camera }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.getElapsedTime();
      const camDist = camera.position.length();
      const sizeScale = Math.max(1, terrainSize / 100);
      const topBlend = THREE.MathUtils.smoothstep(camDist, 85 * sizeScale, 155 * sizeScale);
      matRef.current.uniforms.uFogNear.value = THREE.MathUtils.lerp(76.0 * sizeScale, 280.0 * sizeScale, topBlend);
      matRef.current.uniforms.uFogFar.value = THREE.MathUtils.lerp(165.0 * sizeScale, 560.0 * sizeScale, topBlend);
    }
  });

  const waterPlaneSize = terrainSize * 1.38;

  return (
    <mesh
      position={[0, seaY, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={disableRaycast ? noopRaycast : meshRaycast}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <planeGeometry args={[waterPlaneSize, waterPlaneSize, 96, 96]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        wireframe={wireframe}
        uniforms={uniforms}
        vertexShader={SEA_WATER_VERTEX_SHADER}
        fragmentShader={SEA_WATER_FRAGMENT_SHADER}
      />
    </mesh>
  );
});

type TerrainPatchUpdater = (minWx: number, maxWx: number, minWz: number, maxWz: number) => void;

interface DisplacedTerrainMeshProps {
  meshRef?: React.RefObject<THREE.Mesh>;
  patchHandleRef?: React.MutableRefObject<TerrainPatchUpdater | null>;
  heightData: Float32Array;
  heightRes: number;
  terrainSize: number;
  terrainSegments: number;
  displacementScale: number;
  terrainVersion: number;
  seaY: number;
  albedoTex: THREE.Texture | null;
  paintTex: THREE.Texture | null;
  fogTex?: THREE.Texture | null;
  fogGmAlpha?: number;
  terrainShading: TerrainShadingSettings;
  showBiome: boolean;
  wireframe: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (e: ThreeEvent<PointerEvent>) => void;
}

const DisplacedTerrainMesh: React.FC<DisplacedTerrainMeshProps> = React.memo(({
  meshRef,
  patchHandleRef,
  heightData,
  heightRes,
  terrainSize,
  terrainSegments,
  displacementScale,
  terrainVersion,
  seaY,
  albedoTex,
  paintTex,
  fogTex = null,
  fogGmAlpha = 1.0,
  terrainShading,
  showBiome,
  wireframe,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) => {
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [terrainSize, terrainSegments]);

  useEffect(() => {
    return () => {
      geom.dispose();
    };
  }, [geom]);

  const liveParamsRef = useRef({
    heightData,
    heightRes,
    terrainSize,
    terrainSegments,
    displacementScale,
  });
  liveParamsRef.current = {
    heightData,
    heightRes,
    terrainSize,
    terrainSegments,
    displacementScale,
  };

  useEffect(() => {
    if (!patchHandleRef) return;
    patchHandleRef.current = (minWx: number, maxWx: number, minWz: number, maxWz: number) => {
      const p = liveParamsRef.current;
      const segs = p.terrainSegments;
      const stride = segs + 1;
      const cellSize = p.terrainSize / segs;
      const half = p.terrainSize * 0.5;
      const pos = geom.attributes.position as THREE.BufferAttribute;
      const norm = geom.attributes.normal as THREE.BufferAttribute;
      if (!pos || !norm) return;

      const ix0 = Math.max(0, Math.floor((minWx + half) / cellSize) - 1);
      const ix1 = Math.min(segs, Math.ceil((maxWx + half) / cellSize) + 1);
      const iz0 = Math.max(0, Math.floor((minWz + half) / cellSize) - 1);
      const iz1 = Math.min(segs, Math.ceil((maxWz + half) / cellSize) + 1);

      let minY = geom.boundingBox ? geom.boundingBox.min.y : Infinity;
      let maxY = geom.boundingBox ? geom.boundingBox.max.y : -Infinity;

      for (let iz = iz0; iz <= iz1; iz++) {
        const row = iz * stride;
        for (let ix = ix0; ix <= ix1; ix++) {
          const idx = row + ix;
          const y = sampleTerrainElevation(
            p.heightData,
            p.heightRes,
            pos.getX(idx),
            pos.getZ(idx),
            p.terrainSize,
            p.displacementScale
          );
          pos.setY(idx, y);
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }

      const nx0 = Math.max(0, ix0 - 1);
      const nx1 = Math.min(segs, ix1 + 1);
      const nz0 = Math.max(0, iz0 - 1);
      const nz1 = Math.min(segs, iz1 + 1);

      for (let iz = nz0; iz <= nz1; iz++) {
        const izU = Math.max(0, iz - 1);
        const izD = Math.min(segs, iz + 1);
        const row = iz * stride;
        const rowU = izU * stride;
        const rowD = izD * stride;
        for (let ix = nx0; ix <= nx1; ix++) {
          const ixL = Math.max(0, ix - 1);
          const ixR = Math.min(segs, ix + 1);
          const iL = row + ixL;
          const iR = row + ixR;
          const iU = rowU + ix;
          const iD = rowD + ix;
          const dx = pos.getX(iR) - pos.getX(iL) || cellSize;
          const dz = pos.getZ(iD) - pos.getZ(iU) || cellSize;
          const sx = -(pos.getY(iR) - pos.getY(iL)) / dx;
          const sz = -(pos.getY(iD) - pos.getY(iU)) / dz;
          const invLen = 1 / Math.hypot(sx, 1, sz);
          norm.setXYZ(row + ix, sx * invLen, invLen, sz * invLen);
        }
      }

      pos.needsUpdate = true;
      norm.needsUpdate = true;

      if (geom.boundingBox) {
        if (minY < geom.boundingBox.min.y) geom.boundingBox.min.y = minY;
        if (maxY > geom.boundingBox.max.y) geom.boundingBox.max.y = maxY;
        if (geom.boundingSphere) {
          geom.boundingBox.getBoundingSphere(geom.boundingSphere);
        }
      }
    };
    return () => {
      patchHandleRef.current = null;
    };
  }, [geom, patchHandleRef]);

  const heightfieldRaycast = useMemo(
    () =>
      function (
        this: THREE.Object3D,
        raycaster: THREE.Raycaster,
        intersects: THREE.Intersection[]
      ) {
        const p = liveParamsRef.current;
        if (!p.heightData || p.heightRes <= 1) return;

        const invMat = new THREE.Matrix4().copy(this.matrixWorld).invert();
        const localRay = new THREE.Ray().copy(raycaster.ray).applyMatrix4(invMat);

        const ox = localRay.origin.x;
        const oy = localRay.origin.y;
        const oz = localRay.origin.z;
        const dx = localRay.direction.x;
        const dy = localRay.direction.y;
        const dz = localRay.direction.z;

        const half = p.terrainSize * 0.5;
        const minY = (geom.boundingBox ? geom.boundingBox.min.y : 0) - 0.15;
        const maxY = (geom.boundingBox ? geom.boundingBox.max.y : p.displacementScale) + 0.15;

        let tmin = raycaster.near;
        let tmax = raycaster.far;

        if (Math.abs(dx) < 1e-8) {
          if (ox < -half || ox > half) return;
        } else {
          const inv = 1 / dx;
          let t1 = (-half - ox) * inv;
          let t2 = (half - ox) * inv;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
          }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) return;
        }

        if (Math.abs(dy) < 1e-8) {
          if (oy < minY || oy > maxY) return;
        } else {
          const inv = 1 / dy;
          let t1 = (minY - oy) * inv;
          let t2 = (maxY - oy) * inv;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
          }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) return;
        }

        if (Math.abs(dz) < 1e-8) {
          if (oz < -half || oz > half) return;
        } else {
          const inv = 1 / dz;
          let t1 = (-half - oz) * inv;
          let t2 = (half - oz) * inv;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
          }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) return;
        }

        const step = Math.max(0.45, p.terrainSize / p.terrainSegments);
        let prevT = tmin;
        let hitT = -1;

        for (let t = tmin; ; ) {
          const rx = ox + dx * t;
          const ry = oy + dy * t;
          const rz = oz + dz * t;
          const h = sampleTerrainElevation(
            p.heightData,
            p.heightRes,
            rx,
            rz,
            p.terrainSize,
            p.displacementScale
          );
          if (ry <= h) {
            if (t === tmin) {
              hitT = tmin;
            } else {
              let lo = prevT;
              let hi = t;
              for (let k = 0; k < 7; k++) {
                const mid = (lo + hi) * 0.5;
                const my = oy + dy * mid;
                const mh = sampleTerrainElevation(
                  p.heightData,
                  p.heightRes,
                  ox + dx * mid,
                  oz + dz * mid,
                  p.terrainSize,
                  p.displacementScale
                );
                if (my <= mh) hi = mid;
                else lo = mid;
              }
              hitT = (lo + hi) * 0.5;
            }
            break;
          }
          if (t >= tmax) break;
          prevT = t;
          t = Math.min(tmax, t + step);
        }

        if (hitT < 0) return;

        const hx = ox + dx * hitT;
        const hz = oz + dz * hitT;
        const hy = sampleTerrainElevation(
          p.heightData,
          p.heightRes,
          hx,
          hz,
          p.terrainSize,
          p.displacementScale
        );
        const worldPoint = new THREE.Vector3(hx, hy, hz).applyMatrix4(this.matrixWorld);
        const distance = worldPoint.distanceTo(raycaster.ray.origin);
        if (distance < raycaster.near || distance > raycaster.far) return;

        intersects.push({
          distance,
          point: worldPoint,
          face: null,
          faceIndex: 0,
          uv: new THREE.Vector2(hx / p.terrainSize + 0.5, hz / p.terrainSize + 0.5),
          object: this,
        });
      },
    [geom]
  );

  useEffect(() => {
    const pos = geom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = sampleTerrainElevation(heightData, heightRes, x, z, terrainSize, displacementScale);
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
  }, [geom, heightData, heightRes, terrainSize, displacementScale, terrainVersion]);

  const uniformsRef = useRef({
    uSeaY: { value: seaY },
    uDispScale: { value: displacementScale },
    uTerrainSize: { value: terrainSize },
    uShowBiome: { value: showBiome ? 1.0 : 0.0 },
    uPaintMap: { value: paintTex },
    uHasPaintMap: { value: paintTex ? 1.0 : 0.0 },
    uFogTex: { value: fogTex },
    uHasFogTex: { value: fogTex ? 1.0 : 0.0 },
    uFogGmAlpha: { value: fogGmAlpha },
    uColorRichness: { value: terrainShading.colorRichness ?? 1.15 },
    uSnowLine: { value: terrainShading.snowLine },
    uRockContrast: { value: terrainShading.rockContrast ?? 1.1 },
    uBeachWidth: { value: terrainShading.beachWidth },
    uAridity: { value: terrainShading.aridity },
    uLushness: { value: terrainShading.lushness ?? 1.0 },
  });

  useEffect(() => {
    uniformsRef.current.uSeaY.value = seaY;
    uniformsRef.current.uDispScale.value = displacementScale;
    uniformsRef.current.uTerrainSize.value = terrainSize;
    uniformsRef.current.uShowBiome.value = showBiome ? 1.0 : 0.0;
    uniformsRef.current.uPaintMap.value = paintTex;
    uniformsRef.current.uHasPaintMap.value = paintTex ? 1.0 : 0.0;
    uniformsRef.current.uFogTex.value = fogTex;
    uniformsRef.current.uHasFogTex.value = fogTex ? 1.0 : 0.0;
    uniformsRef.current.uFogGmAlpha.value = fogGmAlpha;
    uniformsRef.current.uColorRichness.value = terrainShading.colorRichness ?? 1.15;
    uniformsRef.current.uSnowLine.value = terrainShading.snowLine;
    uniformsRef.current.uRockContrast.value = terrainShading.rockContrast ?? 1.1;
    uniformsRef.current.uBeachWidth.value = terrainShading.beachWidth;
    uniformsRef.current.uAridity.value = terrainShading.aridity;
    uniformsRef.current.uLushness.value = terrainShading.lushness ?? 1.0;
  }, [seaY, displacementScale, terrainSize, showBiome, paintTex, fogTex, fogGmAlpha, terrainShading]);

  const handleBeforeCompile = useMemo(
    () => (shader: THREE.WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uSeaY = uniformsRef.current.uSeaY;
      shader.uniforms.uDispScale = uniformsRef.current.uDispScale;
      shader.uniforms.uTerrainSize = uniformsRef.current.uTerrainSize;
      shader.uniforms.uShowBiome = uniformsRef.current.uShowBiome;
      shader.uniforms.uPaintMap = uniformsRef.current.uPaintMap;
      shader.uniforms.uHasPaintMap = uniformsRef.current.uHasPaintMap;
      shader.uniforms.uFogTex = uniformsRef.current.uFogTex;
      shader.uniforms.uHasFogTex = uniformsRef.current.uHasFogTex;
      shader.uniforms.uFogGmAlpha = uniformsRef.current.uFogGmAlpha;
      shader.uniforms.uColorRichness = uniformsRef.current.uColorRichness;
      shader.uniforms.uSnowLine = uniformsRef.current.uSnowLine;
      shader.uniforms.uRockContrast = uniformsRef.current.uRockContrast;
      shader.uniforms.uBeachWidth = uniformsRef.current.uBeachWidth;
      shader.uniforms.uAridity = uniformsRef.current.uAridity;
      shader.uniforms.uLushness = uniformsRef.current.uLushness;

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vTerrWorldPos;\nvarying vec3 vTerrWorldNormal;`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\nvTerrWorldNormal = normalize(objectNormal);`)
        .replace('#include <project_vertex>', `#include <project_vertex>\nvTerrWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${TERRAIN_SHADER_COMMON}`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${TERRAIN_MAP_CHUNK}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${TERRAIN_NORMAL_CHUNK}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${TERRAIN_ROUGHNESS_CHUNK}`);
    },
    []
  );

  const hasMap = Boolean(showBiome && albedoTex);
  const matCacheKey = `aethelgard-terrain-pbr-v5-${hasMap ? 'map' : 'nomap'}`;

  return (
    <mesh
      ref={meshRef}
      geometry={geom}
      raycast={heightfieldRaycast}
      receiveShadow
      castShadow
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {wireframe ? (
        <meshStandardMaterial
          color="#d4a853"
          emissive="#4a3816"
          emissiveIntensity={0.45}
          wireframe
          roughness={0.4}
          metalness={0.5}
        />
      ) : (
        <meshStandardMaterial
          key={matCacheKey}
          map={hasMap ? albedoTex : null}
          color="#ffffff"
          roughness={0.85}
          metalness={0.04}
          onBeforeCompile={handleBeforeCompile}
          customProgramCacheKey={() => matCacheKey}
        />
      )}
    </mesh>
  );
});

interface TerrainFloraProps {
  heightData: Float32Array;
  heightRes: number;
  terrainSize: number;
  displacementScale: number;
  seaY: number;
  pins: MapPinType[];
  visible: boolean;
}

/**
 * Renders instanced boreal pines + autumn trees + angular boulders in 3 GPU draw calls.
 */
const TerrainFloraAndProps: React.FC<TerrainFloraProps> = React.memo(({
  heightData,
  heightRes,
  terrainSize,
  displacementScale,
  seaY,
  pins,
  visible,
}) => {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);

  const { trees, rocks } = useMemo(() => {
    const tList: Array<{ x: number; y: number; z: number; scale: number; rot: number; tint: THREE.Color }> = [];
    const rList: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number }> = [];

    const rand = (seed: number) => {
      const s = Math.sin(seed * 91.3458) * 47453.5453;
      return s - Math.floor(s);
    };

    const nearPin = (x: number, z: number) =>
      pins.some((p) => (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < 11.5);

    const pinePal = [
      new THREE.Color('#1d4428'),
      new THREE.Color('#285432'),
      new THREE.Color('#3b5a2b'),
      new THREE.Color('#6b4f24'),
      new THREE.Color('#8c5322'),
    ];

    const maxTrees = Math.min(820, Math.round(420 * (terrainSize / 100)));
    const maxRocks = Math.min(260, Math.round(130 * (terrainSize / 100)));

    for (let i = 0; i < 3200 && tList.length < maxTrees; i++) {
      const rx = (rand(i * 3 + 1) - 0.5) * (terrainSize * 0.92);
      const rz = (rand(i * 3 + 2) - 0.5) * (terrainSize * 0.92);
      if (nearPin(rx, rz)) continue;

      const y = sampleTerrainElevation(heightData, heightRes, rx, rz, terrainSize, displacementScale);
      const hNorm = y / Math.max(displacementScale, 0.001);
      if (y < seaY + 0.55 || hNorm > 0.56) continue;

      const yX = sampleTerrainElevation(heightData, heightRes, rx + 0.6, rz, terrainSize, displacementScale);
      const yZ = sampleTerrainElevation(heightData, heightRes, rx, rz + 0.6, terrainSize, displacementScale);
      const slope = Math.hypot(yX - y, yZ - y) / 0.6;
      if (slope > 0.36) continue;

      const cluster = Math.sin(rx * 0.14) * Math.cos(rz * 0.14) + rand(i * 7) * 0.5;
      if (cluster < 0.12) continue;

      const scale = 0.52 + rand(i * 5 + 3) * 0.58;
      tList.push({
        x: rx,
        y,
        z: rz,
        scale,
        rot: rand(i * 11) * Math.PI * 2,
        tint: pinePal[i % pinePal.length],
      });
    }

    for (let i = 0; i < 1600 && rList.length < maxRocks; i++) {
      const rx = (rand(i * 13 + 700) - 0.5) * (terrainSize * 0.92);
      const rz = (rand(i * 13 + 701) - 0.5) * (terrainSize * 0.92);
      if (nearPin(rx, rz)) continue;

      const y = sampleTerrainElevation(heightData, heightRes, rx, rz, terrainSize, displacementScale);
      if (y < seaY - 0.08 || y > displacementScale * 0.72) continue;

      const yX = sampleTerrainElevation(heightData, heightRes, rx + 0.6, rz, terrainSize, displacementScale);
      const yZ = sampleTerrainElevation(heightData, heightRes, rx, rz + 0.6, terrainSize, displacementScale);
      const slope = Math.hypot(yX - y, yZ - y) / 0.6;
      if (y > seaY + 1.1 && slope < 0.16) continue;

      const baseS = 0.15 + rand(i * 17 + 702) * 0.28;
      rList.push({
        x: rx,
        y: y - baseS * 0.25,
        z: rz,
        sx: baseS * (0.85 + rand(i * 19) * 0.55),
        sy: baseS * (0.55 + rand(i * 23) * 0.45),
        sz: baseS * (0.85 + rand(i * 29) * 0.55),
        ry: rand(i * 31) * Math.PI * 2,
      });
    }

    return { trees: tList, rocks: rList };
  }, [heightData, heightRes, terrainSize, displacementScale, seaY, pins]);

  useEffect(() => {
    if (!visible) return;
    const dummy = new THREE.Object3D();

    if (trunkRef.current && crownRef.current) {
      trees.forEach((t, idx) => {
        dummy.position.set(t.x, t.y + 0.22 * t.scale, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.set(t.scale, t.scale, t.scale);
        dummy.updateMatrix();
        trunkRef.current!.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(t.x, t.y + 0.78 * t.scale, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.set(t.scale, t.scale, t.scale);
        dummy.updateMatrix();
        crownRef.current!.setMatrixAt(idx, dummy.matrix);
        crownRef.current!.setColorAt(idx, t.tint);
      });
      trunkRef.current.instanceMatrix.needsUpdate = true;
      crownRef.current.instanceMatrix.needsUpdate = true;
      if (crownRef.current.instanceColor) crownRef.current.instanceColor.needsUpdate = true;
    }

    if (rockRef.current) {
      rocks.forEach((r, idx) => {
        dummy.position.set(r.x, r.y, r.z);
        dummy.rotation.set(0.2 * idx, r.ry, 0.1 * idx);
        dummy.scale.set(r.sx, r.sy, r.sz);
        dummy.updateMatrix();
        rockRef.current!.setMatrixAt(idx, dummy.matrix);
      });
      rockRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [trees, rocks, visible]);

  if (!visible) return null;

  return (
    <group>
      {trees.length > 0 && (
        <>
          <instancedMesh ref={trunkRef} args={[undefined, undefined, trees.length]} castShadow receiveShadow raycast={noopRaycast}>
            <cylinderGeometry args={[0.045, 0.08, 0.45, 5]} />
            <meshStandardMaterial color="#3b2c20" roughness={0.95} />
          </instancedMesh>
          <instancedMesh ref={crownRef} args={[undefined, undefined, trees.length]} castShadow receiveShadow raycast={noopRaycast}>
            <coneGeometry args={[0.34, 1.05, 6]} />
            <meshStandardMaterial roughness={0.88} metalness={0.02} />
          </instancedMesh>
        </>
      )}
      {rocks.length > 0 && (
        <instancedMesh ref={rockRef} args={[undefined, undefined, rocks.length]} castShadow receiveShadow raycast={noopRaycast}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#3d434e" roughness={0.86} metalness={0.08} />
        </instancedMesh>
      )}
    </group>
  );
});

/**
 * Subtle drifting atmospheric clouds around mountain peaks and southern shoals.
 */
const AtmosphericMist: React.FC = React.memo(() => {
  const groupRef = useRef<THREE.Group>(null);

  const cloudTex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(210, 222, 238, 0.26)');
    grad.addColorStop(0.5, 'rgba(155, 175, 198, 0.10)');
    grad.addColorStop(1, 'rgba(11, 13, 16, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }, []);

  useEffect(() => {
    return () => {
      cloudTex.dispose();
    };
  }, [cloudTex]);

  const clouds = useMemo(
    () => [
      { pos: [-18, 13.5, -24] as [number, number, number], scale: 28, speed: 0.18 },
      { pos: [14, 15.2, -22] as [number, number, number], scale: 32, speed: -0.14 },
      { pos: [-26, 5.2, 26] as [number, number, number], scale: 26, speed: 0.22 },
      { pos: [24, 5.6, 28] as [number, number, number], scale: 28, speed: -0.16 },
      { pos: [2, 12.8, -32] as [number, number, number], scale: 36, speed: 0.12 },
    ],
    []
  );

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.children.forEach((child, idx) => {
      const cfg = clouds[idx];
      if (!cfg) return;
      child.position.x = cfg.pos[0] + Math.sin(t * cfg.speed + idx) * 3.5;
    });
  });

  return (
    <group ref={groupRef}>
      {clouds.map((c, idx) => (
        <mesh key={idx} position={c.pos} rotation={[-Math.PI / 2, 0, 0]} raycast={noopRaycast}>
          <planeGeometry args={[c.scale, c.scale * 0.65]} />
          <meshBasicMaterial
            map={cloudTex}
            transparent
            depthWrite={false}
            opacity={0.48}
            blending={THREE.NormalBlending}
          />
        </mesh>
      ))}
    </group>
  );
});

/**
 * Renders a terrain-hugging golden dashed spline path or region polygon.
 */
const TerrainPathOverlay: React.FC<{
  path: MapPath;
  heightData: Float32Array;
  resolution: number;
  terrainSize: number;
  displacement: number;
  seaY: number;
}> = React.memo(({ path, heightData, resolution, terrainSize, displacement, seaY }) => {
  const isRegion = path.style === 'region-polygon';

  const sampledPoints = useMemo(() => {
    if (path.points.length < 2) return [];
    const vecs = path.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    if (isRegion) {
      const closed = [...vecs, vecs[0]];
      const out: [number, number, number][] = [];
      for (let i = 0; i < closed.length - 1; i++) {
        const a = closed[i];
        const b = closed[i + 1];
        const steps = 16;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = THREE.MathUtils.lerp(a.x, b.x, t);
          const z = THREE.MathUtils.lerp(a.z, b.z, t);
          const y =
            sampleLandOrSeaElevation(heightData, resolution, x, z, terrainSize, displacement, seaY) + 0.35;
          out.push([x, y, z]);
        }
      }
      return out;
    }

    const curve = new THREE.CatmullRomCurve3(vecs);
    const divisions = 72;
    const curvePts = curve.getPoints(divisions);
    return curvePts.map((pt) => {
      const y =
        sampleLandOrSeaElevation(heightData, resolution, pt.x, pt.z, terrainSize, displacement, seaY) + 0.32;
      return [pt.x, y, pt.z] as [number, number, number];
    });
  }, [path.points, isRegion, heightData, resolution, terrainSize, displacement, seaY]);

  if (sampledPoints.length < 2) return null;

  const lineColor = path.is_gm_only ? '#f87171' : '#e5be58';

  return (
    <Line
      points={sampledPoints}
      color={lineColor}
      lineWidth={isRegion ? 2.1 : 2.4}
      dashed={!isRegion}
      dashSize={1.15}
      gapSize={0.7}
      transparent
      opacity={isRegion ? 0.72 : 0.92}
    />
  );
});

/**
 * Glowing 3D Pin Beacon + Dark-Glass <Html> Badge & Hover Card.
 */
const MapPin3D: React.FC<{
  pin: MapPinType;
  entity?: Entity;
  isSelected: boolean;
  isHovered: boolean;
  isTopView?: boolean;
  onSelectPin: (pinId: string) => void;
  onHoverPin: (pinId: string | null) => void;
}> = React.memo(({ pin, entity, isSelected, isHovered, isTopView = false, onSelectPin, onHoverPin }) => {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (ringRef.current) {
      const s = 1 + Math.sin(clock.getElapsedTime() * 3.2) * 0.22;
      ringRef.current.scale.set(s, s, 1);
    }
  });

  const beaconColor = pin.is_gm_only ? '#ef4444' : '#eab308';

  return (
    <group position={[pin.x, pin.y + 0.25, pin.z]}>
      {/* Ground glowing ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[0.45, 0.75, 24]} />
        <meshBasicMaterial color={beaconColor} transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>

      {/* Vertical Light Pillar */}
      <mesh position={[0, 1.35, 0]}>
        <cylinderGeometry args={[0.06, 0.14, 2.7, 12]} />
        <meshBasicMaterial color={beaconColor} transparent opacity={0.75} />
      </mesh>

      {/* Floating Beacon Gem */}
      <mesh position={[0, 2.95, 0]}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial
          color={beaconColor}
          emissive={beaconColor}
          emissiveIntensity={1.3}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Anchored HTML Dark-Glass Pill Badge + Hover Tooltip */}
      <Html
        position={[0, 3.85, 0]}
        center
        distanceFactor={isTopView ? 115 : 48}
        zIndexRange={isHovered ? [40, 20] : [18, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div className="relative flex flex-col items-center select-none pointer-events-none">
          {/* Hover Tooltip Preview Card (absolutely positioned so badge position stays pixel-locked) */}
          {isHovered && !isSelected && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[250px] rounded-lg dark-glass shadow-glass p-2.5 text-left pointer-events-none">
              {entity?.cover_image_url && (
                <div className="h-20 w-full rounded overflow-hidden mb-2 border border-[#242a35]">
                  <img
                    src={entity.cover_image_url}
                    alt={pin.label}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#d4a853]/20 text-[#f0cf85] border border-[#d4a853]/40">
                  {entity?.type || pin.icon_type}
                </span>
                {pin.is_gm_only && (
                  <span className="text-[9.5px] font-bold uppercase text-red-300 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-500/40">
                    GM Only
                  </span>
                )}
              </div>
              <div className="font-serif text-[13px] font-semibold text-[#f3ead8] leading-snug mb-1">
                {entity?.title || pin.label}
              </div>
              <p className="text-[11px] text-[#b4bcc8] leading-snug line-clamp-3">
                {entity?.summary || 'Unlinked map marker. Click to inspect or bind to a vault note.'}
              </p>
            </div>
          )}

          {/* Pill Label Badge */}
          <button
            onMouseEnter={() => onHoverPin(pin.id)}
            onMouseLeave={() => onHoverPin(null)}
            onClick={(e) => {
              e.stopPropagation();
              onSelectPin(pin.id);
            }}
            className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors cursor-pointer shadow-lg ${
              isSelected
                ? 'bg-[#2a2214] text-[#f9e7b2] border border-[#eab308] shadow-gold-glow scale-105'
                : pin.is_gm_only
                ? 'bg-[#261115]/90 text-red-200 border border-red-500/50 hover:border-red-400'
                : 'bg-[#101319]/90 text-[#efe9dc] border border-[#d4a853]/45 hover:border-[#eab308] hover:bg-[#191e27]'
            }`}
          >
            <EntityIcon
              type={entity?.type || pin.icon_type}
              className={`w-3.5 h-3.5 ${pin.is_gm_only ? 'text-red-400' : 'text-[#eab308]'}`}
            />
            <span className="font-serif tracking-wide">{pin.label}</span>
          </button>

          {/* Pin stem dot */}
          <div
            className={`w-2 h-2 rounded-full mt-1 border border-white/60 shadow ${
              pin.is_gm_only ? 'bg-red-500' : 'bg-[#eab308]'
            }`}
          />
        </div>
      </Html>
    </group>
  );
});

/**
 * Renders directional shadows only when geometry, props, or atmosphere change
 * instead of re-rendering the 1024x1024 shadow map on every animation frame.
 */
const ShadowSyncController: React.FC<{ syncKey: string | number }> = React.memo(({ syncKey }) => {
  const { gl } = useThree();

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, syncKey]);

  return null;
});

interface TerrainHistorySnapshot {
  height: Float32Array;
  paint: Uint8Array;
  res: number;
  worldSize: number;
}

/**
 * Full 3D Scene inside R3F Canvas.
 */
const TerrainScene: React.FC<TerrainSceneProps> = ({
  mapData,
  terrainActionsRef,
  labelDraftRef,
  elementDraftRef,
  fogDraftRef,
  fogCommandSignal,
}) => {
  const {
    user,
    campaignMembers,
    entities,
    mapPins,
    mapPaths,
    mapFogStates,
    mapFogShares,
    questBoards,
    guildQuests,
    isEffectiveGm,
    mapRenderMode,
    mapCameraView,
    mapToolMode,
    mapLayers,
    selectedPinId,
    hoveredPinId,
    selectedZoneId,
    selectedLabelId,
    drawingPoints,
    cameraResetSignal,
    cameraTopViewSignal,
    cameraZoomSignal,
    zoneTransformSignal,
    setMapToolMode,
    setSelectedPinId,
    setHoveredPinId,
    setSelectedZoneId,
    setSelectedLabelId,
    setPendingPinCoord,
    addDrawingPoint,
    setScaleBarKm,
    worldsmithMode,
    worldsmithTool,
    brushRadius,
    brushStrength,
    brushFalloff,
    terraceSteps,
    activeStampKind,
    activeBiomePaint,
    activePropKind,
    selectedPropId,
    selectedFogId,
    activeFogPreset,
    terrainCommandSignal,
    riverDrawingPoints,
    setSelectedPropId,
    setSelectedFogId,
    addFogVolume,
    updateFogVolume,
    updateMapEnvironment,
    addRiverPoint,
    finishRiver,
    addMapProp,
    updateMapProp,
    deleteMapProp,
    updateMapZone,
    createMapLabel,
    updateMapLabel,
    updateMapAssets,
    updateMapFogState,
    createQuestBoard,
    setActiveQuestBoardModalId,
    fogBrushTargetUserId,
  } = useVaultStore(
    useShallow((s) => ({
      user: s.user,
      campaignMembers: s.campaignMembers,
      entities: s.entities,
      mapPins: s.mapPins,
      mapPaths: s.mapPaths,
      mapFogStates: s.mapFogStates,
      mapFogShares: s.mapFogShares,
      questBoards: s.questBoards,
      guildQuests: s.guildQuests,
      isEffectiveGm: s.isEffectiveGm,
      mapRenderMode: s.mapRenderMode,
      mapCameraView: s.mapCameraView,
      mapToolMode: s.mapToolMode,
      mapLayers: s.mapLayers,
      selectedPinId: s.selectedPinId,
      hoveredPinId: s.hoveredPinId,
      selectedZoneId: s.selectedZoneId,
      selectedLabelId: s.selectedLabelId,
      drawingPoints: s.drawingPoints,
      cameraResetSignal: s.cameraResetSignal,
      cameraTopViewSignal: s.cameraTopViewSignal,
      cameraZoomSignal: s.cameraZoomSignal,
      zoneTransformSignal: s.zoneTransformSignal,
      setMapToolMode: s.setMapToolMode,
      setSelectedPinId: s.setSelectedPinId,
      setHoveredPinId: s.setHoveredPinId,
      setSelectedZoneId: s.setSelectedZoneId,
      setSelectedLabelId: s.setSelectedLabelId,
      setPendingPinCoord: s.setPendingPinCoord,
      addDrawingPoint: s.addDrawingPoint,
      setScaleBarKm: s.setScaleBarKm,
      worldsmithMode: s.worldsmithMode,
      worldsmithTool: s.worldsmithTool,
      brushRadius: s.brushRadius,
      brushStrength: s.brushStrength,
      brushFalloff: s.brushFalloff,
      terraceSteps: s.terraceSteps,
      activeStampKind: s.activeStampKind,
      activeBiomePaint: s.activeBiomePaint,
      activePropKind: s.activePropKind,
      selectedPropId: s.selectedPropId,
      selectedFogId: s.selectedFogId,
      activeFogPreset: s.activeFogPreset,
      terrainCommandSignal: s.terrainCommandSignal,
      riverDrawingPoints: s.riverDrawingPoints,
      setSelectedPropId: s.setSelectedPropId,
      setSelectedFogId: s.setSelectedFogId,
      addFogVolume: s.addFogVolume,
      updateFogVolume: s.updateFogVolume,
      updateMapEnvironment: s.updateMapEnvironment,
      addRiverPoint: s.addRiverPoint,
      finishRiver: s.finishRiver,
      addMapProp: s.addMapProp,
      updateMapProp: s.updateMapProp,
      deleteMapProp: s.deleteMapProp,
      updateMapZone: s.updateMapZone,
      createMapLabel: s.createMapLabel,
      updateMapLabel: s.updateMapLabel,
      updateMapAssets: s.updateMapAssets,
      updateMapFogState: s.updateMapFogState,
      createQuestBoard: s.createQuestBoard,
      setActiveQuestBoardModalId: s.setActiveQuestBoardModalId,
      fogBrushTargetUserId: s.fogBrushTargetUserId,
    }))
  );

  const effectiveGm = isEffectiveGm();

  const controlsRef = useRef<OrbitControlsImpl>(null);
  const fogRef = useRef<THREE.Fog>(null);
  const terrainMeshRef = useRef<THREE.Mesh>(null);
  const terrainPatchHandleRef = useRef<TerrainPatchUpdater | null>(null);
  const brushCursorRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const { camera, gl } = useThree();

  useEffect(() => {
    if (!worldsmithMode && mapToolMode !== 'fog-brush') {
      brushCursorRef.current = null;
    }
  }, [worldsmithMode, mapToolMode]);

  const worldSize = getWorldSize(mapData);
  const terrainSegments = terrainSegmentsForWorldSize(worldSize);
  const waterSettings = useMemo(() => resolveWaterSettings(mapData), [mapData]);
  const terrainShading = useMemo(() => resolveTerrainShading(mapData), [mapData]);

  // Generate procedural terrain assets (memoized fallback for Shattered Reach)
  const procedural = useMemo(() => generateShatteredReachTerrain(512, worldSize), [worldSize]);

  const [heightTex, setHeightTex] = useState<THREE.Texture | null>(null);
  const [albedoTex, setAlbedoTex] = useState<THREE.Texture | null>(null);
  const [paintTex, setPaintTex] = useState<THREE.Texture | null>(null);
  const [fogTex, setFogTex] = useState<THREE.DataTexture | null>(null);
  const [fogGmAlpha, setFogGmAlpha] = useState<number>(1.0);
  const [activeHeightData, setActiveHeightData] = useState<Float32Array>(() => procedural.heightData.slice());
  const [activeHeightRes, setActiveHeightRes] = useState<number>(procedural.resolution);
  const [terrainVersion, setTerrainVersion] = useState(0);
  const [liveZoneOverride, setLiveZoneOverride] = useState<{
    id: string;
    points: PathPoint[];
  } | null>(null);

  const heightDataRef = useRef<Float32Array>(activeHeightData);
  const heightResRef = useRef<number>(activeHeightRes);
  const paintDataRef = useRef<Uint8Array>(new Uint8Array(procedural.resolution * procedural.resolution * 4));
  const liveHeightTexRef = useRef<THREE.DataTexture | null>(null);
  const livePaintTexRef = useRef<THREE.DataTexture | null>(null);
  const liveFogTexRef = useRef<THREE.DataTexture | null>(null);
  const fogMasksRef = useRef<Map<string, Uint8Array>>(new Map());
  const fogMaskUrlCacheRef = useRef<Map<string, Uint8Array>>(new Map());
  const isPaintingFogRef = useRef(false);
  const didMutateFogRef = useRef(false);
  const lastProcessedFogCmdSeqRef = useRef(fogCommandSignal.seq);
  const skipReloadHeightUrlRef = useRef<string | null>(null);
  const skipReloadPaintUrlRef = useRef<string | null>(null);
  const isSculptingRef = useRef(false);
  const didMutateTerrainRef = useRef(false);
  const flattenTargetRef = useRef<number>(SEA_LEVEL_NORM + 0.08);
  const lastSculptTsRef = useRef(0);
  const lastPaintPosRef = useRef<{ x: number; z: number } | null>(null);
  const lastBrushWorldPosRef = useRef<{ x: number; z: number } | null>(null);
  const draggingPropIdRef = useRef<string | null>(null);
  const draggingLabelIdRef = useRef<string | null>(null);
  const draggingFogIdRef = useRef<string | null>(null);
  const liveZoneOverrideRef = useRef<{ id: string; points: PathPoint[] } | null>(null);
  const zoneDragRef = useRef<{
    zoneId: string;
    mode: ZoneGizmoDragMode | 'vertex';
    vertexIndex: number;
    originPoints: PathPoint[];
    dragPlaneY: number;
    startXZ: { x: number; z: number };
    didMove: boolean;
  } | null>(null);
  const justFinishedZoneDragRef = useRef(false);
  const zoneDragTimerRef = useRef<number | null>(null);
  const undoStackRef = useRef<TerrainHistorySnapshot[]>([]);
  const redoStackRef = useRef<TerrainHistorySnapshot[]>([]);
  const lastProcessedCmdSeqRef = useRef<number>(0);
  const lastZoneCmdSeqRef = useRef<number>(zoneTransformSignal.seq);

  const activeSeaNorm = getSeaLevelNorm(mapData);
  const displacementScale = mapData.displacement_scale || DEFAULT_DISPLACEMENT;
  const effectiveDisplacementScale = mapLayers.terrain ? displacementScale : 0.4;
  const seaY = activeSeaNorm * effectiveDisplacementScale;

  // Load & compose per-player + peer-shared Fog of War texture
  useEffect(() => {
    let cancelled = false;
    const mapRows = mapFogStates.filter((f) => f.map_id === mapData.id);
    const fogPreviewActive =
      (effectiveGm && !worldsmithMode && mapToolMode === 'fog-brush') ||
      (!effectiveGm && mapLayers.fogOfWar !== false && mapRows.length > 0);

    if (!fogPreviewActive) {
      setFogTex(null);
      setFogGmAlpha(1.0);
      return;
    }

    const resolveUrlMask = async (url: string): Promise<Uint8Array | null> => {
      const cached = fogMaskUrlCacheRef.current.get(url);
      if (cached) return cached;
      const loaded = await loadMaskFromUrl(url);
      if (loaded) fogMaskUrlCacheRef.current.set(url, loaded);
      return loaded;
    };

    const syncFog = async () => {
      if (effectiveGm) {
        const targetId = fogBrushTargetUserId || '__all__';
        let mask = fogMasksRef.current.get(targetId);
        if (!mask) {
          const matchingRows =
            targetId === '__all__'
              ? mapRows
              : mapRows.filter((r) => r.user_id === targetId);
          if (matchingRows.length > 0) {
            const loaded = (
              await Promise.all(matchingRows.map((r) => resolveUrlMask(r.mask_url)))
            ).filter((m): m is Uint8Array => Boolean(m));
            mask = loaded.length > 0 ? unionFogMasks(loaded) : createFogMask(0);
          } else {
            mask = createFogMask(0);
          }
          fogMasksRef.current.set(targetId, mask.slice());
        }
        if (cancelled) return;
        const tex = buildFogDataTexture(mask, liveFogTexRef.current);
        liveFogTexRef.current = tex;
        setFogTex(tex);
        setFogGmAlpha(0.52);
        return;
      }

      // Player view: own fog row + any peer shares targeted at me or all
      const shareRows = mapFogShares.filter(
        (sh) =>
          sh.map_id === mapData.id &&
          (sh.share_all || (user?.id && sh.shared_with_user_id === user.id))
      );
      const allowedOwners = new Set<string>();
      if (user?.id) allowedOwners.add(user.id);
      shareRows.forEach((sh) => allowedOwners.add(sh.owner_user_id));

      const urls = mapRows
        .filter((r) => allowedOwners.has(r.user_id) && Boolean(r.mask_url))
        .map((r) => r.mask_url);

      const loaded = (await Promise.all(urls.map(resolveUrlMask))).filter(
        (m): m is Uint8Array => Boolean(m)
      );
      if (cancelled) return;
      const composite = loaded.length > 0 ? unionFogMasks(loaded) : createFogMask(0);
      const tex = buildFogDataTexture(composite, liveFogTexRef.current);
      liveFogTexRef.current = tex;
      setFogTex(tex);
      setFogGmAlpha(1.0);
    };

    syncFog();
    return () => {
      cancelled = true;
    };
  }, [
    mapData.id,
    mapFogStates,
    mapFogShares,
    effectiveGm,
    worldsmithMode,
    mapToolMode,
    mapLayers.fogOfWar,
    user?.id,
    fogBrushTargetUserId,
  ]);

  const commitFogMask = useCallback(
    async (targetUserId: string, mask: Uint8Array) => {
      try {
        const blob = await maskToCanvasBlob(mask);
        const safeTarget = targetUserId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const url = await uploadAssetDataUrlOrBlob(
          blob,
          `fog/${mapData.id}`,
          `fog-${safeTarget}-${Date.now()}.png`
        );
        fogMaskUrlCacheRef.current.set(url, mask.slice());
        await updateMapFogState(mapData.id, targetUserId, url);
      } catch (err) {
        console.warn('Failed to upload 3D fog mask:', err);
      }
    },
    [mapData.id, updateMapFogState]
  );

  // Handle Reveal All / Reset Shroud triggers from the Fog Brush toolbar
  useEffect(() => {
    if (
      fogCommandSignal.seq === 0 ||
      fogCommandSignal.seq === lastProcessedFogCmdSeqRef.current
    ) {
      return;
    }
    lastProcessedFogCmdSeqRef.current = fogCommandSignal.seq;
    const targetId = fogDraftRef.current.targetUserId || '__all__';
    const nextMask = createFogMask(fogCommandSignal.action === 'reveal-all' ? 255 : 0);
    fogMasksRef.current.set(targetId, nextMask);
    if (targetId === '__all__') {
      campaignMembers.forEach((m) => fogMasksRef.current.set(m.user_id, nextMask.slice()));
    }
    const tex = buildFogDataTexture(nextMask, liveFogTexRef.current);
    liveFogTexRef.current = tex;
    setFogTex(tex);
    setFogGmAlpha(0.52);
    void commitFogMask(targetId, nextMask);
  }, [fogCommandSignal, fogDraftRef, campaignMembers, commitFogMask]);

  const pushUndoSnapshot = useCallback(() => {
    const snap: TerrainHistorySnapshot = {
      height: heightDataRef.current.slice(),
      paint: paintDataRef.current.slice(),
      res: heightResRef.current,
      worldSize,
    };
    undoStackRef.current.push(snap);
    if (undoStackRef.current.length > 16) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  }, [worldSize]);

  const commitBakedTextures = useCallback(
    async (extraPatch?: Partial<VaultMap>) => {
      const res = heightResRef.current;
      let hasAnyPaint = false;
      const pBuf = paintDataRef.current;
      for (let i = 3; i < pBuf.length; i += 4) {
        if (pBuf[i] > 2) {
          hasAnyPaint = true;
          break;
        }
      }
      const baked = buildTexturesFromHeightData(
        heightDataRef.current,
        res,
        activeSeaNorm,
        hasAnyPaint ? pBuf : null,
        res
      );

      let finalHeightUrl = baked.heightmapDataUrl;
      let finalAlbedoUrl = baked.albedoDataUrl;
      let finalPaintUrl = baked.paintDataUrl ?? null;

      try {
        const [hUp, aUp, pUp] = await Promise.all([
          uploadAssetDataUrlOrBlob(
            baked.heightmapDataUrl,
            `terrain/${mapData.id}`,
            `height-${Date.now()}.png`
          ),
          uploadAssetDataUrlOrBlob(
            baked.albedoDataUrl,
            `terrain/${mapData.id}`,
            `albedo-${Date.now()}.png`
          ),
          baked.paintDataUrl
            ? uploadAssetDataUrlOrBlob(
                baked.paintDataUrl,
                `terrain/${mapData.id}`,
                `paint-${Date.now()}.png`
              )
            : Promise.resolve(null),
        ]);
        finalHeightUrl = hUp;
        finalAlbedoUrl = aUp;
        finalPaintUrl = pUp;
      } catch {
        // Fallback to local baked data URLs when offline or unauthenticated
      }

      skipReloadHeightUrlRef.current = finalHeightUrl;
      if (finalPaintUrl) {
        skipReloadPaintUrlRef.current = finalPaintUrl;
      }
      const loader = new THREE.TextureLoader();
      loader.load(finalAlbedoUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        setAlbedoTex(tex);
      });
      updateMapAssets(mapData.id, {
        heightmap_url: finalHeightUrl,
        albedo_url: finalAlbedoUrl,
        paint_url: finalPaintUrl,
        ...extraPatch,
      });
    },
    [activeSeaNorm, mapData.id, updateMapAssets]
  );

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    const targetRes = heightResForWorldSize(worldSize);
    const hUrl = mapData.heightmap_url || procedural.heightmapDataUrl;
    const aUrl = mapData.albedo_url || procedural.albedoDataUrl;

    if (skipReloadHeightUrlRef.current && mapData.heightmap_url === skipReloadHeightUrlRef.current) {
      skipReloadHeightUrlRef.current = null;
    } else {
      loader.load(hUrl, (tex) => {
        tex.colorSpace = THREE.LinearSRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        const extracted =
          mapData.heightmap_url && tex.image
            ? extractHeightDataFromImage(tex.image, targetRes)
            : procedural.heightData.slice();
        const res = mapData.heightmap_url ? targetRes : procedural.resolution;
        heightDataRef.current = extracted;
        heightResRef.current = res;
        const liveTex = buildLiveHeightDataTexture(extracted, res);
        liveHeightTexRef.current?.dispose();
        liveHeightTexRef.current = liveTex;
        setHeightTex(liveTex);
        setActiveHeightData(extracted);
        setActiveHeightRes(res);

        // Initialize or resize paint buffer to match resolution
        if (paintDataRef.current.length !== res * res * 4) {
          paintDataRef.current = new Uint8Array(res * res * 4);
        }
        const livePTex = buildLivePaintDataTexture(paintDataRef.current, res);
        livePaintTexRef.current?.dispose();
        livePaintTexRef.current = livePTex;
        setPaintTex(livePTex);

        setTerrainVersion((v) => v + 1);
      });
    }

    if (mapData.paint_url) {
      if (skipReloadPaintUrlRef.current && mapData.paint_url === skipReloadPaintUrlRef.current) {
        skipReloadPaintUrlRef.current = null;
      } else {
        loader.load(mapData.paint_url, (ptex) => {
          if (ptex.image) {
            const res = heightResRef.current;
            const extractedPaint = extractRgbaDataFromImage(ptex.image, res);
            paintDataRef.current = extractedPaint;
            const livePTex = buildLivePaintDataTexture(extractedPaint, res);
            livePaintTexRef.current?.dispose();
            livePaintTexRef.current = livePTex;
            setPaintTex(livePTex);
          }
        });
      }
    }

    loader.load(aUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      setAlbedoTex(tex);
    });
  }, [mapData.id, mapData.heightmap_url, mapData.albedo_url, mapData.paint_url, procedural, worldSize]);

  // Execute global terrain commands (Undo, Redo, Save Textures, Blank Canvas, Smooth All, Erode All, Noise Detail, Expand World, etc.)
  useEffect(() => {
    if (
      terrainCommandSignal.seq === 0 ||
      terrainCommandSignal.seq === lastProcessedCmdSeqRef.current ||
      !terrainCommandSignal.cmd
    ) {
      return;
    }
    lastProcessedCmdSeqRef.current = terrainCommandSignal.seq;
    const cmd = terrainCommandSignal.cmd;

    const syncAllLiveTextures = () => {
      const res = heightResRef.current;
      if (liveHeightTexRef.current) {
        syncLiveHeightDataTexture(liveHeightTexRef.current, heightDataRef.current, res);
      } else {
        const liveTex = buildLiveHeightDataTexture(heightDataRef.current, res);
        liveHeightTexRef.current = liveTex;
        setHeightTex(liveTex);
      }
      if (livePaintTexRef.current) {
        syncLivePaintDataTexture(livePaintTexRef.current, paintDataRef.current);
      }
      setActiveHeightData(heightDataRef.current);
      setActiveHeightRes(res);
      setTerrainVersion((v) => v + 1);
    };

    if (cmd.type === 'save-textures') {
      void commitBakedTextures();
      return;
    }

    if (cmd.type === 'undo') {
      const prev = undoStackRef.current.pop();
      if (!prev) return;
      redoStackRef.current.push({
        height: heightDataRef.current.slice(),
        paint: paintDataRef.current.slice(),
        res: heightResRef.current,
        worldSize,
      });
      heightDataRef.current = prev.height;
      paintDataRef.current = prev.paint;
      heightResRef.current = prev.res;
      syncAllLiveTextures();
      void commitBakedTextures();
      return;
    }

    if (cmd.type === 'redo') {
      const next = redoStackRef.current.pop();
      if (!next) return;
      undoStackRef.current.push({
        height: heightDataRef.current.slice(),
        paint: paintDataRef.current.slice(),
        res: heightResRef.current,
        worldSize,
      });
      heightDataRef.current = next.height;
      paintDataRef.current = next.paint;
      heightResRef.current = next.res;
      syncAllLiveTextures();
      void commitBakedTextures();
      return;
    }

    pushUndoSnapshot();

    if (cmd.type === 'blank') {
      applyGlobalBlankTerrain(
        heightDataRef.current,
        heightResRef.current,
        cmd.preset,
        activeSeaNorm,
        cmd.seed ?? Date.now()
      );
      paintDataRef.current.fill(0);
      syncAllLiveTextures();
      void commitBakedTextures();
    } else if (cmd.type === 'smooth-all') {
      const passes = Math.max(1, cmd.iterations || 2);
      for (let i = 0; i < passes; i++) {
        applyGlobalSmooth(heightDataRef.current, heightResRef.current, 0.55);
      }
      syncAllLiveTextures();
      void commitBakedTextures();
    } else if (cmd.type === 'erode-all') {
      applyGlobalThermalErosion(
        heightDataRef.current,
        heightResRef.current,
        cmd.iterations || 5
      );
      syncAllLiveTextures();
      void commitBakedTextures();
    } else if (cmd.type === 'noise-all') {
      applyGlobalNoiseDetail(
        heightDataRef.current,
        heightResRef.current,
        (cmd.amount ?? 0.35) * 0.14,
        Date.now() % 10000
      );
      syncAllLiveTextures();
      void commitBakedTextures();
    } else if (cmd.type === 'raise-all') {
      applyGlobalHeightOffset(heightDataRef.current, cmd.delta);
      syncAllLiveTextures();
      void commitBakedTextures();
    } else if (cmd.type === 'clear-paint') {
      paintDataRef.current.fill(0);
      syncAllLiveTextures();
      void commitBakedTextures({ paint_url: null });
    } else if (cmd.type === 'expand') {
      const newSize = cmd.newWorldSize;
      const newRes = heightResForWorldSize(newSize);
      const expanded = expandHeightDataToWorldSize(
        heightDataRef.current,
        heightResRef.current,
        worldSize,
        newSize,
        newRes,
        activeSeaNorm
      );
      heightDataRef.current = expanded;
      heightResRef.current = newRes;
      paintDataRef.current = new Uint8Array(newRes * newRes * 4);
      const liveTex = buildLiveHeightDataTexture(expanded, newRes);
      liveHeightTexRef.current?.dispose();
      liveHeightTexRef.current = liveTex;
      setHeightTex(liveTex);
      const livePTex = buildLivePaintDataTexture(paintDataRef.current, newRes);
      livePaintTexRef.current?.dispose();
      livePaintTexRef.current = livePTex;
      setPaintTex(livePTex);
      setActiveHeightData(expanded);
      setActiveHeightRes(newRes);
      setTerrainVersion((v) => v + 1);
      updateMapEnvironment(mapData.id, { world_size: newSize });
      void commitBakedTextures({ world_size: newSize, paint_url: null });
    }
  }, [
    terrainCommandSignal,
    worldSize,
    activeSeaNorm,
    pushUndoSnapshot,
    commitBakedTextures,
    updateMapEnvironment,
    mapData.id,
  ]);

  // Register river carving action handle for the UI toolbar
  useEffect(() => {
    terrainActionsRef.current = {
      carveRiver: (name: string, width: number, depth: number) => {
        const pts = useVaultStore.getState().riverDrawingPoints;
        if (pts.length < 2) return;
        pushUndoSnapshot();
        const riverDraft = {
          id: `river-draft-${Date.now()}`,
          name: name.trim() || 'Carved River',
          points: pts,
          width,
          depth,
        };
        carveRiverIntoHeightData(
          heightDataRef.current,
          heightResRef.current,
          riverDraft,
          displacementScale,
          activeSeaNorm,
          worldSize
        );
        if (liveHeightTexRef.current) {
          syncLiveHeightDataTexture(liveHeightTexRef.current, heightDataRef.current, heightResRef.current);
        }
        setTerrainVersion((v) => v + 1);
        finishRiver(mapData.id, name, width, depth);
        void commitBakedTextures();
      },
    };
    return () => {
      terrainActionsRef.current = null;
    };
  }, [terrainActionsRef, displacementScale, activeSeaNorm, worldSize, finishRiver, mapData.id, commitBakedTextures, pushUndoSnapshot]);

  // Initialize OrbitControls target once on mount
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.copy(DEFAULT_TARGET);
      controlsRef.current.update();
    }
  }, []);

  // Camera Reset (3D Perspective) handler
  useEffect(() => {
    if (cameraResetSignal === 0) return;
    const scale = Math.max(0.85, worldSize / 150);
    camera.position.set(DEFAULT_CAMERA_POS.x * scale, DEFAULT_CAMERA_POS.y * scale, DEFAULT_CAMERA_POS.z * scale);
    if (controlsRef.current) {
      controlsRef.current.target.copy(DEFAULT_TARGET);
      controlsRef.current.update();
    }
  }, [cameraResetSignal, camera, worldSize]);

  // Camera Top-Down Whole World View handler
  useEffect(() => {
    if (cameraTopViewSignal === 0) return;
    const topY = Math.max(148, worldSize * 1.38);
    camera.position.set(0, topY, 0.01);
    if (controlsRef.current) {
      controlsRef.current.target.copy(TOP_TARGET);
      controlsRef.current.update();
    }
  }, [cameraTopViewSignal, camera, worldSize]);

  // Camera Zoom +/- handler
  useEffect(() => {
    if (cameraZoomSignal.seq === 0 || !controlsRef.current) return;
    const target = controlsRef.current.target;
    const dir = camera.position.clone().sub(target);
    const factor = cameraZoomSignal.delta > 0 ? 0.8 : 1.25;
    const maxDist = Math.max(240, worldSize * 2.1);
    const nextLen = THREE.MathUtils.clamp(dir.length() * factor, 12, maxDist);
    dir.setLength(nextLen);
    camera.position.copy(target).add(dir);
    controlsRef.current.update();
  }, [cameraZoomSignal, camera, worldSize]);

  // Update dynamic scale bar km + whole-world fog distance smoothly based on camera distance
  const lastKmRef = useRef(40);
  useFrame(() => {
    if (fogRef.current) {
      const camLen = camera.position.length();
      const sizeScale = Math.max(1, worldSize / 100);
      const topBlend = THREE.MathUtils.smoothstep(camLen, 85 * sizeScale, 155 * sizeScale);
      fogRef.current.near = THREE.MathUtils.lerp(76 * sizeScale, 280 * sizeScale, topBlend);
      fogRef.current.far = THREE.MathUtils.lerp(165 * sizeScale, 560 * sizeScale, topBlend);
    }
    if (!controlsRef.current) return;
    const dist = camera.position.distanceTo(controlsRef.current.target);
    const computed = Math.max(5, Math.round((dist * (mapData.scale_config?.kmPerUnit ?? 1.8)) / 2.8 / 5) * 5);
    if (computed !== lastKmRef.current) {
      lastKmRef.current = computed;
      setScaleBarKm(computed);
    }
  });

  const isBrushTool = (t: WorldsmithTool) =>
    t === 'raise' ||
    t === 'valley' ||
    t === 'flatten' ||
    t === 'smooth' ||
    t === 'coast' ||
    t === 'ridge' ||
    t === 'noise' ||
    t === 'terrace' ||
    t === 'erode';

  const applyBrushAtPoint = useCallback(
    (wx: number, wz: number, invert = false) => {
      let strokeDirX = 0;
      let strokeDirZ = 0;
      if (lastBrushWorldPosRef.current) {
        const dx = wx - lastBrushWorldPosRef.current.x;
        const dz = wz - lastBrushWorldPosRef.current.z;
        if (Math.hypot(dx, dz) > 0.15) {
          strokeDirX = dx;
          strokeDirZ = dz;
          lastBrushWorldPosRef.current = { x: wx, z: wz };
        }
      } else {
        lastBrushWorldPosRef.current = { x: wx, z: wz };
      }

      const bounds = applyTerrainBrush(heightDataRef.current, heightResRef.current, wx, wz, {
        tool: worldsmithTool,
        radius: brushRadius,
        strength: brushStrength,
        falloff: brushFalloff,
        targetHeightNorm: flattenTargetRef.current,
        seaLevelNorm: activeSeaNorm,
        invert,
        terrainSize: worldSize,
        terraceSteps,
        strokeDir:
          strokeDirX !== 0 || strokeDirZ !== 0 ? { x: strokeDirX, z: strokeDirZ } : null,
      });
      terrainPatchHandleRef.current?.(bounds.minWx, bounds.maxWx, bounds.minWz, bounds.maxWz);
      didMutateTerrainRef.current = true;
      const now = performance.now();
      if (now - lastSculptTsRef.current >= 90) {
        lastSculptTsRef.current = now;
        if (liveHeightTexRef.current) {
          syncLiveHeightDataTexture(liveHeightTexRef.current, heightDataRef.current, heightResRef.current);
        }
      }
    },
    [worldsmithTool, brushRadius, brushStrength, brushFalloff, activeSeaNorm, worldSize, terraceSteps]
  );

  const applyPaintAtPoint = useCallback(
    (wx: number, wz: number, erase = false) => {
      applyBiomePaintBrush(paintDataRef.current, heightResRef.current, wx, wz, {
        biome: activeBiomePaint,
        radius: brushRadius,
        strength: brushStrength,
        falloff: brushFalloff,
        terrainSize: worldSize,
        invert: erase,
      });
      didMutateTerrainRef.current = true;
      if (livePaintTexRef.current) {
        syncLivePaintDataTexture(livePaintTexRef.current, paintDataRef.current);
      }
    },
    [activeBiomePaint, brushRadius, brushStrength, brushFalloff, worldSize]
  );

  const stampFloraAtPoint = useCallback(
    (wx: number, wz: number) => {
      const count = activePropKind === 'boulder' ? 2 : 3;
      const kindToPlace =
        activePropKind === 'pine' ||
        activePropKind === 'oak' ||
        activePropKind === 'deadwood' ||
        activePropKind === 'boulder'
          ? activePropKind
          : 'pine';
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.random() * brushRadius * 0.85;
        const px = wx + Math.cos(ang) * rad;
        const pz = wz + Math.sin(ang) * rad;
        const py = sampleTerrainElevation(
          heightDataRef.current,
          heightResRef.current,
          px,
          pz,
          worldSize,
          effectiveDisplacementScale
        );
        if (py < seaY + 0.15 && kindToPlace !== 'boulder') continue;
        addMapProp(mapData.id, {
          kind: kindToPlace,
          x: Number(px.toFixed(2)),
          y: Number(py.toFixed(2)),
          z: Number(pz.toFixed(2)),
          rotY: Number((Math.random() * Math.PI * 2).toFixed(2)),
          scale: Number((0.6 + Math.random() * 0.5).toFixed(2)),
        });
      }
    },
    [activePropKind, brushRadius, worldSize, effectiveDisplacementScale, seaY, addMapProp, mapData.id]
  );

  const erasePropsWithinRadius = useCallback(
    (wx: number, wz: number) => {
      const currentProps = mapData.props || [];
      const rSq = brushRadius * brushRadius;
      for (const p of currentProps) {
        const dx = p.x - wx;
        const dz = p.z - wz;
        if (dx * dx + dz * dz <= rSq) {
          deleteMapProp(mapData.id, p.id);
        }
      }
    },
    [mapData.props, mapData.id, brushRadius, deleteMapProp]
  );

  const raycastScreenToXZ = useCallback(
    (
      clientX: number,
      clientY: number,
      mode: ZoneGizmoDragMode | 'vertex',
      dragPlaneY: number
    ): { x: number; z: number } | null => {
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = raycasterRef.current;
      raycaster.setFromCamera(ndc, camera);

      if (mode === 'vertex') {
        const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -seaY);
        const seaHit = new THREE.Vector3();
        const hasSeaHit = raycaster.ray.intersectPlane(seaPlane, seaHit) !== null;
        const seaDist = hasSeaHit ? camera.position.distanceTo(seaHit) : Infinity;

        if (terrainMeshRef.current && mapLayers.terrain) {
          const hits = raycaster.intersectObject(terrainMeshRef.current, false);
          if (hits.length > 0 && hits[0].point.y >= seaY - 0.02 && hits[0].distance <= seaDist + 0.05) {
            return { x: hits[0].point.x, z: hits[0].point.z };
          }
        }
        if (hasSeaHit) {
          return { x: seaHit.x, z: seaHit.z };
        }
      }

      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -dragPlaneY);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      return { x: hit.x, z: hit.z };
    },
    [gl, camera, seaY, mapLayers.terrain]
  );

  const startZoneGizmoDrag = useCallback(
    (zone: WorldMapZone, mode: ZoneGizmoDragMode, e: ThreeEvent<PointerEvent>) => {
      const dragPlaneY = e.point.y;
      const startXZ = raycastScreenToXZ(
        e.nativeEvent.clientX,
        e.nativeEvent.clientY,
        mode,
        dragPlaneY
      ) || { x: e.point.x, z: e.point.z };
      zoneDragRef.current = {
        zoneId: zone.id,
        mode,
        vertexIndex: -1,
        originPoints: zone.points.map((p) => ({ ...p })),
        dragPlaneY,
        startXZ,
        didMove: false,
      };
      if (controlsRef.current) controlsRef.current.enabled = false;
    },
    [raycastScreenToXZ]
  );

  const startZoneVertexDrag = useCallback(
    (zone: WorldMapZone, vertexIndex: number, e: ThreeEvent<PointerEvent>) => {
      const origin = zone.points[vertexIndex];
      const dragPlaneY = origin ? Math.max(seaY, origin.y) : e.point.y;
      const startXZ = raycastScreenToXZ(
        e.nativeEvent.clientX,
        e.nativeEvent.clientY,
        'vertex',
        dragPlaneY
      ) || { x: e.point.x, z: e.point.z };
      zoneDragRef.current = {
        zoneId: zone.id,
        mode: 'vertex',
        vertexIndex,
        originPoints: zone.points.map((p) => ({ ...p })),
        dragPlaneY,
        startXZ,
        didMove: false,
      };
      if (controlsRef.current) controlsRef.current.enabled = false;
    },
    [raycastScreenToXZ, seaY]
  );

  const insertZoneVertexAndDrag = useCallback(
    (
      zone: WorldMapZone,
      insertIndex: number,
      pt: { x: number; y: number; z: number },
      e: ThreeEvent<PointerEvent>
    ) => {
      const snapped = snapPointToLandOrSea(
        pt.x,
        pt.z,
        heightDataRef.current,
        heightResRef.current,
        effectiveDisplacementScale,
        seaY,
        worldSize
      );
      const nextPoints = [...zone.points.map((p) => ({ ...p }))];
      nextPoints.splice(insertIndex, 0, snapped);

      const override = { id: zone.id, points: nextPoints };
      liveZoneOverrideRef.current = override;
      setLiveZoneOverride(override);

      const startXZ = raycastScreenToXZ(
        e.nativeEvent.clientX,
        e.nativeEvent.clientY,
        'vertex',
        snapped.y
      ) || { x: snapped.x, z: snapped.z };

      zoneDragRef.current = {
        zoneId: zone.id,
        mode: 'vertex',
        vertexIndex: insertIndex,
        originPoints: nextPoints,
        dragPlaneY: snapped.y,
        startXZ,
        didMove: true,
      };
      if (controlsRef.current) controlsRef.current.enabled = false;
    },
    [raycastScreenToXZ, effectiveDisplacementScale, seaY, worldSize]
  );

  const removeZoneVertex = useCallback(
    (zone: WorldMapZone, vertexIndex: number) => {
      if (zone.points.length <= 3) return;
      const nextPoints = zone.points.filter((_, idx) => idx !== vertexIndex);
      updateMapZone(mapData.id, zone.id, { points: nextPoints });
    },
    [updateMapZone, mapData.id]
  );

  const handleSelectZone = useCallback(
    (zoneId: string) => {
      if (justFinishedZoneDragRef.current) return;
      setSelectedZoneId(zoneId);
    },
    [setSelectedZoneId]
  );

  useEffect(() => {
    const finishZoneDrag = () => {
      const drag = zoneDragRef.current;
      if (!drag) return;
      zoneDragRef.current = null;
      const committed = liveZoneOverrideRef.current;
      liveZoneOverrideRef.current = null;
      setLiveZoneOverride(null);
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
      }
      if (drag.didMove && committed && committed.id === drag.zoneId) {
        updateMapZone(mapData.id, drag.zoneId, { points: committed.points });
      }
      justFinishedZoneDragRef.current = true;
      if (zoneDragTimerRef.current !== null) {
        window.clearTimeout(zoneDragTimerRef.current);
      }
      zoneDragTimerRef.current = window.setTimeout(() => {
        justFinishedZoneDragRef.current = false;
        zoneDragTimerRef.current = null;
      }, 90);
    };

    const onWindowPointerMove = (ev: PointerEvent) => {
      const drag = zoneDragRef.current;
      if (!drag) return;
      if ((ev.buttons & 1) === 0) {
        finishZoneDrag();
        return;
      }
      const curXZ = raycastScreenToXZ(ev.clientX, ev.clientY, drag.mode, drag.dragPlaneY);
      if (!curXZ) return;

      if (drag.mode === 'vertex') {
        const snapped = snapPointToLandOrSea(
          curXZ.x,
          curXZ.z,
          heightDataRef.current,
          heightResRef.current,
          effectiveDisplacementScale,
          seaY,
          worldSize
        );
        const nextPoints = drag.originPoints.map((p, idx) =>
          idx === drag.vertexIndex ? snapped : p
        );
        drag.didMove = true;
        const nextOverride = { id: drag.zoneId, points: nextPoints };
        liveZoneOverrideRef.current = nextOverride;
        setLiveZoneOverride(nextOverride);
        return;
      }

      const rawDx = curXZ.x - drag.startXZ.x;
      const rawDz = curXZ.z - drag.startXZ.z;
      const dx = drag.mode === 'move-z' ? 0 : rawDx;
      const dz = drag.mode === 'move-x' ? 0 : rawDz;
      if (Math.hypot(dx, dz) < 0.04 && !drag.didMove) return;

      drag.didMove = true;
      const nextPoints = translatePolygonPointsOnSurface(
        drag.originPoints,
        dx,
        dz,
        heightDataRef.current,
        heightResRef.current,
        effectiveDisplacementScale,
        seaY,
        worldSize
      );
      const nextOverride = { id: drag.zoneId, points: nextPoints };
      liveZoneOverrideRef.current = nextOverride;
      setLiveZoneOverride(nextOverride);
    };

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', finishZoneDrag);
    window.addEventListener('pointercancel', finishZoneDrag);
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', finishZoneDrag);
      window.removeEventListener('pointercancel', finishZoneDrag);
      if (zoneDragTimerRef.current !== null) {
        window.clearTimeout(zoneDragTimerRef.current);
        zoneDragTimerRef.current = null;
      }
    };
  }, [raycastScreenToXZ, effectiveDisplacementScale, seaY, worldSize, updateMapZone, mapData.id]);

  // Apply inspector rotate/scale/snap transforms to currently selected zone on land/sea
  useEffect(() => {
    if (zoneTransformSignal.seq === lastZoneCmdSeqRef.current) return;
    lastZoneCmdSeqRef.current = zoneTransformSignal.seq;
    if (!selectedZoneId) return;
    const zone = (mapData.zones || []).find((z) => z.id === selectedZoneId);
    if (!zone || zone.points.length < 3) return;

    if (zoneTransformSignal.action === 'rotate') {
      const rad = (zoneTransformSignal.value * Math.PI) / 180;
      const nextPoints = transformPolygonPointsOnSurface(
        zone.points,
        1,
        rad,
        heightDataRef.current,
        heightResRef.current,
        effectiveDisplacementScale,
        seaY,
        worldSize
      );
      updateMapZone(mapData.id, zone.id, { points: nextPoints });
    } else if (zoneTransformSignal.action === 'scale') {
      const nextPoints = transformPolygonPointsOnSurface(
        zone.points,
        zoneTransformSignal.value,
        0,
        heightDataRef.current,
        heightResRef.current,
        effectiveDisplacementScale,
        seaY,
        worldSize
      );
      updateMapZone(mapData.id, zone.id, { points: nextPoints });
    } else if (zoneTransformSignal.action === 'snap') {
      const nextPoints = translatePolygonPointsOnSurface(
        zone.points,
        0,
        0,
        heightDataRef.current,
        heightResRef.current,
        effectiveDisplacementScale,
        seaY,
        worldSize
      );
      updateMapZone(mapData.id, zone.id, { points: nextPoints });
    }
  }, [
    zoneTransformSignal,
    selectedZoneId,
    mapData.zones,
    mapData.id,
    effectiveDisplacementScale,
    seaY,
    worldSize,
    updateMapZone,
  ]);

  const handleSurfaceClick = (e: ThreeEvent<MouseEvent>) => {
    const live = useVaultStore.getState();
    if (live.worldsmithMode) return;
    if (justFinishedZoneDragRef.current) return;
    if (e.delta > 6) return;
    e.stopPropagation();

    if (live.mapToolMode === 'select') {
      setSelectedPinId(null);
      setSelectedZoneId(null);
      setSelectedLabelId(null);
      setSelectedPropId(null);
      setSelectedFogId(null);
    }
  };

  const paintFogAtPoint = useCallback(
    (wx: number, wz: number) => {
      const targetId = fogDraftRef.current.targetUserId || '__all__';
      let mask = fogMasksRef.current.get(targetId);
      if (!mask) {
        mask = createFogMask(0);
        fogMasksRef.current.set(targetId, mask);
      }
      const { u, v } = worldXZToMaskNorm(wx, wz, worldSize);
      const radiusNorm = Math.max(0.015, fogDraftRef.current.radius / Math.max(1, worldSize));
      const changed = paintFogCircle(mask, u, v, radiusNorm, fogDraftRef.current.reveal);
      if (changed) {
        didMutateFogRef.current = true;
        const tex = buildFogDataTexture(mask, liveFogTexRef.current);
        liveFogTexRef.current = tex;
        setFogTex(tex);
        setFogGmAlpha(0.52);
      }
    },
    [worldSize, fogDraftRef]
  );

  const handleTerrainPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const live = useVaultStore.getState();
    const liveWorldsmith = live.worldsmithMode;
    const liveToolMode = live.mapToolMode;
    const liveWorldsmithTool = live.worldsmithTool;
    const liveEffectiveGm = live.isEffectiveGm();

    if (!liveWorldsmith) {
      if (!liveEffectiveGm || liveToolMode === 'select' || liveToolMode === 'link') return;
      e.stopPropagation();
      const pt = {
        x: Number(e.point.x.toFixed(2)),
        y: Number(e.point.y.toFixed(2)),
        z: Number(e.point.z.toFixed(2)),
      };

      if (liveToolMode === 'pin') {
        setPendingPinCoord(pt);
      } else if (liveToolMode === 'quest-board') {
        void createQuestBoard({
          map_id: mapData.id,
          title: 'Guild Quest Board',
          x: pt.x,
          y: pt.y,
          z: pt.z,
        }).then((board) => {
          if (board) setActiveQuestBoardModalId(board.id);
        });
        setMapToolMode('select');
      } else if (liveToolMode === 'fog-brush') {
        brushCursorRef.current = { x: e.point.x, y: e.point.y, z: e.point.z };
        isPaintingFogRef.current = true;
        didMutateFogRef.current = false;
        paintFogAtPoint(e.point.x, e.point.z);
        // Ensure a single click also persists an initial mask even if pointer moves 0px
        didMutateFogRef.current = true;
      } else if (liveToolMode === 'text') {
        const draft = labelDraftRef.current;
        createMapLabel(mapData.id, {
          text: draft.text.trim() || 'New Label',
          x: pt.x,
          y: pt.y,
          z: pt.z,
          yOffset: 0.9,
          fontSize: draft.fontSize,
          color: draft.color,
          rotationY: 0,
          style: draft.style,
          layerId: draft.layerId || null,
          opacity: 0.92,
          is_gm_only: false,
        });
        setMapToolMode('select');
      } else if (liveToolMode === 'path' || liveToolMode === 'region' || liveToolMode === 'zone') {
        const snappedPt = snapPointToLandOrSea(
          e.point.x,
          e.point.z,
          heightDataRef.current,
          heightResRef.current,
          effectiveDisplacementScale,
          seaY,
          worldSize
        );
        addDrawingPoint(snappedPt);
      } else if (liveToolMode === 'element') {
        const draft = elementDraftRef.current;
        const created = addMapProp(mapData.id, {
          kind: draft.kind,
          name: draft.name.trim() || undefined,
          x: pt.x,
          y: pt.y,
          z: pt.z,
          rotY: 0,
          scale: draft.scale,
        });
        setSelectedPropId(created.id);
      }
      return;
    }

    if (!liveEffectiveGm) return;
    e.stopPropagation();

    const pt = { x: e.point.x, y: e.point.y, z: e.point.z };
    brushCursorRef.current = pt;

    if (isBrushTool(liveWorldsmithTool)) {
      pushUndoSnapshot();
      isSculptingRef.current = true;
      didMutateTerrainRef.current = false;
      lastBrushWorldPosRef.current = { x: pt.x, z: pt.z };
      if (liveWorldsmithTool === 'flatten') {
        flattenTargetRef.current = e.point.y / Math.max(effectiveDisplacementScale, 0.01);
      }
      lastSculptTsRef.current = 0;
      applyBrushAtPoint(pt.x, pt.z, e.shiftKey);
    } else if (liveWorldsmithTool === 'stamp') {
      pushUndoSnapshot();
      applyTerrainStamp(heightDataRef.current, heightResRef.current, pt.x, pt.z, {
        stamp: activeStampKind,
        radius: brushRadius,
        strength: brushStrength,
        seaLevelNorm: activeSeaNorm,
        terrainSize: worldSize,
        invert: e.shiftKey,
      });
      if (liveHeightTexRef.current) {
        syncLiveHeightDataTexture(liveHeightTexRef.current, heightDataRef.current, heightResRef.current);
      }
      setTerrainVersion((v) => v + 1);
      void commitBakedTextures();
    } else if (liveWorldsmithTool === 'paint-biome') {
      pushUndoSnapshot();
      isSculptingRef.current = true;
      didMutateTerrainRef.current = false;
      applyPaintAtPoint(pt.x, pt.z, e.shiftKey);
    } else if (liveWorldsmithTool === 'fog') {
      addFogVolume(
        mapData.id,
        {
          x: Number(pt.x.toFixed(2)),
          y: Number(Math.max(seaY, pt.y).toFixed(2)),
          z: Number(pt.z.toFixed(2)),
        },
        activeFogPreset
      );
    } else if (liveWorldsmithTool === 'river') {
      addRiverPoint(pt);
    } else if (liveWorldsmithTool === 'paint-flora') {
      isSculptingRef.current = true;
      stampFloraAtPoint(pt.x, pt.z);
      lastPaintPosRef.current = { x: pt.x, z: pt.z };
    } else if (liveWorldsmithTool === 'place-mesh') {
      const isFlora =
        activePropKind === 'pine' ||
        activePropKind === 'oak' ||
        activePropKind === 'deadwood' ||
        activePropKind === 'boulder';
      const created = addMapProp(mapData.id, {
        kind: activePropKind,
        x: Number(pt.x.toFixed(2)),
        y: Number(pt.y.toFixed(2)),
        z: Number(pt.z.toFixed(2)),
        rotY: 0,
        scale: isFlora ? 0.85 : 1.15,
      });
      setSelectedPropId(created.id);
    } else if (liveWorldsmithTool === 'erase-mesh') {
      isSculptingRef.current = true;
      erasePropsWithinRadius(pt.x, pt.z);
    } else if (liveWorldsmithTool === 'edit-mesh') {
      setSelectedPropId(null);
      setSelectedFogId(null);
    }
  };

  const handleSurfacePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const pt = { x: e.point.x, y: e.point.y, z: e.point.z };
    const live = useVaultStore.getState();
    const liveEffectiveGm = live.isEffectiveGm();
    const liveWorldsmith = live.worldsmithMode;
    const liveToolMode = live.mapToolMode;
    const liveWorldsmithTool = live.worldsmithTool;

    if (liveEffectiveGm && draggingFogIdRef.current) {
      e.stopPropagation();
      updateFogVolume(mapData.id, draggingFogIdRef.current, {
        x: Number(pt.x.toFixed(2)),
        y: Number(Math.max(seaY, pt.y).toFixed(2)),
        z: Number(pt.z.toFixed(2)),
      });
      return;
    }

    if (liveEffectiveGm && draggingLabelIdRef.current) {
      e.stopPropagation();
      updateMapLabel(mapData.id, draggingLabelIdRef.current, {
        x: Number(pt.x.toFixed(2)),
        y: Number(pt.y.toFixed(2)),
        z: Number(pt.z.toFixed(2)),
      });
      return;
    }

    if (liveEffectiveGm && draggingPropIdRef.current && (!liveWorldsmith || liveWorldsmithTool === 'edit-mesh')) {
      e.stopPropagation();
      updateMapProp(mapData.id, draggingPropIdRef.current, {
        x: Number(pt.x.toFixed(2)),
        y: Number(pt.y.toFixed(2)),
        z: Number(pt.z.toFixed(2)),
      });
      return;
    }

    if (!liveWorldsmith && liveToolMode === 'fog-brush' && liveEffectiveGm) {
      brushCursorRef.current = pt;
      if (isPaintingFogRef.current) {
        e.stopPropagation();
        paintFogAtPoint(pt.x, pt.z);
      }
      return;
    }

    if (!liveWorldsmith || !liveEffectiveGm) {
      brushCursorRef.current = null;
      return;
    }

    brushCursorRef.current = pt;

    if (!isSculptingRef.current) return;
    e.stopPropagation();

    if (isBrushTool(liveWorldsmithTool)) {
      applyBrushAtPoint(pt.x, pt.z, e.shiftKey);
    } else if (liveWorldsmithTool === 'paint-biome') {
      applyPaintAtPoint(pt.x, pt.z, e.shiftKey);
    } else if (liveWorldsmithTool === 'paint-flora') {
      const prev = lastPaintPosRef.current;
      if (!prev || Math.hypot(pt.x - prev.x, pt.z - prev.z) >= Math.max(1.5, brushRadius * 0.45)) {
        stampFloraAtPoint(pt.x, pt.z);
        lastPaintPosRef.current = { x: pt.x, z: pt.z };
      }
    } else if (liveWorldsmithTool === 'erase-mesh') {
      erasePropsWithinRadius(pt.x, pt.z);
    }
  };

  const handleTerrainPointerUp = useCallback(() => {
    if (isPaintingFogRef.current) {
      isPaintingFogRef.current = false;
      if (didMutateFogRef.current) {
        didMutateFogRef.current = false;
        const targetId = fogDraftRef.current.targetUserId || '__all__';
        const mask = fogMasksRef.current.get(targetId) || createFogMask(0);
        void commitFogMask(targetId, mask);
      }
    }
    if (isSculptingRef.current && didMutateTerrainRef.current) {
      if (liveHeightTexRef.current) {
        syncLiveHeightDataTexture(liveHeightTexRef.current, heightDataRef.current, heightResRef.current);
      }
      if (livePaintTexRef.current) {
        syncLivePaintDataTexture(livePaintTexRef.current, paintDataRef.current);
      }
      setTerrainVersion((v) => v + 1);
      didMutateTerrainRef.current = false;
      void commitBakedTextures();
    }
    isSculptingRef.current = false;
    draggingPropIdRef.current = null;
    draggingLabelIdRef.current = null;
    draggingFogIdRef.current = null;
    lastPaintPosRef.current = null;
    lastBrushWorldPosRef.current = null;
    if (controlsRef.current && !zoneDragRef.current) {
      controlsRef.current.enabled = true;
    }
  }, [commitBakedTextures, commitFogMask, fogDraftRef]);

  useEffect(() => {
    window.addEventListener('pointerup', handleTerrainPointerUp);
    window.addEventListener('pointercancel', handleTerrainPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleTerrainPointerUp);
      window.removeEventListener('pointercancel', handleTerrainPointerUp);
    };
  }, [handleTerrainPointerUp]);

  const handleSelectProp = useCallback(
    (prop: MapProp) => {
      if (!effectiveGm) return;
      if (worldsmithMode) {
        if (worldsmithTool === 'erase-mesh') {
          deleteMapProp(mapData.id, prop.id);
          return;
        }
        if (worldsmithTool === 'edit-mesh') {
          setSelectedPropId(prop.id);
          draggingPropIdRef.current = prop.id;
          if (controlsRef.current) controlsRef.current.enabled = false;
        }
        return;
      }

      if (mapToolMode === 'select') {
        setSelectedPropId(prop.id);
        draggingPropIdRef.current = prop.id;
        if (controlsRef.current) controlsRef.current.enabled = false;
      }
    },
    [effectiveGm, worldsmithMode, worldsmithTool, mapToolMode, deleteMapProp, mapData.id, setSelectedPropId]
  );

  const handleSelectFog = useCallback(
    (fog: FogVolume, e?: ThreeEvent<PointerEvent>) => {
      if (!effectiveGm) return;
      setSelectedFogId(fog.id);
      const isPointerDown = Boolean(e && 'point' in e);
      if (
        isPointerDown &&
        worldsmithMode &&
        (worldsmithTool === 'fog' || worldsmithTool === 'edit-mesh')
      ) {
        draggingFogIdRef.current = fog.id;
        if (controlsRef.current) controlsRef.current.enabled = false;
      }
    },
    [effectiveGm, worldsmithMode, worldsmithTool, setSelectedFogId]
  );

  const handleSelectLabel = useCallback(
    (label: WorldMapLabel) => {
      if (!effectiveGm) return;
      setSelectedLabelId(label.id);
      if (!worldsmithMode && mapToolMode === 'select') {
        draggingLabelIdRef.current = label.id;
        if (controlsRef.current) controlsRef.current.enabled = false;
      }
    },
    [effectiveGm, worldsmithMode, mapToolMode, setSelectedLabelId]
  );

  const visiblePins = useMemo(
    () =>
      mapPins.filter(
        (p) => p.map_id === mapData.id && (effectiveGm || !p.is_gm_only) && mapLayers.locations
      ),
    [mapPins, mapData.id, effectiveGm, mapLayers.locations]
  );

  const visiblePaths = useMemo(
    () =>
      mapPaths.filter((p) => {
        if (p.map_id !== mapData.id) return false;
        if (!effectiveGm && p.is_gm_only) return false;
        if (p.style === 'region-polygon') return mapLayers.regions;
        return mapLayers.paths;
      }),
    [mapPaths, mapData.id, effectiveGm, mapLayers.paths, mapLayers.regions]
  );

  const isFogBrushActive = !worldsmithMode && effectiveGm && mapToolMode === 'fog-brush';
  const showBrushRing =
    isFogBrushActive ||
    (worldsmithMode &&
      effectiveGm &&
      (isBrushTool(worldsmithTool) ||
        worldsmithTool === 'stamp' ||
        worldsmithTool === 'paint-biome' ||
        worldsmithTool === 'paint-flora' ||
        worldsmithTool === 'erase-mesh'));

  const brushRingColor = isFogBrushActive
    ? '#38bdf8'
    : worldsmithTool === 'erase-mesh'
    ? '#f87171'
    : worldsmithTool === 'valley' || worldsmithTool === 'coast' || worldsmithTool === 'erode'
    ? '#38bdf8'
    : worldsmithTool === 'paint-flora' || worldsmithTool === 'paint-biome'
    ? '#4ade80'
    : worldsmithTool === 'stamp'
    ? '#c084fc'
    : '#facc15';

  const atmosphere = useMemo(
    () => ATMOSPHERE_PRESETS[mapData.atmosphere || 'golden-hour'] || ATMOSPHERE_PRESETS['golden-hour'],
    [mapData.atmosphere]
  );

  const mapWorldLayers = useMemo(
    () => (mapData.layers && mapData.layers.length > 0 ? mapData.layers : createDefaultWorldLayers()),
    [mapData.layers]
  );

  const entitiesById = useMemo(() => {
    const map = new Map<string, Entity>();
    for (const ent of entities) {
      map.set(ent.id, ent);
    }
    return map;
  }, [entities]);

  const handleTogglePin = useCallback(
    (pinId: string) => {
      const curSelected = useVaultStore.getState().selectedPinId;
      setSelectedPinId(curSelected === pinId ? null : pinId);
    },
    [setSelectedPinId]
  );

  const handleHoverPin = useCallback(
    (pinId: string | null) => {
      setHoveredPinId(pinId);
    },
    [setHoveredPinId]
  );

  const shadowSyncCounterRef = useRef(0);
  const shadowSyncKey = useMemo(() => {
    shadowSyncCounterRef.current += 1;
    return shadowSyncCounterRef.current;
  }, [
    terrainVersion,
    mapData.props,
    mapData.atmosphere,
    mapLayers.vegetation,
    mapRenderMode,
    worldSize,
  ]);

  const zonesForRender = useMemo(() => {
    const base = mapData.zones || [];
    if (!liveZoneOverride) return base;
    return base.map((z) =>
      z.id === liveZoneOverride.id ? { ...z, points: liveZoneOverride.points } : z
    );
  }, [mapData.zones, liveZoneOverride]);

  const isZoneDrawing = mapToolMode === 'zone' || mapToolMode === 'region';
  const shadowBounds = Math.max(65, worldSize * 0.58);
  const maxOrbitDist = Math.max(240, worldSize * 2.15);

  return (
    <>
      <color attach="background" args={[atmosphere.bg]} />
      <fog ref={fogRef} attach="fog" args={[atmosphere.fog, 90, 220]} />

      {/* Atmosphere-driven directional & twilight hemisphere lighting */}
      <hemisphereLight args={[atmosphere.hemiSky, atmosphere.hemiGround, atmosphere.hemiIntensity]} />
      <directionalLight
        position={atmosphere.sunPos}
        intensity={atmosphere.sunIntensity}
        color={atmosphere.sunColor}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-shadowBounds}
        shadow-camera-right={shadowBounds}
        shadow-camera-top={shadowBounds}
        shadow-camera-bottom={-shadowBounds}
        shadow-camera-near={5}
        shadow-camera-far={Math.max(180, worldSize * 1.4)}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[42, 22, -38]} intensity={atmosphere.fillIntensity} color={atmosphere.fillColor} />

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.07}
        minDistance={12}
        maxDistance={maxOrbitDist}
        maxPolarAngle={Math.PI * 0.46}
        minPolarAngle={0.004}
        mouseButtons={
          worldsmithMode || (mapToolMode !== 'select' && mapToolMode !== 'link')
            ? {
                LEFT: undefined as unknown as THREE.MOUSE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.ROTATE,
              }
            : mapCameraView === 'top' && mapToolMode === 'select'
            ? {
                LEFT: THREE.MOUSE.PAN,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.ROTATE,
              }
            : {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN,
              }
        }
      />

      {/* CPU-Displaced 3D Terrain Mesh with Multi-Biome, Hand-Painted Biomes, Fog of War & Wet-Shore PBR */}
      <DisplacedTerrainMesh
        meshRef={terrainMeshRef}
        patchHandleRef={terrainPatchHandleRef}
        heightData={activeHeightData}
        heightRes={activeHeightRes}
        terrainSize={worldSize}
        terrainSegments={terrainSegments}
        displacementScale={effectiveDisplacementScale}
        terrainVersion={terrainVersion}
        seaY={seaY}
        albedoTex={albedoTex}
        paintTex={paintTex}
        fogTex={fogTex}
        fogGmAlpha={fogGmAlpha}
        terrainShading={terrainShading}
        showBiome={mapLayers.vegetation}
        wireframe={mapRenderMode === 'terrain'}
        onClick={handleSurfaceClick}
        onPointerDown={handleTerrainPointerDown}
        onPointerMove={handleSurfacePointerMove}
        onPointerUp={handleTerrainPointerUp}
      />

      {/* Legacy Seeded Auto-Flora (for Shattered Reach when not overridden by generation_config) */}
      <TerrainFloraAndProps
        heightData={activeHeightData}
        heightRes={activeHeightRes}
        terrainSize={worldSize}
        displacementScale={effectiveDisplacementScale}
        seaY={seaY}
        pins={visiblePins}
        visible={mapLayers.vegetation && mapRenderMode === 'map' && !mapData.generation_config}
      />

      {/* User Editable & Custom Generated Props (Trees, Boulders, Castles, Villages, Temples, Ships, etc.) */}
      <TerrainProps3D
        propsList={mapData.props || []}
        heightData={activeHeightData}
        heightRes={activeHeightRes}
        displacementScale={effectiveDisplacementScale}
        seaY={seaY}
        terrainVersion={terrainVersion}
        terrainSize={worldSize}
        visible={mapLayers.vegetation && mapRenderMode === 'map'}
        selectedPropId={selectedPropId}
        interactive={
          effectiveGm &&
          ((worldsmithMode && (worldsmithTool === 'edit-mesh' || worldsmithTool === 'erase-mesh')) ||
            (!worldsmithMode && mapToolMode === 'select'))
        }
        onSelectProp={handleSelectProp}
      />

      <ShadowSyncController syncKey={shadowSyncKey} />

      {/* Sculptable Rivers + Animated Flow Shader */}
      <TerrainRivers3D
        rivers={mapData.rivers || []}
        heightData={activeHeightData}
        heightRes={activeHeightRes}
        displacementScale={effectiveDisplacementScale}
        seaY={seaY}
        terrainVersion={terrainVersion}
        terrainSize={worldSize}
        visible={mapRenderMode === 'map' && mapLayers.rivers}
        previewPoints={riverDrawingPoints}
      />

      {/* Thematic Zones (Countries, Regions, Religions, Cultures, Custom Layers) */}
      <TerrainZones3D
        zones={zonesForRender}
        layers={mapWorldLayers}
        heightData={activeHeightData}
        heightRes={activeHeightRes}
        displacementScale={effectiveDisplacementScale}
        seaY={seaY}
        terrainVersion={terrainVersion}
        terrainSize={worldSize}
        gmMode={effectiveGm}
        showRegionsLayer={mapLayers.regions}
        showLabelsLayer={mapLayers.labels}
        selectedZoneId={selectedZoneId}
        interactive={effectiveGm && !worldsmithMode && mapToolMode === 'select'}
        onSelectZone={handleSelectZone}
        onStartGizmoDrag={startZoneGizmoDrag}
        onStartVertexDrag={startZoneVertexDrag}
        onInsertVertexAndDrag={insertZoneVertexAndDrag}
        onRemoveVertex={removeZoneVertex}
      />

      {/* 3D World Text Labels (Editable, Draggable & Layer-Filtered) */}
      <TerrainLabels3D
        labels={mapData.labels || []}
        layers={mapWorldLayers}
        heightData={activeHeightData}
        heightRes={activeHeightRes}
        displacementScale={effectiveDisplacementScale}
        seaY={seaY}
        terrainSize={worldSize}
        gmMode={effectiveGm}
        visible={mapLayers.labels}
        selectedLabelId={selectedLabelId}
        interactive={effectiveGm && !worldsmithMode && mapToolMode === 'select'}
        onSelectLabel={handleSelectLabel}
      />

      {/* 3D Sculpt / Paint / Fog Brush Cursor Ring */}
      <BrushCursorRing
        cursorRef={brushCursorRef}
        radius={brushRadius}
        visible={showBrushRing}
        color={brushRingColor}
      />

      {/* Animated Sea Level Water Shader with Directional Gerstner Swell, Whitecaps & Shore Breakers */}
      <SeaLevelWater
        seaY={seaY}
        terrainSize={worldSize}
        heightTex={heightTex}
        fogTex={fogTex}
        fogGmAlpha={fogGmAlpha}
        displacementScale={effectiveDisplacementScale}
        waterSettings={waterSettings}
        wireframe={mapRenderMode === 'terrain'}
        atmosphereKey={mapData.atmosphere || 'golden-hour'}
        disableRaycast={
          worldsmithMode &&
          (isBrushTool(worldsmithTool) ||
            worldsmithTool === 'stamp' ||
            worldsmithTool === 'paint-biome' ||
            worldsmithTool === 'paint-flora' ||
            worldsmithTool === 'erase-mesh')
        }
        onClick={handleSurfaceClick}
        onPointerDown={handleTerrainPointerDown}
        onPointerMove={handleSurfacePointerMove}
        onPointerUp={handleTerrainPointerUp}
      />

      {/* Placeable 3D Volumetric Raymarched Fog Volumes */}
      <FogVolumes3D
        volumes={mapData.fog_volumes || []}
        heightTex={heightTex}
        terrainSize={worldSize}
        displacementScale={effectiveDisplacementScale}
        seaY={seaY}
        sunPos={atmosphere.sunPos}
        sunColor={atmosphere.sunColor}
        gmMode={effectiveGm}
        visible={mapRenderMode === 'map'}
        selectedFogId={selectedFogId}
        showGizmos={
          effectiveGm &&
          worldsmithMode &&
          (worldsmithTool === 'fog' || worldsmithTool === 'edit-mesh' || selectedFogId !== null)
        }
        interactive={
          effectiveGm && worldsmithMode && (worldsmithTool === 'fog' || worldsmithTool === 'edit-mesh')
        }
        onSelectFog={handleSelectFog}
      />

      {/* 3D Interactive Guild Quest Boards (West Marches) */}
      <QuestBoards3D
        boards={questBoards.filter((b) => b.map_id === mapData.id)}
        quests={guildQuests}
        heightData={activeHeightData}
        heightRes={activeHeightRes}
        terrainSize={worldSize}
        displacementScale={effectiveDisplacementScale}
        seaY={seaY}
        visible={mapRenderMode === 'map' && mapLayers.questBoards !== false && !worldsmithMode}
        onOpenBoard={setActiveQuestBoardModalId}
      />

      {/* Subtle Atmospheric Mist (hidden in crisp whole-world top view) */}
      {mapCameraView !== 'top' && <AtmosphericMist />}

      {/* Terrain-Hugging Dashed Trails & Region Polygons */}
      {visiblePaths.map((p) => (
        <TerrainPathOverlay
          key={p.id}
          path={p}
          heightData={activeHeightData}
          resolution={activeHeightRes}
          terrainSize={worldSize}
          displacement={effectiveDisplacementScale}
          seaY={seaY}
        />
      ))}

      {/* Live Drawing Preview Line / Polygon */}
      {drawingPoints.length > 0 && (
        <group>
          {drawingPoints.map((pt, idx) => (
            <mesh key={idx} position={[pt.x, pt.y + 0.4, pt.z]}>
              <sphereGeometry args={[0.38, 12, 12]} />
              <meshBasicMaterial color={idx === 0 && isZoneDrawing ? '#4ade80' : '#eab308'} />
            </mesh>
          ))}
          {drawingPoints.length >= 2 && (
            <Line
              points={(isZoneDrawing && drawingPoints.length >= 3
                ? [...drawingPoints, drawingPoints[0]]
                : drawingPoints
              ).map((p) => [p.x, p.y + 0.42, p.z] as [number, number, number])}
              color="#facc15"
              lineWidth={2.8}
              dashed={mapToolMode === 'path'}
              dashSize={1}
              gapSize={0.5}
            />
          )}
        </group>
      )}

      {/* 3D Map Pins */}
      {!worldsmithMode &&
        visiblePins.map((pin) => (
          <MapPin3D
            key={pin.id}
            pin={pin}
            entity={pin.entity_id ? entitiesById.get(pin.entity_id) : undefined}
            isSelected={selectedPinId === pin.id}
            isHovered={hoveredPinId === pin.id}
            isTopView={mapCameraView === 'top'}
            onSelectPin={handleTogglePin}
            onHoverPin={handleHoverPin}
          />
        ))}
    </>
  );
};

export const MapViewport3D: React.FC<{ mapId: string; surface?: ViewportSurface }> = ({
  mapId,
  surface = 'studio',
}) => {
  const {
    maps,
    campaignMembers,
    isEffectiveGm,
    mapRenderMode,
    setMapRenderMode,
    mapCameraView,
    mapToolMode,
    setMapToolMode,
    mapLayers,
    toggleMapLayer,
    selectedZoneId,
    setSelectedZoneId,
    activeZoneLayerId,
    setActiveZoneLayerId,
    drawingPoints,
    popDrawingPoint,
    clearDrawingPoints,
    finishDrawingPath,
    triggerCameraReset,
    triggerTopView,
    triggerCameraZoom,
    scaleBarKm,
    setSettingsModalOpen,
    openNewEntryModal,
    worldsmithMode,
    setWorldsmithMode,
    worldsmithTool,
    setWorldsmithTool,
    brushRadius,
    setBrushRadius,
    fogBrushTargetUserId,
    setFogBrushTargetUserId,
    fogBrushRevealMode,
    setFogBrushRevealMode,
    riverDrawingPoints,
    clearRiverPoints,
    setMapGeneratorModalOpen,
    toggleWorldLayer,
    soloWorldLayer,
    addWorldLayer,
    createMapZone,
    setRightInspectorCollapsed,
    dispatchTerrainCommand,
  } = useVaultStore(
    useShallow((s) => ({
      maps: s.maps,
      campaignMembers: s.campaignMembers,
      isEffectiveGm: s.isEffectiveGm,
      mapRenderMode: s.mapRenderMode,
      setMapRenderMode: s.setMapRenderMode,
      mapCameraView: s.mapCameraView,
      mapToolMode: s.mapToolMode,
      setMapToolMode: s.setMapToolMode,
      mapLayers: s.mapLayers,
      toggleMapLayer: s.toggleMapLayer,
      selectedZoneId: s.selectedZoneId,
      setSelectedZoneId: s.setSelectedZoneId,
      activeZoneLayerId: s.activeZoneLayerId,
      setActiveZoneLayerId: s.setActiveZoneLayerId,
      drawingPoints: s.drawingPoints,
      popDrawingPoint: s.popDrawingPoint,
      clearDrawingPoints: s.clearDrawingPoints,
      finishDrawingPath: s.finishDrawingPath,
      triggerCameraReset: s.triggerCameraReset,
      triggerTopView: s.triggerTopView,
      triggerCameraZoom: s.triggerCameraZoom,
      scaleBarKm: s.scaleBarKm,
      setSettingsModalOpen: s.setSettingsModalOpen,
      openNewEntryModal: s.openNewEntryModal,
      worldsmithMode: s.worldsmithMode,
      setWorldsmithMode: s.setWorldsmithMode,
      worldsmithTool: s.worldsmithTool,
      setWorldsmithTool: s.setWorldsmithTool,
      brushRadius: s.brushRadius,
      setBrushRadius: s.setBrushRadius,
      fogBrushTargetUserId: s.fogBrushTargetUserId,
      setFogBrushTargetUserId: s.setFogBrushTargetUserId,
      fogBrushRevealMode: s.fogBrushRevealMode,
      setFogBrushRevealMode: s.setFogBrushRevealMode,
      riverDrawingPoints: s.riverDrawingPoints,
      clearRiverPoints: s.clearRiverPoints,
      setMapGeneratorModalOpen: s.setMapGeneratorModalOpen,
      toggleWorldLayer: s.toggleWorldLayer,
      soloWorldLayer: s.soloWorldLayer,
      addWorldLayer: s.addWorldLayer,
      createMapZone: s.createMapZone,
      setRightInspectorCollapsed: s.setRightInspectorCollapsed,
      dispatchTerrainCommand: s.dispatchTerrainCommand,
    }))
  );

  const effectiveGm = isEffectiveGm();
  const isPlaySurface = surface === 'play';
  const canAuthorMap = !isPlaySurface && effectiveGm;
  const rightInsetPx = 14;

  useEffect(() => {
    if (!effectiveGm && worldsmithMode) {
      setWorldsmithMode(false);
    }
    if (!effectiveGm && mapToolMode !== 'select') {
      setMapToolMode('select');
    }
  }, [effectiveGm, worldsmithMode, mapToolMode, setWorldsmithMode, setMapToolMode]);

  const [layersDropdownOpen, setLayersDropdownOpen] = useState(false);
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);

  useEffect(() => {
    setLayersDropdownOpen(false);
    setToolsDropdownOpen(false);
  }, [mapRenderMode, worldsmithMode, mapCameraView]);
  const [pathName, setPathName] = useState('');
  const [riverName, setRiverName] = useState('');
  const [riverWidth, setRiverWidth] = useState(1.6);

  // Text label draft state
  const [labelText, setLabelText] = useState('');
  const [labelStyle, setLabelStyle] = useState<MapLabelStyle>('region');
  const [labelFontSize, setLabelFontSize] = useState(1.85);
  const [labelColor, setLabelColor] = useState(LABEL_COLOR_PALETTE[0]);
  const [labelLayerId, setLabelLayerId] = useState<string>('');

  // Zone (Country/Region/Religion/Custom) draft state
  const [zoneName, setZoneName] = useState('');
  const [zoneColor, setZoneColor] = useState(ZONE_COLOR_PALETTE[0]);
  const [zoneBorderStyle, setZoneBorderStyle] = useState<ZoneBorderStyle>('solid');

  // 3D Element draft state
  const [elementKind, setElementKind] = useState<MapPropKind>('castle');
  const [elementName, setElementName] = useState('');
  const [elementScale, setElementScale] = useState(1.15);

  // Quick inline custom layer creation in Layers dropdown
  const [newLayerOpen, setNewLayerOpen] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerCat, setNewLayerCat] = useState<WorldLayerCategory>('custom');

  // 3D Fog Brush commands (Reveal All / Reset Shroud)
  const [fogCommandSignal, setFogCommandSignal] = useState<{
    seq: number;
    action: 'reveal-all' | 'reset-shroud';
  }>({ seq: 0, action: 'reveal-all' });

  const terrainActionsRef = useRef<TerrainActionsHandle | null>(null);
  const labelDraftRef = useRef<LabelDraftConfig>({
    text: '',
    style: 'region',
    fontSize: 1.85,
    color: LABEL_COLOR_PALETTE[0],
    layerId: '',
  });
  const elementDraftRef = useRef<ElementDraftConfig>({
    kind: 'castle',
    name: '',
    scale: 1.15,
  });
  const fogDraftRef = useRef<FogBrushDraftConfig>({
    targetUserId: fogBrushTargetUserId,
    reveal: fogBrushRevealMode,
    radius: brushRadius,
  });

  labelDraftRef.current = {
    text: labelText,
    style: labelStyle,
    fontSize: labelFontSize,
    color: labelColor,
    layerId: labelLayerId,
  };

  elementDraftRef.current = {
    kind: elementKind,
    name: elementName,
    scale: elementScale,
  };

  fogDraftRef.current = {
    targetUserId: fogBrushTargetUserId,
    reveal: fogBrushRevealMode,
    radius: brushRadius,
  };

  const activeMap = maps.find((m) => m.id === mapId) || maps[0];
  const worldLayers = useMemo(
    () =>
      activeMap?.layers && activeMap.layers.length > 0
        ? activeMap.layers
        : createDefaultWorldLayers(),
    [activeMap?.layers]
  );

  // Keyboard shortcuts: T toggles Whole World Top View, Esc exits active Atlas tool (Ctrl+Z/Y handled globally in App.tsx)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.key === 't' || e.key === 'T') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (mapCameraView === 'top') triggerCameraReset();
        else triggerTopView();
      } else if (e.key === 'Escape' && !worldsmithMode && mapToolMode !== 'select') {
        setMapToolMode('select');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    mapCameraView,
    triggerCameraReset,
    triggerTopView,
    worldsmithMode,
    mapToolMode,
    setMapToolMode,
  ]);

  if (!activeMap) return null;

  const worldSize = getWorldSize(activeMap);
  const camScale = Math.max(0.85, worldSize / 150);

  const cursorClass = worldsmithMode
    ? worldsmithTool === 'edit-mesh'
      ? 'cursor-pointer'
      : 'cursor-crosshair'
    : mapToolMode === 'pin' ||
      mapToolMode === 'text' ||
      mapToolMode === 'path' ||
      mapToolMode === 'region' ||
      mapToolMode === 'zone' ||
      mapToolMode === 'element' ||
      mapToolMode === 'quest-board' ||
      mapToolMode === 'fog-brush'
    ? 'cursor-crosshair'
    : 'cursor-grab active:cursor-grabbing';

  const handleZoneLayerChange = (layerId: string) => {
    setActiveZoneLayerId(layerId);
    const layer = worldLayers.find((l) => l.id === layerId);
    if (layer) {
      setZoneColor(layer.color);
    }
  };

  const handleElementKindChange = (kind: MapPropKind) => {
    setElementKind(kind);
    const meta = WORLD_ELEMENT_CATALOG.find((item) => item.kind === kind);
    if (meta) setElementScale(meta.defaultScale);
  };

  return (
    <div className={`relative w-full h-full bg-[#040507] overflow-hidden select-none ${cursorClass}`}>
      {/* Three.js R3F Canvas */}
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{
          position: [
            DEFAULT_CAMERA_POS.x * camScale,
            DEFAULT_CAMERA_POS.y * camScale,
            DEFAULT_CAMERA_POS.z * camScale,
          ],
          fov: 44,
          near: 0.5,
          far: Math.max(650, worldSize * 4.5),
        }}
      >
        <TerrainScene
          mapData={activeMap}
          terrainActionsRef={terrainActionsRef}
          labelDraftRef={labelDraftRef}
          elementDraftRef={elementDraftRef}
          fogDraftRef={fogDraftRef}
          fogCommandSignal={fogCommandSignal}
        />
      </Canvas>

      {/* Option A: Single Centered Top Mode Pill + Clean Drawing Prompt */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-none w-full px-3">
        <div className="flex items-center gap-1.5 p-1 rounded-xl dark-glass shadow-glass border border-[#1f2636] pointer-events-auto max-w-full overflow-x-auto no-scrollbar whitespace-nowrap">
          {/* Map | Terrain */}
          <div className="flex items-center p-0.5 rounded-lg bg-[#07090e]/90 shrink-0">
            <button
              onClick={() => setMapRenderMode('map')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium whitespace-nowrap transition-all ${
                mapRenderMode === 'map'
                  ? 'btn-gold-metallic font-semibold'
                  : 'text-[#8e96a3] hover:text-white'
              }`}
            >
              <MapIcon className="w-3 h-3 shrink-0" />
              <span>Map</span>
            </button>
            <button
              onClick={() => setMapRenderMode('terrain')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium whitespace-nowrap transition-all ${
                mapRenderMode === 'terrain'
                  ? 'btn-gold-metallic font-semibold'
                  : 'text-[#8e96a3] hover:text-white'
              }`}
            >
              <Mountain className="w-3 h-3 shrink-0" />
              <span>Terrain</span>
            </button>
          </div>

          {/* GM-Only Studio Worldsmith Switcher */}
          {canAuthorMap && (
            <>
              <span className="w-px h-4 bg-[#1f2636] shrink-0" />

              {/* Atlas | Worldsmith */}
              <div className="flex items-center p-0.5 rounded-lg bg-[#07090e]/90 shrink-0">
                <button
                  onClick={() => setWorldsmithMode(false)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium whitespace-nowrap transition-all ${
                    !worldsmithMode
                      ? 'bg-[#141925] text-[#e2b969] border border-[#d4a853]/45 font-semibold'
                      : 'text-[#8e96a3] hover:text-white'
                  }`}
                >
                  <Compass className="w-3 h-3 shrink-0" />
                  <span>Atlas</span>
                </button>
                <button
                  onClick={() => setWorldsmithMode(true)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium whitespace-nowrap transition-all ${
                    worldsmithMode
                      ? 'btn-gold-metallic font-semibold'
                      : 'text-[#8e96a3] hover:text-white'
                  }`}
                >
                  <Hammer className="w-3 h-3 shrink-0" />
                  <span>Worldsmith</span>
                </button>
              </div>
            </>
          )}

          <span className="w-px h-4 bg-[#1f2636] shrink-0" />

          {/* 3D | Top View */}
          <div className="flex items-center p-0.5 rounded-lg bg-[#07090e]/90 shrink-0">
            <button
              onClick={() => triggerCameraReset()}
              title="3D Perspective Camera"
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-medium whitespace-nowrap transition-all ${
                mapCameraView === 'perspective'
                  ? 'bg-[#141925] text-[#e2b969] border border-[#d4a853]/45 font-semibold'
                  : 'text-[#8e96a3] hover:text-white'
              }`}
            >
              <Compass className="w-3 h-3 shrink-0" />
              <span>3D</span>
            </button>
            <button
              onClick={() => triggerTopView()}
              title="Top-Down Whole World View (Shortcut: T)"
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-medium whitespace-nowrap transition-all ${
                mapCameraView === 'top'
                  ? 'btn-gold-metallic font-semibold'
                  : 'text-[#8e96a3] hover:text-white'
              }`}
            >
              <Globe className="w-3 h-3 shrink-0" />
              <span>Top View</span>
            </button>
          </div>
        </div>

        {/* Contextual Instruction Prompt Below Top Pill (Only When Sculpting or Drawing) */}
        {worldsmithMode && effectiveGm ? (
          <div className="px-3 py-1 rounded-full bg-[#100d07]/92 border border-[#b68d40]/45 text-[11px] text-[#d6b16a] flex items-center gap-2 shadow-gold-sm pointer-events-auto">
            <span>
              {worldsmithTool === 'raise' && 'Left-drag: Raise Mountain (Shift: Lower) • Right-drag: Orbit'}
              {worldsmithTool === 'valley' && 'Left-drag: Carve Valley • Right-drag: Orbit'}
              {worldsmithTool === 'flatten' && 'Left-drag: Flatten Plateau • Right-drag: Orbit'}
              {worldsmithTool === 'smooth' && 'Left-drag: Smooth Ridges • Right-drag: Orbit'}
              {worldsmithTool === 'coast' && 'Left-drag: Sink Coastline • Right-drag: Orbit'}
              {worldsmithTool === 'ridge' && 'Left-drag along spine: Sculpt Sharp Mountain Ridge (Shift: Gorge)'}
              {worldsmithTool === 'noise' && 'Left-drag: Roughen Terrain with Fractal Detail (Shift: Carve Pits)'}
              {worldsmithTool === 'terrace' && 'Left-drag: Carve Stepped Terraces & Cliffs'}
              {worldsmithTool === 'erode' && 'Left-drag: Weather & Deposit Talus Slopes'}
              {worldsmithTool === 'stamp' && 'Click terrain: Stamp Landform (Shift: Invert / Sink) • Pick Stamp in Inspector'}
              {worldsmithTool === 'paint-biome' && 'Left-drag: Paint Biome Surface Colors (Shift: Erase Paint)'}
              {worldsmithTool === 'fog' && 'Click terrain/sea to place Fog Volume • Drag existing Fog to move • Tune in Inspector'}
              {worldsmithTool === 'river' && 'Click waypoints down-slope, then Carve River'}
              {worldsmithTool === 'paint-flora' && 'Left-drag: Paint Trees & Boulders • Right-drag: Orbit'}
              {worldsmithTool === 'place-mesh' && 'Click terrain to place active hero mesh'}
              {worldsmithTool === 'edit-mesh' && 'Drag a 3D mesh or Fog Volume to reposition • Tune in Inspector'}
              {worldsmithTool === 'erase-mesh' && 'Left-drag to erase meshes & flora inside brush'}
            </span>
            <button
              onClick={() => setRightInspectorCollapsed(false)}
              className="text-[#c9a050] hover:text-white underline text-[10.5px] font-medium"
            >
              Inspector
            </button>
          </div>
        ) : mapToolMode !== 'select' ? (
          <div className="px-3 py-1 rounded-full bg-[#100d07]/92 border border-[#b68d40]/45 text-[11px] text-[#d6b16a] flex items-center gap-2 shadow-gold-sm pointer-events-auto">
            <span>
              {mapToolMode === 'pin' && 'Click terrain or sea to drop a Location Pin • Right-drag: Orbit'}
              {mapToolMode === 'quest-board' && 'Click terrain or sea to place a West Marches Guild Quest Board • Right-drag: Orbit'}
              {mapToolMode === 'fog-brush' && 'Left-drag terrain or sea to reveal/hide Fog of War for target players • Right-drag: Orbit'}
              {mapToolMode === 'text' && 'Configure label below, then click the world to place text • Right-drag: Orbit'}
              {(mapToolMode === 'zone' || mapToolMode === 'region') &&
                'Click boundary points (min 3), choose Layer & Save Zone • Right-drag: Orbit'}
              {mapToolMode === 'path' && 'Click terrain points to trace a route, then Save • Right-drag: Orbit'}
              {mapToolMode === 'element' && 'Select a 3D element below and click terrain or sea to place it • Right-drag: Orbit'}
              {mapToolMode === 'link' && 'Click a pin or create a new linked grimoire note'}
            </span>
            <button
              onClick={() => setMapToolMode('select')}
              className="text-[#c9a050] hover:text-white underline text-[10.5px]"
            >
              Esc
            </button>
          </div>
        ) : (
          selectedZoneId && (
            <div className="px-3 py-1 rounded-full bg-[#100d07]/92 border border-[#b68d40]/45 text-[11px] text-[#d6b16a] flex items-center gap-2 shadow-gold-sm pointer-events-auto">
              <span>
                Drag gizmo center or X/Z arrows to move • Drag corner points • Click green edge dots to add (Shift+click to remove)
              </span>
              <button
                onClick={() => setRightInspectorCollapsed(false)}
                className="text-[#c9a050] hover:text-white underline text-[10.5px] font-medium"
              >
                Inspector
              </button>
              <button
                onClick={() => setSelectedZoneId(null)}
                className="text-[#9aa3b2] hover:text-white underline text-[10.5px]"
              >
                Done
              </button>
            </div>
          )
        )}
      </div>

      {/* Worldsmith River Spline Carving Bar (Stacked above Bottom Dock) */}
      {worldsmithMode && worldsmithTool === 'river' && (
        <div className="absolute bottom-[68px] left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-lg dark-glass shadow-glass border border-[#b68d40]/35">
          <span className="font-mono text-[11px] text-sky-300">
            {riverDrawingPoints.length} pts
          </span>
          <input
            type="text"
            value={riverName}
            onChange={(e) => setRiverName(e.target.value)}
            placeholder="River name..."
            className="bg-[#040507] border border-[#181e28] rounded px-2.5 py-1 text-xs text-[#e8dfd0] w-36 focus:outline-none focus:border-[#b68d40]"
          />
          <select
            value={riverWidth}
            onChange={(e) => setRiverWidth(Number(e.target.value))}
            className="bg-[#040507] border border-[#181e28] rounded px-2 py-1 text-xs text-[#ccc6ba]"
          >
            <option value={1.1}>Stream</option>
            <option value={1.6}>River</option>
            <option value={2.4}>Broad River</option>
          </select>
          <button
            disabled={riverDrawingPoints.length < 2}
            onClick={() => {
              terrainActionsRef.current?.carveRiver(riverName, riverWidth, 1.35);
              setRiverName('');
            }}
            className="px-2.5 py-1 rounded btn-gold-metallic text-xs font-semibold flex items-center gap-1 disabled:opacity-40"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Carve River</span>
          </button>
          <button
            onClick={() => clearRiverPoints()}
            className="p-1.5 rounded bg-[#0e1218] text-[#848d9c] hover:text-red-300"
            title="Clear Points"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Interactive Text Label Placement Bar (Stacked above Bottom Dock) */}
      {!worldsmithMode && mapToolMode === 'text' && (
        <div className="absolute bottom-[68px] left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg dark-glass shadow-glass border border-[#b68d40]/35 max-w-[92vw]">
          <Type className="w-3.5 h-3.5 text-[#c9a050] shrink-0" />
          <input
            type="text"
            value={labelText}
            onChange={(e) => setLabelText(e.target.value)}
            placeholder="Text label (then click map)..."
            className="bg-[#040507] border border-[#181e28] rounded px-2.5 py-1 text-xs text-[#e8dfd0] w-44 focus:outline-none focus:border-[#b68d40]"
          />
          <select
            value={labelStyle}
            onChange={(e) => setLabelStyle(e.target.value as MapLabelStyle)}
            className="bg-[#040507] border border-[#181e28] rounded px-2 py-1 text-xs text-[#ccc6ba]"
          >
            <option value="title">World Title</option>
            <option value="region">Region / Country</option>
            <option value="sea">Sea / Ocean</option>
            <option value="callout">Callout Badge</option>
            <option value="note">Small Note</option>
          </select>
          <select
            value={labelLayerId}
            onChange={(e) => setLabelLayerId(e.target.value)}
            className="bg-[#040507] border border-[#181e28] rounded px-2 py-1 text-xs text-[#ccc6ba]"
            title="Tie label visibility to a world layer"
          >
            <option value="">Global (Always Visible)</option>
            {worldLayers.map((l) => (
              <option key={l.id} value={l.id}>
                Layer: {l.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[11px] text-[#aba496]">
            <span>Size</span>
            <input
              type="range"
              min={0.8}
              max={4.2}
              step={0.15}
              value={labelFontSize}
              onChange={(e) => setLabelFontSize(Number(e.target.value))}
              className="w-16 accent-[#b68d40]"
            />
          </label>
          <div className="flex items-center gap-1">
            {LABEL_COLOR_PALETTE.map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => setLabelColor(col)}
                className={`w-4 h-4 rounded-full border ${
                  labelColor === col ? 'border-white scale-110' : 'border-white/25'
                }`}
                style={{ backgroundColor: col }}
                title={`Text color ${col}`}
              />
            ))}
          </div>
          <button
            onClick={() => setMapToolMode('select')}
            className="p-1.5 rounded bg-[#0e1218] text-[#848d9c] hover:text-red-300"
            title="Cancel (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Interactive Country / Region / Layer Zone Polygon Drawing Bar (Stacked above Bottom Dock) */}
      {!worldsmithMode && (mapToolMode === 'zone' || mapToolMode === 'region') && (
        <div className="absolute bottom-[68px] left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg dark-glass shadow-glass border border-[#b68d40]/35 max-w-[94vw]">
          <span className="font-mono text-[11px] text-[#c9a050] shrink-0">
            {drawingPoints.length} pts
          </span>
          <select
            value={activeZoneLayerId}
            onChange={(e) => handleZoneLayerChange(e.target.value)}
            className="bg-[#040507] border border-[#181e28] rounded px-2 py-1 text-xs text-[#d6b16a]"
            title="Target World Layer"
          >
            {worldLayers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={zoneName}
            onChange={(e) => setZoneName(e.target.value)}
            placeholder="Country / region / faith name..."
            className="bg-[#040507] border border-[#181e28] rounded px-2.5 py-1 text-xs text-[#e8dfd0] w-44 focus:outline-none focus:border-[#b68d40]"
          />
          <select
            value={zoneBorderStyle}
            onChange={(e) => setZoneBorderStyle(e.target.value as ZoneBorderStyle)}
            className="bg-[#040507] border border-[#181e28] rounded px-2 py-1 text-xs text-[#ccc6ba]"
          >
            <option value="solid">Solid Border</option>
            <option value="dashed">Dashed Border</option>
            <option value="double">Imperial Double</option>
            <option value="none">Fill Only</option>
          </select>
          <div className="flex items-center gap-1">
            {ZONE_COLOR_PALETTE.slice(0, 7).map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => setZoneColor(col)}
                className={`w-4 h-4 rounded-full border ${
                  zoneColor === col ? 'border-white scale-110' : 'border-white/25'
                }`}
                style={{ backgroundColor: col }}
              />
            ))}
          </div>
          <button
            disabled={drawingPoints.length === 0}
            onClick={() => popDrawingPoint()}
            className="p-1.5 rounded bg-[#0e1218] text-[#848d9c] hover:text-white disabled:opacity-35"
            title="Undo Last Vertex"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={drawingPoints.length < 3}
            onClick={() => {
              const targetLayerId =
                worldLayers.find((l) => l.id === activeZoneLayerId)?.id ||
                worldLayers[0]?.id ||
                'layer-countries';
              createMapZone(activeMap.id, {
                layerId: targetLayerId,
                name: zoneName.trim() || 'Unnamed Territory',
                points: drawingPoints,
                color: zoneColor,
                borderStyle: zoneBorderStyle,
                showLabel: true,
              });
              setZoneName('');
            }}
            className="px-2.5 py-1 rounded btn-gold-metallic text-xs font-semibold flex items-center gap-1 disabled:opacity-40"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save Zone</span>
          </button>
          <button
            onClick={() => {
              clearDrawingPoints();
              setMapToolMode('select');
            }}
            className="p-1.5 rounded bg-[#0e1218] text-[#848d9c] hover:text-red-300"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Interactive Path / Route Drawing Bar (Stacked above Bottom Dock) */}
      {!worldsmithMode && mapToolMode === 'path' && (
        <div className="absolute bottom-[68px] left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-lg dark-glass shadow-glass border border-[#b68d40]/35">
          <span className="font-mono text-[11px] text-[#c9a050]">
            {drawingPoints.length} pts
          </span>
          <input
            type="text"
            value={pathName}
            onChange={(e) => setPathName(e.target.value)}
            placeholder="Trail / route name..."
            className="bg-[#040507] border border-[#181e28] rounded px-2.5 py-1 text-xs text-[#e8dfd0] w-44 focus:outline-none focus:border-[#b68d40]"
          />
          <button
            disabled={drawingPoints.length === 0}
            onClick={() => popDrawingPoint()}
            className="p-1.5 rounded bg-[#0e1218] text-[#848d9c] hover:text-white disabled:opacity-35"
            title="Undo Last Point"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={drawingPoints.length < 2}
            onClick={async () => {
              await finishDrawingPath(pathName, false);
              setPathName('');
            }}
            className="px-2.5 py-1 rounded btn-gold-metallic text-xs font-semibold flex items-center gap-1 disabled:opacity-40"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save Route</span>
          </button>
          <button
            onClick={() => {
              clearDrawingPoints();
              setMapToolMode('select');
            }}
            className="p-1.5 rounded bg-[#0e1218] text-[#848d9c] hover:text-red-300"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Interactive 3D Element Placement Bar (Stacked above Bottom Dock) */}
      {!worldsmithMode && mapToolMode === 'element' && (
        <div className="absolute bottom-[68px] left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg dark-glass shadow-glass border border-[#b68d40]/35 max-w-[92vw]">
          <Castle className="w-3.5 h-3.5 text-[#c9a050] shrink-0" />
          <select
            value={elementKind}
            onChange={(e) => handleElementKindChange(e.target.value as MapPropKind)}
            className="bg-[#040507] border border-[#181e28] rounded px-2 py-1 text-xs text-[#e8dfd0]"
          >
            <optgroup label="Settlements & Structures">
              {WORLD_ELEMENT_CATALOG.filter((i) => i.category === 'Settlement & Structure').map((i) => (
                <option key={i.kind} value={i.kind}>
                  {i.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Flora & Terrain">
              {WORLD_ELEMENT_CATALOG.filter((i) => i.category === 'Flora & Terrain').map((i) => (
                <option key={i.kind} value={i.kind}>
                  {i.label}
                </option>
              ))}
            </optgroup>
          </select>
          <input
            type="text"
            value={elementName}
            onChange={(e) => setElementName(e.target.value)}
            placeholder="Optional name..."
            className="bg-[#040507] border border-[#181e28] rounded px-2.5 py-1 text-xs text-[#e8dfd0] w-36 focus:outline-none focus:border-[#b68d40]"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-[#aba496]">
            <span>Scale {elementScale.toFixed(1)}×</span>
            <input
              type="range"
              min={0.6}
              max={2.4}
              step={0.1}
              value={elementScale}
              onChange={(e) => setElementScale(Number(e.target.value))}
              className="w-16 accent-[#b68d40]"
            />
          </label>
          <button
            onClick={() => setMapToolMode('select')}
            className="px-2.5 py-1 rounded bg-[#0e1218] hover:bg-[#171c26] text-xs text-[#ded8cc]"
          >
            Done
          </button>
        </div>
      )}

      {/* Interactive 3D Fog of War Brush Bar (Stacked above Bottom Dock) */}
      {effectiveGm && !worldsmithMode && mapToolMode === 'fog-brush' && (
        <div className="absolute bottom-[68px] left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg dark-glass shadow-glass border border-[#b68d40]/35 max-w-[94vw]">
          <EyeOff className="w-3.5 h-3.5 text-[#c9a050] shrink-0" />
          <select
            aria-label="Target Player"
            value={fogBrushTargetUserId}
            onChange={(e) => setFogBrushTargetUserId(e.target.value)}
            className="bg-[#040507] border border-[#181e28] rounded px-2 py-1 text-xs text-[#e8dfd0]"
          >
            <option value="__all__">All Players</option>
            {campaignMembers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile?.display_name || m.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
          <div className="flex items-center p-0.5 rounded bg-[#050608] border border-[#181e28]">
            <button
              type="button"
              onClick={() => setFogBrushRevealMode(true)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                fogBrushRevealMode
                  ? 'btn-gold-metallic font-semibold'
                  : 'text-[#8e96a3] hover:text-white'
              }`}
            >
              Reveal
            </button>
            <button
              type="button"
              onClick={() => setFogBrushRevealMode(false)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                !fogBrushRevealMode
                  ? 'bg-red-950/80 text-red-200 border border-red-400/50 font-semibold'
                  : 'text-[#8e96a3] hover:text-white'
              }`}
            >
              Hide
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-[#aba496]">
            <span>Radius {Math.round(brushRadius)}m</span>
            <input
              type="range"
              min={3}
              max={30}
              step={1}
              value={brushRadius}
              onChange={(e) => setBrushRadius(Number(e.target.value))}
              className="w-20 accent-[#b68d40]"
            />
          </label>
          <button
            type="button"
            onClick={() =>
              setFogCommandSignal((s) => ({ seq: s.seq + 1, action: 'reveal-all' }))
            }
            className="px-2 py-1 rounded bg-[#0e1218] hover:bg-[#171c26] border border-[#242b38] text-[11px] text-[#e8dfd0]"
          >
            Reveal All
          </button>
          <button
            type="button"
            onClick={() =>
              setFogCommandSignal((s) => ({ seq: s.seq + 1, action: 'reset-shroud' }))
            }
            className="px-2 py-1 rounded bg-[#0e1218] hover:bg-[#171c26] border border-[#242b38] text-[11px] text-[#d6b16a]"
          >
            Reset Shroud
          </button>
          <button
            type="button"
            onClick={() => setMapToolMode('select')}
            className="px-2.5 py-1 rounded bg-[#0e1218] hover:bg-[#171c26] text-xs text-[#ded8cc]"
          >
            Done
          </button>
        </div>
      )}

      {/* Option A: Bottom-Center Studio Tool & Layer Dock */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1 rounded-xl dark-glass shadow-glass border border-[#1f2636] max-w-[calc(100%-24px)]">
        {/* Active Tool Buttons (horizontally scrollable on narrow screens, single clean row) */}
        <div className="flex items-center gap-0.5 flex-nowrap overflow-x-auto no-scrollbar min-w-0">
          {worldsmithMode && canAuthorMap ? (
            <>
              <button
                title="Undo Terrain Sculpt (Ctrl+Z)"
                aria-label="Undo Terrain Sculpt"
                onClick={() => dispatchTerrainCommand({ type: 'undo' })}
                className="p-1.5 rounded-lg text-[#848d9c] hover:text-[#e8dfd0] hover:bg-[#10141c] transition-all"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                title="Redo Terrain Sculpt (Ctrl+Shift+Z)"
                aria-label="Redo Terrain Sculpt"
                onClick={() => dispatchTerrainCommand({ type: 'redo' })}
                className="p-1.5 rounded-lg text-[#848d9c] hover:text-[#e8dfd0] hover:bg-[#10141c] transition-all"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              <span className="w-px h-4 bg-[#1d2330] mx-0.5 shrink-0" />
              {(
                [
                  { id: 'raise', icon: ArrowUpFromLine, label: 'Raise Mountain (Shift: Lower)' },
                  { id: 'valley', icon: ArrowDownToLine, label: 'Carve Valley' },
                  { id: 'flatten', icon: Minus, label: 'Flatten Plateau' },
                  { id: 'smooth', icon: Wand2, label: 'Smooth Terrain' },
                  { id: 'coast', icon: Waves, label: 'Lower to Sea / Coast' },
                  { id: 'ridge', icon: TrendingUp, label: 'Sculpt Mountain Ridge (Shift: Gorge)' },
                  { id: 'noise', icon: Sparkles, label: 'Roughen / Fractal Detail' },
                  { id: 'terrace', icon: Layers, label: 'Terrace / Mesa Steps' },
                  { id: 'erode', icon: Droplets, label: 'Thermal Erosion Brush' },
                  { id: 'stamp', icon: Stamp, label: 'Landform Stamp (Mountain, Volcano, Crater...)' },
                  { id: 'paint-biome', icon: Paintbrush, label: 'Paint Biome Surface Colors' },
                  { id: 'river', icon: Route, label: 'Carve River Spline' },
                  { id: 'fog', icon: Cloud, label: 'Place / Move Fog Volume' },
                  { id: 'paint-flora', icon: Trees, label: 'Paint Trees & Rocks Brush' },
                  { id: 'place-mesh', icon: Castle, label: 'Place Hero Mesh' },
                  { id: 'edit-mesh', icon: Move, label: 'Select / Move Mesh or Fog' },
                  { id: 'erase-mesh', icon: Eraser, label: 'Erase Meshes Brush' },
                ] as const
              ).map((tool) => {
                const Icon = tool.icon;
                const active = worldsmithTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    title={tool.label}
                    aria-label={tool.label}
                    onClick={() => setWorldsmithTool(tool.id)}
                    className={`p-1.5 rounded-lg transition-all ${
                      active
                        ? 'bg-[#b68d40]/20 text-[#d6b16a] border border-[#b68d40]/55 shadow-gold-sm'
                        : 'text-[#848d9c] hover:text-[#e8dfd0] hover:bg-[#10141c]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </>
          ) : (
            (
              [
                { id: 'select', icon: MousePointer, label: 'Select / Move / Inspect', gmOnly: false, playAllowed: true },
                { id: 'pin', icon: MapPin, label: 'Add Location Pin', gmOnly: true, playAllowed: false },
                { id: 'text', icon: Type, label: 'Add Text Label', gmOnly: true, playAllowed: false },
                { id: 'zone', icon: Pentagon, label: 'Draw Country / Region / Layer Zone', gmOnly: true, playAllowed: false },
                { id: 'path', icon: Route, label: 'Draw Terrain Route', gmOnly: true, playAllowed: false },
                { id: 'element', icon: Castle, label: 'Place 3D Element', gmOnly: true, playAllowed: false },
                { id: 'quest-board', icon: ScrollText, label: 'Place Guild Quest Board', gmOnly: true, playAllowed: false },
                { id: 'fog-brush', icon: EyeOff, label: '3D Fog Brush', gmOnly: true, playAllowed: true },
                { id: 'link', icon: Link2, label: 'Link Note', gmOnly: true, playAllowed: false },
              ] as const
            )
              .filter(
                (tool) =>
                  (!tool.gmOnly || effectiveGm) && (!isPlaySurface || tool.playAllowed)
              )
              .map((tool) => {
                const Icon = tool.icon;
                const active =
                  mapToolMode === tool.id || (tool.id === 'zone' && mapToolMode === 'region');
                return (
                  <button
                    key={tool.id}
                    title={tool.label}
                    aria-label={tool.label}
                    onClick={() => {
                      if (tool.id === 'link') {
                        openNewEntryModal('Location', 'encyclopedia');
                      } else {
                        setMapToolMode(tool.id);
                      }
                    }}
                    className={`p-2 rounded-lg transition-all ${
                      active
                        ? 'bg-[#b68d40]/20 text-[#d6b16a] border border-[#b68d40]/55 shadow-gold-sm'
                        : 'text-[#848d9c] hover:text-[#e8dfd0] hover:bg-[#10141c]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })
          )}
        </div>

        <span className="w-px h-5 bg-[#171c26] mx-0.5 shrink-0" />

        {/* Layers Upward Popover */}
        <div className="relative shrink-0">
          <button
            onClick={() => {
              setLayersDropdownOpen((v) => !v);
              setToolsDropdownOpen(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              layersDropdownOpen
                ? 'bg-[#d4a853]/18 text-[#e2b969] border border-[#d4a853]/50'
                : 'text-[#d4cfc4] hover:bg-[#141925]'
            }`}
            title="Base Layers & World Overlays (Countries, Regions, Religions...)"
          >
            <Layers className="w-3.5 h-3.5 text-[#d4a853] shrink-0" />
            <span>Layers</span>
          </button>
          {layersDropdownOpen && (
            <div className="absolute right-0 bottom-full mb-2 w-68 rounded-lg dark-glass shadow-glass p-2 space-y-2 z-40 border border-[#b68d40]/35">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#7e8796]">
                  Base Map Layers
                </span>
                <button
                  onClick={() => setLayersDropdownOpen(false)}
                  className="text-[#6d7686] hover:text-white"
                  title="Close"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-0.5">
                {(
                  [
                    ['terrain', 'Terrain (Elevation)'],
                    ['vegetation', 'Biome, Flora & Elements'],
                    ['rivers', 'Rivers & Streams'],
                    ['locations', 'Locations & Pins'],
                    ['paths', 'Paths / Trails'],
                    ['regions', 'Countries & Zones'],
                    ['labels', 'Map Text Labels'],
                    ['questBoards', 'Guild Quest Boards'],
                    ['fogOfWar', 'Fog of War Shroud'],
                  ] as Array<[keyof typeof mapLayers, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => toggleMapLayer(key)}
                    className="w-full flex items-center justify-between px-2 py-1 rounded text-xs text-[#ccc6ba] hover:bg-[#b68d40]/15"
                  >
                    <span>{label}</span>
                    {mapLayers[key] ? (
                      <Eye className="w-3.5 h-3.5 text-[#b68d40]" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-[#555d6c]" />
                    )}
                  </button>
                ))}
              </div>

              <div className="pt-1.5 border-t border-[#141821] space-y-1">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#c9a050]">
                    World Overlay Layers
                  </span>
                  <button
                    onClick={() => soloWorldLayer(activeMap.id, null)}
                    className="text-[10px] text-[#848d9c] hover:text-[#d6b16a]"
                  >
                    Show All
                  </button>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-0.5">
                  {worldLayers.map((layer) => (
                    <div
                      key={layer.id}
                      className="flex items-center justify-between px-2 py-1 rounded text-xs text-[#ccc6ba] hover:bg-[#b68d40]/12"
                    >
                      <button
                        onClick={() => toggleWorldLayer(activeMap.id, layer.id)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/25"
                          style={{ backgroundColor: layer.color }}
                        />
                        <span className="truncate">{layer.name}</span>
                      </button>
                      <button
                        onClick={() => toggleWorldLayer(activeMap.id, layer.id)}
                        className="ml-2 shrink-0"
                        title={layer.visible ? 'Hide layer' : 'Show layer'}
                      >
                        {layer.visible ? (
                          <Eye className="w-3.5 h-3.5 text-[#b68d40]" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-[#555d6c]" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>

                {canAuthorMap &&
                  (!newLayerOpen ? (
                    <button
                      onClick={() => setNewLayerOpen(true)}
                      className="w-full py-1 px-2 rounded bg-[#0a0d12] hover:bg-[#12161f] border border-[#181e28] text-[11px] text-[#c9a050] flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Layer (Country / Religion...)</span>
                    </button>
                  ) : (
                    <div className="p-1.5 rounded bg-[#050608] border border-[#171c25] space-y-1.5">
                      <input
                        type="text"
                        value={newLayerName}
                        onChange={(e) => setNewLayerName(e.target.value)}
                        placeholder="Layer name (e.g. Magic Leylines)"
                        className="w-full bg-[#090b0f] border border-[#1a202b] rounded px-2 py-1 text-[11px] text-[#e8dfd0] focus:outline-none focus:border-[#b68d40]"
                      />
                      <div className="flex items-center gap-1">
                        <select
                          value={newLayerCat}
                          onChange={(e) => setNewLayerCat(e.target.value as WorldLayerCategory)}
                          className="flex-1 bg-[#090b0f] border border-[#1a202b] rounded px-1.5 py-1 text-[11px] text-[#ccc6ba]"
                        >
                          {(Object.keys(LAYER_CATEGORY_META) as WorldLayerCategory[]).map((cat) => (
                            <option key={cat} value={cat}>
                              {LAYER_CATEGORY_META[cat].label}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            if (!newLayerName.trim()) return;
                            addWorldLayer(activeMap.id, {
                              name: newLayerName,
                              category: newLayerCat,
                              color: LAYER_CATEGORY_META[newLayerCat].defaultColor,
                            });
                            setNewLayerName('');
                            setNewLayerOpen(false);
                          }}
                          className="px-2 py-1 rounded btn-gold-metallic text-[11px] font-semibold"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => setNewLayerOpen(false)}
                          className="p-1 rounded bg-[#0e1218] text-[#7a8291] hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Map Tools Upward Popover (Studio GM Only) */}
        {canAuthorMap && (
          <div className="relative shrink-0">
            <button
              onClick={() => {
                setToolsDropdownOpen((v) => !v);
                setLayersDropdownOpen(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                toolsDropdownOpen
                  ? 'bg-[#d4a853]/18 text-[#e2b969] border border-[#d4a853]/50'
                  : 'text-[#d4cfc4] hover:bg-[#141925]'
              }`}
              title="World Generator, Atmosphere, Heightmap & Quick Actions"
            >
              <Wrench className="w-3.5 h-3.5 text-[#d4a853] shrink-0" />
              <span>Map Tools</span>
            </button>
            {toolsDropdownOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-60 rounded-lg dark-glass shadow-glass p-1.5 space-y-0.5 z-40 border border-[#b68d40]/35">
                <button
                  onClick={() => {
                    setWorldsmithMode(false);
                    setMapToolMode('text');
                    setToolsDropdownOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#ded8cc] hover:bg-[#b68d40]/15"
                >
                  + Add Map Text Label
                </button>
                <button
                  onClick={() => {
                    setWorldsmithMode(false);
                    setMapToolMode('zone');
                    setToolsDropdownOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#ded8cc] hover:bg-[#b68d40]/15"
                >
                  + Draw Country / Region / Layer
                </button>
                <button
                  onClick={() => {
                    setWorldsmithMode(false);
                    setMapToolMode('element');
                    setToolsDropdownOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#ded8cc] hover:bg-[#b68d40]/15"
                >
                  + Place 3D Element (Castle, Ship...)
                </button>
                <button
                  onClick={() => {
                    setWorldsmithMode(false);
                    setMapToolMode('pin');
                    setToolsDropdownOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#ded8cc] hover:bg-[#b68d40]/15"
                >
                  + Place Location Pin
                </button>
                <button
                  onClick={() => {
                    setWorldsmithMode(false);
                    setMapToolMode('path');
                    setToolsDropdownOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#ded8cc] hover:bg-[#b68d40]/15"
                >
                  + Draw Terrain Route
                </button>
                <button
                  onClick={() => {
                    setWorldsmithMode(false);
                    setMapToolMode('quest-board');
                    setToolsDropdownOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#ded8cc] hover:bg-[#b68d40]/15"
                >
                  + Place Guild Quest Board
                </button>
                <button
                  onClick={() => {
                    setWorldsmithMode(false);
                    setMapToolMode('fog-brush');
                    setToolsDropdownOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#ded8cc] hover:bg-[#b68d40]/15"
                >
                  + 3D Fog of War Brush
                </button>
                <div className="my-1 border-t border-[#141821]" />
                <button
                  onClick={() => {
                    setMapGeneratorModalOpen(true, '3d');
                    setToolsDropdownOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#c9a050] hover:bg-[#b68d40]/15"
                >
                  Generate New 3D World...
                </button>
                <button
                  onClick={() => {
                    setMapGeneratorModalOpen(true, '3d', mapId);
                    setToolsDropdownOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#ccc6ba] hover:bg-[#b68d40]/15"
                >
                  Edit Map &amp; Atmosphere...
                </button>
                <button
                  onClick={() => {
                    setSettingsModalOpen(true);
                    setToolsDropdownOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[#b68d40] hover:bg-[#b68d40]/15"
                >
                  Upload Heightmap / Albedo...
                </button>
              </div>
            )}
          </div>
        )}

        {/* Worldsmith Brush / Mesh Settings Trigger */}
        {worldsmithMode && canAuthorMap && (
          <button
            onClick={() => setRightInspectorCollapsed(false)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 bg-[#10141d] border border-[#d4a853]/35 text-[#e2b969] hover:border-[#d4a853]"
            title="Open Brush Radius, Strength & Mesh Inspector"
          >
            <Settings2 className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Brush</span>
          </button>
        )}
      </div>

      {/* Bottom-Left Ornate SVG Compass Rose + Dynamic Scale Bar */}
      <div className="hidden sm:flex absolute bottom-3.5 left-4 z-10 pointer-events-none items-end gap-3.5">
        {/* Ornate Compass Rose */}
        <svg viewBox="0 0 64 64" className="w-12 h-12 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
          <circle cx="32" cy="32" r="24" fill="none" stroke="#b68d40" strokeOpacity="0.38" strokeWidth="1" />
          <circle cx="32" cy="32" r="19" fill="none" stroke="#b68d40" strokeOpacity="0.22" strokeDasharray="2 2" strokeWidth="0.8" />
          <polygon points="32,4 36,28 32,32 28,28" fill="#c9a050" />
          <polygon points="32,60 36,36 32,32 28,36" fill="#63502b" />
          <polygon points="60,32 36,36 32,32 36,28" fill="#9a732d" />
          <polygon points="4,32 28,36 32,32 28,28" fill="#63502b" />
          <text x="32" y="10" textAnchor="middle" fill="#e6d7b4" fontSize="7" fontFamily="Cinzel">
            N
          </text>
          <text x="56" y="34.5" textAnchor="middle" fill="#b68d40" fontSize="6" fontFamily="Cinzel">
            E
          </text>
          <text x="8" y="34.5" textAnchor="middle" fill="#b68d40" fontSize="6" fontFamily="Cinzel">
            W
          </text>
          <text x="32" y="60" textAnchor="middle" fill="#b68d40" fontSize="6" fontFamily="Cinzel">
            S
          </text>
        </svg>

        {/* Dynamic Scale Bar */}
        <div className="pb-1">
          <div className="flex justify-between w-36 font-mono text-[10px] text-[#bdb7ac] mb-1">
            <span>0</span>
            <span>{Math.round(scaleBarKm * 0.25)}</span>
            <span>{Math.round(scaleBarKm * 0.5)}</span>
            <span>{scaleBarKm} km</span>
          </div>
          <div className="w-36 h-1.5 flex border border-[#b68d40]/65 bg-[#040507]/85">
            <div className="flex-1 bg-[#b68d40]" />
            <div className="flex-1 bg-transparent" />
            <div className="flex-1 bg-[#b68d40]" />
            <div className="flex-1 bg-transparent" />
          </div>
        </div>
      </div>

      {/* Bottom-Right Compact Camera Zoom & View Controls */}
      <div
        data-testid="viewport-hud"
        style={{ right: rightInsetPx }}
        className="absolute bottom-3.5 z-20 flex flex-col gap-1.5"
      >
        <button
          onClick={() => (mapCameraView === 'top' ? triggerCameraReset() : triggerTopView())}
          title={
            mapCameraView === 'top'
              ? 'Switch Back to 3D Perspective (T)'
              : 'Top View — Whole World Overview (T)'
          }
          className={`w-8 h-8 rounded-lg dark-glass flex items-center justify-center transition-colors ${
            mapCameraView === 'top'
              ? 'border border-[#b68d40] text-[#d6b16a] bg-[#141008]/92 shadow-gold-sm'
              : 'hover:border-[#b68d40] text-[#b68d40]'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={triggerCameraReset}
          title="Reset North & Tilt (3D View)"
          className="w-8 h-8 rounded-lg dark-glass hover:border-[#b68d40] flex items-center justify-center text-[#b68d40] transition-colors"
        >
          <Compass className="w-3.5 h-3.5" />
        </button>

        <div className="flex flex-col rounded-lg dark-glass overflow-hidden divide-y divide-[#131720]">
          <button
            onClick={() => triggerCameraZoom(1)}
            title="Zoom In"
            className="w-8 h-7 flex items-center justify-center text-[#ccc6ba] hover:text-[#c9a050] hover:bg-[#10141c] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => triggerCameraZoom(-1)}
            title="Zoom Out"
            className="w-8 h-7 flex items-center justify-center text-[#ccc6ba] hover:text-[#c9a050] hover:bg-[#10141c] transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Slide-Over Entity Card when a 3D Pin is Clicked */}
      <PinEntitySlideOver surface={surface} />

      {/* West Marches Guild Quest Board Modal */}
      <GuildQuestBoardModal />
    </div>
  );
};
