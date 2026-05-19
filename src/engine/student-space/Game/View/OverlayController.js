/**
 * Single source of truth for "which sheet/overlay is open right now."
 *
 * Each sheet registers itself with {open(opts), close()}; opening one
 * exclusive sheet auto-closes whatever exclusive sheet was previously
 * active, so we can never have two full-viewport sheets fighting for the
 * viewport. The exclusive set covers every modal-ish surface:
 *
 *   profile · calendar · letters       — the three new TopNav sheets
 *   mood · ask · photo                  — the existing capture sheets
 *   chooser                             — the CaptureChooser popover
 *
 * `body.has-overlay` is the CSS hook the TopNav uses to hide itself when
 * one of the three full-viewport sheets is open — chooser/Ask/Photo/Mood
 * are tall-but-bottom-anchored and do collide with the top chrome, so the
 * `has-chooser` and `has-capture-sheet` body classes give the CSS room to
 * hide TopNav for those too.
 */

const SHEET_OVERLAY_CLASS = {
    profile:    'has-overlay',
    calendar:   'has-overlay',
    letters:    'has-overlay',
    trajectory: 'has-overlay',
    growth:     'has-overlay',
    mood:       'has-capture-sheet',
    ask:        'has-capture-sheet',
    photo:      'has-capture-sheet',
    chooser:    'has-chooser',
}

const EXCLUSIVE = new Set(Object.keys(SHEET_OVERLAY_CLASS))

export default class OverlayController
{
    static instance

    static getInstance() { return OverlayController.instance }

    constructor()
    {
        if(OverlayController.instance) return OverlayController.instance
        OverlayController.instance = this

        this.surfaces = new Map()  // name → { open, close }
        this.active   = null
    }

    /** Register a surface. `surface.open(opts?)` / `surface.close()`. */
    register(name, surface)
    {
        if(!name || !surface) return
        this.surfaces.set(name, surface)
    }

    /**
     * Open a surface by name. If another exclusive surface is already open
     * and the incoming surface is also exclusive, close the previous one
     * first — the body class is rewritten in one swap so CSS only animates
     * the diff between the two states.
     */
    open(name, opts)
    {
        if(!this.surfaces.has(name)) return
        if(this.active && this.active !== name && EXCLUSIVE.has(name) && EXCLUSIVE.has(this.active))
        {
            const prev = this.surfaces.get(this.active)
            if(prev?.close) prev.close()
        }
        this.active = name
        this._writeBodyClass(name)
        const surface = this.surfaces.get(name)
        if(surface?.open) surface.open(opts)
    }

    close(name)
    {
        const wasActive = this.active === name
        if(wasActive) this.active = null
        this._writeBodyClass(null)
        if(wasActive)
        {
            const surface = this.surfaces.get(name)
            if(surface?.close) surface.close()
        }
    }

    /**
     * A surface that has just self-closed (× button, Escape, tap-outside)
     * calls this to keep the controller's `active` + body class in sync.
     * Does NOT re-invoke surface.close — just records the transition.
     */
    noteClosed(name)
    {
        if(this.active !== name) return
        this.active = null
        this._writeBodyClass(null)
    }

    /** Read for visual debounce gates (e.g. "is anything full-screen?"). */
    isOpen(name) { return this.active === name }

    _writeBodyClass(name)
    {
        const body = document.body
        if(!body) return
        // Wipe all three flags, then set whichever applies.
        body.classList.remove('has-overlay', 'has-capture-sheet', 'has-chooser')
        if(name && SHEET_OVERLAY_CLASS[name])
        {
            body.classList.add(SHEET_OVERLAY_CLASS[name])
        }
    }
}
