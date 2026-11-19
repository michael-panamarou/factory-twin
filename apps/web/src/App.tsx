import { Suspense, lazy, useEffect } from 'react';
import { useTwinStore } from './state/store';
import { sourceFromLocation, startTelemetry } from './data/telemetry';
import { FactoryScene } from './scene/FactoryScene';
import { MachineRoster } from './ui/MachineRoster';
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

export function App() {
  useEffect(() => {
    const { applyHello, applyTick, setConnection } = useTwinStore.getState();
    return startTelemetry({ applyHello, applyTick, setConnection }, telemetryConfig());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useTwinStore.getState().select(null);
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
      <main className="stage">
        <FactoryScene />
        <MachineRoster />
        <Suspense fallback={null}>
          <DetailsPanel />
        </Suspense>
        <p className="hint" aria-hidden="true">
          Drag to orbit · scroll to zoom · click a machine for details
        </p>
      </main>
    </div>
  );
}
