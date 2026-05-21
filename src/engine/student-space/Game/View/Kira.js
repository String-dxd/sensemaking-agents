import * as THREE from 'three'

import View from './View.js'
import State from '../State/State.js'
import { buildStandingBird } from './StandingBird.js'

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
        palette: { back: '#d6321f', belly: '#f5be1c', accent: '#6f7826', beak: '#cdc0a8', legs: '#b89673', eye: '#1a1410' },
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
            // Hide until FirstChat's flyTo reveals the bird mid-arc. Prevents
            // a "bird at perch" flash before her landing animation begins.
            this.group.visible = false
        }
        else
        {
            // Idempotent reveal — protects the resume path where a user
            // re-enters past first-chat and flyTo never runs.
            this.group.visible = true
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
        // Reveal AFTER the teleport so the first rendered frame shows the
        // bird at the off-canvas start position, not at the perch.
        this.group.visible = true

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

