import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

import View from './View.js'
import State from '../State/State.js'
import { loadGlb, MODEL_URLS } from './assetLoader.ts'
import { applyToonMaterials } from './Materials/toonMaterial.ts'
import { CHARACTER_HEIGHT, CHARACTER_SOURCE_HEIGHT } from '../State/characterAsset.ts'
import {
    advanceBehavior,
    behaviorClip,
    bodyTargetY,
    commandMoveTo,
    createBehaviorState,
    IDLE_POSE_AT_END,
    IDLE_POSE_CLIP,
    triggerTalk,
} from '../State/characterBehavior.ts'
import { hashString, mulberry32 } from '../State/islandSpecCore/rand.ts'
import { COMPANION_SPECIES_IDS } from '../State/schema.js'
import { worldPositionOfObject } from '../State/islandSpecCore/terrainGrid.ts'

/**
 * Character view (world-port U8) — the island editor's animated character
 * behind Kira's full React-facing contract. Registered at `view.kira` (the
 * slot keeps its name: ~27 `.kira` references exist across the React seam).
 *
 * - Model: editor `character.glb` (skinned, meshopt-quantized, 10 baked
 *   clips) via the shared GLB lane; SkeletonUtils clone, toon-converted,
 *   scaled CHARACTER_HEIGHT / CHARACTER_SOURCE_HEIGHT (never bake scale into
 *   the skinned asset), frustumCulled = false.
 * - Mixer: 0.25s crossfades; idle = frozen IDLE_POSE_CLIP frame + breathing
 *   bob (the GLB ships no idle clip), mirroring the editor's CharacterActor.
 * - Behavior: the ported pure machine (characterBehavior.ts) with terrain
 *   access injected from State/Island — wander / idle / nap / wake / swim
 *   with a shore leash / talk.
 * - Contract kept: group, facing, getHeadWorldPosition, flyTo → Promise
 *   (now a scripted ground/shore arrival — walks or swims to the perch,
 *   wake flourish on settle), setSpecies/cycleSpecies/onSpeciesChange
 *   (uniform look for now — R10: the persisted choice survives, visual
 *   differentiation arrives with more assets), setOnboardingMode,
 *   perchX/Y/Z/Yaw, update, isTalking.
 *
 * Home position comes from the committed spec's `character` object; the
 * hard-coded perch is gone.
 */

const DEFAULT_SPECIES_ID = 'masked'
const CROSSFADE_S = 0.25
/** How far below the waterline the body sits while swimming. */
const SWIM_SINK = 0.12
// Breathing bob for the held idle pose (~2% of body height at a resting rate).
const BREATH_RISE = 0.012
const BREATH_RATE = 2.5
/** Scripted-arrival safety: flyTo always resolves, even if pathing stalls. */
const ARRIVAL_TIMEOUT_S = 25
const ARRIVE_DIST = 0.25

export default class Character
{
    constructor()
    {
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.scene = this.view.scene
        this.island = this.state.island

        const spec = this.island.spec
        const home = this._resolveHome(spec)
        this.perchX = home.x
        this.perchY = home.y
        this.perchZ = home.z
        this.perchYaw = home.yaw

        this.group = new THREE.Group()
        this.group.name = 'character'
        this.group.position.set(home.x, home.y, home.z)
        this.group.rotation.y = home.yaw
        this.scene.add(this.group)

        this.facing = home.yaw
        this.speciesId = DEFAULT_SPECIES_ID
        this._listeners = []
        this.onboardingMode = false

        // Invisible pick target with FIXED dims: Box3 over the skinned clone
        // reads quantized raw vertex ranges (the dequantization correction
        // lives in the inverse-bind matrices), so bounds are authored — the
        // asset's source bounds × the height normalization, +6% padding.
        const hit = new THREE.Mesh(
            new THREE.BoxGeometry(0.61, 0.63, 0.49),
            new THREE.MeshBasicMaterial({ visible: false }),
        )
        hit.position.y = 0.31
        hit.name = 'character-hit'
        this.group.add(hit)

        // Behavior machine (ported, pure). Terrain access injected from the
        // spec-backed island facade; seeded stream — no Math.random.
        this._env = {
            heightAt: (x, z) => this.island.heightAt(x, z),
            shoreDistanceAt: (x, z) => this.island.shoreDistanceAt(x, z),
            seaLevel: this.island.seaLevel,
            worldSize: this.island.worldSize,
            rand: mulberry32(hashString('character') ^ 0x9e3779b9),
        }
        this._s = createBehaviorState(home.x, home.z, home.yaw, mulberry32(hashString('character')))

        this._mixer = null
        this._actions = {}
        this._current = null      // action currently playing
        this._currentClip = null
        this._idleHeld = false
        this._smoothY = null
        this._script = null       // scripted arrival (flyTo)
        this._reducedMotion = typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

        this._headBone = null
        this._modelReady = false
        this._disposed = false

        this._load()
    }

