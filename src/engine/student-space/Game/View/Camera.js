import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import State from '../State/State.js'

/**
 * Static island framing — replaces Bruno's Player/Camera chain. Defaults match
 * the legacy prototype's P.camera (fov 38, distance 14, pitch ~40°, target
 * (0, 1.3, 0)). OrbitControls binds to the renderer canvas on first update()
 * because Renderer is constructed after Camera in View's ctor.
 */
export default class Camera
{
    constructor()
    {
        this.state = State.getInstance()
        this.viewport = this.state.viewport

        // Pitch softened to ~24° and target lifted to 1.9 keep the 3D
        // frustum's top edge above the world horizon so the aurora ribbon
        // (y≈3.9, ringRadius 22) and other sky-band assets stay in frame.
        // Distance widened to 18 / fov 41 frame the whole island silhouette
        // by default — matches the camera-tuner 'world-default' preset.
        this.fov = 41
        this.distance = 20
        this.pitchDeg = 24
        this.target = new THREE.Vector3(1.0, 1.6, 0.7)

        this.instance = new THREE.PerspectiveCamera(this.fov, this.viewport.width / this.viewport.height, 0.1, 2000)
        this.instance.rotation.reorder('YXZ')
        this._placeAtDefault()

        this.controls = null
        this._zoomTargetScratch = new THREE.Vector3()
    }

    _placeAtDefault()
    {
        const pitch = THREE.MathUtils.degToRad(this.pitchDeg)
        const y = this.target.y + Math.sin(pitch) * this.distance
        const planar = Math.cos(pitch) * this.distance
        this.instance.position.set(0, y, planar)
        this.instance.lookAt(this.target)
    }

    /** Default static framing as a plain {pos, target} pair. */
    _defaultPose()
    {
        const pitch = THREE.MathUtils.degToRad(this.pitchDeg)
        const y = this.target.y + Math.sin(pitch) * this.distance
        const planar = Math.cos(pitch) * this.distance
        return {
            pos:    new THREE.Vector3(0, y, planar),
            target: this.target.clone(),
        }
    }

    bindControls(domElement)
    {
        if(this.controls) return
        this.controls = new OrbitControls(this.instance, domElement)
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.08
        this.controls.target.copy(this.target)
        this.controls.minDistance = 6
        this.controls.maxDistance = 36
        this.controls.maxPolarAngle = Math.PI * 0.495
        this.controls.update()
    }

    /**
     * Landing-page orbit. EdupassLogin calls this on mount so the live 3D
     * island slowly rotates behind the title + sign-in CTA, then calls
     * stopLandingOrbit on click so the default framing snaps back in time
     * for the rest of the ceremony.
     *
     * Uses OrbitControls' built-in autoRotate (degrees per 60-frame second).
     * User drag/zoom/pan are disabled while this is active.
     *
     * NOTE: starting/stopping the landing orbit goes through the scene-tween
     * path, which drops any in-flight `zoomTo` save-stack anchors so the
     * dolly can hand control back cleanly on arrival. Don't combine a
     * landing-orbit toggle with a concurrent narrator/peek zoom expecting
     * its restoreZoom to still fire — it'll silently no-op.
     */
    startLandingOrbit({ azimuthDegPerSec = 6, distance = 18, pitchDeg = 14, target, transitionMs = 900 } = {})
    {
        if(!this.controls) return
        const orbitTarget = target ? target.clone() : this.controls.target.clone()
        const pitch = THREE.MathUtils.degToRad(pitchDeg)
        const y = orbitTarget.y + Math.sin(pitch) * distance
        const planar = Math.cos(pitch) * distance
        const endPos = new THREE.Vector3(0, y, planar)

        // OrbitControls autoRotateSpeed: 2.0 ≈ 30s per rotation at 60fps
        // (12 deg/s). Convert deg/s → autoRotateSpeed units linearly.
        this.controls.autoRotateSpeed = azimuthDegPerSec / 6   // 6 deg/s → 1.0
        this.controls.enableZoom   = false
        this.controls.enablePan    = false
        this.controls.enableRotate = false
        this._inLandingOrbit = true

        if(transitionMs > 0)
        {
            // Smooth dolly into the orbit pose, then flip autoRotate on so
            // the rotation picks up from the landing distance/pitch without
            // a discontinuity.
            this._beginSceneTween({
                endPos,
                endTarget: orbitTarget,
                duration: transitionMs,
                onComplete: () =>
                {
                    if(!this.controls || !this._inLandingOrbit) return
                    this.controls.autoRotate = true
                    this.controls.update()
                },
            })
        }
        else
        {
            this.instance.position.copy(endPos)
            this.controls.target.copy(orbitTarget)
            this.instance.lookAt(orbitTarget)
            // autoRotateSpeed=0 (from azimuthDegPerSec=0) makes this static
            // even with autoRotate=true; we still flip it on so subsequent
            // setAutoRotateSpeed callers don't have to also toggle the flag.
            this.controls.autoRotate = true
            this.controls.update()
        }
    }

