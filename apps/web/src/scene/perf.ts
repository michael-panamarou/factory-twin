/** What the renderer did recently. Updated twice a second by <PerfProbe>, outside React. */
export interface PerfSnapshot {
    /** Frames per second over the last half second. */
    fps: number;
    /** Slowest frame in the last half second, ms. Spikes matter more than the average. */
    worstFrameMs: number;
    /** Draw calls in the last frame, shadow pass included. */
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
    /** Device pixel ratio the canvas renders at. */
    dpr: number;
}

export const perf: { snapshot: PerfSnapshot } = {
    snapshot: { fps: 0, worstFrameMs: 0, calls: 0, triangles: 0, geometries: 0, textures: 0, dpr: 1 },
};

/** Accumulates frame times and turns them into fps and worst-frame numbers. */
export class FrameTimer {
    private frames = 0;
    private elapsed = 0;
    private worst = 0;

    constructor(private readonly windowSeconds = 0.5) {}

    /** Adds one frame. Returns a result once a full window has passed, else null. */
    add(deltaSeconds: number): { fps: number; worstFrameMs: number } | null {
        this.frames++;
        this.elapsed += deltaSeconds;
        this.worst = Math.max(this.worst, deltaSeconds);
        if (this.elapsed < this.windowSeconds) return null;
        const result = { fps: this.frames / this.elapsed, worstFrameMs: this.worst * 1000 };
        this.frames = 0;
        this.elapsed = 0;
        this.worst = 0;
        return result;
    }
}