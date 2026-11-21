import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FactorySimulator } from '@factory-twin/shared';
import { useTwinStore } from '../state/store';
import { TriggerIncidentButton } from './TriggerIncidentButton';

const initial = useTwinStore.getState();

beforeEach(() => {
    useTwinStore.setState(initial, true);
    useTwinStore.getState().applyTick(new FactorySimulator({ seed: 1, incidentRate: 0 }).tick(Date.UTC(2026, 10, 21)));
});

describe('TriggerIncidentButton', () => {
    it('is disabled until a data feed is running', () => {
        render(<TriggerIncidentButton />);
        expect(screen.getByRole('button', { name: 'Trigger incident' })).toBeDisabled();
    });

    it('starts an incident and selects that machine', () => {
        const inject = vi.fn(() => true);
        useTwinStore.setState({ injectIncident: inject, connection: { mode: 'local' } });
        render(<TriggerIncidentButton />);

        fireEvent.click(screen.getByRole('button', { name: 'Trigger incident' }));

        expect(inject).toHaveBeenCalledTimes(1);
        const [machineId, incident] = inject.mock.calls[0] as unknown as [string, string];
        expect(['fault', 'jam']).toContain(incident);
        expect(useTwinStore.getState().selectedId).toBe(machineId);
        // Cooling down, so a double click does not start two incidents.
        expect(screen.getByRole('button', { name: 'Trigger incident' })).toBeDisabled();
    });

    it('leaves the selection alone when the incident could not be sent', () => {
        useTwinStore.setState({ injectIncident: () => false, connection: { mode: 'live' } });
        render(<TriggerIncidentButton />);
        fireEvent.click(screen.getByRole('button', { name: 'Trigger incident' }));
        expect(useTwinStore.getState().selectedId).toBeNull();
    });
});