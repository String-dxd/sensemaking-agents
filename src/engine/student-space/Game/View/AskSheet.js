import State from '../State/State.js'
import OverlayController from './OverlayController.js'
import { reframeFor } from './reframeHeuristics.js'
import { kiraReplyFor } from './chatHeuristics.js'
import { EMOTIONS, shapeSvg } from './MoodSheet.js'
import {
    blobToStudentSpaceAudioBase64,
    canRecordStudentSpaceAudio,
    startStudentSpaceAudioCapture,
} from '../../../../lib/student-space/audio-capture.ts'
import { canCreateRealtimeMirrorCapture } from '../../../../lib/student-space/realtime-mirror-client.ts'

/**
 * Open-ended capture. Three stages:
 *
 *   1. compose   — textarea + mic. Save commits the typed text.
 *   2. recording — live voice session with Kira. Stop ends the session and
 *                  asks Mirror to prepare the reading from the whole session.
 *   3. review    — static read of the final transcript. Log commits it as a
 *                  capture; Discard drops it and routes back to the chooser.
 *
 * Voice path: MediaRecorder audio. Web Speech is optional live-caption help.
 * In bridged mode the backend prepares a Mirror draft from OpenAI transcription,
 * then `Log` persists it as confirmed and `Forget` persists the rejected
 * draft as forgotten for pipeline audit visibility.
 *
 * Close behaviour: the × at the top is "back" (returns to the chooser, not
 * a hard dismiss). The chooser's own × is the only place that dismisses
 * the capture panel. In read-only replay mode (showing an existing capture)
 * × dismisses directly because there's no chooser to return to.
 */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

// Typewriter cadence — matches KiraNarrator so Kira's voice has a single
// consistent texture across surfaces.
const TYPER_BASE_MS  = 32
const TYPER_COMMA_MS = 140
const TYPER_STOP_MS  = 220
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const EMOTION_BY_ID = Object.fromEntries(EMOTIONS.map((e) => [e.id, e]))

const THEME_PILL = {
    school: { label: 'school', need: 'autonomy',  mood: 'anxiety' },
    sleep:  { label: 'sleep',  need: 'rest',      mood: 'ennui' },
    friend: { label: 'friends', need: 'belonging', mood: 'joy' },
    family: { label: 'family',  need: 'belonging', mood: 'joy' },
    play:   { label: 'play',    need: 'agency',    mood: 'joy' },
    scroll: { label: 'the phone', need: 'stillness', mood: 'anxiety' },
}

function tintedBg(hex, alpha = 0.15)
{
    const h = hex.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
}

