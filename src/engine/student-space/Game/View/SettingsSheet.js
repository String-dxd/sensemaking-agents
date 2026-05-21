/**
 * Settings — bottom-of-rail catch-all that owns every admin UI in the
 * engine. Hosts the time/weather scrubber (HourHud), music switcher
 * (TrackPicker), companion picker (BirdPicker), Path Finder status
 * preview (StatusPreviewHud), and the Restart Onboarding action.
 *
 * Before this consolidation the four admin pickers each mounted their
 * own fixed-position dark-glass chip at body level. Bundling them under
 * Settings keeps the world view free of dev chrome and gives them a
 * single discoverable home.
 *
 * Built on the shared SheetChrome primitive (see CLAUDE.md "Sheet chrome
 * contract"). Pure DOM — no React, no state subscriptions beyond the
 * one Reset action and whatever each owned admin UI subscribes to itself.
 */

import SheetChrome from './SheetChrome.js'
import State from '../State/State.js'
import BirdPicker from './BirdPicker.js'
import TrackPicker from './TrackPicker.js'
import HourHud from './HourHud.js'
import StatusPreviewHud from './StatusPreviewHud.js'

export default class SettingsSheet
{
    constructor()
    {
        this.chrome = new SheetChrome({
            key:             'settings',
            sheetClassName:  'settings-sheet',
            withCloseButton: true,
            closeOnBackdrop: false,
            layout:          'split',
            header: {
                eyebrow:  'SETTINGS',
                title:    'Settings',
                subtitle: 'Tools for adjusting how the world behaves.',
            },
        })
        this.root = this.chrome.root
        this.isOpen = false

        // Left pane intro — brief orientation copy under the compact title.
        this.chrome.introSlot.innerHTML = `
            <p class="settings-sheet__intro-copy">
                Adjust how the world behaves and replay the first-run ceremony.
                Changes apply immediately and persist across sessions.
            </p>
        `

        // Render the structural shell. Each [data-mount] slot will become
        // the parent for an embedded admin UI. The Onboarding section keeps
        // its existing inline button.
        this.chrome.bodySlot.innerHTML = `
            <section class="settings-sheet__group" aria-labelledby="settings-world">
                <h2 id="settings-world" class="settings-sheet__group-title">World &amp; weather</h2>
                <p class="settings-sheet__row-help">Scrub the time of day and force weather effects.</p>
                <div class="settings-sheet__admin-slot" data-mount="hour"></div>
            </section>
            <section class="settings-sheet__group" aria-labelledby="settings-music">
                <h2 id="settings-music" class="settings-sheet__group-title">Music</h2>
                <p class="settings-sheet__row-help">Cycle through ambient tracks. Right-click the chip to step back.</p>
                <div class="settings-sheet__admin-slot" data-mount="track"></div>
            </section>
            <section class="settings-sheet__group" aria-labelledby="settings-companion">
                <h2 id="settings-companion" class="settings-sheet__group-title">Companion</h2>
                <p class="settings-sheet__row-help">Try a different bird companion.</p>
                <div class="settings-sheet__admin-slot" data-mount="bird"></div>
            </section>
            <section class="settings-sheet__group" aria-labelledby="settings-preview">
                <h2 id="settings-preview" class="settings-sheet__group-title">Path Finder preview</h2>
                <p class="settings-sheet__row-help">Force the identity-status quadrant the Path Finder uses to skin itself.</p>
                <div class="settings-sheet__admin-slot" data-mount="status"></div>
            </section>
            <section class="settings-sheet__group" aria-labelledby="settings-onboarding">
                <h2 id="settings-onboarding" class="settings-sheet__group-title">Onboarding</h2>
                <p class="settings-sheet__row-help">Replay the first-run ceremony from the beginning.</p>
                <div class="settings-sheet__row">
                    <button type="button" class="settings-sheet__action" data-action="restart-onboarding">
                        Restart onboarding
                    </button>
                </div>
            </section>
        `

        // Mount each admin UI into its section. Order matches the View.js
        // construction order that used to live there — HourHud first (it
        // reads state directly), then the View-dependent pickers.
        const slot = (key) => this.chrome.bodySlot.querySelector(`[data-mount="${key}"]`)
        this.hourHud           = new HourHud({          mount: slot('hour')   })
        this.trackPicker       = new TrackPicker({      mount: slot('track')  })
        this.birdPicker        = new BirdPicker({       mount: slot('bird')   })
        this.statusPreviewHud  = new StatusPreviewHud({ mount: slot('status') })

        this._onClick = (event) =>
        {
            const action = event.target.closest('[data-action]')?.dataset.action
            if(action === 'restart-onboarding') this._restartOnboarding()
        }
        this.chrome.bodySlot.addEventListener('click', this._onClick)
    }

    open(opts)
    {
        this.chrome?.open(opts)
        this.isOpen = true
    }

    close()
    {
        if(!this.isOpen) return
        this.isOpen = false
        this.chrome?.close()
    }

    /**
     * Per-frame tick. HourHud mirrors the live hour into its slider and
     * re-syncs the rain switch with the weather scheduler each frame; we
     * keep that tick alive whether or not the sheet is open so the panel
     * shows the right values the moment Settings re-opens.
     */
    update()
    {
        this.hourHud?.update?.()
    }

    _restartOnboarding()
    {
        try
        {
            const state = State.getInstance()
            state?.onboarding?.reset?.()
            // Flush so the wiped stage hits storage before reload, in case the
            // `#onboarding` hash path isn't honored (custom storage adapter,
            // private mode, etc.).
            state?.persistence?.flush?.()
        }
        catch(_) {}
        try
        {
            if(typeof window !== 'undefined')
            {
                window.location.hash = '#onboarding'
                window.location.reload()
            }
        }
        catch(_) {}
    }

    dispose()
    {
        if(this._onClick && this.chrome?.bodySlot)
        {
            try { this.chrome.bodySlot.removeEventListener('click', this._onClick) } catch(_) {}
        }
        this._onClick = null
        // Dispose owned admin UIs before tearing down chrome so their
        // detach paths see live DOM. Defensive `?.` so a partial construct
        // (e.g. ctor threw mid-way) can still finish disposing.
        try { this.hourHud?.dispose?.() }          catch(_) {}
        try { this.trackPicker?.dispose?.() }      catch(_) {}
        try { this.birdPicker?.dispose?.() }       catch(_) {}
        try { this.statusPreviewHud?.dispose?.() } catch(_) {}
        this.hourHud = null
        this.trackPicker = null
        this.birdPicker = null
        this.statusPreviewHud = null
        this.chrome?.dispose()
        this.chrome = null
        this.root = null
    }
}
