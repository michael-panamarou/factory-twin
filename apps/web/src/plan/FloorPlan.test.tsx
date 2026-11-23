import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { FactorySimulator, MACHINES, TICK_MS } from '@factory-twin/shared';
import { useTwinStore } from '../state/store';
import { FloorPlan } from './FloorPlan';

const T0 = Date.UTC(2026, 10, 23, 9, 0, 0);
const initial = useTwinStore.getState();
let sim: FactorySimulator;

beforeEach(() => {
    useTwinStore.setState(initial, true);
    sim = new FactorySimulator({ seed: 6, incidentRate: 0 });
    for (const t of sim.backfill(T0, 30)) useTwinStore.getState().applyTick(t);
});

const plan = () => within(screen.getByRole('group', { name: 'Floor plan of the hall' }));

describe('FloorPlan', () => {
    it('shows every machine as a button with its status and temperature', () => {
        render(<FloorPlan />);
        const buttons = plan().getAllByRole('button');
        expect(buttons).toHaveLength(MACHINES.length);
        const temp = useTwinStore.getState().shown['CNC-01']!.temperature.toFixed(1);
        expect(plan().getByRole('button', { name: `CNC mill 1 (CNC-01): Running, ${temp} °C` })).toBeInTheDocument();
    });

    it('selects a machine on click, and clears the selection on empty floor', () => {
        render(<FloorPlan />);
        fireEvent.click(plan().getByRole('button', { name: /^Hydraulic press/ }));
        expect(useTwinStore.getState().selectedId).toBe('PRS-01');
        expect(plan().getByRole('button', { name: /^Hydraulic press/ })).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByTestId('floorplan'));
        expect(useTwinStore.getState().selectedId).toBeNull();
    });

    it('follows the live status', () => {
        render(<FloorPlan />);
        sim.inject('PRS-01', 'fault');
        act(() => {
            for (let i = 0; i < 8; i++) useTwinStore.getState().applyTick(sim.tick(T0 + i * TICK_MS));
        });
        const press = plan().getByRole('button', { name: /^Hydraulic press/ });
        expect(press).toHaveAccessibleName(/: Error/);
        expect(press).toHaveClass('status-error');
    });
});