export default class AskSheet
{
    constructor()
    {
        this.state = State.getInstance()
        this.captures = this.state.captures
        this.backend = this.state.backend || null

        const root = document.createElement('div')
        root.className = 'ask-sheet'
        root.setAttribute('aria-hidden', 'true')
        root.innerHTML = `
            <div class="ask-sheet__inner" data-stage="compose">
                <button class="ask-sheet__close" type="button" aria-label="Back">×</button>

                <!-- STAGE: compose -->
                <section class="ask-sheet__stage" data-stage="compose">
                    <p class="ask-sheet__eyebrow">Talking to Kira</p>
                    <h2 class="ask-sheet__title">What should I hold with you?</h2>
                    <button class="ask-sheet__letter-ref" type="button" hidden>
                        <span class="ask-sheet__letter-ref-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="13" height="13">
                                <path d="M4 6.5h16v11H4z" fill="none" stroke="currentColor" stroke-width="1.5"/>
                                <path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                            </svg>
                        </span>
                        <span class="ask-sheet__letter-ref-label" data-role="letter-ref-label"></span>
                    </button>
                    <p class="ask-sheet__prompt" hidden></p>
                    <div class="ask-sheet__field" data-testid="kira-multimodal-composer">
                        <div class="ask-sheet__image-preview" hidden>
                            <img class="ask-sheet__image" alt="" />
                            <button class="ask-sheet__image-remove" type="button" aria-label="Remove image">×</button>
                        </div>
                        <textarea
                            class="ask-sheet__input"
                            rows="3"
                            placeholder="Write it here, or use voice, feeling, or image…"
                        ></textarea>
                        <div class="ask-sheet__tools" aria-label="Ways to capture">
                            <button class="ask-sheet__tool ask-sheet__mic" type="button" aria-label="Start voice recording" title="Voice">
                                <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
                                    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" fill="currentColor"/>
                                    <path d="M5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V20a1 1 0 1 1-2 0v-2.07A7 7 0 0 1 5 11Z" fill="currentColor"/>
                                </svg>
                            </button>
                            <button class="ask-sheet__tool ask-sheet__emoji-toggle" type="button" aria-label="Pick a feeling" title="Feeling" aria-expanded="false" aria-pressed="false">
                                <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
                                    <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
                                    <circle cx="9" cy="10.5" r="1.1" fill="currentColor"/>
                                    <circle cx="15" cy="10.5" r="1.1" fill="currentColor"/>
                                    <path d="M8.5 14.2c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                                </svg>
                            </button>
                            <button class="ask-sheet__tool ask-sheet__image-trigger" type="button" aria-label="Upload image" title="Image">
                                <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
                                    <path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 11 4-4 3 3 2-2 5 5H5Z" fill="currentColor"/>
                                    <circle cx="16.5" cy="8.5" r="1.5" fill="#fff"/>
                                </svg>
                            </button>
                            <button class="ask-sheet__save" type="button" aria-label="Send" disabled>
                                <span aria-hidden="true">→</span>
                            </button>
                            <input class="ask-sheet__image-input" type="file" accept="image/*" hidden />
                        </div>
                        <div class="ask-sheet__emoji-panel" hidden>
                            ${EMOTIONS.map((e) => `
                                <button class="ask-sheet__emoji-option" type="button" data-emotion="${e.id}" style="--emotion-color:${e.color}">
                                    <span class="ask-sheet__emoji-symbol" aria-hidden="true">${shapeSvg(e.shape, e.color)}</span>
                                    <span>${e.label}</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    <p class="ask-sheet__hint" hidden></p>
                </section>

                <!-- STAGE: recording — live voice session -->
                <section class="ask-sheet__stage" data-stage="recording" hidden>
                    <p class="ask-sheet__eyebrow ask-sheet__eyebrow--live">
                        <span class="ask-sheet__rec-dot" aria-hidden="true"></span> Live
                    </p>
                    <h2 class="ask-sheet__title ask-sheet__title--live">Tell me what's happening.</h2>
                    <p class="ask-sheet__session-note">Keep going until it feels complete.</p>
                    <div class="ask-live-chat" role="log" aria-live="polite">
                        <p class="ask-live-chat__empty">Start talking. A reading will appear when you pause.</p>
                    </div>
                    <p class="ask-sheet__hint ask-sheet__hint--live" hidden></p>
                    <div class="ask-sheet__row ask-sheet__row--rec">
                        <button class="ask-sheet__stop" type="button" aria-label="Stop live session">
                            <span class="ask-sheet__stop-icon" aria-hidden="true"></span>
                            Stop session
                        </button>
                    </div>
                </section>

                <!-- STAGE: review — frozen transcript with Log / Discard -->
                <section class="ask-sheet__stage" data-stage="review" hidden>
                    <p class="ask-sheet__eyebrow">Captured</p>
                    <h2 class="ask-sheet__title">Here's what you said.</h2>
                    <div class="ask-sheet__review-card">
                        <p class="ask-sheet__review-text"></p>
                    </div>
                    <div class="ask-sheet__replay-extras" hidden></div>
                    <div class="ask-sheet__reframe-cta-row">
                        <button class="ask-sheet__reframe-cta" type="button">
                            See the reading <span aria-hidden="true">→</span>
                        </button>
                    </div>
                    <div class="ask-sheet__row ask-sheet__row--review">
                        <button class="ask-sheet__discard" type="button">Discard</button>
                        <button class="ask-sheet__log" type="button">
                            Log<span aria-hidden="true">→</span>
                        </button>
                    </div>
                </section>

                <!-- STAGE: chat — dive-deeper thread with Kira -->
                <section class="ask-sheet__stage ask-sheet__stage--chat" data-stage="chat" hidden>
                    <header class="ask-chat__header">
                        <span class="ask-chat__with">Conversation</span>
                    </header>
                    <div class="ask-chat__thread" role="log" aria-live="polite"></div>
                    <div class="ask-chat__compose">
                        <textarea
                            class="ask-chat__input"
                            rows="1"
                            placeholder="Say more…"
                        ></textarea>
                        <button class="ask-chat__mic" type="button" aria-label="Start voice recording">
                            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" fill="currentColor"/>
                                <path d="M5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V20a1 1 0 1 1-2 0v-2.07A7 7 0 0 1 5 11Z" fill="currentColor"/>
                            </svg>
                        </button>
                    </div>
                    <div class="ask-chat__row">
                        <button class="ask-chat__log" type="button">
                            Log<span aria-hidden="true">→</span>
                        </button>
                    </div>
                </section>

                <!-- STAGE: reframe — Kira's reading of the transcript -->
                <section class="ask-sheet__stage ask-sheet__stage--reframe" data-stage="reframe" hidden>
                    <div class="ask-reframe__shapes" aria-hidden="true"></div>
                    <div class="ask-reframe__pills"></div>
                    <blockquote class="ask-reframe__quote"></blockquote>
                    <p class="ask-sheet__eyebrow">Reading</p>
                    <p class="ask-reframe__prose"></p>
                    <div class="ask-sheet__row ask-sheet__row--reframe">
                        <button class="ask-sheet__edit" type="button">Edit</button>
                        <button class="ask-sheet__talk-more" type="button">Talk more</button>
                        <button class="ask-sheet__forget-draft" type="button" hidden>Forget</button>
                        <button class="ask-sheet__log ask-sheet__log--reframe" type="button">
                            Log<span aria-hidden="true">→</span>
                        </button>
                    </div>
                </section>

            </div>
        `
        document.body.appendChild(root)

        this.root        = root
        this.inner       = root.querySelector('.ask-sheet__inner')
        this.input       = root.querySelector('.ask-sheet__input')
        this.micBtn      = root.querySelector('.ask-sheet__mic')
        this.saveBtn     = root.querySelector('.ask-sheet__save')
        this.emojiToggleBtn = root.querySelector('.ask-sheet__emoji-toggle')
        this.emojiPanelEl   = root.querySelector('.ask-sheet__emoji-panel')
        this.imageTriggerBtn = root.querySelector('.ask-sheet__image-trigger')
        this.imageInputEl    = root.querySelector('.ask-sheet__image-input')
        this.imagePreviewEl  = root.querySelector('.ask-sheet__image-preview')
        this.imageEl         = root.querySelector('.ask-sheet__image')
        this.imageRemoveBtn  = root.querySelector('.ask-sheet__image-remove')
        this.promptEl    = root.querySelector('.ask-sheet__prompt')
        this.letterRefEl    = root.querySelector('.ask-sheet__letter-ref')
        this.letterRefLabel = root.querySelector('[data-role="letter-ref-label"]')
        this.hintEl      = root.querySelector('.ask-sheet__hint')
        this.hintLiveEl  = root.querySelector('.ask-sheet__hint--live')
        this.liveThreadEl = root.querySelector('.ask-live-chat')
        this.stopBtn     = root.querySelector('.ask-sheet__stop')
        this.discardBtn  = root.querySelector('.ask-sheet__discard')
        this.logBtn      = root.querySelector('.ask-sheet__stage[data-stage="review"] .ask-sheet__log')
        this.reviewTextEl = root.querySelector('.ask-sheet__review-text')
        this.reframeCtaEl = root.querySelector('.ask-sheet__reframe-cta')
        this.reframeCtaRowEl = root.querySelector('.ask-sheet__reframe-cta-row')
        this.replayExtrasEl  = root.querySelector('.ask-sheet__replay-extras')
        this.reframeShapesEl = root.querySelector('.ask-reframe__shapes')
        this.reframePillsEl  = root.querySelector('.ask-reframe__pills')
        this.reframeQuoteEl  = root.querySelector('.ask-reframe__quote')
        this.reframeProseEl  = root.querySelector('.ask-reframe__prose')
        this.editBtn         = root.querySelector('.ask-sheet__edit')
        this.talkMoreBtn     = root.querySelector('.ask-sheet__talk-more')
        this.forgetDraftBtn  = root.querySelector('.ask-sheet__forget-draft')
        this.reframeLogBtn   = root.querySelector('.ask-sheet__log--reframe')
        this.chatThreadEl    = root.querySelector('.ask-sheet__stage--chat .ask-chat__thread')
        this.chatInputEl     = root.querySelector('.ask-chat__input')
        this.chatMicBtn      = root.querySelector('.ask-chat__mic')
        this.chatLogBtn      = root.querySelector('.ask-chat__log')

        this.recognition = null
        this.listening   = false
        this.prompt      = null
        this.letterId    = null
        this.stage       = 'compose'
        this.recCommitted = ''
        this.recInterim   = ''
        this.liveDialogue = []
        this.liveDialogueEls = new Map()
        this.audioCapture = null
        this.realtimeCapture = null
        this.recordedAudioBlob = null
        this.recordedAudioMimeType = null
        this.selectedMood = null
        this.uploadedImageDataUrl = null
        this.replayImageDataUrl = null
        this.pendingLocalCaptureId = null
        this.preparedReflection = null
        this.prepareInFlight = false
        this.logInFlight = false
        this.prepareId = 0
        this.reframe     = null   // {headline, highlightPhrase, themes, needs, moods, edited}
        this.reframeActionMode = 'offline'
        this.thread      = null   // [{role, text}, …] — set by chat stage
        this.typerId     = 0

        if(!canRecordStudentSpaceAudio() && !canCreateRealtimeMirrorCapture())
        {
            this.micBtn.hidden = true
        }
        if(!SpeechRecognition)
        {
            this.chatMicBtn.hidden = true
        }

        // All listeners attached to elements inside the detached root are
        // GC'd alongside root.remove(); the document-level keydown is the
        // only one that survives, so it is the priority for dispose().
        root.querySelector('.ask-sheet__close').addEventListener('click', () => this._onBack())
        this.letterRefEl.addEventListener('click', () => this._openLetterRef())
        this.input.addEventListener('input', () => this._refreshSave())
        this.saveBtn.addEventListener('click', () => this._saveTyped())
        this.micBtn.addEventListener('click', () => this._startRecording())
        this.emojiToggleBtn.addEventListener('click', () => this._toggleEmojiPanel())
        this.emojiPanelEl.addEventListener('click', (event) => this._selectEmotion(event))
        this.imageTriggerBtn.addEventListener('click', () => this.imageInputEl.click())
        this.imageInputEl.addEventListener('change', () => this._handleImageUpload())
        this.imageRemoveBtn.addEventListener('click', () => this._clearImage())
        this.stopBtn.addEventListener('click', () => this._stopRecording())
        this.discardBtn.addEventListener('click', () => this._discardReview())
        this.logBtn.addEventListener('click', () => this._logReview())
        this.reframeCtaEl.addEventListener('click', () => this._goReframe())
        this.editBtn.addEventListener('click', () => this._editFromReframe())
        this.talkMoreBtn.addEventListener('click', () => this._talkMore())
        this.forgetDraftBtn.addEventListener('click', () => this._forgetDraft())
        this.reframeLogBtn.addEventListener('click', () => this._logReframe())
        this.chatInputEl.addEventListener('keydown', (event) =>
        {
            // Plain Enter sends; Shift+Enter inserts a newline like other
            // chat surfaces. We never want a stray newline to commit.
            if(event.key === 'Enter' && !event.shiftKey)
            {
                event.preventDefault()
                this._sendChat()
            }
        })
        this.chatMicBtn.addEventListener('click', () => this._chatStartRecording())
        this.chatLogBtn.addEventListener('click', () => this._logFromChat())

        this._onKeyDown = (event) =>
        {
            if(!this.isOpen) return
            if(event.key === 'Escape') this._onBack()
        }
        document.addEventListener('keydown', this._onKeyDown)
    }

    /**
     * Tear-down hook called from View.dispose(). Removes the document-level
     * keydown listener (the leak risk that survives root.remove()), tears
     * down any in-flight SpeechRecognition engines so they don't keep the
     * mic hot across remounts, and detaches the sheet root.
     */
    dispose()
    {
        if(this._onKeyDown)
        {
            try { document.removeEventListener('keydown', this._onKeyDown) } catch(_) {}
            this._onKeyDown = null
        }
        // SpeechRecognition engines hold the mic; abort both compose- and
        // chat-stage instances if they were left listening.
        if(this.recognition)
        {
            try { this.recognition.abort?.() ?? this.recognition.stop?.() } catch(_) {}
            this.recognition = null
        }
        if(this.chatRecognition)
        {
            try { this.chatRecognition.abort?.() ?? this.chatRecognition.stop?.() } catch(_) {}
            this.chatRecognition = null
        }
        this.audioCapture?.abort?.()
        this.audioCapture = null
        this.realtimeCapture?.abort?.()
        this.realtimeCapture = null
        this.recordedAudioBlob = null
        this.recordedAudioMimeType = null
        this.selectedMood = null
        this.uploadedImageDataUrl = null
        this.replayImageDataUrl = null
        this.pendingLocalCaptureId = null
        this.preparedReflection = null
        this.prepareInFlight = false
        this.logInFlight = false
        this.reframeActionMode = 'offline'
        this.prepareId += 1
        this.listening = false
        // Bump the typer id so any pending setTimeout chain self-cancels
        // when it next checks myId !== this.typerId.
        this.typerId += 1
        try { this.root?.remove?.() } catch(_) {}
        this.root = null
    }

    open({ prompt, readOnly, capture, dismissOnBack, prefilledText, letterId } = {})
    {
        this.prompt        = prompt || null
        this.letterId      = letterId || capture?.letterId || null
        this.readOnly      = !!readOnly
        this.replayImageDataUrl = this.readOnly && capture?.dataUrl ? capture.dataUrl : null
        // dismissOnBack: when AskSheet is opened directly (e.g. from Kira's
        // "Talk to me" CTA, not from the capture chooser), the × should
        // dismiss instead of routing back to a chooser the student never
        // saw. Read-only replay already short-circuits the same way.
        this.dismissOnBack = !!dismissOnBack
        this.root.classList.toggle('is-read-only', this.readOnly)
        if(prompt)
        {
            this.promptEl.textContent = prompt
            this.promptEl.hidden = false
        }
        else
        {
            this.promptEl.hidden = true
        }
        this._renderLetterRef()
        // prefilledText supports the Edit path — re-entering compose from
        // the reframe page lands with the last transcript ready to amend.
        const initialText = this.readOnly && capture?.text
            ? capture.text
            : (prefilledText || '')
        this.input.value = initialText
        this.input.disabled = this.readOnly

        // Reset transient state — a fresh open starts clean.
        this.reframe = null
        this.reframeActionMode = 'offline'
        this.thread = null
        this.recCommitted = ''
        this.recInterim = ''
        this._resetLiveDialogue()
        this.audioCapture = null
        this.realtimeCapture = null
        this.recordedAudioBlob = null
        this.recordedAudioMimeType = null
        this.selectedMood = null
        this.uploadedImageDataUrl = null
        this.replayImageDataUrl = null
        this.imageInputEl.value = ''
        this._renderComposerMeta()
        if(this.reframeCtaRowEl) this.reframeCtaRowEl.hidden = false
        if(this.chatThreadEl) this.chatThreadEl.innerHTML = ''
        if(this.chatInputEl)  this.chatInputEl.value = ''

        if(this.readOnly && capture)
        {
            // Replay: jump to review and surface reframe/thread inline if
            // the capture carries them. AskSheet is the single read surface
            // for ask captures, so DayDetail/Profile/Calendar route here.
            this.reframe = capture.reframe || null
            this.thread  = Array.isArray(capture.thread) ? capture.thread.slice() : null
            this.reviewTextEl.textContent = capture.text || ''
            this._renderReplayExtras()
            this._setStage('review')
        }
        else
        {
            this._renderReplayExtras()
            this._setStage('compose')
        }

        this._refreshSave()
        this.root.setAttribute('aria-hidden', 'false')
        this.root.classList.add('is-open')
        this.isOpen = true
        if(!this.readOnly) setTimeout(() =>
        {
            this.input.focus()
            // Cursor at end so the Edit path lands right after the last
            // character — feels like resuming, not starting fresh.
            const v = this.input.value
            if(v) this.input.setSelectionRange(v.length, v.length)
        }, 160)
    }

    close()
    {
        if(!this.isOpen) return
        // Blur whatever inside the sheet has focus before we set
        // aria-hidden — Chrome warns when a focused descendant inherits
        // aria-hidden=true from an ancestor.
        if(this.root.contains(document.activeElement)) document.activeElement.blur()
        if(this.listening) this._abortRecording()
        this.recordedAudioBlob = null
        this.recordedAudioMimeType = null
        this.selectedMood = null
        this.uploadedImageDataUrl = null
        this.imageInputEl.value = ''
        this._renderComposerMeta()
        this.pendingLocalCaptureId = null
        this.preparedReflection = null
        this.prepareInFlight = false
        this.logInFlight = false
        this.reframeActionMode = 'offline'
        this.prepareId += 1
        if(this.chatRecognition)
        {
            try { this.chatRecognition.abort?.() ?? this.chatRecognition.stop?.() } catch(_) {}
            this.chatRecognition = null
            this.chatMicBtn.classList.remove('is-listening')
        }
        this.typerId += 1   // cancel any in-flight typewriter
        this.root.classList.remove('is-open')
        this.root.classList.remove('is-read-only')
        this.root.setAttribute('aria-hidden', 'true')
        this.input.disabled = false
        this.isOpen = false
        this.hintEl.hidden = true
        this.reframe = null
        this.thread = null
        this.letterId = null
        if(this.chatThreadEl) this.chatThreadEl.innerHTML = ''
        if(this.chatInputEl)  this.chatInputEl.value = ''
        this._resetLiveDialogue()
        this._setStage('compose')
        OverlayController.getInstance().noteClosed('ask')
    }

    /* ----- back / dismiss ----- */

    _onBack()
    {
        // Read-only replay + Kira-direct entry both bypass the chooser
        // because there's no chooser context to return to.
        if(this.readOnly || this.dismissOnBack) { this.close(); return }
        if(this._isBackendDraftMode()) { this._discardPreparedDraft(); return }
        // From recording: stop the engine but DON'T review — bail to chooser.
        if(this.listening) this._abortRecording()
        // Default: route back to the chooser; OverlayController will close
        // this sheet as part of the exclusive-surface swap.
        OverlayController.getInstance().open('chooser')
    }

    /* ----- compose ----- */

    _refreshSave()
    {
        this.saveBtn.disabled = !this._hasComposerInput()
    }

    _saveTyped()
    {
        const text = this._composeText()
        if(!text) return
        // Promote typed text into the review stage so Save and voice-stop
        // share one review surface (and one "See Kira's reading" entry).
        this.recCommitted = text
        this._goReview()
    }

    /* ----- recording ----- */

    async _startRecording()
    {
        const useRealtimeVoice = this._shouldUseRealtimeVoice()
        if((!useRealtimeVoice && !canRecordStudentSpaceAudio()) || this.listening) return

        // Seed committed with any text the user has typed — recording adds
        // onto it rather than replacing.
        this.recCommitted = this.input.value.trim()
        this.recInterim   = ''
        this.realtimeCapture = null
        this.recordedAudioBlob = null
        this.recordedAudioMimeType = null
        this._resetLiveDialogue()
        if(this.recCommitted)
            this._upsertLiveDialogue({
                id: 'typed-preface',
                role: 'student',
                text: this.recCommitted,
                status: 'final',
            })
        this.hintLiveEl.hidden = true

        this.listening = true
        this._setStage('recording')
        try
        {
            if(useRealtimeVoice)
            {
                this.realtimeCapture = await this.backend.createRealtimeMirrorCapture({
                    localCaptureId: this._ensureDraftCaptureId(),
                    ...(this.recCommitted ? { initialTranscript: this.recCommitted } : {}),
                    contextType: 'school',
                    ...(this.selectedMood ? { mood: this.selectedMood } : {}),
                    onConversationUpdate: (message) => this._handleRealtimeConversationUpdate(message),
                })
                return
            }
            this.audioCapture = await startStudentSpaceAudioCapture()
            this.recordedAudioMimeType = this.audioCapture.mimeType
            if(this.backend?.transcribeReflectionAudio)
            {
                this.hintLiveEl.hidden = false
                this.hintLiveEl.textContent = 'OpenAI will transcribe this when you stop.'
            }
            else
            {
                this._startLiveCaptions()
            }
        }
        catch(err)
        {
            this.listening = false
            this.audioCapture = null
            this.realtimeCapture?.abort?.()
            this.realtimeCapture = null
            const message = err instanceof Error ? err.message : String(err)
            this.hintEl.hidden = false
            this.hintEl.textContent = friendlyMicError(message)
            this._setStage('compose')
        }
    }

    _startLiveCaptions()
    {
        if(!SpeechRecognition) return
        const rec = new SpeechRecognition()
        rec.lang = navigator.language || 'en-US'
        rec.interimResults = true
        rec.continuous = true

        rec.addEventListener('end', () =>
        {
            this.recognition = null
        })

        rec.addEventListener('error', (event) =>
        {
            this.recognition = null
            this.hintLiveEl.hidden = false
            this.hintLiveEl.textContent = event.error === 'not-allowed'
                ? 'Live captions unavailable. Recording still works.'
                : `Live captions unavailable (${event.error}). Recording still works.`
        })

        rec.addEventListener('result', (event) =>
        {
            let interim = ''
            for(let i = event.resultIndex; i < event.results.length; i++)
            {
                const r = event.results[i]
                if(r.isFinal)
                    this.recCommitted = this.recCommitted
                        ? `${this.recCommitted} ${r[0].transcript.trim()}`
                        : r[0].transcript.trim()
                else
                    interim += r[0].transcript
            }
            this.recInterim = interim.trim()
            this._paintCaptions()
        })

        this.recognition = rec
        try { rec.start() }
        catch(_)
        {
            this.recognition = null
        }
    }

    async _stopRecording()
    {
        // Explicit user stop → advance to review with whatever we have.
        if(!this.listening) return
        this.listening = false
        try { this.recognition?.stop() } catch(_) {}
        this.recognition = null
        // Promote any remaining interim into committed before review.
        if(this.recInterim)
        {
            this.recCommitted = this.recCommitted
                ? `${this.recCommitted} ${this.recInterim}`
                : this.recInterim
            this.recInterim = ''
        }

        const realtimeCapture = this.realtimeCapture
        if(realtimeCapture)
        {
            this.realtimeCapture = null
            const runId = ++this.prepareId
            this.prepareInFlight = true
            this.logInFlight = false
            this.preparedReflection = null
            this._renderReframe({
                headline: 'Mirroring and summarising the session.',
                highlightPhrase: this.recCommitted || 'Voice reflection',
                themes: [],
                needs: [],
                moods: this.selectedMood ? [this.selectedMood] : ['ennui'],
            })
            this._setReframeActionMode('preparing')
            this._setStage('reframe')
            try
            {
                const prepared = await realtimeCapture.stop()
                if(runId !== this.prepareId || !this.isOpen) return
                this.prepareInFlight = false
                this.preparedReflection = prepared
                this.recCommitted = prepared.transcript || this.recCommitted
                this.reviewTextEl.textContent = this.recCommitted
                this.reframe = this._reframeFromPrepared(prepared)
                this._renderReframe(this.reframe)
                this._setReframeActionMode('ready')
            }
            catch(err)
            {
                if(runId !== this.prepareId || !this.isOpen) return
                const message = err instanceof Error ? err.message : String(err)
                this.prepareInFlight = false
                this.preparedReflection = null
                this._renderReframe({
                    headline: `Could not prepare this reading yet. ${message}`,
                    highlightPhrase: this.recCommitted || 'Voice reflection',
                    themes: [],
                    needs: [],
                    moods: ['ennui'],
                })
                this._setReframeActionMode('failed')
            }
            return
        }

        const audioCapture = this.audioCapture
        this.audioCapture = null
        try
        {
            const blob = await audioCapture?.stop?.()
            if(!blob || blob.size === 0)
            {
                this._setStage('compose')
                this.hintEl.hidden = false
                this.hintEl.textContent = 'No audio was captured. Try again or type it.'
                return
            }
            this.recordedAudioBlob = blob
            this.recordedAudioMimeType = blob.type || this.recordedAudioMimeType || 'audio/webm'
            this._goReview()
        }
        catch(err)
        {
            this._setStage('compose')
            this.hintEl.hidden = false
            this.hintEl.textContent = err instanceof Error ? err.message : 'Could not stop recording.'
        }
    }

    _abortRecording()
    {
        // Hard-cancel: no review, just stop the engine.
        this.listening = false
        try { this.recognition?.abort?.() ?? this.recognition?.stop?.() } catch(_) {}
        this.recognition = null
        this.realtimeCapture?.abort?.()
        this.realtimeCapture = null
        this.audioCapture?.abort?.()
        this.audioCapture = null
        this.recordedAudioBlob = null
        this.recordedAudioMimeType = null
    }

    _paintCaptions()
    {
        const text = [this.recCommitted, this.recInterim].filter(Boolean).join(' ').trim()
        this._upsertLiveDialogue({
            id: 'speech-caption',
            role: 'student',
            text,
            status: this.recInterim ? 'streaming' : 'final',
        })
    }

    _handleRealtimeConversationUpdate(message)
    {
        if(!message || !this.isOpen) return
        this._upsertLiveDialogue(message)
        if(message.role === 'student') this._syncLiveStudentTranscript()
    }

    _resetLiveDialogue()
    {
        this.liveDialogue = []
        this.liveDialogueEls = new Map()
        if(!this.liveThreadEl) return
        this.liveThreadEl.innerHTML = '<p class="ask-live-chat__empty">Start talking. A reading will appear when you pause.</p>'
    }

    _upsertLiveDialogue(message)
    {
        if(!this.liveThreadEl) return
        const text = (message.text || '').trim()
        if(!text) return
        const role = message.role === 'kira' ? 'kira' : 'student'
        const id = message.id || `${role}-${Date.now()}`
        this.liveThreadEl.querySelector('.ask-live-chat__empty')?.remove()

        let el = this.liveDialogueEls.get(id)
        if(!el)
        {
            el = document.createElement('article')
            el.className = `ask-live-chat__bubble ask-live-chat__bubble--${role}`
            el.dataset.role = role
            el.dataset.messageId = id
            el.innerHTML = `
                <span class="ask-live-chat__name">${role === 'kira' ? 'Mirror' : 'You'}</span>
                <p class="ask-live-chat__text"></p>
            `
            this.liveDialogueEls.set(id, el)
            this.liveThreadEl.appendChild(el)
            this.liveDialogue.push({ id, role })
        }
        el.classList.toggle('is-streaming', message.status === 'streaming')
        const textEl = el.querySelector('.ask-live-chat__text')
        if(textEl) textEl.textContent = text
        this.liveThreadEl.scrollTop = this.liveThreadEl.scrollHeight
    }

    _syncLiveStudentTranscript()
    {
        const parts = []
        for(const item of this.liveDialogue)
        {
            if(item.role !== 'student') continue
            const text = this.liveDialogueEls.get(item.id)?.querySelector('.ask-live-chat__text')?.textContent?.trim()
            if(text) parts.push(text)
        }
        this.recCommitted = parts.join(' ').trim()
    }

    /* ----- review ----- */

    _goReview()
    {
        const text = this.recCommitted.trim()
        const hasAudio = !!this.recordedAudioBlob
        if(!text && !hasAudio)
        {
            // Nothing transcribed — return to compose, surface a hint.
            this._setStage('compose')
            this.hintEl.hidden = false
            this.hintEl.textContent = "Didn't catch anything. Try again or type it."
            return
        }
        if(this.backend?.prepareReflection && !this.readOnly)
        {
            void this._prepareMirrorDraft()
            return
        }
        this.reviewTextEl.textContent = text || 'Audio recorded. Transcript will appear after Mirror listens.'
        if(this.reframeCtaRowEl) this.reframeCtaRowEl.hidden = !text
        this._setStage('review')
    }

    _logReview()
    {
        // Raw path — student opted out of the reframe. Commit text only.
        const text = this.recCommitted.trim()
        if(!text && !this.recordedAudioBlob) return
        this._commitCapture(
            { text: text || 'Voice recording awaiting transcript...' },
            this.recordedAudioBlob
                ? { audioBlob: this.recordedAudioBlob, mimeType: this.recordedAudioMimeType }
                : {},
        )
        this.close()
    }

    _discardReview()
    {
        // Drop the transcript (and any in-progress reframe/thread) and go
        // back to the chooser.
        this.recCommitted = ''
        this.recInterim   = ''
        this.recordedAudioBlob = null
        this.recordedAudioMimeType = null
        this.selectedMood = null
        this.uploadedImageDataUrl = null
        this.imageInputEl.value = ''
        this._renderComposerMeta()
        this.pendingLocalCaptureId = null
        this.preparedReflection = null
        this.prepareInFlight = false
        this.logInFlight = false
        this.prepareId += 1
        this.reframe = null
        this.thread = null
        this._paintCaptions()
        this.input.value = ''
        if(this.chatThreadEl) this.chatThreadEl.innerHTML = ''
        if(this.chatInputEl)  this.chatInputEl.value = ''
        this._refreshSave()
        OverlayController.getInstance().open('chooser')
    }

    /* ----- reframe ----- */

    _goReframe()
    {
        if(this.backend?.prepareReflection)
        {
            void this._prepareMirrorDraft()
            return
        }
        const text = (this.recCommitted || '').trim()
        if(!text) return
        // Re-run the heuristic each time we enter so the Edit path
        // produces a fresh reading on the amended transcript. The "edited"
        // flag tracks whether the student returned via Edit at least once
        // — useful provenance in the saved capture.
        const editedFlag = this.reframe?.edited === true
        this.reframe = { ...reframeFor(text), edited: editedFlag }
        this._renderReframe(this.reframe)
        this._setReframeActionMode('offline')
        this._setStage('reframe')
    }

    async _prepareMirrorDraft()
    {
        let text = (this.recCommitted || this._composeText()).trim()
        const audioBlob = this.recordedAudioBlob
        if(!text && !audioBlob)
        {
            this._setStage('compose')
            this.hintEl.hidden = false
            this.hintEl.textContent = "Didn't catch anything. Try again or type it."
            return
        }
        if(!this.backend?.prepareReflection || this.prepareInFlight) return

        const runId = ++this.prepareId
        this.prepareInFlight = true
        this.logInFlight = false
        this.preparedReflection = null
        this._renderReframe({
            headline: audioBlob
                ? 'Listening to the recording.'
                : 'Reading this back carefully.',
            highlightPhrase: text || 'Voice recording',
            themes: [],
            needs: [],
            moods: ['ennui'],
        })
        this._setReframeActionMode('preparing')
        this._setStage('reframe')

        try
        {
            let audioBase64 = null
            let transcription = null
            if(audioBlob)
            {
                if(audioBlob.size === 0) throw new Error('No audio was captured.')
                audioBase64 = await blobToStudentSpaceAudioBase64(audioBlob)
            }
            if(runId !== this.prepareId || !this.isOpen) return
            if(audioBase64 && this.backend?.transcribeReflectionAudio)
            {
                const audioTranscript = await this.backend.transcribeReflectionAudio({
                    audioBase64,
                    mimeType: this.recordedAudioMimeType || audioBlob.type || 'audio/webm',
                })
                if(runId !== this.prepareId || !this.isOpen) return
                const transcript = (audioTranscript?.transcript || '').trim()
                if(!transcript) throw new Error('OpenAI transcription came back empty.')
                transcription = audioTranscript
                text = transcript
                this.recCommitted = transcript
                this.reviewTextEl.textContent = transcript
                this._upsertLiveDialogue({
                    id: 'openai-transcript',
                    role: 'student',
                    text: transcript,
                    status: 'final',
                })
                this._renderReframe({
                    headline: 'Reading this back carefully.',
                    highlightPhrase: transcript,
                    themes: [],
                    needs: [],
                    moods: this.selectedMood ? [this.selectedMood] : ['ennui'],
                })
            }
            const prepared = await this.backend.prepareReflection({
                localCaptureId: this._ensureDraftCaptureId(),
                ...(audioBase64 && !transcription
                    ? { audioBase64, mimeType: this.recordedAudioMimeType || audioBlob.type || 'audio/webm' }
                    : { transcript: text }),
                contextType: 'school',
                ...(this.selectedMood ? { mood: this.selectedMood } : {}),
            })
            if(runId !== this.prepareId || !this.isOpen) return
            const preparedForLog = transcription
                ? { ...prepared, transcription: prepared.transcription || transcription }
                : prepared
            this.prepareInFlight = false
            this.preparedReflection = preparedForLog
            this.recCommitted = preparedForLog.transcript || text
            this.reviewTextEl.textContent = this.recCommitted
            this.reframe = this._reframeFromPrepared(preparedForLog)
            this._renderReframe(this.reframe)
            this._setReframeActionMode('ready')
        }
        catch(err)
        {
            if(runId !== this.prepareId || !this.isOpen) return
            const message = err instanceof Error ? err.message : String(err)
            this.prepareInFlight = false
            this.preparedReflection = null
            this._renderReframe({
                headline: `Could not prepare this reading yet. ${message}`,
                highlightPhrase: text || 'Voice recording',
                themes: [],
                needs: [],
                moods: ['ennui'],
            })
            this._setReframeActionMode('failed')
        }
    }

    _renderReframe(rf)
    {
        // 1. Mood shapes — 1–2, drawn from MoodSheet's shapeSvg() so the
        //    typography of the surface stays consistent with the rest of
        //    the mood UI.
        const moods = Array.isArray(rf.moods) ? rf.moods : []
        const moodIds = moods.length > 0 ? moods.slice(0, 2) : ['ennui']
        this.reframeShapesEl.innerHTML = moodIds.map((id) =>
        {
            const e = EMOTION_BY_ID[id] || EMOTION_BY_ID.ennui
            return `<span class="ask-reframe__shape" data-mood="${e.id}">${shapeSvg(e.shape, e.color)}</span>`
        }).join('')

        // 2. Theme pills — theme on top, inferred need beneath. ~15% bg
        //    tinted by the first matching mood (anxiety-tinged for school,
        //    ennui-tinged for sleep, etc.).
        const themes = Array.isArray(rf.themes) ? rf.themes : []
        const needs = Array.isArray(rf.needs) ? rf.needs : []
        if(themes.length === 0)
        {
            this.reframePillsEl.innerHTML = ''
        }
        else
        {
            this.reframePillsEl.innerHTML = themes.slice(0, 3).map((tid, i) =>
            {
                const t = THEME_PILL[tid] || { label: tid, need: needs[i] || '', mood: 'ennui' }
                const e = EMOTION_BY_ID[t.mood] || EMOTION_BY_ID.ennui
                const bg = tintedBg(e.color, 0.15)
                return `
                    <span class="ask-reframe__pill" style="background:${bg}">
                        <span class="ask-reframe__pill-theme">${t.label}</span>
                        <span class="ask-reframe__pill-need">${t.need}</span>
                    </span>
                `
            }).join('')
        }

        // 3. Pull-quote — italicised, quote marks, no truncation.
        this.reframeQuoteEl.textContent = rf.highlightPhrase || ''

        // 4. Prose — typewriter at 32 chars/sec to match KiraNarrator.
        this._typeProse(rf.headline || '')
    }

    _reframeFromPrepared(prepared)
    {
        return {
            headline: [
                prepared.storyReframe,
                prepared.validation,
                prepared.inferredMeaning,
            ].filter(Boolean).join('\n\n'),
            highlightPhrase: prepared.transcript || '',
            themes: prepared.contextType ? [prepared.contextType] : [],
            needs: [],
            moods: prepared.mood ? [prepared.mood] : (this.selectedMood ? [this.selectedMood] : []),
            backend: true,
        }
    }

    _setReframeActionMode(mode)
    {
        this.reframeActionMode = mode
        const backendMode = mode !== 'offline'
        const failedMode = mode === 'failed'
        const canLogTranscript = !!(this.recCommitted || '').trim()

        this.editBtn.hidden = backendMode && !failedMode
        this.talkMoreBtn.hidden = backendMode && !failedMode
        this.talkMoreBtn.textContent = failedMode ? 'Continue session' : 'Talk more'
        this.forgetDraftBtn.hidden = !backendMode
        this.reframeLogBtn.hidden = false
        this.reframeLogBtn.disabled =
            (backendMode && mode !== 'ready' && !failedMode) ||
            (failedMode && !canLogTranscript)
        this.forgetDraftBtn.disabled = mode === 'logging'
    }

    _ensureDraftCaptureId()
    {
        if(!this.pendingLocalCaptureId)
            this.pendingLocalCaptureId = `ask-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        return this.pendingLocalCaptureId
    }

