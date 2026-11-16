import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { Html, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import { TERRAIN_SIZE, sampleTerrainElevation } from '../../lib/terrainGenerator';
import { evalSplinePoint } from '../../lib/terrainEditorEngine';
import {
  buildTerrainConformingPolygonGeometry,
  computePolygonCentroid,
  sampleClosedBorderPoints,
  sampleLandOrSeaElevation,
} from '../../lib/worldLayers';
import {
  FogVolume,
  MapProp,
  MapRiver,
  WorldMapLabel,
  WorldMapLayer,
  WorldMapZone,
} from '../../types/vault';

interface BrushCursorRingProps {
  position: { x: number; y: number; z: number } | null;
  radius: number;
  visible: boolean;
  color?: string;
}

export const BrushCursorRing: React.FC<BrushCursorRingProps> = ({
  position,
  radius,
  visible,
  color = '#facc15',
}) => {
  if (!visible || !position) return null;
  return (
    <group position={[position.x, position.y + 0.16, position.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[Math.max(0.2, radius - 0.14), radius, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
};

interface RiverRibbonProps {
  river: MapRiver;
  heightData: Float32Array;
  heightRes: number;
  displacementScale: number;
  seaY: number;
  terrainVersion: number;
  terrainSize: number;
}

const SingleRiverRibbon: React.FC<RiverRibbonProps> = ({
  river,
  heightData,
  heightRes,
  displacementScale,
  seaY,
  terrainVersion,
  terrainSize,
}) => {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    []
  );

  useFrame((_, delta) => {
    uniforms.uTime.value += Math.min(delta, 0.05);
  });

  const geometry = useMemo(() => {
    const pts = river.points;
    if (pts.length < 2) return null;

    const steps = Math.max(28, pts.length * 16);
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    let accumLen = 0;
    let prevPt = evalSplinePoint(pts, 0);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = evalSplinePoint(pts, t);
      const pNext = evalSplinePoint(pts, Math.min(1, t + 1 / steps));
      const pPrev = evalSplinePoint(pts, Math.max(0, t - 1 / steps));

      accumLen += Math.hypot(p.x - prevPt.x, p.z - prevPt.z);
      prevPt = p;

      let tx = pNext.x - pPrev.x;
      let tz = pNext.z - pPrev.z;
      const tLen = Math.hypot(tx, tz) || 1;
      tx /= tLen;
      tz /= tLen;

      // Perpendicular across channel
      const nx = -tz;
      const nz = tx;
      // Slightly widen near end (mouth)
      const halfW = river.width * (0.48 + t * 0.22);

      const lx = p.x + nx * halfW;
      const lz = p.z + nz * halfW;
      const rx = p.x - nx * halfW;
      const rz = p.z - nz * halfW;

      const yCenter = sampleTerrainElevation(heightData, heightRes, p.x, p.z, terrainSize, displacementScale);
      const yLeft = sampleTerrainElevation(heightData, heightRes, lx, lz, terrainSize, displacementScale);
      const yRight = sampleTerrainElevation(heightData, heightRes, rx, rz, terrainSize, displacementScale);
      const bankY = (yLeft + yRight) * 0.5;
      const waterY = Math.max(
        seaY + 0.03,
        bankY > yCenter + 0.08 ? Math.min(bankY - 0.03, yCenter + 0.28) : yCenter + 0.14
      );

      positions.push(lx, waterY, lz, rx, waterY, rz);
      uvs.push(0, accumLen * 0.35, 1, accumLen * 0.35);

      if (i < steps) {
        const base = i * 2;
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }, [river, heightData, heightRes, displacementScale, seaY, terrainVersion, terrainSize]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} renderOrder={2}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        vertexShader={`
          varying vec2 vUv;
          varying vec3 vWorldPos;
          void main() {
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `}
        fragmentShader={`
          uniform float uTime;
          varying vec2 vUv;
          varying vec3 vWorldPos;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }

          void main() {
            float edge = abs(vUv.x - 0.5) * 2.0;
            float flow1 = noise(vec2(vUv.x * 5.0, vUv.y * 2.4 - uTime * 1.35));
            float flow2 = noise(vec2(vUv.x * 9.0 + 3.1, vUv.y * 4.2 - uTime * 2.1));
            float ripple = flow1 * 0.6 + flow2 * 0.4;

            vec3 deepRiver = vec3(0.06, 0.24, 0.30);
            vec3 midRiver = vec3(0.11, 0.42, 0.49);
            vec3 foamCol = vec3(0.76, 0.87, 0.90);

            vec3 col = mix(deepRiver, midRiver, 0.35 + ripple * 0.55);
            float bankFoam = smoothstep(0.68, 0.96, edge + ripple * 0.14);
            float crestGlint = smoothstep(0.76, 0.94, ripple) * (1.0 - edge * 0.7);
            col = mix(col, foamCol, bankFoam * 0.65 + crestGlint * 0.35);

            float alpha = smoothstep(1.0, 0.78, edge) * 0.86;
            gl_FragColor = vec4(col, alpha);
          }
        `}
      />
    </mesh>
  );
};

interface TerrainRivers3DProps {
  rivers: MapRiver[];
  heightData: Float32Array;
  heightRes: number;
  displacementScale: number;
  seaY: number;
  terrainVersion: number;
  terrainSize?: number;
  visible: boolean;
  previewPoints: Array<{ x: number; y: number; z: number }>;
}

export const TerrainRivers3D: React.FC<TerrainRivers3DProps> = ({
  rivers,
  heightData,
  heightRes,
  displacementScale,
  seaY,
  terrainVersion,
  terrainSize = TERRAIN_SIZE,
  visible,
  previewPoints,
}) => {
  return (
    <group visible={visible}>
      {rivers.map((r) => (
        <SingleRiverRibbon
          key={r.id}
          river={r}
          heightData={heightData}
          heightRes={heightRes}
          displacementScale={displacementScale}
          seaY={seaY}
          terrainVersion={terrainVersion}
          terrainSize={terrainSize}
        />
      ))}

      {previewPoints.length > 0 && (
        <group>
          {previewPoints.map((pt, idx) => (
            <mesh key={idx} position={[pt.x, pt.y + 0.35, pt.z]}>
              <sphereGeometry args={[0.32, 12, 12]} />
              <meshBasicMaterial color="#38bdf8" />
            </mesh>
          ))}
          {previewPoints.length >= 2 && (
            <Line
              points={previewPoints.map((p) => [p.x, p.y + 0.35, p.z] as [number, number, number])}
              color="#38bdf8"
              lineWidth={3}
              dashed
              dashSize={0.9}
              gapSize={0.45}
            />
          )}
        </group>
      )}
    </group>
  );
};

interface TerrainProps3DProps {
  propsList: MapProp[];
  heightData: Float32Array;
  heightRes: number;
  displacementScale: number;
  seaY?: number;
  terrainVersion: number;
  terrainSize?: number;
  visible: boolean;
  selectedPropId: string | null;
  interactive: boolean;
  onSelectProp: (prop: MapProp, e: ThreeEvent<PointerEvent>) => void;
}

const HeroPropMesh: React.FC<{
  prop: MapProp;
  y: number;
  isSelected: boolean;
  interactive: boolean;
  onSelectProp: (prop: MapProp, e: ThreeEvent<PointerEvent>) => void;
}> = ({ prop, y, isSelected, interactive, onSelectProp }) => {
  const handleDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    onSelectProp(prop, e);
  };

  return (
    <group
      position={[prop.x, y, prop.z]}
      rotation={[0, prop.rotY, 0]}
      scale={prop.scale}
      onPointerDown={handleDown}
    >
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.16, 0]}>
          <ringGeometry args={[1.05, 1.32, 32]} />
          <meshBasicMaterial color="#facc15" side={THREE.DoubleSide} />
        </mesh>
      )}

      {isSelected && prop.name && (
        <Html position={[0, 2.5, 0]} center zIndexRange={[15, 0]}>
          <div className="px-2 py-0.5 rounded bg-[#101319]/90 border border-[#d4a853]/70 text-[10.5px] font-serif text-[#f7ecc9] whitespace-nowrap pointer-events-none shadow-md">
            {prop.name}
          </div>
        </Html>
      )}

      {prop.kind === 'tower' && (
        <group>
          <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.36, 0.46, 1.5, 8]} />
            <meshStandardMaterial color="#6e737b" roughness={0.85} />
          </mesh>
          <mesh position={[0, 1.65, 0]} castShadow>
            <coneGeometry args={[0.48, 0.58, 8]} />
            <meshStandardMaterial color="#3c2a24" roughness={0.78} />
          </mesh>
          <mesh position={[0, 1.32, 0.34]}>
            <boxGeometry args={[0.14, 0.18, 0.08]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1.6} />
          </mesh>
        </group>
      )}

      {prop.kind === 'castle' && (
        <group>
          {/* Curtain keep base */}
          <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.35, 0.9, 1.25]} />
            <meshStandardMaterial color="#696e77" roughness={0.88} />
          </mesh>
          {/* Central high keep */}
          <mesh position={[0, 1.12, -0.05]} castShadow receiveShadow>
            <boxGeometry args={[0.68, 0.9, 0.65]} />
            <meshStandardMaterial color="#7d838e" roughness={0.85} />
          </mesh>
          <mesh position={[0, 1.72, -0.05]} castShadow>
            <coneGeometry args={[0.52, 0.55, 4]} />
            <meshStandardMaterial color="#7b2d26" roughness={0.75} />
          </mesh>
          {/* 4 Corner turrets */}
          {[
            [-0.64, -0.58],
            [0.64, -0.58],
            [-0.64, 0.58],
            [0.64, 0.58],
          ].map(([tx, tz], i) => (
            <group key={i} position={[tx, 0, tz]}>
              <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.18, 0.22, 1.3, 8]} />
                <meshStandardMaterial color="#767c86" roughness={0.86} />
              </mesh>
              <mesh position={[0, 1.42, 0]} castShadow>
                <coneGeometry args={[0.25, 0.36, 8]} />
                <meshStandardMaterial color="#3b2c2a" roughness={0.78} />
              </mesh>
            </group>
          ))}
          {/* Warm gate torch */}
          <mesh position={[0, 0.34, 0.64]}>
            <boxGeometry args={[0.2, 0.32, 0.06]} />
            <meshStandardMaterial color="#f59e0b" emissive="#d97706" emissiveIntensity={1.1} />
          </mesh>
        </group>
      )}

      {prop.kind === 'village' && (
        <group>
          {[
            { x: -0.45, z: -0.3, r: 0.25, w: 0.48, d: 0.38, h: 0.34, roof: '#7c4a32' },
            { x: 0.42, z: -0.25, r: -0.4, w: 0.44, d: 0.36, h: 0.3, roof: '#5e4332' },
            { x: -0.15, z: 0.44, r: 0.7, w: 0.5, d: 0.38, h: 0.36, roof: '#85533a' },
            { x: 0.48, z: 0.4, r: 0.1, w: 0.38, d: 0.32, h: 0.28, roof: '#6b4735' },
          ].map((c, idx) => (
            <group key={idx} position={[c.x, 0, c.z]} rotation={[0, c.r, 0]}>
              <mesh position={[0, c.h * 0.5, 0]} castShadow receiveShadow>
                <boxGeometry args={[c.w, c.h, c.d]} />
                <meshStandardMaterial color="#cfc4ad" roughness={0.9} />
              </mesh>
              <mesh position={[0, c.h + 0.14, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <coneGeometry args={[Math.max(c.w, c.d) * 0.78, 0.34, 4]} />
                <meshStandardMaterial color={c.roof} roughness={0.82} />
              </mesh>
            </group>
          ))}
          {/* Town square brazier/lantern */}
          <mesh position={[0.05, 0.16, 0.05]}>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.8} />
          </mesh>
        </group>
      )}

      {prop.kind === 'temple' && (
        <group>
          {/* Stepped marble dais */}
          <mesh position={[0, 0.08, 0]} receiveShadow castShadow>
            <boxGeometry args={[1.45, 0.16, 1.45]} />
            <meshStandardMaterial color="#8f959f" roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.22, 0]} receiveShadow castShadow>
            <boxGeometry args={[1.15, 0.14, 1.15]} />
            <meshStandardMaterial color="#a6acb6" roughness={0.78} />
          </mesh>
          {/* Columns */}
          {[
            [-0.42, -0.42],
            [0.42, -0.42],
            [-0.42, 0.42],
            [0.42, 0.42],
          ].map(([cx, cz], i) => (
            <mesh key={i} position={[cx, 0.65, cz]} castShadow>
              <cylinderGeometry args={[0.075, 0.09, 0.76, 8]} />
              <meshStandardMaterial color="#cbd1db" roughness={0.72} />
            </mesh>
          ))}
          {/* Sanctum dome */}
          <mesh position={[0, 1.08, 0]} castShadow>
            <sphereGeometry args={[0.46, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color="#d4a853" roughness={0.42} metalness={0.55} />
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <octahedronGeometry args={[0.16, 0]} />
            <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={1.8} />
          </mesh>
        </group>
      )}

      {prop.kind === 'monolith' && (
        <group>
          <mesh position={[0, 0.1, 0]} receiveShadow>
            <cylinderGeometry args={[0.55, 0.68, 0.2, 6]} />
            <meshStandardMaterial color="#313641" roughness={0.88} />
          </mesh>
          <mesh position={[0, 1.1, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.28, 1.9, 5]} />
            <meshStandardMaterial color="#181c24" roughness={0.45} metalness={0.35} />
          </mesh>
          <mesh position={[0, 1.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.36, 0.025, 8, 24]} />
            <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={2.0} />
          </mesh>
        </group>
      )}

      {prop.kind === 'windmill' && (
        <group>
          <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.26, 0.38, 1.24, 8]} />
            <meshStandardMaterial color="#d4cbb8" roughness={0.88} />
          </mesh>
          <mesh position={[0, 1.38, 0]} castShadow>
            <coneGeometry args={[0.34, 0.4, 8]} />
            <meshStandardMaterial color="#6e3e2c" roughness={0.8} />
          </mesh>
          {/* Sails */}
          <group position={[0, 1.05, 0.3]} rotation={[0, 0, 0.35]}>
            <mesh>
              <boxGeometry args={[1.35, 0.12, 0.04]} />
              <meshStandardMaterial color="#ece5d5" roughness={0.75} />
            </mesh>
            <mesh>
              <boxGeometry args={[0.12, 1.35, 0.04]} />
              <meshStandardMaterial color="#ece5d5" roughness={0.75} />
            </mesh>
          </group>
        </group>
      )}

      {prop.kind === 'ship' && (
        <group>
          {/* Wooden hull */}
          <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.52, 0.24, 1.55]} />
            <meshStandardMaterial color="#5c3d28" roughness={0.86} />
          </mesh>
          <mesh position={[0, 0.16, 0.88]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <coneGeometry args={[0.26, 0.38, 4]} />
            <meshStandardMaterial color="#4e3320" roughness={0.88} />
          </mesh>
          {/* Mainmast & foremast */}
          <mesh position={[0, 0.72, -0.05]} castShadow>
            <cylinderGeometry args={[0.03, 0.04, 1.1, 6]} />
            <meshStandardMaterial color="#3c2617" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.82, 0.02]} castShadow>
            <boxGeometry args={[0.72, 0.56, 0.04]} />
            <meshStandardMaterial color="#efe6d0" roughness={0.72} />
          </mesh>
          <mesh position={[0, 0.55, 0.42]} castShadow>
            <cylinderGeometry args={[0.025, 0.035, 0.75, 6]} />
            <meshStandardMaterial color="#3c2617" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.62, 0.48]} castShadow>
            <boxGeometry args={[0.5, 0.38, 0.035]} />
            <meshStandardMaterial color="#e8dec4" roughness={0.74} />
          </mesh>
        </group>
      )}

      {prop.kind === 'campfire' && (
        <group>
          <mesh position={[0, 0.05, 0]} receiveShadow>
            <cylinderGeometry args={[0.42, 0.48, 0.1, 8]} />
            <meshStandardMaterial color="#4b5059" roughness={0.92} />
          </mesh>
          <mesh position={[0, 0.14, 0]} rotation={[0, 0.4, Math.PI / 2]}>
            <cylinderGeometry args={[0.05, 0.05, 0.55, 5]} />
            <meshStandardMaterial color="#4a3121" roughness={0.94} />
          </mesh>
          <mesh position={[0, 0.14, 0]} rotation={[0, -0.5, Math.PI / 2]}>
            <cylinderGeometry args={[0.05, 0.05, 0.55, 5]} />
            <meshStandardMaterial color="#4a3121" roughness={0.94} />
          </mesh>
          <mesh position={[0, 0.32, 0]}>
            <coneGeometry args={[0.16, 0.42, 6]} />
            <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={2.2} />
          </mesh>
        </group>
      )}

      {prop.kind === 'gate' && (
        <group>
          <mesh position={[-0.58, 0.62, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.38, 1.24, 0.44]} />
            <meshStandardMaterial color="#6c727c" roughness={0.88} />
          </mesh>
          <mesh position={[0.58, 0.62, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.38, 1.24, 0.44]} />
            <meshStandardMaterial color="#6c727c" roughness={0.88} />
          </mesh>
          <mesh position={[0, 1.02, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.16, 0.36, 0.36]} />
            <meshStandardMaterial color="#7d8490" roughness={0.86} />
          </mesh>
          <mesh position={[-0.58, 1.38, 0]} castShadow>
            <coneGeometry args={[0.28, 0.36, 4]} />
            <meshStandardMaterial color="#422c26" roughness={0.8} />
          </mesh>
          <mesh position={[0.58, 1.38, 0]} castShadow>
            <coneGeometry args={[0.28, 0.36, 4]} />
            <meshStandardMaterial color="#422c26" roughness={0.8} />
          </mesh>
        </group>
      )}

      {prop.kind === 'pier' && (
        <group>
          <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.55, 0.08, 2.2]} />
            <meshStandardMaterial color="#684a31" roughness={0.88} />
          </mesh>
          {[-0.8, 0, 0.8].map((pz) => (
            <React.Fragment key={pz}>
              <mesh position={[-0.22, 0.12, pz]} castShadow>
                <cylinderGeometry args={[0.045, 0.05, 0.55, 6]} />
                <meshStandardMaterial color="#4a3423" roughness={0.9} />
              </mesh>
              <mesh position={[0.22, 0.12, pz]} castShadow>
                <cylinderGeometry args={[0.045, 0.05, 0.55, 6]} />
                <meshStandardMaterial color="#4a3423" roughness={0.9} />
              </mesh>
            </React.Fragment>
          ))}
        </group>
      )}

      {prop.kind === 'bridge' && (
        <group>
          <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.72, 0.12, 2.5]} />
            <meshStandardMaterial color="#877b6c" roughness={0.85} />
          </mesh>
          <mesh position={[-0.32, 0.42, 0]} castShadow>
            <boxGeometry args={[0.08, 0.2, 2.48]} />
            <meshStandardMaterial color="#6c6257" roughness={0.88} />
          </mesh>
          <mesh position={[0.32, 0.42, 0]} castShadow>
            <boxGeometry args={[0.08, 0.2, 2.48]} />
            <meshStandardMaterial color="#6c6257" roughness={0.88} />
          </mesh>
        </group>
      )}

      {prop.kind === 'ruin' && (
        <group>
          <mesh position={[0, 0.08, 0]} receiveShadow>
            <cylinderGeometry args={[0.78, 0.85, 0.16, 7]} />
            <meshStandardMaterial color="#5c626b" roughness={0.92} />
          </mesh>
          {[
            [-0.42, 0.42, -0.3, 0.72],
            [0.44, 0.52, -0.22, 0.92],
            [-0.28, 0.34, 0.42, 0.56],
            [0.32, 0.26, 0.38, 0.4],
          ].map(([px, py, pz, h], idx) => (
            <mesh key={idx} position={[px, py, pz]} castShadow receiveShadow>
              <cylinderGeometry args={[0.09, 0.11, h, 6]} />
              <meshStandardMaterial color="#737983" roughness={0.9} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
};

export const TerrainProps3D: React.FC<TerrainProps3DProps> = ({
  propsList,
  heightData,
  heightRes,
  displacementScale,
  seaY = 0,
  terrainVersion,
  terrainSize = TERRAIN_SIZE,
  visible,
  selectedPropId,
  interactive,
  onSelectProp,
}) => {
  const { naturalPines, naturalOaks, naturalDead, naturalBoulders, heroProps } = useMemo(() => {
    const pines: MapProp[] = [];
    const oaks: MapProp[] = [];
    const dead: MapProp[] = [];
    const boulders: MapProp[] = [];
    const heroes: MapProp[] = [];
    for (const p of propsList) {
      if (p.kind === 'pine') pines.push(p);
      else if (p.kind === 'oak') oaks.push(p);
      else if (p.kind === 'deadwood') dead.push(p);
      else if (p.kind === 'boulder') boulders.push(p);
      else heroes.push(p);
    }
    return {
      naturalPines: pines,
      naturalOaks: oaks,
      naturalDead: dead,
      naturalBoulders: boulders,
      heroProps: heroes,
    };
  }, [propsList]);

  const pineTrunkRef = useRef<THREE.InstancedMesh>(null);
  const pineCrownRef = useRef<THREE.InstancedMesh>(null);
  const oakTrunkRef = useRef<THREE.InstancedMesh>(null);
  const oakCrownRef = useRef<THREE.InstancedMesh>(null);
  const deadRef = useRef<THREE.InstancedMesh>(null);
  const boulderRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!visible) return;
    const dummy = new THREE.Object3D();

    if (pineTrunkRef.current && pineCrownRef.current) {
      naturalPines.forEach((p, i) => {
        const y = sampleTerrainElevation(heightData, heightRes, p.x, p.z, terrainSize, displacementScale);
        dummy.position.set(p.x, y + 0.16 * p.scale, p.z);
        dummy.rotation.set(0, p.rotY, 0);
        dummy.scale.set(p.scale, p.scale, p.scale);
        dummy.updateMatrix();
        pineTrunkRef.current!.setMatrixAt(i, dummy.matrix);

        dummy.position.set(p.x, y + 0.62 * p.scale, p.z);
        dummy.updateMatrix();
        pineCrownRef.current!.setMatrixAt(i, dummy.matrix);
      });
      pineTrunkRef.current.instanceMatrix.needsUpdate = true;
      pineCrownRef.current.instanceMatrix.needsUpdate = true;
    }

    if (oakTrunkRef.current && oakCrownRef.current) {
      naturalOaks.forEach((p, i) => {
        const y = sampleTerrainElevation(heightData, heightRes, p.x, p.z, terrainSize, displacementScale);
        dummy.position.set(p.x, y + 0.2 * p.scale, p.z);
        dummy.rotation.set(0, p.rotY, 0);
        dummy.scale.set(p.scale, p.scale, p.scale);
        dummy.updateMatrix();
        oakTrunkRef.current!.setMatrixAt(i, dummy.matrix);

        dummy.position.set(p.x, y + 0.56 * p.scale, p.z);
        dummy.updateMatrix();
        oakCrownRef.current!.setMatrixAt(i, dummy.matrix);
      });
      oakTrunkRef.current.instanceMatrix.needsUpdate = true;
      oakCrownRef.current.instanceMatrix.needsUpdate = true;
    }

    if (deadRef.current) {
      naturalDead.forEach((p, i) => {
        const y = sampleTerrainElevation(heightData, heightRes, p.x, p.z, terrainSize, displacementScale);
        dummy.position.set(p.x, y + 0.34 * p.scale, p.z);
        dummy.rotation.set(0.08, p.rotY, 0.05);
        dummy.scale.set(p.scale, p.scale, p.scale);
        dummy.updateMatrix();
        deadRef.current!.setMatrixAt(i, dummy.matrix);
      });
      deadRef.current.instanceMatrix.needsUpdate = true;
    }

    if (boulderRef.current) {
      naturalBoulders.forEach((p, i) => {
        const y = sampleTerrainElevation(heightData, heightRes, p.x, p.z, terrainSize, displacementScale);
        dummy.position.set(p.x, y - 0.05 * p.scale, p.z);
        dummy.rotation.set(0, p.rotY, 0);
        dummy.scale.set(p.scale * 0.28, p.scale * 0.2, p.scale * 0.25);
        dummy.updateMatrix();
        boulderRef.current!.setMatrixAt(i, dummy.matrix);
      });
      boulderRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [
    visible,
    naturalPines,
    naturalOaks,
    naturalDead,
    naturalBoulders,
    heightData,
    heightRes,
    displacementScale,
    terrainSize,
    terrainVersion,
  ]);

  const selectedProp = useMemo(
    () => (selectedPropId ? propsList.find((p) => p.id === selectedPropId) : null),
    [selectedPropId, propsList]
  );

  if (!visible) return null;

  return (
    <group>
      {/* Pines */}
      {naturalPines.length > 0 && (
        <>
          <instancedMesh
            key={`p-t-${naturalPines.length}`}
            ref={pineTrunkRef}
            args={[undefined, undefined, naturalPines.length]}
            castShadow
            onPointerDown={(e) => {
              if (!interactive || e.instanceId === undefined) return;
              const prop = naturalPines[e.instanceId];
              if (prop) {
                e.stopPropagation();
                onSelectProp(prop, e);
              }
            }}
          >
            <cylinderGeometry args={[0.045, 0.075, 0.36, 5]} />
            <meshStandardMaterial color="#3b281c" roughness={0.95} />
          </instancedMesh>
          <instancedMesh
            key={`p-c-${naturalPines.length}`}
            ref={pineCrownRef}
            args={[undefined, undefined, naturalPines.length]}
            castShadow
            receiveShadow
            onPointerDown={(e) => {
              if (!interactive || e.instanceId === undefined) return;
              const prop = naturalPines[e.instanceId];
              if (prop) {
                e.stopPropagation();
                onSelectProp(prop, e);
              }
            }}
          >
            <coneGeometry args={[0.3, 0.92, 6]} />
            <meshStandardMaterial color="#213a26" roughness={0.86} />
          </instancedMesh>
        </>
      )}

      {/* Oaks */}
      {naturalOaks.length > 0 && (
        <>
          <instancedMesh
            key={`o-t-${naturalOaks.length}`}
            ref={oakTrunkRef}
            args={[undefined, undefined, naturalOaks.length]}
            castShadow
          >
            <cylinderGeometry args={[0.06, 0.09, 0.42, 6]} />
            <meshStandardMaterial color="#463020" roughness={0.92} />
          </instancedMesh>
          <instancedMesh
            key={`o-c-${naturalOaks.length}`}
            ref={oakCrownRef}
            args={[undefined, undefined, naturalOaks.length]}
            castShadow
            receiveShadow
            onPointerDown={(e) => {
              if (!interactive || e.instanceId === undefined) return;
              const prop = naturalOaks[e.instanceId];
              if (prop) {
                e.stopPropagation();
                onSelectProp(prop, e);
              }
            }}
          >
            <dodecahedronGeometry args={[0.36, 0]} />
            <meshStandardMaterial color="#395226" roughness={0.84} />
          </instancedMesh>
        </>
      )}

      {/* Deadwood */}
      {naturalDead.length > 0 && (
        <instancedMesh
          key={`dead-${naturalDead.length}`}
          ref={deadRef}
          args={[undefined, undefined, naturalDead.length]}
          castShadow
          onPointerDown={(e) => {
            if (!interactive || e.instanceId === undefined) return;
            const prop = naturalDead[e.instanceId];
            if (prop) {
              e.stopPropagation();
              onSelectProp(prop, e);
            }
          }}
        >
          <cylinderGeometry args={[0.03, 0.08, 0.72, 5]} />
          <meshStandardMaterial color="#51463c" roughness={0.94} />
        </instancedMesh>
      )}

      {/* Boulders */}
      {naturalBoulders.length > 0 && (
        <instancedMesh
          key={`rock-${naturalBoulders.length}`}
          ref={boulderRef}
          args={[undefined, undefined, naturalBoulders.length]}
          castShadow
          receiveShadow
          onPointerDown={(e) => {
            if (!interactive || e.instanceId === undefined) return;
            const prop = naturalBoulders[e.instanceId];
            if (prop) {
              e.stopPropagation();
              onSelectProp(prop, e);
            }
          }}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#595f68" roughness={0.9} metalness={0.08} />
        </instancedMesh>
      )}

      {/* Hero architectural meshes */}
      {heroProps.map((prop) => {
        const rawY = sampleTerrainElevation(
          heightData,
          heightRes,
          prop.x,
          prop.z,
          terrainSize,
          displacementScale
        );
        const y =
          prop.kind === 'ship'
            ? Math.max(seaY, rawY)
            : prop.kind === 'pier'
            ? Math.max(seaY - 0.12, rawY)
            : rawY;
        return (
          <HeroPropMesh
            key={prop.id}
            prop={prop}
            y={y}
            isSelected={selectedPropId === prop.id}
            interactive={interactive}
            onSelectProp={onSelectProp}
          />
        );
      })}

      {/* Selection ring for natural selected prop */}
      {selectedProp &&
        (selectedProp.kind === 'pine' ||
          selectedProp.kind === 'oak' ||
          selectedProp.kind === 'deadwood' ||
          selectedProp.kind === 'boulder') && (
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[
              selectedProp.x,
              sampleTerrainElevation(
                heightData,
                heightRes,
                selectedProp.x,
                selectedProp.z,
                terrainSize,
                displacementScale
              ) + 0.14,
              selectedProp.z,
            ]}
          >
            <ringGeometry args={[0.45, 0.65, 24]} />
            <meshBasicMaterial color="#facc15" side={THREE.DoubleSide} />
          </mesh>
        )}
    </group>
  );
};

export type ZoneGizmoDragMode = 'move-xz' | 'move-x' | 'move-z';

interface SingleZoneMeshProps {
  zone: WorldMapZone;
  layer?: WorldMapLayer;
  heightData: Float32Array;
  heightRes: number;
  displacementScale: number;
  seaY: number;
  terrainVersion: number;
  terrainSize: number;
  showLabel: boolean;
  isSelected: boolean;
  interactive: boolean;
  onSelect: () => void;
  onStartGizmoDrag?: (
    zone: WorldMapZone,
    mode: ZoneGizmoDragMode,
    e: ThreeEvent<PointerEvent>
  ) => void;
  onStartVertexDrag?: (
    zone: WorldMapZone,
    vertexIndex: number,
    e: ThreeEvent<PointerEvent>
  ) => void;
  onInsertVertexAndDrag?: (
    zone: WorldMapZone,
    insertIndex: number,
    pt: { x: number; y: number; z: number },
    e: ThreeEvent<PointerEvent>
  ) => void;
  onRemoveVertex?: (zone: WorldMapZone, vertexIndex: number) => void;
}

const noopRaycast = () => null;

const SingleZoneMesh: React.FC<SingleZoneMeshProps> = ({
  zone,
  layer,
  heightData,
  heightRes,
  displacementScale,
  seaY,
  terrainVersion,
  terrainSize,
  showLabel,
  isSelected,
  interactive,
  onSelect,
  onStartGizmoDrag,
  onStartVertexDrag,
  onInsertVertexAndDrag,
  onRemoveVertex,
}) => {
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);
  const layerOffset = (layer?.order ?? 1) * 0.035;

  const fillGeom = useMemo(() => {
    return buildTerrainConformingPolygonGeometry(
      zone.points,
      heightData,
      heightRes,
      displacementScale,
      seaY,
      0.18 + layerOffset,
      terrainSize
    );
  }, [zone.points, heightData, heightRes, displacementScale, seaY, terrainVersion, layerOffset, terrainSize]);

  useEffect(() => {
    return () => {
      fillGeom?.dispose();
    };
  }, [fillGeom]);

  const borderPts = useMemo(() => {
    if (zone.borderStyle === 'none' && !isSelected) return [];
    return sampleClosedBorderPoints(
      zone.points,
      heightData,
      heightRes,
      displacementScale,
      seaY,
      0.34 + layerOffset,
      terrainSize
    );
  }, [zone.points, zone.borderStyle, isSelected, heightData, heightRes, displacementScale, seaY, terrainVersion, layerOffset, terrainSize]);

  const doubleBorderPts = useMemo(() => {
    if (zone.borderStyle !== 'double' || borderPts.length < 2) return [];
    return borderPts.map(([x, y, z]) => [x, y + 0.18, z] as [number, number, number]);
  }, [zone.borderStyle, borderPts]);

  const centroid = useMemo(() => {
    const c = computePolygonCentroid(zone.points);
    const surfaceY = sampleLandOrSeaElevation(
      heightData,
      heightRes,
      c.x,
      c.z,
      terrainSize,
      displacementScale,
      seaY
    );
    return {
      x: c.x,
      surfaceY,
      y: surfaceY + 0.72 + layerOffset,
      z: c.z,
    };
  }, [zone.points, heightData, heightRes, displacementScale, seaY, terrainVersion, layerOffset, terrainSize]);

  const vertexHandles = useMemo(() => {
    if (!isSelected || !interactive) return [];
    return zone.points.map((pt, idx) => {
      const surfaceY = sampleLandOrSeaElevation(
        heightData,
        heightRes,
        pt.x,
        pt.z,
        terrainSize,
        displacementScale,
        seaY
      );
      return {
        idx,
        x: pt.x,
        surfaceY,
        y: surfaceY + 0.56 + layerOffset,
        z: pt.z,
      };
    });
  }, [
    isSelected,
    interactive,
    zone.points,
    heightData,
    heightRes,
    terrainSize,
    displacementScale,
    seaY,
    terrainVersion,
    layerOffset,
  ]);

  const edgeMidpoints = useMemo(() => {
    if (!isSelected || !interactive || zone.points.length < 3 || zone.points.length >= 48) {
      return [];
    }
    const mids: Array<{
      insertIndex: number;
      x: number;
      surfaceY: number;
      y: number;
      z: number;
    }> = [];
    for (let i = 0; i < zone.points.length; i++) {
      const a = zone.points[i];
      const b = zone.points[(i + 1) % zone.points.length];
      if (Math.hypot(b.x - a.x, b.z - a.z) < 2.2) continue;
      const mx = Number(((a.x + b.x) * 0.5).toFixed(2));
      const mz = Number(((a.z + b.z) * 0.5).toFixed(2));
      const surfaceY = sampleLandOrSeaElevation(
        heightData,
        heightRes,
        mx,
        mz,
        terrainSize,
        displacementScale,
        seaY
      );
      mids.push({
        insertIndex: i + 1,
        x: mx,
        surfaceY: Number(surfaceY.toFixed(2)),
        y: surfaceY + 0.48 + layerOffset,
        z: mz,
      });
    }
    return mids;
  }, [
    isSelected,
    interactive,
    zone.points,
    heightData,
    heightRes,
    terrainSize,
    displacementScale,
    seaY,
    terrainVersion,
    layerOffset,
  ]);

  const gizmoScale = Math.max(0.95, terrainSize / 120);
  const gizmoY = centroid.surfaceY + 1.15 * gizmoScale + layerOffset;

  const fillOpacity = Math.min(
    0.85,
    (zone.fillOpacity ?? layer?.opacity ?? 0.3) * (isSelected ? 1.45 : 1)
  );
  const borderColor = isSelected ? '#facc15' : zone.color;
  const lineWidth = isSelected ? (zone.borderWidth ?? 2.6) + 1.4 : zone.borderWidth ?? 2.6;

  return (
    <group>
      {fillGeom && (
        <mesh
          geometry={fillGeom}
          renderOrder={3}
          raycast={interactive ? undefined : noopRaycast}
          onClick={(e) => {
            if (!interactive || e.delta > 6) return;
            e.stopPropagation();
            onSelect();
          }}
        >
          <meshBasicMaterial
            color={zone.color}
            transparent
            opacity={fillOpacity}
            side={THREE.DoubleSide}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}

      {borderPts.length >= 2 && (
        <Line
          points={borderPts}
          color={borderColor}
          lineWidth={lineWidth}
          dashed={zone.borderStyle === 'dashed'}
          dashSize={1.35}
          gapSize={0.65}
          transparent
          opacity={isSelected ? 1 : 0.92}
        />
      )}

      {doubleBorderPts.length >= 2 && (
        <Line
          points={doubleBorderPts}
          color="#f7ecc9"
          lineWidth={Math.max(1.2, lineWidth * 0.55)}
          transparent
          opacity={0.78}
        />
      )}

      {showLabel && zone.showLabel && (
        <Text
          position={[centroid.x, centroid.y, centroid.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={1.25 * (zone.labelScale ?? 1)}
          letterSpacing={0.18}
          color={isSelected ? '#fef08a' : '#f5eedc'}
          outlineWidth={0.08}
          outlineColor="#090b0e"
          fillOpacity={0.92}
          anchorX="center"
          anchorY="middle"
        >
          {zone.name.toUpperCase()}
        </Text>
      )}

      {/* Selected Zone 3D Move Gizmo + Corner Vertex & Edge Midpoint Handles */}
      {isSelected && interactive && (
        <group>
          {/* Centroid Ground Anchor Ring & Stem */}
          <mesh
            position={[centroid.x, centroid.surfaceY + 0.36 + layerOffset, centroid.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={noopRaycast}
          >
            <ringGeometry args={[0.45 * gizmoScale, 0.72 * gizmoScale, 24]} />
            <meshBasicMaterial color="#facc15" transparent opacity={0.85} side={THREE.DoubleSide} />
          </mesh>
          <mesh
            position={[
              centroid.x,
              (centroid.surfaceY + 0.36 + layerOffset + gizmoY) * 0.5,
              centroid.z,
            ]}
            raycast={noopRaycast}
          >
            <cylinderGeometry
              args={[
                0.04 * gizmoScale,
                0.04 * gizmoScale,
                Math.max(0.2, gizmoY - (centroid.surfaceY + 0.36 + layerOffset)),
                8,
              ]}
            />
            <meshBasicMaterial color="#facc15" transparent opacity={0.75} />
          </mesh>

          {/* 3D Move Gizmo Hub at Centroid (Drag XZ free, +X red arrow, +Z cyan arrow) */}
          <group position={[centroid.x, gizmoY, centroid.z]} scale={gizmoScale}>
            {/* Center Free-Move XZ Handle */}
            <mesh
              renderOrder={12}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredHandle('gizmo-xz');
              }}
              onPointerOut={() => setHoveredHandle((h) => (h === 'gizmo-xz' ? null : h))}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onStartGizmoDrag?.(zone, 'move-xz', e);
              }}
            >
              <octahedronGeometry args={[0.62, 0]} />
              <meshStandardMaterial
                color={hoveredHandle === 'gizmo-xz' ? '#fef08a' : '#facc15'}
                emissive={hoveredHandle === 'gizmo-xz' ? '#facc15' : '#b45309'}
                emissiveIntensity={hoveredHandle === 'gizmo-xz' ? 1.1 : 0.6}
                roughness={0.25}
                metalness={0.5}
              />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={12} raycast={noopRaycast}>
              <ringGeometry args={[0.78, 0.98, 24]} />
              <meshBasicMaterial
                color={hoveredHandle === 'gizmo-xz' ? '#fef08a' : '#facc15'}
                transparent
                opacity={0.85}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* +X Axis Move Arrow (Red) */}
            <group
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredHandle('gizmo-x');
              }}
              onPointerOut={() => setHoveredHandle((h) => (h === 'gizmo-x' ? null : h))}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onStartGizmoDrag?.(zone, 'move-x', e);
              }}
            >
              <mesh position={[1.9, 0, 0]} rotation={[0, 0, -Math.PI / 2]} renderOrder={12}>
                <cylinderGeometry args={[0.1, 0.1, 2.2, 10]} />
                <meshBasicMaterial color={hoveredHandle === 'gizmo-x' ? '#fca5a5' : '#ef4444'} />
              </mesh>
              <mesh position={[3.25, 0, 0]} rotation={[0, 0, -Math.PI / 2]} renderOrder={12}>
                <coneGeometry args={[0.32, 0.72, 12]} />
                <meshBasicMaterial color={hoveredHandle === 'gizmo-x' ? '#fca5a5' : '#ef4444'} />
              </mesh>
              {/* Invisible wider hit cylinder for easy grabbing */}
              <mesh position={[2.2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                <cylinderGeometry args={[0.48, 0.48, 3.0, 8]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>

            {/* +Z Axis Move Arrow (Blue/Cyan) */}
            <group
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredHandle('gizmo-z');
              }}
              onPointerOut={() => setHoveredHandle((h) => (h === 'gizmo-z' ? null : h))}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onStartGizmoDrag?.(zone, 'move-z', e);
              }}
            >
              <mesh position={[0, 0, 1.9]} rotation={[Math.PI / 2, 0, 0]} renderOrder={12}>
                <cylinderGeometry args={[0.1, 0.1, 2.2, 10]} />
                <meshBasicMaterial color={hoveredHandle === 'gizmo-z' ? '#bae6fd' : '#38bdf8'} />
              </mesh>
              <mesh position={[0, 0, 3.25]} rotation={[Math.PI / 2, 0, 0]} renderOrder={12}>
                <coneGeometry args={[0.32, 0.72, 12]} />
                <meshBasicMaterial color={hoveredHandle === 'gizmo-z' ? '#bae6fd' : '#38bdf8'} />
              </mesh>
              {/* Invisible wider hit cylinder for easy grabbing */}
              <mesh position={[0, 0, 2.2]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.48, 0.48, 3.0, 8]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>
          </group>

          {/* Draggable Corner Vertex Handles (Stuck to Land/Sea) */}
          {vertexHandles.map((vh) => {
            const key = `v-${vh.idx}`;
            const isHot = hoveredHandle === key;
            return (
              <group key={key} position={[vh.x, vh.y, vh.z]}>
                <mesh
                  renderOrder={11}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    setHoveredHandle(key);
                  }}
                  onPointerOut={() => setHoveredHandle((h) => (h === key ? null : h))}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    if (e.shiftKey && zone.points.length > 3) {
                      onRemoveVertex?.(zone, vh.idx);
                    } else {
                      onStartVertexDrag?.(zone, vh.idx, e);
                    }
                  }}
                  onContextMenu={(e) => {
                    if (zone.points.length > 3) {
                      e.stopPropagation();
                      e.nativeEvent?.preventDefault?.();
                      onRemoveVertex?.(zone, vh.idx);
                    }
                  }}
                >
                  <sphereGeometry args={[0.44 * gizmoScale, 14, 14]} />
                  <meshStandardMaterial
                    color={isHot ? '#ffffff' : '#fef08a'}
                    emissive={isHot ? '#facc15' : '#ca8a04'}
                    emissiveIntensity={isHot ? 1.2 : 0.55}
                    roughness={0.25}
                  />
                </mesh>
                {/* Larger invisible hit sphere */}
                <mesh
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    setHoveredHandle(key);
                  }}
                  onPointerOut={() => setHoveredHandle((h) => (h === key ? null : h))}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    if (e.shiftKey && zone.points.length > 3) {
                      onRemoveVertex?.(zone, vh.idx);
                    } else {
                      onStartVertexDrag?.(zone, vh.idx, e);
                    }
                  }}
                  onContextMenu={(e) => {
                    if (zone.points.length > 3) {
                      e.stopPropagation();
                      e.nativeEvent?.preventDefault?.();
                      onRemoveVertex?.(zone, vh.idx);
                    }
                  }}
                >
                  <sphereGeometry args={[0.78 * gizmoScale, 8, 8]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              </group>
            );
          })}

          {/* Edge Midpoint Insert Handles (Click & drag to add vertex along edge) */}
          {edgeMidpoints.map((mid) => {
            const key = `m-${mid.insertIndex}`;
            const isHot = hoveredHandle === key;
            return (
              <mesh
                key={key}
                position={[mid.x, mid.y, mid.z]}
                renderOrder={10}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  setHoveredHandle(key);
                }}
                onPointerOut={() => setHoveredHandle((h) => (h === key ? null : h))}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  onInsertVertexAndDrag?.(
                    zone,
                    mid.insertIndex,
                    { x: mid.x, y: mid.surfaceY, z: mid.z },
                    e
                  );
                }}
              >
                <octahedronGeometry args={[(isHot ? 0.36 : 0.26) * gizmoScale, 0]} />
                <meshBasicMaterial
                  color={isHot ? '#6ee7b7' : '#34d399'}
                  transparent
                  opacity={isHot ? 0.95 : 0.72}
                />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
};

