/**
 * Single source of truth for "which sheet/overlay is open right now."
 *
 * Compatibility bridge for non-routed overlays. React routes now render
 * full-viewport sheets directly, but the engine still needs one tiny
 * imperative channel for capture overlays opened from world interactions.
 * Each non-routed surface registers itself with {open(opts), close()}.
 * Opening one exclusive surface auto-closes the previous one so capture,
 * chooser, and routed-page transitions never stack.
 *
 *   profile · calendar · letters · trajectory · history
 *     — virtual routed-page keys; they do not register a surface anymore,
 *       but opening them closes any active capture overlay.
 *   mood · ask · photo                  — React capture sheets
 *   chooser                             — the React CaptureChooser popover
 *
 * `body.has-chooser` and `body.has-capture-sheet` remain compatibility
 * hooks for CSS that needs to know a non-routed overlay is open.
 */

const SHEET_OVERLAY_CLASS = {
    profile:    'has-overlay',
    calendar:   'has-overlay',
    letters:    'has-overlay',
    trajectory: 'has-overlay',
    history:    'has-overlay',
    settings:   'has-overlay',
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

    unregister(name, surface)
    {
        if(!name) return
        if(surface && this.surfaces.get(name) !== surface) return
        if(this.active === name) this.close(name)
        this.surfaces.delete(name)
    }

    /**
     * Open a surface by name. If another exclusive surface is already open
     * and the incoming surface is also exclusive, close the previous one
     * first — the body class is rewritten in one swap so CSS only animates
     * the diff between the two states.
     */
    open(name, opts)
    {
        if(!this.surfaces.has(name))
        {
            if(this.active && EXCLUSIVE.has(name) && EXCLUSIVE.has(this.active))
                this.close(this.active)
            return
        }
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

    /**
     * Return the active surface's root DOM node, or null if nothing is open.
     * Used by child overlays (DayDetailCard, future popovers) to portal
     * themselves into the active sheet's stacking context instead of
     * `document.body` — that way z-stacking falls out of DOM ancestry and
     * children never get visually trapped behind a higher-z parent sheet.
     * Every registered sheet surface exposes `.root`; non-sheet surfaces
     * (capture/chooser tiers) may not, in which case this returns null and
     * callers fall back to body.
     */
    getActiveRoot()
    {
        if(!this.active) return null
        const surface = this.surfaces.get(this.active)
        return surface?.root || null
    }

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
