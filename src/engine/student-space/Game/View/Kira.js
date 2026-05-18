import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'

/**
 * Kira — the resident island bird. Mesh + species data ported from the
 * sibling student-space-bird studio (the "standing companion" build).
 * Defaults to the Flame Bower; `setSpecies(id)` swaps to any of the seven
 * variants without disturbing position, wander state, or dependents.
 *
 * Class name + group surface preserved so KiraDialogue / KiraNarrator /
 * HoverProbe keep working unchanged. `getHeadWorldPosition()` is the new
 * affordance so the speech bubble anchors to the head (not the group
 * origin, which sits at the feet for the taller standing build).
 *
 * Movement: calmer than the previous procedural Kira. Grounded walk only
 * — no parabolic hops. The bird stands most of the time, occasionally
 * walks toward a flower waypoint and settles. PERCHED_MIN_S /
 * WANDER_CHANCE inherited from the original; HOP_PEAK is gone.
 */

const PERCHED_MIN_S = 12        // longer settle before considering a walk
const WANDER_CHANCE = 0.25      // per-second odds of starting an outing
const WANDER_STOPS  = 2         // ground waypoints per outing (plus return)
const WALK_SPEED    = 0.45      // units/sec — gentle stride
const ARRIVE_DIST   = 0.06
const TURN_RATE     = 2.4
const SETTLE_MIN_S  = 1.8
const SETTLE_MAX_S  = 3.2
const ROAM_MIN_R    = 0.9
const ROAM_MAX_R    = 2.2

/* ---------- species catalog (subset of fields needed for standing) ---------- */

export const SPECIES = [
    {
        id: 'flame',
        displayName: 'Flame Bower',
        shape:   { crest: 'pointed', tail: 'long-fan',  beak: 'slender' },
        palette: { back: '#e63946', belly: '#ffd3a5', accent: '#ffb347', beak: '#2a1a14', legs: '#3a2418', eye: '#1a1a1a' },
    },
    {
        id: 'ember',
        displayName: 'Ember Bower',
        shape:   { crest: 'curve',   tail: 'short-fan', beak: 'stout'   },
        palette: { back: '#f4791f', belly: '#ffe0a8', accent: '#ffd07a', beak: '#2a1a14', legs: '#3a2418', eye: '#1a1a1a' },
    },
    {
        id: 'regent',
        displayName: 'Regent Bower',
        shape:   { crest: 'none',    tail: 'square',    beak: 'stout'   },
        palette: { back: '#ffd23f', belly: '#fff3a3', accent: '#f4a261', beak: '#2a1f10', legs: '#3a2818', eye: '#1a1a1a' },
    },
    {
        id: 'emerald',
        displayName: 'Emerald Bower',
        shape:   { crest: 'tuft',    tail: 'forked',    beak: 'slender' },
        palette: { back: '#3aab48', belly: '#dff0a5', accent: '#f4e07a', beak: '#1a2818', legs: '#2a3a22', eye: '#1a1a1a' },
    },
    {
        id: 'satin',
        displayName: 'Satin Bower',
        shape:   { crest: 'none',    tail: 'short-fan', beak: 'stout'   },
        palette: { back: '#2c7dd2', belly: '#cfe3f2', accent: '#5fb8ff', beak: '#1a2a3a', legs: '#1a2830', eye: '#1a1a1a' },
    },
    {
        id: 'twilight',
        displayName: 'Twilight Bower',
        shape:   { crest: 'tuft',    tail: 'pointed',   beak: 'slender' },
        palette: { back: '#5a4cb8', belly: '#d0c8ec', accent: '#9a8aff', beak: '#1a1a2a', legs: '#2a2440', eye: '#0a0a0a' },
    },
    {
        id: 'lilac',
        displayName: 'Lilac Bower',
        shape:   { crest: 'fan',     tail: 'long-fan',  beak: 'stout'   },
        palette: { back: '#a065d8', belly: '#ecd8f2', accent: '#c08ee8', beak: '#2a1d3a', legs: '#3a2848', eye: '#1a1a1a' },
    },
]

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]))

/* ---------- standing-build character config (base + per-species overrides) ---------- */

const STANDING_BASE = {
    scale: 0.74,
    body:        { x: 0.72, y: 0.88, z: 0.58 },
    bodyY:       0.62,
    belly:       { y: 0.37, z: 0.35 },
    bellyX:      0.39,
    bellyY:      0.58,
    neckTop:     0.11,
    neckBottom:  0.13,
    neckH:       0.16,
    neckY:       1.08,
    headX:       0.10,
    headY:       1.34,
    headSize:    0.42,
    headScale:   { x: 1.08, y: 1.02, z: 1.0 },
    faceY:       0.74,
    faceZ:       0.86,
    faceYOffset: -0.02,
    faceColor:   null,
    cheekSize:   0.13,
    cheekZ:      0.31,
    beak:        { length: 0.40, width: 0.18, height: 0.15, gape: 0.042, open: 0.05 },
    beakKeepsDark: false,
    eyeWhite:    0.20,
    pupil:       0.13,
    eyeSquash:   0.42,
    eyeY:        0.17,
    eyeZ:        0.275,
    eyeTilt:     0,
    pupilScaleX: 0.70,
    pupilScaleY: 1.08,
    pupilOffsetY: -0.02,
    upperLid:    0.08,
    lowerLid:    0.00,
    lidColor:    null,
    eyeRingColor: null,
    lash:        false,
    shine:       false,
    brow:        -0.08,
    browW:       0.18,
    crestScale:  0.82,
    wing: { x: 0.02, y: 0.82, z: 0.31, length: 0.56, rootW: 0.13, tipW: 0.38, rest: -0.10, feathers: 3 },
    leg:  { y: 0.34, z: 0.20, len: 0.32, toe: 0.14 },
    tail: { x: 0.40, y: 0.55, scaleX: 0.36, scaleY: 0.50, scaleZ: 0.50 },
}

