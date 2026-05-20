import * as THREE from 'three'

import Game from '../Game.js'
import View from './View.js'
import State from '../State/State.js'
import Debug from '../Debug/Debug.js'
import SkyBackgroundMaterial from './Materials/SkyBackgroundMaterial.js'
import SkySphereMaterial from './Materials/SkySphereMaterial.js'
import StarsMaterial from './Materials/StarsMaterial.js'

export default class Sky
{
    constructor()
    {
        this.game = Game.getInstance()
        this.view = View.getInstance()
        this.state = State.getInstance()
        this.debug = Debug.getInstance()
        
        this.viewport = this.state.viewport
        this.renderer = this.view.renderer
        this.scene = this.view.scene

        this.outerDistance = 1000

        this.group = new THREE.Group()
        this.scene.add(this.group)

        this.setCustomRender()
        this.setBackground()
        this.setSphere()
        this.setSun()
        this.setStars()
        this.setDebug()

        // Phase 2a: the CSS sky on body is the real backdrop. Bruno's WebGL
        // sky-sphere is no longer needed to paint the sky, so the offscreen
        // render target stays idle until an explicit consumer reattaches the
        // background mesh or asks for the target.
        this.group.remove(this.background.mesh)
        this.customRender.enabled = false
    }

    setCustomRender()
    {
        this.customRender = {}
        this.customRender.scene = new THREE.Scene()
        this.customRender.camera = this.view.camera.instance.clone()
        this.customRender.resolutionRatio = 0.1
        this.customRender.renderTarget = new THREE.WebGLRenderTarget(
            this.viewport.width * this.customRender.resolutionRatio,
            this.viewport.height * this.customRender.resolutionRatio,
            {
                generateMipmaps: false
            }
        )
        this.customRender.texture = this.customRender.renderTarget.texture
    }

    setBackground()
    {
        this.background = {}
        
        this.background.geometry = new THREE.PlaneGeometry(2, 2)
        
        // this.background.material = new THREE.MeshBasicMaterial({ wireframe: false, map: this.customRender.renderTarget.texture })
        this.background.material = new SkyBackgroundMaterial()
        this.background.material.uniforms.uTexture.value = this.customRender.renderTarget.texture
        // this.background.material.wireframe = true
        this.background.material.depthTest = false
        this.background.material.depthWrite = false
        
        this.background.mesh = new THREE.Mesh(this.background.geometry, this.background.material)
        this.background.mesh.frustumCulled = false
        
        this.group.add(this.background.mesh)
    }

    setSphere()
    {
        this.sphere = {}
        this.sphere.widthSegments = 128
        this.sphere.heightSegments = 64
        this.sphere.update = () =>
        {
            const geometry = new THREE.SphereGeometry(10, this.sphere.widthSegments, this.sphere.heightSegments)
            if(this.sphere.geometry)
            {
                this.sphere.geometry.dispose()
                this.sphere.mesh.geometry = this.sphere.geometry
            }
                
            this.sphere.geometry = geometry
        }
        this.sphere.material = new SkySphereMaterial()
        
        this.sphere.material.uniforms.uColorDayCycleLow.value.set('#f0fff9')
        this.sphere.material.uniforms.uColorDayCycleHigh.value.set('#2e89ff')
        this.sphere.material.uniforms.uColorNightLow.value.set('#004794')
        this.sphere.material.uniforms.uColorNightHigh.value.set('#001624')
        this.sphere.material.uniforms.uColorSun.value.set('#ff531a')
        this.sphere.material.uniforms.uColorDawn.value.set('#ff1900')
        this.sphere.material.uniforms.uDayCycleProgress.value = 0
        this.sphere.material.side = THREE.BackSide

        this.sphere.update()

        // this.sphere.material.wireframe = true
        this.sphere.mesh = new THREE.Mesh(this.sphere.geometry, this.sphere.material)
        this.customRender.scene.add(this.sphere.mesh)
    }

