import { create } from 'zustand';
import {
  ALERTS_SENT_ON_HELLO,
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
import { DEFAULT_REPLAY_SPEED, historyStart, shownAt, type Replay, type ReplaySpeed } from './replay';
import { initialViewFromBrowser, saveView, type ViewMode, type ViewState } from '../plan/view';
import { detectTier, initialQuality, readDeviceHints, stepDown, stepUp, type QualityState, type QualityTier } from '../scene/quality';

/** Where the data is coming from right now. */
export type ConnectionMode = 'connecting' | 'live' | 'reconnecting' | 'local';

export interface ConnectionState {
  mode: ConnectionMode;
  /** WebSocket URL when streaming from the server. */
  url?: string;
  /** Why the app is simulating locally, if it is. */
  reason?: string;
}

export const MAX_ALERTS = ALERTS_SENT_ON_HELLO;

export interface TwinState {
  machines: readonly MachineSpec[];
  /** Readings per machine, oldest first, capped at one hour. */
  history: Record<string, Reading[]>;
  latest: Record<string, Reading>;
  /**
   * What the scene, the counts and the details panel show: the latest readings
   * when live, or the readings at the replay time.
   */
  shown: Record<string, Reading>;
  /** Null when live. */
  replay: Replay | null;
  /** Alerts, oldest first. */
  alerts: Alert[];
  selectedId: string | null;
  hoveredId: string | null;
  connection: ConnectionState;
  lastUpdate: number | null;
  /** Starts an incident through the running data feed; null until one is running. */
  injectIncident: ((machineId: string, incident: Incident) => boolean) | null;
  /** Whether the hall-wide alert list is open. */
  alertsOpen: boolean;
  /** Alerts newer than this count as unread. Null until the first data arrives. */
  lastSeenAlertTs: number | null;
  /** Bumped by focusMachine(), so the camera flies again even to the machine already selected. */
  focusRequest: number;
  /** Graphics quality tier, and whether the app may change it by itself. */
  quality: QualityState;
  /** 3D scene or 2D floor plan. */
  view: ViewState;

  applyHello(msg: HelloMessage): void;
  applyTick(msg: TickMessage): void;
  select(id: string | null): void;
  hover(id: string | null): void;
  setConnection(connection: ConnectionState): void;
  setInjector(injector: TwinState['injectIncident']): void;
  /** Selects a machine and asks the camera to fly to it. */
  focusMachine(id: string): void;
  /** Opens or closes the alert list. Closing it marks every alert as read. */
  setAlertsOpen(open: boolean): void;
  markAlertsRead(): void;
  /** Shows the hall at `time`. Seeking to the newest data returns to live. */
  seek(time: number): void;
  /** Plays or pauses the replay. Playing while live starts at the beginning of the hour. */
  setReplayPlaying(playing: boolean): void;
  setReplaySpeed(speed: ReplaySpeed): void;
  goLive(): void;
  /** Moves a playing replay forward by `ms` of wall-clock time (times the speed). */
  advanceReplay(ms: number): void;
  /** Fixes the quality tier, or with 'auto' hands it back to the app. */
  setQuality(choice: QualityTier | 'auto'): void;
  /** Called when the frame rate drops or recovers; ignored unless quality is automatic. */
  adaptQuality(direction: 'down' | 'up'): void;
  /** Switches between 3D and the floor plan, and remembers the choice. 3D is refused without WebGL. */
  setView(mode: ViewMode): void;
  /** The 3D view failed: show the floor plan and tell the user why. */
  fallBackTo2D(reason: string): void;
  dismissViewNotice(): void;
}

const appendCapped = <T>(list: readonly T[], items: readonly T[], cap: number): T[] => {
  const next = list.concat(items);
  return next.length > cap ? next.slice(next.length - cap) : next;
};

/** Keeps the previous object when every machine shows the same reading, so nothing re-renders needlessly. */
const sameShown = (a: Record<string, Reading>, b: Record<string, Reading>): boolean => {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === b[k]);
};

type ReplayFields = Pick<TwinState, 'replay' | 'shown'>;

/** Replay state for showing `time`, or live state if `time` has reached the newest data. */
function replayAt(state: TwinState, time: number, patch: Partial<Replay> = {}): ReplayFields {
  const end = state.lastUpdate;
  const start = historyStart(state.history);
  if (end === null || start === null || time >= end) return { replay: null, shown: state.latest };
  const t = Math.max(start, time);
  const next = shownAt(state.history, t);
  return {
    replay: { time: t, playing: state.replay?.playing ?? false, speed: state.replay?.speed ?? DEFAULT_REPLAY_SPEED, ...patch },
    shown: sameShown(state.shown, next) ? state.shown : next,
  };
}

