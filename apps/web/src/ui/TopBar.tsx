import { useTwinStore, selectStatusCounts } from '../state/store';
import { useShallow } from 'zustand/react/shallow';
import { STATUS_ICON } from '../theme';

const CONNECTION_TEXT = {
  connecting: 'Connecting…',
  live: 'Live from server',
  reconnecting: 'Reconnecting…',
  local: 'Simulated in browser',
} as const;

export function TopBar() {
  const counts = useTwinStore(useShallow(selectStatusCounts));
  const connection = useTwinStore((s) => s.connection);

  return (
    <header className="topbar">
      <div className="brand">
        <img src="/favicon.svg" alt="" width={26} height={26} />
        <div>
          <h1>Factory Twin</h1>
          <p>Hall 1 · Line A</p>
        </div>
      </div>

      <ul className="status-summary" aria-label="Machine status summary">
        <li className="status-running" data-testid="count-running">
          <span aria-hidden="true">{STATUS_ICON.running}</span> {counts.running} running
        </li>
        <li className="status-warning" data-testid="count-warning">
          <span aria-hidden="true">{STATUS_ICON.warning}</span> {counts.warning} warning
        </li>
        <li className="status-error" data-testid="count-error">
          <span aria-hidden="true">{STATUS_ICON.error}</span> {counts.error} error
        </li>
      </ul>

      <div className={`connection connection--${connection.mode}`} role="status" title={connection.reason ?? connection.url} data-testid="connection">
        <span className="connection__dot" aria-hidden="true" />
        {CONNECTION_TEXT[connection.mode]}
      </div>
    </header>
  );
}
