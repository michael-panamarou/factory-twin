import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
    ALERTS_WIDTH,
    PANEL_WIDTH,
    SHEET_HEIGHT_RATIO,
    easeInOutCubic,
    framingDistance,
    framingView,
    interpolateView,
    panelViewOffset,
    shortestAngle,
    visibleArea,
    type View,
} from './cameraMath';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const view = (position: THREE.Vector3, target: THREE.Vector3): View => ({ position, target });
const blank = (): View => view(new THREE.Vector3(), new THREE.Vector3());

describe('easeInOutCubic', () => {
    it('starts at 0, ends at 1 and passes the middle at 0.5', () => {
        expect(easeInOutCubic(0)).toBe(0);
        expect(easeInOutCubic(0.5)).toBe(0.5);
        expect(easeInOutCubic(1)).toBe(1);
        expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    });
});

describe('framingDistance', () => {
    it('backs off further for a bigger object', () => {
        expect(framingDistance(3, 42, 16 / 9)).toBeGreaterThan(framingDistance(1, 42, 16 / 9));
    });

    it('backs off further on a portrait screen, where width is the limit', () => {
        expect(framingDistance(1, 42, 0.5)).toBeGreaterThan(framingDistance(1, 42, 16 / 9));
    });

    it('backs off further when the panel leaves less room', () => {
        const full = framingDistance(1, 42, 0.5);
        const aboveSheet = framingDistance(1, 42, 0.5, { width: 1, height: 1 - SHEET_HEIGHT_RATIO });
        expect(aboveSheet).toBeGreaterThan(full);
    });
});

describe('panelViewOffset and visibleArea', () => {
    const none = { details: false, alerts: false };
    const details = { details: true, alerts: false };
    const alerts = { details: false, alerts: true };
    const both = { details: true, alerts: true };

    it('does nothing while no overlay is open', () => {
        expect(panelViewOffset(1440, 900, none)).toEqual({ x: 0, y: 0 });
        expect(visibleArea(1440, none)).toEqual({ width: 1, height: 1 });
    });

    it('shifts left by half the side panel on wide screens', () => {
        expect(panelViewOffset(1440, 900, details)).toEqual({ x: PANEL_WIDTH / 2, y: 0 });
        expect(visibleArea(1440, details).width).toBeCloseTo((1440 - PANEL_WIDTH) / 1440);
    });

    it('shifts right by half the alert list on wide screens', () => {
        expect(panelViewOffset(1440, 900, alerts)).toEqual({ x: -ALERTS_WIDTH / 2, y: 0 });
        expect(visibleArea(1440, alerts).width).toBeCloseTo((1440 - ALERTS_WIDTH) / 1440);
    });

    it('centres between the alert list and the side panel when both are open', () => {
        expect(panelViewOffset(1440, 900, both)).toEqual({ x: (PANEL_WIDTH - ALERTS_WIDTH) / 2, y: 0 });
        expect(visibleArea(1440, both).width).toBeCloseTo((1440 - PANEL_WIDTH - ALERTS_WIDTH) / 1440);
    });

    it('shifts up by half the bottom sheet on phones, and ignores the full-screen alert list', () => {
        expect(panelViewOffset(400, 800, details)).toEqual({ x: 0, y: (800 * SHEET_HEIGHT_RATIO) / 2 });
        expect(visibleArea(400, details).height).toBeCloseTo(1 - SHEET_HEIGHT_RATIO);
        expect(panelViewOffset(400, 800, alerts)).toEqual({ x: 0, y: 0 });
    });
});

describe('shortestAngle', () => {
    it('takes the short way round', () => {
        expect(shortestAngle(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
        expect(shortestAngle(-3, 3)).toBeCloseTo(6 - Math.PI * 2);
        expect(Math.abs(shortestAngle(0.1, 0.1 + Math.PI * 4))).toBeLessThan(1e-9);
    });
});

describe('interpolateView', () => {
    const from = view(v(10, 10, 10), v(0, 0, 0));
    const to = view(v(4, 5, 1), v(3, 1, -2));

    it('returns the end points at k = 0 and k = 1', () => {
        const a = interpolateView(from, to, 0, blank());
        const b = interpolateView(from, to, 1, blank());
        expect(a.position.distanceTo(from.position)).toBeLessThan(1e-6);
        expect(b.position.distanceTo(to.position)).toBeLessThan(1e-6);
        expect(b.target.distanceTo(to.target)).toBeLessThan(1e-6);
    });

    it('orbits instead of cutting straight across, keeping the camera off the floor', () => {
        const low = view(v(-10, 2, 0), v(0, 0, 0));
        const high = view(v(10, 2, 0), v(0, 0, 0));
        const mid = interpolateView(low, high, 0.5, blank());
        // A straight line would pass through the target; the orbit stays at the same radius.
        expect(mid.position.distanceTo(mid.target)).toBeCloseTo(low.position.length(), 5);
        expect(mid.position.y).toBeGreaterThan(1.9);
    });
});

describe('framingView', () => {
    it('looks at the box from the current compass direction, close enough to fill the view', () => {
        const box = new THREE.Box3(v(4, 0, -3), v(6, 2, -1));
        const current = view(v(20, 15, 20), v(0, 0, 0));
        const result = framingView(box, current, 42, 16 / 9, { width: 0.7, height: 1 }, 4, 40);

        expect(result.target.x).toBeCloseTo(5);
        expect(result.target.z).toBeCloseTo(-2);
        const dir = result.position.clone().sub(result.target);
        expect(dir.x).toBeGreaterThan(0);
        expect(dir.z).toBeGreaterThan(0);
        expect(dir.length()).toBeGreaterThanOrEqual(4);
        expect(dir.length()).toBeLessThan(current.position.length());
    });

    it('respects the minimum distance', () => {
        const tiny = new THREE.Box3(v(0, 0, 0), v(0.1, 0.1, 0.1));
        const result = framingView(tiny, view(v(10, 10, 10), v(0, 0, 0)), 42, 1.6, { width: 1, height: 1 }, 5.5, 40);
        expect(result.position.distanceTo(result.target)).toBeCloseTo(5.5);
    });
});