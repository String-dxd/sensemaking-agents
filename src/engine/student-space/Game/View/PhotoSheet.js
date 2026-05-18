import State from '../State/State.js'
import OverlayController from './OverlayController.js'

/**
 * Photo capture — opens the camera as a live stream, captures a still frame
 * to a canvas, then offers a preview with Log / Retake.
 *
 * Three stages:
 *   1. live    — getUserMedia stream rendered into a <video>, shutter button
 *                grabs the current frame.
 *   2. review  — frozen still + caption + Log / Retake. Caption is optional.
 *   3. denied  — getUserMedia rejected (permission, no camera, etc.); shows
 *                an inline message + a "Try again" affordance.
 *
 * Read-only replay mode bypasses getUserMedia entirely and just renders the
 * saved data URL into the review stage so the same UI doubles as a viewer.
 *
 * The × at the top is "back": returns to the chooser. The chooser × is the
 * only place that fully dismisses the capture panel.
 */
export default class PhotoSheet
{
    constructor()
    {
        this.state = State.getInstance()
        this.captures = this.state.captures

        const root = document.createElement('div')
        root.className = 'photo-sheet'
        root.setAttribute('aria-hidden', 'true')
        root.innerHTML = `
            <button class="photo-sheet__close" type="button" aria-label="Back">×</button>
            <div class="photo-sheet__inner" data-stage="live">
                <p class="photo-sheet__eyebrow">Capture a moment</p>
                <h2 class="photo-sheet__title">Frame it, then shoot.</h2>

                <!-- STAGE: live camera -->
                <section class="photo-sheet__stage" data-stage="live">
                    <div class="photo-sheet__viewfinder">
                        <video class="photo-sheet__video" playsinline muted autoplay></video>
                    </div>
                    <p class="photo-sheet__hint photo-sheet__hint--live" hidden></p>
                    <div class="photo-sheet__row photo-sheet__row--shoot">
                        <button class="photo-sheet__shutter" type="button" aria-label="Take photo">
                            <span class="photo-sheet__shutter-ring"></span>
                            <span class="photo-sheet__shutter-core"></span>
                        </button>
                    </div>
                </section>

                <!-- STAGE: review still -->
                <section class="photo-sheet__stage" data-stage="review" hidden>
                    <div class="photo-sheet__preview">
                        <img class="photo-sheet__image" alt="" />
                    </div>
                    <textarea
                        class="photo-sheet__caption"
                        rows="3"
                        placeholder="Add a description (optional)"
                    ></textarea>
                    <div class="photo-sheet__row photo-sheet__row--review">
                        <button class="photo-sheet__retry" type="button">Retake</button>
                        <button class="photo-sheet__save" type="button">
                            Log<span aria-hidden="true">→</span>
                        </button>
                    </div>
                </section>

                <!-- STAGE: permission denied / no camera -->
                <section class="photo-sheet__stage" data-stage="denied" hidden>
                    <div class="photo-sheet__denied">
                        <p class="photo-sheet__denied-title">Camera unavailable</p>
                        <p class="photo-sheet__denied-body"></p>
                        <button class="photo-sheet__retry-perm" type="button">Try again</button>
                    </div>
                </section>
            </div>
            <canvas class="photo-sheet__grab" hidden></canvas>
        `
        document.body.appendChild(root)

        this.root      = root
        this.inner     = root.querySelector('.photo-sheet__inner')
        this.video     = root.querySelector('.photo-sheet__video')
        this.imageEl   = root.querySelector('.photo-sheet__image')
        this.caption   = root.querySelector('.photo-sheet__caption')
        this.shutterBtn = root.querySelector('.photo-sheet__shutter')
        this.saveBtn   = root.querySelector('.photo-sheet__save')
        this.hintLive  = root.querySelector('.photo-sheet__hint--live')
        this.deniedBody = root.querySelector('.photo-sheet__denied-body')
        this.retryPerm  = root.querySelector('.photo-sheet__retry-perm')
        this.grabCanvas = root.querySelector('.photo-sheet__grab')
        this.dataUrl   = null
        this.stream    = null
        this.stage     = 'live'

        root.querySelector('.photo-sheet__close').addEventListener('click', () => this._onBack())
        root.querySelector('.photo-sheet__retry').addEventListener('click', () => this._retake())
        this.shutterBtn.addEventListener('click', () => this._shoot())
        this.saveBtn.addEventListener('click', () => this._save())
        this.retryPerm.addEventListener('click', () => this._startCamera())

        document.addEventListener('keydown', (event) =>
        {
            if(!this.isOpen) return
            if(event.key === 'Escape') this._onBack()
        })
    }

