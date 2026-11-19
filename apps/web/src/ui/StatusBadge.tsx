import type { MachineStatus } from '@factory-twin/shared';
import { STATUS_ICON, STATUS_LABEL } from '../theme';

/** Icon + label + colour: status never relies on colour alone. */
export function StatusBadge({ status, compact = false }: { status: MachineStatus; compact?: boolean }) {
  return (
    <span className={`status-badge status-${status}${compact ? ' is-compact' : ''}`} data-status={status}>
      <span className="status-badge__icon" aria-hidden="true">
        {STATUS_ICON[status]}
      </span>
      <span className={compact ? 'sr-only' : undefined}>{STATUS_LABEL[status]}</span>
    </span>
  );
}
