import { beforeEach, describe, expect, it } from 'vitest';
import { FactorySimulator, HISTORY_KEEP_SECONDS, MACHINES, PROTOCOL_VERSION, TICK_MS, type HelloMessage } from '@factory-twin/shared';
import { MAX_ALERTS, selectStatusCounts, useTwinStore } from './store';

const T0 = Date.UTC(2026, 10, 19, 8, 0, 0);

const initial = useTwinStore.getState();
beforeEach(() => useTwinStore.setState(initial, true));

const hello = (overrides: Partial<HelloMessage> = {}): HelloMessage => ({
  type: 'hello',
  version: PROTOCOL_VERSION,
  serverTime: T0,
  machines: [...MACHINES],
  history: {},
  alerts: [],
  ...overrides,
});

describe('useTwinStore', () => {
  it('starts with every machine offline', () => {
    const counts = selectStatusCounts(useTwinStore.getState());
    expect(counts).toEqual({ running: 0, warning: 0, error: 0, offline: MACHINES.length });
  });

  it('applies a tick: latest values, history and status counts', () => {
    const sim = new FactorySimulator({ seed: 1, incidentRate: 0 });
    useTwinStore.getState().applyTick(sim.tick(T0));
    useTwinStore.getState().applyTick(sim.tick(T0 + TICK_MS));

    const state = useTwinStore.getState();
    expect(state.history['CNC-01']).toHaveLength(2);
    expect(state.latest['CNC-01']?.ts).toBe(T0 + TICK_MS);
    expect(state.lastUpdate).toBe(T0 + TICK_MS);
    expect(selectStatusCounts(state).running).toBe(MACHINES.length);
  });

  it('caps history at one hour per machine', () => {
    const sim = new FactorySimulator({ seed: 2, incidentRate: 0 });
    const ticks = sim.backfill(T0, HISTORY_KEEP_SECONDS + 30);
    const { applyTick } = useTwinStore.getState();
    for (const t of ticks) applyTick(t);
    const list = useTwinStore.getState().history['PRS-01']!;
    expect(list).toHaveLength(HISTORY_KEEP_SECONDS);
    expect(list.at(-1)?.ts).toBe(ticks.at(-1)?.ts);
  });

  it('caps the alert list', () => {
    const alerts = Array.from({ length: MAX_ALERTS + 25 }, (_, i) => ({
      id: `a${i}`,
      machineId: 'CNC-01',
      ts: T0 + i,
      severity: 'warning' as const,
      message: 'hot',
    }));
    useTwinStore.getState().applyTick({ type: 'tick', ts: T0, readings: [], alerts });
    const kept = useTwinStore.getState().alerts;
    expect(kept).toHaveLength(MAX_ALERTS);
    expect(kept.at(-1)?.id).toBe(`a${MAX_ALERTS + 24}`);
  });

  it('replaces state on hello and keeps a selection that still exists', () => {
    useTwinStore.getState().select('SCN-01');
    const sim = new FactorySimulator({ seed: 3 });
    const tick = sim.tick(T0);
    useTwinStore.getState().applyHello(hello({ history: Object.fromEntries(tick.readings.map((r) => [r.machineId, [r]])) }));
    const state = useTwinStore.getState();
    expect(state.selectedId).toBe('SCN-01');
    expect(state.latest['SCN-01']).toEqual(tick.readings.find((r) => r.machineId === 'SCN-01'));
  });

  it('drops a selection the new hello does not know', () => {
    useTwinStore.getState().select('GONE-99');
    useTwinStore.getState().applyHello(hello());
    expect(useTwinStore.getState().selectedId).toBeNull();
  });
});
