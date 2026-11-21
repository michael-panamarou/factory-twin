import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useTwinStore } from '../state/store';
import { FLY_DURATION_MS, easeInOutCubic, framingView, interpolateView, MIN_FRAMING_DISTANCE, panelViewOffset, visibleArea, type View } from './cameraMath.ts';

/** The parts of drei's OrbitControls the rig uses. */
interface OrbitControlsLike {
    target: THREE.Vector3;
    minDistance: number;
    maxDistance: number;
    update(): void;
    addEventListener(type: 'start', listener: () => void): void;
    removeEventListener(type: 'start', listener: () => void): void;
}

interface Flight {
    from: View;
    to: View;
    start: number;
    duration: number;
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const cloneView = (v: View): View => ({ position: v.position.clone(), target: v.target.clone() });

/**
 * Moves the camera when the selection changes: flies in to frame the selected
 * machine, and back to the overview when nothing is selected. It also shifts
 * the rendered image so the machine is centred in the part of the screen the
 * details panel leaves free. Any drag, scroll or pinch cancels a flight.
 */
export function CameraRig() {
    const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
    const controls = useThree((s) => s.controls) as unknown as OrbitControlsLike | null;
    const scene = useThree((s) => s.scene);
    const size = useThree((s) => s.size);
    const selectedId = useTwinStore((s) => s.selectedId);

    const home = useRef<View | null>(null);
    const flight = useRef<Flight | null>(null);
    const offset = useRef({ x: 0, y: 0 });
    const applied = useRef({ x: 0, y: 0, w: 0, h: 0 });
    const frame = useMemo<View>(() => ({ position: new THREE.Vector3(), target: new THREE.Vector3() }), []);

    // Remember the overview the app opened with, so deselecting can return to it.
    useEffect(() => {
        if (controls && !home.current) home.current = { position: camera.position.clone(), target: controls.target.clone() };
    }, [camera, controls]);

    // The user takes over as soon as they touch the controls.
    useEffect(() => {
        if (!controls) return;
        const cancel = () => {
            flight.current = null;
        };
        controls.addEventListener('start', cancel);
        return () => controls.removeEventListener('start', cancel);
    }, [controls]);

    useEffect(() => {
        if (!controls || !home.current) return;
        const current: View = { position: camera.position.clone(), target: controls.target.clone() };
        let to: View;
        if (selectedId) {
            const object = scene.getObjectByName(selectedId);
            if (!object) return;
            const box = new THREE.Box3().setFromObject(object);
            if (box.isEmpty()) return;
            const visible = visibleArea(size.width, true);
            const minDistance = Math.max(controls.minDistance, MIN_FRAMING_DISTANCE);
            to = framingView(box, current, camera.fov, size.width / size.height, visible, minDistance, controls.maxDistance);
        } else {
            to = cloneView(home.current);
        }
        flight.current = { from: current, to, start: performance.now(), duration: prefersReducedMotion() ? 0 : FLY_DURATION_MS };
        // Only a change of selection starts a flight; resizing does not.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, controls]);

    useFrame((_, delta) => {
        // Ease the image shift alongside the panel's slide-in.
        const want = panelViewOffset(size.width, size.height, useTwinStore.getState().selectedId !== null);
        const k = prefersReducedMotion() ? 1 : 1 - Math.exp(-delta * 10);
        const o = offset.current;
        o.x += (want.x - o.x) * k;
        o.y += (want.y - o.y) * k;
        if (Math.abs(want.x - o.x) < 0.5) o.x = want.x;
        if (Math.abs(want.y - o.y) < 0.5) o.y = want.y;

        const a = applied.current;
        if (a.x !== o.x || a.y !== o.y || a.w !== size.width || a.h !== size.height) {
            if (o.x === 0 && o.y === 0) camera.clearViewOffset();
            else camera.setViewOffset(size.width, size.height, o.x, o.y, size.width, size.height);
            applied.current = { x: o.x, y: o.y, w: size.width, h: size.height };
        }

        const f = flight.current;
        if (!f || !controls) return;
        const t = f.duration === 0 ? 1 : Math.min(1, (performance.now() - f.start) / f.duration);
        interpolateView(f.from, f.to, easeInOutCubic(t), frame);
        camera.position.copy(frame.position);
        controls.target.copy(frame.target);
        controls.update();
        if (t >= 1) flight.current = null;
    });

    return null;
}