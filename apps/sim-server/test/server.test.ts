import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { MACHINES, parseServerMessage, type ServerMessage } from '@factory-twin/shared';
import { startSimServer, type SimServer } from '../src/server.ts';

let server: SimServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** Connects and collects parsed messages until `count` have arrived. */
function collect(url: string, count: number, timeoutMs = 3000): Promise<ServerMessage[]> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const messages: ServerMessage[] = [];
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Only got ${messages.length}/${count} messages`));
    }, timeoutMs);
    socket.on('message', (data) => {
      const msg = parseServerMessage(data.toString());
      if (msg) messages.push(msg);
      if (messages.length >= count) {
        clearTimeout(timer);
        socket.close();
        resolve(messages);
      }
    });
    socket.on('error', reject);
  });
}

describe('sim-server', () => {
  it('greets a client with machines and backfilled history, then streams ticks', async () => {
    server = await startSimServer({ port: 0, host: '127.0.0.1', seed: 1, tickMs: 50, backfillSeconds: 120 });
    const [hello, tick] = await collect(server.url, 2);

    expect(hello?.type).toBe('hello');
    if (hello?.type !== 'hello') return;
    expect(hello.machines.map((m) => m.id)).toEqual(MACHINES.map((m) => m.id));
    expect(hello.history['CNC-01']?.length).toBeGreaterThanOrEqual(100);

    expect(tick?.type).toBe('tick');
    if (tick?.type !== 'tick') return;
    expect(tick.readings).toHaveLength(MACHINES.length);
  });

  it('serves a health check', async () => {
    server = await startSimServer({ port: 0, host: '127.0.0.1', backfillSeconds: 5 });
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, clients: 0 });
  });

  it('refuses origins outside the allow-list', async () => {
    server = await startSimServer({ port: 0, host: '127.0.0.1', backfillSeconds: 5, allowedOrigins: ['https://factory-twin.example'] });
    const refused = await new Promise<boolean>((resolve) => {
      const socket = new WebSocket(server!.url, { origin: 'https://evil.example' });
      socket.on('open', () => resolve(false));
      socket.on('error', () => resolve(true));
    });
    expect(refused).toBe(true);
  });
});
