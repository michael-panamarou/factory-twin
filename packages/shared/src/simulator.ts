import { MACHINES } from './layout.ts';
import { TICK_MS, type TickMessage } from './protocol.ts';
import { Rng } from './rng.ts';
import { evaluateStatus } from './status.ts';
import type { Alert, MachineSpec, Reading } from './types.ts';

/** What the simulated machine is going through. Each mode shapes the sensor values differently. */
export type SimMode = 'normal' | 'overheating' | 'bearing' | 'jam' | 'fault' | 'recovering';

/** Incidents that can be injected by hand, for demos and tests. */
export type Incident = 'overheating' | 'bearing' | 'jam' | 'fault';

interface MachineState {
  spec: MachineSpec;
  mode: SimMode;
  /** Seconds spent in the current mode. */
  elapsed: number;
  /** Planned length of the current mode in seconds (where it applies). */
  duration: number;
  /** Mode-specific rate: °C/s while overheating, mm/s per s for bearing wear. */
  rate: number;
  temperature: number;
  throughput: number;
  vibration: number;
  lastStatus: Reading['status'] | null;
}

export interface SimulatorOptions {
  machines?: readonly MachineSpec[];
  seed?: number;
  /**
   * Multiplies how often incidents start on their own. 1 = default
   * (a lively demo, roughly one incident somewhere in the hall every 80 s); 0 = never.
   */
  incidentRate?: number;
}

/** Per-second chance that a machine in normal mode starts each incident, at incidentRate 1. */
const BASE_INCIDENT_CHANCE: Record<Exclude<Incident, 'fault'>, number> = {
  overheating: 1 / 1500,
  bearing: 1 / 2600,
  jam: 1 / 1800,
};

const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Moves `value` a fraction of the way toward `target`, plus noise: a discrete Ornstein–Uhlenbeck step. */
const relax = (value: number, target: number, k: number, noise: number) => value + (target - value) * k + noise;

/**
 * Deterministic sensor simulator. Given the same seed and the same sequence of
 * timestamps, it produces exactly the same readings and alerts.
 */
export class FactorySimulator {
  readonly machines: readonly MachineSpec[];
  private readonly rng: Rng;
  private readonly incidentRate: number;
  private readonly states = new Map<string, MachineState>();
  private lastTs: number | null = null;
  private alertCounter = 0;

  constructor(options: SimulatorOptions = {}) {
    this.machines = options.machines ?? MACHINES;
    this.rng = new Rng(options.seed ?? 20261119);
    this.incidentRate = options.incidentRate ?? 1;
    for (const spec of this.machines) {
      this.states.set(spec.id, {
        spec,
        mode: 'normal',
        elapsed: 0,
        duration: 0,
        rate: 0,
        temperature: spec.limits.nominalTemp + this.rng.gaussian(),
        throughput: spec.limits.nominalThroughput,
        vibration: 1.8 + this.rng.range(-0.2, 0.2),
        lastStatus: null,
      });
    }
  }

  /** Current mode of a machine; useful in tests and for debugging. */
  modeOf(machineId: string): SimMode | undefined {
    return this.states.get(machineId)?.mode;
  }

  /** Forces an incident on a machine, whatever it is doing now. */
  inject(machineId: string, incident: Incident): void {
    const state = this.states.get(machineId);
    if (!state) throw new Error(`Unknown machine ${machineId}`);
    this.enter(state, incident);
  }

  /** Advances the simulation to `ts` and returns one reading per machine. */
  tick(ts: number): TickMessage {
    const dt = this.lastTs === null ? TICK_MS / 1000 : clamp((ts - this.lastTs) / 1000, 0, 10);
    this.lastTs = ts;
    const readings: Reading[] = [];
    const alerts: Alert[] = [];

    for (const state of this.states.values()) {
      this.advance(state, dt);
      const values = {
        temperature: round1(state.temperature),
        throughput: round1(Math.max(0, state.throughput)),
        vibration: round1(Math.max(0, state.vibration)),
      };
      const { status, reasons } = evaluateStatus(values, state.spec.limits, state.lastStatus);
      readings.push({ machineId: state.spec.id, ts, ...values, status });

      const alert = this.alertFor(state, status, reasons, ts);
      if (alert) alerts.push(alert);
      state.lastStatus = status;
    }

    return { type: 'tick', ts, readings, alerts };
  }

  /**
   * Runs the simulation quickly over the `seconds` before `endTs`, so a fresh
   * server or browser session starts with history instead of empty charts.
   */
  backfill(endTs: number, seconds: number): TickMessage[] {
    const ticks: TickMessage[] = [];
    const start = endTs - seconds * TICK_MS;
    for (let ts = start; ts < endTs; ts += TICK_MS) ticks.push(this.tick(ts));
    return ticks;
  }

