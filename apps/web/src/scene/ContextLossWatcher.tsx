import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useTwinStore } from '../state/store';

/**
 * If the graphics driver drops the WebGL context (a GPU reset, too many tabs
 * using WebGL, a phone reclaiming memory), the 3D view goes blank. Switch to
 * the floor plan instead, so the data stays visible.
 */
export function ContextLossWatcher() {
    const canvas = useThree((s) => s.gl.domElement);
    useEffect(() => {
        const onLost = () => useTwinStore.getState().fallBackTo2D('The graphics driver stopped the 3D view, so you are seeing the floor plan.');
        canvas.addEventListener('webglcontextlost', onLost);
        return () => canvas.removeEventListener('webglcontextlost', onLost);
    }, [canvas]);
    return null;
}