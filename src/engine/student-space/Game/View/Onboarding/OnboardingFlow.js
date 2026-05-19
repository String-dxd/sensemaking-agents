/**
 * First-run ceremony orchestrator.
 *
 * Owns the stage progression (driven by `state.onboarding.stage`) and the
 * cross-fade transitions between surface components. Suspends the regular
 * chrome (TopNav, CaptureFab, hover affordances) while the ceremony is in
 * flight by toggling `body.is-onboarding`. Calls Kira's onboarding-mode
 * bypass on entry and reverts it on `done`.
 *
 * Each surface (Splash / EdupassLogin / Greeting / EggHatcher / FirstChat /
 * FirstMood / IslandReveal) has the same uniform contract:
 *
 *   class Surface {
 *     async mount(root, ctx) { ... build DOM, run entry anim }
 *     async unmount()        { ... run exit anim, remove DOM }
 *     setAdvance(cb)         { ... orchestrator pumps "next stage" through cb }
 *   }
 *
 * The orchestrator decides which surface owns each stage; some surfaces own
 * multiple stages (EggHatcher owns egg-color / egg-name / egg-hatch).
 *
 * See plan: /Users/jeongwondo/.claude/plans/steady-conjuring-panda.md
 */

import State from '../../State/State.js'

import EdupassLogin    from './EdupassLogin.js'
import Greeting        from './Greeting.js'
import EggHatcher      from './EggHatcher.js'
import FirstChat       from './FirstChat.js'
import FirstMood       from './FirstMood.js'
import IslandReveal    from './IslandReveal.js'
import { ONBOARDING_COPY } from './copy.js'

// Map persisted stage → which surface owns it. Surfaces are constructed
// lazily so a finished ceremony (stage='done') boots without any DOM.
const STAGE_OWNER = {
    'login':           'login',
    'greeting':        'greeting',
    'egg-color':       'egg',
    'egg-name':        'egg',
    'egg-hatch':       'egg',
    'first-chat':      'first-chat',
    'first-mood':      'first-mood',
    'first-grow':      'reveal',
    'tree-narration':  'reveal',
    'closing':         'reveal',
}

const LEGACY_COLDSTART_FLAG = 'studentSpace.firstArrivalSeen'

export default class OnboardingFlow
{
    static instance

    static getInstance() { return OnboardingFlow.instance }

