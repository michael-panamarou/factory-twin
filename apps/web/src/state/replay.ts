import type { Reading } from '@factory-twin/shared';

/** Playback speeds offered by the timeline: real time, 10× and one minute per second. */
export const REPLAY_SPEEDS = [1, 10, 60] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];
export const DEFAULT_REPLAY_SPEED: ReplaySpeed = 10;

/** Replay state. When it is null the app shows live data. */
export interface Replay {
    /** The moment being shown, Unix ms. */
    time: number;
    playing: boolean;
    speed: ReplaySpeed;
}

/**
 * Index of the last reading at or before `ts`, or -1 if every reading is later.
 * Readings are oldest first, so this is a binary search.
 */
export function indexAt(list: readonly Reading[], ts: number): number {
    let lo = 0;
    let hi = list.length - 1;
    let found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid]!.ts <= ts) {
            found = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return found;
}

/** The reading a machine reported at `ts` (the last one at or before it). */
export const readingAt = (list: readonly Reading[], ts: number): Reading | undefined => list[indexAt(list, ts)];

/** Readings up to and including `ts`. Returns the same array when nothing is cut. */
export function historyUntil(list: readonly Reading[], ts: number | null): readonly Reading[] {
    if (ts === null) return list;
    const i = indexAt(list, ts);
    return i === list.length - 1 ? list : list.slice(0, i + 1);
}

/** What every machine reported at `ts`. */
export function shownAt(history: Readonly<Record<string, readonly Reading[]>>, ts: number): Record<string, Reading> {
    const shown: Record<string, Reading> = {};
    for (const [id, list] of Object.entries(history)) {
        const r = readingAt(list, ts);
        if (r) shown[id] = r;
    }
    return shown;
}

/** Earliest moment every machine has data for: the start of the replayable range. */
export function historyStart(history: Readonly<Record<string, readonly Reading[]>>): number | null {
    let start: number | null = null;
    for (const list of Object.values(history)) {
        const first = list[0]?.ts;
        if (first !== undefined) start = start === null ? first : Math.max(start, first);
    }
    return start;
}