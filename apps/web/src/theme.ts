import type { MachineStatus } from '@factory-twin/shared';

/**
 * Status colours are reserved for status. They always ship with an icon and a
 * label in the UI, so colour never carries the meaning alone.
 */
export const STATUS_COLOR: Record<MachineStatus, string> = {
  running: '#0ca30c',
  warning: '#fab219',
  error: '#d03b3b',
  offline: '#898781',
};

export const STATUS_LABEL: Record<MachineStatus, string> = {
  running: 'Running',
  warning: 'Warning',
  error: 'Error',
  offline: 'No data',
};

/** Shape-distinct glyphs so status reads without colour (and in forced-colours mode). */
export const STATUS_ICON: Record<MachineStatus, string> = {
  running: '●',
  warning: '▲',
  error: '■',
  offline: '○',
};

/** Chart tokens (dark surface). */
export const CHART = {
  series: '#3987e5',
  grid: '#2c2c2a',
  axis: '#383835',
  muted: '#898781',
  inkPrimary: '#f0efec',
  inkSecondary: '#c3c2b7',
  surface: '#1a1a19',
} as const;
