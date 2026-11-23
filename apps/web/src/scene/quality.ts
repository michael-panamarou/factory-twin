/** Graphics quality. The app picks one from the device and adjusts it to the frame rate. */
export type QualityTier = 'low' | 'medium' | 'high';
export const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high'];

export interface QualitySettings {
    /** Device-pixel-ratio range: the biggest cost on phones, whose screens are 2–3× dense. */
    dpr: [number, number];
    shadows: boolean;
    shadowMapSize: number;
    /** Only read when the canvas is created; WebGL cannot switch it later. */
    antialias: boolean;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
    high: { dpr: [1, 2], shadows: true, shadowMapSize: 2048, antialias: true },
    medium: { dpr: [1, 1.5], shadows: true, shadowMapSize: 1024, antialias: true },
    low: { dpr: [1, 1], shadows: false, shadowMapSize: 512, antialias: false },
};

/** What the browser tells us about the device. Every field is optional because support varies. */
export interface DeviceHints {
    /** Touch screen as the main pointer. */
    coarsePointer?: boolean;
    /** Shorter side of the screen in CSS px. */
    shortSide?: number;
    cores?: number;
    memoryGb?: number;
    /** The user asked to save data. */
    saveData?: boolean;
}

/** Best starting tier for a device: phones low, tablets and small machines medium, the rest high. */
export function detectTier(hints: DeviceHints): QualityTier {
    if (hints.saveData) return 'low';
    if (hints.coarsePointer && (hints.shortSide ?? Infinity) < 600) return 'low';
    if (hints.coarsePointer) return 'medium';
    if ((hints.cores ?? 8) <= 4 || (hints.memoryGb ?? 8) <= 4) return 'medium';
    return 'high';
}

/** Reads device hints from the browser, tolerating anything missing. */
export function readDeviceHints(): DeviceHints {
    if (typeof window === 'undefined') return {};
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    return {
        coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
        shortSide: Math.min(window.screen?.width || Infinity, window.screen?.height || Infinity),
        cores: nav.hardwareConcurrency || undefined,
        memoryGb: nav.deviceMemory,
        saveData: nav.connection?.saveData,
    };
}

/** `?quality=low|medium|high` fixes the tier and turns off automatic changes. */
export function qualityFromLocation(search: string): QualityTier | null {
    const value = new URLSearchParams(search).get('quality');
    return (QUALITY_TIERS as readonly string[]).includes(value ?? '') ? (value as QualityTier) : null;
}

export const stepDown = (tier: QualityTier): QualityTier => (tier === 'high' ? 'medium' : 'low');

/** One step up, but never above `ceiling` (the tier the device started at). */
export const stepUp = (tier: QualityTier, ceiling: QualityTier): QualityTier => {
    const next: QualityTier = tier === 'low' ? 'medium' : 'high';
    return QUALITY_TIERS.indexOf(next) > QUALITY_TIERS.indexOf(ceiling) ? tier : next;
};

export interface QualityState {
    tier: QualityTier;
    /** True when the app may change the tier by itself. */
    auto: boolean;
    /** Highest tier automatic changes may reach. */
    ceiling: QualityTier;
}

/** Starting quality: from the URL if given, otherwise detected from the device. */
export function initialQuality(search = typeof window === 'undefined' ? '' : window.location.search, hints: DeviceHints = readDeviceHints()): QualityState {
    const fixed = qualityFromLocation(search);
    if (fixed) return { tier: fixed, auto: false, ceiling: fixed };
    const tier = detectTier(hints);
    return { tier, auto: true, ceiling: tier };
}