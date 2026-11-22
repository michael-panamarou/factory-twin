import { useEffect, useMemo } from 'react';
import { useTwinStore } from '../state/store';
import { DEFAULT_REPLAY_SPEED, REPLAY_SPEEDS, historyStart } from '../state/replay';
import { formatDuration, formatTime } from './format';
import './timeline.css';

/** How often a playing replay moves forward. The data is per second, so this is plenty. */
const STEP_MS = 100;

/** Moves a playing replay forward in real time (times the chosen speed). */
function useReplayClock(playing: boolean) {
    useEffect(() => {
        if (!playing) return;
        let last = performance.now();
        const id = setInterval(() => {
            const now = performance.now();
            useTwinStore.getState().advanceReplay(now - last);
            last = now;
        }, STEP_MS);
        return () => clearInterval(id);
    }, [playing]);
}

/**
 * Scrub back through the last hour and watch it again. Alerts are marked on
 * the track (taller marks for errors). Dragging to the right end, or LIVE,
 * returns to live data.
 */
export function Timeline() {
    const replay = useTwinStore((s) => s.replay);
    const end = useTwinStore((s) => s.lastUpdate);
    const start = useTwinStore((s) => historyStart(s.history));
    const alerts = useTwinStore((s) => s.alerts);
    const { seek, setReplayPlaying, setReplaySpeed, goLive } = useTwinStore.getState();
    useReplayClock(!!replay?.playing);

    const markers = useMemo(() => {
        if (start === null || end === null) return [];
        const span = Math.max(1, end - start);
        return alerts
            .filter((a) => a.severity !== 'info' && a.ts >= start && a.ts <= end)
            .map((a) => ({ id: a.id, severity: a.severity, left: ((a.ts - start) / span) * 100, title: `${a.machineId} · ${formatTime(a.ts)} · ${a.message}` }));
    }, [alerts, start, end]);

    if (start === null || end === null || end <= start) return null;

    const value = replay ? replay.time : end;
    const behind = end - value;
    const playing = !!replay?.playing;

    return (
        <section className={`timeline${replay ? ' is-replay' : ''}`} aria-label="Timeline" data-testid="timeline">
            <button
                type="button"
                className="timeline__play"
                onClick={() => setReplayPlaying(!playing)}
                aria-label={playing ? 'Pause replay' : replay ? 'Play replay' : 'Replay the last hour'}
                title={playing ? 'Pause' : replay ? 'Play' : 'Replay the last hour'}
            >
                <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
            </button>

            <div className="segmented timeline__speed" role="group" aria-label="Replay speed">
                {REPLAY_SPEEDS.map((speed) => (
                    <button
                        key={speed}
                        type="button"
                        aria-pressed={(replay?.speed ?? DEFAULT_REPLAY_SPEED) === speed}
                        onClick={() => setReplaySpeed(speed)}
                        disabled={!replay}
                    >
                        {speed}×
                    </button>
                ))}
            </div>

            <div className="timeline__track">
                <div className="timeline__markers" aria-hidden="true">
                    {markers.map((m) => (
                        <span key={m.id} className={`timeline__marker timeline__marker--${m.severity}`} style={{ left: `${m.left}%` }} title={m.title} />
                    ))}
                </div>
                <input
                    type="range"
                    min={start}
                    max={end}
                    step={1000}
                    value={value}
                    onChange={(e) => seek(Number(e.target.value))}
                    aria-label="Time"
                    aria-valuetext={replay ? `${formatTime(value)}, ${formatDuration(behind)} ago` : 'Live'}
                />
            </div>

            <div className="timeline__time" aria-live="off">
                {replay ? (
                    <>
                        <span className="timeline__clock">{formatTime(value)}</span>
                        <span className="timeline__behind">−{formatDuration(behind)}</span>
                    </>
                ) : (
                    <span className="timeline__clock">Last {formatDuration(end - start)}</span>
                )}
            </div>

            <button type="button" className="timeline__live" onClick={goLive} aria-pressed={!replay} disabled={!replay}>
                <span className="timeline__live-dot" aria-hidden="true" />
                Live
            </button>
        </section>
    );
}