import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART } from '../theme';
import { formatShortTime, formatTime, formatValue } from './format';

export interface ChartPoint {
  ts: number;
  value: number;
}

export interface Threshold {
  value: number;
  label: string;
  color: string;
}

interface Props {
  title: string;
  unit: string;
  data: ChartPoint[];
  thresholds?: Threshold[];
  /** Fill under the line: right for quantities (throughput), wrong for levels (temperature). */
  area?: boolean;
  /** Force the y-axis to include these values (e.g. 0 for throughput). */
  include?: number[];
}

interface TooltipPayload {
  payload?: ChartPoint;
}

function ChartTooltip({ active, payload, unit }: { active?: boolean; payload?: TooltipPayload[]; unit: string }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__value">
        {formatValue(point.value)} <span>{unit}</span>
      </div>
      <div className="chart-tooltip__time">{formatTime(point.ts)}</div>
    </div>
  );
}

/** One measure over time. One series per chart, so the title names it and no legend is needed. */
export function MetricChart({ title, unit, data, thresholds = [], area = false, include = [] }: Props) {
  const values = data.map((d) => d.value);
  const limits = thresholds.map((t) => t.value);
  const lo = Math.min(...values, ...include, ...limits);
  const hi = Math.max(...values, ...include, ...limits);
  const pad = Math.max(1, (hi - lo) * 0.08);
  const domain: [number, number] = values.length ? [Math.floor(lo - (include.includes(lo) ? 0 : pad)), Math.ceil(hi + pad)] : [0, 1];
  const latest = data.at(-1);

  return (
    <figure className="metric-chart" aria-label={`${title} chart`}>
      <figcaption>
        <span className="metric-chart__title">{title}</span>
        <span className="metric-chart__unit">{unit}</span>
      </figcaption>
      <div className="metric-chart__plot">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 68, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatShortTime}
              stroke={CHART.axis}
              tick={{ fill: CHART.muted, fontSize: 11 }}
              tickLine={false}
              minTickGap={48}
            />
            <YAxis domain={domain} stroke={CHART.axis} tick={{ fill: CHART.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
            {thresholds.map((t) => (
              <ReferenceLine
                key={t.label}
                y={t.value}
                stroke={t.color}
                strokeOpacity={0.75}
                ifOverflow="extendDomain"
                label={{ value: t.label, position: 'right', fill: CHART.inkSecondary, fontSize: 11 }}
              />
            ))}
            <Tooltip
              content={<ChartTooltip unit={unit} />}
              cursor={{ stroke: CHART.inkSecondary, strokeWidth: 1 }}
              isAnimationActive={false}
            />
            {area ? (
              <Area
                type="monotone"
                dataKey="value"
                stroke={CHART.series}
                strokeWidth={2}
                fill={CHART.series}
                fillOpacity={0.1}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4, stroke: CHART.surface, strokeWidth: 2 }}
              />
            ) : (
              <Line
                type="monotone"
                dataKey="value"
                stroke={CHART.series}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4, stroke: CHART.surface, strokeWidth: 2 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {latest && (
        <p className="sr-only">
          Latest {title.toLowerCase()}: {formatValue(latest.value)} {unit} at {formatTime(latest.ts)}.
        </p>
      )}
    </figure>
  );
}