    constructor(view)
    {
        if(OnboardingFlow.instance) return OnboardingFlow.instance
        OnboardingFlow.instance = this

        this.view  = view
        this.state = State.getInstance()
        this.onb   = this.state.onboarding

        this.reducedMotion = (typeof window !== 'undefined') &&
            window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

        // Cached surface instances (constructed on first need).
        this._surfaces = {}
        this._activeOwner = null
        this._activeSurface = null

        // Built lazily so a `done` boot pays nothing.
        this._root = null

        // Bind once so we can pass identity-stable refs to surfaces.
        this._advance = this._advance.bind(this)
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Kick off the ceremony. Called from View constructor when the onboarding
     * is not yet `done`. Resolves once the ceremony lands at `done`.
     */
    async start()
    {
        if(this.onb.isDone) return

        // Wake up — resume rules per plan §10.
        let stage = this.onb.stage
        if(stage === 'pending') stage = this._setStage('login')

        // Skip the dummy Edupass login when the host already resolved an
        // authenticated session (WorkOS, demo cookie, or dev-bypass). The
        // login surface exists for first-arrival sign-in; a returning
        // signed-in student should land at the greeting beat directly.
        if(stage === 'login' && this.state.auth?.isSignedIn)
        {
            stage = this._setStage('greeting')
        }

        // Cinematic stages replay from start if interrupted; configuration
        // stages resume in-state.
        const CINEMATIC = new Set(['egg-hatch', 'first-grow', 'tree-narration', 'closing'])
        if(CINEMATIC.has(stage)) {/* keep as-is; the surface's mount will replay its own animation */ }

        // If a first-mood pin was already committed (close-after-tap), fast-
        // forward to the next beat.
        if(stage === 'first-mood' && this.onb.firstMoodPinId)
        {
            stage = this._setStage('first-grow')
        }

        this._ensureRoot()
        document.body.classList.add('is-onboarding')

        // Park the world in clear midday so the landing reads as the canonical
        // island. IslandReveal still re-pins twilight for its own beats.
        try
        {
            this.state.weather?.setAmbient?.(false)
            this.state.weather?.setIntensity?.(0)
            this.state.day?.setManualHour?.(11.5)
        }
        catch(_) {}

        // Kira + dialogue enter onboarding mode for the duration.
        this.view.kira?.setOnboardingMode?.(true)
        this.view.kiraDialogue?.setOnboardingMode?.(true)

        // Run until completion. Each iteration mounts (or hands off to) the
        // surface owning the current stage and then waits for the persisted
        // stage to change before iterating. Mount itself returns after the
        // entry animation; user input or scripted beats are what advance
        // the stage.
        while(!this.onb.isDone)
        {
            const before = this.onb.stage
            await this._renderStage(before)
            // If the surface advanced synchronously during mount/setStage
            // (e.g. SplashOverlay auto-skipped under reduced motion), don't
            // wait — just iterate.
            if(this.onb.stage !== before || this.onb.isDone) continue
            await this._waitForStageChange(before)
        }

        await this._finish()
    }

    /** Resolves the next time `onb.stage` ticks to a value other than `from`. */
    _waitForStageChange(from)
    {
        return new Promise((resolve) =>
        {
            const unsub = this.onb.subscribe((event) =>
            {
                if(event.kind !== 'stage') return
                if(this.onb.stage === from) return
                unsub()
                resolve()
            })
        })
    }

    /**
     * Hard-skip the entire ceremony — debug-only entry. Used by lil-gui
     * `skip to done` button and (for the splash) the visible Skip text.
     */
    async skipAll()
    {
        await this._setStage('done')
    }

    // ── Stage rendering ────────────────────────────────────────────────────

    async _renderStage(stage)
    {
        const owner = STAGE_OWNER[stage]
        if(!owner)
        {
            console.warn(`[onboarding] unknown stage owner for "${stage}", forcing done`)
            await this._setStage('done')
            return
        }

        // If the same owner already holds the floor, let it move to its own
        // sub-stage without a teardown (EggHatcher does color → name → hatch
        // internally; FirstChat → FirstMood → IslandReveal are separate).
        if(this._activeOwner === owner && this._activeSurface?.setStage)
        {
            await this._activeSurface.setStage(stage)
            return
        }

        // Swap surfaces with a cross-fade.
        if(this._activeSurface)
        {
            await this._activeSurface.unmount?.()
            this._activeSurface = null
            this._activeOwner   = null
        }

        const surface = this._lazy(owner)
        surface.setAdvance(this._advance)
        await surface.mount(this._root, this._buildCtx(stage))
        this._activeSurface = surface
        this._activeOwner   = owner
    }

    _lazy(owner)
    {
        if(this._surfaces[owner]) return this._surfaces[owner]
        switch(owner)
        {
            case 'login':        this._surfaces[owner] = new EdupassLogin(this);  break
            case 'greeting':     this._surfaces[owner] = new Greeting(this);      break
            case 'egg':          this._surfaces[owner] = new EggHatcher(this);    break
            case 'first-chat':   this._surfaces[owner] = new FirstChat(this);     break
            case 'first-mood':   this._surfaces[owner] = new FirstMood(this);     break
            case 'reveal':       this._surfaces[owner] = new IslandReveal(this);  break
        }
        return this._surfaces[owner]
    }

    _buildCtx(stage)
    {
        return {
            stage,
            copy:          ONBOARDING_COPY,
            reducedMotion: this.reducedMotion,
            state:         this.state,
            profile:       this.state.profile,
            onboarding:    this.onb,
            moodPins:      this.state.moodPins,
            view:          this.view,
            // The flow's stage setter — surfaces call this when their internal
            // sub-stage advances (e.g. color → name → hatch within EggHatcher).
            setStage:      (next) => this._setStage(next),
        }
    }

    _setStage(next)
    {
        return this.onb.setStage(next)
    }

    _advance(next)
    {
        // Surfaces invoke this to push the persisted stage forward. The main
        // loop in `start()` polls onb.stage between awaits and picks up the
        // new owner on the next iteration.
        this.onb.setStage(next)
    }

    // ── Finish ─────────────────────────────────────────────────────────────

    async _finish()
    {
        // The legacy ColdStart "seen" flag — the ceremony has stood in for
        // the old twilight pin, so subsequent boots should land at wall-clock.
        try { localStorage.setItem(LEGACY_COLDSTART_FLAG, '1') } catch(_) {}

        // Release the sky back to wall-clock if the reveal beats left it
        // pinned at twilight, and let the ambient weather scheduler take over.
        this.state.day?.clearManualHour?.()
        try { this.state.weather?.setAmbient?.(true) } catch(_) {}

        // Tear down active surface (if any).
        if(this._activeSurface)
        {
            await this._activeSurface.unmount?.()
            this._activeSurface = null
            this._activeOwner   = null
        }

        // Restore the chrome.
        document.body.classList.remove('is-onboarding')

        // Hand Kira back to its autonomous channel.
        this.view.kira?.setOnboardingMode?.(false)
        this.view.kiraDialogue?.setOnboardingMode?.(false)

        // Bring back any chrome that was hidden. View.js handles the actual
        // suspendChrome/resumeChrome — here we just signal that the ceremony
        // is over via the body class removal above.

        if(this._root)
        {
            this._root.remove()
            this._root = null
        }
    }

    // ── DOM root ───────────────────────────────────────────────────────────

    _ensureRoot()
    {
        if(this._root) return this._root
        const host = document.querySelector('.game') || document.body
        const el = document.createElement('div')
        el.className = 'onboarding-root'
        el.setAttribute('role', 'dialog')
        el.setAttribute('aria-modal', 'true')
        host.appendChild(el)
        this._root = el
        return el
    }

    /**
     * Tear down ceremony scaffolding when the host unmounts mid-flow
     * (e.g. React StrictMode dev double-effect, HMR, route change).
     * Without this, the `is-onboarding` body class survives and the
     * `.onboarding-root` div piles up across remounts.
     *
     * Distinct from `_finish()` — dispose does NOT advance state or
     * touch persistence; the ceremony is paused, not completed. On the
     * next mount, OnboardingFlow.start() resumes from the persisted
     * stage per the wake-up rules.
     */
    dispose()
    {
        try { this._activeSurface?.unmount?.() } catch(_) {}
        this._activeSurface = null
        this._activeOwner   = null

        try
        {
            if(typeof document !== 'undefined' && document.body)
                document.body.classList.remove('is-onboarding')
        }
        catch(_) {}

        if(this._root)
        {
            try { this._root.remove() } catch(_) {}
            this._root = null
        }
    }
}
