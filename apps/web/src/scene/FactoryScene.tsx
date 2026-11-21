import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { HALL_SIZE } from '@factory-twin/shared';
import { useTwinStore } from '../state/store';
import { Hall, HALL_MODELS } from './Hall';
import { Machine } from './Machine';
import { CameraRig } from './CameraRig';
import { TestHooks } from './TestHooks';
import { modelUrl } from './useStatusMaterials';

function Lights() {
  const half = Math.max(HALL_SIZE.width, HALL_SIZE.depth) / 2 + 2;
  return (
      <>
        <hemisphereLight args={['#dfe6ff', '#2a2633', 1.1]} />
        <directionalLight
            position={[10, 18, 8]}
            intensity={2.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0004}
            shadow-normalBias={0.03}
            shadow-camera-left={-half}
            shadow-camera-right={half}
            shadow-camera-top={half}
            shadow-camera-bottom={-half}
            shadow-camera-near={1}
            shadow-camera-far={60}
        />
        <directionalLight position={[-12, 8, -6]} intensity={0.5} color="#b8c4ff" />
      </>
  );
}

/** On tall, narrow screens the default view crops the hall; back the camera off to fit it. */
function FitCameraToScreen() {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / s.size.height);
  useEffect(() => {
    if (aspect >= 1.1) return;
    const factor = Math.min(2.4, 1.1 / aspect);
    camera.position.set(13 * factor * 0.8, 12 * factor, 16 * factor * 0.8);
    camera.updateProjectionMatrix();
    // Only on first layout: after that the user owns the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function Machines() {
  const machines = useTwinStore((s) => s.machines);
  return (
      <>
        {machines.map((m) => (
            <Machine key={m.id} spec={m} />
        ))}
      </>
  );
}

/** A press that travels further than this is an orbit drag, not a click. */
const CLICK_SLOP_PX = 6;

export function FactoryScene() {
  const select = useTwinStore((s) => s.select);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  return (
      <Canvas
          className="scene-canvas"
          shadows={{ type: THREE.PCFShadowMap }}
          dpr={[1, 2]}
          camera={{ position: [13, 12, 16], fov: 42, near: 0.5, far: 200 }}
          gl={{ antialias: true, preserveDrawingBuffer: false }}
          onPointerDown={(e) => {
            pointerDown.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMissed={(e) => {
            // Releasing an orbit drag over empty floor must not close the panel.
            const down = pointerDown.current;
            if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX) return;
            select(null);
          }}
          aria-label="3D view of the production hall"
      >
        <color attach="background" args={['#15151a']} />
        <fog attach="fog" args={['#15151a', 32, 70]} />
        <Lights />
        <FitCameraToScreen />
        <Suspense fallback={null}>
          <Hall />
          <Machines />
        </Suspense>
        <OrbitControls
            makeDefault
            target={[0, 0.6, 0]}
            enableDamping
            dampingFactor={0.08}
            minDistance={4}
            maxDistance={42}
            maxPolarAngle={Math.PI * 0.46}
        />
        <CameraRig />
        <TestHooks />
      </Canvas>
  );
}

const MACHINE_MODELS = ['hopper-high-round', 'machine', 'machine-window', 'machine-fortified', 'conveyor-long-stripe-sides', 'robot-arm-a', 'robot-arm-b', 'scanner-high'];
for (const name of [...MACHINE_MODELS, ...HALL_MODELS]) useGLTF.preload(modelUrl(name));