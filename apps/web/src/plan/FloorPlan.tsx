import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { HALL_SIZE, type MachineSpec } from '@factory-twin/shared';
import { useMachineStatus, useTwinStore } from '../state/store';
import { STATUS_ICON, STATUS_LABEL } from '../theme';
import { formatValue } from '../ui/format';
import { PLAN_BOUNDS, boardRect, boardSize, planShapes, type Orientation, type PlanShape } from './layout';
import './floorplan.css';

/** Portrait when the free space is clearly taller than wide (phones held upright). */
function useOrientation(ref: RefObject<HTMLElement | null>): Orientation {
    const [orientation, setOrientation] = useState<Orientation>('landscape');
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            const { width, height } = entry.contentRect;
            setOrientation(height > width * 1.1 ? 'portrait' : 'landscape');
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref]);
    return orientation;
}

/** Floor, grid, walls and walkway, drawn in metres. */
function Floor({ orientation }: { orientation: Orientation }) {
    const { width, height } = boardSize(orientation);
    const W = HALL_SIZE.width / 2;
    const D = HALL_SIZE.depth / 2;
    const hall = boardRect(-W, W, -D, D, orientation);
    const back = boardRect(PLAN_BOUNDS.minX, W, PLAN_BOUNDS.minZ, -D, orientation);
    const side = boardRect(PLAN_BOUNDS.minX, -W, PLAN_BOUNDS.minZ, D, orientation);
    const walkway = boardRect(-9.5, 9.5, 2.3, 3.5, orientation);

    const lines = useMemo(() => {
        const out: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; major: boolean }> = [];
        for (let x = -W; x <= W; x++) {
            const r = boardRect(x, x, -D, D, orientation);
            out.push({ key: `x${x}`, x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y + r.height, major: x % 4 === 0 });
        }
        for (let z = -D; z <= D; z++) {
            const r = boardRect(-W, W, z, z, orientation);
            out.push({ key: `z${z}`, x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y + r.height, major: z % 4 === 0 });
        }
        return out;
    }, [W, D, orientation]);

    return (
        <svg className="floorplan__floor" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
            <rect {...hall} className="floorplan__hall" />
            {lines.map((l) => (
                <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={l.major ? 'floorplan__grid is-major' : 'floorplan__grid'} />
            ))}
            <rect {...walkway} className="floorplan__walkway" />
            <rect {...back} className="floorplan__wall" />
            <rect {...side} className="floorplan__wall" />
        </svg>
    );
}

/** Positions an element on the drawing: `--m` is the size of one metre in px. */
const at = (u: number, v: number): CSSProperties => ({ left: `calc(var(--m) * ${u})`, top: `calc(var(--m) * ${v})` });

function PlanMachine({ spec, shape }: { spec: MachineSpec; shape: PlanShape }) {
    const status = useMachineStatus(spec.id);
    const selected = useTwinStore((s) => s.selectedId === spec.id);
    const temperature = useTwinStore((s) => s.shown[spec.id]?.temperature);
    const select = useTwinStore((s) => s.select);
    const hover = useTwinStore((s) => s.hover);

    const reading = temperature === undefined ? '' : `, ${formatValue(temperature)} °C`;
    return (
        <>
            <button
                type="button"
                className={`plan-machine plan-machine--${spec.kind} status-${status}${shape.round ? ' is-round' : ''}${selected ? ' is-selected' : ''}`}
                style={{
                    ...at(shape.u, shape.v),
                    width: `calc(var(--m) * ${shape.w})`,
                    height: `calc(var(--m) * ${shape.h})`,
                    transform: `translate(-50%, -50%) rotate(${shape.rotation}deg)`,
                }}
                aria-label={`${spec.name} (${spec.id}): ${STATUS_LABEL[status]}${reading}`}
                aria-pressed={selected}
                onClick={(e) => {
                    e.stopPropagation();
                    select(spec.id);
                }}
                onMouseEnter={() => hover(spec.id)}
                onMouseLeave={() => hover(null)}
                data-machine={spec.id}
            >
                {spec.kind === 'conveyor' && <span className="plan-machine__belt" aria-hidden="true" />}
            </button>
            <div className={`plan-label machine-label status-${status}${selected ? ' is-selected' : ''}`} style={at(shape.u, shape.labelV)} aria-hidden="true">
                <span className="machine-label__icon">{STATUS_ICON[status]}</span>
                <span className="machine-label__id">{spec.id}</span>
                {temperature !== undefined && <span className="plan-label__temp">{formatValue(temperature)} °C</span>}
            </div>
        </>
    );
}

/**
 * A top-down floor plan of the hall: the 2D view, and the fallback when the
 * browser cannot run WebGL. Same data, same selection, same panels as 3D.
 * Each machine is a real button, so it works with keyboard and screen readers.
 */
export function FloorPlan() {
    const ref = useRef<HTMLDivElement>(null);
    const orientation = useOrientation(ref);
    const machines = useTwinStore((s) => s.machines);
    const select = useTwinStore((s) => s.select);
    const shapes = useMemo(() => planShapes(machines, orientation), [machines, orientation]);
    const size = boardSize(orientation);

    return (
        <div className="floorplan" ref={ref} data-orientation={orientation} data-testid="floorplan" onClick={() => select(null)}>
            <div
                className="floorplan__board"
                role="group"
                aria-label="Floor plan of the hall"
                style={{ '--plan-w': size.width, '--plan-h': size.height } as CSSProperties}
            >
                <Floor orientation={orientation} />
                {machines.map((m, i) => (
                    <PlanMachine key={m.id} spec={m} shape={shapes[i]!} />
                ))}
            </div>
        </div>
    );
}