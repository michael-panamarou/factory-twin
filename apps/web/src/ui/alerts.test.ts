import { describe, expect, it } from 'vitest';
import type { Alert } from '@factory-twin/shared';
import { badgeText, countUnread, filterAlerts, isUnread } from './alerts';

const alert = (id: string, ts: number, severity: Alert['severity']): Alert => ({ id, machineId: 'CNC-01', ts, severity, message: id });

// Oldest first, as the store keeps them.
const alerts: Alert[] = [alert('w1', 100, 'warning'), alert('e1', 200, 'error'), alert('i1', 300, 'info'), alert('w2', 400, 'warning')];

describe('filterAlerts', () => {
    it('returns everything, newest first, for "all"', () => {
        expect(filterAlerts(alerts, 'all').map((a) => a.id)).toEqual(['w2', 'i1', 'e1', 'w1']);
    });

    it('keeps only the chosen severity', () => {
        expect(filterAlerts(alerts, 'warning').map((a) => a.id)).toEqual(['w2', 'w1']);
        expect(filterAlerts(alerts, 'error').map((a) => a.id)).toEqual(['e1']);
    });

    it('does not change the store array', () => {
        const copy = alerts.slice();
        filterAlerts(alerts, 'all');
        expect(alerts).toEqual(copy);
    });
});

describe('unread', () => {
    it('counts unread warnings and errors, not recoveries', () => {
        expect(countUnread(alerts, 150)).toBe(2); // e1 and w2; i1 is a recovery
        expect(countUnread(alerts, 400)).toBe(0);
        expect(countUnread(alerts, 0)).toBe(3);
    });

    it('treats nothing as unread before the first data arrives', () => {
        expect(countUnread(alerts, null)).toBe(0);
        expect(isUnread(alerts[0]!, null)).toBe(false);
    });

    it('caps the badge text', () => {
        expect(badgeText(7)).toBe('7');
        expect(badgeText(99)).toBe('99');
        expect(badgeText(100)).toBe('99+');
    });
});