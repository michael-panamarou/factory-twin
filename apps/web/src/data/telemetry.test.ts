import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FactorySimulator, MACHINES, PROTOCOL_VERSION, parseClientMessage, type TickMessage } from '@factory-twin/shared';
import type { ConnectionState } from '../state/store';
import { sourceFromLocation, startTelemetry, type TelemetrySink } from './telemetry';

/** Minimal stand-in for the browser WebSocket, driven by the test. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  sent: string[] = [];
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

const makeSink = () => {
  const modes: ConnectionState['mode'][] = [];
  const sink: TelemetrySink & { hellos: number; ticks: number; last: TickMessage | null } = {
    hellos: 0,
    ticks: 0,
    last: null,
    applyHello: () => void sink.hellos++,
    applyTick: (t) => {
      sink.ticks++;
      sink.last = t;
    },
    setConnection: (c) => void modes.push(c.mode),
  };
  return { sink, modes };
};

const hello = () => ({ type: 'hello', version: PROTOCOL_VERSION, serverTime: 0, machines: MACHINES, history: {}, alerts: [] });

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
});
afterEach(() => vi.useRealTimers());

const ws = FakeSocket as unknown as typeof WebSocket;

describe('startTelemetry', () => {
  it('simulates locally when no server is configured', () => {
    const { sink, modes } = makeSink();
    const telemetry = startTelemetry(sink, { url: '' });
    expect(modes).toEqual(['local']);
    expect(sink.hellos).toBe(1);
    vi.advanceTimersByTime(3000);
    expect(sink.ticks).toBe(3);
    telemetry.stop();
    vi.advanceTimersByTime(3000);
    expect(sink.ticks).toBe(3);
  });

  it('goes live once the server says hello, and forwards ticks', () => {
    const { sink, modes } = makeSink();
    startTelemetry(sink, { url: 'ws://test/ws', WebSocketImpl: ws });
    const socket = FakeSocket.instances[0]!;
    socket.receive(hello());
    socket.receive(new FactorySimulator({ seed: 1 }).tick(1000));
    socket.receive({ type: 'garbage' });
    expect(modes).toEqual(['connecting', 'live']);
    expect(sink.hellos).toBe(1);
    expect(sink.ticks).toBe(1);
  });

  it('falls back to local simulation when the server never answers', () => {
    const { sink, modes } = makeSink();
    startTelemetry(sink, { url: 'ws://test/ws', WebSocketImpl: ws, connectTimeoutMs: 1000 });
    vi.advanceTimersByTime(1000);
    expect(modes.at(-1)).toBe('local');
  });

  it('reconnects after a live connection drops', () => {
    const { sink, modes } = makeSink();
    startTelemetry(sink, { url: 'ws://test/ws', WebSocketImpl: ws });
    FakeSocket.instances[0]!.receive(hello());
    FakeSocket.instances[0]!.close();
    expect(modes.at(-1)).toBe('reconnecting');
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1]!.receive(hello());
    expect(modes.at(-1)).toBe('live');
  });

  it('gives up and simulates locally after too many failed reconnects', () => {
    const { sink, modes } = makeSink();
    startTelemetry(sink, { url: 'ws://test/ws', WebSocketImpl: ws, maxReconnects: 2 });
    FakeSocket.instances[0]!.receive(hello());
    for (let i = 0; i < 3; i++) {
      FakeSocket.instances.at(-1)!.close();
      vi.advanceTimersByTime(20_000);
    }
    expect(modes.at(-1)).toBe('local');
  });
});

describe('inject', () => {
  it('starts an incident in the browser simulator', () => {
    const { sink } = makeSink();
    const telemetry = startTelemetry(sink, { url: '' });
    expect(telemetry.inject('PRS-01', 'fault')).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(sink.last?.readings.find((r) => r.machineId === 'PRS-01')?.status).toBe('error');
    expect(telemetry.inject('NOPE-99', 'fault')).toBe(false);
    telemetry.stop();
  });

  it('sends the incident to the server once live', () => {
    const { sink } = makeSink();
    const telemetry = startTelemetry(sink, { url: 'ws://test/ws', WebSocketImpl: ws });
    const socket = FakeSocket.instances[0]!;
    expect(telemetry.inject('CNC-01', 'jam')).toBe(false); // still connecting
    socket.receive(hello());
    expect(telemetry.inject('CNC-01', 'jam')).toBe(true);
    expect(socket.sent.map(parseClientMessage)).toEqual([{ type: 'inject', machineId: 'CNC-01', incident: 'jam' }]);
  });

  it('refuses after stop', () => {
    const { sink } = makeSink();
    const telemetry = startTelemetry(sink, { url: '' });
    telemetry.stop();
    expect(telemetry.inject('CNC-01', 'fault')).toBe(false);
  });
});

describe('sourceFromLocation', () => {
  it.each([
    ['?source=local', 'local'],
    ['?source=live', 'live'],
    ['?source=nope', null],
    ['', null],
  ])('%s -> %s', (search, expected) => {
    expect(sourceFromLocation(search)).toBe(expected);
  });
});