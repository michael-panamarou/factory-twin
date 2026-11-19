import { useMemo } from 'react';
import { Grid, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { HALL_SIZE } from '@factory-twin/shared';
import { modelUrl } from './useStatusMaterials';

interface PropProps {
  model: string;
  position: [number, number, number];
  rotation?: number;
  scale?: number;
  castShadow?: boolean;
}

/** A static, non-interactive model. Clones share geometry and materials. */
const mutedMaterials = new WeakMap<THREE.Material, THREE.Material>();

/** Props are desaturated so the machines, and their status colours, stand out. */
function muted(material: THREE.Material): THREE.Material {
  let copy = mutedMaterials.get(material);
  if (!copy) {
    const m = (material as THREE.MeshStandardMaterial).clone();
    m.color = new THREE.Color('#8d8d99');
    copy = m;
    mutedMaterials.set(material, copy);
  }
  return copy;
}

function Prop({ model, position, rotation = 0, scale = 1, castShadow = true }: PropProps) {
  const { scene } = useGLTF(modelUrl(model));
  const object = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(muted) : muted(mesh.material);
      }
    });
    return copy;
  }, [scene, castShadow]);
  return <primitive object={object} position={position} rotation-y={THREE.MathUtils.degToRad(rotation)} scale={scale} />;
}

/** Floor, walls and props: everything in the hall that does not report data. */
export function Hall() {
  const { width, depth } = HALL_SIZE;

  const backWall = useMemo(() => {
    const pieces: Array<{ x: number; model: string }> = [];
    for (let i = 0; i < width; i++) pieces.push({ x: -width / 2 + 0.5 + i, model: i % 4 === 2 ? 'structure-window' : 'structure-wall' });
    return pieces;
  }, [width]);

  const sideWall = useMemo(() => {
    const pieces: Array<{ z: number; model: string }> = [];
    for (let i = 0; i < depth; i++) pieces.push({ z: -depth / 2 + 0.5 + i, model: i % 4 === 2 ? 'structure-window' : 'structure-wall' });
    return pieces;
  }, [depth]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#34343c" roughness={0.92} metalness={0} />
      </mesh>
      <Grid
        args={[width, depth]}
        position-y={0.005}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#3f3f48"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#4b4b56"
        fadeDistance={60}
        infiniteGrid={false}
      />
      {/* Walkway along the front of the line */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.008, 2.9]}>
        <planeGeometry args={[19, 1.2]} />
        <meshBasicMaterial color="#c99a2e" transparent opacity={0.18} depthWrite={false} />
      </mesh>

      {backWall.map(({ x, model }) => (
        <Prop key={`bw${x}`} model={model} position={[x, 0, -depth / 2 - 0.5]} rotation={0} />
      ))}
      {sideWall.map(({ z, model }) => (
        <Prop key={`sw${z}`} model={model} position={[-width / 2 - 0.5, 0, z]} rotation={-90} />
      ))}

      {/* Finished goods waiting by the palletiser */}
      <Prop model="box-large" position={[10.4, 0, 4.6]} scale={1.3} />
      <Prop model="box-large" position={[10.4, 0.72, 4.6]} scale={1.3} rotation={90} />
      <Prop model="box-wide" position={[8.6, 0, 4.9]} scale={1.3} />
      <Prop model="box-small" position={[8.9, 0, 3.8]} scale={1.3} rotation={20} />

      {/* Raw material waiting by the hopper */}
      <Prop model="box-wide" position={[-10.2, 0, 1.6]} scale={1.3} rotation={90} />
      <Prop model="box-large" position={[-10.2, 0, 3.2]} scale={1.3} />

      {/* Service pipe along the back wall */}
      {[-9, -7, -5, -3, -1, 1, 3, 5, 7, 9].map((x) => (
        <Prop key={`p${x}`} model="pipe-large-long" position={[x, 2.1, -depth / 2 + 0.15]} scale={1} castShadow={false} />
      ))}
    </group>
  );
}

/** Models to fetch as soon as the bundle loads, so the hall appears in one go. */
export const HALL_MODELS = [
  'structure-wall',
  'structure-window',
  'box-large',
  'box-wide',
  'box-small',
  'pipe-large-long',
];
