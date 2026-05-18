import Stats from './Stats.js'
import UI from './UI.js'

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

        // `typeof` guard so the module is safe to import in non-browser
        // environments (SSR, Node CLI tools). Activation still requires
        // a real browser session.
        if(typeof location !== 'undefined' && location.hash === '#debug')
        {
            this.activate()
        }
    }

    activate()
    {
        if(this.active)
            return
            
        this.active = true
        this.ui = new UI()
        this.stats = new Stats()
    }
}
