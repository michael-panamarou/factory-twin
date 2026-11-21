import type { Incident, MachineSpec, Reading } from '@factory-twin/shared';

/**
 * Incidents the demo button starts. Both show within a couple of seconds:
 * a fault stops the machine (error), a jam cuts its output (warning).
 */
export const DEMO_INCIDENTS: readonly Incident[] = ['fault', 'jam'];

export interface IncidentPick {
    machineId: string;
    incident: Incident;
}

/**
 * Picks a machine and an incident for the "Trigger incident" button. Prefers a
 * machine that is running normally, so the change is easy to see.
 */
export function pickIncident(
    machines: readonly MachineSpec[],
    latest: Readonly<Record<string, Reading | undefined>>,
    random: () => number = Math.random,
): IncidentPick | null {
    if (machines.length === 0) return null;
    const running = machines.filter((m) => latest[m.id]?.status === 'running');
    const pool = running.length > 0 ? running : machines;
    const machine = pool[Math.floor(random() * pool.length)] ?? pool[0]!;
    const incident = DEMO_INCIDENTS[Math.floor(random() * DEMO_INCIDENTS.length)] ?? 'fault';
    return { machineId: machine.id, incident };
}