import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { FrameTimer, perf, type PerfSnapshot } from './perf';

declare global {
    interface Window {
        /** Latest renderer numbers, for the perf overlay, tests and the console. */
        __factoryTwinStats?: () => PerfSnapshot;
    }
}

/** Measures frame rate and renderer load. Renders nothing and costs next to nothing. */
export function PerfProbe() {
    const gl = useThree((s) => s.gl);
    const timer = useMemo(() => new FrameTimer(), []);

    useFrame((_, delta) => {
        const result = timer.add(delta);
        if (!result) return;
        // renderer.info is reset at the start of each render, so here it still holds the previous frame.
        const { render, memory } = gl.info;
        perf.snapshot = {
            ...result,
            calls: render.calls,
            triangles: render.triangles,
            geometries: memory.geometries,
            textures: memory.textures,
            dpr: gl.getPixelRatio(),
        };
    });

    useEffect(() => {
        window.__factoryTwinStats = () => perf.snapshot;
        return () => {
            delete window.__factoryTwinStats;
        };
    }, []);

    return null;
}