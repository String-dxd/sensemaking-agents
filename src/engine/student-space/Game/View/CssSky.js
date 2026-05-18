import State from '../State/State.js'

const rgbToCss = ([r, g, b]) => `rgb(${r | 0},${g | 0},${b | 0})`
const clamp01 = (v) => Math.max(0, Math.min(1, v))

export default class CssSky
{
    constructor()
    {
        this.state = State.getInstance()
        this.body = document.body
        this.haze = document.getElementById('sky-haze')
        this.rays = document.getElementById('sky-rays')
        // Last applied palette signature — skip CSS writes when nothing changed.
        // applyDayNight in legacy ran on every state change; we run every frame so
        // this dedupe avoids ~60 redundant CSSOM touches per second.
        this.lastSig = null
    }

    update()
    {
        const s = this.state.day.currentState
        if(!s) return

        // Mood-bias is now applied upstream in DayCycle.update(), so `s.skyBottom`
        // already includes any active mood pin. This stays as a plain consumer.
        const sb = s.skyBottom

        // Sky-mid is the bright cyan band between zenith and horizon. Tinyskies
        // uses several cyan stops in daylight; this 3-stop CSS sky recreates
        // that band only during full day so sunset/night can keep their warmer
        // and purpler gradients.
        const avg = [
            (s.skyTop[0] + sb[0]) * 0.5,
            (s.skyTop[1] + sb[1]) * 0.5,
            (s.skyTop[2] + sb[2]) * 0.5,
        ]
        const dayBand = (s.hour >= 6 && s.hour <= 16.5) ? clamp01(s.sunInt) * 0.85 : 0
        const cyan = [96, 216, 232]
        const skyMid = [
            avg[0] * (1 - dayBand) + cyan[0] * dayBand,
            avg[1] * (1 - dayBand) + cyan[1] * dayBand,
            avg[2] * (1 - dayBand) + cyan[2] * dayBand,
        ]

        const sig = `${s.skyTop.join(',')}|${skyMid.join(',')}|${sb.join(',')}|${s.isNight ? 1 : 0}`
        if(sig === this.lastSig) return
        this.lastSig = sig

        this.body.style.setProperty('--sky-top', rgbToCss(s.skyTop))
        this.body.style.setProperty('--sky-mid', rgbToCss(skyMid))
        this.body.style.setProperty('--sky-bottom', rgbToCss(sb))
        this.body.classList.toggle('is-night', s.isNight)
    }
}
