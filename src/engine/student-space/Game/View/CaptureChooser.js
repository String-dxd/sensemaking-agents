/**
 * Capture mode chooser — a full-viewport panel. Each capture mode is a
 * floating 3D primitive that idles in its own viewport. Vertical scroll
 * reveals the next object. Tapping a primitive enters that capture mode.
 *
 *   - Open chat            → mint/teal octahedron (rotated diamond)
 *   - Mood journaling      → blue tetrahedron (triangle)
 *   - Capture moment       → purple sphere
 *
 * The chooser owns a single THREE renderer that's reused across three
 * stacked stages (one mesh per stage). Each stage drives the renderer to
 * paint its own primitive on its own frame so we avoid spinning up three
 * WebGL contexts on a phone. The stage at the top of the visible area
 * "owns" the canvas via position-sticky-style positioning per frame.
 *
 * Routing: tapping a stage calls OverlayController.open(mode) — the
 * controller atomically swaps active surface + body class. The chooser's
 * own × dismisses the whole capture panel (only place that does).
 * Sub-sheet ×'s navigate BACK to here (handled in those sheets).
 */
import * as THREE from 'three'
import OverlayController from './OverlayController.js'

const MODES = [
    {
        id:    'ask',
        label: 'Open chat',
        sub:   'Talk it out — type or voice. Ramble. Loop back.',
        build: () => buildSpeechBubble(),
    },
    {
        id:    'mood',
        label: 'Name a feeling',
        sub:   'Just the loudest one.',
        build: () => buildHeart(),
    },
    {
        id:    'photo',
        label: 'Snap a moment',
        sub:   'Capture what is in front of you. Add words or skip.',
        build: () => buildCamera(),
    },
]

/* ---------- mode-shape builders ----------
 *
 * Each builder returns a THREE.Object3D centred on the origin in a roughly
 * unit-sized bounding box so the chooser stage can frame them uniformly.
 * Flat shading + low-poly idiom matches the rest of the project.
 */

function buildSpeechBubble()
{
    // Speech bubble = rounded plaque with a tail. Built as an extruded
    // 2D bubble shape so the rounded profile reads from any rotation
    // angle (a thick brick read as a wall from the side).
    const group = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6FC2B3, roughness: 0.42, metalness: 0.04 })
    const dotMat  = new THREE.MeshStandardMaterial({ color: 0x1F5A4F, roughness: 0.4 })

    const shape = new THREE.Shape()
    const w = 0.85, h = 0.55, r = 0.22
    // Rounded-rectangle bubble outline.
    shape.moveTo(-w + r, h)
    shape.lineTo(w - r, h)
    shape.quadraticCurveTo(w, h, w, h - r)
    shape.lineTo(w, -h + r)
    shape.quadraticCurveTo(w, -h, w - r, -h)
    // Tail dip on the bottom edge — small triangular notch off-centre.
    shape.lineTo(-0.20, -h)
    shape.lineTo(-0.35, -h - 0.35)
    shape.lineTo(-0.45, -h)
    shape.lineTo(-w + r, -h)
    shape.quadraticCurveTo(-w, -h, -w, -h + r)
    shape.lineTo(-w, h - r)
    shape.quadraticCurveTo(-w, h, -w + r, h)

    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.32,
        bevelEnabled: true,
        bevelSegments: 4,
        bevelSize: 0.08,
        bevelThickness: 0.06,
        curveSegments: 18,
    })
    geo.translate(0, 0, -0.16)   // centre on Z
    geo.scale(1.05, 1.05, 1.05)

    group.add(new THREE.Mesh(geo, bodyMat))

    // Three chat dots on the front face — bigger and further forward so
    // they remain readable as the bubble rotates.
    const dotGeo = new THREE.SphereGeometry(0.11, 16, 12)
    for(let i = 0; i < 3; i++)
    {
        const dot = new THREE.Mesh(dotGeo, dotMat)
        dot.position.set(-0.35 + i * 0.35, 0.08, 0.30)
        group.add(dot)
    }
    return group
}

function buildHeart()
{
    // Build a 2D heart via THREE.Shape, then extrude for depth.
    const shape = new THREE.Shape()
    const s = 0.7  // overall scale
    shape.moveTo(0, -1.0 * s)
    shape.bezierCurveTo( 1.10 * s, -0.30 * s,  1.20 * s,  0.55 * s,  0.55 * s,  0.85 * s)
    shape.bezierCurveTo( 0.20 * s,  1.05 * s,  0.05 * s,  0.85 * s,  0.00 * s,  0.55 * s)
    shape.bezierCurveTo(-0.05 * s,  0.85 * s, -0.20 * s,  1.05 * s, -0.55 * s,  0.85 * s)
    shape.bezierCurveTo(-1.20 * s,  0.55 * s, -1.10 * s, -0.30 * s,  0.00 * s, -1.0 * s)

    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.45,
        bevelEnabled: true,
        bevelSegments: 4,
        bevelSize: 0.10,
        bevelThickness: 0.08,
        curveSegments: 14,
    })
    // Centre on Z so rotation reads through the depth.
    geo.translate(0, 0, -0.225)

    const mat = new THREE.MeshStandardMaterial({
        color: 0xE85973,
        roughness: 0.36,
        metalness: 0.0,
    })
    return new THREE.Mesh(geo, mat)
}