    /** Home = the spec's character object (cell center, terrain top, authored
     *  yaw); fallback: the flat land cell nearest the world center. */
    _resolveHome(spec)
    {
        const entry = spec.objects.find((o) => o.kind === 'character')
        if(entry)
        {
            const p = worldPositionOfObject(spec, entry, this.island._blurred)
            return { x: p.x, y: p.y, z: p.z, yaw: entry.yaw }
        }
        let best = null
        let bestD = Infinity
        for(const cell of this.island.landCells())
        {
            const d = cell.x * cell.x + cell.z * cell.z
            if(d < bestD && this.island.isPlaceable(cell.x, cell.z))
            {
                best = cell
                bestD = d
            }
        }
        const x = best ? best.x : 0
        const z = best ? best.z : 0
        return { x, y: this.island.heightAt(x, z), z, yaw: 0 }
    }

    async _load()
    {
        const gltf = await loadGlb(MODEL_URLS.character)
        if(!gltf || this._disposed) return

        applyToonMaterials(gltf.scene)
        // SkeletonUtils.clone: a plain .clone(true) leaves the SkinnedMesh
        // bound to the ORIGINAL skeleton. Wrap in a group so the world-scale
        // normalization never touches the skinned node itself.
        const inner = cloneSkinned(gltf.scene)
        const wrapper = new THREE.Group()
        wrapper.add(inner)
        wrapper.scale.setScalar(CHARACTER_HEIGHT / CHARACTER_SOURCE_HEIGHT)

        wrapper.traverse((n) =>
        {
            if(n.isMesh)
            {
                n.castShadow = true
                n.receiveShadow = true
            }
            // Animated verts move outside the static bind-pose bounds and get
            // frustum-culled mid-clip otherwise.
            if(n.isSkinnedMesh) n.frustumCulled = false
            if(!this._headBone && n.isBone && /head/i.test(n.name)) this._headBone = n
        })

        this.group.add(wrapper)
        this._model = wrapper

        this._mixer = new THREE.AnimationMixer(inner)
        for(const clip of gltf.animations)
        {
            this._actions[clip.name] = this._mixer.clipAction(clip)
        }
        this._modelReady = true
        // Start whatever the machine currently wants.
        this._playClip(behaviorClip(this._s), this._s.phase === 'idle')
    }

    /* ----- public contract ----- */

    /** Record the chosen species. Uniform look for now (R10): the id + the
     *  onSpeciesChange fan-out keep their API and persistence path; visual
     *  differentiation is deferred until more character assets exist. */
    setSpecies(id)
    {
        // Legacy alias from the retired procedural bird era.
        if(id === 'ember') id = DEFAULT_SPECIES_ID
        if(!COMPANION_SPECIES_IDS.has(id) || id === this.speciesId) return
        this.speciesId = id
        for(const fn of this._listeners) fn(id)
    }

    /** Cycle through the species catalog (uniform look, id-only for now). */
    cycleSpecies(delta = 1)
    {
        const ids = Array.from(COMPANION_SPECIES_IDS)
        const i = ids.indexOf(this.speciesId)
        const next = ids[(i + delta + ids.length) % ids.length]
        this.setSpecies(next)
    }