    open({ readOnly, capture } = {})
    {
        this.readOnly = !!readOnly
        this.root.classList.toggle('is-read-only', this.readOnly)
        this.caption.value = ''
        this.caption.disabled = !!this.readOnly
        this.dataUrl = null

        if(this.readOnly && capture)
        {
            // Replay: skip the camera, go straight to the review with the
            // saved data URL.
            this.dataUrl = capture.dataUrl || null
            this.caption.value = capture.caption || ''
            if(this.dataUrl) this.imageEl.src = this.dataUrl
            this._setStage('review')
        }
        else
        {
            this._setStage('live')
            this._startCamera()
        }

        this.root.setAttribute('aria-hidden', 'false')
        this.root.classList.add('is-open')
        this.isOpen = true
    }

    close()
    {
        if(!this.isOpen) return
        this._stopCamera()
        this.root.classList.remove('is-open')
        this.root.classList.remove('is-read-only')
        this.root.setAttribute('aria-hidden', 'true')
        this.caption.disabled = false
        this.isOpen = false
        OverlayController.getInstance().noteClosed('photo')
    }

    _onBack()
    {
        if(this.readOnly) { this.close(); return }
        this._stopCamera()
        OverlayController.getInstance().open('chooser')
    }

    /* ----- camera ----- */

    async _startCamera()
    {
        // Re-entry path (retry from denied or retake from review).
        this._stopCamera()
        this.dataUrl = null

        if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
        {
            this._showDenied('Your browser can\'t access a camera here.')
            return
        }

        try
        {
            // facingMode: 'environment' prefers the rear camera on phones.
            // Desktop falls back to whichever camera is available.
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false,
            })
            // The user may have backed out while we were waiting for the
            // permission grant — bail and release the track.
            if(!this.isOpen || this.stage !== 'live')
            {
                for(const track of stream.getTracks()) track.stop()
                return
            }
            this.stream = stream
            this.video.srcObject = stream
            // play() can reject on iOS if the gesture chain breaks; that's
            // a soft failure — the muted autoplay attribute usually carries.
            await this.video.play().catch(() => {})
            this.hintLive.hidden = true
        }
        catch(err)
        {
            const name = err && err.name
            const msg = name === 'NotAllowedError' || name === 'SecurityError'
                ? 'Camera permission was denied. Enable it in your browser to capture a photo.'
                : name === 'NotFoundError'
                    ? 'No camera was found on this device.'
                    : `Couldn't start the camera (${name || 'unknown'}).`
            this._showDenied(msg)
        }
    }

    _stopCamera()
    {
        if(this.stream)
        {
            for(const track of this.stream.getTracks()) track.stop()
            this.stream = null
        }
        if(this.video) this.video.srcObject = null
    }

    _shoot()
    {
        if(!this.stream || !this.video) return
        const vw = this.video.videoWidth
        const vh = this.video.videoHeight
        if(!vw || !vh) return

        // Draw the current frame at native resolution, then export. Larger
        // than the on-screen preview so a future zoom doesn't go blurry.
        this.grabCanvas.width  = vw
        this.grabCanvas.height = vh
        const ctx = this.grabCanvas.getContext('2d')
        ctx.drawImage(this.video, 0, 0, vw, vh)
        this.dataUrl = this.grabCanvas.toDataURL('image/jpeg', 0.85)
        this.imageEl.src = this.dataUrl
        // Stop the live stream while reviewing so the device LED switches
        // off — users notice when "the camera is still on" mid-review.
        this._stopCamera()
        this._setStage('review')
    }

    _retake()
    {
        this.dataUrl = null
        this.caption.value = ''
        this._setStage('live')
        this._startCamera()
    }

    _save()
    {
        if(!this.dataUrl) return
        this.captures.add({
            kind: 'photo',
            dataUrl: this.dataUrl,
            caption: this.caption.value.trim() || null,
        })
        this.close()
    }

    /* ----- error surface ----- */

    _showDenied(msg)
    {
        this.deniedBody.textContent = msg
        this._setStage('denied')
    }

    _setStage(stage)
    {
        this.stage = stage
        this.inner.dataset.stage = stage
        for(const el of this.root.querySelectorAll('.photo-sheet__stage'))
            el.hidden = el.dataset.stage !== stage
    }
}
