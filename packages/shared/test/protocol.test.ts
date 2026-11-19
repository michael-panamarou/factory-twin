import { describe, expect, it } from 'vitest';
import { FactorySimulator, MACHINES, PROTOCOL_VERSION, parseServerMessage } from '../src/index.ts';

describe('parseServerMessage', () => {
  it('round-trips a tick', () => {
    const tick = new FactorySimulator({ seed: 1 }).tick(1_700_000_000_000);
    expect(parseServerMessage(JSON.stringify(tick))).toEqual(tick);
  });

  it('accepts a hello with history', () => {
    const tick = new FactorySimulator({ seed: 1 }).tick(1_700_000_000_000);
    const hello = {
      type: 'hello',
      version: PROTOCOL_VERSION,
      serverTime: 1_700_000_000_000,
      machines: MACHINES,
      history: Object.fromEntries(tick.readings.map((r) => [r.machineId, [r]])),
      alerts: [],
    };
    expect(parseServerMessage(JSON.stringify(hello))?.type).toBe('hello');
  });

  it.each([
    ['not JSON', '{oops'],
    ['a non-object', '42'],
    ['an unknown type', JSON.stringify({ type: 'bye' })],
    ['a wrong protocol version', JSON.stringify({ type: 'hello', version: 999, machines: [], history: {}, alerts: [] })],
    ['a reading with a bad status', JSON.stringify({ type: 'tick', ts: 1, alerts: [], readings: [{ machineId: 'A', ts: 1, temperature: 1, throughput: 1, vibration: 1, status: 'exploded' }] })],
    ['a tick without readings', JSON.stringify({ type: 'tick', ts: 1, alerts: [] })],
  ])('rejects %s', (_label, raw) => {
    expect(parseServerMessage(raw)).toBeNull();
  });
});
