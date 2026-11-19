import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { MachineStatus } from '@factory-twin/shared';
import { STATUS_COLOR } from '../theme';

export const modelUrl = (name: string) => `/models/${name}.glb`;

export interface TintedModel {
  scene: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
  /** Bounding box of the unscaled model. */
  size: THREE.Vector3;
}

/**
 * Loads a glTF model and returns a private copy whose materials can be tinted
 * without affecting other instances of the same model.
 */
export function useTintedModel(name: string): TintedModel {
  const gltf = useGLTF(modelUrl(name));
  return useMemo(() => {
    const scene = gltf.scene.clone(true);
    const cloned = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const swap = (m: THREE.Material) => {
        let copy = cloned.get(m);
        if (!copy) {
          copy = (m as THREE.MeshStandardMaterial).clone();
          copy.color = new THREE.Color('#ffffff');
          copy.emissive = new THREE.Color('#000000');
          cloned.set(m, copy);
        }
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
    const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
    return { scene, materials: [...cloned.values()], size };
  }, [gltf.scene]);
}

/** Base glow and pulse for each status. */
const GLOW: Record<MachineStatus, { base: number; pulse: number; speed: number; paint: number }> = {
  running: { base: 0.1, pulse: 0, speed: 0, paint: 0 },
  warning: { base: 0.32, pulse: 0.12, speed: 2.2, paint: 0.7 },
  error: { base: 0.42, pulse: 0.3, speed: 6, paint: 0.8 },
  offline: { base: 0, pulse: 0, speed: 0, paint: 0.5 },
};

const scratch = new THREE.Color();
const paint = new THREE.Color();
const WHITE = new THREE.Color('#ffffff');

/**
 * Eases the materials' emissive tint toward the status colour every frame,
 * pulsing for warnings and errors. Runs outside React, so it costs no re-renders.
 */
export function useStatusGlow(materials: THREE.MeshStandardMaterial[], status: MachineStatus, highlighted: boolean) {
  useFrame(({ clock }, delta) => {
    const glow = GLOW[status];
    const t = clock.getElapsedTime();
    const pulse = glow.pulse * (0.5 + 0.5 * Math.sin(t * glow.speed));
    const intensity = glow.base + pulse + (highlighted ? 0.15 : 0);
    const k = 1 - Math.exp(-delta * 8);
    scratch.set(STATUS_COLOR[status]);
    // Paint the base colour toward the status colour (it multiplies the texture)
    // and add a matching glow on top, so the status reads even in shadow.
    paint.copy(WHITE).lerp(scratch, glow.paint);
    for (const m of materials) {
      m.color.lerp(paint, k);
      m.emissive.lerp(scratch, k);
      m.emissiveIntensity += (intensity - m.emissiveIntensity) * k;
    }
  });
}
