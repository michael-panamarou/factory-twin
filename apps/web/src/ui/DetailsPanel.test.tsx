import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { FactorySimulator, TICK_MS } from '@factory-twin/shared';
import { useTwinStore } from '../state/store';
import { DetailsPanel } from './DetailsPanel';
import { MachineRoster } from './MachineRoster';

const T0 = Date.UTC(2026, 10, 19, 8, 0, 0);
const initial = useTwinStore.getState();

beforeEach(() => {
  useTwinStore.setState(initial, true);
  const sim = new FactorySimulator({ seed: 4, incidentRate: 0 });
  for (const tick of sim.backfill(T0, 120)) useTwinStore.getState().applyTick(tick);
});


it('shows the machine as it was during a replay', () => {
  useTwinStore.getState().select('CNC-01');
  render(<DetailsPanel />);
  const history = useTwinStore.getState().history['CNC-01']!;
  const past = history[30]!;

  act(() => useTwinStore.getState().seek(past.ts));
  const panel = screen.getByTestId('details-panel');
  const tempTile = within(panel).getByText('Temperature', { selector: '.kpi__label' }).closest('.kpi') as HTMLElement;
  expect(within(tempTile).getByText(past.temperature.toFixed(1))).toBeInTheDocument();
});

describe('DetailsPanel', () => {
  it('stays empty until a machine is selected', () => {
    render(<DetailsPanel />);
    expect(screen.getByTestId('details-panel')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('opens from the roster and shows live values, charts and alerts', () => {
    render(
      <>
        <MachineRoster />
        <DetailsPanel />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /CNC-01/ }));

    const panel = screen.getByTestId('details-panel');
    expect(within(panel).getByRole('heading', { name: 'CNC mill 1' })).toBeInTheDocument();
    expect(within(screen.getByTestId('panel-status')).getByText('Running')).toBeInTheDocument();
    expect(within(panel).getByRole('figure', { name: 'Temperature chart' })).toBeInTheDocument();
    expect(within(panel).getByRole('figure', { name: 'Throughput chart' })).toBeInTheDocument();
    expect(within(panel).getByText('No recent alerts.')).toBeInTheDocument();

    const latest = useTwinStore.getState().latest['CNC-01']!;
    const tempTile = within(panel).getByText('Temperature', { selector: '.kpi__label' }).closest('.kpi') as HTMLElement;
    expect(within(tempTile).getByText(latest.temperature.toFixed(1))).toBeInTheDocument();
  });

  it('shows the reason and the alert when a machine goes into error', () => {
    useTwinStore.getState().select('PRS-01');
    render(<DetailsPanel />);
    const sim = new FactorySimulator({ seed: 4, incidentRate: 0 });
    sim.backfill(T0 + 120 * TICK_MS, 1);
    sim.inject('PRS-01', 'fault');
    act(() => {
      for (let i = 0; i < 10; i++) useTwinStore.getState().applyTick(sim.tick(T0 + (121 + i) * TICK_MS));
    });

    const panel = screen.getByTestId('details-panel');
    const status = within(screen.getByTestId('panel-status'));
    expect(status.getByText('Error')).toBeInTheDocument();
    expect(status.getByText(/Machine stopped|Throughput down/)).toBeInTheDocument();
    expect(within(panel).queryByText('No recent alerts.')).toBeNull();
  });

  it('closes with the close button', () => {
    useTwinStore.getState().select('SCN-01');
    render(<DetailsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(useTwinStore.getState().selectedId).toBeNull();
  });
});
