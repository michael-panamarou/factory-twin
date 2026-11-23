/** Which view of the hall is on screen. */
export type ViewMode = '3d' | '2d';

export interface ViewState {
    mode: ViewMode;
    /** Whether this browser can run the 3D view at all. */
    webgl: boolean;
    /** Why the app switched to 2D by itself, shown once to the user. Null when nothing to say. */
    notice: string | null;
}

const STORAGE_KEY = 'factory-twin:view';

/** True when the browser can create a WebGL context. Cheap: one throwaway canvas. */
export function detectWebGL(): boolean {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    // Browsers (and test DOMs) without WebGL do not even define the context types.
    if (typeof window.WebGLRenderingContext === 'undefined') return false;
    try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    } catch {
        return false;
    }
}

/** `?view=2d` or `?view=3d` for one session. */
export function viewFromLocation(search: string): ViewMode | null {
    const value = new URLSearchParams(search).get('view');
    return value === '2d' || value === '3d' ? value : null;
}

/** The choice the user made last time, if the browser lets us remember it. */
export function loadSavedView(): ViewMode | null {
    try {
        const value = window.localStorage.getItem(STORAGE_KEY);
        return value === '2d' || value === '3d' ? value : null;
    } catch {
        return null;
    }
}

export function saveView(mode: ViewMode): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
        // Private mode or storage disabled: the choice just is not remembered.
    }
}

export const NO_WEBGL_NOTICE = 'This browser cannot show the 3D view, so you are seeing the floor plan.';

/**
 * Starting view: the URL wins, then the saved choice, then 3D. Without WebGL
 * it is always 2D, with a notice if 3D was asked for or expected.
 */
export function initialView(input: { search: string; saved: ViewMode | null; webgl: boolean }): ViewState {
    const wanted = viewFromLocation(input.search) ?? input.saved ?? '3d';
    if (!input.webgl) return { mode: '2d', webgl: false, notice: wanted === '3d' ? NO_WEBGL_NOTICE : null };
    return { mode: wanted, webgl: true, notice: null };
}

/** Reads everything from the browser. */
export const initialViewFromBrowser = (): ViewState =>
    initialView({
        search: typeof window === 'undefined' ? '' : window.location.search,
        saved: typeof window === 'undefined' ? null : loadSavedView(),
        webgl: detectWebGL(),
    });