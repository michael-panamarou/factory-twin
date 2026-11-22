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


describe('replay', () => {
  /** Ten minutes of quiet data, then a fault on the press. */
  const loadHistory = () => {
    const sim = new FactorySimulator({ seed: 9, incidentRate: 0 });
    const ticks = sim.backfill(T0 + 600 * TICK_MS, 600);
    sim.inject('PRS-01', 'fault');
    for (let i = 0; i < 20; i++) ticks.push(sim.tick(T0 + (600 + i) * TICK_MS));
    for (const t of ticks) useTwinStore.getState().applyTick(t);
    return ticks;
  };

  it('shows the hall as it was, and returns to live at the newest data', () => {
    const ticks = loadHistory();
    const end = ticks.at(-1)!.ts;
    expect(useTwinStore.getState().shown['PRS-01']?.status).toBe('error');

    useTwinStore.getState().seek(T0 + 60_000);
    let state = useTwinStore.getState();
    expect(state.replay?.time).toBe(T0 + 60_000);
    expect(state.replay?.playing).toBe(false);
    expect(state.shown['PRS-01']?.status).toBe('running');
    expect(selectStatusCounts(state).running).toBe(MACHINES.length);

    useTwinStore.getState().seek(end);
    state = useTwinStore.getState();
    expect(state.replay).toBeNull();
    expect(state.shown).toBe(state.latest);
  });

  it('never goes before the oldest reading', () => {
    loadHistory();
    useTwinStore.getState().seek(0);
    expect(useTwinStore.getState().replay?.time).toBe(T0);
  });

  it('plays at the chosen speed and stops at live', () => {
    const ticks = loadHistory();
    const store = useTwinStore.getState();
    store.setReplayPlaying(true); // from live: starts at the beginning
    expect(useTwinStore.getState().replay).toMatchObject({ time: T0, playing: true, speed: 10 });

    store.setReplaySpeed(60);
    store.advanceReplay(1000); // one second of wall-clock time at 60x
    expect(useTwinStore.getState().replay?.time).toBe(T0 + 60_000);

    store.advanceReplay(ticks.length * 1000);
    expect(useTwinStore.getState().replay).toBeNull();
  });

  it('keeps the same shown object while the data shown does not change', () => {
    loadHistory();
    useTwinStore.getState().seek(T0 + 60_000);
    const before = useTwinStore.getState().shown;
    useTwinStore.getState().seek(T0 + 60_400);
    expect(useTwinStore.getState().shown).toBe(before);
  });

  it('keeps showing the past while live data arrives, and a hello ends the replay', () => {
    const ticks = loadHistory();
    useTwinStore.getState().seek(T0 + 60_000);
    const shown = useTwinStore.getState().shown;
    useTwinStore.getState().applyTick({ ...ticks.at(-1)!, ts: ticks.at(-1)!.ts + 1000 });
    expect(useTwinStore.getState().shown).toBe(shown);

    useTwinStore.getState().applyHello(hello());
    expect(useTwinStore.getState().replay).toBeNull();
  });
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


  it('treats alerts that come with a hello as read, and later ones as unread', () => {
    const old = { id: 'a', machineId: 'CNC-01', ts: T0, severity: 'warning' as const, message: 'old' };
    useTwinStore.getState().applyHello(hello({ alerts: [old] }));
    expect(useTwinStore.getState().lastSeenAlertTs).toBe(T0);

    // A second hello (reconnect, or React starting the feed twice in dev) never goes backwards.
    useTwinStore.getState().applyHello(hello({ alerts: [{ ...old, ts: T0 - 5000 }] }));
    expect(useTwinStore.getState().lastSeenAlertTs).toBe(T0);
  });

  it('marks alerts read when the list closes', () => {
    useTwinStore.getState().applyHello(hello());
    const fresh = { id: 'b', machineId: 'PRS-01', ts: T0 + 5000, severity: 'error' as const, message: 'stopped' };
    useTwinStore.getState().applyTick({ type: 'tick', ts: T0 + 5000, readings: [], alerts: [fresh] });
    useTwinStore.getState().setAlertsOpen(true);
    expect(useTwinStore.getState().lastSeenAlertTs).toBeLessThan(fresh.ts);
    useTwinStore.getState().setAlertsOpen(false);
    expect(useTwinStore.getState().lastSeenAlertTs).toBe(fresh.ts);
  });

  it('focusMachine selects and bumps the focus request', () => {
    useTwinStore.getState().focusMachine('RBT-02');
    useTwinStore.getState().focusMachine('RBT-02');
    expect(useTwinStore.getState().selectedId).toBe('RBT-02');
    expect(useTwinStore.getState().focusRequest).toBe(2);
  });
});
