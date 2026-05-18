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

        // Phase 2b: pitch softened from 40° → 28° and target lifted 1.3 → 1.7
        // so the 3D frustum's top edge sits above the world horizon. That lets
        // the aurora ribbon (y≈3.9, ringRadius 22) and other sky-band assets
        // actually enter the visible region; at 40°/1.3 the top edge was at
        // pitch -21° from camera and aurora sat at -11° — fully clipped.
        this.fov = 38
        this.distance = 14
        this.pitchDeg = 28
        this.target = new THREE.Vector3(0, 1.7, 0)

        this.instance = new THREE.PerspectiveCamera(this.fov, this.viewport.width / this.viewport.height, 0.1, 2000)
        this.instance.rotation.reorder('YXZ')
        this._placeAtDefault()

        this.controls = null
    }

    _placeAtDefault()
    {
        const pitch = THREE.MathUtils.degToRad(this.pitchDeg)
        const y = this.target.y + Math.sin(pitch) * this.distance
        const planar = Math.cos(pitch) * this.distance
        this.instance.position.set(0, y, planar)
        this.instance.lookAt(this.target)
    }

    bindControls(domElement)
    {
        if(this.controls) return
        this.controls = new OrbitControls(this.instance, domElement)
        this.controls.enableDamping = true
        this.controls.dampingFactor = 0.08
        this.controls.target.copy(this.target)
        this.controls.minDistance = 6
        this.controls.maxDistance = 30
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
     */
    startLandingOrbit({ azimuthDegPerSec = 6, distance = 18, pitchDeg = 14, target } = {})
    {
        if(!this.controls) return
        if(target) this.controls.target.copy(target)
        const pitch = THREE.MathUtils.degToRad(pitchDeg)
        const y = this.controls.target.y + Math.sin(pitch) * distance
        const planar = Math.cos(pitch) * distance
        this.instance.position.set(0, y, planar)
        this.instance.lookAt(this.controls.target)

        // OrbitControls autoRotateSpeed: 2.0 ≈ 30s per rotation at 60fps
        // (12 deg/s). Convert deg/s → autoRotateSpeed units linearly.
        this.controls.autoRotate = true
        this.controls.autoRotateSpeed = azimuthDegPerSec / 6   // 6 deg/s → 1.0
        this.controls.enableZoom   = false
        this.controls.enablePan    = false
        this.controls.enableRotate = false
        this._inLandingOrbit = true
        this.controls.update()
    }

    stopLandingOrbit({ snapBack = true } = {})
    {
        if(!this.controls || !this._inLandingOrbit) return
        this.controls.autoRotate = false
        this.controls.enableZoom   = true
        this.controls.enablePan    = true
        this.controls.enableRotate = true
        this._inLandingOrbit = false
        if(snapBack)
        {
            this._placeAtDefault()
            this.controls.target.copy(this.target)
        }
        this.controls.update()
    }

    resize()
    {
        this.instance.aspect = this.viewport.width / this.viewport.height
        this.instance.updateProjectionMatrix()
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
    // Cinematic zoom — used by KiraNarrator to frame Kira during an
    // Animal-Crossing-style dialogue beat. While a zoom (or restore) is
    // animating, OrbitControls is suppressed; on restore-complete it
    // resumes at the prior orbit position.
    // -----------------------------------------------------------------
    zoomTo(position, lookAt, duration = 700)
    {
        if(!this._savedPos)
        {
            this._savedPos    = this.instance.position.clone()
            this._savedTarget = this.controls ? this.controls.target.clone() : this.target.clone()
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

    restoreZoom(duration = 700)
    {
        if(!this._savedPos) return
        this._zoom = {
            startPos:    this.instance.position.clone(),
            endPos:      this._savedPos.clone(),
            startTarget: this.controls ? this.controls.target.clone() : this.target.clone(),
            endTarget:   this._savedTarget.clone(),
            startTime:   performance.now(),
            duration,
            mode:        'out',
        }
    }

    // Smooth ride back to the default framing — exposed to a "reset
    // view" button in ZoomHud. Re-enables OrbitControls on arrival and
    // clears any narrator save-state because the student has asked the
    // camera to start over.
    resetToDefault(duration = 600)
    {
        const pitch  = THREE.MathUtils.degToRad(this.pitchDeg)
        const y      = this.target.y + Math.sin(pitch) * this.distance
        const planar = Math.cos(pitch) * this.distance
        const endPos = new THREE.Vector3(0, y, planar)
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
            // smootherstep so the camera doesn't ease in/out hard.
            const eased = t * t * t * (t * (t * 6 - 15) + 10)
            this.instance.position.lerpVectors(this._zoom.startPos, this._zoom.endPos, eased)
            const tgt = new THREE.Vector3().lerpVectors(this._zoom.startTarget, this._zoom.endTarget, eased)
            this.instance.lookAt(tgt)
            if(this.controls) this.controls.target.copy(tgt)
            if(t >= 1)
            {
                const mode = this._zoom.mode
                this._zoom = null
                // 'out' restores the saved pre-zoom position (KiraNarrator
                // close path); 'reset' is a fresh return-home gesture, so
                // it also re-enables controls AND clears the saved state
                // so a future narrator zoom starts cleanly.
                if(mode === 'out' || mode === 'reset')
                {
                    if(this.controls)
                    {
                        this.controls.enabled = true
                        this.controls.update()
                    }
                    this._savedPos    = null
                    this._savedTarget = null
                }
            }
            return
        }
        if(this.controls) this.controls.update()
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
