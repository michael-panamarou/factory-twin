import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MACHINES, PROTOCOL_VERSION, type Alert } from '@factory-twin/shared';
import { useTwinStore } from '../state/store';
import { AlertsButton } from './AlertsButton';
import { AlertsPanel } from './AlertsPanel';

const T0 = Date.UTC(2026, 10, 22, 9, 0, 0);
const initial = useTwinStore.getState();

const alert = (id: string, machineId: string, secondsAfter: number, severity: Alert['severity'], message: string): Alert => ({
    id,
    machineId,
    ts: T0 + secondsAfter * 1000,
    severity,
    message,
});

const renderBoth = () =>
    render(
        <>
            <AlertsButton />
            <AlertsPanel />
        </>,
    );

beforeEach(() => {
    useTwinStore.setState(initial, true);
    // One old alert arrives with the hello (read), then two new ones with ticks (unread).
    useTwinStore.getState().applyHello({
        type: 'hello',
        version: PROTOCOL_VERSION,
        serverTime: T0,
        machines: [...MACHINES],
        history: {},
        alerts: [alert('old', 'CNV-01', 0, 'warning', 'Old warning')],
    });
    useTwinStore.getState().applyTick({
        type: 'tick',
        ts: T0 + 60_000,
        readings: [],
        alerts: [alert('hot', 'CNC-01', 30, 'warning', 'Temperature high'), alert('stop', 'PRS-01', 60, 'error', 'Machine stopped: no output')],
    });
});

describe('Alerts button and list', () => {
    it('shows the number of unread alerts on the button', () => {
        renderBoth();
        expect(screen.getByRole('button', { name: 'Alerts, 2 new' })).toBeInTheDocument();
        expect(screen.getByTestId('alerts-badge')).toHaveTextContent('2');
    });

    it('opens a list of every alert, newest first, and filters it', () => {
        renderBoth();
        fireEvent.click(screen.getByRole('button', { name: /^Alerts/ }));
        const panel = screen.getByTestId('alerts-panel');
        expect(panel).toHaveAttribute('aria-hidden', 'false');

        const rows = within(panel).getAllByRole('button', { name: /Jump to machine/ });
        expect(rows.map((r) => r.dataset.machine)).toEqual(['PRS-01', 'CNC-01', 'CNV-01']);
        expect(rows[0]).toHaveAccessibleName(/^Error, new: Hydraulic press \(PRS-01\)/);
        expect(rows[2]).toHaveAccessibleName(/^Warning: /); // the old one is read

        fireEvent.click(within(panel).getByRole('button', { name: /^Errors/ }));
        expect(within(panel).getAllByRole('button', { name: /Jump to machine/ })).toHaveLength(1);
    });

    it('jumps to the machine: selects it and asks the camera to fly there', () => {
        useTwinStore.getState().setAlertsOpen(true);
        renderBoth();
        const before = useTwinStore.getState().focusRequest;
        fireEvent.click(screen.getByRole('button', { name: /CNC-01.*Jump to machine/ }));
        expect(useTwinStore.getState().selectedId).toBe('CNC-01');
        expect(useTwinStore.getState().focusRequest).toBe(before + 1);
    });

    it('marks everything as read, by button or by closing the list', () => {
        useTwinStore.getState().setAlertsOpen(true);
        renderBoth();
        fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
        expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();

        useTwinStore.getState().applyTick({ type: 'tick', ts: T0 + 90_000, readings: [], alerts: [alert('jam', 'SCN-01', 90, 'warning', 'Jam')] });
        fireEvent.click(screen.getByRole('button', { name: 'Close alerts' }));
        expect(useTwinStore.getState().alertsOpen).toBe(false);
        expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument();
    });

    it('suggests the incident button when a filter is empty', () => {
        useTwinStore.setState({ alerts: [] });
        useTwinStore.getState().setAlertsOpen(true);
        renderBoth();
        expect(screen.getByText(/No alerts yet/)).toBeInTheDocument();
    });
});