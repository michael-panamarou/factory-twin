import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

declare global {
  interface Window {
    /** Screen position (CSS px, relative to the canvas) of a machine's centre, for end-to-end tests. */
    __factoryTwinProject?: (id: string) => { x: number; y: number } | null;
  }
}

/** Exposes a projection helper so Playwright can click real 3D objects. Renders nothing. */
export function TestHooks() {
  const { camera, scene, size } = useThree();
  useEffect(() => {
    window.__factoryTwinProject = (id) => {
      const obj = scene.getObjectByName(id);
      if (!obj) return null;
      // Aim at the middle of the model's lower half, which is solid on every machine.
      const box = new THREE.Box3().setFromObject(obj);
      const point = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + (box.max.y - box.min.y) * 0.35, (box.min.z + box.max.z) / 2);
      point.project(camera);
      return { x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height };
    };
    return () => {
      delete window.__factoryTwinProject;
    };
  }, [camera, scene, size]);
  return null;
}
