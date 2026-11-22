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

  it('compresses messages, since the hello carries an hour of history', async () => {
    server = await startSimServer({ port: 0, host: '127.0.0.1', backfillSeconds: 5 });
    const extensions = await new Promise<string>((resolve, reject) => {
      const socket = new WebSocket(server!.url);
      socket.on('open', () => {
        resolve(socket.extensions);
        socket.close();
      });
      socket.on('error', reject);
    });
    expect(extensions).toContain('permessage-deflate');
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


describe('incident injection', () => {
  /** Opens a socket, waits for hello, and records the PRS-01 status of every tick. */
  async function connect(url: string) {
    const socket = new WebSocket(url);
    const statuses: string[] = [];
    await new Promise<void>((resolve, reject) => {
      socket.on('message', (data) => {
        const msg = parseServerMessage(data.toString());
        if (msg?.type === 'hello') resolve();
        if (msg?.type === 'tick') statuses.push(msg.readings.find((r) => r.machineId === 'PRS-01')!.status);
      });
      socket.on('error', reject);
    });
    return { socket, statuses };
  }

  const waitFor = async (check: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!check()) {
      if (Date.now() > end) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  it('starts an incident a client asks for', async () => {
    server = await startSimServer({ port: 0, host: '127.0.0.1', seed: 3, tickMs: 50, incidentRate: 0, backfillSeconds: 5 });
    const { socket, statuses } = await connect(server.url);
    socket.send(JSON.stringify({ type: 'inject', machineId: 'PRS-01', incident: 'fault' }));
    await waitFor(() => statuses.includes('error'));
    socket.close();
  });

  it('ignores injection when it is switched off, and junk messages always', async () => {
    server = await startSimServer({ port: 0, host: '127.0.0.1', seed: 3, tickMs: 50, incidentRate: 0, backfillSeconds: 5, allowInject: false });
    const { socket, statuses } = await connect(server.url);
    socket.send('garbage');
    socket.send(JSON.stringify({ type: 'inject', machineId: 'PRS-01', incident: 'fault' }));
    await waitFor(() => statuses.length >= 15);
    expect(statuses.every((s) => s === 'running')).toBe(true);
    socket.close();
  });
});