const newestAlertTs = (state: Pick<TwinState, 'alerts' | 'lastSeenAlertTs'>): number =>
    Math.max(state.lastSeenAlertTs ?? 0, state.alerts.at(-1)?.ts ?? 0);

export const useTwinStore = create<TwinState>()((set) => ({
  machines: MACHINES,
  history: {},
  latest: {},
  shown: {},
  replay: null,
  alerts: [],
  selectedId: null,
  hoveredId: null,
  connection: { mode: 'connecting' },
  lastUpdate: null,
  injectIncident: null,
  alertsOpen: false,
  lastSeenAlertTs: null,
  focusRequest: 0,
  quality: initialQuality(),
  view: initialViewFromBrowser(),

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
        // Alerts that arrive with a hello are history, not news: a fresh start,
        // a reconnect or a switch to the browser simulator all start "read".
        const newestAlert = msg.alerts.reduce((max, a) => Math.max(max, a.ts), 0);
        return {
          machines: msg.machines,
          history,
          latest,
          // New history replaces the old, so any replay ends.
          shown: latest,
          replay: null,
          alerts: msg.alerts.slice(-MAX_ALERTS),
          selectedId: state.selectedId && known.has(state.selectedId) ? state.selectedId : null,
          lastUpdate: msg.serverTime,
          lastSeenAlertTs: Math.max(state.lastSeenAlertTs ?? 0, newestAlert),
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
        const next = { history, latest, alerts, lastUpdate: msg.ts };
        if (!state.replay) return { ...next, shown: latest };
        // Replaying: keep showing the past, but not before the oldest reading still kept.
        const start = historyStart(history);
        if (start !== null && state.replay.time < start) return { ...next, ...replayAt({ ...state, ...next }, start) };
        return next;
      }),

  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
  setConnection: (connection) => set({ connection }),
  setInjector: (injector) => set({ injectIncident: injector }),
  focusMachine: (id) => set((state) => ({ selectedId: id, focusRequest: state.focusRequest + 1 })),
  setAlertsOpen: (open) =>
      set((state) => (open ? { alertsOpen: true } : { alertsOpen: false, lastSeenAlertTs: newestAlertTs(state) })),
  markAlertsRead: () => set((state) => ({ lastSeenAlertTs: newestAlertTs(state) })),

  seek: (time) => set((state) => replayAt(state, time)),
  setReplayPlaying: (playing) =>
      set((state) => {
        if (state.replay) return { replay: { ...state.replay, playing } };
        if (!playing) return {};
        return replayAt(state, historyStart(state.history) ?? 0, { playing: true });
      }),
  setReplaySpeed: (speed) => set((state) => (state.replay ? { replay: { ...state.replay, speed } } : {})),
  goLive: () => set((state) => ({ replay: null, shown: state.latest })),
  advanceReplay: (ms) =>
      set((state) => {
        const r = state.replay;
        if (!r?.playing) return {};
        return replayAt(state, r.time + ms * r.speed);
      }),

  setQuality: (choice) =>
      set((state) =>
          choice === 'auto'
              ? { quality: { ...state.quality, auto: true, ceiling: detectTier(readDeviceHints()) } }
              : { quality: { tier: choice, auto: false, ceiling: state.quality.ceiling } },
      ),
  adaptQuality: (direction) =>
      set((state) => {
        const q = state.quality;
        if (!q.auto) return {};
        const tier = direction === 'down' ? stepDown(q.tier) : stepUp(q.tier, q.ceiling);
        return tier === q.tier ? {} : { quality: { ...q, tier } };
      }),

  setView: (mode) =>
      set((state) => {
        if (mode === '3d' && !state.view.webgl) return {};
        saveView(mode);
        return { view: { ...state.view, mode, notice: null } };
      }),
  // Not saved: a crash is no reason to stay in 2D next time.
  fallBackTo2D: (reason) => set((state) => ({ view: { ...state.view, mode: '2d', notice: reason } })),
  dismissViewNotice: () => set((state) => ({ view: { ...state.view, notice: null } })),
}));

/** Status of one machine as shown (live or replayed); components re-render only when it changes. */
export const useMachineStatus = (id: string): MachineStatus =>
    useTwinStore((s) => s.shown[id]?.status ?? 'offline');

export const selectStatusCounts = (state: Pick<TwinState, 'machines' | 'shown'>): Record<MachineStatus, number> => {
  const counts: Record<MachineStatus, number> = { running: 0, warning: 0, error: 0, offline: 0 };
  for (const m of state.machines) counts[state.shown[m.id]?.status ?? 'offline']++;
  return counts;
};

/** The moment on screen, to the second: the replay time, or the newest data when live. */
export const selectViewTime = (state: Pick<TwinState, 'replay' | 'lastUpdate'>): number | null =>
    state.replay ? Math.floor(state.replay.time / 1000) * 1000 : state.lastUpdate;