    _isBackendDraftMode()
    {
        return !!(
            (this.backend?.prepareReflection || this.backend?.createRealtimeMirrorCapture) &&
            (this.prepareInFlight || this.preparedReflection || this.stage === 'reframe')
        )
    }

    _discardPreparedDraft()
    {
        this.prepareId += 1
        this.prepareInFlight = false
        this.logInFlight = false
        this.preparedReflection = null
        this.reframe = null
        this.realtimeCapture?.abort?.()
        this.realtimeCapture = null
        this.recordedAudioBlob = null
        this.recordedAudioMimeType = null
        this.selectedMood = null
        this.uploadedImageDataUrl = null
        this.imageInputEl.value = ''
        this._renderComposerMeta()
        this.pendingLocalCaptureId = null
        this.close()
    }

    async _forgetDraft()
    {
        const prepared = this.preparedReflection
        this.prepareId += 1
        this.prepareInFlight = false
        this.logInFlight = true
        this.realtimeCapture?.abort?.()
        this.realtimeCapture = null
        this._setReframeActionMode('logging')

        if(prepared && this.backend?.forgetPreparedReflection)
        {
            try { await this.backend.forgetPreparedReflection(prepared) }
            catch(err) { console.warn('[AskSheet] prepared reflection forget failed', err) }
        }

        this.preparedReflection = null
        this.reframe = null
        this.logInFlight = false
        this.recordedAudioBlob = null
        this.recordedAudioMimeType = null
        this.selectedMood = null
        this.uploadedImageDataUrl = null
        this.imageInputEl.value = ''
        this._renderComposerMeta()
        this.pendingLocalCaptureId = null
        this.close()
    }

