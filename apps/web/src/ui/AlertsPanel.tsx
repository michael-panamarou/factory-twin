import { useEffect, useMemo, useRef, useState } from 'react';
import type { Alert } from '@factory-twin/shared';
import { useTwinStore } from '../state/store';
import { STATUS_ICON } from '../theme';
import { ALERTS_BUTTON_ID } from './AlertsButton';
import { ALERT_FILTERS, filterAlerts, isUnread, type AlertFilter } from './alerts';
import { formatAgo, formatTime } from './format';

/** Must match the phone breakpoint in styles.css. */
const PHONE_QUERY = '(max-width: 760px)';

const SEVERITY_ICON = { info: '✓', warning: STATUS_ICON.warning, error: STATUS_ICON.error } as const;
const SEVERITY_LABEL = { info: 'Resolved', warning: 'Warning', error: 'Error' } as const;

const returnFocusToButton = () => document.getElementById(ALERTS_BUTTON_ID)?.focus();

function AlertRow({ alert, machineName, now, unread, onJump }: { alert: Alert; machineName: string; now: number; unread: boolean; onJump: () => void }) {
    const ago = formatAgo(alert.ts, now);
    return (
        <li>
            <button
                type="button"
                className={`alert-row alert-row--${alert.severity}${unread ? ' is-unread' : ''}`}
                onClick={onJump}
                aria-label={`${SEVERITY_LABEL[alert.severity]}${unread ? ', new' : ''}: ${machineName} (${alert.machineId}). ${alert.message}. ${ago}. Jump to machine`}
                data-machine={alert.machineId}
            >
        <span className="alert-row__icon" aria-hidden="true">
          {SEVERITY_ICON[alert.severity]}
        </span>
                <span className="alert-row__body">
          <span className="alert-row__head">
            <span className="alert-row__machine">{alert.machineId}</span>
            <span className="alert-row__name">{machineName}</span>
          </span>
          <span className="alert-row__message">{alert.message}</span>
        </span>
                <span className="alert-row__meta">
          <time dateTime={new Date(alert.ts).toISOString()} title={formatTime(alert.ts)}>
            {ago}
          </time>
                    {unread && <span className="alert-row__dot" aria-hidden="true" />}
                    <span className="alert-row__jump" aria-hidden="true">
            →
          </span>
        </span>
            </button>
        </li>
    );
}

function AlertsContent() {
    const [filter, setFilter] = useState<AlertFilter>('all');
    const alerts = useTwinStore((s) => s.alerts);
    const machines = useTwinStore((s) => s.machines);
    const lastSeen = useTwinStore((s) => s.lastSeenAlertTs);
    const now = useTwinStore((s) => s.lastUpdate) ?? 0;
    const { setAlertsOpen, markAlertsRead, focusMachine } = useTwinStore.getState();

    const names = useMemo(() => new Map(machines.map((m) => [m.id, m.name])), [machines]);
    const visible = useMemo(() => filterAlerts(alerts, filter), [alerts, filter]);
    const counts = useMemo(
        () => ({
            all: alerts.length,
            warning: alerts.filter((a) => a.severity === 'warning').length,
            error: alerts.filter((a) => a.severity === 'error').length,
        }),
        [alerts],
    );
    const anyUnread = alerts.some((a) => isUnread(a, lastSeen));

    const close = () => {
        setAlertsOpen(false);
        returnFocusToButton();
    };

    const jump = (machineId: string) => {
        // On phones the list covers the whole screen, so get out of the way.
        if (window.matchMedia?.(PHONE_QUERY).matches) setAlertsOpen(false);
        focusMachine(machineId);
    };

    return (
        <>
            <header className="alerts-panel__header">
                <h2 id="alerts-title">Alerts</h2>
                <button type="button" className="icon-button" onClick={close} aria-label="Close alerts">
                    ×
                </button>
            </header>

            <div className="alerts-panel__toolbar">
                <div className="segmented" role="group" aria-label="Show">
                    {ALERT_FILTERS.map((f) => (
                        <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
                            {f.label} <span className="segmented__count">{counts[f.value]}</span>
                        </button>
                    ))}
                </div>
                <button type="button" className="link-button" onClick={markAlertsRead} disabled={!anyUnread}>
                    Mark all as read
                </button>
            </div>

            {visible.length === 0 ? (
                <p className="alerts-panel__empty">
                    {filter === 'all' ? 'No alerts yet.' : `No ${filter === 'error' ? 'errors' : 'warnings'} right now.`} Try{' '}
                    <strong>⚡ Trigger incident</strong> to see one.
                </p>
            ) : (
                <ul className="alerts-panel__list" aria-label={`${visible.length} alerts, newest first`}>
                    {visible.map((a) => (
                        <AlertRow key={a.id} alert={a} machineName={names.get(a.machineId) ?? a.machineId} now={now} unread={isUnread(a, lastSeen)} onJump={() => jump(a.machineId)} />
                    ))}
                </ul>
            )}
        </>
    );
}

/**
 * Every alert in the hall, newest first. A drawer on the left on wide screens,
 * full screen on phones. Choosing an alert flies the camera to its machine.
 */
export function AlertsPanel() {
    const open = useTwinStore((s) => s.alertsOpen);
    const ref = useRef<HTMLElement>(null);

    useEffect(() => {
        if (open) ref.current?.focus();
    }, [open]);

    return (
        <aside
            id="alerts-panel"
            ref={ref}
            className={`alerts-panel${open ? ' is-open' : ''}`}
            aria-labelledby={open ? 'alerts-title' : undefined}
            aria-hidden={!open}
            tabIndex={-1}
            data-testid="alerts-panel"
        >
            {open && <AlertsContent />}
        </aside>
    );
}

/** Closes the alert list and gives focus back to its button (for Escape). */
export function closeAlerts() {
    useTwinStore.getState().setAlertsOpen(false);
    returnFocusToButton();
}