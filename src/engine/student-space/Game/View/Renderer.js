import * as THREE from 'three'

import Game from '../Game.js'
import View from './View.js'
import Debug from '../Debug/Debug.js'
import State from '../State/State.js'
import { selectPixelRatio } from '../State/Performance.js'
import { applyRendererSize } from './renderQuality.js'

export default class Renderer
{
    constructor(_options = {})
    {
        this.game = Game.getInstance()
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()

        this.scene = this.view.scene
        this.domElement = this.game.domElement
        this.viewport = this.state.viewport
        this.time = this.state.time
        this.camera = this.view.camera

        this.setInstance()
    }

    setInstance()
    {
        // Transparent canvas — the CSS sky (--sky-top / mid / bottom on body)
        // is the real backdrop; the canvas only paints island/grass/tree/stars.
        // Switching to alpha:true + setClearAlpha(0) lets the body gradient
        // show through the sky region without us having to keep Bruno's
        // sky-sphere render target alive.
        //
        // We try the preferred config first (antialias + high-performance).
        // If the browser's WebGL context pool is exhausted (Chrome caps at
        // ~16 contexts per process; HMR + StrictMode can leak across dev
        // reloads), the constructor throws. Retry once with cheaper
        // settings before surfacing the failure — most exhaustion cases
        // recover with a low-power discrete-GPU-less context, and the
        // visual difference is mild.
        const wantAntialias = this.state.performance?.settings?.antialias !== false
        try
        {
            this.instance = new THREE.WebGLRenderer({
                alpha: true,
                antialias: wantAntialias,
                powerPreference: 'high-performance',
            })
        }
        catch(err)
        {
            console.warn('[Renderer] Preferred WebGL config failed, retrying with low-power settings.', err)
            this.instance = new THREE.WebGLRenderer({
                alpha: true,
                antialias: false,
                powerPreference: 'low-power',
                failIfMajorPerformanceCaveat: false,
            })
        }

        this.instance.sortObjects = false
        this.instance.domElement.style.position = 'absolute'
        this.instance.domElement.style.top = 0
        this.instance.domElement.style.left = 0
        this.instance.domElement.style.width = '100%'
        this.instance.domElement.style.height = '100%'

        this.instance.setClearAlpha(0)
        this._qualityRevision = -1
        this._appliedPixelRatio = null
        this._applyQuality(true)

        // this.instance.physicallyCorrectLights = true
        // this.instance.gammaOutPut = true
        // this.instance.outputEncoding = THREE.sRGBEncoding
        // this.instance.shadowMap.type = THREE.PCFSoftShadowMap
        // this.instance.shadowMap.enabled = false
        // this.instance.toneMapping = THREE.ReinhardToneMapping
        // this.instance.toneMapping = THREE.ReinhardToneMapping
        // this.instance.toneMappingExposure = 1.3

        this.context = this.instance.getContext()

        // Add stats panel
        if(this.debug.stats)
        {
            this.debug.stats.setRenderPanel(this.context)
        }
    }

    resize()
    {
        // Instance
        this._applyQuality(true)
    }

    _applyQuality(force = false)
    {
        const revision = this.state.performance?.revision ?? 0
        const targetPixelRatio = selectPixelRatio(
            this.viewport.pixelRatio ?? this.viewport.clampedPixelRatio,
            this.state.performance?.settings || 'high'
        )
        if(!force && revision === this._qualityRevision && targetPixelRatio === this._appliedPixelRatio)
            return

        this._appliedPixelRatio = applyRendererSize(this.instance, this.viewport, this.state.performance)
        this._qualityRevision = revision
    }

    update()
    {
        this._applyQuality()

        if(this.debug.stats)
            this.debug.stats.beforeRender()

        this.instance.render(this.scene, this.camera.instance)

        // Rain overlay sits AFTER the main render so the glass pass can
        // sample the just-painted framebuffer and the streaks layer on top.
        // Early-outs when weather.rain ≤ 0 so the no-rain path is free.
        if(this.view.rain)
            this.view.rain.render(this.instance)

        if(this.debug.stats)
            this.debug.stats.afterRender()
    }

    destroy()
    {
        try { this.instance.renderLists.dispose() } catch(_) {}
        try { this.instance.dispose() } catch(_) {}
        // `dispose()` cleans up textures/programs/buffers but leaves the
        // underlying GL context alive. Without forceContextLoss, every
        // HMR cycle or StrictMode remount accumulates an orphaned context
        // and the browser eventually throws "Error creating WebGL context"
        // on a fresh page load.
        try { this.instance.forceContextLoss?.() } catch(_) {}
        try { this.renderTarget?.dispose?.() } catch(_) {}
    }
}
