import type { MachineLimits, Reading } from './types.ts';

export type ReadingValues = Pick<Reading, 'temperature' | 'throughput' | 'vibration'>;

/** Throughput below these fractions of nominal raises a warning / an error. */
export const THROUGHPUT_WARN_RATIO = 0.7;
export const THROUGHPUT_ERROR_RATIO = 0.2;

export interface StatusCause {
  status: Reading['status'];
  /** Human-readable reasons, most severe first. Empty when running. */
  reasons: string[];
}

/**
 * Once a limit is crossed, the value has to come back this far inside it before
 * the status clears. Without it, a reading hovering at a limit would flap
 * between two statuses every second and flood the alert list.
 */
export const HYSTERESIS = { temperature: 2, vibration: 0.3, throughputRatio: 0.05 } as const;

const RANK = { running: 0, warning: 1, error: 2 } as const;

/**
 * Derives a machine's status from one reading and its limits.
 * Pure and deterministic: the simulator, the server and the browser all use it.
 * Pass the previous status to apply hysteresis when a machine is recovering.
 */
export function evaluateStatus(values: ReadingValues, limits: MachineLimits, previous?: Reading['status'] | null): StatusCause {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { temperature, throughput, vibration } = values;
  const prev = previous ? RANK[previous] : 0;
  // Thresholds the machine has already crossed are relaxed by the hysteresis band.
  const band = (level: 1 | 2, amount: number) => (prev >= level ? amount : 0);

  if (temperature >= limits.tempError - band(2, HYSTERESIS.temperature)) {
    errors.push(`Temperature ${temperature.toFixed(1)} °C is above the ${limits.tempError} °C limit`);
  } else if (temperature >= limits.tempWarn - band(1, HYSTERESIS.temperature)) {
    warnings.push(`Temperature ${temperature.toFixed(1)} °C is above the ${limits.tempWarn} °C warning level`);
  }

  if (vibration >= limits.vibrationError - band(2, HYSTERESIS.vibration)) {
    errors.push(`Vibration ${vibration.toFixed(1)} mm/s is above the ${limits.vibrationError} mm/s limit`);
  } else if (vibration >= limits.vibrationWarn - band(1, HYSTERESIS.vibration)) {
    warnings.push(`Vibration ${vibration.toFixed(1)} mm/s is above the ${limits.vibrationWarn} mm/s warning level`);
  }

  const ratio = limits.nominalThroughput > 0 ? throughput / limits.nominalThroughput : 1;
  if (ratio < THROUGHPUT_ERROR_RATIO + band(2, HYSTERESIS.throughputRatio)) {
    errors.push(throughput <= 0.05 ? 'Machine stopped: no output' : `Throughput down to ${Math.round(ratio * 100)} % of nominal`);
  } else if (ratio < THROUGHPUT_WARN_RATIO + band(1, HYSTERESIS.throughputRatio)) {
    warnings.push(`Throughput down to ${Math.round(ratio * 100)} % of nominal`);
  }

  if (errors.length > 0) return { status: 'error', reasons: [...errors, ...warnings] };
  if (warnings.length > 0) return { status: 'warning', reasons: warnings };
  return { status: 'running', reasons: [] };
}

export function deriveStatus(values: ReadingValues, limits: MachineLimits, previous?: Reading['status'] | null): Reading['status'] {
  return evaluateStatus(values, limits, previous).status;
}

const SEVERITY_RANK = { offline: 0, running: 1, warning: 2, error: 3 } as const;

/** Orders statuses so the most severe sorts first. */
export function compareStatusSeverity(a: keyof typeof SEVERITY_RANK, b: keyof typeof SEVERITY_RANK): number {
  return SEVERITY_RANK[b] - SEVERITY_RANK[a];
}
