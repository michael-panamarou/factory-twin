import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  FactorySimulator,
  HISTORY_KEEP_SECONDS,
  HISTORY_SEND_SECONDS,
  PROTOCOL_VERSION,
  TICK_MS,
  type Alert,
  type HelloMessage,
  type Reading,
} from '@factory-twin/shared';

export interface SimServerOptions {
  /** 0 picks a free port (handy in tests). */
  port?: number;
  host?: string;
  seed?: number;
  incidentRate?: number;
  tickMs?: number;
  /** Comma-separated list of allowed browser origins; empty allows all. */
  allowedOrigins?: string[];
  /** Seconds of history simulated at start-up so charts are not empty. */
  backfillSeconds?: number;
  log?: (msg: string) => void;
}

export interface SimServer {
  port: number;
  url: string;
  clientCount(): number;
  close(): Promise<void>;
}

const MAX_ALERTS_KEPT = 500;
const ALERTS_SENT_ON_HELLO = 100;

export async function startSimServer(options: SimServerOptions = {}): Promise<SimServer> {
  const {
    port = 8787,
    host = '0.0.0.0',
    seed = Date.now() >>> 0,
    incidentRate = 1,
    tickMs = TICK_MS,
    allowedOrigins = [],
    backfillSeconds = HISTORY_SEND_SECONDS,
    log = () => {},
  } = options;

  const sim = new FactorySimulator({ seed, incidentRate });
  const history = new Map<string, Reading[]>(sim.machines.map((m) => [m.id, []]));
  const alerts: Alert[] = [];
  const startedAt = Date.now();

  const record = (readings: Reading[], newAlerts: Alert[]) => {
    for (const r of readings) {
      const list = history.get(r.machineId);
      if (!list) continue;
      list.push(r);
      // Trim in batches rather than shifting one element every tick.
      if (list.length > HISTORY_KEEP_SECONDS + 60) list.splice(0, list.length - HISTORY_KEEP_SECONDS);
    }
    alerts.push(...newAlerts);
    if (alerts.length > MAX_ALERTS_KEPT + 50) alerts.splice(0, alerts.length - MAX_ALERTS_KEPT);
  };

  for (const t of sim.backfill(Date.now(), backfillSeconds)) record(t.readings, t.alerts);

  const helloFor = (): HelloMessage => {
    const cutoff = Date.now() - HISTORY_SEND_SECONDS * 1000;
    return {
      type: 'hello',
      version: PROTOCOL_VERSION,
      serverTime: Date.now(),
      machines: [...sim.machines],
      history: Object.fromEntries([...history].map(([id, list]) => [id, list.filter((r) => r.ts >= cutoff)])),
      alerts: alerts.slice(-ALERTS_SENT_ON_HELLO),
    };
  };

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ ok: true, clients: wss.clients.size, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) }));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Factory Twin sensor simulator. Connect a WebSocket to /ws.\n');
  });

  const wss = new WebSocketServer({
    server: http,
    path: '/ws',
    verifyClient: ({ origin }: { origin: string }) => allowedOrigins.length === 0 || allowedOrigins.includes(origin),
  });

  const alive = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (socket) => {
    alive.set(socket, true);
    socket.on('pong', () => alive.set(socket, true));
    socket.on('error', () => socket.terminate());
    socket.send(JSON.stringify(helloFor()));
    log(`client connected (${wss.clients.size} total)`);
    socket.on('close', () => log(`client left (${wss.clients.size} total)`));
  });

  const tickTimer = setInterval(() => {
    const tick = sim.tick(Date.now());
    record(tick.readings, tick.alerts);
    if (wss.clients.size === 0) return;
    const payload = JSON.stringify(tick);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  }, tickMs);

  // Drop clients that stopped answering pings (closed laptops, dead proxies).
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (alive.get(client) === false) {
        client.terminate();
        continue;
      }
      alive.set(client, false);
      client.ping();
    }
  }, 30_000);

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(port, host, () => resolve());
  });

  const actualPort = (http.address() as AddressInfo).port;
  log(`listening on ws://localhost:${actualPort}/ws (seed ${seed})`);

  return {
    port: actualPort,
    url: `ws://localhost:${actualPort}/ws`,
    clientCount: () => wss.clients.size,
    close: async () => {
      clearInterval(tickTimer);
      clearInterval(heartbeat);
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
