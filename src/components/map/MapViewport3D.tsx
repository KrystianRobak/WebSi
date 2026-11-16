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
  Compass,
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
  Pentagon,
  Plus,
  Route,
  Settings2,
  Sparkles,
  Trees,
  Type,
  Undo2,
  Wand2,
  Waves,
  Wrench,
  X,
} from 'lucide-react';
import {
  DEFAULT_DISPLACEMENT,
  SEA_LEVEL_NORM,
  TERRAIN_SEGMENTS,
  TERRAIN_SIZE,
  extractHeightDataFromImage,
  generateShatteredReachTerrain,
  sampleTerrainElevation,
} from '../../lib/terrainGenerator';
import {
  applyTerrainBrush,
  buildTexturesFromHeightData,
  carveRiverIntoHeightData,
} from '../../lib/terrainEditorEngine';
import {
  LABEL_COLOR_PALETTE,
  LAYER_CATEGORY_META,
  WORLD_ELEMENT_CATALOG,
  ZONE_COLOR_PALETTE,
  createDefaultWorldLayers,
} from '../../lib/worldLayers';
import { useVaultStore } from '../../store/useVaultStore';
import {
  Entity,
  MapLabelStyle,
  MapPath,
  MapPin as MapPinType,
  MapProp,
  MapPropKind,
  VaultMap,
  WorldAtmospherePreset,
  WorldLayerCategory,
  WorldMapLabel,
  WorldsmithTool,
  ZoneBorderStyle,
} from '../../types/vault';
import { EntityIcon } from '../common/EntityIcon';
import { PinEntitySlideOver } from './PinEntitySlideOver';
import {
  BrushCursorRing,
  TerrainLabels3D,
  TerrainProps3D,
  TerrainRivers3D,
  TerrainZones3D,
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
    hemiIntensity: 0.72,
    sunColor: '#ffd28a',
    sunIntensity: 2.6,
    sunPos: [-48, 36, 18],
    fillColor: '#7ca3cf',
    fillIntensity: 0.95,
    waterDeep: '#06131c',
    waterMid: '#0e3542',
    waterShallow: '#256e77',
    skyHorizon: '#2d4358',
    skyZenith: '#0d1521',
  },
  'high-noon': {
    bg: '#101824',
    fog: '#131d2b',
    hemiSky: '#cfe4ff',
    hemiGround: '#24201b',
    hemiIntensity: 0.92,
    sunColor: '#fff5e0',
    sunIntensity: 2.85,
    sunPos: [-12, 68, 22],
    fillColor: '#98bce3',
    fillIntensity: 1.05,
    waterDeep: '#092438',
    waterMid: '#12536e',
    waterShallow: '#2d8e99',
    skyHorizon: '#4c7399',
    skyZenith: '#162842',
  },
  'moonlit-night': {
    bg: '#050811',
    fog: '#060a14',
    hemiSky: '#3b588c',
    hemiGround: '#0a0d14',
    hemiIntensity: 0.42,
    sunColor: '#a6c8ff',
    sunIntensity: 1.55,
    sunPos: [38, 44, -26],
    fillColor: '#36507a',
    fillIntensity: 0.65,
    waterDeep: '#030a14',
    waterMid: '#091f30',
    waterShallow: '#16465c',
    skyHorizon: '#162844',
    skyZenith: '#050914',
  },
  'crimson-eclipse': {
    bg: '#12070a',
    fog: '#18090d',
    hemiSky: '#964758',
    hemiGround: '#1a0c0e',
    hemiIntensity: 0.56,
    sunColor: '#ff7a5c',
    sunIntensity: 2.2,
    sunPos: [-42, 28, 24],
    fillColor: '#a64d79',
    fillIntensity: 0.8,
    waterDeep: '#12080d',
    waterMid: '#2a121b',
    waterShallow: '#54262e',
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

interface TerrainSceneProps {
  mapData: VaultMap;
  terrainActionsRef: React.MutableRefObject<TerrainActionsHandle | null>;
  labelDraftRef: React.MutableRefObject<LabelDraftConfig>;
  elementDraftRef: React.MutableRefObject<ElementDraftConfig>;
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

const DEFAULT_CAMERA_POS = new THREE.Vector3(-4, 42, 56);
const DEFAULT_TARGET = new THREE.Vector3(0, 3.2, 2);
const TOP_CAMERA_POS = new THREE.Vector3(0, 148, 0.01);
const TOP_TARGET = new THREE.Vector3(0, 0, 0);

interface SeaLevelWaterProps {
  seaY: number;
  heightTex: THREE.Texture | null;
  displacementScale: number;
  wireframe?: boolean;
  atmosphereKey?: WorldAtmospherePreset;
  disableRaycast?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: () => void;
}

/**
 * Semi-realistic, single-pass bathymetry-driven GLSL water shader:
 * - Samples the terrain heightmap once per fragment for true depth absorption,
 *   submerged caustics, and animated shoreline foam (zero extra render passes).
 * - Multi-directional Gerstner vertex swell + analytic micro-ripple normals with
 *   distance-based specular anti-aliasing.
 * - Schlick Fresnel sky reflection & atmosphere-driven sun/moon glints.
 */
const SeaLevelWater: React.FC<SeaLevelWaterProps> = ({
  seaY,
  heightTex,
  displacementScale,
  wireframe = false,
  atmosphereKey = 'golden-hour',
  disableRaycast = false,
  onClick,
  onPointerMove,
  onPointerUp,
}) => {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uHeightMap: { value: null as THREE.Texture | null },
      uHasHeightMap: { value: 0 },
      uTerrainSize: { value: TERRAIN_SIZE },
      uDisplacementScale: { value: DEFAULT_DISPLACEMENT },
      uSeaY: { value: SEA_LEVEL_NORM * DEFAULT_DISPLACEMENT },
      uSunDir: { value: new THREE.Vector3(-48, 36, 18).normalize() },
      uFillDir: { value: new THREE.Vector3(42, 22, -38).normalize() },
      uDeepColor: { value: new THREE.Color('#06131c') },
      uMidColor: { value: new THREE.Color('#0e3542') },
      uShallowColor: { value: new THREE.Color('#256e77') },
      uSunColor: { value: new THREE.Color('#ffd28a') },
      uFillColor: { value: new THREE.Color('#7ca3cf') },
      uSkyHorizon: { value: new THREE.Color('#2d4358') },
      uSkyZenith: { value: new THREE.Color('#0d1521') },
      uFoamColor: { value: new THREE.Color('#cfdce0') },
      uFogColor: { value: new THREE.Color('#090b0e') },
      uFogNear: { value: 68.0 },
      uFogFar: { value: 138.0 },
      uWireframe: { value: 0.0 },
    }),
    []
  );

  useEffect(() => {
    if (!matRef.current) return;
    const atmo = ATMOSPHERE_PRESETS[atmosphereKey] || ATMOSPHERE_PRESETS['golden-hour'];
    matRef.current.uniforms.uHeightMap.value = heightTex;
    matRef.current.uniforms.uHasHeightMap.value = heightTex ? 1.0 : 0.0;
    matRef.current.uniforms.uDisplacementScale.value = displacementScale;
    matRef.current.uniforms.uSeaY.value = seaY;
    matRef.current.uniforms.uWireframe.value = wireframe ? 1.0 : 0.0;
    matRef.current.uniforms.uSunDir.value.set(...atmo.sunPos).normalize();
    matRef.current.uniforms.uSunColor.value.set(atmo.sunColor);
    matRef.current.uniforms.uFillColor.value.set(atmo.fillColor);
    matRef.current.uniforms.uDeepColor.value.set(atmo.waterDeep);
    matRef.current.uniforms.uMidColor.value.set(atmo.waterMid);
    matRef.current.uniforms.uShallowColor.value.set(atmo.waterShallow);
    matRef.current.uniforms.uSkyHorizon.value.set(atmo.skyHorizon);
    matRef.current.uniforms.uSkyZenith.value.set(atmo.skyZenith);
    matRef.current.uniforms.uFogColor.value.set(atmo.fog);
  }, [heightTex, displacementScale, seaY, wireframe, atmosphereKey]);

  useFrame(({ clock, camera }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.getElapsedTime();
      const camDist = camera.position.length();
      const topBlend = THREE.MathUtils.smoothstep(camDist, 76, 118);
      matRef.current.uniforms.uFogNear.value = THREE.MathUtils.lerp(68.0, 240.0, topBlend);
      matRef.current.uniforms.uFogFar.value = THREE.MathUtils.lerp(138.0, 460.0, topBlend);
    }
  });

  return (
    <mesh
      position={[0, seaY, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={disableRaycast ? () => null : undefined}
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <planeGeometry args={[TERRAIN_SIZE * 1.24, TERRAIN_SIZE * 1.24, 96, 96]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        wireframe={wireframe}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying float vShoreDamp;

          uniform float uTime;
          uniform sampler2D uHeightMap;
          uniform float uHasHeightMap;
          uniform float uTerrainSize;
          uniform float uDisplacementScale;
          uniform float uSeaY;

          void main() {
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);

            float shoreDamp = 1.0;
            if (uHasHeightMap > 0.5) {
              vec2 tUv = vec2(wp.x / uTerrainSize + 0.5, 0.5 - wp.z / uTerrainSize);
              float inBox = step(0.0, tUv.x) * step(tUv.x, 1.0) * step(0.0, tUv.y) * step(tUv.y, 1.0);
              float terrainH = texture2D(uHeightMap, clamp(tUv, 0.002, 0.998)).r * uDisplacementScale;
              float depth = mix(4.0, max(0.0, uSeaY - terrainH), inBox);
              shoreDamp = smoothstep(0.05, 1.45, depth);
            }
            vShoreDamp = shoreDamp;

            // Lightweight 3-wave directional Gerstner-style swell
            vec2 p = wp.xz;
            float p1 = dot(p, vec2(0.84, 0.54)) * 0.36 + uTime * 1.15;
            float p2 = dot(p, vec2(-0.52, 0.85)) * 0.58 + uTime * 1.45;
            float p3 = dot(p, vec2(0.28, -0.96)) * 0.92 - uTime * 1.80;

            float dy = (sin(p1) * 0.075 + sin(p2) * 0.048 + sin(p3) * 0.024) * shoreDamp;
            vec2 dxz = (vec2(0.84, 0.54) * cos(p1) * 0.04 + vec2(-0.52, 0.85) * cos(p2) * 0.025) * shoreDamp;

            wp.y += dy;
            wp.xz += dxz;
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying float vShoreDamp;

          uniform float uTime;
          uniform sampler2D uHeightMap;
          uniform float uHasHeightMap;
          uniform float uTerrainSize;
          uniform float uDisplacementScale;
          uniform float uSeaY;
          uniform vec3 uSunDir;
          uniform vec3 uFillDir;
          uniform vec3 uDeepColor;
          uniform vec3 uMidColor;
          uniform vec3 uShallowColor;
          uniform vec3 uSunColor;
          uniform vec3 uFillColor;
          uniform vec3 uSkyHorizon;
          uniform vec3 uSkyZenith;
          uniform vec3 uFoamColor;
          uniform vec3 uFogColor;
          uniform float uFogNear;
          uniform float uFogFar;
          uniform float uWireframe;

          float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }

          float vnoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash21(i);
            float b = hash21(i + vec2(1.0, 0.0));
            float c = hash21(i + vec2(0.0, 1.0));
            float d = hash21(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }

          // Analytic surface normal from 4 rotated directional wave octaves (zero extra texture fetches)
          vec3 computeWaterNormal(vec2 xz, float detailFade, float shoreDamp) {
            float ampScale = mix(0.42, 1.0, shoreDamp) * detailFade;

            float k1 = dot(xz, vec2(0.84, 0.54)) * 0.62 + uTime * 1.15;
            float k2 = dot(xz, vec2(-0.52, 0.85)) * 1.08 + uTime * 1.48;
            float k3 = dot(xz, vec2(0.35, -0.93)) * 1.92 - uTime * 1.92;
            float k4 = dot(xz, vec2(-0.91, -0.41)) * 3.18 + uTime * 2.35;

            vec2 grad = vec2(0.0);
            grad += vec2(0.84, 0.54) * cos(k1) * 0.125;
            grad += vec2(-0.52, 0.85) * cos(k2) * 0.095;
            grad += vec2(0.35, -0.93) * cos(k3) * 0.068 * detailFade;
            grad += vec2(-0.91, -0.41) * cos(k4) * 0.044 * detailFade;

            // Rotated capillary micro-ripples for realistic wave facet shimmer
            vec2 r1 = vec2(xz.x * 0.8 - xz.y * 0.6, xz.x * 0.6 + xz.y * 0.8);
            float c1 = sin(r1.x * 4.3 + r1.y * 2.9 + uTime * 2.6);
            float c2 = cos(r1.x * -3.7 + r1.y * 5.1 - uTime * 2.2);
            grad += vec2(c1, c2) * 0.036 * ampScale;

            return normalize(vec3(-grad.x, 1.0, -grad.y));
          }

          void main() {
            if (uWireframe > 0.5) {
              gl_FragColor = vec4(0.11, 0.34, 0.40, 0.38);
              return;
            }

            vec2 tUv = vec2(vWorldPos.x / uTerrainSize + 0.5, 0.5 - vWorldPos.z / uTerrainSize);
            vec2 clampedUv = clamp(tUv, 0.002, 0.998);
            float outsideDist = length(tUv - clampedUv);

            float terrainH = uSeaY - 3.5;
            if (uHasHeightMap > 0.5) {
              terrainH = texture2D(uHeightMap, clampedUv).r * uDisplacementScale;
            }

            float waterDepth = (uSeaY - terrainH) + outsideDist * 14.0;
            if (uHasHeightMap > 0.5 && outsideDist < 0.0001 && waterDepth < -0.05) {
              discard;
            }
            float depthPos = max(0.0, waterDepth);

            vec3 toCam = cameraPosition - vWorldPos;
            float camDist = length(toCam);
            vec3 V = toCam / max(camDist, 0.0001);

            // Distance-based normal & specular attenuation to avoid horizon shimmer
            float detailFade = 1.0 - smoothstep(38.0, 118.0, camDist);
            vec3 N = computeWaterNormal(vWorldPos.xz, detailFade, vShoreDamp);
            float NdotV = max(dot(N, V), 0.001);

            // Beer-Lambert exponential depth absorption
            float shallowFactor = exp(-depthPos * 0.90);
            float midFactor = exp(-depthPos * 0.32);
            vec3 col = mix(uDeepColor, uMidColor, midFactor);
            col = mix(col, uShallowColor, shallowFactor * 0.88);

            // Subtle non-grid dual-rotated underwater caustics in shoals & harbor
            float causticMask = exp(-depthPos * 1.25) * smoothstep(0.04, 0.32, depthPos) * detailFade;
            if (causticMask > 0.01) {
              vec2 c1 = vWorldPos.xz * 0.68;
              vec2 c2 = vec2(c1.x * 0.8 - c1.y * 0.6, c1.x * 0.6 + c1.y * 0.8) * 1.37;
              float wA = sin(c1.x + sin(c1.y * 1.15 + uTime * 0.85));
              float wB = cos(c2.y - sin(c2.x * 1.12 - uTime * 0.95));
              float caustic = pow(clamp(1.0 - abs(wA + wB) * 0.55, 0.0, 1.0), 4.0);
              col += vec3(0.22, 0.48, 0.50) * caustic * causticMask * 0.16;
            }

            // Schlick Fresnel + twilight sky reflection
            float fresnel = 0.03 + 0.97 * pow(1.0 - NdotV, 5.0);
            vec3 R = reflect(-V, N);
            float skyT = pow(clamp(R.y, 0.0, 1.0), 0.55);
            vec3 skyRefl = mix(uSkyHorizon, uSkyZenith, skyT);
            float sunHalo = pow(max(dot(R, uSunDir), 0.0), 6.0);
            float fillHalo = pow(max(dot(R, uFillDir), 0.0), 5.0);
            skyRefl += uSunColor * sunHalo * 0.36 + uFillColor * fillHalo * 0.16;
            col = mix(col, skyRefl, clamp(fresnel * 0.85, 0.0, 0.90));

            // Dual light specular response: golden-hour sun glints + cool moonlit/twilight wave facets
            vec3 Hsun = normalize(uSunDir + V);
            float NdotHsun = max(dot(N, Hsun), 0.0);
            float sunGlint = pow(NdotHsun, 180.0) * 1.45 * detailFade;
            float sunSheen = pow(NdotHsun, 24.0) * 0.18;

            vec3 Hfill = normalize(uFillDir + V);
            float NdotHfill = max(dot(N, Hfill), 0.0);
            float fillGlint = pow(NdotHfill, 96.0) * 0.55 * detailFade;

            float specMask = smoothstep(0.0, 0.22, depthPos);
            col += (uSunColor * (sunGlint + sunSheen) + uFillColor * fillGlint) * specMask;

            // Organic lacy shoreline foam & lapping surf
            float shoreZone = (1.0 - smoothstep(0.02, 0.62, depthPos)) * smoothstep(-0.02, 0.04, waterDepth);
            float foamAmount = 0.0;
            if (shoreZone > 0.01) {
              float fn1 = vnoise(vWorldPos.xz * 1.4 + vec2(uTime * 0.16, -uTime * 0.12));
              float fn2 = vnoise(vWorldPos.xz * 3.6 - vec2(uTime * 0.22, uTime * 0.18));
              float fNoise = fn1 * 0.65 + fn2 * 0.35;
              float lap = sin(depthPos * 11.5 - uTime * 2.0 + fNoise * 4.8) * 0.5 + 0.5;
              float waterline = (1.0 - smoothstep(0.0, 0.12, depthPos)) * (0.45 + 0.55 * fNoise);
              foamAmount = clamp(shoreZone * smoothstep(0.48, 0.90, lap * 0.55 + fNoise * 0.55) + waterline * 0.65, 0.0, 1.0);
              col = mix(col, uFoamColor, foamAmount * 0.55);
            }

            // Soft coastal translucency -> deep pelagic opacity + edge feather
            float shoreAlpha = smoothstep(-0.02, 0.14, waterDepth);
            float depthAlpha = mix(0.58, 0.94, 1.0 - exp(-depthPos * 0.85));
            float alpha = clamp((depthAlpha + foamAmount * 0.25) * shoreAlpha, 0.0, 0.96);

            // Seamless scene distance fog
            float fogFactor = smoothstep(uFogNear, uFogFar, camDist);
            col = mix(col, uFogColor, fogFactor);
            alpha = mix(alpha, 1.0, fogFactor * 0.85);

            gl_FragColor = vec4(col, alpha);
          }
        `}
      />
    </mesh>
  );
};

const TERRAIN_SHADER_COMMON = `
  varying vec3 vTerrWorldPos;
  varying vec3 vTerrWorldNormal;
  uniform float uSeaY;
  uniform float uDispScale;
  uniform float uShowBiome;

  float tHash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float tNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = tHash21(i);
    float b = tHash21(i + vec2(1.0, 0.0));
    float c = tHash21(i + vec2(0.0, 1.0));
    float d = tHash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float tFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 3; i++) {
      v += a * tNoise(p);
      p = rot * p * 2.07;
      a *= 0.5;
    }
    return v;
  }
`;

const TERRAIN_MAP_CHUNK = `
  vec3 tWPos = vTerrWorldPos;
  vec3 tWNorm = normalize(vTerrWorldNormal);
  float tSlope = clamp(1.0 - tWNorm.y, 0.0, 1.0);
  float tAboveSea = tWPos.y - uSeaY;
  float tHNorm = clamp(tWPos.y / max(uDispScale, 0.001), 0.0, 1.0);

  float fLarge = tFbm(tWPos.xz * 0.18);
  float fFine = tFbm(tWPos.xz * 0.95);
  float strata = sin(tWPos.y * 3.8 + fLarge * 3.4) * 0.5 + 0.5;

  if (uShowBiome > 0.5) {
    // Enrich base linear albedo with crisp world-space flora & moss variation
    vec3 mossTint = mix(vec3(0.012, 0.028, 0.014), vec3(0.036, 0.052, 0.020), fFine);
    vec3 baseCol = mix(diffuseColor.rgb * mix(0.82, 1.35, fFine), mossTint, 0.28);

    // Wet coastal slate & shingle near sea level (linear RGB)
    float shoreWet = 1.0 - smoothstep(-0.2, 0.70, tAboveSea);
    vec3 wetSlate = vec3(0.012, 0.017, 0.020) * (0.8 + 0.4 * fFine);
    baseCol = mix(baseCol, wetSlate, shoreWet * 0.78);

    // Stratified basalt & granite cliffs on steep slopes (linear RGB)
    float rockMask = smoothstep(0.13, 0.34, tSlope);
    vec3 rockDark = vec3(0.014, 0.016, 0.022);
    vec3 rockLit = vec3(0.052, 0.054, 0.064);
    vec3 rockCol = mix(rockDark, rockLit, strata * 0.72 + fFine * 0.28);
    baseCol = mix(baseCol, rockCol, rockMask * 0.90);

    // Wind-swept alpine snow on high ridges & saddles (linear RGB)
    float snowFactor = smoothstep(0.58, 0.78, tHNorm + (fLarge - 0.5) * 0.14 - tSlope * 0.46);
    vec3 snowCol = mix(vec3(0.32, 0.36, 0.42), vec3(0.58, 0.62, 0.68), fFine);
    baseCol = mix(baseCol, snowCol, snowFactor * 0.92);

    diffuseColor.rgb = baseCol;
  } else {
    // Architectural cartographic slate mode when Vegetation/Biome is toggled OFF (linear RGB)
    vec3 clay = mix(vec3(0.018, 0.022, 0.032), vec3(0.065, 0.075, 0.095), tHNorm);
    float contour = 1.0 - smoothstep(0.0, 0.055, abs(fract(tWPos.y * 0.85) - 0.5));
    clay = mix(clay, vec3(0.38, 0.22, 0.05), contour * 0.55);
    diffuseColor.rgb = clay;
  }
`;

const TERRAIN_NORMAL_CHUNK = `
  {
    vec2 pxz = vTerrWorldPos.xz;
    float tSlopeN = clamp(1.0 - normalize(vTerrWorldNormal).y, 0.0, 1.0);
    float eps = 0.22;
    float hC = tFbm(pxz * 1.15);
    float hX = tFbm((pxz + vec2(eps, 0.0)) * 1.15);
    float hZ = tFbm((pxz + vec2(0.0, eps)) * 1.15);
    float strataN = cos(vTerrWorldPos.y * 3.8 + hC * 3.4);
    float microStrength = mix(0.28, 0.85, smoothstep(0.10, 0.38, tSlopeN));
    vec3 gradWorld = vec3(
      (hC - hX) * microStrength * 1.8,
      strataN * tSlopeN * 0.16,
      (hC - hZ) * microStrength * 1.8
    );
    normal = normalize(normal + (viewMatrix * vec4(gradWorld, 0.0)).xyz);
  }
`;

const TERRAIN_ROUGHNESS_CHUNK = `
  {
    float tSlopeR = clamp(1.0 - normalize(vTerrWorldNormal).y, 0.0, 1.0);
    float tAboveR = vTerrWorldPos.y - uSeaY;
    float tHNormR = clamp(vTerrWorldPos.y / max(uDispScale, 0.001), 0.0, 1.0);
    float wetR = 1.0 - smoothstep(-0.15, 0.55, tAboveR);
    float snowR = smoothstep(0.60, 0.80, tHNormR - tSlopeR * 0.45);
    roughnessFactor = mix(0.88, 0.72, smoothstep(0.15, 0.4, tSlopeR));
    roughnessFactor = mix(roughnessFactor, 0.54, snowR);
    roughnessFactor = mix(roughnessFactor, 0.26, wetR * 0.85);
  }
`;

interface DisplacedTerrainMeshProps {
  heightData: Float32Array;
  heightRes: number;
  displacementScale: number;
  terrainVersion: number;
  seaY: number;
  albedoTex: THREE.Texture | null;
  showBiome: boolean;
  wireframe: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (e: ThreeEvent<PointerEvent>) => void;
}

const DisplacedTerrainMesh: React.FC<DisplacedTerrainMeshProps> = ({
  heightData,
  heightRes,
  displacementScale,
  terrainVersion,
  seaY,
  albedoTex,
  showBiome,
  wireframe,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) => {
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  useEffect(() => {
    const pos = geom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = sampleTerrainElevation(heightData, heightRes, x, z, TERRAIN_SIZE, displacementScale);
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
  }, [geom, heightData, heightRes, displacementScale, terrainVersion]);

  const uniformsRef = useRef({
    uSeaY: { value: seaY },
    uDispScale: { value: displacementScale },
    uShowBiome: { value: showBiome ? 1.0 : 0.0 },
  });

  useEffect(() => {
    uniformsRef.current.uSeaY.value = seaY;
    uniformsRef.current.uDispScale.value = displacementScale;
    uniformsRef.current.uShowBiome.value = showBiome ? 1.0 : 0.0;
  }, [seaY, displacementScale, showBiome]);

  const handleBeforeCompile = useMemo(
    () => (shader: THREE.WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uSeaY = uniformsRef.current.uSeaY;
      shader.uniforms.uDispScale = uniformsRef.current.uDispScale;
      shader.uniforms.uShowBiome = uniformsRef.current.uShowBiome;

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
  const matCacheKey = `aethelgard-terrain-pbr-v2-${hasMap ? 'map' : 'nomap'}`;

  return (
    <mesh
      geometry={geom}
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
};

interface TerrainFloraProps {
  heightData: Float32Array;
  heightRes: number;
  displacementScale: number;
  seaY: number;
  pins: MapPinType[];
  visible: boolean;
}

/**
 * Renders ~420 instanced boreal pines + ~140 angular boulders in 3 GPU draw calls.
 */
const TerrainFloraAndProps: React.FC<TerrainFloraProps> = ({
  heightData,
  heightRes,
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

    const pinePal = [new THREE.Color('#1c3323'), new THREE.Color('#253f2a'), new THREE.Color('#344528'), new THREE.Color('#4a3c22')];

    for (let i = 0; i < 1600 && tList.length < 420; i++) {
      const rx = (rand(i * 3 + 1) - 0.5) * (TERRAIN_SIZE * 0.9);
      const rz = (rand(i * 3 + 2) - 0.5) * (TERRAIN_SIZE * 0.9);
      if (nearPin(rx, rz)) continue;

      const y = sampleTerrainElevation(heightData, heightRes, rx, rz, TERRAIN_SIZE, displacementScale);
      const hNorm = y / Math.max(displacementScale, 0.001);
      if (y < seaY + 0.55 || hNorm > 0.54) continue;

      // Estimate local slope
      const yX = sampleTerrainElevation(heightData, heightRes, rx + 0.6, rz, TERRAIN_SIZE, displacementScale);
      const yZ = sampleTerrainElevation(heightData, heightRes, rx, rz + 0.6, TERRAIN_SIZE, displacementScale);
      const slope = Math.hypot(yX - y, yZ - y) / 0.6;
      if (slope > 0.36) continue;

      // Cluster trees organically using deterministic hash wave
      const cluster = Math.sin(rx * 0.16) * Math.cos(rz * 0.16) + rand(i * 7) * 0.5;
      if (cluster < 0.12) continue;

      const scale = 0.52 + rand(i * 5 + 3) * 0.55;
      tList.push({
        x: rx,
        y,
        z: rz,
        scale,
        rot: rand(i * 11) * Math.PI * 2,
        tint: pinePal[i % pinePal.length],
      });
    }

    for (let i = 0; i < 800 && rList.length < 130; i++) {
      const rx = (rand(i * 13 + 700) - 0.5) * (TERRAIN_SIZE * 0.92);
      const rz = (rand(i * 13 + 701) - 0.5) * (TERRAIN_SIZE * 0.92);
      if (nearPin(rx, rz)) continue;

      const y = sampleTerrainElevation(heightData, heightRes, rx, rz, TERRAIN_SIZE, displacementScale);
      if (y < seaY - 0.08 || y > displacementScale * 0.72) continue;

      const yX = sampleTerrainElevation(heightData, heightRes, rx + 0.6, rz, TERRAIN_SIZE, displacementScale);
      const yZ = sampleTerrainElevation(heightData, heightRes, rx, rz + 0.6, TERRAIN_SIZE, displacementScale);
      const slope = Math.hypot(yX - y, yZ - y) / 0.6;
      // Prefer rocky coasts and mountain talus rather than flat open meadows
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
  }, [heightData, heightRes, displacementScale, seaY, pins]);

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
          <instancedMesh ref={trunkRef} args={[undefined, undefined, trees.length]} castShadow receiveShadow>
            <cylinderGeometry args={[0.045, 0.08, 0.45, 5]} />
            <meshStandardMaterial color="#3b2c20" roughness={0.95} />
          </instancedMesh>
          <instancedMesh ref={crownRef} args={[undefined, undefined, trees.length]} castShadow receiveShadow>
            <coneGeometry args={[0.34, 1.05, 6]} />
            <meshStandardMaterial roughness={0.88} metalness={0.02} />
          </instancedMesh>
        </>
      )}
      {rocks.length > 0 && (
        <instancedMesh ref={rockRef} args={[undefined, undefined, rocks.length]} castShadow receiveShadow>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#3d434e" roughness={0.86} metalness={0.08} />
        </instancedMesh>
      )}
    </group>
  );
};

/**
 * Subtle drifting atmospheric clouds around mountain peaks and southern shoals.
 */
const AtmosphericMist: React.FC = () => {
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
        <mesh key={idx} position={c.pos} rotation={[-Math.PI / 2, 0, 0]}>
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
};

/**
 * Renders a terrain-hugging golden dashed spline path or region polygon.
 */
const TerrainPathOverlay: React.FC<{
  path: MapPath;
  heightData: Float32Array;
  resolution: number;
  displacement: number;
}> = ({ path, heightData, resolution, displacement }) => {
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
            sampleTerrainElevation(heightData, resolution, x, z, TERRAIN_SIZE, displacement) + 0.35;
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
        sampleTerrainElevation(heightData, resolution, pt.x, pt.z, TERRAIN_SIZE, displacement) + 0.32;
      return [pt.x, y, pt.z] as [number, number, number];
    });
  }, [path.points, isRegion, heightData, resolution, displacement]);

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
};

/**
 * Glowing 3D Pin Beacon + Dark-Glass <Html> Badge & Hover Card.
 */
const MapPin3D: React.FC<{
  pin: MapPinType;
  entity?: Entity;
  isSelected: boolean;
  isHovered: boolean;
  isTopView?: boolean;
  onSelect: () => void;
  onHover: (hover: boolean) => void;
}> = ({ pin, entity, isSelected, isHovered, isTopView = false, onSelect, onHover }) => {
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
        zIndexRange={[20, 0]}
        style={{ pointerEvents: 'auto' }}
      >
        <div
          className="relative flex flex-col items-center select-none"
          onMouseEnter={() => onHover(true)}
          onMouseLeave={() => onHover(false)}
        >
          {/* Hover Tooltip Preview Card */}
          {isHovered && !isSelected && (
            <div className="mb-2 w-[250px] rounded-lg dark-glass shadow-glass p-2.5 text-left pointer-events-none animate-in fade-in zoom-in-95 duration-100">
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
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium whitespace-nowrap transition-all cursor-pointer shadow-lg ${
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
};

/**
 * Full 3D Scene inside R3F Canvas.
 */
const TerrainScene: React.FC<TerrainSceneProps> = ({
  mapData,
  terrainActionsRef,
  labelDraftRef,
  elementDraftRef,
}) => {
  const {
    entities,
    mapPins,
    mapPaths,
    gmMode,
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
    activePropKind,
    selectedPropId,
    riverDrawingPoints,
    setSelectedPropId,
    addRiverPoint,
    finishRiver,
    addMapProp,
    updateMapProp,
    deleteMapProp,
    createMapLabel,
    updateMapLabel,
    updateMapAssets,
  } = useVaultStore();

  const controlsRef = useRef<OrbitControlsImpl>(null);
  const fogRef = useRef<THREE.Fog>(null);
  const { camera } = useThree();

  // Generate procedural terrain assets (memoized fallback for Shattered Reach)
  const procedural = useMemo(() => generateShatteredReachTerrain(512), []);

  const [heightTex, setHeightTex] = useState<THREE.Texture | null>(null);
  const [albedoTex, setAlbedoTex] = useState<THREE.Texture | null>(null);
  const [activeHeightData, setActiveHeightData] = useState<Float32Array>(() => procedural.heightData.slice());
  const [activeHeightRes, setActiveHeightRes] = useState<number>(procedural.resolution);
  const [terrainVersion, setTerrainVersion] = useState(0);
  const [brushCursor, setBrushCursor] = useState<{ x: number; y: number; z: number } | null>(null);

  const heightDataRef = useRef<Float32Array>(activeHeightData);
  const heightResRef = useRef<number>(activeHeightRes);
  const liveHeightTexRef = useRef<THREE.DataTexture | null>(null);
  const skipReloadHeightUrlRef = useRef<string | null>(null);
  const isSculptingRef = useRef(false);
  const didMutateTerrainRef = useRef(false);
  const flattenTargetRef = useRef<number>(SEA_LEVEL_NORM + 0.08);
  const lastSculptTsRef = useRef(0);
  const lastPaintPosRef = useRef<{ x: number; z: number } | null>(null);
  const draggingPropIdRef = useRef<string | null>(null);
  const draggingLabelIdRef = useRef<string | null>(null);

  const activeSeaNorm = mapData.generation_config?.seaLevel ?? SEA_LEVEL_NORM;
  const displacementScale = mapData.displacement_scale || DEFAULT_DISPLACEMENT;
  const effectiveDisplacementScale = mapLayers.terrain ? displacementScale : 0.4;
  const seaY = activeSeaNorm * effectiveDisplacementScale;

  const commitBakedTextures = useCallback(() => {
    const res = heightResRef.current;
    const baked = buildTexturesFromHeightData(heightDataRef.current, res, activeSeaNorm);
    skipReloadHeightUrlRef.current = baked.heightmapDataUrl;
    const loader = new THREE.TextureLoader();
    loader.load(baked.albedoDataUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      setAlbedoTex(tex);
    });
    updateMapAssets(mapData.id, {
      heightmap_url: baked.heightmapDataUrl,
      albedo_url: baked.albedoDataUrl,
    });
  }, [activeSeaNorm, mapData.id, updateMapAssets]);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
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
        const extracted = mapData.heightmap_url && tex.image
          ? extractHeightDataFromImage(tex.image, 512)
          : procedural.heightData.slice();
        const res = mapData.heightmap_url ? 512 : procedural.resolution;
        heightDataRef.current = extracted;
        heightResRef.current = res;
        const liveTex = buildLiveHeightDataTexture(extracted, res);
        liveHeightTexRef.current?.dispose();
        liveHeightTexRef.current = liveTex;
        setHeightTex(liveTex);
        setActiveHeightData(extracted);
        setActiveHeightRes(res);
        setTerrainVersion((v) => v + 1);
      });
    }

    loader.load(aUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      setAlbedoTex(tex);
    });
  }, [mapData.id, mapData.heightmap_url, mapData.albedo_url, procedural]);

  // Register river carving action handle for the UI toolbar
  useEffect(() => {
    terrainActionsRef.current = {
      carveRiver: (name: string, width: number, depth: number) => {
        const pts = useVaultStore.getState().riverDrawingPoints;
        if (pts.length < 2) return;
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
          activeSeaNorm
        );
        if (liveHeightTexRef.current) {
          syncLiveHeightDataTexture(liveHeightTexRef.current, heightDataRef.current, heightResRef.current);
        }
        setTerrainVersion((v) => v + 1);
        finishRiver(mapData.id, name, width, depth);
        commitBakedTextures();
      },
    };
    return () => {
      terrainActionsRef.current = null;
    };
  }, [terrainActionsRef, displacementScale, activeSeaNorm, finishRiver, mapData.id, commitBakedTextures]);

  // Ensure drag finishes cleanly even if pointer releases outside mesh
  useEffect(() => {
    const handleGlobalUp = () => {
      if (isSculptingRef.current && didMutateTerrainRef.current) {
        didMutateTerrainRef.current = false;
        commitBakedTextures();
      }
      isSculptingRef.current = false;
      draggingPropIdRef.current = null;
      draggingLabelIdRef.current = null;
      lastPaintPosRef.current = null;
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
      }
    };
    window.addEventListener('pointerup', handleGlobalUp);
    return () => window.removeEventListener('pointerup', handleGlobalUp);
  }, [commitBakedTextures]);

  // Initialize OrbitControls target once on mount (prevents inline target prop from resetting Top View/pan on re-renders)
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.copy(DEFAULT_TARGET);
      controlsRef.current.update();
    }
  }, []);

  // Camera Reset (3D Perspective) handler
  useEffect(() => {
    if (cameraResetSignal === 0) return;
    camera.position.copy(DEFAULT_CAMERA_POS);
    if (controlsRef.current) {
      controlsRef.current.target.copy(DEFAULT_TARGET);
      controlsRef.current.update();
    }
  }, [cameraResetSignal, camera]);

  // Camera Top-Down Whole World View handler
  useEffect(() => {
    if (cameraTopViewSignal === 0) return;
    camera.position.copy(TOP_CAMERA_POS);
    if (controlsRef.current) {
      controlsRef.current.target.copy(TOP_TARGET);
      controlsRef.current.update();
    }
  }, [cameraTopViewSignal, camera]);

  // Camera Zoom +/- handler
  useEffect(() => {
    if (cameraZoomSignal.seq === 0 || !controlsRef.current) return;
    const target = controlsRef.current.target;
    const dir = camera.position.clone().sub(target);
    const factor = cameraZoomSignal.delta > 0 ? 0.8 : 1.25;
    const nextLen = THREE.MathUtils.clamp(dir.length() * factor, 16, 220);
    dir.setLength(nextLen);
    camera.position.copy(target).add(dir);
    controlsRef.current.update();
  }, [cameraZoomSignal, camera]);

  // Update dynamic scale bar km + whole-world fog distance smoothly based on camera distance
  const lastKmRef = useRef(40);
  useFrame(() => {
    if (fogRef.current) {
      const camLen = camera.position.length();
      const topBlend = THREE.MathUtils.smoothstep(camLen, 76, 118);
      fogRef.current.near = THREE.MathUtils.lerp(68, 240, topBlend);
      fogRef.current.far = THREE.MathUtils.lerp(138, 460, topBlend);
    }
    if (!controlsRef.current) return;
    const dist = camera.position.distanceTo(controlsRef.current.target);
    const computed = Math.max(5, Math.round((dist * mapData.scale_config.kmPerUnit) / 2.8 / 5) * 5);
    if (computed !== lastKmRef.current) {
      lastKmRef.current = computed;
      setScaleBarKm(computed);
    }
  });

  const isBrushTool = (t: WorldsmithTool) =>
    t === 'raise' || t === 'valley' || t === 'flatten' || t === 'smooth' || t === 'coast';

  const applyBrushAtPoint = useCallback(
    (wx: number, wz: number, invert = false) => {
      applyTerrainBrush(heightDataRef.current, heightResRef.current, wx, wz, {
        tool: worldsmithTool,
        radius: brushRadius,
        strength: brushStrength,
        falloff: brushFalloff,
        targetHeightNorm: flattenTargetRef.current,
        seaLevelNorm: activeSeaNorm,
        invert,
      });
      didMutateTerrainRef.current = true;
      const now = performance.now();
      if (now - lastSculptTsRef.current >= 24) {
        lastSculptTsRef.current = now;
        if (liveHeightTexRef.current) {
          syncLiveHeightDataTexture(liveHeightTexRef.current, heightDataRef.current, heightResRef.current);
        }
        setTerrainVersion((v) => v + 1);
      }
    },
    [worldsmithTool, brushRadius, brushStrength, brushFalloff, activeSeaNorm]
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
          TERRAIN_SIZE,
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
    [activePropKind, brushRadius, effectiveDisplacementScale, seaY, addMapProp, mapData.id]
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

  const handleSurfaceClick = (e: ThreeEvent<MouseEvent>) => {
    if (worldsmithMode) return;
    // Ignore drag-orbit / drag-pan releases
    if (e.delta > 6) return;
    e.stopPropagation();

    const pt = {
      x: Number(e.point.x.toFixed(2)),
      y: Number(e.point.y.toFixed(2)),
      z: Number(e.point.z.toFixed(2)),
    };

    if (mapToolMode === 'pin') {
      setPendingPinCoord(pt);
    } else if (mapToolMode === 'text') {
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
    } else if (mapToolMode === 'path' || mapToolMode === 'region' || mapToolMode === 'zone') {
      addDrawingPoint(pt);
    } else if (mapToolMode === 'element') {
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
    } else if (mapToolMode === 'select') {
      setSelectedPinId(null);
      setSelectedZoneId(null);
      setSelectedLabelId(null);
      setSelectedPropId(null);
    }
  };

  const handleTerrainPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!worldsmithMode || e.button !== 0) return;
    e.stopPropagation();

    const pt = { x: e.point.x, y: e.point.y, z: e.point.z };
    setBrushCursor(pt);

    if (isBrushTool(worldsmithTool)) {
      isSculptingRef.current = true;
      didMutateTerrainRef.current = false;
      if (worldsmithTool === 'flatten') {
        flattenTargetRef.current = e.point.y / Math.max(effectiveDisplacementScale, 0.01);
      }
      lastSculptTsRef.current = 0;
      applyBrushAtPoint(pt.x, pt.z, e.shiftKey);
    } else if (worldsmithTool === 'river') {
      addRiverPoint(pt);
    } else if (worldsmithTool === 'paint-flora') {
      isSculptingRef.current = true;
      stampFloraAtPoint(pt.x, pt.z);
      lastPaintPosRef.current = { x: pt.x, z: pt.z };
    } else if (worldsmithTool === 'place-mesh') {
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
    } else if (worldsmithTool === 'erase-mesh') {
      isSculptingRef.current = true;
      erasePropsWithinRadius(pt.x, pt.z);
    } else if (worldsmithTool === 'edit-mesh') {
      setSelectedPropId(null);
    }
  };

  const handleSurfacePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const pt = { x: e.point.x, y: e.point.y, z: e.point.z };

    if (draggingLabelIdRef.current) {
      e.stopPropagation();
      updateMapLabel(mapData.id, draggingLabelIdRef.current, {
        x: Number(pt.x.toFixed(2)),
        y: Number(pt.y.toFixed(2)),
        z: Number(pt.z.toFixed(2)),
      });
      return;
    }

    if (draggingPropIdRef.current && (!worldsmithMode || worldsmithTool === 'edit-mesh')) {
      e.stopPropagation();
      updateMapProp(mapData.id, draggingPropIdRef.current, {
        x: Number(pt.x.toFixed(2)),
        y: Number(pt.y.toFixed(2)),
        z: Number(pt.z.toFixed(2)),
      });
      return;
    }

    if (!worldsmithMode) {
      if (brushCursor) setBrushCursor(null);
      return;
    }

    setBrushCursor(pt);

    if (!isSculptingRef.current) return;
    e.stopPropagation();

    if (isBrushTool(worldsmithTool)) {
      applyBrushAtPoint(pt.x, pt.z, e.shiftKey);
    } else if (worldsmithTool === 'paint-flora') {
      const prev = lastPaintPosRef.current;
      if (!prev || Math.hypot(pt.x - prev.x, pt.z - prev.z) >= Math.max(1.5, brushRadius * 0.45)) {
        stampFloraAtPoint(pt.x, pt.z);
        lastPaintPosRef.current = { x: pt.x, z: pt.z };
      }
    } else if (worldsmithTool === 'erase-mesh') {
      erasePropsWithinRadius(pt.x, pt.z);
    }
  };

  const handleTerrainPointerUp = () => {
    if (isSculptingRef.current && didMutateTerrainRef.current) {
      if (liveHeightTexRef.current) {
        syncLiveHeightDataTexture(liveHeightTexRef.current, heightDataRef.current, heightResRef.current);
      }
      setTerrainVersion((v) => v + 1);
      didMutateTerrainRef.current = false;
      commitBakedTextures();
    }
    isSculptingRef.current = false;
    draggingPropIdRef.current = null;
    draggingLabelIdRef.current = null;
    lastPaintPosRef.current = null;
    if (controlsRef.current) {
      controlsRef.current.enabled = true;
    }
  };

  const handleSelectProp = useCallback(
    (prop: MapProp) => {
      if (worldsmithMode) {
        if (worldsmithTool === 'erase-mesh') {
          deleteMapProp(mapData.id, prop.id);
          return;
        }
        setSelectedPropId(prop.id);
        if (worldsmithTool === 'edit-mesh') {
          draggingPropIdRef.current = prop.id;
          if (controlsRef.current) controlsRef.current.enabled = false;
        }
        return;
      }

      if (mapToolMode === 'select' || mapToolMode === 'element') {
        setSelectedPropId(prop.id);
        if (mapToolMode === 'select') {
          draggingPropIdRef.current = prop.id;
          if (controlsRef.current) controlsRef.current.enabled = false;
        }
      }
    },
    [worldsmithMode, worldsmithTool, mapToolMode, deleteMapProp, mapData.id, setSelectedPropId]
  );

  const handleSelectLabel = useCallback(
    (label: WorldMapLabel) => {
      setSelectedLabelId(label.id);
      if (!worldsmithMode && mapToolMode === 'select') {
        draggingLabelIdRef.current = label.id;
        if (controlsRef.current) controlsRef.current.enabled = false;
      }
    },
    [worldsmithMode, mapToolMode, setSelectedLabelId]
  );

  const visiblePins = useMemo(
    () =>
      mapPins.filter(
        (p) => p.map_id === mapData.id && (gmMode || !p.is_gm_only) && mapLayers.locations
      ),
    [mapPins, mapData.id, gmMode, mapLayers.locations]
  );

  const visiblePaths = useMemo(
    () =>
      mapPaths.filter((p) => {
        if (p.map_id !== mapData.id) return false;
        if (!gmMode && p.is_gm_only) return false;
        if (p.style === 'region-polygon') return mapLayers.regions;
        return mapLayers.paths;
      }),
    [mapPaths, mapData.id, gmMode, mapLayers.paths, mapLayers.regions]
  );

  const showBrushRing =
    worldsmithMode &&
    (isBrushTool(worldsmithTool) || worldsmithTool === 'paint-flora' || worldsmithTool === 'erase-mesh');

  const brushRingColor =
    worldsmithTool === 'erase-mesh'
      ? '#f87171'
      : worldsmithTool === 'valley' || worldsmithTool === 'coast'
      ? '#38bdf8'
      : worldsmithTool === 'paint-flora'
      ? '#4ade80'
      : '#facc15';

  const atmosphere =
    ATMOSPHERE_PRESETS[mapData.atmosphere || 'golden-hour'] || ATMOSPHERE_PRESETS['golden-hour'];

  const mapWorldLayers =
    mapData.layers && mapData.layers.length > 0 ? mapData.layers : createDefaultWorldLayers();

  const isZoneDrawing = mapToolMode === 'zone' || mapToolMode === 'region';

  return (
    <>
      <color attach="background" args={[atmosphere.bg]} />
      <fog ref={fogRef} attach="fog" args={[atmosphere.fog, 68, 138]} />

      {/* Atmosphere-driven directional & twilight hemisphere lighting */}
      <hemisphereLight args={[atmosphere.hemiSky, atmosphere.hemiGround, atmosphere.hemiIntensity]} />
      <directionalLight
        position={atmosphere.sunPos}
        intensity={atmosphere.sunIntensity}
        color={atmosphere.sunColor}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-near={5}
        shadow-camera-far={165}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[42, 22, -38]} intensity={atmosphere.fillIntensity} color={atmosphere.fillColor} />

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.07}
        minDistance={16}
        maxDistance={230}
        maxPolarAngle={Math.PI * 0.45}
        minPolarAngle={0.004}
        mouseButtons={
          worldsmithMode
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

      {/* CPU-Displaced 3D Terrain Mesh with World-Space Strata, Biome & Wet-Shore PBR */}
      <DisplacedTerrainMesh
        heightData={activeHeightData}
        heightRes={activeHeightRes}
        displacementScale={effectiveDisplacementScale}
        terrainVersion={terrainVersion}
        seaY={seaY}
        albedoTex={albedoTex}
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
        visible={mapLayers.vegetation && mapRenderMode === 'map'}
        selectedPropId={selectedPropId}
        interactive={worldsmithMode || mapToolMode === 'select' || mapToolMode === 'element'}
        onSelectProp={handleSelectProp}
      />

      {/* Sculptable Rivers + Animated Flow Shader */}
      <TerrainRivers3D
        rivers={mapData.rivers || []}
        heightData={activeHeightData}
        heightRes={activeHeightRes}
        displacementScale={effectiveDisplacementScale}
        seaY={seaY}
        terrainVersion={terrainVersion}
        visible={mapRenderMode === 'map' && mapLayers.rivers}
        previewPoints={riverDrawingPoints}
      />

      {/* Thematic Zones (Countries, Regions, Religions, Cultures, Custom Layers) */}
      <TerrainZones3D
        zones={mapData.zones || []}
        layers={mapWorldLayers}
        heightData={activeHeightData}
        heightRes={activeHeightRes}
        displacementScale={effectiveDisplacementScale}
        seaY={seaY}
        terrainVersion={terrainVersion}
        gmMode={gmMode}
        showRegionsLayer={mapLayers.regions}
        showLabelsLayer={mapLayers.labels}
        selectedZoneId={selectedZoneId}
        interactive={!worldsmithMode && mapToolMode === 'select'}
        onSelectZone={(id) => setSelectedZoneId(id)}
      />

      {/* 3D World Text Labels (Editable, Draggable & Layer-Filtered) */}
      <TerrainLabels3D
        labels={mapData.labels || []}
        layers={mapWorldLayers}
        heightData={activeHeightData}
        heightRes={activeHeightRes}
        displacementScale={effectiveDisplacementScale}
        seaY={seaY}
        gmMode={gmMode}
        visible={mapLayers.labels}
        selectedLabelId={selectedLabelId}
        interactive={!worldsmithMode && mapToolMode === 'select'}
        onSelectLabel={(label) => handleSelectLabel(label)}
      />

      {/* 3D Sculpt / Paint Brush Cursor Ring */}
      <BrushCursorRing
        position={brushCursor}
        radius={brushRadius}
        visible={showBrushRing}
        color={brushRingColor}
      />

      {/* Animated Sea Level Water Shader */}
      <SeaLevelWater
        seaY={seaY}
        heightTex={heightTex}
        displacementScale={effectiveDisplacementScale}
        wireframe={mapRenderMode === 'terrain'}
        atmosphereKey={mapData.atmosphere || 'golden-hour'}
        disableRaycast={
          worldsmithMode &&
          (isBrushTool(worldsmithTool) ||
            worldsmithTool === 'paint-flora' ||
            worldsmithTool === 'erase-mesh')
        }
        onClick={handleSurfaceClick}
        onPointerMove={handleSurfacePointerMove}
        onPointerUp={handleTerrainPointerUp}
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
          displacement={displacementScale}
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
        visiblePins.map((pin) => {
          const linkedEntity = entities.find((e) => e.id === pin.entity_id);
          return (
            <MapPin3D
              key={pin.id}
              pin={pin}
              entity={linkedEntity}
              isSelected={selectedPinId === pin.id}
              isHovered={hoveredPinId === pin.id}
              isTopView={mapCameraView === 'top'}
              onSelect={() => setSelectedPinId(selectedPinId === pin.id ? null : pin.id)}
              onHover={(hover) => setHoveredPinId(hover ? pin.id : null)}
            />
          );
        })}
    </>
  );
};

export const MapViewport3D: React.FC<{ mapId: string }> = ({ mapId }) => {
  const {
    maps,
    mapRenderMode,
    setMapRenderMode,
    mapCameraView,
    mapToolMode,
    setMapToolMode,
    mapLayers,
    toggleMapLayer,
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
    riverDrawingPoints,
    clearRiverPoints,
    setMapGeneratorModalOpen,
    toggleWorldLayer,
    soloWorldLayer,
    addWorldLayer,
    createMapZone,
    setRightInspectorCollapsed,
  } = useVaultStore();

  const [layersDropdownOpen, setLayersDropdownOpen] = useState(false);
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);
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

  const activeMap = maps.find((m) => m.id === mapId) || maps[0];
  const worldLayers = useMemo(
    () =>
      activeMap?.layers && activeMap.layers.length > 0
        ? activeMap.layers
        : createDefaultWorldLayers(),
    [activeMap?.layers]
  );

  // Keyboard shortcuts: T toggles Whole World Top View, Esc exits active Atlas tool
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
  }, [mapCameraView, triggerCameraReset, triggerTopView, worldsmithMode, mapToolMode, setMapToolMode]);

  if (!activeMap) return null;

  const cursorClass = worldsmithMode
    ? worldsmithTool === 'edit-mesh'
      ? 'cursor-pointer'
      : 'cursor-crosshair'
    : mapToolMode === 'pin' ||
      mapToolMode === 'text' ||
      mapToolMode === 'path' ||
      mapToolMode === 'region' ||
      mapToolMode === 'zone' ||
      mapToolMode === 'element'
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
        dpr={[1, 2]}
        camera={{
          position: [DEFAULT_CAMERA_POS.x, DEFAULT_CAMERA_POS.y, DEFAULT_CAMERA_POS.z],
          fov: 44,
          near: 0.5,
          far: 450,
        }}
      >
        <TerrainScene
          mapData={activeMap}
          terrainActionsRef={terrainActionsRef}
          labelDraftRef={labelDraftRef}
          elementDraftRef={elementDraftRef}
        />
      </Canvas>

      {/* Option A: Single Centered Top Mode Pill + Clean Drawing Prompt */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-none max-w-[95vw]">
        <div className="flex items-center gap-1.5 p-1 rounded-xl dark-glass shadow-glass border border-[#171c26] pointer-events-auto">
          {/* Map | Terrain */}
          <div className="flex items-center p-0.5 rounded-lg bg-[#050608]/90">
            <button
              onClick={() => setMapRenderMode('map')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-all ${
                mapRenderMode === 'map'
                  ? 'btn-gold-metallic font-semibold'
                  : 'text-[#8e96a3] hover:text-white'
              }`}
            >
              <MapIcon className="w-3 h-3" />
              <span>Map</span>
            </button>
            <button
              onClick={() => setMapRenderMode('terrain')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-all ${
                mapRenderMode === 'terrain'
                  ? 'btn-gold-metallic font-semibold'
                  : 'text-[#8e96a3] hover:text-white'
              }`}
            >
              <Mountain className="w-3 h-3" />
              <span>Terrain</span>
            </button>
          </div>

          <span className="w-px h-4 bg-[#171c26]" />

          {/* Atlas | Worldsmith */}
          <div className="flex items-center p-0.5 rounded-lg bg-[#050608]/90">
            <button
              onClick={() => setWorldsmithMode(false)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-all ${
                !worldsmithMode
                  ? 'bg-[#12161f] text-[#d6b16a] border border-[#b68d40]/45 font-semibold'
                  : 'text-[#8e96a3] hover:text-white'
              }`}
            >
              <Compass className="w-3 h-3" />
              <span>Atlas</span>
            </button>
            <button
              onClick={() => setWorldsmithMode(true)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-all ${
                worldsmithMode
                  ? 'btn-gold-metallic font-semibold'
                  : 'text-[#8e96a3] hover:text-white'
              }`}
            >
              <Hammer className="w-3 h-3" />
              <span>Worldsmith</span>
            </button>
          </div>

          <span className="w-px h-4 bg-[#171c26]" />

          {/* 3D | Top View */}
          <div className="flex items-center p-0.5 rounded-lg bg-[#050608]/90">
            <button
              onClick={() => triggerCameraReset()}
              title="3D Perspective Camera"
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-medium transition-all ${
                mapCameraView === 'perspective'
                  ? 'bg-[#12161f] text-[#d6b16a] border border-[#b68d40]/45 font-semibold'
                  : 'text-[#8e96a3] hover:text-white'
              }`}
            >
              <Compass className="w-3 h-3" />
              <span>3D</span>
            </button>
            <button
              onClick={() => triggerTopView()}
              title="Top-Down Whole World View (Shortcut: T)"
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-medium transition-all ${
                mapCameraView === 'top'
                  ? 'btn-gold-metallic font-semibold'
                  : 'text-[#8e96a3] hover:text-white'
              }`}
            >
              <Globe className="w-3 h-3" />
              <span>Top View</span>
            </button>
          </div>
        </div>

        {/* Contextual Instruction Prompt Below Top Pill (Only When Sculpting or Drawing) */}
        {worldsmithMode ? (
          <div className="px-3 py-1 rounded-full bg-[#100d07]/92 border border-[#b68d40]/45 text-[11px] text-[#d6b16a] flex items-center gap-2 shadow-gold-sm pointer-events-auto">
            <span>
              {worldsmithTool === 'raise' && 'Left-drag: Raise Mountain (Shift: Lower) • Right-drag: Orbit'}
              {worldsmithTool === 'valley' && 'Left-drag: Carve Valley • Right-drag: Orbit'}
              {worldsmithTool === 'flatten' && 'Left-drag: Flatten Plateau • Right-drag: Orbit'}
              {worldsmithTool === 'smooth' && 'Left-drag: Smooth Ridges • Right-drag: Orbit'}
              {worldsmithTool === 'coast' && 'Left-drag: Sink Coastline • Right-drag: Orbit'}
              {worldsmithTool === 'river' && 'Click waypoints down-slope, then Carve River'}
              {worldsmithTool === 'paint-flora' && 'Left-drag: Paint Trees & Boulders • Right-drag: Orbit'}
              {worldsmithTool === 'place-mesh' && 'Click terrain to place active hero mesh'}
              {worldsmithTool === 'edit-mesh' && 'Drag a 3D mesh to reposition • Tune in Inspector'}
              {worldsmithTool === 'erase-mesh' && 'Left-drag to erase meshes & flora inside brush'}
            </span>
            <button
              onClick={() => setRightInspectorCollapsed(false)}
              className="text-[#c9a050] hover:text-white underline text-[10.5px] font-medium"
            >
              Brush
            </button>
          </div>
        ) : (
          mapToolMode !== 'select' && (
            <div className="px-3 py-1 rounded-full bg-[#100d07]/92 border border-[#b68d40]/45 text-[11px] text-[#d6b16a] flex items-center gap-2 shadow-gold-sm pointer-events-auto">
              <span>
                {mapToolMode === 'pin' && 'Click terrain or sea to drop a Location Pin'}
                {mapToolMode === 'text' && 'Configure label below, then click the world to place text'}
                {(mapToolMode === 'zone' || mapToolMode === 'region') &&
                  'Click boundary points (min 3), choose Layer & Save Zone'}
                {mapToolMode === 'path' && 'Click terrain points to trace a route, then Save'}
                {mapToolMode === 'element' && 'Select a 3D element below and click to place it'}
                {mapToolMode === 'link' && 'Click a pin or create a new linked grimoire note'}
              </span>
              <button
                onClick={() => setMapToolMode('select')}
                className="text-[#c9a050] hover:text-white underline text-[10.5px]"
              >
                Esc
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

      {/* Option A: Bottom-Center Studio Tool & Layer Dock */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-1.5 py-1 rounded-xl dark-glass shadow-glass border border-[#171c26] max-w-[94vw]">
        {/* Active Tool Buttons */}
        <div className="flex items-center gap-0.5">
          {worldsmithMode ? (
            (
              [
                { id: 'raise', icon: ArrowUpFromLine, label: 'Raise Mountain' },
                { id: 'valley', icon: ArrowDownToLine, label: 'Carve Valley' },
                { id: 'flatten', icon: Minus, label: 'Flatten Plateau' },
                { id: 'smooth', icon: Wand2, label: 'Smooth Terrain' },
                { id: 'coast', icon: Waves, label: 'Lower to Sea / Coast' },
                { id: 'river', icon: Route, label: 'Carve River Spline' },
                { id: 'paint-flora', icon: Trees, label: 'Paint Trees & Rocks Brush' },
                { id: 'place-mesh', icon: Castle, label: 'Place Hero Mesh' },
                { id: 'edit-mesh', icon: Move, label: 'Select / Move Mesh' },
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
          ) : (
            (
              [
                { id: 'select', icon: MousePointer, label: 'Select / Move / Inspect' },
                { id: 'pin', icon: MapPin, label: 'Add Location Pin' },
                { id: 'text', icon: Type, label: 'Add Text Label' },
                { id: 'zone', icon: Pentagon, label: 'Draw Country / Region / Layer Zone' },
                { id: 'path', icon: Route, label: 'Draw Path / Route' },
                { id: 'element', icon: Castle, label: 'Place 3D Element' },
                { id: 'link', icon: Link2, label: 'Link Note' },
              ] as const
            ).map((tool) => {
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
        <div className="relative">
          <button
            onClick={() => {
              setLayersDropdownOpen((v) => !v);
              setToolsDropdownOpen(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              layersDropdownOpen
                ? 'bg-[#b68d40]/18 text-[#d6b16a] border border-[#b68d40]/50'
                : 'text-[#ccc6ba] hover:bg-[#10141c]'
            }`}
            title="Base Layers & World Overlays (Countries, Regions, Religions...)"
          >
            <Layers className="w-3.5 h-3.5 text-[#b68d40]" />
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

                {!newLayerOpen ? (
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
                )}
              </div>
            </div>
          )}
        </div>

        {/* Map Tools Upward Popover */}
        <div className="relative">
          <button
            onClick={() => {
              setToolsDropdownOpen((v) => !v);
              setLayersDropdownOpen(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              toolsDropdownOpen
                ? 'bg-[#b68d40]/18 text-[#d6b16a] border border-[#b68d40]/50'
                : 'text-[#ccc6ba] hover:bg-[#10141c]'
            }`}
            title="World Generator, Atmosphere, Heightmap & Quick Actions"
          >
            <Wrench className="w-3.5 h-3.5 text-[#b68d40]" />
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

        {/* Worldsmith Brush / Mesh Settings Trigger */}
        {worldsmithMode && (
          <button
            onClick={() => setRightInspectorCollapsed(false)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#0e1218] border border-[#b68d40]/35 text-[#d6b16a] hover:border-[#b68d40]"
            title="Open Brush Radius, Strength & Mesh Inspector"
          >
            <Settings2 className="w-3.5 h-3.5" />
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
      <div className="absolute bottom-3.5 right-3.5 z-20 flex flex-col gap-1.5">
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
      <PinEntitySlideOver />
    </div>
  );
};