    setSun()
    {
        this.sun = {}
        this.sun.distance = this.outerDistance - 50
        
        const geometry = new THREE.CircleGeometry(0.02 * this.sun.distance, 32)
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff })
        this.sun.mesh = new THREE.Mesh(geometry, material)
        this.group.add(this.sun.mesh)
    }

    setStars()
    {
        this.stars = {}
        this.stars.count = 1000
        this.stars.distance = this.outerDistance

        this.stars.update = () =>
        {
            // Create geometry
            const positionArray = new Float32Array(this.stars.count * 3)
            const sizeArray = new Float32Array(this.stars.count)
            const colorArray = new Float32Array(this.stars.count * 3)

            for(let i = 0; i < this.stars.count; i++)
            {
                const iStride3 = i * 3

                // Position
                const position = new THREE.Vector3()
                position.setFromSphericalCoords(this.stars.distance, Math.acos(Math.random()), 2 * Math.PI * Math.random())

                positionArray[iStride3    ] = position.x
                positionArray[iStride3 + 1] = position.y
                positionArray[iStride3 + 2] = position.z

                // Size
                sizeArray[i] = Math.pow(Math.random() * 0.9, 10) + 0.1

                // Color
                const color = new THREE.Color()
                color.setHSL(Math.random(), 1, 0.5 + Math.random() * 0.5)
                colorArray[iStride3    ] = color.r
                colorArray[iStride3 + 1] = color.g
                colorArray[iStride3 + 2] = color.b
            }

            const geometry = new THREE.BufferGeometry()
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionArray, 3))
            geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizeArray, 1))
            geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colorArray, 3))
            
            // Dispose of old one
            if(this.stars.geometry)
            {
                this.stars.geometry.dispose()
                this.stars.points.geometry = this.stars.geometry
            }
                
            this.stars.geometry = geometry
        }

        // Geometry
        this.stars.update()

        // Material
        // this.stars.material = new THREE.PointsMaterial({ size: 5, sizeAttenuation: false })
        this.stars.material = new StarsMaterial()
        this.stars.material.uniforms.uHeightFragments.value = this.viewport.height * this.viewport.clampedPixelRatio

        // Points
        this.stars.points = new THREE.Points(this.stars.geometry, this.stars.material)
        this.group.add(this.stars.points)
    }

    setDebug()
    {
        if(!this.debug.active)
            return

        // Sphere
        const sphereGeometryFolder = this.debug.ui.getFolder('view/sky/sphere/geometry')

        sphereGeometryFolder.add(this.sphere, 'widthSegments').min(4).max(512).step(1).name('widthSegments').onChange(() => { this.sphere.update() })
        sphereGeometryFolder.add(this.sphere, 'heightSegments').min(4).max(512).step(1).name('heightSegments').onChange(() => { this.sphere.update() })

        const sphereMaterialFolder = this.debug.ui.getFolder('view/sky/sphere/material')

        sphereMaterialFolder.add(this.sphere.material.uniforms.uAtmosphereElevation, 'value').min(0).max(5).step(0.01).name('uAtmosphereElevation')
        sphereMaterialFolder.add(this.sphere.material.uniforms.uAtmospherePower, 'value').min(0).max(20).step(1).name('uAtmospherePower')
        sphereMaterialFolder.addColor(this.sphere.material.uniforms.uColorDayCycleLow, 'value').name('uColorDayCycleLow')
        sphereMaterialFolder.addColor(this.sphere.material.uniforms.uColorDayCycleHigh, 'value').name('uColorDayCycleHigh')
        sphereMaterialFolder.addColor(this.sphere.material.uniforms.uColorNightLow, 'value').name('uColorNightLow')
        sphereMaterialFolder.addColor(this.sphere.material.uniforms.uColorNightHigh, 'value').name('uColorNightHigh')
        sphereMaterialFolder.add(this.sphere.material.uniforms.uDawnAngleAmplitude, 'value').min(0).max(1).step(0.001).name('uDawnAngleAmplitude')
        sphereMaterialFolder.add(this.sphere.material.uniforms.uDawnElevationAmplitude, 'value').min(0).max(1).step(0.01).name('uDawnElevationAmplitude')
        sphereMaterialFolder.addColor(this.sphere.material.uniforms.uColorDawn, 'value').name('uColorDawn')
        sphereMaterialFolder.add(this.sphere.material.uniforms.uSunAmplitude, 'value').min(0).max(3).step(0.01).name('uSunAmplitude')
        sphereMaterialFolder.add(this.sphere.material.uniforms.uSunMultiplier, 'value').min(0).max(1).step(0.01).name('uSunMultiplier')
        sphereMaterialFolder.addColor(this.sphere.material.uniforms.uColorSun, 'value').name('uColorSun')
    
        // Stars
        const starsFolder = this.debug.ui.getFolder('view/sky/stars')

        starsFolder.add(this.stars, 'count').min(100).max(50000).step(100).name('count').onChange(() => { this.stars.update() })
        starsFolder.add(this.stars.material.uniforms.uSize, 'value').min(0).max(1).step(0.0001).name('uSize')
        starsFolder.add(this.stars.material.uniforms.uBrightness, 'value').min(0).max(1).step(0.001).name('uBrightness')
    }

    update()
    {
        const dayState = this.state.day
        const sunState = this.state.sun
        const playerState = this.state.player

        // Group
        this.group.position.set(
            playerState.position.current[0],
            playerState.position.current[1],
            playerState.position.current[2]
        )

        // Sphere
        this.sphere.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)
        // DayCycle exposes skyDayProgress in Bruno's frame (noon→0/1, midnight→0.5)
        // so this shader keeps its original `dayIntensity = abs(progress - 0.5) * 2` mapping.
        this.sphere.material.uniforms.uDayCycleProgress.value = dayState.skyDayProgress
        // Palette-port: drive Bruno's gradient endpoints from the hourly-interpolated
        // DAY_KEYS palette. We collapse Bruno's day/night blend (both pairs equal) and
        // let the keyframe interpolation do the day-to-night work — that way the
        // 11 sunrise/sunset/twilight keys land directly on the sphere.
        const s = dayState.currentState
        if(s)
        {
            const uniforms = this.sphere.material.uniforms
            uniforms.uColorDayCycleHigh.value.setRGB(s.skyTop[0] / 255, s.skyTop[1] / 255, s.skyTop[2] / 255)
            uniforms.uColorDayCycleLow.value.setRGB(s.skyBottom[0] / 255, s.skyBottom[1] / 255, s.skyBottom[2] / 255)
            uniforms.uColorNightHigh.value.setRGB(s.skyTop[0] / 255, s.skyTop[1] / 255, s.skyTop[2] / 255)
            uniforms.uColorNightLow.value.setRGB(s.skyBottom[0] / 255, s.skyBottom[1] / 255, s.skyBottom[2] / 255)
            // Bruno's sphere shader has TWO sun terms — one gated by uSunMultiplier
            // (we drive that from sunInt) and a SECOND unconditional `sunGlowStrength`
            // bloom that's always tinted by uColorSun. At night the sun dips below
            // the horizon and that bloom would paint the screen white from below,
            // so we pre-multiply uColorSun by sunInt — black at night, full at noon.
            uniforms.uColorSun.value.setRGB(
                s.sunColor[0] / 255 * s.sunInt,
                s.sunColor[1] / 255 * s.sunInt,
                s.sunColor[2] / 255 * s.sunInt,
            )
            // Dawn glow uses skyBottom as its tint — that's where the legacy keyframes
            // park the sunset orange/pink. Bruno's shader gates it with its own progress
            // envelope so it only fires near twilight.
            uniforms.uColorDawn.value.setRGB(s.skyBottom[0] / 255, s.skyBottom[1] / 255, s.skyBottom[2] / 255)
            uniforms.uSunMultiplier.value = s.sunInt
            this.sun.mesh.material.color.setRGB(s.sunColor[0] / 255, s.sunColor[1] / 255, s.sunColor[2] / 255)
        }
        
        // Sun
        this.sun.mesh.position.set(
            sunState.position.x * this.sun.distance,
            sunState.position.y * this.sun.distance,
            sunState.position.z * this.sun.distance
        )
        this.sun.mesh.lookAt(
            playerState.position.current[0],
            playerState.position.current[1],
            playerState.position.current[2]
        )

        // Stars
        this.stars.material.uniforms.uSunPosition.value.set(sunState.position.x, sunState.position.y, sunState.position.z)
        this.stars.material.uniforms.uHeightFragments.value = this.viewport.height * this.viewport.clampedPixelRatio

        if(!this._shouldRenderOffscreenSky()) return

        // Render in render target — keep the sky-sphere camera at the origin so
        // we render the sphere from its centre. (Bruno's clone() pulls the main
        // camera's position; without this reset we'd be outside the dome looking
        // mostly down at the lower hemisphere where the shader's atmosphere math
        // overshoots and blooms to white.)
        this.customRender.camera.position.set(0, 0, 0)
        this.customRender.camera.quaternion.copy(this.view.camera.instance.quaternion)
        this.renderer.instance.setRenderTarget(this.customRender.renderTarget)
        this.renderer.instance.render(this.customRender.scene, this.customRender.camera)
        this.renderer.instance.setRenderTarget(null)
    }

    _shouldRenderOffscreenSky()
    {
        return this.customRender.enabled || this.background.mesh.parent === this.group
    }

    resize()
    {
        if(!this._shouldRenderOffscreenSky()) return
        this.customRender.renderTarget.width = this.viewport.width * this.customRender.resolutionRatio
        this.customRender.renderTarget.height = this.viewport.height * this.customRender.resolutionRatio
    }
}