    _typeProse(text)
    {
        this.typerId += 1
        const myId = this.typerId
        const el = this.reframeProseEl
        if(reduceMotion)
        {
            el.textContent = text
            return
        }
        el.textContent = ''
        let i = 0
        const step = () =>
        {
            if(myId !== this.typerId) return
            if(i >= text.length) return
            const ch = text[i]
            el.textContent += ch
            i += 1
            const next = ch === '.' || ch === '?' || ch === '!' ? TYPER_STOP_MS
                : ch === ',' || ch === ';' || ch === ':' || ch === '—' ? TYPER_COMMA_MS
                : TYPER_BASE_MS
            setTimeout(step, next)
        }
        setTimeout(step, 120)
    }

    _editFromReframe()
    {
        // Back to compose with the transcript prefilled and the cursor at
        // the end so the student can keep typing where they left off.
        // Mark the reframe as edited — when they re-enter the reframe
        // stage, _goReframe preserves the flag through the regen.
        if(this.reframe) this.reframe.edited = true
        this.input.value = this.recCommitted
        this.input.disabled = false
        this._setStage('compose')
        this._refreshSave()
        setTimeout(() =>
        {
            this.input.focus()
            const v = this.input.value
            if(v) this.input.setSelectionRange(v.length, v.length)
        }, 80)
    }

