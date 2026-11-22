import { describe, expect, it } from 'vitest';
import type { Reading } from '@factory-twin/shared';
import { historyStart, historyUntil, indexAt, readingAt, shownAt } from './replay';

const r = (machineId: string, ts: number): Reading => ({ machineId, ts, temperature: 40, throughput: 10, vibration: 2, status: 'running' });
const list = [r('A', 1000), r('A', 2000), r('A', 3000), r('A', 4000)];

describe('indexAt / readingAt', () => {
    it('finds the last reading at or before a time', () => {
        expect(indexAt(list, 2000)).toBe(1);
        expect(indexAt(list, 2999)).toBe(1);
        expect(indexAt(list, 9999)).toBe(3);
        expect(readingAt(list, 3500)?.ts).toBe(3000);
    });

    it('returns nothing before the first reading or for an empty list', () => {
        expect(indexAt(list, 999)).toBe(-1);
        expect(readingAt(list, 999)).toBeUndefined();
        expect(indexAt([], 5000)).toBe(-1);
    });
});

describe('historyUntil', () => {
    it('cuts off readings after the time', () => {
        expect(historyUntil(list, 2500).map((x) => x.ts)).toEqual([1000, 2000]);
    });

    it('returns the same array when nothing is cut, so memoised charts do not redraw', () => {
        expect(historyUntil(list, 5000)).toBe(list);
        expect(historyUntil(list, null)).toBe(list);
    });
});

describe('shownAt and historyStart', () => {
    const history = { A: list, B: [r('B', 2500), r('B', 3500)] };

    it('shows each machine as it was at the time', () => {
        const shown = shownAt(history, 3000);
        expect(shown.A?.ts).toBe(3000);
        expect(shown.B?.ts).toBe(2500);
    });

    it('leaves out a machine that had no data yet', () => {
        expect(Object.keys(shownAt(history, 1500))).toEqual(['A']);
    });

    it('starts the replayable range where every machine has data', () => {
        expect(historyStart(history)).toBe(2500);
        expect(historyStart({})).toBeNull();
    });
});