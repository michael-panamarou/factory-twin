import { afterEach, describe, expect, it } from 'vitest';
import { NO_WEBGL_NOTICE, detectWebGL, initialView, loadSavedView, saveView, viewFromLocation } from './view';

afterEach(() => window.localStorage.clear());

describe('initialView', () => {
    it('defaults to 3D when WebGL works', () => {
        expect(initialView({ search: '', saved: null, webgl: true })).toEqual({ mode: '3d', webgl: true, notice: null });
    });

    it('lets the URL win over the saved choice', () => {
        expect(initialView({ search: '?view=2d', saved: '3d', webgl: true }).mode).toBe('2d');
        expect(initialView({ search: '?view=3d', saved: '2d', webgl: true }).mode).toBe('3d');
        expect(initialView({ search: '', saved: '2d', webgl: true }).mode).toBe('2d');
    });

    it('falls back to 2D without WebGL, and says why only if 3D was expected', () => {
        expect(initialView({ search: '', saved: null, webgl: false })).toEqual({ mode: '2d', webgl: false, notice: NO_WEBGL_NOTICE });
        expect(initialView({ search: '?view=2d', saved: null, webgl: false }).notice).toBeNull();
    });
});

describe('helpers', () => {
    it('reads ?view', () => {
        expect(viewFromLocation('?view=2d')).toBe('2d');
        expect(viewFromLocation('?view=4d')).toBeNull();
    });

    it('remembers the choice', () => {
        expect(loadSavedView()).toBeNull();
        saveView('2d');
        expect(loadSavedView()).toBe('2d');
    });

    it('reports no WebGL in a DOM without it', () => {
        expect(detectWebGL()).toBe(false); // jsdom has no WebGL
    });
});