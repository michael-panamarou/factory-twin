import { useEffect, useState } from 'react';
import { useTwinStore } from '../state/store';
import { perf, type PerfSnapshot } from '../scene/perf';
import { QUALITY_TIERS, type QualityTier } from '../scene/quality';
import './perf.css';

const LABEL: Record<QualityTier, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/** `?perf` in the URL shows this overlay. */
export const perfHudRequested = (search: string) => new URLSearchParams(search).has('perf');

/**
 * Frame rate, draw calls and the quality tier, with buttons to change it.
 * A tool for checking performance on real devices, not part of the normal UI.
 */
export function PerfHud() {
    const quality = useTwinStore((s) => s.quality);
    const setQuality = useTwinStore((s) => s.setQuality);
    const [stats, setStats] = useState<PerfSnapshot>(perf.snapshot);

    useEffect(() => {
        const id = setInterval(() => setStats(perf.snapshot), 500);
        return () => clearInterval(id);
    }, []);

    const fpsLevel = stats.fps >= 55 ? 'good' : stats.fps >= 30 ? 'ok' : 'poor';

    return (
        <section className="perf-hud" aria-label="Performance" data-testid="perf-hud">
            <dl>
                <div>
                    <dt>FPS</dt>
                    <dd className={`perf-hud__fps is-${fpsLevel}`}>{Math.round(stats.fps)}</dd>
                </div>
                <div>
                    <dt>Worst frame</dt>
                    <dd>{Math.round(stats.worstFrameMs)} ms</dd>
                </div>
                <div>
                    <dt>Draw calls</dt>
                    <dd data-testid="perf-calls">{stats.calls}</dd>
                </div>
                <div>
                    <dt>Triangles</dt>
                    <dd>{(stats.triangles / 1000).toFixed(1)}k</dd>
                </div>
                <div>
                    <dt>Resolution</dt>
                    <dd>{stats.dpr.toFixed(2)}×</dd>
                </div>
            </dl>
            <div className="segmented" role="group" aria-label="Graphics quality">
                <button type="button" aria-pressed={quality.auto} onClick={() => setQuality('auto')}>
                    Auto{quality.auto ? ` (${LABEL[quality.tier]})` : ''}
                </button>
                {QUALITY_TIERS.map((t) => (
                    <button key={t} type="button" aria-pressed={!quality.auto && quality.tier === t} onClick={() => setQuality(t)}>
                        {LABEL[t]}
                    </button>
                ))}
            </div>
        </section>
    );
}