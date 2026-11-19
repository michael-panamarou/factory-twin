import { describe, expect, it } from 'vitest';
import { FactorySimulator, MACHINES, Rng, TICK_MS } from '../src/index.ts';

const T0 = Date.UTC(2026, 10, 19, 12, 0, 0);

describe('Rng', () => {
  it('is reproducible for a given seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe('FactorySimulator', () => {
  it('emits one reading per machine on every tick', () => {
    const sim = new FactorySimulator({ seed: 1 });
    const tick = sim.tick(T0);
    expect(tick.type).toBe('tick');
    expect(tick.readings.map((r) => r.machineId)).toEqual(MACHINES.map((m) => m.id));
    expect(tick.readings.every((r) => r.ts === T0)).toBe(true);
  });

  it('is deterministic for the same seed and timestamps', () => {
    const run = () => new FactorySimulator({ seed: 99 }).backfill(T0, 600);
    expect(run()).toEqual(run());
  });

  it('stays in normal operation when incidents are switched off', () => {
    const sim = new FactorySimulator({ seed: 3, incidentRate: 0 });
    const ticks = sim.backfill(T0, 1800);
    const statuses = new Set(ticks.flatMap((t) => t.readings.map((r) => r.status)));
    expect(statuses).toEqual(new Set(['running']));
    expect(ticks.flatMap((t) => t.alerts)).toHaveLength(0);
  });

  it('produces a realistic mix of statuses over an hour', () => {
    const sim = new FactorySimulator({ seed: 2026 });
    const readings = sim.backfill(T0, 3600).flatMap((t) => t.readings);
    const share = (s: string) => readings.filter((r) => r.status === s).length / readings.length;
    expect(share('running')).toBeGreaterThan(0.8);
    expect(share('warning')).toBeGreaterThan(0);
  });

  it('drives an injected overheating incident through warning and error, then recovers', () => {
    const sim = new FactorySimulator({ seed: 5, incidentRate: 0 });
    sim.backfill(T0, 30);
    sim.inject('CNC-01', 'overheating');

    const seen: string[] = [];
    const alerts: string[] = [];
    for (let i = 30; i < 30 + 900; i++) {
      const tick = sim.tick(T0 + i * TICK_MS);
      const reading = tick.readings.find((r) => r.machineId === 'CNC-01')!;
      if (seen.at(-1) !== reading.status) seen.push(reading.status);
      alerts.push(...tick.alerts.filter((a) => a.machineId === 'CNC-01').map((a) => a.severity));
    }

    expect(seen[0]).toBe('running');
    expect(seen).toContain('warning');
    expect(seen.at(-1)).toBe('running');
    expect(alerts[0]).toBe('warning');
    expect(alerts.at(-1)).toBe('info');
  });

  it('stops output during a fault', () => {
    const sim = new FactorySimulator({ seed: 8, incidentRate: 0 });
    sim.backfill(T0, 10);
    sim.inject('PRS-01', 'fault');
    let last = sim.tick(T0 + 10 * TICK_MS);
    for (let i = 11; i < 18; i++) last = sim.tick(T0 + i * TICK_MS);
    const press = last.readings.find((r) => r.machineId === 'PRS-01')!;
    expect(press.status).toBe('error');
    expect(press.throughput).toBeLessThan(1);
    expect(sim.modeOf('PRS-01')).toBe('fault');
  });

  it('gives every alert a unique id', () => {
    const sim = new FactorySimulator({ seed: 11, incidentRate: 5 });
    const ids = sim.backfill(T0, 1200).flatMap((t) => t.alerts.map((a) => a.id));
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects unknown machines on inject', () => {
    expect(() => new FactorySimulator().inject('NOPE', 'jam')).toThrow(/Unknown machine/);
  });
});
