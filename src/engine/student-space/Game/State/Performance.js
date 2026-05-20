const FRAME_60_MS = 1000 / 60

export const QUALITY_SETTINGS = Object.freeze({
    high: Object.freeze({
        tier: 'high',
        dprCap: 2,
        antialias: true,
        rainGlassCadence: 1,
        rainStreakScale: 1,
        ambientFrameModulo: 1,
    }),
    medium: Object.freeze({
        tier: 'medium',
        dprCap: 1.5,
        antialias: true,
        rainGlassCadence: 3,
        rainStreakScale: 0.58,
        ambientFrameModulo: 1,
    }),
    low: Object.freeze({
        tier: 'low',
        dprCap: 1,
        antialias: false,
        rainGlassCadence: 0,
        rainStreakScale: 0.32,
        ambientFrameModulo: 3,
    }),
})

const TIER_ORDER = ['low', 'medium', 'high']
const DEMOTE_AFTER_FRAMES = 75
const PROMOTE_AFTER_FRAMES = 210
const SLOW_FRAME_MS = {
    high: 19,
    medium: 23,
}
const FAST_FRAME_MS = {
    medium: 15.8,
    low: 16.2,
}

function finiteNumber(value, fallback = 0)
{
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
}

function normaliseTier(tier, fallback = 'high')
{
    return QUALITY_SETTINGS[tier] ? tier : fallback
}

export function getQualitySettings(tier)
{
    return QUALITY_SETTINGS[normaliseTier(tier)]
}

export function readDeviceHints()
{
    const nav = typeof navigator !== 'undefined' ? navigator : {}
    const win = typeof window !== 'undefined' ? window : {}
    return {
        devicePixelRatio: finiteNumber(win.devicePixelRatio, 1) || 1,
        hardwareConcurrency: finiteNumber(nav.hardwareConcurrency, 0),
        deviceMemory: finiteNumber(nav.deviceMemory, 0),
        width: finiteNumber(win.innerWidth, 0),
        height: finiteNumber(win.innerHeight, 0),
    }
}

export function selectInitialPerformanceTier(hints = {})
{
    const dpr = finiteNumber(hints.devicePixelRatio, 1) || 1
    const cores = finiteNumber(hints.hardwareConcurrency, 0)
    const memory = finiteNumber(hints.deviceMemory, 0)
    const width = finiteNumber(hints.width, 0)
    const height = finiteNumber(hints.height, 0)
    const smallestSide = width > 0 && height > 0 ? Math.min(width, height) : 0

    if((memory > 0 && memory <= 2) || (cores > 0 && cores <= 2))
        return 'low'
    if(dpr >= 3 && ((cores > 0 && cores <= 4) || (memory > 0 && memory <= 4) || smallestSide <= 600))
        return 'low'
    if(dpr >= 2 || (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4))
        return 'medium'
    return 'high'
}

export function selectPixelRatio(pixelRatio, tierOrSettings = 'high')
{
    const settings = typeof tierOrSettings === 'string'
        ? getQualitySettings(tierOrSettings)
        : tierOrSettings
    const ratio = finiteNumber(pixelRatio, 1) || 1
    const cap = finiteNumber(settings?.dprCap, 2) || 2
    return Math.min(Math.max(1, ratio), cap)
}

function adjacentTier(tier, direction)
{
    const idx = TIER_ORDER.indexOf(tier)
    if(idx < 0) return tier
    return TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, idx + direction))]
}

export default class PerformanceState
{
    constructor(options = {})
    {
        const initialTier = options.tier
            ? normaliseTier(options.tier)
            : selectInitialPerformanceTier(options.hints || readDeviceHints())
        this.tier = initialTier
        this.settings = getQualitySettings(this.tier)
        this.lastFrameMs = FRAME_60_MS
        this.smoothedFrameMs = FRAME_60_MS
        this.revision = 0
        this.frameIndex = 0

        this._sampleCount = 0
        this._slowFrames = 0
        this._fastFrames = 0
    }

    update(frameSeconds)
    {
        const frameMs = Math.max(1, finiteNumber(frameSeconds, FRAME_60_MS / 1000) * 1000)
        this.frameIndex++
        this.lastFrameMs = frameMs

        const alpha = this._sampleCount < 8 ? 0.35 : 0.08
        this.smoothedFrameMs += (frameMs - this.smoothedFrameMs) * alpha
        this._sampleCount++

        return this._evaluateTier()
    }

    setTier(tier)
    {
        const next = normaliseTier(tier, this.tier)
        if(next === this.tier) return false

        this.tier = next
        this.settings = getQualitySettings(next)
        this.revision++
        this._slowFrames = 0
        this._fastFrames = 0
        return true
    }

    shouldTickAmbient()
    {
        const modulo = Math.max(1, this.settings.ambientFrameModulo || 1)
        return this.frameIndex % modulo === 0
    }

    _evaluateTier()
    {
        const slowLimit = SLOW_FRAME_MS[this.tier]
        const fastLimit = FAST_FRAME_MS[this.tier]

        if(slowLimit && this.smoothedFrameMs > slowLimit)
        {
            this._slowFrames++
            this._fastFrames = 0
            if(this._slowFrames >= DEMOTE_AFTER_FRAMES)
                return this.setTier(adjacentTier(this.tier, -1))
            return false
        }

        if(fastLimit && this.smoothedFrameMs < fastLimit)
        {
            this._fastFrames++
            this._slowFrames = 0
            if(this._fastFrames >= PROMOTE_AFTER_FRAMES)
                return this.setTier(adjacentTier(this.tier, 1))
            return false
        }

        this._slowFrames = Math.max(0, this._slowFrames - 1)
        this._fastFrames = Math.max(0, this._fastFrames - 1)
        return false
    }
}