    /** Subscribe to species changes (UI re-renders). Returns unsubscribe. */
    onSpeciesChange(fn)
    {
        this._listeners.push(fn)
        return () => { this._listeners = this._listeners.filter(l => l !== fn) }
    }

    /**
     * Onboarding bypass — snap to the spec perch, freeze the behavior
     * machine, and hide until the arrival beat reveals the character.
     */
    setOnboardingMode(active)
    {
        const next = !!active
        if(next === this.onboardingMode) return
        this.onboardingMode = next
        if(next)
        {
            // Resolve any in-flight scripted arrival so awaiting callers
            // never hang when the ceremony forces an early reset.
            this._resolveScript()
            this._s = createBehaviorState(this.perchX, this.perchZ, this.perchYaw, this._env.rand)
            this._s.phase = 'idle'
            this._s.remaining = 3600
            this.group.position.set(this.perchX, this.perchY, this.perchZ)
            this.group.rotation.y = this.perchYaw
            this.facing = this.perchYaw
            this._smoothY = null
            this.group.visible = false
        }
        else
        {
            this.group.visible = true
            this._s.remaining = 0 // resume wandering promptly
        }
    }

    /**
     * Scripted ground/shore arrival (replaces the aerial cinematic): the
     * character walks — swims where the route crosses water — from
     * `startPos` (optional; defaults to where it stands) to `endPos`, plays
     * the wake-up flourish on settle, then faces `endYaw`. Returns a Promise
     * that resolves on arrival, on interruption (a competing flyTo /
     * onboarding reset), or on timeout — never hangs the onboarding.
     */
    flyTo({ startPos, endPos, duration, endYaw, reducedMotion = false } = {})
    {
        if(!endPos) return Promise.resolve()
        const toXZ = (p) => ({ x: p.x ?? 0, z: p.z ?? 0 })
        const end = toXZ(endPos)

        // A competing script resolves first so the new one owns the state.
        this._resolveScript()

        if(startPos)
        {
            const start = toXZ(startPos)
            this._s.x = start.x
            this._s.z = start.z
            this._s.yaw = Math.atan2(end.x - start.x, end.z - start.z)
            this._smoothY = null
        }
        this.group.visible = true

        if(reducedMotion || this._reducedMotion)
        {
            // Compressed arrival: snap to the destination, settle instantly.
            this._s.x = end.x
            this._s.z = end.z
            this._s.yaw = endYaw ?? this._s.yaw
            this._s.phase = 'idle'
            this._s.remaining = 6
            this.group.position.set(end.x, this.island.heightAt(end.x, end.z), end.z)
            this.group.rotation.y = this._s.yaw
            this.facing = this._s.yaw
            return Promise.resolve()
        }

        commandMoveTo(this._s, end.x, end.z)
        return new Promise((resolve) =>
        {
            this._script = {
                tx: end.x,
                tz: end.z,
                endYaw: endYaw ?? this.perchYaw,
                deadline: (this.state.time.elapsed || 0) + Math.max(ARRIVAL_TIMEOUT_S, (duration || 0) * 4),
                settled: false,
                resolve,
            }
        })
    }

    _resolveScript()
    {
        if(!this._script) return
        const resolve = this._script.resolve
        this._script = null
        if(resolve) resolve()
    }

    /**
     * World-space anchor for the speech bubble. Tracks the head bone once
     * the GLB resolves; before that (placeholder path) it returns the group
     * origin lifted to ~head height — always a finite Vector3.
     */
    getHeadWorldPosition(out)
    {
        if(this._headBone) return this._headBone.getWorldPosition(out)
        this.group.getWorldPosition(out)
        out.y += CHARACTER_HEIGHT * 0.85
        return out
    }

    /** True while the companion is "talking" (narrator panel open, or an
     *  object peek advanced to its lore/pickup panel). */
    isTalking()
    {
        if(this.view.kiraNarrator && this.view.kiraNarrator.isActive) return true
        if(this.view.objectPeek && this.view.objectPeek.step === 'pickup') return true
        return false
    }

    /* ----- update ----- */