const STANDING_OVERRIDES = {
    flame: {
        body: { x: 0.70, y: 0.86, z: 0.56 },
        headScale: { x: 1.06, y: 1.02, z: 0.98 },
        faceColor: '#ffe6a2',
        beak: { length: 0.44, width: 0.20, height: 0.16, gape: 0.050, open: 0.10 },
        eyeRingColor: '#fff4bf',
        pupilScaleY: 1.18,
        upperLid: 0.03,
        brow: -0.14,
        wing: { x: 0.01, y: 0.82, z: 0.31, length: 0.60, rootW: 0.12, tipW: 0.42, rest: -0.12, feathers: 4 },
        tail: { x: 0.43, y: 0.55, scaleX: 0.42, scaleY: 0.56, scaleZ: 0.62 },
        crestScale: 0.90,
    },
    ember: {
        scale: 0.72,
        body: { x: 0.66, y: 0.92, z: 0.62 },
        bodyY: 0.61,
        headY: 1.32,
        headSize: 0.43,
        headScale: { x: 1.08, y: 0.98, z: 1.04 },
        cheekSize: 0.15,
        faceColor: '#fff0c8',
        beak: { length: 0.36, width: 0.20, height: 0.14, gape: 0.036, open: 0.02 },
        eyeWhite: 0.19, pupil: 0.12,
        eyeSquash: 0.50, eyeTilt: -0.18,
        pupilScaleX: 0.82, pupilScaleY: 0.72,
        upperLid: 0.42, lowerLid: 0.05,
        brow: -0.06,
        wing: { x: 0.01, y: 0.79, z: 0.34, length: 0.50, rootW: 0.14, tipW: 0.36, rest: -0.04, feathers: 3 },
        leg:  { y: 0.34, z: 0.22, len: 0.28, toe: 0.13 },
        tail: { x: 0.38, y: 0.52, scaleX: 0.30, scaleY: 0.46, scaleZ: 0.46 },
    },
    regent: {
        scale: 0.73,
        body: { x: 0.70, y: 0.82, z: 0.56 },
        headSize: 0.41,
        headScale: { x: 1.10, y: 0.98, z: 1.0 },
        faceY: 0.66,
        faceColor: '#fff7bf',
        beak: { length: 0.40, width: 0.22, height: 0.15, gape: 0.060, open: 0.12 },
        beakKeepsDark: true,
        eyeWhite: 0.19, pupil: 0.11,
        eyeRingColor: '#f04a2f',
        pupilScaleY: 1.20,
        upperLid: 0.00,
        brow: -0.20, browW: 0.20,
        wing: { x: 0.0, y: 0.77, z: 0.30, length: 0.48, rootW: 0.12, tipW: 0.34, rest: 0.02, feathers: 3 },
        leg:  { y: 0.33, z: 0.21, len: 0.34, toe: 0.14 },
        tail: { x: 0.40, y: 0.52, scaleX: 0.32, scaleY: 0.46, scaleZ: 0.50 },
    },
    emerald: {
        scale: 0.70,
        body: { x: 0.62, y: 0.88, z: 0.55 },
        bodyY: 0.60,
        headX: 0.08, headY: 1.34,
        headSize: 0.39,
        headScale: { x: 1.0, y: 1.05, z: 0.98 },
        faceColor: '#dff0a5',
        beak: { length: 0.50, width: 0.15, height: 0.11, gape: 0.034, open: 0.02 },
        eyeWhite: 0.18, pupil: 0.105,
        eyeTilt: 0.10,
        pupilScaleX: 0.64, pupilScaleY: 1.16,
        upperLid: 0.14, brow: -0.02,
        wing: { x: 0.0, y: 0.78, z: 0.29, length: 0.58, rootW: 0.10, tipW: 0.34, rest: -0.18, feathers: 4 },
        leg:  { y: 0.33, z: 0.18, len: 0.35, toe: 0.13 },
        tail: { x: 0.40, y: 0.54, scaleX: 0.38, scaleY: 0.52, scaleZ: 0.56 },
        crestScale: 0.72,
    },
    satin: {
        scale: 0.76,
        body: { x: 0.76, y: 0.86, z: 0.60 },
        headSize: 0.40,
        headScale: { x: 1.05, y: 1.0, z: 1.02 },
        faceY: 0.60, faceZ: 0.72,
        faceColor: '#d9edf7',
        beak: { length: 0.35, width: 0.22, height: 0.15, gape: 0.035, open: 0.02 },
        eyeWhite: 0.17, pupil: 0.095,
        eyeSquash: 0.54, eyeTilt: -0.10,
        pupilScaleX: 0.86, pupilScaleY: 0.58,
        upperLid: 0.48, lowerLid: 0.06,
        brow: 0.00, browW: 0.16,
        wing: { x: 0.02, y: 0.80, z: 0.35, length: 0.52, rootW: 0.15, tipW: 0.40, rest: -0.08, feathers: 3 },
        tail: { x: 0.42, y: 0.53, scaleX: 0.32, scaleY: 0.48, scaleZ: 0.52 },
    },
    twilight: {
        scale: 0.72,
        body: { x: 0.63, y: 0.82, z: 0.54 },
        bodyY: 0.58,
        headY: 1.30,
        headSize: 0.39,
        headScale: { x: 0.98, y: 1.04, z: 0.96 },
        cheekSize: 0.12,
        faceColor: '#e4dcff',
        beak: { length: 0.46, width: 0.16, height: 0.11, gape: 0.034, open: 0.02 },
        eyeWhite: 0.18, pupil: 0.10,
        eyeTilt: -0.24,
        pupilScaleX: 0.70, pupilScaleY: 0.62,
        upperLid: 0.36, lowerLid: 0.05,
        brow: -0.18,
        lash: true,
        wing: { x: -0.01, y: 0.75, z: 0.28, length: 0.62, rootW: 0.10, tipW: 0.36, rest: -0.16, feathers: 4 },
        leg:  { y: 0.31, z: 0.18, len: 0.38, toe: 0.13 },
        tail: { x: 0.40, y: 0.50, scaleX: 0.42, scaleY: 0.50, scaleZ: 0.44 },
        crestScale: 0.70,
    },
    lilac: {
        scale: 0.78,
        body: { x: 0.80, y: 0.88, z: 0.62 },
        bodyY: 0.62,
        headY: 1.35,
        headSize: 0.40,
        headScale: { x: 1.12, y: 0.96, z: 1.02 },
        faceY: 0.64,
        cheekSize: 0.14,
        faceColor: '#f6e9fb',
        beak: { length: 0.36, width: 0.20, height: 0.14, gape: 0.035, open: 0.02 },
        eyeWhite: 0.19, pupil: 0.105,
        eyeSquash: 0.50, eyeTilt: -0.12,
        pupilScaleX: 0.70, pupilScaleY: 0.86,
        upperLid: 0.28, brow: 0.10,
        lash: true,
        wing: { x: 0.03, y: 0.82, z: 0.36, length: 0.54, rootW: 0.15, tipW: 0.44, rest: -0.03, feathers: 3 },
        leg:  { y: 0.34, z: 0.23, len: 0.31, toe: 0.15 },
        tail: { x: 0.46, y: 0.54, scaleX: 0.44, scaleY: 0.56, scaleZ: 0.62 },
        crestScale: 0.62,
    },
}

