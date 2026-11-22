import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FactorySimulator, TICK_MS } from '@factory-twin/shared';
import { useTwinStore } from '../state/store';
import { Timeline } from './Timeline';

const T0 = Date.UTC(2026, 10, 22, 8, 0, 0);
const initial = useTwinStore.getState();

beforeEach(() => {
    useTwinStore.setState(initial, true);
    const sim = new FactorySimulator({ seed: 2, incidentRate: 0 });
    for (const t of sim.backfill(T0 + 1800 * TICK_MS, 1800)) useTwinStore.getState().applyTick(t);
});

afterEach(() => vi.useRealTimers());

const slider = () => screen.getByRole('slider', { name: 'Time' });

describe('Timeline', () => {
    it('starts live, with the slider at the newest data', () => {
        render(<Timeline />);
        expect(slider()).toHaveAttribute('aria-valuetext', 'Live');
        expect(screen.getByRole('button', { name: 'Live' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '10×' })).toBeDisabled();
    });

    it('dragging back enters replay; Live returns', () => {
        render(<Timeline />);
        fireEvent.change(slider(), { target: { value: String(T0 + 600_000) } });
        expect(useTwinStore.getState().replay?.time).toBe(T0 + 600_000);
        expect(slider()).toHaveAttribute('aria-valuetext', expect.stringMatching(/ago$/));
        expect(screen.getByTestId('timeline')).toHaveClass('is-replay');

        fireEvent.click(screen.getByRole('button', { name: 'Live' }));
        expect(useTwinStore.getState().replay).toBeNull();
    });

    it('plays the last hour at the chosen speed', () => {
        vi.useFakeTimers();
        render(<Timeline />);
        fireEvent.click(screen.getByRole('button', { name: 'Replay the last hour' }));
        const start = useTwinStore.getState().replay!.time;
        fireEvent.click(screen.getByRole('button', { name: '60×' }));
        expect(screen.getByRole('button', { name: '60×' })).toHaveAttribute('aria-pressed', 'true');

        act(() => vi.advanceTimersByTime(1000));
        const moved = useTwinStore.getState().replay!.time - start;
        expect(moved).toBeGreaterThan(50_000);
        expect(moved).toBeLessThan(70_000);

        fireEvent.click(screen.getByRole('button', { name: 'Pause replay' }));
        const paused = useTwinStore.getState().replay!.time;
        act(() => vi.advanceTimersByTime(1000));
        expect(useTwinStore.getState().replay!.time).toBe(paused);
    });

    it('marks alerts on the track', () => {
        useTwinStore.setState({
            alerts: [
                { id: 'w', machineId: 'CNC-01', ts: T0 + 300_000, severity: 'warning', message: 'hot' },
                { id: 'e', machineId: 'PRS-01', ts: T0 + 900_000, severity: 'error', message: 'stopped' },
                { id: 'i', machineId: 'PRS-01', ts: T0 + 950_000, severity: 'info', message: 'ok' },
            ],
        });
        const { container } = render(<Timeline />);
        expect(container.querySelectorAll('.timeline__marker--warning')).toHaveLength(1);
        expect(container.querySelectorAll('.timeline__marker--error')).toHaveLength(1);
        expect(container.querySelectorAll('.timeline__marker')).toHaveLength(2); // recoveries are not marked
    });

    it('hides until there is history to replay', () => {
        useTwinStore.setState(initial, true);
        render(<Timeline />);
        expect(screen.queryByTestId('timeline')).toBeNull();
    });
});