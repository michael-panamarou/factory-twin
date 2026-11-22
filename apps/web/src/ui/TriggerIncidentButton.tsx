import { useEffect, useRef, useState } from 'react';
import { useTwinStore } from '../state/store';
import { pickIncident } from './incident';

/** Matches the server's per-client cooldown, so a click is never silently dropped. */
const COOLDOWN_MS = 1200;

/**
 * Demo control: starts a fault or a jam on a random running machine and
 * selects it, so the camera flies there and the panel shows what happens.
 */
export function TriggerIncidentButton() {
    const inject = useTwinStore((s) => s.injectIncident);
    const mode = useTwinStore((s) => s.connection.mode);
    const replaying = useTwinStore((s) => s.replay !== null);
    const [coolingDown, setCoolingDown] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    // Incidents happen now, so they make no sense while looking at the past.
    const ready = !!inject && (mode === 'live' || mode === 'local') && !replaying;

    const trigger = () => {
        const state = useTwinStore.getState();
        const pick = pickIncident(state.machines, state.latest);
        if (!pick || !state.injectIncident?.(pick.machineId, pick.incident)) return;
        state.select(pick.machineId);
        setCoolingDown(true);
        timer.current = setTimeout(() => setCoolingDown(false), COOLDOWN_MS);
    };

    return (
        <button
            type="button"
            className="trigger-incident"
            onClick={trigger}
            disabled={!ready || coolingDown}
            aria-label="Trigger incident"
            title={replaying ? 'Go back to live to trigger an incident' : 'Start a simulated fault or jam on a random running machine'}
        >
            <span aria-hidden="true">⚡</span>
            <span className="trigger-incident__label">Trigger incident</span>
        </button>
    );
}