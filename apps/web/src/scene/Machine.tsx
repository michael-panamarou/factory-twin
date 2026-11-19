import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { CONVEYOR_LINE, type MachineSpec, type MachineStatus } from '@factory-twin/shared';
import { useMachineStatus, useTwinStore } from '../state/store';
import { STATUS_ICON, STATUS_LABEL } from '../theme';
import { FootprintMarker } from './FootprintMarker';
import { useStatusGlow, useTintedModel } from './useStatusMaterials';

/** 0..1, how hard the machine is working right now. Read inside useFrame, so no re-render. */
const activityOf = (spec: MachineSpec): number => {
  const reading = useTwinStore.getState().latest[spec.id];
  if (!reading || reading.status === 'error') return 0;
  return Math.min(1.2, reading.throughput / spec.limits.nominalThroughput);
};

interface ChromeProps {
  spec: MachineSpec;
  /** Where the label floats, relative to the machine's origin. Defaults to above the centre. */
  labelX?: number;
  width: number;
  depth: number;
  height: number;
  status: MachineStatus;
  selected: boolean;
  hovered: boolean;
}

/** Floor marker and floating label shared by every machine. */
function MachineChrome({ spec, labelX = 0, width, depth, height, status, selected, hovered }: ChromeProps) {
  return (
    <>
      <FootprintMarker width={width + 0.5} depth={depth + 0.5} status={status} selected={selected} hovered={hovered} />
      <Html position={[labelX, height + 0.45, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`machine-label status-${status}${selected ? ' is-selected' : ''}`} aria-hidden="true">
          <span className="machine-label__icon">{STATUS_ICON[status]}</span>
          <span className="machine-label__id">{spec.id}</span>
          <span className="sr-only">{STATUS_LABEL[status]}</span>
        </div>
      </Html>
    </>
  );
}

function ModelBody({ spec, status, selected, hovered }: { spec: MachineSpec; status: MachineStatus; selected: boolean; hovered: boolean }) {
  const { scene, materials, size } = useTintedModel(spec.model);
  useStatusGlow(materials, status, hovered || selected);
  const joints = useRobotJoints(spec.kind === 'robot' ? scene : null);

  const phase = useRef(Math.random() * 10);
  useFrame((_, delta) => {
    if (!joints) return;
    phase.current += delta * 1.6 * activityOf(spec);
    const p = phase.current;
    joints.forEach(({ node, base, axis, amplitude, offset, speed }) => {
      node.rotation[axis] = base + Math.sin(p * speed + offset) * amplitude;
    });
  });

  const s = spec.scale;
  return (
    <>
      <primitive object={scene} scale={s} />
      <MachineChrome spec={spec} width={size.x * s} depth={size.z * s} height={size.y * s} status={status} selected={selected} hovered={hovered} />
    </>
  );
}

interface Joint {
  node: THREE.Object3D;
  base: number;
  axis: 'x' | 'y' | 'z';
  amplitude: number;
  offset: number;
  speed: number;
}

/** The Kenney robot arm is a chain of nodes named element-a … element-f; animate a few of them. */
function useRobotJoints(scene: THREE.Object3D | null): Joint[] | null {
  return useMemo(() => {
    if (!scene) return null;
    // [node, axis, resting bend (rad), swing amplitude, phase offset, speed]
    const plan: Array<[string, Joint['axis'], number, number, number, number]> = [
      ['element-a', 'y', 0, 0.9, 0, 0.5],
      ['element-b', 'x', 0.2, 0.15, 0.8, 1],
      ['element-c', 'x', 0.35, 0.2, 1.6, 1],
      ['element-e', 'x', 0.45, 0.25, 2.4, 1],
      ['element-f', 'y', 0, 0.8, 0.3, 1.5],
    ];
    const joints: Joint[] = [];
    for (const [name, axis, bend, amplitude, offset, speed] of plan) {
      const node = scene.getObjectByName(name);
      if (node) joints.push({ node, axis, amplitude, offset, speed, base: node.rotation[axis] + bend });
    }
    return joints;
  }, [scene]);
}

const BOX_COUNT = 7;

function ConveyorBody({ spec, status, selected, hovered }: { spec: MachineSpec; status: MachineStatus; selected: boolean; hovered: boolean }) {
  const { scene, materials, size } = useTintedModel(spec.model);
  const box = useTintedModel('box-small');
  useStatusGlow(materials, status, hovered || selected);

  const s = spec.scale;
  const length = CONVEYOR_LINE.endX - CONVEYOR_LINE.startX;
  const segmentLength = size.x * s;
  const count = Math.round(length / segmentLength);
  const segments = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ x: CONVEYOR_LINE.startX + segmentLength * (i + 0.5) - spec.position[0], object: i === 0 ? scene : scene.clone(true) })),
    [count, scene, segmentLength, spec.position],
  );
  const boxes = useMemo(() => Array.from({ length: BOX_COUNT }, () => box.scene.clone(true)), [box.scene]);

  const travel = useRef(0);
  const boxRefs = useRef<THREE.Object3D[]>([]);
  useFrame((_, delta) => {
    travel.current += delta * 0.9 * activityOf(spec);
    const spacing = length / BOX_COUNT;
    boxRefs.current.forEach((obj, i) => {
      const along = (travel.current + i * spacing) % length;
      obj.position.x = CONVEYOR_LINE.startX + along - spec.position[0];
    });
  });

  return (
    <>
      {segments.map((seg, i) => (
        <primitive key={i} object={seg.object} position-x={seg.x} scale={s} />
      ))}
      {boxes.map((obj, i) => (
        <primitive
          key={`box-${i}`}
          object={obj}
          ref={(o: THREE.Object3D | null) => {
            if (o) boxRefs.current[i] = o;
          }}
          position-y={size.y * s}
          scale={0.7}
        />
      ))}
      <MachineChrome
        spec={spec}
        labelX={CONVEYOR_LINE.startX + 1 - spec.position[0]}
        width={length}
        depth={size.z * s}
        height={size.y * s}
        status={status}
        selected={selected}
        hovered={hovered}
      />
    </>
  );
}

export function Machine({ spec }: { spec: MachineSpec }) {
  const status = useMachineStatus(spec.id);
  const selected = useTwinStore((s) => s.selectedId === spec.id);
  const hovered = useTwinStore((s) => s.hoveredId === spec.id);
  const select = useTwinStore((s) => s.select);
  const hover = useTwinStore((s) => s.hover);

  const handlers = {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      select(spec.id);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      hover(spec.id);
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      if (useTwinStore.getState().hoveredId === spec.id) hover(null);
      document.body.style.cursor = '';
    },
  };

  const props = { spec, status, selected, hovered };
  let body: ReactNode;
  if (spec.kind === 'conveyor') body = <ConveyorBody {...props} />;
  else body = <ModelBody {...props} />;

  return (
    <group name={spec.id} position={[spec.position[0], 0, spec.position[1]]} rotation-y={THREE.MathUtils.degToRad(spec.rotation)} {...handlers}>
      {body}
    </group>
  );
}