interface TerrainZones3DProps {
  zones: WorldMapZone[];
  layers: WorldMapLayer[];
  heightData: Float32Array;
  heightRes: number;
  displacementScale: number;
  seaY: number;
  terrainVersion: number;
  terrainSize?: number;
  gmMode: boolean;
  showRegionsLayer: boolean;
  showLabelsLayer: boolean;
  selectedZoneId: string | null;
  interactive: boolean;
  onSelectZone: (zoneId: string) => void;
  onStartGizmoDrag?: (
    zone: WorldMapZone,
    mode: ZoneGizmoDragMode,
    e: ThreeEvent<PointerEvent>
  ) => void;
  onStartVertexDrag?: (
    zone: WorldMapZone,
    vertexIndex: number,
    e: ThreeEvent<PointerEvent>
  ) => void;
  onInsertVertexAndDrag?: (
    zone: WorldMapZone,
    insertIndex: number,
    pt: { x: number; y: number; z: number },
    e: ThreeEvent<PointerEvent>
  ) => void;
  onRemoveVertex?: (zone: WorldMapZone, vertexIndex: number) => void;
}

export const TerrainZones3D: React.FC<TerrainZones3DProps> = ({
  zones,
  layers,
  heightData,
  heightRes,
  displacementScale,
  seaY,
  terrainVersion,
  terrainSize = TERRAIN_SIZE,
  gmMode,
  showRegionsLayer,
  showLabelsLayer,
  selectedZoneId,
  interactive,
  onSelectZone,
  onStartGizmoDrag,
  onStartVertexDrag,
  onInsertVertexAndDrag,
  onRemoveVertex,
}) => {
  if (!showRegionsLayer || zones.length === 0) return null;

  const layerMap = new Map(layers.map((l) => [l.id, l]));

  return (
    <group>
      {zones.map((zone) => {
        if (!gmMode && zone.is_gm_only) return null;
        const layer = layerMap.get(zone.layerId);
        if (layer && !layer.visible) return null;
        return (
          <SingleZoneMesh
            key={zone.id}
            zone={zone}
            layer={layer}
            heightData={heightData}
            heightRes={heightRes}
            displacementScale={displacementScale}
            seaY={seaY}
            terrainVersion={terrainVersion}
            terrainSize={terrainSize}
            showLabel={showLabelsLayer}
            isSelected={selectedZoneId === zone.id}
            interactive={interactive}
            onSelect={() => onSelectZone(zone.id)}
            onStartGizmoDrag={onStartGizmoDrag}
            onStartVertexDrag={onStartVertexDrag}
            onInsertVertexAndDrag={onInsertVertexAndDrag}
            onRemoveVertex={onRemoveVertex}
          />
        );
      })}
    </group>
  );
};

