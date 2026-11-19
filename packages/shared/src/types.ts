/** Status shown in the scene. `offline` means no data has arrived yet. */
export type MachineStatus = 'running' | 'warning' | 'error' | 'offline';

export type MachineKind = 'hopper' | 'cnc' | 'press' | 'conveyor' | 'robot' | 'scanner';

export interface MachineLimits {
  /** Normal operating temperature, °C. */
  nominalTemp: number;
  tempWarn: number;
  tempError: number;
  /** Nominal throughput, parts per minute. */
  nominalThroughput: number;
  /** Vibration limits, mm/s RMS. */
  vibrationWarn: number;
  vibrationError: number;
}

export interface MachineSpec {
  id: string;
  name: string;
  kind: MachineKind;
  /** glTF file in /models, without extension. */
  model: string;
  /** Position on the hall floor in metres: [x, z]. */
  position: [number, number];
  /** Rotation around the vertical axis, degrees. */
  rotation: number;
  /** Uniform scale applied to the model. */
  scale: number;
  limits: MachineLimits;
}

export interface Reading {
  machineId: string;
  /** Unix time, ms. */
  ts: number;
  temperature: number;
  throughput: number;
  vibration: number;
  status: Exclude<MachineStatus, 'offline'>;
}

export type AlertSeverity = 'info' | 'warning' | 'error';

export interface Alert {
  id: string;
  machineId: string;
  ts: number;
  severity: AlertSeverity;
  message: string;
}
