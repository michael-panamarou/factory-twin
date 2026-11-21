import { create } from 'zustand';
import {
  HISTORY_KEEP_SECONDS,
  MACHINES,
  type Alert,
  type HelloMessage,
  type Incident,
  type MachineSpec,
  type MachineStatus,
  type Reading,
  type TickMessage,
} from '@factory-twin/shared';

/** Where the data is coming from right now. */
export type ConnectionMode = 'connecting' | 'live' | 'reconnecting' | 'local';

export interface ConnectionState {
  mode: ConnectionMode;
  /** WebSocket URL when streaming from the server. */
  url?: string;
  /** Why the app is simulating locally, if it is. */
  reason?: string;
}

export const MAX_ALERTS = 200;

export interface TwinState {
  machines: readonly MachineSpec[];
  /** Readings per machine, oldest first, capped at one hour. */
  history: Record<string, Reading[]>;
  latest: Record<string, Reading>;
  /** Alerts, oldest first. */
  alerts: Alert[];
  selectedId: string | null;
  hoveredId: string | null;
  connection: ConnectionState;
  lastUpdate: number | null;
  /** Starts an incident through the running data feed; null until one is running. */
  injectIncident: ((machineId: string, incident: Incident) => boolean) | null;

  applyHello(msg: HelloMessage): void;
  applyTick(msg: TickMessage): void;
  select(id: string | null): void;
  hover(id: string | null): void;
  setConnection(connection: ConnectionState): void;
  setInjector(injector: TwinState['injectIncident']): void;
}

const appendCapped = <T>(list: readonly T[], items: readonly T[], cap: number): T[] => {
  const next = list.concat(items);
  return next.length > cap ? next.slice(next.length - cap) : next;
};

export const useTwinStore = create<TwinState>()((set) => ({
  machines: MACHINES,
  history: {},
  latest: {},
  alerts: [],
  selectedId: null,
  hoveredId: null,
  connection: { mode: 'connecting' },
  lastUpdate: null,
  injectIncident: null,

  applyHello: (msg) =>
      set((state) => {
        const history: Record<string, Reading[]> = {};
        const latest: Record<string, Reading> = {};
        for (const [id, list] of Object.entries(msg.history)) {
          history[id] = list.slice(-HISTORY_KEEP_SECONDS);
          const last = list.at(-1);
          if (last) latest[id] = last;
        }
        const known = new Set(msg.machines.map((m) => m.id));
        return {
          machines: msg.machines,
          history,
          latest,
          alerts: msg.alerts.slice(-MAX_ALERTS),
          selectedId: state.selectedId && known.has(state.selectedId) ? state.selectedId : null,
          lastUpdate: msg.serverTime,
        };
      }),

  applyTick: (msg) =>
      set((state) => {
        const history = { ...state.history };
        const latest = { ...state.latest };
        for (const reading of msg.readings) {
          history[reading.machineId] = appendCapped(history[reading.machineId] ?? [], [reading], HISTORY_KEEP_SECONDS);
          latest[reading.machineId] = reading;
        }
        const alerts = msg.alerts.length > 0 ? appendCapped(state.alerts, msg.alerts, MAX_ALERTS) : state.alerts;
        return { history, latest, alerts, lastUpdate: msg.ts };
      }),

  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
  setConnection: (connection) => set({ connection }),
  setInjector: (injector) => set({ injectIncident: injector }),
}));

/** Status of one machine; components re-render only when it changes. */
export const useMachineStatus = (id: string): MachineStatus =>
    useTwinStore((s) => s.latest[id]?.status ?? 'offline');

export const selectStatusCounts = (state: Pick<TwinState, 'machines' | 'latest'>): Record<MachineStatus, number> => {
  const counts: Record<MachineStatus, number> = { running: 0, warning: 0, error: 0, offline: 0 };
  for (const m of state.machines) counts[state.latest[m.id]?.status ?? 'offline']++;
  return counts;
};