    stopLandingOrbit({ snapBack = true, transitionMs = 900 } = {})
    {
        if(!this.controls || !this._inLandingOrbit) return
        this.controls.autoRotate = false
        this.controls.enableZoom   = true
        this.controls.enablePan    = true
        this.controls.enableRotate = true
        this._inLandingOrbit = false
        if(!snapBack)
        {
            this.controls.update()
            return
        }
        const home = this._defaultPose()
        if(transitionMs <= 0)
        {
            this._placeAtDefault()
            this.controls.target.copy(this.target)
            this.controls.update()
            return
        }
        // Smooth dolly back to the default static framing so the camera
        // doesn't snap-cut when the login surface goes away.
        this._beginSceneTween({
            endPos:    home.pos,
            endTarget: home.target,
            duration:  transitionMs,
        })
    }

    /**
     * Cinematic tween for "framing changes" the save-stack doesn't model —
     * landing-orbit on/off, hatch dolly, etc. Lives in the same _zoom slot
     * (so the per-frame integrator handles it) but does not touch the
     * owner-keyed save stack and uses the "scene" mode that re-enables
     * controls on completion when the stack is empty.
     */
    _beginSceneTween({ endPos, endTarget, duration = 700, onComplete })
    {
        if(!endPos || !endTarget) return
        // A scene tween is a top-level framing change (landing-orbit on/off,
        // hatch dolly). Any save-stack anchors from in-flight cinematic
        // zooms predate the new framing — restoring to them would yank the
        // camera away from whatever the new framing just set up. Drop the
        // stack so the tween's completion can re-enable controls cleanly.
        if(this._saveStack) this._saveStack.clear()
        this._zoom = {
            startPos:    this.instance.position.clone(),
            endPos:      endPos.clone(),
            startTarget: this.controls ? this.controls.target.clone() : this.target.clone(),
            endTarget:   endTarget.clone(),
            startTime:   performance.now(),
            duration,
            mode:        'scene',
            onComplete:  typeof onComplete === 'function' ? onComplete : null,
        }
        if(this.controls) this.controls.enabled = false
    }

    resize()
    {
        this.instance.aspect = this.viewport.width / this.viewport.height
        this.instance.updateProjectionMatrix()
    }

