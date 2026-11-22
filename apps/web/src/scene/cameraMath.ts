import * as THREE from 'three';

/** A camera pose for orbit controls: where the camera is and what it looks at. */
export interface View {
    position: THREE.Vector3;
    target: THREE.Vector3;
}

/** Must match the panel sizes in styles.css. */
export const PANEL_WIDTH = 400;
export const ALERTS_WIDTH = 360;
export const MOBILE_BREAKPOINT = 760;
export const SHEET_HEIGHT_RATIO = 0.68;

export const FLY_DURATION_MS = 1100;

/** Camera angle from straight up when framing a machine: 55° means looking down at it at about 35°. */
export const FRAMING_POLAR = THREE.MathUtils.degToRad(55);

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Share of the canvas, in width and height, that a view has to fit into. */
export interface Visible {
    width: number;
    height: number;
}

/**
 * Distance at which a sphere of `radius` fits, with some margin, into the
 * visible part of the canvas. `fovDeg` is the camera's vertical field of view
 * and `aspect` the full canvas's width / height.
 */
export function framingDistance(radius: number, fovDeg: number, aspect: number, visible: Visible = { width: 1, height: 1 }, margin = 1.6): number {
    const t = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
    const vHalf = Math.atan(t * visible.height);
    const hHalf = Math.atan(t * aspect * visible.width);
    return (radius / Math.sin(Math.min(vHalf, hHalf))) * margin;
}

/** Which overlays cover the 3D view: the details panel (right) and the alert list (left). */
export interface Overlays {
    details: boolean;
    alerts: boolean;
}

/** Widths in px that the overlays cover on the left and right of a wide screen. */
function coveredWidths(width: number, overlays: Overlays): { left: number; right: number } {
    const right = overlays.details ? Math.min(PANEL_WIDTH, width) : 0;
    const left = overlays.alerts ? Math.min(ALERTS_WIDTH, Math.max(0, width - right)) : 0;
    return { left, right };
}

/**
 * Pixel shift of the rendered image so the scene's centre sits in the part of
 * the canvas the overlays leave visible: between the alert list and the side
 * panel on wide screens, above the bottom sheet on phones. (On phones the
 * alert list covers the whole screen, so it does not shift anything.)
 */
export function panelViewOffset(width: number, height: number, overlays: Overlays): { x: number; y: number } {
    if (width <= MOBILE_BREAKPOINT) return { x: 0, y: overlays.details ? (height * SHEET_HEIGHT_RATIO) / 2 : 0 };
    const { left, right } = coveredWidths(width, overlays);
    return { x: (right - left) / 2, y: 0 };
}

/** The part of the canvas the overlays leave visible, as fractions of its width and height. */
export function visibleArea(width: number, overlays: Overlays): Visible {
    if (width <= MOBILE_BREAKPOINT) return { width: 1, height: overlays.details ? 1 - SHEET_HEIGHT_RATIO : 1 };
    const { left, right } = coveredWidths(width, overlays);
    return { width: Math.max(0.2, (width - left - right) / width), height: 1 };
}

/** Closest the camera gets when framing; nearer than this the models look blocky. */
export const MIN_FRAMING_DISTANCE = 5.5;

/** Wraps an angle difference into [-π, π] so the camera always takes the short way round. */
export const shortestAngle = (from: number, to: number): number => {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
};

const sFrom = new THREE.Spherical();
const sTo = new THREE.Spherical();
const offset = new THREE.Vector3();

/**
 * Interpolates between two views at `k` (0..1). The target moves in a straight
 * line while the camera orbits around it on a sphere, so the flight curves
 * over the hall instead of cutting through machines.
 */
export function interpolateView(from: View, to: View, k: number, out: View): View {
    out.target.lerpVectors(from.target, to.target, k);
    sFrom.setFromVector3(offset.subVectors(from.position, from.target));
    sTo.setFromVector3(offset.subVectors(to.position, to.target));
    const radius = THREE.MathUtils.lerp(sFrom.radius, sTo.radius, k);
    const phi = THREE.MathUtils.lerp(sFrom.phi, sTo.phi, k);
    const theta = sFrom.theta + shortestAngle(sFrom.theta, sTo.theta) * k;
    out.position.setFromSphericalCoords(radius, phi, theta).add(out.target);
    return out;
}

/**
 * The view that frames a box: looking at its centre from the camera's current
 * compass direction, at a fixed downward angle, close enough to fill the view.
 */
export function framingView(
    box: THREE.Box3,
    current: View,
    fovDeg: number,
    aspect: number,
    visible: Visible,
    minDistance: number,
    maxDistance: number,
): View {
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const target = sphere.center.clone();
    target.y = Math.max(0.4, box.min.y + (box.max.y - box.min.y) * 0.4);
    const theta = new THREE.Spherical().setFromVector3(offset.subVectors(current.position, current.target)).theta;
    const distance = THREE.MathUtils.clamp(framingDistance(sphere.radius, fovDeg, aspect, visible), minDistance, maxDistance);
    const position = new THREE.Vector3().setFromSphericalCoords(distance, FRAMING_POLAR, theta).add(target);
    return { position, target };
}