import { useTwinStore } from '../state/store';
import './alerts.css';
import { badgeText, countUnread, isUnread } from './alerts';

export const ALERTS_BUTTON_ID = 'alerts-button';

function BellIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
                d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5v2.6L2.2 10.9a.6.6 0 0 0 .5.9h10.6a.6.6 0 0 0 .5-.9l-1.3-2.3V6A4.5 4.5 0 0 0 8 1.5Zm-1.8 11.6a1.9 1.9 0 0 0 3.6 0Z"
                fill="currentColor"
            />
        </svg>
    );
}

/** Opens the hall-wide alert list. The badge counts unread warnings and errors. */
export function AlertsButton() {
    const open = useTwinStore((s) => s.alertsOpen);
    const setOpen = useTwinStore((s) => s.setAlertsOpen);
    const unread = useTwinStore((s) => countUnread(s.alerts, s.lastSeenAlertTs));
    const hasUnreadError = useTwinStore((s) => s.alerts.some((a) => a.severity === 'error' && isUnread(a, s.lastSeenAlertTs)));

    return (
        <button
            id={ALERTS_BUTTON_ID}
            type="button"
            className="alerts-button"
            aria-expanded={open}
            aria-controls="alerts-panel"
            aria-label={unread > 0 ? `Alerts, ${unread} new` : 'Alerts'}
            onClick={() => setOpen(!open)}
        >
            <BellIcon />
            <span className="alerts-button__label">Alerts</span>
            {unread > 0 && (
                <span className={`alerts-button__badge${hasUnreadError ? ' is-error' : ''}`} aria-hidden="true" data-testid="alerts-badge">
          {badgeText(unread)}
        </span>
            )}
        </button>
    );
}