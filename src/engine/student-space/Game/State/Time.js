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

        this.rawDelta = current - this.current
        this.delta = this.rawDelta
        this.elapsed += this.delta
        this.current = current

        if(this.delta > 60 / 1000)
        {
            this.delta = 60 / 1000
        }
    }
}
