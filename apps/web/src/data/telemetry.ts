import {
  ALERTS_SENT_ON_HELLO,
  FactorySimulator,
  HISTORY_SEND_SECONDS,
  PROTOCOL_VERSION,
  TICK_MS,
  parseServerMessage,
  type HelloMessage,
  type Incident,
  type InjectMessage,
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
  /** How long to wait for the connection to open before falling back to local simulation. */
  connectTimeoutMs?: number;
  /**
   * Once open, how long to wait for the first message. It carries an hour of
   * history, so give slow connections and busy machines time.
   */
  helloTimeoutMs?: number;
  /** Reconnect attempts after a live connection drops, before falling back. */
  maxReconnects?: number;
  /** Injected for tests. */
  WebSocketImpl?: typeof WebSocket;
  now?: () => number;
}

/** A running data feed. */
export interface Telemetry {
  stop(): void;
  /**
   * Starts an incident on a machine, in the browser simulator or on the server.
   * Returns false when there is nothing to send it to yet (still connecting).
   */
  inject(machineId: string, incident: Incident): boolean;
}

/**
 * Starts the data feed.
 *
 * It streams from the WebSocket server when one is configured and reachable.
 * Otherwise it runs the same simulator in the browser, so the static demo
 * works without a backend.
 */
export function startTelemetry(sink: TelemetrySink, options: TelemetryOptions = {}): Telemetry {
  const {
    url,
    forceLocal = false,
    connectTimeoutMs = 4000,
    helloTimeoutMs = 15_000,
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
  let live = false;
  let reconnects = 0;
  let localSim: FactorySimulator | null = null;

  const startLocal = (reason: string) => {
    if (stopped || localTimer) return;
    socket?.close();
    socket = null;
    const sim = new FactorySimulator({ seed: now() >>> 0 });
    localSim = sim;
    live = false;
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
      alerts: ticks.flatMap((t) => t.alerts).slice(-ALERTS_SENT_ON_HELLO),
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

    const giveUpAfter = (ms: number) => {
      if (connectTimer) clearTimeout(connectTimer);
      connectTimer = setTimeout(() => {
        if (!gotMessage) ws.close();
      }, ms);
    };
    giveUpAfter(connectTimeoutMs);
    ws.onopen = () => giveUpAfter(helloTimeoutMs);

    ws.onmessage = (event: MessageEvent) => {
      const msg = typeof event.data === 'string' ? parseServerMessage(event.data) : null;
      if (!msg) return;
      if (msg.type === 'hello') {
        gotMessage = true;
        everLive = true;
        live = true;
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
      live = false;
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

  return {
    stop: () => {
      stopped = true;
      if (localTimer) clearInterval(localTimer);
      if (retryTimer) clearTimeout(retryTimer);
      if (connectTimer) clearTimeout(connectTimer);
      socket?.close();
      socket = null;
    },
    inject: (machineId, incident) => {
      if (stopped) return false;
      if (localSim) {
        if (!localSim.machines.some((m) => m.id === machineId)) return false;
        localSim.inject(machineId, incident);
        return true;
      }
      if (live && socket) {
        const msg: InjectMessage = { type: 'inject', machineId, incident };
        socket.send(JSON.stringify(msg));
        return true;
      }
      return false;
    },
  };
}

/** Reads `?source=local` or `?source=live` from the page URL. */
export function sourceFromLocation(search: string): 'local' | 'live' | null {
  const value = new URLSearchParams(search).get('source');
  return value === 'local' || value === 'live' ? value : null;
}