    /**
     * Replace the static framing's ctor seeds — used by the camera tuner so
     * tweaks to fov / distance / pitch / lookAt apply to `_defaultPose()`
     * (the anchor `resetToDefault()` returns to) without forcing an engine
     * remount. Pass `{ apply: true }` to also dolly the camera into the new
     * pose immediately; otherwise the change takes effect on the next reset.
     */
    setDefaultFraming({ fov, distance, pitchDeg, target } = {}, { apply = false } = {})
    {
        if(Number.isFinite(fov)) this.fov = fov
        if(Number.isFinite(distance)) this.distance = distance
        if(Number.isFinite(pitchDeg)) this.pitchDeg = pitchDeg
        if(target && Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.z))
        {
            this.target.set(target.x, target.y, target.z)
        }
        if(Number.isFinite(fov))
        {
            this.instance.fov = fov
            this.instance.updateProjectionMatrix()
        }
        if(this.controls) this.controls.target.copy(this.target)
        if(apply) this.resetToDefault(450)
    }

    // -----------------------------------------------------------------
    // Discrete zoom — wraps OrbitControls' dolly so HUD buttons and
    // keyboard shortcuts share the wheel/pinch range (min 6, max 30).
    // factor < 1 zooms in (smaller orbit distance), > 1 zooms out.
    // -----------------------------------------------------------------
    zoomBy(factor)
    {
        if(this._zoom || !this.controls) return
        const target = this.controls.target
        const offset = this.instance.position.clone().sub(target)
        const next = THREE.MathUtils.clamp(
            offset.length() * factor,
            this.controls.minDistance,
            this.controls.maxDistance,
        )
        offset.setLength(next)
        this.instance.position.copy(target).add(offset)
        this.controls.update()
    }

    // -----------------------------------------------------------------
    // Cinematic zoom — used by KiraNarrator, ObjectPeek, Sprouts, and
    // onboarding to frame a subject during a dialogue/peek beat. While
    // a zoom is animating, OrbitControls is suppressed; on the final
    // restore (stack drains) controls re-enable.
    //
    // Multiple consumers can stack zooms via `options.owner`. The first
    // zoom from a given owner captures the *current* camera pose as that
    // owner's restore anchor; subsequent zoomTo calls from the same owner
    // retarget without replacing the anchor (so a within-consumer chain
    // like ObjectPeek.open → _goPickup still returns to the pre-peek
    // pose on close). `restoreZoom` matched by owner pops that owner's
    // entry; out-of-order restores remove the anchor silently rather
    // than yanking the camera away from whichever owner is currently
    // on top.
    // -----------------------------------------------------------------
    zoomTo(position, lookAt, duration = 700, options = {})
    {
        const owner = options.owner ?? '_default'
        if(!this._saveStack) this._saveStack = new Map()
        if(!this._saveStack.has(owner))
        {
            // Anchor hand-off: a consumer taking over framing mid-sequence
            // (the capture sheet continuing from the kira-narrator close-up)
            // adopts the named owner's restore anchor instead of capturing
            // the current — already zoomed — pose, so its own restore
            // returns to the true pre-sequence pose.
            const adopted = options.adoptAnchorOf
                ? this._saveStack.get(options.adoptAnchorOf)
                : null
            if(adopted) this._saveStack.delete(options.adoptAnchorOf)
            this._saveStack.set(owner, adopted ?? {
                pos:    this.instance.position.clone(),
                target: this.controls ? this.controls.target.clone() : this.target.clone(),
            })
        }
        this._zoom = {
            startPos:    this.instance.position.clone(),
            endPos:      position.clone(),
            startTarget: this.controls ? this.controls.target.clone() : this.target.clone(),
            endTarget:   lookAt.clone(),
            startTime:   performance.now(),
            duration,
            mode:        'in',
        }
        if(this.controls) this.controls.enabled = false
    }

    restoreZoom(duration = 700, options = {})
    {
        const owner = options.owner ?? '_default'
        if(!this._saveStack || !this._saveStack.has(owner)) return
        const keys = Array.from(this._saveStack.keys())
        const top  = keys[keys.length - 1]
        if(owner !== top)
        {
            // Out-of-order close: another consumer is currently
            // displaying the camera. Drop our anchor and let them keep
            // ownership; they'll restore to their own pre-zoom pose.
            this._saveStack.delete(owner)
            return
        }
        const saved = this._saveStack.get(owner)
        this._saveStack.delete(owner)
        this._zoom = {
            startPos:    this.instance.position.clone(),
            endPos:      saved.pos.clone(),
            startTarget: this.controls ? this.controls.target.clone() : this.target.clone(),
            endTarget:   saved.target.clone(),
            startTime:   performance.now(),
            duration,
            mode:        'out',
        }
        if(this.controls) this.controls.enabled = false
    }

    // Smooth ride back to the default framing — exposed to a "reset
    // view" button in ZoomHud. Re-enables OrbitControls on arrival and
    // clears any narrator save-state because the student has asked the
    // camera to start over.
    resetToDefault(duration = 600)
    {
        const home = this._defaultPose()
        const endPos = home.pos
        this._zoom = {
            startPos:    this.instance.position.clone(),
            endPos,
            startTarget: this.controls ? this.controls.target.clone() : this.target.clone(),
            endTarget:   this.target.clone(),
            startTime:   performance.now(),
            duration,
            mode:        'reset',
        }
        if(this.controls) this.controls.enabled = false
    }

    update()
    {
        if(this._zoom)
        {
            const t = Math.min(1, (performance.now() - this._zoom.startTime) / this._zoom.duration)
            // 'in' (zooming toward a subject) uses ease-out cubic — fast
            // start, soft land — so the move reads as "going to" rather
            // than the mushy smootherstep wait/fly/wait curve. 'out',
            // 'reset', and 'scene' keep smootherstep so returning home
            // and other framing changes stay symmetric.
            const eased = this._zoom.mode === 'in'
                ? 1 - Math.pow(1 - t, 3)
                : t * t * t * (t * (t * 6 - 15) + 10)
            this.instance.position.lerpVectors(this._zoom.startPos, this._zoom.endPos, eased)
            const tgt = this._zoomTargetScratch.lerpVectors(this._zoom.startTarget, this._zoom.endTarget, eased)
            this.instance.lookAt(tgt)
            if(this.controls) this.controls.target.copy(tgt)
            if(t >= 1)
            {
                const mode = this._zoom.mode
                const onComplete = this._zoom.onComplete
                this._zoom = null
                // 'out' completes one owner's restore; 'reset' is a fresh
                // return-home gesture that drops the whole save stack.
                // Controls only re-enable when the stack is fully drained
                // — otherwise an outer consumer is still zoomed and we
                // mustn't hand the camera back to OrbitControls yet.
                if(mode === 'reset' && this._saveStack) this._saveStack.clear()
                if(mode === 'out' || mode === 'reset' || mode === 'scene')
                {
                    if((!this._saveStack || this._saveStack.size === 0) && this.controls)
                    {
                        this.controls.enabled = true
                        this.controls.update()
                    }
                }
                if(onComplete) try { onComplete() } catch(_) {}
            }
            return
        }
        // Skip OrbitControls.update() while a cinematic save-stack anchor is
        // still in flight (i.e. controls.enabled === false). The vendored
        // three.js OrbitControls.update() does NOT early-return on
        // !enabled — it still rebuilds spherical from the current pose and
        // clamps `radius` into [minDistance, maxDistance]. After an in-zoom
        // lands closer than minDistance (e.g. a flower close-up at ~2 units
        // with minDistance=6), the very next frame's clamp yanks the camera
        // outward, manifesting as a visible jump just after the zoom ends.
        // Letting controls.update() sit out until a restoreZoom / scene
        // tween hands ownership back keeps the camera parked exactly where
        // the cinematic ended.
        if(this.controls && this.controls.enabled) this.controls.update()
    }

    /**
     * OrbitControls binds canvas-level pointer/wheel/touch listeners on
     * construction; without explicit dispose, those listeners survive a
     * `game.dispose()` and accumulate per remount under React StrictMode
     * or HMR. The canvas itself is replaced when Renderer.dispose() runs,
     * but the listener handles on the *prior* canvas leak references to
     * the disposed THREE objects.
     */
    dispose()
    {
        try { this.controls?.dispose?.() } catch(_) {}
        this.controls = null
    }
}