function getCharacter(speciesId)
{
    const override = STANDING_OVERRIDES[speciesId] || {}
    const merged = { ...STANDING_BASE, ...override }
    for(const key of ['body', 'belly', 'headScale', 'beak', 'wing', 'leg', 'tail'])
        merged[key] = { ...STANDING_BASE[key], ...(override[key] || {}) }
    return merged
}

const lerpColor = (a, b, t) => new THREE.Color(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
)

/* ---------- Kira class ---------- */

export default class Kira
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island

        const x = 0.6, z = 2.1
        const groundY = this.island.heightAt(x, z)
        this.perchX = x
        this.perchZ = z
        this.perchY = groundY
        this.perchYaw = Math.PI * 0.92

        this.group = new THREE.Group()
        this.group.position.set(x, this.perchY, z)
        this.group.rotation.y = this.perchYaw
        this.group.scale.setScalar(1.10)
        this.scene.add(this.group)

        this.parts = null
        this.speciesId = 'flame'
        this._listeners = []
        this._build(this.speciesId)

        // Wander state machine.
        this.mode      = 'perched'    // perched | walk | settle | fly
        this.modeT     = 0
        this.waypoints = []
        this.target    = null
        this.facing    = this.perchYaw
        this.speed     = 0
        this.walkPhase = 0
        this.settleDur = SETTLE_MIN_S

        // Onboarding bypass — when active, the wander state machine is
        // suppressed and Kira stays parked at the perch so the orchestrator
        // can drive scripted beats. See docs/companion-bird.md revision log.
        this.onboardingMode = false

        // Cinematic flight state. Populated by flyTo(); cleared on landing.
        this._fly = null
    }

    /* ----- public ----- */

    /** Cycle to a specific species. Rebuilds the mesh in place. */
    setSpecies(id)
    {
        if(!SPECIES_BY_ID[id] || id === this.speciesId) return
        this.speciesId = id
        this._build(id)
        for(const fn of this._listeners) fn(id)
    }

    /** Cycle forward through the species catalog. */
    cycleSpecies(delta = 1)
    {
        const i = SPECIES.findIndex(s => s.id === this.speciesId)
        const next = SPECIES[(i + delta + SPECIES.length) % SPECIES.length]
        this.setSpecies(next.id)
    }

    /**
     * Onboarding bypass — when active, snap Kira to the perch and freeze
     * the wander state machine so the orchestrator owns Kira's position +
     * pose. Off by default; the OnboardingFlow toggles this on at boot and
     * off again at `done`. See plan §"Kira onboarding-mode bypass."
     */
    setOnboardingMode(active)
    {
        this.onboardingMode = !!active
        if(active)
        {
            // Resolve any in-flight cinematic so a caller awaiting flyTo()
            // doesn't hang when the ceremony forces an early reset.
            if(this._fly)
            {
                const resolve = this._fly.resolve
                this._fly = null
                if(resolve) resolve()
            }
            this.mode      = 'perched'
            this.modeT     = 0
            this.waypoints = []
            this.target    = null
            this.speed     = 0
            this.group.position.set(this.perchX, this.perchY, this.perchZ)
            this.group.rotation.y = this.perchYaw
            this.facing = this.perchYaw
        }
    }

    /**
     * Cinematic flight — fly Kira from `startPos` to `endPos` along a
     * quadratic bezier whose apex sits `midOffset` above the midpoint of
     * the chord. While airborne, the wander state machine and narrating
     * gestures are suspended; the wings flap, taper to glide over the
     * final 400ms, and the yaw lerps toward `endYaw` so the bird faces
     * the camera as it lands.
     *
     * Positions accept either THREE.Vector3 or plain {x,y,z}. Default
     * duration 2.4s; reduced motion compresses to a 200ms flat teleport.
     *
     * Used once by the first-chat onboarding beat for the off-canvas →
     * perch arc.
     */
    flyTo({ startPos, endPos, midOffset, duration = 2.4, endYaw, reducedMotion = false } = {})
    {
        if(!startPos || !endPos) return Promise.resolve()

        const toVec = (p) => (p && typeof p.clone === 'function')
            ? p.clone()
            : new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0)

        const p0  = toVec(startPos)
        const p2  = toVec(endPos)
        const off = midOffset ? toVec(midOffset) : new THREE.Vector3(0, 1.4, 0)
        const mid = p0.clone().lerp(p2, 0.5).add(off)

        const reduced = !!reducedMotion
        const dur     = reduced ? 0.2 : Math.max(0.05, duration)

        // Standing build's beak runs along local +X, so the yaw that aims
        // it toward (dx, dz) is atan2(-dz, dx) — same convention as walk.
        const dx = p2.x - p0.x, dz = p2.z - p0.z
        const travelYaw = (dx === 0 && dz === 0) ? this.perchYaw : Math.atan2(-dz, dx)

        // If a previous flight is still resolving, snap-close it so the
        // new flyTo owns the state cleanly.
        if(this._fly)
        {
            const prev = this._fly.resolve
            this._fly = null
            if(prev) prev()
        }

        this.group.position.copy(p0)
        this.facing = travelYaw
        this.group.rotation.y = travelYaw
        this.mode  = 'fly'
        this.modeT = 0

        return new Promise((resolve) =>
        {
            this._fly = {
                p0, mid, p2,
                duration: dur,
                startYaw: travelYaw,
                endYaw:   (endYaw ?? this.perchYaw),
                reduced,
                resolve,
            }
        })
    }

    /** Subscribe to species changes (UI re-renders). Returns unsubscribe. */
    onSpeciesChange(fn)
    {
        this._listeners.push(fn)
        return () => { this._listeners = this._listeners.filter(l => l !== fn) }
    }

    /**
     * World-space anchor for the speech bubble. Reads from the head mesh
     * so a taller standing bird doesn't end up with the bubble at chest
     * level. Falls back to the group origin if the head hasn't been built
     * yet (shouldn't happen at update time).
     */
    getHeadWorldPosition(out)
    {
        if(this.parts && this.parts.head) return this.parts.head.getWorldPosition(out)
        return this.group.getWorldPosition(out)
    }

    /* ----- update + wander ----- */

    update()
    {
        const dt = Math.min(this.state.time.delta || 0, 0.06)
        const t  = this.state.time.elapsed
        this.modeT += dt

        // Cinematic flight wins over wander + narrating so the bird can
        // glide in undisturbed during the first-chat beat.
        if(this.mode === 'fly' && this._fly)
        {
            this._tickFly(t, dt)
            this._animateBody(t, dt)
            return
        }

        const narrating = this.view.kiraNarrator && this.view.kiraNarrator.isActive
        if(narrating)
        {
            this.mode  = 'perched'
            this.modeT = 0
            this.speed = 0
            this._animateBody(t, dt)
            return
        }

        if(this.mode === 'perched')      this._tickPerched(t, dt)
        else if(this.mode === 'walk')    this._tickWalk(t, dt)
        else if(this.mode === 'settle')  this._tickSettle(t, dt)

        this._animateBody(t, dt)
    }

    _tickPerched(t, dt)
    {
        this.speed = 0
        this.group.position.y = this.perchY + Math.sin(t * 1.0) * 0.012
        if(this.onboardingMode) return
        if(this.modeT > PERCHED_MIN_S)
        {
            const pPerFrame = 1 - Math.pow(1 - WANDER_CHANCE, dt)
            if(Math.random() < pPerFrame) this._enterWandering()
        }
    }

    _tickWalk(t, dt)
    {
        if(!this.target) { this._startNextLeg(); return }

        const dx = this.target.x - this.group.position.x
        const dz = this.target.z - this.group.position.z
        const dist = Math.hypot(dx, dz)
        // Standing build is authored with the bird's beak / head along
        // local +X, so the yaw that aims +X at (dx, dz) is atan2(-dz, dx).
        // (Old Kira used local +Z forward; the wander code carried over
        // that convention by accident and made the new bird walk sideways.)
        const wantYaw = Math.atan2(-dz, dx)
        let dYaw = wantYaw - this.facing
        dYaw = ((dYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI
        const maxStep = TURN_RATE * dt
        this.facing += THREE.MathUtils.clamp(dYaw, -maxStep, maxStep)
        this.group.rotation.y = this.facing

        if(dist <= ARRIVE_DIST)
        {
            this.group.position.x = this.target.x
            this.group.position.z = this.target.z
            this.group.position.y = this.target.y
            this.mode = 'settle'
            this.modeT = 0
            this.settleDur = SETTLE_MIN_S + Math.random() * (SETTLE_MAX_S - SETTLE_MIN_S)
            this.speed = 0
            return
        }

        const ramp = Math.min(1, dist / 0.4)
        const stepSpeed = WALK_SPEED * ramp
        const ux = dx / dist
        const uz = dz / dist
        this.group.position.x += ux * stepSpeed * dt
        this.group.position.z += uz * stepSpeed * dt
        this.group.position.y = this.island.heightAt(this.group.position.x, this.group.position.z)

        this.speed = stepSpeed
        this.walkPhase += this.speed * 14 * dt
    }

    _tickSettle(t, dt)
    {
        this.speed = 0
        const baseY = this.target ? this.target.y : this.perchY
        this.group.position.y = baseY + Math.sin(t * 1.1) * 0.010
        if(this.modeT >= this.settleDur) this._startNextLeg()
    }

    _tickFly(t, dt)
    {
        const f = this._fly
        if(!f) { this.mode = 'perched'; this.modeT = 0; return }

        const u = Math.min(1, this.modeT / f.duration)
        // Ease-out cubic on position so the bird enters with momentum and
        // decelerates into the perch — reads as "gliding in for a landing"
        // rather than smootherstep's symmetric accelerate-then-decelerate
        // (which feels like the bird hesitates at takeoff). Yaw still uses
        // smootherstep over the second half so the head-turn stays gentle.
        const inv0 = 1 - u
        const e = 1 - inv0 * inv0 * inv0

        // Quadratic bezier: B(e) = (1-e)^2 P0 + 2(1-e)e P1 + e^2 P2.
        const inv = 1 - e
        const w0 = inv * inv
        const w1 = 2 * inv * e
        const w2 = e * e
        this.group.position.set(
            w0 * f.p0.x + w1 * f.mid.x + w2 * f.p2.x,
            w0 * f.p0.y + w1 * f.mid.y + w2 * f.p2.y,
            w0 * f.p0.z + w1 * f.mid.z + w2 * f.p2.z,
        )

        // Yaw rotates from travel direction toward endYaw over the second
        // half of the flight, so the bird faces the camera as it settles.
        const yawU = Math.max(0, (u - 0.5) * 2)
        const yawE = yawU * yawU * (3 - 2 * yawU)
        const delta = ((f.endYaw - f.startYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI
        this.facing = f.startYaw + delta * yawE
        this.group.rotation.y = this.facing

        if(u >= 1)
        {
            this.group.position.copy(f.p2)
            this.facing = f.endYaw
            this.group.rotation.y = f.endYaw
            this.mode  = 'perched'
            this.modeT = 0
            const resolve = f.resolve
            this._fly = null
            if(resolve) resolve()
        }
    }

    _enterWandering()
    {
        this.waypoints = []
        const flowers = this.view.flowers && this.view.flowers.flowers
        for(let i = 0; i < WANDER_STOPS; i++)
        {
            let wx, wz
            if(flowers && flowers.length)
            {
                const f = flowers[Math.floor(Math.random() * flowers.length)]
                const dx = -f.x, dz = -f.z
                const len = Math.hypot(dx, dz) || 1
                wx = f.x + (dx / len) * 0.55
                wz = f.z + (dz / len) * 0.55
            }
            else
            {
                const a = Math.random() * Math.PI * 2
                const r = ROAM_MIN_R + Math.random() * (ROAM_MAX_R - ROAM_MIN_R)
                wx = Math.cos(a) * r
                wz = Math.sin(a) * r
            }
            const wy = this.island.heightAt(wx, wz)
            this.waypoints.push(new THREE.Vector3(wx, wy, wz))
        }
        this.waypoints.push(new THREE.Vector3(this.perchX, this.perchY, this.perchZ))
        this._startNextLeg()
    }

    _startNextLeg()
    {
        if(this.waypoints.length === 0)
        {
            this.mode   = 'perched'
            this.modeT  = 0
            this.target = null
            this.speed  = 0
            this.group.position.set(this.perchX, this.perchY, this.perchZ)
            this.facing = this.perchYaw
            this.group.rotation.y = this.perchYaw
            return
        }
        this.target = this.waypoints.shift()
        this.mode   = 'walk'
        this.modeT  = 0
    }

    /* ----- body animation ----- */

    _animateBody(t, dt)
    {
        const parts = this.parts
        if(!parts) return

        // Flying beat: wings flap continuously, legs are parked, body
        // stays level. The flap amplitude tapers to 0 over the final
        // 400ms for a glide-in landing — matches the DESIGN.md
        // no-overshoot rule (no settle-flutter that would read as a
        // bounce).
        if(this.mode === 'fly' && this._fly)
        {
            const remaining = Math.max(0, this._fly.duration - this.modeT)
            const taper = Math.min(1, remaining / 0.4)
            const flap  = Math.abs(Math.sin(t * 7.0)) * 0.95 * taper

            if(parts.wingL) { parts.wingL.rotation.x = -flap; parts.wingL.rotation.z = parts.wingBaseZL }
            if(parts.wingR) { parts.wingR.rotation.x =  flap; parts.wingR.rotation.z = parts.wingBaseZR }

            if(parts.legL) parts.legL.rotation.z = 0
            if(parts.legR) parts.legR.rotation.z = 0

            if(parts.root) parts.root.position.y = 0
            if(parts.head)
            {
                parts.head.position.y = parts.headBaseY
                parts.head.rotation.y = 0
                parts.head.rotation.z = parts.headBaseRotZ
            }
            if(parts.beak?.userData.lowerPivot)
            {
                parts.beak.userData.lowerPivot.rotation.z = -parts.beak.userData.restOpen
            }
            return
        }

        // Narrating beat: while the AC-style dialogue is up, the bird
        // welcomes the student — wings fan symmetrically outward and
        // the beak chatters in a talking rhythm. We override the idle
        // + walk pipelines instead of layering so the gesture reads
        // clearly against the otherwise calm body.
        const narrating = this.view.kiraNarrator && this.view.kiraNarrator.isActive
        if(narrating)
        {
            // Wings open-and-close around the body's forward axis (X).
            // .rotation.z (which the wander code touches) only twists
            // the wing in its hanging plane — invisible flap. Rotating
            // around X lifts the wing tip *outward* away from the body,
            // which is the silhouette readers expect from a flap.
            // abs(sin) keeps the motion one-sided so wingtips never clip
            // the chest. ~1.4 Hz reads as friendly, not panicked.
            const flap = Math.abs(Math.sin(t * 3.0)) * 0.75
            if(parts.wingL)
            {
                parts.wingL.rotation.x = -flap          // open toward +Z (left side)
                parts.wingL.rotation.z = parts.wingBaseZL
            }
            if(parts.wingR)
            {
                parts.wingR.rotation.x = flap           // open toward -Z (right side, mirrored)
                parts.wingR.rotation.z = parts.wingBaseZR
            }

            // Beak talk: fast open/close (~5 Hz) gated by a slower
            // envelope so syllables have phrasing instead of a flat
            // buzz. Stays additive on top of the rest-open gap.
            if(parts.beak?.userData.lowerPivot)
            {
                const envelope = 0.55 + 0.45 * Math.sin(t * 1.7)
                const talk = envelope * Math.abs(Math.sin(t * 9.0)) * 0.50
                parts.beak.userData.lowerPivot.rotation.z =
                    -(parts.beak.userData.restOpen + talk)
            }

            // Tiny head bob in the talking rhythm — leans in/out as she
            // emphasises words. Yaw stays fixed (narrator handles the
            // turn-to-camera tween).
            if(parts.head)
            {
                parts.head.position.y = parts.headBaseY + Math.sin(t * 4.2) * 0.014
                parts.head.rotation.z = parts.headBaseRotZ + Math.sin(t * 2.1) * 0.04
            }

            // Body settles — no walk bounce while she's mid-speech.
            if(parts.root) parts.root.position.y = Math.sin(t * 1.0) * 0.006
            if(parts.legL) parts.legL.rotation.z = 0
            if(parts.legR) parts.legR.rotation.z = 0
            return
        }

        const walkAmt = THREE.MathUtils.clamp(this.speed / WALK_SPEED, 0, 1)
        const idleAmt = 1 - walkAmt
        const walkPhase = this.walkPhase

        if(parts.root)
        {
            const stepBounce = Math.abs(Math.sin(walkPhase)) * 0.025 * walkAmt
            parts.root.position.y = Math.sin(t * 1.05) * 0.008 * idleAmt + stepBounce
            parts.root.rotation.z = Math.sin(walkPhase) * 0.025 * walkAmt
        }

        if(parts.head)
        {
            const idleLook = Math.sin(t * 0.8) * 0.10 * idleAmt
            const stepNod  = Math.sin(walkPhase + 0.4) * 0.04 * walkAmt
            parts.head.rotation.y = idleLook
            parts.head.rotation.z = parts.headBaseRotZ + stepNod
            parts.head.position.y = parts.headBaseY + Math.sin(t * 1.4) * 0.010 * idleAmt
        }

        // Arm-swing during walk. Wings rotate around their local Z (the
        // wing's depth axis) so the tip swings forward/back in the body's
        // X-direction — same plane a human arm swings in. wingL and wingR
        // are 180° out of phase so they alternate (one forward, one back)
        // for a natural gait. .rotation.x is reset because the narrating
        // branch parks it open.
        const armSwing = Math.sin(walkPhase) * 0.35 * walkAmt
        if(parts.wingL)
        {
            parts.wingL.rotation.x = 0
            parts.wingL.rotation.z = parts.wingBaseZL + armSwing
                + Math.sin(t * 1.0) * 0.015 * idleAmt
        }
        if(parts.wingR)
        {
            parts.wingR.rotation.x = 0
            parts.wingR.rotation.z = parts.wingBaseZR - armSwing
                - Math.sin(t * 1.0) * 0.015 * idleAmt
        }

        if(parts.legL) parts.legL.rotation.z =  Math.sin(walkPhase) * 0.22 * walkAmt
        if(parts.legR) parts.legR.rotation.z =  Math.sin(walkPhase + Math.PI) * 0.22 * walkAmt

        if(parts.tail)
            parts.tail.rotation.y = Math.sin(t * 1.4) * 0.05 * idleAmt
                + Math.sin(walkPhase * 0.5) * 0.10 * walkAmt

        if(parts.beak?.userData.lowerPivot)
        {
            const beakOpen = parts.beak.userData.restOpen
                + walkAmt * 0.04 * Math.abs(Math.sin(t * 8.5))
            parts.beak.userData.lowerPivot.rotation.z = -beakOpen
        }
    }

    /* ----- build / teardown ----- */

    _build(speciesId)
    {
        // Tear down the previous mesh so a swap doesn't leak geometry +
        // materials. Canvas-backed face textures are the heaviest piece.
        if(this.parts)
        {
            this.group.remove(this.parts.root)
            this._dispose(this.parts.root)
            this.parts = null
        }
        const spec = SPECIES_BY_ID[speciesId] || SPECIES_BY_ID.flame
        this.parts = buildStandingBird(spec)
        this.group.add(this.parts.root)
    }

    _dispose(node)
    {
        node.traverse?.(obj =>
        {
            if(obj.geometry) obj.geometry.dispose()
            const m = obj.material
            if(m)
            {
                if(m.map) m.map.dispose?.()
                m.dispose?.()
            }
        })
    }
}

/* =====================================================================
 *  Mesh builder — standing bowerbird (any species via spec)
 *
 *  Adapted from buildStandingCompanionParts() in the FlameBower studio's
 *  View/Bird.js.
 * ===================================================================== */

export { buildStandingBird }
function buildStandingBird(spec)
{
    const c = getCharacter(spec.id)
    const p = spec.palette

    const root = new THREE.Group()
    root.scale.setScalar(c.scale)

    const bodyMat   = new THREE.MeshLambertMaterial({ color: p.back })
    const bellyMat  = new THREE.MeshLambertMaterial({ color: p.belly })
    const accentMat = new THREE.MeshLambertMaterial({ color: p.accent })

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 18), bodyMat)
    body.geometry.scale(c.body.x, c.body.y, c.body.z)
    body.position.set(0, c.bodyY, 0)
    root.add(body)

    const bellyPatch = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 14), bellyMat)
    bellyPatch.geometry.scale(0.065, c.belly.y, c.belly.z)
    bellyPatch.position.set(c.bellyX, c.bellyY, 0)
    root.add(bellyPatch)

    const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(c.neckTop, c.neckBottom, c.neckH, 16),
        bellyMat,
    )
    neck.position.set(0.04, c.neckY, 0)
    root.add(neck)

    const head = new THREE.Group()
    head.position.set(c.headX, c.headY, 0)
    const headBaseY = head.position.y
    const headBaseRotZ = 0
    const headMat = makeStandingHeadMaterial(p.back, c, {
        eye:    p.eye,
        back:   p.back,
        face:   c.faceColor || p.belly,
        accent: p.accent,
    })
    const headMesh = new THREE.Mesh(
        new THREE.SphereGeometry(c.headSize, 48, 28),
        headMat,
    )
    headMesh.geometry.scale(c.headScale.x, c.headScale.y, c.headScale.z)
    head.add(headMesh)

    const friendlyBeak = getFriendlyBeakColor(p.beak, p.accent, p.belly, c.beakKeepsDark)
    const beak = makeStandingBeak(friendlyBeak, c.headSize, c.beak)
    head.add(beak)

    if(spec.shape.crest !== 'none')
    {
        const crest = makeCrest(spec.shape.crest, new THREE.Color(p.accent), c.headSize * c.crestScale)
        crest.position.set(-c.headSize * 0.08, c.headSize * 0.76, 0)
        head.add(crest)
    }

    root.add(head)

    const wingL = makeStandingWing(p.back, p.accent, c.wing)
    wingL.position.set(c.wing.x, c.wing.y, c.wing.z)
    wingL.rotation.z = c.wing.rest
    root.add(wingL)
    const wingR = makeStandingWing(p.back, p.accent, c.wing)
    wingR.position.set(c.wing.x, c.wing.y, -c.wing.z)
    wingR.scale.z = -1
    wingR.rotation.z = -c.wing.rest
    root.add(wingR)

    const legL = makeStandingLeg(p.legs, c.leg)
    legL.position.set(0.10, c.leg.y, c.leg.z)
    root.add(legL)
    const legR = makeStandingLeg(p.legs, c.leg)
    legR.position.set(0.10, c.leg.y, -c.leg.z)
    root.add(legR)

    const tail = new THREE.Group()
    tail.position.set(-c.tail.x, c.tail.y, 0)
    const tailGeo = makeTailGeometry(spec.shape.tail)
    tailGeo.scale(c.tail.scaleX, c.tail.scaleY, c.tail.scaleZ)
    tail.add(new THREE.Mesh(tailGeo, accentMat))
    root.add(tail)

    return {
        root, body, head, tail, wingL, wingR, legL, legR, beak,
        headBaseY,
        headBaseRotZ,
        wingBaseZL:  c.wing.rest,
        wingBaseZR: -c.wing.rest,
    }
}