function buildCamera()
{
    const group = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6E5BD8, roughness: 0.42, metalness: 0.10 })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2E1F58, roughness: 0.5 })
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xB7A8FF, roughness: 0.18, metalness: 0.4 })
    const shineMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.1 })

    // Body — wide rounded box (boxy retro-camera silhouette).
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 1.05, 0.85),
        bodyMat,
    )
    group.add(body)

    // Viewfinder bump on top.
    const bump = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.22, 0.55),
        bodyMat,
    )
    bump.position.set(0, 0.6, 0)
    group.add(bump)

    // Shutter button (small cylinder on the top-left).
    const shutter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.10, 0.10, 0.10, 12),
        darkMat,
    )
    shutter.position.set(-0.55, 0.58, 0)
    group.add(shutter)

    // Lens — three concentric cylinders for the toon retro look.
    const lensOuter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.48, 0.48, 0.45, 28),
        darkMat,
    )
    lensOuter.rotation.x = Math.PI / 2
    lensOuter.position.set(0.05, -0.05, 0.45)
    group.add(lensOuter)

    const lensMid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.46, 24),
        bodyMat,
    )
    lensMid.rotation.x = Math.PI / 2
    lensMid.position.set(0.05, -0.05, 0.50)
    group.add(lensMid)

    const lensGlass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.05, 22),
        glassMat,
    )
    lensGlass.rotation.x = Math.PI / 2
    lensGlass.position.set(0.05, -0.05, 0.70)
    group.add(lensGlass)

    // Catchlight on the lens glass for life.
    const shine = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 10),
        shineMat,
    )
    shine.position.set(-0.08, 0.06, 0.74)
    group.add(shine)

    // Flash window — small bright square on the right side.
    const flash = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.10, 0.04),
        shineMat,
    )
    flash.position.set(0.62, 0.30, 0.43)
    group.add(flash)

    return group
}

