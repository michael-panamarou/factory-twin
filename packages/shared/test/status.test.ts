import { describe, expect, it } from 'vitest';
import { compareStatusSeverity, deriveStatus, evaluateStatus, type MachineLimits } from '../src/index.ts';

const limits: MachineLimits = {
  nominalTemp: 50,
  tempWarn: 70,
  tempError: 85,
  nominalThroughput: 10,
  vibrationWarn: 4.5,
  vibrationError: 7.1,
};

const normal = { temperature: 50, throughput: 10, vibration: 2 };

describe('evaluateStatus', () => {
  it('reports running when every value is inside its limits', () => {
    expect(evaluateStatus(normal, limits)).toEqual({ status: 'running', reasons: [] });
  });

  it.each([
    ['temperature', { temperature: 70 }, 'warning'],
    ['temperature', { temperature: 85 }, 'error'],
    ['vibration', { vibration: 4.5 }, 'warning'],
    ['vibration', { vibration: 7.1 }, 'error'],
    ['throughput', { throughput: 6.9 }, 'warning'],
    ['throughput', { throughput: 1.9 }, 'error'],
  ] as const)('flags %s at its limit: %o -> %s', (_field, override, expected) => {
    expect(deriveStatus({ ...normal, ...override }, limits)).toBe(expected);
  });

  it('lists the most severe reason first', () => {
    const result = evaluateStatus({ temperature: 72, throughput: 0, vibration: 2 }, limits);
    expect(result.status).toBe('error');
    expect(result.reasons[0]).toBe('Machine stopped: no output');
    expect(result.reasons[1]).toMatch(/Temperature 72.0 °C/);
  });

  it('applies hysteresis so a value hovering at a limit does not flap', () => {
    const justBelow = { ...normal, temperature: 69 };
    expect(deriveStatus(justBelow, limits, 'running')).toBe('running');
    expect(deriveStatus(justBelow, limits, 'warning')).toBe('warning');
    expect(deriveStatus({ ...normal, temperature: 67.9 }, limits, 'warning')).toBe('running');
  });

  it('does not let a warning hysteresis band raise an error', () => {
    expect(deriveStatus({ ...normal, temperature: 84 }, limits, 'warning')).toBe('warning');
    expect(deriveStatus({ ...normal, temperature: 84 }, limits, 'error')).toBe('error');
  });
});

describe('compareStatusSeverity', () => {
  it('sorts the most severe status first', () => {
    const sorted = (['running', 'offline', 'error', 'warning'] as const).slice().sort(compareStatusSeverity);
    expect(sorted).toEqual(['error', 'warning', 'running', 'offline']);
  });
});
