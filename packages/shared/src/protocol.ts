import { INCIDENTS, type Alert, type Incident, type MachineSpec, type Reading } from './types.ts';

export const PROTOCOL_VERSION = 1;

/** Sensors report once per second. */
export const TICK_MS = 1000;

/** How much history the server keeps, and how much it sends to a new client. */
export const HISTORY_KEEP_SECONDS = 60 * 60;
export const HISTORY_SEND_SECONDS = 15 * 60;

/** Sent once, right after a client connects. */
export interface HelloMessage {
  type: 'hello';
  version: number;
  serverTime: number;
  machines: MachineSpec[];
  /** Recent readings per machine, oldest first. */
  history: Record<string, Reading[]>;
  /** Recent alerts, oldest first. */
  alerts: Alert[];
}

/** Sent every tick with one reading per machine. */
export interface TickMessage {
  type: 'tick';
  ts: number;
  readings: Reading[];
  alerts: Alert[];
}

export type ServerMessage = HelloMessage | TickMessage;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const isReading = (v: unknown): v is Reading =>
  isObject(v) &&
  typeof v.machineId === 'string' &&
  typeof v.ts === 'number' &&
  typeof v.temperature === 'number' &&
  typeof v.throughput === 'number' &&
  typeof v.vibration === 'number' &&
  (v.status === 'running' || v.status === 'warning' || v.status === 'error');

const isAlert = (v: unknown): v is Alert =>
  isObject(v) &&
  typeof v.id === 'string' &&
  typeof v.machineId === 'string' &&
  typeof v.ts === 'number' &&
  typeof v.message === 'string' &&
  (v.severity === 'info' || v.severity === 'warning' || v.severity === 'error');

/**
 * Parses and validates a raw WebSocket payload. Returns null for anything
 * malformed, so a bad message can never corrupt the client's state.
 */
export function parseServerMessage(raw: string): ServerMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data)) return null;

  if (data.type === 'tick') {
    if (typeof data.ts !== 'number' || !Array.isArray(data.readings) || !Array.isArray(data.alerts)) return null;
    if (!data.readings.every(isReading) || !data.alerts.every(isAlert)) return null;
    return data as unknown as TickMessage;
  }

  if (data.type === 'hello') {
    if (data.version !== PROTOCOL_VERSION) return null;
    if (!Array.isArray(data.machines) || !isObject(data.history) || !Array.isArray(data.alerts)) return null;
    const historyOk = Object.values(data.history).every((list) => Array.isArray(list) && list.every(isReading));
    if (!historyOk || !data.alerts.every(isAlert)) return null;
    return data as unknown as HelloMessage;
  }

  return null;
}


/** Sent by a client to start an incident on a machine (the demo's "Trigger incident" button). */
export interface InjectMessage {
  type: 'inject';
  machineId: string;
  incident: Incident;
}

export type ClientMessage = InjectMessage;

/** Parses and validates a message from a browser. Returns null for anything malformed. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > 1024) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data) || data.type !== 'inject') return null;
  if (typeof data.machineId !== 'string' || data.machineId.length > 64) return null;
  if (!(INCIDENTS as readonly unknown[]).includes(data.incident)) return null;
  return { type: 'inject', machineId: data.machineId, incident: data.incident as Incident };
}