    _playClip(name, holdAsIdlePose)
    {
        if(!this._modelReady) return
        if(name === this._currentClip && holdAsIdlePose === this._idleHeld) return
        const action = this._actions[name]
        if(!action) return
        if(this._current && this._current !== action)
        {
            this._current.fadeOut(CROSSFADE_S)
            this._current.timeScale = 1
        }
        action.reset().fadeIn(CROSSFADE_S).play()
        if(holdAsIdlePose)
        {
            // Idle is a HELD pose, not a played clip — park on one frame.
            action.time = IDLE_POSE_AT_END ? action.getClip().duration : 0
            action.timeScale = 0
        }
        else
        {
            action.timeScale = 1
        }
        this._current = action
        this._currentClip = name
        this._idleHeld = holdAsIdlePose
    }

    update()
    {
        const dt = Math.min(this.state.time.delta || 0, 0.06)
        const t = this.state.time.elapsed || 0
        const s = this._s

        const narrating = this.isTalking()
        const script = this._script

        if(this.onboardingMode && !script)
        {
            // Parked: the orchestrator owns position/pose. Keep the mixer
            // breathing so a revealed character isn't frozen mid-clip.
            if(this._mixer) this._mixer.update(dt)
            return
        }

        if(narrating && !script)
        {
            // Freeze wander + face the reader: hold the talk clip while the
            // narrator panel is open.
            if(s.phase !== 'talk') triggerTalk(s)
            s.remaining = Math.max(s.remaining, 0.5)
        }

        if(!this._reducedMotion || script)
        {
            advanceBehavior(s, dt, this._env)
        }

        // Scripted arrival bookkeeping (flyTo).
        if(script)
        {
            const dx = script.tx - s.x
            const dz = script.tz - s.z
            const arrived = dx * dx + dz * dz < ARRIVE_DIST * ARRIVE_DIST
            const timedOut = t > script.deadline
            if(!script.settled && (arrived || timedOut || s.phase === 'idle' || s.phase === 'sleep'))
            {
                if(timedOut && !arrived)
                {
                    // Snap-complete: the promise must never hang onboarding.
                    s.x = script.tx
                    s.z = script.tz
                }
                script.settled = true
                // Arrival flourish: the wake-up clip reads as "settling in".
                s.phase = 'wake'
                s.remaining = 2.6
                s.yaw = script.endYaw
            }
            else if(script.settled && s.phase !== 'wake')
            {
                // Wake finished → resolve and hand control back.
                s.yaw = script.endYaw
                this._resolveScript()
            }
            else if(!script.settled && s.phase !== 'goto' && s.phase !== 'wake')
            {
                // The machine bailed (leash refusal etc.) — re-command.
                commandMoveTo(s, script.tx, script.tz)
            }
        }

        // Vertical: terrain-following ashore, fixed draught while swimming,
        // blended at 10/s so the waterline never pops.
        const swimming = s.phase === 'swim' || (s.phase === 'goto' && s.wet)
        const ground = this._env.heightAt(s.x, s.z)
        const targetY = bodyTargetY(swimming, this._env.seaLevel, SWIM_SINK, ground)
        this._smoothY = this._smoothY === null
            ? targetY
            : this._smoothY + (targetY - this._smoothY) * Math.min(1, 10 * dt)
        const idling = s.phase === 'idle'
        const bob = idling ? Math.sin(t * BREATH_RATE) * BREATH_RISE : 0
        this.group.position.set(s.x, this._smoothY + bob, s.z)
        this.group.rotation.y = s.yaw
        this.facing = s.yaw

        // Sea wake rings follow the live pose while swimming.
        const seaMat = this.view.island?.seaMat
        if(seaMat?.uniforms?.uSwim)
        {
            seaMat.uniforms.uSwim.value.set(s.x, s.z, 0, swimming ? 1 : 0)
        }

        // Clip resolution + mixer tick.
        this._playClip(narrating ? 'Talk_Passionately' : behaviorClip(s), idling && !narrating)
        if(this._mixer) this._mixer.update(dt)
    }

    dispose()
    {
        this._disposed = true
        this._resolveScript()
        this._listeners = []
        this.scene.remove(this.group)
    }
}

// Re-exported so the idle-pose contract is visible to tests.
export { IDLE_POSE_CLIP }