interface TerrainLabels3DProps {
  labels: WorldMapLabel[];
  layers: WorldMapLayer[];
  heightData: Float32Array;
  heightRes: number;
  displacementScale: number;
  seaY: number;
  terrainSize?: number;
  gmMode: boolean;
  visible: boolean;
  selectedLabelId: string | null;
  interactive: boolean;
  onSelectLabel: (label: WorldMapLabel, e: ThreeEvent<PointerEvent>) => void;
}

export const TerrainLabels3D: React.FC<TerrainLabels3DProps> = ({
  labels,
  layers,
  heightData,
  heightRes,
  displacementScale,
  seaY,
  terrainSize = TERRAIN_SIZE,
  gmMode,
  visible,
  selectedLabelId,
  interactive,
  onSelectLabel,
}) => {
  if (!visible || labels.length === 0) return null;

  const layerMap = new Map(layers.map((l) => [l.id, l]));

  return (
    <group>
      {labels.map((label) => {
        if (!gmMode && label.is_gm_only) return null;
        if (label.layerId) {
          const layer = layerMap.get(label.layerId);
          if (layer && !layer.visible) return null;
        }

        const surfaceY = Math.max(
          seaY,
          sampleTerrainElevation(
            heightData,
            heightRes,
            label.x,
            label.z,
            terrainSize,
            displacementScale
          )
        );
        const y = surfaceY + (label.yOffset ?? 0.9);
        const isSelected = selectedLabelId === label.id;

        const displayText =
          label.style === 'title' || label.style === 'region'
            ? label.text.toUpperCase()
            : label.text;

        const letterSpacing =
          label.style === 'title'
            ? 0.28
            : label.style === 'region' || label.style === 'sea'
            ? 0.22
            : 0.05;

        const approxWidth = Math.max(2.2, displayText.length * label.fontSize * 0.62);
        const approxHeight = Math.max(1.0, label.fontSize * 1.45);

        return (
          <group
            key={label.id}
            position={[label.x, y, label.z]}
            rotation={[-Math.PI / 2, 0, label.rotationY || 0]}
            onPointerDown={(e) => {
              if (!interactive || e.button !== 0) return;
              e.stopPropagation();
              onSelectLabel(label, e);
            }}
          >
            {/* Transparent hit plane so dragging/clicking text is reliable */}
            <mesh position={[0, 0, -0.02]} raycast={interactive ? undefined : noopRaycast}>
              <planeGeometry args={[approxWidth, approxHeight]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>

            {label.style === 'callout' && (
              <mesh position={[0, 0, -0.015]}>
                <planeGeometry args={[approxWidth + 0.8, approxHeight + 0.35]} />
                <meshBasicMaterial
                  color="#101319"
                  transparent
                  opacity={0.78}
                  side={THREE.DoubleSide}
                />
              </mesh>
            )}

            {isSelected && (
              <mesh position={[0, 0, -0.01]}>
                <ringGeometry
                  args={[
                    Math.max(approxWidth, approxHeight) * 0.45,
                    Math.max(approxWidth, approxHeight) * 0.45 + 0.16,
                    32,
                  ]}
                />
                <meshBasicMaterial color="#facc15" side={THREE.DoubleSide} />
              </mesh>
            )}

            <Text
              fontSize={label.fontSize}
              letterSpacing={letterSpacing}
              fontStyle={label.style === 'sea' ? 'italic' : 'normal'}
              color={isSelected ? '#fef08a' : label.color}
              fillOpacity={label.opacity ?? 0.9}
              outlineWidth={label.style === 'title' ? 0.11 : 0.075}
              outlineColor="#080a0d"
              anchorX="center"
              anchorY="middle"
            >
              {displayText}
            </Text>
          </group>
        );
      })}
    </group>
  );
};

/* -------------------------------------------------------------------------- */
/*                       Raymarched 3D Fog Volumes                            */
/* -------------------------------------------------------------------------- */

const FOG_VOLUME_VERT = `
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  void main() {
    vLocalPos = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FOG_VOLUME_FRAG = `
  uniform float uTime;
  uniform sampler2D uHeightMap;
  uniform float uHasHeightMap;
  uniform float uTerrainSize;
  uniform float uDisplacementScale;
  uniform float uSeaY;

  uniform vec3 uCenter;
  uniform vec3 uHalfExtents;
  uniform float uCosRot;
  uniform float uSinRot;
  uniform int uShape; // 0 = box, 1 = sphere, 2 = cylinder

  uniform vec3 uColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uDensity;
  uniform float uEdgeSoftness;
  uniform float uHeightFalloff;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;
  uniform vec2 uWindVel;
  uniform float uGlow;
  uniform float uLightScattering;

  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  float hash31(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float vnoise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash31(i);
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
    vec4 nx0 = mix(vec4(n000, n010, n001, n011), vec4(n100, n110, n101, n111), f.x);
    vec2 nxy = mix(nx0.xz, nx0.yw, f.y);
    return mix(nxy.x, nxy.y, f.z);
  }

  float fbm3(vec3 p) {
    float v = 0.55 * vnoise3(p);
    v += 0.30 * vnoise3(p * 2.07 + vec3(17.1, 9.3, 23.7));
    v += 0.15 * vnoise3(p * 4.21 + vec3(3.7, 31.4, 11.2));
    return v;
  }

  vec3 worldToLocal(vec3 wp) {
    vec3 d = wp - uCenter;
    return vec3(
      d.x * uCosRot + d.z * uSinRot,
      d.y,
      -d.x * uSinRot + d.z * uCosRot
    );
  }

  vec3 dirToLocal(vec3 wd) {
    return vec3(
      wd.x * uCosRot + wd.z * uSinRot,
      wd.y,
      -wd.x * uSinRot + wd.z * uCosRot
    );
  }

  void main() {
    vec3 ro = worldToLocal(cameraPosition);
    vec3 rdWorld = normalize(vWorldPos - cameraPosition);
    vec3 rd = dirToLocal(rdWorld);

    vec3 invD = 1.0 / (sign(rd + vec3(1e-6)) * max(abs(rd), vec3(1e-5)));
    vec3 t0 = (-uHalfExtents - ro) * invD;
    vec3 t1 = (uHalfExtents - ro) * invD;
    vec3 tMinV = min(t0, t1);
    vec3 tMaxV = max(t0, t1);
    float tEnter = max(max(tMinV.x, tMinV.y), max(tMinV.z, 0.0));
    float tExit = min(tMaxV.x, min(tMaxV.y, tMaxV.z));
    if (tExit <= tEnter) discard;

    const int STEPS = 10;
    float marchLen = tExit - tEnter;
    float dt = marchLen / float(STEPS);

    // Per-pixel blue-noise-like jitter to soften banding
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float t = tEnter + dt * jitter;

    float transmittance = 1.0;
    vec3 accumLight = vec3(0.0);

    float cosTheta = dot(rdWorld, uSunDir);
    float g = 0.55;
    float phase = (1.0 - g * g) / (4.0 * 3.14159 * pow(1.0 + g * g - 2.0 * g * cosTheta, 1.5));
    vec3 scatterCol = mix(uColor, uSunColor, clamp(phase * uLightScattering * 0.65, 0.0, 0.85));
    scatterCol += uColor * uGlow * 0.65;

    float soft = max(0.04, uEdgeSoftness * 0.85);

    for (int i = 0; i < STEPS; i++) {
      vec3 lp = ro + rd * t;
      vec3 wp = cameraPosition + rdWorld * t;

      // Normalized local coordinates in [-1..1]
      vec3 q = lp / max(uHalfExtents, vec3(0.01));

      float shapeDist = 0.0;
      if (uShape == 1) {
        shapeDist = length(q);
      } else if (uShape == 2) {
        shapeDist = max(length(q.xz), abs(q.y));
      } else {
        vec3 aq = abs(q);
        shapeDist = max(max(aq.x, aq.y), aq.z);
      }

      float edgeMask = 1.0 - smoothstep(1.0 - soft, 1.0, shapeDist);

      // Height falloff inside volume (q.y in [-1..1] -> h01 in [0..1])
      float h01 = clamp(q.y * 0.5 + 0.5, 0.0, 1.0);
      float heightMask = pow(1.0 - h01, mix(0.25, 2.8, uHeightFalloff)) * smoothstep(0.0, 0.14, h01);

      // Terrain occlusion & ground-hugging boost
      float groundMask = 1.0;
      if (uHasHeightMap > 0.5) {
        vec2 tUv = vec2(wp.x / uTerrainSize + 0.5, wp.z / uTerrainSize + 0.5);
        float terrH = texture2D(uHeightMap, clamp(tUv, 0.002, 0.998)).r * uDisplacementScale;
        float surfH = max(terrH, uSeaY - 0.25);
        float aboveGround = wp.y - surfH;
        groundMask = smoothstep(-0.35, 0.45, aboveGround);
        float hug = exp(-max(0.0, aboveGround) * (0.18 * uHeightFalloff));
        heightMask = mix(heightMask, hug, uHeightFalloff * 0.55);
      }

      if (edgeMask * heightMask * groundMask > 0.005) {
        vec3 windOffset = vec3(uWindVel.x, 0.08, uWindVel.y) * uTime;
        float n = fbm3(wp * (0.18 * uNoiseScale) + windOffset);
        float billow = mix(1.0, smoothstep(0.22, 0.78, n), uNoiseStrength);
        float sampleDensity = edgeMask * heightMask * groundMask * billow * uDensity * 0.26;
        if (sampleDensity > 0.001) {
          float stepAlpha = 1.0 - exp(-sampleDensity * dt);
          vec3 stepCol = scatterCol * mix(0.72, 1.18, h01);
          accumLight += transmittance * stepAlpha * stepCol;
          transmittance *= (1.0 - stepAlpha);
          if (transmittance < 0.03) break;
        }
      }
      t += dt;
    }

    float alpha = clamp(1.0 - transmittance, 0.0, 0.96);
    if (alpha < 0.005) discard;
    vec3 finalCol = accumLight / max(alpha, 0.001);
    gl_FragColor = vec4(finalCol, alpha);
  }
`;

interface SingleFogVolumeProps {
  volume: FogVolume;
  heightTex: THREE.Texture | null;
  terrainSize: number;
  displacementScale: number;
  seaY: number;
  sunDir: THREE.Vector3;
  sunColor: string;
  isSelected: boolean;
  showGizmo: boolean;
  interactive: boolean;
  onSelect: (volume: FogVolume, e: ThreeEvent<PointerEvent>) => void;
}

const SingleFogVolumeMesh: React.FC<SingleFogVolumeProps> = ({
  volume,
  heightTex,
  terrainSize,
  displacementScale,
  seaY,
  sunDir,
  sunColor,
  isSelected,
  showGizmo,
  interactive,
  onSelect,
}) => {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const centerY = volume.y + volume.height * 0.5;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uHeightMap: { value: null as THREE.Texture | null },
      uHasHeightMap: { value: 0 },
      uTerrainSize: { value: TERRAIN_SIZE },
      uDisplacementScale: { value: 16 },
      uSeaY: { value: 3.68 },
      uCenter: { value: new THREE.Vector3() },
      uHalfExtents: { value: new THREE.Vector3(9, 2.5, 9) },
      uCosRot: { value: 1 },
      uSinRot: { value: 0 },
      uShape: { value: 0 },
      uColor: { value: new THREE.Color('#c9d4e0') },
      uSunDir: { value: new THREE.Vector3(-0.6, 0.7, 0.3).normalize() },
      uSunColor: { value: new THREE.Color('#ffd28a') },
      uDensity: { value: 0.7 },
      uEdgeSoftness: { value: 0.6 },
      uHeightFalloff: { value: 0.7 },
      uNoiseScale: { value: 1 },
      uNoiseStrength: { value: 0.55 },
      uWindVel: { value: new THREE.Vector2(0.3, 0.15) },
      uGlow: { value: 0 },
      uLightScattering: { value: 0.6 },
    }),
    []
  );

  useEffect(() => {
    const m = matRef.current;
    if (!m) return;
    m.uniforms.uHeightMap.value = heightTex;
    m.uniforms.uHasHeightMap.value = heightTex ? 1 : 0;
    m.uniforms.uTerrainSize.value = terrainSize;
    m.uniforms.uDisplacementScale.value = displacementScale;
    m.uniforms.uSeaY.value = seaY;
    m.uniforms.uCenter.value.set(volume.x, centerY, volume.z);
    m.uniforms.uHalfExtents.value.set(volume.width * 0.5, volume.height * 0.5, volume.depth * 0.5);
    m.uniforms.uCosRot.value = Math.cos(volume.rotY || 0);
    m.uniforms.uSinRot.value = Math.sin(volume.rotY || 0);
    m.uniforms.uShape.value = volume.shape === 'sphere' ? 1 : volume.shape === 'cylinder' ? 2 : 0;
    m.uniforms.uColor.value.set(volume.color || '#c9d4e0');
    m.uniforms.uSunDir.value.copy(sunDir);
    m.uniforms.uSunColor.value.set(sunColor);
    m.uniforms.uDensity.value = volume.density;
    m.uniforms.uEdgeSoftness.value = volume.edgeSoftness;
    m.uniforms.uHeightFalloff.value = volume.heightFalloff;
    m.uniforms.uNoiseScale.value = volume.noiseScale;
    m.uniforms.uNoiseStrength.value = volume.noiseStrength;
    const rad = ((volume.windDirection || 0) * Math.PI) / 180;
    m.uniforms.uWindVel.value.set(Math.cos(rad) * volume.windSpeed, Math.sin(rad) * volume.windSpeed);
    m.uniforms.uGlow.value = volume.glow;
    m.uniforms.uLightScattering.value = volume.lightScattering;
  }, [volume, centerY, heightTex, terrainSize, displacementScale, seaY, sunDir, sunColor]);

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  return (
    <group position={[volume.x, centerY, volume.z]} rotation={[0, volume.rotY || 0, 0]}>
      {/* Volumetric raymarched proxy box (renders BackSide so camera inside the fog still renders) */}
      <mesh renderOrder={6} raycast={noopRaycast}>
        <boxGeometry args={[volume.width, volume.height, volume.depth]} />
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={FOG_VOLUME_VERT}
          fragmentShader={FOG_VOLUME_FRAG}
          transparent
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Interactive handle / selection bounds when editing fog volumes */}
      {(showGizmo || isSelected) && (
        <group>
          <mesh
            position={[0, -volume.height * 0.5 + 0.18, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={interactive ? undefined : noopRaycast}
            onPointerDown={(e) => {
              if (!interactive || e.button !== 0) return;
              e.stopPropagation();
              onSelect(volume, e);
            }}
          >
            <planeGeometry args={[Math.min(volume.width, 10), Math.min(volume.depth, 10)]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0, 0]} raycast={noopRaycast}>
            <boxGeometry args={[volume.width, volume.height, volume.depth]} />
            <meshBasicMaterial
              color={isSelected ? '#facc15' : volume.color}
              wireframe
              transparent
              opacity={isSelected ? 0.65 : 0.25}
              depthWrite={false}
            />
          </mesh>
          <Html position={[0, volume.height * 0.5 + 0.8, 0]} center zIndexRange={[16, 0]}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(volume, e as unknown as ThreeEvent<PointerEvent>);
              }}
              className={`px-2 py-0.5 rounded text-[10.5px] font-mono whitespace-nowrap transition-all border shadow ${
                isSelected
                  ? 'bg-[#2a2214] text-[#f9e7b2] border-[#eab308]'
                  : 'bg-[#0e1218]/85 text-[#cfd6e2] border-[#334155] hover:border-[#eab308]'
              }`}
            >
              ☁ {volume.name}
            </button>
          </Html>
        </group>
      )}
    </group>
  );
};

export interface FogVolumes3DProps {
  volumes: FogVolume[];
  heightTex: THREE.Texture | null;
  terrainSize: number;
  displacementScale: number;
  seaY: number;
  sunPos: [number, number, number];
  sunColor: string;
  gmMode: boolean;
  visible: boolean;
  selectedFogId: string | null;
  showGizmos: boolean;
  interactive: boolean;
  onSelectFog: (volume: FogVolume, e: ThreeEvent<PointerEvent>) => void;
}

export const FogVolumes3D: React.FC<FogVolumes3DProps> = ({
  volumes,
  heightTex,
  terrainSize,
  displacementScale,
  seaY,
  sunPos,
  sunColor,
  gmMode,
  visible,
  selectedFogId,
  showGizmos,
  interactive,
  onSelectFog,
}) => {
  const sunDir = useMemo(() => new THREE.Vector3(...sunPos).normalize(), [sunPos]);
  if (!visible || volumes.length === 0) return null;

  return (
    <group>
      {volumes.map((v) => {
        if (!v.visible) return null;
        if (v.is_gm_only && !gmMode) return null;
        return (
          <SingleFogVolumeMesh
            key={v.id}
            volume={v}
            heightTex={heightTex}
            terrainSize={terrainSize}
            displacementScale={displacementScale}
            seaY={seaY}
            sunDir={sunDir}
            sunColor={sunColor}
            isSelected={selectedFogId === v.id}
            showGizmo={showGizmos}
            interactive={interactive}
            onSelect={onSelectFog}
          />
        );
      })}
    </group>
  );
};


