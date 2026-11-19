import {
  FactorySimulator,
  HISTORY_SEND_SECONDS,
  PROTOCOL_VERSION,
  TICK_MS,
  parseServerMessage,
  type HelloMessage,
  type Reading,
  type TickMessage,
} from '@factory-twin/shared';
import type { ConnectionState } from '../state/store';

export interface TelemetrySink {
  applyHello(msg: HelloMessage): void;
  applyTick(msg: TickMessage): void;
  setConnection(connection: ConnectionState): void;
}

export interface TelemetryOptions {
  /** WebSocket URL of the simulator server. Empty or undefined: simulate in the browser. */
  url?: string;
  /** Force the in-browser simulator even when a URL is configured. */
  forceLocal?: boolean;
  /** How long to wait for the first message before falling back to local simulation. */
  connectTimeoutMs?: number;
  /** Reconnect attempts after a live connection drops, before falling back. */
  maxReconnects?: number;
  /** Injected for tests. */
  WebSocketImpl?: typeof WebSocket;
  now?: () => number;
}

/**
 * Starts the data feed and returns a function that stops it.
 *
 * It streams from the WebSocket server when one is configured and reachable.
 * Otherwise it runs the same simulator in the browser, so the static demo
 * works without a backend.
 */
export function startTelemetry(sink: TelemetrySink, options: TelemetryOptions = {}): () => void {
  const {
    url,
    forceLocal = false,
    connectTimeoutMs = 4000,
    maxReconnects = 5,
    WebSocketImpl = globalThis.WebSocket,
    now = Date.now,
  } = options;

  let stopped = false;
  let socket: WebSocket | null = null;
  let localTimer: ReturnType<typeof setInterval> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let everLive = false;
  let reconnects = 0;

  const startLocal = (reason: string) => {
    if (stopped || localTimer) return;
    socket?.close();
    socket = null;
    const sim = new FactorySimulator({ seed: now() >>> 0 });
    const end = now();
    const ticks = sim.backfill(end, HISTORY_SEND_SECONDS);
    const history: Record<string, Reading[]> = Object.fromEntries(sim.machines.map((m) => [m.id, []]));
    for (const t of ticks) for (const r of t.readings) history[r.machineId]?.push(r);
    sink.applyHello({
      type: 'hello',
      version: PROTOCOL_VERSION,
      serverTime: end,
      machines: [...sim.machines],
      history,
      alerts: ticks.flatMap((t) => t.alerts).slice(-100),
    });
    sink.setConnection({ mode: 'local', reason });
    localTimer = setInterval(() => sink.applyTick(sim.tick(now())), TICK_MS);
  };

  const connect = () => {
    if (stopped || !url) return;
    sink.setConnection({ mode: everLive ? 'reconnecting' : 'connecting', url });

    let ws: WebSocket;
    try {
      ws = new WebSocketImpl(url);
    } catch {
      startLocal('The server URL is not valid');
      return;
    }
    socket = ws;
    let gotMessage = false;

    connectTimer = setTimeout(() => {
      if (!gotMessage) ws.close();
    }, connectTimeoutMs);

    ws.onmessage = (event: MessageEvent) => {
      const msg = typeof event.data === 'string' ? parseServerMessage(event.data) : null;
      if (!msg) return;
      if (msg.type === 'hello') {
        gotMessage = true;
        everLive = true;
        reconnects = 0;
        if (connectTimer) clearTimeout(connectTimer);
        sink.applyHello(msg);
        sink.setConnection({ mode: 'live', url });
      } else if (gotMessage) {
        sink.applyTick(msg);
      }
    };

    ws.onclose = () => {
      if (connectTimer) clearTimeout(connectTimer);
      if (stopped || socket !== ws) return;
      socket = null;
      if (!everLive) {
        startLocal('The simulator server could not be reached');
        return;
      }
      if (reconnects >= maxReconnects) {
        startLocal('The connection to the simulator server was lost');
        return;
      }
      const delay = Math.min(15_000, 1000 * 2 ** reconnects);
      reconnects++;
      sink.setConnection({ mode: 'reconnecting', url });
      retryTimer = setTimeout(connect, delay);
    };
  };

  if (forceLocal || !url || !WebSocketImpl) startLocal(forceLocal ? 'Local simulation was requested' : 'No simulator server is configured');
  else connect();

  return () => {
    stopped = true;
    if (localTimer) clearInterval(localTimer);
    if (retryTimer) clearTimeout(retryTimer);
    if (connectTimer) clearTimeout(connectTimer);
    socket?.close();
    socket = null;
  };
}

/** Reads `?source=local` or `?source=live` from the page URL. */
export function sourceFromLocation(search: string): 'local' | 'live' | null {
  const value = new URLSearchParams(search).get('source');
  return value === 'local' || value === 'live' ? value : null;
}