/* ---------- face painter ---------- */

function makeStandingHeadMaterial(baseColor, c, palette)
{
    const width = 1024, height = 512, size = height
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = baseColor
    ctx.fillRect(0, 0, width, height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const cx = width * 0.5
    const cy = size * 0.54 + c.faceYOffset * size * 0.20
    const faceRx = size * c.faceZ * 0.36
    const faceRy = size * c.faceY * 0.34
    const cheekY = cy + faceRy * 0.36
    const cheekX = size * c.cheekZ * 0.54
    const eyeY = cy - size * c.eyeY * 0.48
    const eyeSep = size * c.eyeZ * 0.62
    const eyeH = size * c.eyeWhite * 0.80
    const eyeW = eyeH * (0.62 + c.eyeSquash * 0.95)

    drawEllipse(ctx, cx, cy, faceRx, faceRy, palette.face)
    drawEllipse(ctx, cx - cheekX, cheekY, size * c.cheekSize * 0.42, size * c.cheekSize * 0.38, palette.accent, 0, 0.70)
    drawEllipse(ctx, cx + cheekX, cheekY, size * c.cheekSize * 0.42, size * c.cheekSize * 0.38, palette.accent, 0, 0.70)
    drawPaintedEye(ctx, c, palette, -1, cx - eyeSep, eyeY, eyeW, eyeH)
    drawPaintedEye(ctx, c, palette, +1, cx + eyeSep, eyeY, eyeW, eyeH)

    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    return new THREE.MeshLambertMaterial({ map: texture, color: 0xffffff })
}

function drawPaintedEye(ctx, c, palette, side, x, y, w, h)
{
    const tilt = c.eyeTilt * side
    const lid = c.lidColor || palette.back

    if(c.eyeRingColor)
        drawEllipse(ctx, x, y, w * 0.78, h * 0.72, c.eyeRingColor, tilt)

    drawEllipse(ctx, x, y, w * 0.56, h * 0.58, '#fff8ec', tilt)

    const pupilW = w * c.pupilScaleX * 0.30
    const pupilH = h * c.pupilScaleY * 0.34
    drawEllipse(ctx, x + side * w * 0.05, y + h * c.pupilOffsetY, pupilW, pupilH, palette.eye, tilt)

    if(c.shine)
        drawEllipse(ctx, x - side * w * 0.08, y - h * 0.16, w * 0.08, h * 0.08, '#ffffff')

    if(c.upperLid > 0)
    {
        ctx.save()
        ctx.translate(x, y - h * (0.52 - c.upperLid * 0.16))
        ctx.rotate(tilt)
        ctx.fillStyle = lid
        ctx.beginPath()
        ctx.ellipse(0, 0, w * 0.58, h * c.upperLid * 0.50, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
    }
    if(c.lowerLid > 0)
    {
        ctx.save()
        ctx.translate(x, y + h * 0.52)
        ctx.rotate(tilt)
        ctx.fillStyle = lid
        ctx.beginPath()
        ctx.ellipse(0, 0, w * 0.58, h * c.lowerLid * 0.45, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
    }

    const browY = y - h * 0.72
    const browX = x + side * w * 0.06
    drawStroke(ctx, browX, browY, w * c.browW * 1.20, h * 0.10, palette.eye, side > 0 ? -c.brow : c.brow)

    if(c.lash)
    {
        drawStroke(ctx, x + side * w * 0.40, y - h * 0.10, w * 0.22, h * 0.05, palette.eye, side * -0.75)
        drawStroke(ctx, x + side * w * 0.42, y + h * 0.12, w * 0.18, h * 0.05, palette.eye, side * -0.20)
    }
}

function drawEllipse(ctx, x, y, rx, ry, fill, rot = 0, alpha = 1)
{
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
}

function drawStroke(ctx, x, y, w, h, stroke, rot = 0)
{
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.strokeStyle = stroke
    ctx.lineWidth = Math.max(4, h)
    ctx.beginPath()
    ctx.moveTo(-w * 0.5, 0)
    ctx.lineTo(w * 0.5, 0)
    ctx.stroke()
    ctx.restore()
}

/* ---------- wings / legs / beak / crest / tail ---------- */

function makeStandingWing(back, accent, cfg)
{
    const wing = new THREE.Group()
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    const backColor = new THREE.Color(back)
    const accentColor = new THREE.Color(accent)
    const positions = []
    const colors = []
    const L = cfg.length
    const rootW = cfg.rootW
    const tipW = cfg.tipW

    const pts = [
        [ rootW * 0.5,  0.06, 0 ],
        [-rootW * 0.5, -0.02, 0 ],
        [-tipW * 0.62, -L * 0.82, 0 ],
        [ 0.00,        -L, 0 ],
        [ tipW * 0.62, -L * 0.82, 0 ],
        [ tipW * 0.42, -L * 0.24, 0 ],
    ]
    const tris = [0, 1, 5, 1, 2, 5, 2, 3, 4, 2, 4, 5]
    for(const i of tris)
    {
        const pt = pts[i]
        positions.push(...pt)
        const k = THREE.MathUtils.smoothstep(-pt[1], L * 0.35, L)
        const c = lerpColor(backColor, accentColor, k)
        colors.push(c.r, c.g, c.b)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    wing.add(new THREE.Mesh(geo, mat))

    const featherMat = new THREE.MeshLambertMaterial({ color: accent })
    for(let i = 0; i < cfg.feathers; i++)
    {
        const t = cfg.feathers === 1 ? 0.5 : i / (cfg.feathers - 1)
        const x = THREE.MathUtils.lerp(-tipW * 0.42, tipW * 0.42, t)
        const feather = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8), featherMat)
        feather.geometry.scale(tipW * 0.15, L * 0.18, 0.018)
        feather.position.set(x, -L * (0.78 + Math.abs(t - 0.5) * 0.16), 0.012)
        feather.rotation.z = THREE.MathUtils.lerp(0.25, -0.25, t)
        wing.add(feather)
    }
    return wing
}

function makeStandingLeg(color, cfg)
{
    const leg = new THREE.Group()
    const mat = new THREE.MeshLambertMaterial({ color })
    const legLen = cfg.len
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.030, legLen, 10), mat)
    shin.position.y = -legLen * 0.5
    leg.add(shin)

    const foot = new THREE.Group()
    foot.position.y = -legLen
    const toeGeo = new THREE.ConeGeometry(0.030, cfg.toe, 8)
    for(const [x, z, rz] of [[0.070, 0, 0], [0.035, 0.052, 0.35], [0.035, -0.052, -0.35]])
    {
        const toe = new THREE.Mesh(toeGeo, mat)
        toe.rotation.z = -Math.PI / 2
        toe.rotation.y = rz
        toe.position.set(x, -0.015, z)
        foot.add(toe)
    }
    leg.add(foot)
    return leg
}

