import { useMemo } from 'react';
import * as THREE from 'three';
import type { MachineStatus } from '@factory-twin/shared';
import { STATUS_COLOR } from '../theme';

function roundedRect(w: number, d: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A rounded frame of the given outer size and line thickness. */
function frameGeometry(w: number, d: number, thickness: number): THREE.ShapeGeometry {
  const radius = Math.min(w, d) * 0.18;
  const outer = roundedRect(w, d, radius);
  const inner = roundedRect(w - thickness * 2, d - thickness * 2, Math.max(0.01, radius - thickness));
  outer.holes.push(new THREE.Path(inner.getPoints(8).reverse()));
  return new THREE.ShapeGeometry(outer, 8);
}

interface Props {
  width: number;
  depth: number;
  status: MachineStatus;
  selected: boolean;
  hovered: boolean;
}

/** Status-coloured frame on the floor around a machine, with a white frame when selected. */
export function FootprintMarker({ width, depth, status, selected, hovered }: Props) {
  const frame = useMemo(() => frameGeometry(width, depth, 0.09), [width, depth]);
  const outline = useMemo(() => frameGeometry(width + 0.36, depth + 0.36, 0.06), [width, depth]);
  const color = STATUS_COLOR[status];

  return (
    <group rotation-x={-Math.PI / 2} position-y={0.015}>
      <mesh>
        <shapeGeometry args={[roundedRect(width, depth, Math.min(width, depth) * 0.18)]} />
        <meshBasicMaterial color={color} transparent opacity={hovered || selected ? 0.22 : 0.12} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh geometry={frame}>
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {selected && (
        <mesh geometry={outline} position-z={0.001}>
          <meshBasicMaterial color="#f0efec" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}