export default class CaptureChooser
{
    constructor({ routes })
    {
        this.routes = routes

        const root = document.createElement('div')
        root.className = 'capture-chooser'
        root.setAttribute('aria-hidden', 'true')
        root.setAttribute('inert', '')
        root.innerHTML = `
            <button class="capture-chooser__close" type="button" aria-label="Close capture">×</button>
            <div class="capture-chooser__scroll">
                <header class="capture-chooser__head">
                    <h2 class="capture-chooser__title">Capture</h2>
                </header>
                <ul class="capture-chooser__stages" role="list">
                    ${MODES.map((m) => `
                        <li class="capture-stage" data-mode="${m.id}" role="listitem">
                            <button class="capture-stage__btn" type="button" aria-label="${m.label}">
                                <span class="capture-stage__canvas-slot"></span>
                                <span class="capture-stage__text">
                                    <span class="capture-stage__label">${m.label}</span>
                                    <span class="capture-stage__sub">${m.sub}</span>
                                </span>
                            </button>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `
        document.body.appendChild(root)
        this.root = root
        this.scroll = root.querySelector('.capture-chooser__scroll')
        this.isOpen = false
        this._scenes = []
        this._stagesEls = []
        this._rafId = null

        this._buildScenes()

        root.addEventListener('click', (event) =>
        {
            if(event.target.closest('.capture-chooser__close'))
            {
                // The chooser × is the ONLY place that dismisses the whole
                // capture panel. Sub-sheet ×'s navigate back here instead.
                OverlayController.getInstance().close('chooser')
                return
            }
            const btn = event.target.closest('.capture-stage__btn')
            if(!btn) return
            const stage = btn.closest('.capture-stage')
            if(!stage) return
            this._route(stage.dataset.mode)
        })

        document.addEventListener('keydown', (event) =>
        {
            if(this.isOpen && event.key === 'Escape')
            {
                OverlayController.getInstance().close('chooser')
            }
        })
    }

    _buildScenes()
    {
        const stageEls = this.root.querySelectorAll('.capture-stage')
        MODES.forEach((mode, i) =>
        {
            const stageEl = stageEls[i]
            const slot = stageEl.querySelector('.capture-stage__canvas-slot')

            const canvas = document.createElement('canvas')
            canvas.className = 'capture-stage__canvas'
            slot.appendChild(canvas)

            const renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: true,
                alpha: true,
                powerPreference: 'low-power',
            })
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

            const scene = new THREE.Scene()

            const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
            camera.position.set(0, 0.1, 5.5)
            camera.lookAt(0, 0, 0)

            // Three-light rig: warm key + cool fill + soft ambient so the
            // flat-shaded facets read clearly.
            const ambient = new THREE.AmbientLight(0xffffff, 0.55)
            scene.add(ambient)
            const key = new THREE.DirectionalLight(0xfff2dc, 0.9)
            key.position.set(2.5, 3.5, 4)
            scene.add(key)
            const fill = new THREE.DirectionalLight(0xc8d4ff, 0.45)
            fill.position.set(-3, 1.5, 2)
            scene.add(fill)

            const mesh = mode.build()
            // Default-tilted to a 3/4 angle so initial silhouette has depth.
            mesh.rotation.set(0.25, 0.6, 0)
            scene.add(mesh)

            this._scenes.push({
                canvas,
                renderer,
                scene,
                camera,
                mesh,
                phase: i * 1.7,   // stagger idle phase per stage
                lastW: 0,
                lastH: 0,
            })
            this._stagesEls.push(stageEl)
        })
    }

    _resize()
    {
        for(const s of this._scenes)
        {
            const rect = s.canvas.getBoundingClientRect()
            const w = Math.max(64, Math.floor(rect.width))
            const h = Math.max(64, Math.floor(rect.height))
            if(w === s.lastW && h === s.lastH) continue
            s.renderer.setSize(w, h, false)
            s.camera.aspect = w / h
            s.camera.updateProjectionMatrix()
            s.lastW = w
            s.lastH = h
        }
    }

    _animate = () =>
    {
        if(!this.isOpen) { this._rafId = null; return }
        this._resize()
        const t = performance.now() * 0.001
        for(const s of this._scenes)
        {
            // Gentle Y bob + a slow sway around the front-3/4 angle. Full
            // continuous rotation catches the shapes side-on (we'd see the
            // bubble's depth or the camera's back); a bounded sway keeps the
            // recognisable face mostly toward the camera. Each stage offset
            // so the trio doesn't bob in lockstep.
            const bob = Math.sin(t * 0.9 + s.phase) * 0.14
            s.mesh.position.y = bob
            s.mesh.rotation.y = 0.45 + Math.sin(t * 0.55 + s.phase) * 0.30
            s.mesh.rotation.x = 0.12 + Math.sin(t * 0.5 + s.phase) * 0.06
            s.renderer.render(s.scene, s.camera)
        }
        this._rafId = requestAnimationFrame(this._animate)
    }

    open()
    {
        this.root.setAttribute('aria-hidden', 'false')
        this.root.removeAttribute('inert')
        this.root.classList.add('is-open')
        this.isOpen = true
        if(this.scroll) this.scroll.scrollTop = 0
        // Rebuild scenes if close() disposed them (we now dispose on close
        // to release the three WebGL contexts back to the browser pool).
        if(this._scenes.length === 0) this._buildScenes()
        // Kick the render loop on the next frame so the canvas slots have
        // measured their final layout before the first resize.
        if(this._rafId === null)
        {
            this._rafId = requestAnimationFrame(() =>
            {
                this._rafId = requestAnimationFrame(this._animate)
            })
        }
    }

    close()
    {
        if(!this.isOpen) return
        this.root.classList.remove('is-open')
        this.root.setAttribute('aria-hidden', 'true')
        this.root.setAttribute('inert', '')
        this.isOpen = false
        if(this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null }
        // Browsers cap WebGL contexts per page (~16 in Chrome). Each MODES
        // stage builds its own renderer (3 contexts), and the chooser opens
        // and closes repeatedly within a session — without explicit dispose
        // + forceContextLoss every close leaks all three contexts and a
        // dozen open/close cycles starve the rest of the page (the main
        // engine renderer included) of GL state.
        //
        // We dispose on close, then rebuild on the next open() so the
        // chooser stays interactive across many show/hide cycles.
        this._disposeScenes()
        OverlayController.getInstance().noteClosed('chooser')
    }

    _disposeScenes()
    {
        for(const s of this._scenes)
        {
            try { s.renderer?.dispose?.() } catch(_) {}
            try { s.renderer?.forceContextLoss?.() } catch(_) {}
            try { s.canvas?.remove?.() } catch(_) {}
        }
        this._scenes = []
        this._stagesEls = []
    }

    /**
     * Open intentionally re-builds scenes lazily because close() now
     * disposes them — the WebGL context leak (3 contexts per open/close
     * cycle) was higher cost than the rebuild on re-open.
     */
    toggle()
    {
        this.isOpen ? this.close() : this.open()
    }

    _route(mode)
    {
        if(!this.routes[mode]) return
        OverlayController.getInstance().open(mode)
    }
}
