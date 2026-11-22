const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const shortTimeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export const formatTime = (ts: number) => timeFmt.format(ts);
export const formatShortTime = (ts: number) => shortTimeFmt.format(ts);

export const formatValue = (v: number, digits = 1) => v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Keeps at most `max` points by taking every n-th one, always keeping the newest. */
export function downsample<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max) return points.slice();
  const step = Math.ceil(points.length / max);
  const out: T[] = [];
  for (let i = (points.length - 1) % step; i < points.length; i += step) out.push(points[i]!);
  return out;
}

/** "12 s ago", "4 min ago" */
export function formatAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

export const KIND_LABEL = {
  hopper: 'Hopper',
  cnc: 'CNC mill',
  press: 'Press',
  conveyor: 'Conveyor',
  robot: 'Robot arm',
  scanner: 'Scanner',
} as const;

/** "4:05" or "1:02:09": a span of time, for the timeline. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}