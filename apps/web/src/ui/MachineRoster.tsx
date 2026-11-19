import type { MachineSpec } from '@factory-twin/shared';
import { useMachineStatus, useTwinStore } from '../state/store';
import { StatusBadge } from './StatusBadge';

function RosterItem({ spec }: { spec: MachineSpec }) {
  const status = useMachineStatus(spec.id);
  const selected = useTwinStore((s) => s.selectedId === spec.id);
  const select = useTwinStore((s) => s.select);
  const hover = useTwinStore((s) => s.hover);
  return (
    <li>
      <button
        type="button"
        className={`roster__item status-${status}`}
        aria-pressed={selected}
        onClick={() => select(selected ? null : spec.id)}
        onMouseEnter={() => hover(spec.id)}
        onMouseLeave={() => hover(null)}
        onFocus={() => hover(spec.id)}
        onBlur={() => hover(null)}
        data-machine={spec.id}
      >
        <StatusBadge status={status} compact />
        <span className="roster__id">{spec.id}</span>
        <span className="roster__name">{spec.name}</span>
      </button>
    </li>
  );
}

/** Keyboard- and screen-reader-friendly list of every machine; mirrors the 3D view. */
export function MachineRoster() {
  const machines = useTwinStore((s) => s.machines);
  return (
    <nav className="roster" aria-label="Machines">
      <h2 className="roster__title">Machines</h2>
      <ul>
        {machines.map((m) => (
          <RosterItem key={m.id} spec={m} />
        ))}
      </ul>
    </nav>
  );
}
