import { useTwinStore } from '../state/store';

/** 3D scene or 2D floor plan. 3D is disabled when the browser has no WebGL. */
export function ViewSwitch() {
    const view = useTwinStore((s) => s.view);
    const setView = useTwinStore((s) => s.setView);
    return (
        <div className="segmented view-switch" role="group" aria-label="View">
            <button
                type="button"
                aria-pressed={view.mode === '3d'}
                onClick={() => setView('3d')}
                disabled={!view.webgl}
                title={view.webgl ? '3D view' : 'This browser cannot show the 3D view'}
            >
                3D
            </button>
            <button type="button" aria-pressed={view.mode === '2d'} onClick={() => setView('2d')} title="Floor plan">
                2D
            </button>
        </div>
    );
}