function getFriendlyBeakColor(beak, accent, belly, keepsDark = false)
{
    const c = new THREE.Color(beak)
    const luminance = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
    if(!keepsDark && luminance < 0.28)
        return new THREE.Color(accent).lerp(new THREE.Color(belly), 0.35)
    return c
}

function makeStandingBeak(color, headSize, cfg)
{
    const group = new THREE.Group()
    const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x23150f, side: THREE.DoubleSide })

    const length = headSize * cfg.length
    const width = headSize * cfg.width
    const height = headSize * cfg.height
    const gap = headSize * Math.max(cfg.gape || 0.02, 0.034)
    const rootX = headSize * 1.01

    const upper = new THREE.Mesh(makeStandingBeakShellGeometry(length, width, height, true), mat)
    upper.position.set(rootX, gap * 0.30, 0)
    group.add(upper)

    const mouth = new THREE.Mesh(
        makeStandingMouthGeometry(length * 0.76, width * 0.56, gap * 0.72),
        darkMat,
    )
    mouth.position.set(rootX + length * 0.12, -gap * 0.10, 0)
    group.add(mouth)

    const lowerPivot = new THREE.Group()
    lowerPivot.position.set(rootX + length * 0.03, -gap * 0.34, 0)

    const lower = new THREE.Mesh(
        makeStandingBeakShellGeometry(length * 0.86, width * 0.82, height * 0.68, false),
        mat,
    )
    lower.position.set(length * 0.03, 0, 0)
    lowerPivot.add(lower)
    group.add(lowerPivot)

    group.userData.lowerPivot = lowerPivot
    group.userData.restOpen = Math.max(cfg.open || 0, 0.055)
    lowerPivot.rotation.z = -group.userData.restOpen

    return group
}

