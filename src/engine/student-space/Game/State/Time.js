export default class Time
{
    /**
     * Constructor
     */
    constructor()
    {
        this.start = Date.now() / 1000
        this.current = this.start
        this.elapsed = 0
        this.rawDelta = 16 / 1000
        this.delta = 16 / 1000
    }

    /**
     * Tick
     */
    update()
    {
        const current = Date.now() / 1000

        // Clamp before accumulating: `elapsed` is the animation clock every
        // shader / wander deadline reads, so a paused render loop (routed
        // sheet, hidden tab) must not hand it the whole pause at once — that
        // jumps every animation and expires every `elapsed + duration`
        // deadline the instant the world comes back. `rawDelta` keeps the
        // true wall-clock gap for anything that genuinely needs it.
        this.rawDelta = current - this.current
        this.delta = Math.min(this.rawDelta, 60 / 1000)
        this.elapsed += this.delta
        this.current = current
    }
}
