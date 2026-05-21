import State from './State.js'

/**
 * Wind — the shared breath of the island. One slowly-modulated 0..1 "gust"
 * value that grass, flowers, trees, and particles all multiply their sway
 * amplitude by, so when the wind picks up everything leans in together and
 * when it lulls everything settles. Two combined slow sines give an
 * organic feel without obvious periodicity.
 *
 * Range: ~0.35 (calm) to ~1.0 (gust). Per DESIGN.md motion-rules envelope
 * the underlying frequencies stay sub-1Hz.
 */
export default class Wind
{
    constructor()
    {
        this.state = State.getInstance()
        this.gust  = 0.7
    }

    update()
    {
        const t = this.state.time.elapsed
        // Two slow sines, offset and at incommensurate frequencies, so the
        // gust never lands on the same value twice in a row.
        const a = Math.sin(t * 0.18) * 0.5 + 0.5         // ~35 s period
        const b = Math.sin(t * 0.43 + 1.7) * 0.5 + 0.5   // ~15 s period
        const mix = a * 0.65 + b * 0.35
        this.gust = 0.35 + mix * 0.65                    // → 0.35 .. 1.00
    }
}