function makeStandingBeakShellGeometry(length, width, height, upper)
{
    const radialSegments = 18
    const stride = radialSegments + 1
    const rings = [
        { x: 0,             w: width * 0.62, h: height * (upper ? 0.58 : 0.42), cy: upper ? 0 : -height * 0.03 },
        { x: length * 0.43, w: width,        h: height * (upper ? 0.86 : 0.58), cy: upper ? height * 0.02 : -height * 0.07 },
        { x: length * 0.82, w: width * 0.44, h: height * (upper ? 0.40 : 0.30), cy: upper ? -height * 0.01 : -height * 0.09 },
    ]
    const positions = []
    const indices = []
    for(const ring of rings)
    {
        for(let i = 0; i <= radialSegments; i++)
        {
            const t = i / radialSegments
            const a = upper ? t * Math.PI : Math.PI + t * Math.PI
            positions.push(ring.x, ring.cy + Math.sin(a) * ring.h, Math.cos(a) * ring.w)
        }
    }
    const tipIndex = positions.length / 3
    positions.push(length, upper ? -height * 0.04 : -height * 0.11, 0)
    for(let r = 0; r < rings.length - 1; r++)
    {
        for(let i = 0; i < radialSegments; i++)
        {
            const a = r * stride + i
            const b = a + 1
            const c = (r + 1) * stride + i
            const d = c + 1
            if(upper) indices.push(a, c, b, b, c, d)
            else      indices.push(a, b, c, b, d, c)
        }
    }
    const lastRing = (rings.length - 1) * stride
    for(let i = 0; i < radialSegments; i++)
    {
        const a = lastRing + i
        const b = a + 1
        if(upper) indices.push(a, tipIndex, b)
        else      indices.push(a, b, tipIndex)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
}

function makeStandingMouthGeometry(length, halfWidth, drop)
{
    const positions = [
        0, 0, -halfWidth,
        0, 0, halfWidth,
        length, -drop, 0,
        0, -drop * 0.34, -halfWidth * 0.62,
        length * 0.88, -drop * 1.06, 0,
        0, -drop * 0.34, halfWidth * 0.62,
    ]
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setIndex([0, 1, 2, 3, 4, 5])
    geo.computeVertexNormals()
    return geo
}

function makeCrest(type, color, headSize)
{
    const positions = []
    if(type === 'pointed')
    {
        const w = headSize * 0.32, h = headSize * 1.10
        positions.push(-w, 0, 0,   w, 0, 0,   headSize * 0.15, h, 0)
    }
    else if(type === 'tuft')
    {
        for(let i = 0; i < 3; i++)
        {
            const cx = (i - 1) * headSize * 0.25
            const w = headSize * 0.12, h = headSize * 0.55
            positions.push(cx - w, 0, 0,   cx + w, 0, 0,   cx, h, 0)
        }
    }
    else if(type === 'fan')
    {
        const blades = 5
        const fanW = headSize * 1.4
        const fanH = headSize * 0.85
        for(let i = 0; i < blades; i++)
        {
            const t1 = (i - (blades - 1) / 2) / blades
            const t2 = ((i + 1) - (blades - 1) / 2) / blades
            positions.push(0, 0, 0, fanW * t1, fanH, 0, fanW * t2, fanH, 0)
        }
    }
    else if(type === 'curve')
    {
        const N = 4
        const radius = headSize * 0.95
        for(let i = 0; i < N; i++)
        {
            const a1 = (i       / N) * Math.PI * 0.42 - 0.05
            const a2 = ((i + 1) / N) * Math.PI * 0.42 - 0.05
            positions.push(
                0, 0, 0,
                Math.sin(a1) * radius, Math.cos(a1) * radius, 0,
                Math.sin(a2) * radius, Math.cos(a2) * radius, 0,
            )
        }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.computeVertexNormals()
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide }))
}

function makeTailGeometry(type)
{
    const positions = []
    const W = 0.34
    const L = type === 'long-fan'  ? 0.78
          :   type === 'short-fan' ? 0.36
          :   type === 'pointed'   ? 0.60
          :   type === 'forked'    ? 0.62
          :   /* square */          0.42

    if(type === 'short-fan' || type === 'long-fan')
    {
        positions.push(0, 0, 0,   -L, 0.04, -W,   -L, 0.04, W)
    }
    else if(type === 'pointed')
    {
        positions.push(0, 0, 0,   -L, 0, -W * 0.25,   -L, 0, W * 0.25)
    }
    else if(type === 'forked')
    {
        positions.push(0, 0, 0,   -L * 0.95, 0, -W * 0.7,   -L * 1.1, 0.04, -W * 0.3)
        positions.push(0, 0, 0,   -L * 1.1, 0.04, W * 0.3,   -L * 0.95, 0, W * 0.7)
    }
    else // square
    {
        positions.push(0, 0, -W,   0, 0, W,   -L, 0, -W)
        positions.push(0, 0, W,    -L, 0, W,   -L, 0, -W)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.computeVertexNormals()
    return geo
}
