import { describe, expect, it } from 'vitest';
import { MACHINES, type Reading } from '@factory-twin/shared';
import { DEMO_INCIDENTS, pickIncident } from './incident';

const reading = (machineId: string, status: Reading['status']): Reading => ({
    machineId,
    ts: 0,
    temperature: 40,
    throughput: 10,
    vibration: 2,
    status,
});

describe('pickIncident', () => {
    it('prefers a machine that is running normally', () => {
        const latest = Object.fromEntries(MACHINES.map((m) => [m.id, reading(m.id, m.id === 'SCN-01' ? 'running' : 'error')]));
        for (const r of [0, 0.3, 0.99]) expect(pickIncident(MACHINES, latest, () => r)?.machineId).toBe('SCN-01');
    });

    it('falls back to any machine when none is running', () => {
        const latest = Object.fromEntries(MACHINES.map((m) => [m.id, reading(m.id, 'warning')]));
        expect(pickIncident(MACHINES, latest, () => 0)?.machineId).toBe(MACHINES[0]!.id);
    });

    it('only starts incidents that show quickly', () => {
        const picks = [0, 0.5, 0.99].map((r) => pickIncident(MACHINES, {}, () => r)!.incident);
        expect(picks.every((i) => DEMO_INCIDENTS.includes(i))).toBe(true);
        expect(new Set(picks).size).toBe(2);
    });

    it('returns null without machines', () => {
        expect(pickIncident([], {})).toBeNull();
    });
});