    _talkMore()
    {
        if(this.reframeActionMode === 'failed')
        {
            this._continueStoppedSession()
            return
        }
        this._openChat()
    }

    _continueStoppedSession()
    {
        const transcript = (this.recCommitted || this.reviewTextEl.textContent || '').trim()
        if(transcript) this.input.value = transcript
        this.input.disabled = false
        this.prepareInFlight = false
        this.logInFlight = false
        this.preparedReflection = null
        this.reframe = null
        this.thread = null
        this._refreshSave()
        void this._startRecording()
    }

    /* ----- chat ----- */

    _openChat()
    {
        // Open the thread with Kira's reframe headline as the first
        // bubble. The student replies into the textarea below; each reply
        // produces a mocked Kira response via kiraReplyFor().
        this.thread = []
        const opener = (this.reframe && this.reframe.headline) || "I'm here. Say what's on your mind."
        this._appendChat('kira', opener, { animate: true })
        this._setStage('chat')
        setTimeout(() =>
        {
            this.chatInputEl.value = ''
            this.chatInputEl.focus()
        }, 200)
    }

    _appendChat(role, text, { animate = false } = {})
    {
        this.thread.push({ role, text })
        // Bounded thread length — a runaway loop or a very long session
        // could otherwise grow `thread` (and the DOM bubble list) without
        // limit, blowing up memory + the saved capture payload size. Evict
        // oldest entries while keeping the most recent THREAD_CAP turns.
        const THREAD_CAP = 50
        while(this.thread.length > THREAD_CAP)
        {
            this.thread.shift()
            // Remove the matching DOM bubble (first child) so the visible
            // thread mirrors the model — the user can't scroll back to an
            // entry that no longer exists in the saved capture.
            const firstBubble = this.chatThreadEl?.firstElementChild
            if(firstBubble) firstBubble.remove()
        }
        const wrap = document.createElement('div')
        wrap.className = `ask-chat__bubble ${role === 'kira' ? 'ask-chat__bubble--kira' : 'ask-chat__bubble--you'}`
        wrap.innerHTML = `
            <span class="ask-chat__author">${role === 'kira' ? 'Mirror' : 'you'}</span>
            <p class="ask-chat__text"></p>
        `
        const textEl = wrap.querySelector('.ask-chat__text')
        this.chatThreadEl.appendChild(wrap)
        // Keep the latest bubble in view.
        requestAnimationFrame(() => { this.chatThreadEl.scrollTop = this.chatThreadEl.scrollHeight })
        if(animate && role === 'kira') this._typeInto(textEl, text)
        else textEl.textContent = text
    }

