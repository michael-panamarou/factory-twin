import { Suspense, lazy, useEffect } from 'react';
import { useTwinStore } from './state/store';
import { sourceFromLocation, startTelemetry } from './data/telemetry';
import { FactoryScene } from './scene/FactoryScene';
import { AlertsPanel, closeAlerts } from './ui/AlertsPanel';
import { MachineRoster } from './ui/MachineRoster';
import { Timeline } from './ui/Timeline';
import { TopBar } from './ui/TopBar';

// The panel pulls in Recharts; load it in its own chunk, after the scene.
const loadPanel = () => import('./ui/DetailsPanel');
const DetailsPanel = lazy(() => loadPanel().then((m) => ({ default: m.DetailsPanel })));

/** `?ws=wss://…` overrides the configured server for a session; `?source=local` forces the browser simulator. */
function telemetryConfig() {
  const params = new URLSearchParams(window.location.search);
  return {
    url: params.get('ws') ?? (import.meta.env.VITE_WS_URL as string | undefined) ?? '',
    forceLocal: sourceFromLocation(window.location.search) === 'local',
  };
}

/** One line of help, or what is being replayed. */
function SceneHint() {
  const replaying = useTwinStore((s) => s.replay !== null);
  return (
      <p className={`hint${replaying ? ' is-replay' : ''}`} aria-hidden="true">
        {replaying ? 'Replay: showing the hall as it was · press Live to return' : 'Drag to orbit · scroll to zoom · click a machine for details'}
      </p>
  );
}

export function App() {
  const detailsOpen = useTwinStore((s) => s.selectedId !== null);
  const alertsOpen = useTwinStore((s) => s.alertsOpen);

  useEffect(() => {
    const { applyHello, applyTick, setConnection, setInjector } = useTwinStore.getState();
    const telemetry = startTelemetry({ applyHello, applyTick, setConnection }, telemetryConfig());
    setInjector(telemetry.inject);
    return () => {
      setInjector(null);
      telemetry.stop();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Close the alert list first; a second Escape closes the details panel.
      if (useTwinStore.getState().alertsOpen) closeAlerts();
      else useTwinStore.getState().select(null);
    };
    window.addEventListener('keydown', onKey);
    // Warm the panel chunk so the first click opens instantly.
    const warm = setTimeout(() => void loadPanel(), 1500);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(warm);
    };
  }, []);

  return (
      <div className="app">
        <TopBar />
        {/* The data attributes let the timeline keep clear of whichever panels are open. */}
        <main className="stage" data-details={detailsOpen || undefined} data-alerts={alertsOpen || undefined}>
          <FactoryScene />
          <MachineRoster />
          <AlertsPanel />
          <Suspense fallback={null}>
            <DetailsPanel />
          </Suspense>
          <Timeline />
          <SceneHint />
        </main>
      </div>
  );
}