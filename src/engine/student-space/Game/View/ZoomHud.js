import View from './View.js'

/**
 * Right-bottom user-facing chrome — three responsibilities, one column:
 *
 *   · Zoom in / out  — wrap OrbitControls' dolly for tap-only users
 *   · Reset view     — smooth tween back to the default framing
 *   · Sound toggle   — master mute/unmute for ambient + rain SFX
 *
 * Each button uses the shared .zoom-hud__btn rule (white-glass tier;
 * see style.css), so a future control added here picks up the same
 * styling for free.
 *
 * Keyboard: "=" / "+" zoom in, "-" / "_" zoom out, "0" reset view,
 * "m" toggle mute. All suppressed while the student is typing in an
 * input/textarea/contenteditable.
 */
const ZOOM_STEP_IN  = 0.85
const ZOOM_STEP_OUT = 1 / ZOOM_STEP_IN

// SVGs are inlined so the bundle stays asset-free.
const ICON_RESET = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M3 12h0M12 3v18M21 12h0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="12" cy="12" r="1.4" fill="currentColor"/>
</svg>`
const ICON_SOUND_ON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M4 9v6h3l5 4V5L7 9H4Z" fill="currentColor"/>
    <path d="M15 9.2a3.5 3.5 0 0 1 0 5.6M17.6 6.4a7.5 7.5 0 0 1 0 11.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`
const ICON_SOUND_OFF = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M4 9v6h3l5 4V5L7 9H4Z" fill="currentColor"/>
    <path d="M16 9l5 5M21 9l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
</svg>`

export default class ZoomHud
{
    constructor()
    {
        const wrap = document.createElement('div')
        wrap.className = 'zoom-hud'
        wrap.innerHTML = `
            <button class="zoom-hud__btn" type="button" data-action="zoom-in"   aria-label="Zoom in">+</button>
            <button class="zoom-hud__btn" type="button" data-action="zoom-out"  aria-label="Zoom out">−</button>
            <button class="zoom-hud__btn" type="button" data-action="reset"     aria-label="Reset view">${ICON_RESET}</button>
            <button class="zoom-hud__btn zoom-hud__btn--icon" type="button" data-action="sound" aria-label="Toggle sound" data-on="1">${ICON_SOUND_ON}</button>
        `
        document.body.appendChild(wrap)

        this.root = wrap
        this.soundBtn = wrap.querySelector('[data-action="sound"]')

        // Listener refs kept on `this` so dispose() can detach them. The
        // window-level keydown listener is the leak risk: without explicit
        // teardown it survives root.remove() and keeps the closure (and the
        // whole subsystem) alive across remounts.
        this._onClick = (event) =>
        {
            const btn = event.target.closest('.zoom-hud__btn')
            if(!btn) return
            this._dispatch(btn.dataset.action)
        }
        wrap.addEventListener('click', this._onClick)

        this._onKeyDown = (event) =>
        {
            if(this._isTyping(event.target)) return
            if(event.key === '+' || event.key === '=')      { this._dispatch('zoom-in');  event.preventDefault() }
            else if(event.key === '-' || event.key === '_') { this._dispatch('zoom-out'); event.preventDefault() }
            else if(event.key === '0')                       { this._dispatch('reset');    event.preventDefault() }
            else if(event.key === 'm' || event.key === 'M')  { this._dispatch('sound');    event.preventDefault() }
        }
        window.addEventListener('keydown', this._onKeyDown)

        // Sync the sound button icon when the Sound module changes state
        // (other surfaces, persistence on reload). View constructs Sound
        // before this class, so the singleton is ready here. The
        // unsubscribe fn is held for dispose() so we drop the closure too.
        const view = View.getInstance()
        if(view.sound)
        {
            this._renderSoundIcon(view.sound.muted)
            this._offMuteChange = view.sound.onMuteChange(muted => this._renderSoundIcon(muted))
        }
    }

    _dispatch(action)
    {
        const view = View.getInstance()
        switch(action)
        {
            case 'zoom-in':  view.camera.zoomBy(ZOOM_STEP_IN);  break
            case 'zoom-out': view.camera.zoomBy(ZOOM_STEP_OUT); break
            case 'reset':    view.camera.resetToDefault();      break
            case 'sound':    view.sound?.toggleMuted();         break
        }
    }

    _renderSoundIcon(muted)
    {
        this.soundBtn.innerHTML = muted ? ICON_SOUND_OFF : ICON_SOUND_ON
        this.soundBtn.dataset.on = muted ? '0' : '1'
    }

    _isTyping(el)
    {
        if(!el) return false
        const tag = el.tagName
        return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
    }

    update() {}

    dispose()
    {
        if(this._onKeyDown)
        {
            try { window.removeEventListener('keydown', this._onKeyDown) } catch(_) {}
            this._onKeyDown = null
        }
        if(this._onClick && this.root)
        {
            try { this.root.removeEventListener('click', this._onClick) } catch(_) {}
            this._onClick = null
        }
        if(this._offMuteChange)
        {
            try { this._offMuteChange() } catch(_) {}
            this._offMuteChange = null
        }
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
        this.soundBtn = null
    }
}
