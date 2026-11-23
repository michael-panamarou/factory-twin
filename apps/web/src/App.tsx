import { Component, Suspense, lazy, useEffect, type ReactNode } from 'react';
import { useTwinStore } from './state/store';
import { FloorPlan } from './plan/FloorPlan';
import { sourceFromLocation, startTelemetry } from './data/telemetry';
import { AlertsPanel, closeAlerts } from './ui/AlertsPanel';
import { MachineRoster } from './ui/MachineRoster';
import { PerfHud, perfHudRequested } from './ui/PerfHud';
import { Timeline } from './ui/Timeline';
import { TopBar } from './ui/TopBar';

// three.js and the 3D scene are most of the download. Loading them as a separate
// chunk lets the top bar, machine list and timeline appear first (about twice
// as fast on a mid-range phone). In the 2D view it is never downloaded at all.
let scenePromise: Promise<typeof import('./scene/FactoryScene')> | null = null;
const loadScene = () => (scenePromise ??= import('./scene/FactoryScene'));
if (useTwinStore.getState().view.mode === '3d') void loadScene();
const FactoryScene = lazy(() => loadScene().then((m) => ({ default: m.FactoryScene })));

/** If the 3D view throws (no WebGL context, a failed download), show the floor plan instead. */
class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('3D view failed', error);
    useTwinStore.getState().fallBackTo2D('The 3D view could not start, so you are seeing the floor plan.');
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Says why the app switched to the floor plan by itself. */
function ViewNotice() {
  const notice = useTwinStore((s) => s.view.notice);
  const dismiss = useTwinStore((s) => s.dismissViewNotice);
  if (!notice) return null;
  return (
      <div className="view-notice" role="status">
        <span>{notice}</span>
        <button type="button" className="link-button" onClick={dismiss}>
          Dismiss
        </button>
      </div>
  );
}

/** Shown while the 3D chunk downloads. */
function SceneLoading() {
  return (
      <div className="scene-loading" role="status">
        <span className="scene-loading__spinner" aria-hidden="true" />
        Loading the hall…
      </div>
  );
}

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
  const flat = useTwinStore((s) => s.view.mode === '2d');
  const hasNotice = useTwinStore((s) => s.view.notice !== null);
  if (hasNotice) return null;
  const help = flat ? 'Floor plan · click a machine for details' : 'Drag to orbit · scroll to zoom · click a machine for details';
  return (
      <p className={`hint${replaying ? ' is-replay' : ''}`} aria-hidden="true">
        {replaying ? 'Replay: showing the hall as it was · press Live to return' : help}
      </p>
  );
}

const showPerfHud = typeof window !== 'undefined' && perfHudRequested(window.location.search);

export function App() {
  const detailsOpen = useTwinStore((s) => s.selectedId !== null);
  const alertsOpen = useTwinStore((s) => s.alertsOpen);
  const view = useTwinStore((s) => s.view.mode);

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
    // Warm the panel chunk so the first click opens instantly, but only once the
    // scene has loaded, so the two downloads do not compete on slow connections.
    let warm: ReturnType<typeof setTimeout> | undefined;
    void (scenePromise ?? Promise.resolve()).then(() => {
      warm = setTimeout(() => void loadPanel(), 1500);
    });
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
          {view === '3d' ? (
              <SceneErrorBoundary>
                <Suspense fallback={<SceneLoading />}>
                  <FactoryScene />
                </Suspense>
              </SceneErrorBoundary>
          ) : (
              <FloorPlan />
          )}
          <MachineRoster />
          <AlertsPanel />
          <Suspense fallback={null}>
            <DetailsPanel />
          </Suspense>
          <Timeline />
          <SceneHint />
          <ViewNotice />
          {showPerfHud && <PerfHud />}
        </main>
      </div>
  );
}