    _typeInto(el, text)
    {
        this.typerId += 1
        const myId = this.typerId
        if(reduceMotion) { el.textContent = text; return }
        el.textContent = ''
        let i = 0
        const step = () =>
        {
            if(myId !== this.typerId) return
            if(i >= text.length) return
            const ch = text[i]
            el.textContent += ch
            i += 1
            // Keep auto-scrolling as the bubble grows — feels alive.
            this.chatThreadEl.scrollTop = this.chatThreadEl.scrollHeight
            const next = ch === '.' || ch === '?' || ch === '!' ? TYPER_STOP_MS
                : ch === ',' || ch === ';' || ch === ':' || ch === '—' ? TYPER_COMMA_MS
                : TYPER_BASE_MS
            setTimeout(step, next)
        }
        setTimeout(step, 120)
    }

    _sendChat()
    {
        const text = this.chatInputEl.value.trim()
        if(!text) return
        this.chatInputEl.value = ''
        // The student bubble first — then Kira responds after a beat so
        // the message feels heard before it's processed.
        this._appendChat('you', text)
        // Count only the student's turns when picking the reply, so the
        // "turn ≥ 4" soft-close branch lines up with student turn count
        // rather than total bubble count.
        const studentTurns = this.thread.filter((m) => m.role === 'you').length
        const turnIndex = studentTurns - 1
        setTimeout(() =>
        {
            const reply = kiraReplyFor({ studentText: text, turnIndex })
            this._appendChat('kira', reply, { animate: true })
        }, 380)
    }

