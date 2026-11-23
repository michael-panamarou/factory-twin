import { CONVEYOR_LINE, HALL_SIZE, type MachineSpec } from '@factory-twin/shared';

/**
 * Landscape draws the hall as the 3D camera sees it from above: x to the
 * right, z (towards the viewer) down. Portrait turns it a quarter, so the
 * production line runs down a phone screen instead of across it.
 */
export type Orientation = 'landscape' | 'portrait';

/** Footprints of the models at scale 1, in metres (measured from the glTF files). */
export const MODEL_FOOTPRINT: Record<string, { w: number; d: number; round?: boolean }> = {
    'hopper-high-round': { w: 1.12, d: 1.12, round: true },
    machine: { w: 1.2, d: 1.5 },
    'machine-window': { w: 1.2, d: 1.5 },
    'machine-fortified': { w: 1.2, d: 1.6 },
    'robot-arm-a': { w: 1, d: 1, round: true },
    'robot-arm-b': { w: 1, d: 1, round: true },
    'scanner-high': { w: 0.48, d: 1.77 },
    'conveyor-long-stripe-sides': { w: 2, d: 1 },
};

/** The area the plan shows: the hall floor plus the walls on the back and left. */
export const PLAN_BOUNDS = {
    minX: -HALL_SIZE.width / 2 - 1,
    maxX: HALL_SIZE.width / 2 + 0.5,
    minZ: -HALL_SIZE.depth / 2 - 1,
    maxZ: HALL_SIZE.depth / 2 + 0.5,
} as const;

/** Size of the drawing in metres. */
export function boardSize(orientation: Orientation): { width: number; height: number } {
    const w = PLAN_BOUNDS.maxX - PLAN_BOUNDS.minX;
    const h = PLAN_BOUNDS.maxZ - PLAN_BOUNDS.minZ;
    return orientation === 'landscape' ? { width: w, height: h } : { width: h, height: w };
}

/** A point in the hall (x, z) to a point on the drawing (u to the right, v down), in metres. */
export function toBoard(x: number, z: number, orientation: Orientation): { u: number; v: number } {
    return orientation === 'landscape'
        ? { u: x - PLAN_BOUNDS.minX, v: z - PLAN_BOUNDS.minZ }
        : { u: PLAN_BOUNDS.maxZ - z, v: x - PLAN_BOUNDS.minX };
}

/** An axis-aligned rectangle of the hall on the drawing, for the SVG floor. */
export function boardRect(minX: number, maxX: number, minZ: number, maxZ: number, orientation: Orientation) {
    const a = toBoard(minX, minZ, orientation);
    const b = toBoard(maxX, maxZ, orientation);
    return { x: Math.min(a.u, b.u), y: Math.min(a.v, b.v), width: Math.abs(b.u - a.u), height: Math.abs(b.v - a.v) };
}

/** Where and how to draw one machine, in metres on the drawing. */
export interface PlanShape {
    id: string;
    /** Centre on the drawing. */
    u: number;
    v: number;
    /** Size before rotation: along the machine's own x and z. */
    w: number;
    h: number;
    /** Clockwise rotation on screen, degrees. */
    rotation: number;
    round: boolean;
    /** Where the label sits: just above the shape as drawn. */
    labelV: number;
}

const LABEL_GAP = 0.35;

export function planShape(spec: MachineSpec, orientation: Orientation): PlanShape {
    let w: number;
    let h: number;
    let round = false;
    let x = spec.position[0];
    const z = spec.position[1];

    if (spec.kind === 'conveyor') {
        // One shape for the whole belt, as in the 3D view.
        w = CONVEYOR_LINE.endX - CONVEYOR_LINE.startX;
        h = (MODEL_FOOTPRINT[spec.model]?.d ?? 1) * spec.scale;
        x = (CONVEYOR_LINE.startX + CONVEYOR_LINE.endX) / 2;
    } else {
        const fp = MODEL_FOOTPRINT[spec.model] ?? { w: 1, d: 1 };
        w = fp.w * spec.scale;
        h = fp.d * spec.scale;
        round = !!fp.round;
    }

    // A turn around the vertical axis is counter-clockwise seen from above; on screen that is negative.
    const rotation = (orientation === 'landscape' ? -spec.rotation : 90 - spec.rotation) % 360;
    const rad = (rotation * Math.PI) / 180;
    const screenHeight = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
    const { u, v } = toBoard(x, z, orientation);
    return { id: spec.id, u, v, w, h, rotation, round, labelV: v - screenHeight / 2 - LABEL_GAP };
}

export const planShapes = (machines: readonly MachineSpec[], orientation: Orientation): PlanShape[] =>
    machines.map((m) => planShape(m, orientation));