  private enter(state: MachineState, mode: SimMode): void {
    state.mode = mode;
    state.elapsed = 0;
    const rng = this.rng;
    switch (mode) {
      case 'overheating':
        state.rate = rng.range(0.12, 0.32);
        state.duration = Infinity;
        break;
      case 'bearing':
        state.rate = rng.range(0.025, 0.05);
        state.duration = Infinity;
        break;
      case 'jam':
        state.rate = rng.range(0.3, 0.6); // throughput ratio while jammed
        state.duration = rng.range(10, 25);
        break;
      case 'fault':
        state.duration = rng.range(20, 50);
        break;
      case 'recovering':
        state.duration = rng.range(8, 14);
        break;
      case 'normal':
        state.duration = 0;
        break;
    }
  }

  private advance(state: MachineState, dt: number): void {
    const { limits } = state.spec;
    const rng = this.rng;
    const steps = Math.max(1, Math.round(dt));
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      state.elapsed += stepDt;
      const nominalVib = 1.8;

      switch (state.mode) {
        case 'normal': {
          state.temperature = relax(state.temperature, limits.nominalTemp, 0.08, rng.gaussian() * 0.25);
          state.throughput = relax(state.throughput, limits.nominalThroughput * 0.97, 0.3, rng.gaussian() * limits.nominalThroughput * 0.02);
          state.vibration = relax(state.vibration, nominalVib, 0.2, rng.gaussian() * 0.08);
          const r = this.incidentRate * stepDt;
          if (rng.chance(BASE_INCIDENT_CHANCE.overheating * r)) this.enter(state, 'overheating');
          else if (rng.chance(BASE_INCIDENT_CHANCE.bearing * r)) this.enter(state, 'bearing');
          else if (rng.chance(BASE_INCIDENT_CHANCE.jam * r)) this.enter(state, 'jam');
          break;
        }
        case 'overheating': {
          state.temperature += state.rate * stepDt + rng.gaussian() * 0.2;
          state.throughput = relax(state.throughput, limits.nominalThroughput * 0.9, 0.2, rng.gaussian() * limits.nominalThroughput * 0.02);
          state.vibration = relax(state.vibration, nominalVib + 0.6, 0.1, rng.gaussian() * 0.08);
          if (state.temperature >= limits.tempError + 1.5) this.enter(state, 'fault');
          else if (state.elapsed > 20 && rng.chance(stepDt / 90)) this.enter(state, 'recovering');
          break;
        }
        case 'bearing': {
          state.vibration += state.rate * stepDt + rng.gaussian() * 0.06;
          state.temperature = relax(state.temperature, limits.nominalTemp + 6, 0.05, rng.gaussian() * 0.25);
          state.throughput = relax(state.throughput, limits.nominalThroughput * 0.93, 0.2, rng.gaussian() * limits.nominalThroughput * 0.02);
          if (state.vibration >= limits.vibrationError + 0.3) this.enter(state, 'fault');
          else if (state.elapsed > 30 && rng.chance(stepDt / 120)) this.enter(state, 'recovering');
          break;
        }
        case 'jam': {
          state.throughput = relax(state.throughput, limits.nominalThroughput * state.rate, 0.5, rng.gaussian() * limits.nominalThroughput * 0.02);
          state.temperature = relax(state.temperature, limits.nominalTemp + 2, 0.05, rng.gaussian() * 0.25);
          state.vibration = relax(state.vibration, nominalVib + 1.2, 0.3, rng.gaussian() * 0.15);
          if (state.elapsed >= state.duration) this.enter(state, 'normal');
          break;
        }
        case 'fault': {
          // Stopped: no output, cooling down, barely vibrating.
          state.throughput = relax(state.throughput, 0, 0.6, 0);
          state.temperature = relax(state.temperature, limits.nominalTemp - 8, 0.02, rng.gaussian() * 0.1);
          state.vibration = relax(state.vibration, 0.2, 0.5, Math.abs(rng.gaussian()) * 0.02);
          if (state.elapsed >= state.duration) this.enter(state, 'recovering');
          break;
        }
        case 'recovering': {
          const progress = clamp(state.elapsed / state.duration, 0, 1);
          state.throughput = relax(state.throughput, limits.nominalThroughput * progress, 0.5, rng.gaussian() * limits.nominalThroughput * 0.01);
          state.temperature = relax(state.temperature, limits.nominalTemp, 0.15, rng.gaussian() * 0.2);
          state.vibration = relax(state.vibration, nominalVib, 0.3, rng.gaussian() * 0.06);
          if (state.elapsed >= state.duration) this.enter(state, 'normal');
          break;
        }
      }
    }
  }

  private alertFor(state: MachineState, status: Reading['status'], reasons: string[], ts: number): Alert | null {
    const previous = state.lastStatus;
    if (previous === status) return null;
    // A fresh start in normal operation is not news.
    if (previous === null && status === 'running') return null;

    const id = `${state.spec.id}-${ts}-${++this.alertCounter}`;
    if (status === 'running') {
      return { id, machineId: state.spec.id, ts, severity: 'info', message: 'Back to normal operation' };
    }
    return { id, machineId: state.spec.id, ts, severity: status, message: reasons[0] ?? `Status changed to ${status}` };
  }
}
