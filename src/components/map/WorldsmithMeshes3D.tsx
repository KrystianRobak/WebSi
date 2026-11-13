import React, { useEffect, useMemo, useRef } from 'react';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { TERRAIN_SIZE, sampleTerrainElevation } from '../../lib/terrainGenerator';
import { evalSplinePoint } from '../../lib/terrainEditorEngine';
import { MapProp, MapRiver } from '../../types/vault';

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
}

const SingleRiverRibbon: React.FC<RiverRibbonProps> = ({
  river,
  heightData,
  heightRes,
  displacementScale,
  seaY,
  terrainVersion,
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

      const yCenter = sampleTerrainElevation(heightData, heightRes, p.x, p.z, TERRAIN_SIZE, displacementScale);
      const yLeft = sampleTerrainElevation(heightData, heightRes, lx, lz, TERRAIN_SIZE, displacementScale);
      const yRight = sampleTerrainElevation(heightData, heightRes, rx, rz, TERRAIN_SIZE, displacementScale);
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
  }, [river, heightData, heightRes, displacementScale, seaY, terrainVersion]);

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
  terrainVersion: number;
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
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.14, 0]}>
          <ringGeometry args={[0.9, 1.15, 28]} />
          <meshBasicMaterial color="#facc15" side={THREE.DoubleSide} />
        </mesh>
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
  terrainVersion,
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
        const y = sampleTerrainElevation(heightData, heightRes, p.x, p.z, TERRAIN_SIZE, displacementScale);
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
        const y = sampleTerrainElevation(heightData, heightRes, p.x, p.z, TERRAIN_SIZE, displacementScale);
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
        const y = sampleTerrainElevation(heightData, heightRes, p.x, p.z, TERRAIN_SIZE, displacementScale);
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
        const y = sampleTerrainElevation(heightData, heightRes, p.x, p.z, TERRAIN_SIZE, displacementScale);
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
        const y = sampleTerrainElevation(
          heightData,
          heightRes,
          prop.x,
          prop.z,
          TERRAIN_SIZE,
          displacementScale
        );
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
                TERRAIN_SIZE,
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
