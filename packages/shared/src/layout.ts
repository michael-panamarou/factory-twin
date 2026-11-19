import type { MachineLimits, MachineSpec } from './types.ts';

/** Footprint of the hall floor in metres, centred on the origin. */
export const HALL_SIZE = { width: 24, depth: 16 } as const;

/** The main conveyor runs along the x axis at this z, from START to END. */
export const CONVEYOR_LINE = { z: 0, startX: -7.8, endX: 7.8, segmentLength: 2.6 } as const;

const vibration = { vibrationWarn: 4.5, vibrationError: 7.1 };

const limits = (l: Omit<MachineLimits, 'vibrationWarn' | 'vibrationError'>): MachineLimits => ({ ...l, ...vibration });

/**
 * The production line: raw material enters at the hopper on the left,
 * is machined, pressed, carried down the conveyor, picked by the robot,
 * checked by the scanner and stacked by the palletiser on the right.
 */
export const MACHINES: readonly MachineSpec[] = [
  {
    id: 'HPR-01',
    name: 'Raw material hopper',
    kind: 'hopper',
    model: 'hopper-high-round',
    position: [-9.2, -2.4],
    rotation: 0,
    scale: 1.5,
    limits: limits({ nominalTemp: 24, tempWarn: 38, tempError: 48, nominalThroughput: 40 }),
  },
  {
    id: 'CNC-01',
    name: 'CNC mill 1',
    kind: 'cnc',
    model: 'machine',
    position: [-5.6, -2.6],
    rotation: 0,
    scale: 1.5,
    limits: limits({ nominalTemp: 55, tempWarn: 72, tempError: 88, nominalThroughput: 12 }),
  },
  {
    id: 'CNC-02',
    name: 'CNC mill 2',
    kind: 'cnc',
    model: 'machine-window',
    position: [-2.4, -2.6],
    rotation: 0,
    scale: 1.5,
    limits: limits({ nominalTemp: 55, tempWarn: 72, tempError: 88, nominalThroughput: 12 }),
  },
  {
    id: 'PRS-01',
    name: 'Hydraulic press',
    kind: 'press',
    model: 'machine-fortified',
    position: [0.8, -2.6],
    rotation: 0,
    scale: 1.5,
    limits: limits({ nominalTemp: 48, tempWarn: 66, tempError: 80, nominalThroughput: 24 }),
  },
  {
    id: 'CNV-01',
    name: 'Main conveyor',
    kind: 'conveyor',
    model: 'conveyor-long-stripe-sides',
    position: [0, 0],
    rotation: 0,
    scale: 1.3,
    limits: limits({ nominalTemp: 34, tempWarn: 52, tempError: 66, nominalThroughput: 30 }),
  },
  {
    id: 'RBT-01',
    name: 'Pick-and-place robot',
    kind: 'robot',
    model: 'robot-arm-a',
    position: [3.9, -1.7],
    rotation: 0,
    scale: 0.9,
    limits: limits({ nominalTemp: 42, tempWarn: 58, tempError: 72, nominalThroughput: 20 }),
  },
  {
    id: 'SCN-01',
    name: 'Quality scanner',
    kind: 'scanner',
    model: 'scanner-high',
    position: [6.4, 0],
    rotation: 0,
    scale: 1.3,
    limits: limits({ nominalTemp: 36, tempWarn: 52, tempError: 64, nominalThroughput: 20 }),
  },
  {
    id: 'RBT-02',
    name: 'Palletising robot',
    kind: 'robot',
    model: 'robot-arm-b',
    position: [9.4, 1.8],
    rotation: 180,
    scale: 0.9,
    limits: limits({ nominalTemp: 40, tempWarn: 58, tempError: 72, nominalThroughput: 18 }),
  },
];

export function getMachine(id: string): MachineSpec | undefined {
  return MACHINES.find((m) => m.id === id);
}
