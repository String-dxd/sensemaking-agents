// `typeof` guard so the module is safe to import in non-browser
// environments (SSR, Node CLI tools). Activation still requires
// a real browser session.
//
// Production gate: the `#debug` hash is a dev-only escape hatch that
// exposes the persistence import/export/clear actions + the engine's
// tweakable knobs. If a production build ever fails to detect
// `import.meta.env.DEV` (env-var miss, accidentally untranspiled in
// a server bundle, etc.), default closed — the overlay should NOT
// ship to end users. The strict `=== true` keeps a missing/undefined
// env from opening it.
const debugRequested = typeof import.meta !== 'undefined'
    && import.meta.env
    && import.meta.env.DEV === true
    && typeof location !== 'undefined'
    && location.hash === '#debug'

let UI = null
let Stats = null

if(debugRequested)
{
    const [uiModule, statsModule] = await Promise.all([
        import('./UI.js'),
        import('./Stats.js'),
    ])
    UI = uiModule.default
    Stats = statsModule.default
}

export default class Debug
{
    static instance

    static getInstance()
    {
        return Debug.instance
    }

    constructor()
    {
        if(Debug.instance)
            return Debug.instance

        Debug.instance = this

        this.active = false

        if(debugRequested)
        {
            this.activate()
        }
    }

    activate()
    {
        if(this.active)
            return

        if(!UI || !Stats)
            return

        this.active = true
        this.ui = new UI()
        this.stats = new Stats()
    }
}
