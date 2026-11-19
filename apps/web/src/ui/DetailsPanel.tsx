import { useMemo, useState } from 'react';
import { evaluateStatus, type Alert, type MachineSpec, type Reading } from '@factory-twin/shared';
import { useTwinStore } from '../state/store';
import { STATUS_COLOR, STATUS_ICON } from '../theme';
import { MetricChart, type ChartPoint } from './MetricChart';
import { StatusBadge } from './StatusBadge';
import { KIND_LABEL, downsample, formatAgo, formatTime, formatValue } from './format';

const WINDOWS = [
  { minutes: 5, label: '5 min' },
  { minutes: 15, label: '15 min' },
] as const;

const MAX_POINTS = 300;
const EMPTY: Reading[] = [];

function Kpi({ label, value, unit, note, level }: { label: string; value: string; unit: string; note: string; level: Reading['status'] }) {
  return (
    <div className={`kpi kpi--${level}`}>
      <div className="kpi__label">
        {level !== 'running' && (
          <span className="kpi__flag" style={{ color: STATUS_COLOR[level] }} aria-label={level}>
            {STATUS_ICON[level]}
          </span>
        )}
        {label}
      </div>
      <div className="kpi__value">
        {value}
        <span className="kpi__unit">{unit}</span>
      </div>
      <div className="kpi__note">{note}</div>
    </div>
  );
}

const levelFor = (v: number, warn: number, error: number, below = false): Reading['status'] =>
  below ? (v < error ? 'error' : v < warn ? 'warning' : 'running') : v >= error ? 'error' : v >= warn ? 'warning' : 'running';

function MachineDetails({ spec }: { spec: MachineSpec }) {
  const [windowMinutes, setWindowMinutes] = useState<number>(5);
  const history = useTwinStore((s) => s.history[spec.id] ?? EMPTY);
  const alerts = useTwinStore((s) => s.alerts);
  const select = useTwinStore((s) => s.select);
  const latest = history.at(-1);
  const status = latest?.status ?? 'offline';
  const { limits } = spec;

  const { temperature, throughput } = useMemo(() => {
    const end = history.at(-1)?.ts ?? 0;
    const inWindow = history.filter((r) => r.ts > end - windowMinutes * 60_000);
    const sampled = downsample(inWindow, MAX_POINTS);
    return {
      temperature: sampled.map((r): ChartPoint => ({ ts: r.ts, value: r.temperature })),
      throughput: sampled.map((r): ChartPoint => ({ ts: r.ts, value: r.throughput })),
    };
  }, [history, windowMinutes]);

  const machineAlerts = useMemo(() => alerts.filter((a: Alert) => a.machineId === spec.id).slice(-6).reverse(), [alerts, spec.id]);
  const reasons = latest ? evaluateStatus(latest, limits, history.at(-2)?.status).reasons : [];

  return (
    <>
      <header className="panel__header">
        <div>
          <p className="panel__eyebrow">
            {spec.id} · {KIND_LABEL[spec.kind]}
          </p>
          <h2 id="details-title" className="panel__title">
            {spec.name}
          </h2>
        </div>
        <button type="button" className="icon-button" onClick={() => select(null)} aria-label="Close details">
          ×
        </button>
      </header>

      <div className="panel__status" data-testid="panel-status">
        <StatusBadge status={status} />
        {reasons[0] && <span className="panel__reason">{reasons[0]}</span>}
        {status === 'running' && <span className="panel__reason">All values inside their limits</span>}
      </div>

      {latest ? (
        <>
          <div className="kpis">
            <Kpi
              label="Temperature"
              value={formatValue(latest.temperature)}
              unit="°C"
              note={`warn ${limits.tempWarn} · max ${limits.tempError}`}
              level={levelFor(latest.temperature, limits.tempWarn, limits.tempError)}
            />
            <Kpi
              label="Throughput"
              value={formatValue(latest.throughput)}
              unit="/min"
              note={`nominal ${limits.nominalThroughput}`}
              level={levelFor(latest.throughput / limits.nominalThroughput, 0.7, 0.2, true)}
            />
            <Kpi
              label="Vibration"
              value={formatValue(latest.vibration)}
              unit="mm/s"
              note={`warn ${limits.vibrationWarn} · max ${limits.vibrationError}`}
              level={levelFor(latest.vibration, limits.vibrationWarn, limits.vibrationError)}
            />
          </div>

          <div className="segmented" role="group" aria-label="Chart time range">
            {WINDOWS.map((w) => (
              <button key={w.minutes} type="button" aria-pressed={windowMinutes === w.minutes} onClick={() => setWindowMinutes(w.minutes)}>
                Last {w.label}
              </button>
            ))}
          </div>

          <MetricChart
            title="Temperature"
            unit="°C"
            data={temperature}
            thresholds={[
              { value: limits.tempWarn, label: `warn ${limits.tempWarn}`, color: STATUS_COLOR.warning },
              { value: limits.tempError, label: `max ${limits.tempError}`, color: STATUS_COLOR.error },
            ]}
          />
          <MetricChart
            title="Throughput"
            unit="parts/min"
            data={throughput}
            area
            include={[0]}
            thresholds={[{ value: limits.nominalThroughput, label: `nominal ${limits.nominalThroughput}`, color: '#898781' }]}
          />

          <details className="readings-table">
            <summary>Latest readings as a table</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Temp °C</th>
                  <th scope="col">Parts/min</th>
                  <th scope="col">mm/s</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {history
                  .slice(-10)
                  .reverse()
                  .map((r) => (
                    <tr key={r.ts}>
                      <td>{formatTime(r.ts)}</td>
                      <td>{formatValue(r.temperature)}</td>
                      <td>{formatValue(r.throughput)}</td>
                      <td>{formatValue(r.vibration)}</td>
                      <td>
                        <StatusBadge status={r.status} compact />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <p className="panel__empty">Waiting for data from this machine…</p>
      )}

      <section className="panel__alerts" aria-labelledby="alerts-title">
        <h3 id="alerts-title">Alerts</h3>
        {machineAlerts.length === 0 ? (
          <p className="panel__empty">No recent alerts.</p>
        ) : (
          <ul>
            {machineAlerts.map((a) => (
              <li key={a.id} className={`alert alert--${a.severity}`}>
                <span className="alert__icon" aria-hidden="true">
                  {a.severity === 'info' ? '✓' : STATUS_ICON[a.severity]}
                </span>
                <span className="alert__message">{a.message}</span>
                <time className="alert__time" dateTime={new Date(a.ts).toISOString()} title={formatTime(a.ts)}>
                  {formatAgo(a.ts, latest?.ts ?? a.ts)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** Side panel with live values, charts and alerts for the selected machine. */
export function DetailsPanel() {
  const selectedId = useTwinStore((s) => s.selectedId);
  const spec = useTwinStore((s) => s.machines.find((m) => m.id === s.selectedId));
  return (
    <aside className={`panel${spec ? ' is-open' : ''}`} aria-labelledby={spec ? 'details-title' : undefined} aria-hidden={!spec} data-testid="details-panel">
      {spec && <MachineDetails key={selectedId} spec={spec} />}
    </aside>
  );
}