    _logFromChat()
    {
        const text = (this.recCommitted || '').trim()
        if(!text) return
        this._commitCapture(
            { text, reframe: this.reframe, thread: this.thread },
            this.recordedAudioBlob
                ? { audioBlob: this.recordedAudioBlob, mimeType: this.recordedAudioMimeType }
                : {},
        )
        this.close()
    }

    /* ----- chat voice (reuses Web Speech) ----- */

    _chatStartRecording()
    {
        if(!SpeechRecognition) return
        if(this.chatRecognition) return   // already listening
        const rec = new SpeechRecognition()
        rec.lang = navigator.language || 'en-US'
        rec.interimResults = true
        rec.continuous = false

        const seed = this.chatInputEl.value
        let interim = ''
        let committed = seed

        rec.addEventListener('result', (event) =>
        {
            interim = ''
            for(let i = event.resultIndex; i < event.results.length; i++)
            {
                const r = event.results[i]
                if(r.isFinal)
                    committed = committed
                        ? `${committed} ${r[0].transcript.trim()}`
                        : r[0].transcript.trim()
                else
                    interim += r[0].transcript
            }
            this.chatInputEl.value = (committed + (interim ? ` ${interim.trim()}` : '')).trim()
        })

        rec.addEventListener('end', () =>
        {
            this.chatRecognition = null
            this.chatMicBtn.classList.remove('is-listening')
            this.chatInputEl.focus()
        })
        rec.addEventListener('error', () =>
        {
            this.chatRecognition = null
            this.chatMicBtn.classList.remove('is-listening')
        })

        this.chatRecognition = rec
        this.chatMicBtn.classList.add('is-listening')
        try { rec.start() }
        catch(_)
        {
            this.chatRecognition = null
            this.chatMicBtn.classList.remove('is-listening')
        }
    }

    _logReframe()
    {
        if(this.preparedReflection)
        {
            void this._logPreparedReframe()
            return
        }
        const text = (this.recCommitted || '').trim()
        if(!text) return
        this._commitCapture(
            { text, reframe: this.reframe, thread: this.thread },
            this.recordedAudioBlob
                ? { audioBlob: this.recordedAudioBlob, mimeType: this.recordedAudioMimeType }
                : {},
        )
        this.close()
    }

    async _logPreparedReframe()
    {
        if(this.logInFlight || !this.preparedReflection) return
        const prepared = this.preparedReflection
        const reframe = this.reframe
        this.logInFlight = true
        this._setReframeActionMode('logging')

        const capture = this.captures.add({
            id: prepared.localCaptureId,
            kind: 'ask',
            prompt: this.prompt,
            text: prepared.transcript || '',
            reframe,
            syncStatus: this.backend?.logPreparedReflection ? 'syncing' : 'local',
            contextType: prepared.contextType || 'school',
            ...(this.uploadedImageDataUrl ? { dataUrl: this.uploadedImageDataUrl } : {}),
            ...(this.letterId ? { letterId: this.letterId } : {}),
        })

        if(!this.backend?.logPreparedReflection)
        {
            this.close()
            return
        }

        try
        {
            const result = await this.backend.logPreparedReflection(prepared)
            const mirror = result?.mirrorEntry
            if(mirror)
            {
                this.captures.patch?.(capture.id, {
                    backendMirrorEntryId: mirror.id,
                    text: mirror.transcript || capture.text || '',
                    reviewStatus: mirror.reviewStatus || 'pending',
                    syncStatus: 'synced',
                    syncError: '',
                    contextType: mirror.contextType || 'school',
                    reframe: {
                        headline: [
                            mirror.storyReframe,
                            mirror.validation,
                            mirror.inferredMeaning,
                        ].filter(Boolean).join('\n\n'),
                        highlightPhrase: mirror.transcript || '',
                        themes: mirror.contextType ? [mirror.contextType] : [],
                        needs: [],
                        moods: [],
                    },
                })
            }
            this.close()
        }
        catch(err)
        {
            const message = err instanceof Error ? err.message : String(err)
            console.warn('[AskSheet] prepared reflection log failed', err)
            this.captures.patch?.(capture.id, {
                syncStatus: 'failed',
                syncError: message,
            })
            this.close()
        }
    }

    _renderReplayExtras()
    {
        // Read-only replay shows reframe + thread stacked below the raw
        // review-card. Hidden in live mode — there the actions live on the
        // reframe stage itself.
        const showExtras = this.readOnly && (this.replayImageDataUrl || this.reframe || (this.thread && this.thread.length > 0))
        this.replayExtrasEl.hidden = !showExtras
        if(!showExtras) { this.replayExtrasEl.innerHTML = ''; return }

        let html = ''
        if(this.replayImageDataUrl)
        {
            html += `
                <section class="ask-sheet__replay-image">
                    <img src="${this._escape(this.replayImageDataUrl)}" alt="" />
                </section>
            `
        }
        const rf = this.reframe
        if(rf)
        {
            const moodIds = (rf.moods && rf.moods.length > 0) ? rf.moods.slice(0, 2) : ['ennui']
            const shapesHtml = moodIds.map((id) =>
            {
                const e = EMOTION_BY_ID[id] || EMOTION_BY_ID.ennui
                return `<span class="ask-reframe__shape" data-mood="${e.id}">${shapeSvg(e.shape, e.color)}</span>`
            }).join('')
            const pillsHtml = (rf.themes || []).slice(0, 3).map((tid, i) =>
            {
                const t = THEME_PILL[tid] || { label: tid, need: (rf.needs && rf.needs[i]) || '', mood: 'ennui' }
                const e = EMOTION_BY_ID[t.mood] || EMOTION_BY_ID.ennui
                const bg = tintedBg(e.color, 0.15)
                return `<span class="ask-reframe__pill" style="background:${bg}"><span class="ask-reframe__pill-theme">${t.label}</span><span class="ask-reframe__pill-need">${t.need}</span></span>`
            }).join('')
            html += `
                <section class="ask-sheet__replay-reframe">
                    <div class="ask-reframe__shapes" aria-hidden="true">${shapesHtml}</div>
                    <div class="ask-reframe__pills">${pillsHtml}</div>
                    ${rf.highlightPhrase ? `<blockquote class="ask-reframe__quote">${this._escape(rf.highlightPhrase)}</blockquote>` : ''}
                    <p class="ask-sheet__eyebrow">Reading</p>
                    <p class="ask-reframe__prose">${this._escape(rf.headline || '')}</p>
                </section>
            `
        }
        if(this.thread && this.thread.length > 0)
        {
            const bubbles = this.thread.map((m) =>
            {
                const cls = m.role === 'kira' ? 'ask-chat__bubble--kira' : 'ask-chat__bubble--you'
                return `<div class="ask-chat__bubble ${cls}"><span class="ask-chat__author">${m.role === 'kira' ? 'Mirror' : 'you'}</span><p class="ask-chat__text">${this._escape(m.text)}</p></div>`
            }).join('')
            html += `
                <section class="ask-sheet__replay-thread">
                    <p class="ask-sheet__eyebrow">Conversation</p>
                    <div class="ask-chat__thread">${bubbles}</div>
                </section>
            `
        }
        this.replayExtrasEl.innerHTML = html
    }

