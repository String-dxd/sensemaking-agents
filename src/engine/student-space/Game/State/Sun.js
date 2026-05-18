import Game from '../Game.js'
import State from './State.js'

export default class Sun
{
    constructor()
    {
        this.game = Game.getInstance()
        this.state = State.getInstance()

        this.position = { x: 0, y: 0, z: 0 }
    }

    update()
    {
        // mjurczyk-style arc from legacy student_space_island_v0.html (getSunPosition,
        // line 3011). Sun rises east at 6, peaks overhead at noon, sets west at 18,
        // dips below the horizon at night. We emit a unit-length direction because
        // Bruno's grass/sky/stars shaders sample uSunPosition as a normalized vector.
        const hour = this.state.day.hour
        const angle = ((hour - 6) / 12) * Math.PI - Math.PI / 2
        const x = Math.sin(-angle) * 0.9
        const y = Math.cos(angle)
        const z = 0.27 // slight forward tilt — preserves the legacy z=6 / radius=22 ratio
        const len = Math.hypot(x, y, z) || 1
        this.position.x = x / len
        this.position.y = y / len
        this.position.z = z / len
    }
}
