import State from '../State/State.js'

const UPDATE_INTERVAL_SECONDS = 0.25

export default class FpsOverlay
{
    constructor({ mount = document.body } = {})
    {
        this.state = State.getInstance()
        this.lastUpdateAt = -Infinity
        this.lastFps = null
        this.lastTier = null

        const root = document.createElement('div')
        root.className = 'fps-overlay'
        root.setAttribute('aria-label', 'Frames per second')
        root.innerHTML = `
            <span class="fps-overlay__title">performance</span>
            <span class="fps-overlay__metric">
                <span class="fps-overlay__value">--</span>
                <span class="fps-overlay__label">fps</span>
            </span>
        `
        mount.prepend(root)

        this.root = root
        this.valueEl = root.querySelector('.fps-overlay__value')
        this.labelEl = root.querySelector('.fps-overlay__label')
    }

    update()
    {
        if(!this.root || !this.valueEl) return

        const now = this.state.time?.elapsed ?? 0
        if(now - this.lastUpdateAt < UPDATE_INTERVAL_SECONDS) return
        this.lastUpdateAt = now

        const frameMs = this.state.performance?.smoothedFrameMs
            ?? ((this.state.time?.delta ?? 1 / 60) * 1000)
        const fps = Math.max(0, Math.round(1000 / Math.max(1, frameMs)))
        const tier = this.state.performance?.tier ?? ''

        if(fps === this.lastFps && tier === this.lastTier) return
        this.lastFps = fps
        this.lastTier = tier
        this.valueEl.textContent = String(fps)
        if(this.labelEl)
            this.labelEl.textContent = tier ? `fps · ${tier}` : 'fps'
    }

    dispose()
    {
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
        this.valueEl = null
        this.labelEl = null
    }
}