    _escape(s)
    {
        return String(s || '').replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[ch])
    }

    _commitCapture(payload, options = {})
    {
        // Single funnel so Raw-log, Reframe-log, and Chat-log share one
        // path. The mergeCapture schema is forward-additive (commit #4),
        // so extra fields here flow straight into persistence.
        const mood = this.selectedMood
        const dataUrl = this.uploadedImageDataUrl
        const entry = {
            kind: 'ask',
            prompt: this.prompt,
            syncStatus: this.backend?.submitReflection ? 'syncing' : 'local',
            ...(dataUrl ? { dataUrl } : {}),
            ...(this.letterId ? { letterId: this.letterId } : {}),
            ...payload,
        }
        // Strip empties so old-style captures stay { kind, text, prompt }.
        if(!entry.reframe) delete entry.reframe
        if(!entry.thread || entry.thread.length === 0) delete entry.thread
        const capture = this.captures.add(entry)
        if(this.backend?.submitReflection)
            this._submitBackendReflection(capture, { ...options, mood })
    }

    async _submitBackendReflection(capture, options = {})
    {
        try
        {
            const audioBlob = options.audioBlob
            let audioBase64 = null
            if(audioBlob)
            {
                if(audioBlob.size === 0) throw new Error('No audio was captured.')
                audioBase64 = await blobToStudentSpaceAudioBase64(audioBlob)
            }
            const result = await this.backend.submitReflection({
                localCaptureId: capture.id,
                ...(audioBase64
                    ? { audioBase64, mimeType: options.mimeType || audioBlob.type || 'audio/webm' }
                    : { transcript: capture.text || '' }),
                contextType: capture.contextType || 'school',
                ...(options.mood ? { mood: options.mood } : {}),
            })
            const mirror = result?.mirrorEntry
            if(!mirror) return
            this.captures.patch?.(capture.id, {
                backendMirrorEntryId: mirror.id,
                text: mirror.transcript || capture.text || '',
                reviewStatus: mirror.reviewStatus || 'pending',
                syncStatus: 'synced',
                syncError: '',
                contextType: mirror.contextType || 'school',
                reframe: {
                    headline: mirror.storyReframe || '',
                    highlightPhrase: mirror.inferredMeaning || '',
                    themes: [],
                    needs: [],
                    moods: [],
                },
            })
        }
        catch(err)
        {
            const message = err instanceof Error ? err.message : String(err)
            console.warn('[AskSheet] backend reflection submit failed', err)
            this.captures.patch?.(capture.id, {
                syncStatus: 'failed',
                syncError: message,
            })
        }
    }

    /* ----- stage routing ----- */

    _setStage(stage)
    {
        this.stage = stage
        this.inner.dataset.stage = stage
        for(const el of this.root.querySelectorAll('.ask-sheet__stage'))
            el.hidden = el.dataset.stage !== stage
        if(stage !== 'compose') this.hintEl.hidden = true
    }

    _hasComposerInput()
    {
        return !!(this.input.value.trim() || this.selectedMood || this.uploadedImageDataUrl)
    }

    _composeText()
    {
        const text = this.input.value.trim()
        if(text) return text
        if(this.selectedMood)
        {
            const emotion = EMOTION_BY_ID[this.selectedMood]
            const label = emotion?.label?.toLowerCase?.() || this.selectedMood
            return `I feel ${label}.`
        }
        if(this.uploadedImageDataUrl) return 'I added a picture for this reflection.'
        return ''
    }

    _shouldUseRealtimeVoice()
    {
        return !!(this.backend?.createRealtimeMirrorCapture && canCreateRealtimeMirrorCapture())
    }

    _toggleEmojiPanel()
    {
        this.emojiPanelEl.hidden = !this.emojiPanelEl.hidden
        this.emojiToggleBtn.setAttribute('aria-expanded', String(!this.emojiPanelEl.hidden))
    }

    _selectEmotion(event)
    {
        const btn = event.target.closest?.('.ask-sheet__emoji-option')
        if(!btn) return
        this.selectedMood = btn.dataset.emotion || null
        this.emojiPanelEl.hidden = true
        this.emojiToggleBtn.setAttribute('aria-expanded', 'false')
        this._renderComposerMeta()
        this._refreshSave()
    }

    async _handleImageUpload()
    {
        const file = this.imageInputEl.files?.[0]
        if(!file) return
        if(!file.type?.startsWith('image/'))
        {
            this.hintEl.hidden = false
            this.hintEl.textContent = 'Choose an image file.'
            return
        }
        try
        {
            this.uploadedImageDataUrl = await readImageAsDataUrl(file)
            this._renderComposerMeta()
            this._refreshSave()
        }
        catch(err)
        {
            this.hintEl.hidden = false
            this.hintEl.textContent = err instanceof Error ? err.message : 'Could not read that image.'
        }
    }

    _clearImage()
    {
        this.uploadedImageDataUrl = null
        this.imageInputEl.value = ''
        this._renderComposerMeta()
        this._refreshSave()
    }

    _renderComposerMeta()
    {
        const emotion = this.selectedMood ? EMOTION_BY_ID[this.selectedMood] : null
        this.emojiToggleBtn.classList.toggle('is-selected', !!emotion)
        this.emojiToggleBtn.setAttribute('aria-pressed', emotion ? 'true' : 'false')
        this.emojiToggleBtn.style.setProperty('--emotion-color', emotion?.color || 'rgba(255, 138, 92, 0.95)')

        this.imagePreviewEl.hidden = !this.uploadedImageDataUrl
        this.imageTriggerBtn.classList.toggle('is-selected', !!this.uploadedImageDataUrl)
        if(this.uploadedImageDataUrl) this.imageEl.src = this.uploadedImageDataUrl
        else this.imageEl.removeAttribute('src')

        for(const option of this.emojiPanelEl.querySelectorAll('.ask-sheet__emoji-option'))
            option.classList.toggle('is-selected', option.dataset.emotion === this.selectedMood)
    }

    _renderLetterRef()
    {
        if(!this.letterRefEl) return
        const letter = this.letterId
            ? this.state.letters.letters.find((l) => l.id === this.letterId)
            : null
        if(!letter)
        {
            this.letterRefEl.hidden = true
            this.letterRefEl.dataset.letterId = ''
            return
        }
        const fromText = letter.from ? `From ${letter.from}` : 'From your teacher'
        const subjectText = letter.subject ? ` — ${letter.subject}` : ''
        this.letterRefLabel.textContent = `${fromText}${subjectText}`
        this.letterRefEl.dataset.letterId = letter.id
        this.letterRefEl.hidden = false
    }

    _openLetterRef()
    {
        if(!this.letterId) return
        // Hand off to LettersSheet with the originating letter pre-selected.
        // OverlayController.open enforces exclusivity, so closing AskSheet is
        // implicit — opening 'letters' swaps the active surface for us.
        OverlayController.getInstance().open('letters', { letterId: this.letterId })
    }
}

function readImageAsDataUrl(file)
{
    return new Promise((resolve, reject) =>
    {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Could not read that image.'))
        reader.onload = () =>
        {
            const dataUrl = typeof reader.result === 'string' ? reader.result : ''
            if(!dataUrl) { reject(new Error('Could not read that image.')); return }
            resolve(dataUrl)
        }
        reader.readAsDataURL(file)
    })
}

function friendlyMicError(message)
{
    if(/permission denied|not allowed|NotAllowedError/i.test(message))
        return 'Mic permission denied. Type instead.'
    if(/not found|NotFoundError/i.test(message))
        return 'No microphone was found. Type instead.'
    return `Could not start mic: ${message}`
}
