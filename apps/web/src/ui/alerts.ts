import type { Alert } from '@factory-twin/shared';

export type AlertFilter = 'all' | 'warning' | 'error';

export const ALERT_FILTERS: ReadonlyArray<{ value: AlertFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'warning', label: 'Warnings' },
    { value: 'error', label: 'Errors' },
];

/** Alerts that match the filter, newest first. "All" includes "back to normal" notices. */
export function filterAlerts(alerts: readonly Alert[], filter: AlertFilter): Alert[] {
    const matching = filter === 'all' ? alerts : alerts.filter((a) => a.severity === filter);
    return matching.slice().reverse();
}

/** An alert is unread when it is newer than the last time the list was read. */
export const isUnread = (alert: Alert, lastSeenTs: number | null): boolean => lastSeenTs !== null && alert.ts > lastSeenTs;

/** Unread warnings and errors: what the badge on the Alerts button shows. Recoveries do not count. */
export function countUnread(alerts: readonly Alert[], lastSeenTs: number | null): number {
    let n = 0;
    for (let i = alerts.length - 1; i >= 0; i--) {
        const a = alerts[i]!;
        if (!isUnread(a, lastSeenTs)) break; // alerts are oldest first, so stop at the first read one
        if (a.severity !== 'info') n++;
    }
    return n;
}

/** "99+" keeps the badge small. */
export const badgeText = (n: number): string => (n > 99 ? '99+' : String(n));