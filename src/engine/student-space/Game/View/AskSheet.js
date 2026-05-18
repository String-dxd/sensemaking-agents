import State from '../State/State.js'
import OverlayController from './OverlayController.js'
import { reframeFor } from './reframeHeuristics.js'
import { kiraReplyFor } from './chatHeuristics.js'
import { EMOTIONS, shapeSvg } from './MoodSheet.js'

/**
 * Open-ended capture. Three stages:
 *
 *   1. compose   — textarea + mic. Save commits the typed text.
 *   2. recording — full-screen live captions from SpeechRecognition. A big
 *                  Stop button freezes the transcript and advances to review.
 *   3. review    — static read of the final transcript. Log commits it as a
 *                  capture; Discard drops it and routes back to the chooser.
 *
 * Voice path: Web Speech API. Interim results stream into the captions
 * element so the user sees their voice transcribed in near real-time. When
 * the engine isn't available we hide the mic button and degrade to the
 * textarea path.
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

        const root = document.createElement('div')
        root.className = 'ask-sheet'
        root.setAttribute('aria-hidden', 'true')
        root.innerHTML = `
            <button class="ask-sheet__close" type="button" aria-label="Back">×</button>
            <div class="ask-sheet__inner" data-stage="compose">

                <!-- STAGE: compose -->
                <section class="ask-sheet__stage" data-stage="compose">
                    <p class="ask-sheet__eyebrow">Ask anything</p>
                    <h2 class="ask-sheet__title">What's on your mind?</h2>
                    <p class="ask-sheet__prompt" hidden></p>
                    <div class="ask-sheet__field">
                        <textarea
                            class="ask-sheet__input"
                            rows="6"
                            placeholder="Type or tap the mic to talk it out…"
                        ></textarea>
                        <button class="ask-sheet__mic" type="button" aria-label="Start voice recording">
                            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" fill="currentColor"/>
                                <path d="M5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V20a1 1 0 1 1-2 0v-2.07A7 7 0 0 1 5 11Z" fill="currentColor"/>
                            </svg>
                        </button>
                    </div>
                    <p class="ask-sheet__hint" hidden></p>
                    <div class="ask-sheet__row">
                        <button class="ask-sheet__save" type="button" disabled>
                            Save<span aria-hidden="true">→</span>
                        </button>
                    </div>
                </section>

                <!-- STAGE: recording — full-screen live captions -->
                <section class="ask-sheet__stage" data-stage="recording" hidden>
                    <p class="ask-sheet__eyebrow ask-sheet__eyebrow--live">
                        <span class="ask-sheet__rec-dot" aria-hidden="true"></span> Listening
                    </p>
                    <div class="ask-sheet__captions" role="status" aria-live="polite">
                        <p class="ask-sheet__captions-committed"></p>
                        <p class="ask-sheet__captions-interim"></p>
                    </div>
                    <p class="ask-sheet__hint ask-sheet__hint--live" hidden></p>
                    <div class="ask-sheet__row ask-sheet__row--rec">
                        <button class="ask-sheet__stop" type="button">
                            <span class="ask-sheet__stop-icon" aria-hidden="true"></span>
                            Stop &amp; review
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
                            See Kira's reading <span aria-hidden="true">→</span>
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
                        <span class="ask-chat__with">with Kira</span>
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
                    <p class="ask-sheet__eyebrow">Kira's reading</p>
                    <p class="ask-reframe__prose"></p>
                    <div class="ask-sheet__row ask-sheet__row--reframe">
                        <button class="ask-sheet__edit" type="button">Edit</button>
                        <button class="ask-sheet__talk-more" type="button">Talk more</button>
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
        this.promptEl    = root.querySelector('.ask-sheet__prompt')
        this.hintEl      = root.querySelector('.ask-sheet__hint')
        this.hintLiveEl  = root.querySelector('.ask-sheet__hint--live')
        this.captionsCommittedEl = root.querySelector('.ask-sheet__captions-committed')
        this.captionsInterimEl   = root.querySelector('.ask-sheet__captions-interim')
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
        this.reframeLogBtn   = root.querySelector('.ask-sheet__log--reframe')
        this.chatThreadEl    = root.querySelector('.ask-sheet__stage--chat .ask-chat__thread')
        this.chatInputEl     = root.querySelector('.ask-chat__input')
        this.chatMicBtn      = root.querySelector('.ask-chat__mic')
        this.chatLogBtn      = root.querySelector('.ask-chat__log')

        this.recognition = null
        this.listening   = false
        this.prompt      = null
        this.stage       = 'compose'
        this.recCommitted = ''
        this.recInterim   = ''
        this.reframe     = null   // {headline, highlightPhrase, themes, needs, moods, edited}
        this.thread      = null   // [{role, text}, …] — set by chat stage
        this.typerId     = 0

        if(!SpeechRecognition)
        {
            this.micBtn.hidden = true
            this.chatMicBtn.hidden = true
        }

        root.querySelector('.ask-sheet__close').addEventListener('click', () => this._onBack())
        this.input.addEventListener('input', () => this._refreshSave())
        this.saveBtn.addEventListener('click', () => this._saveTyped())
        this.micBtn.addEventListener('click', () => this._startRecording())
        this.stopBtn.addEventListener('click', () => this._stopRecording())
        this.discardBtn.addEventListener('click', () => this._discardReview())
        this.logBtn.addEventListener('click', () => this._logReview())
        this.reframeCtaEl.addEventListener('click', () => this._goReframe())
        this.editBtn.addEventListener('click', () => this._editFromReframe())
        this.talkMoreBtn.addEventListener('click', () => this._talkMore())
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

        document.addEventListener('keydown', (event) =>
        {
            if(!this.isOpen) return
            if(event.key === 'Escape') this._onBack()
        })
    }

    open({ prompt, readOnly, capture, dismissOnBack, prefilledText } = {})
    {
        this.prompt        = prompt || null
        this.readOnly      = !!readOnly
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
        // prefilledText supports the Edit path — re-entering compose from
        // the reframe page lands with the last transcript ready to amend.
        const initialText = this.readOnly && capture?.text
            ? capture.text
            : (prefilledText || '')
        this.input.value = initialText
        this.input.disabled = this.readOnly

        // Reset transient state — a fresh open starts clean.
        this.reframe = null
        this.thread = null
        this.recCommitted = ''
        this.recInterim = ''
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
        if(this.chatThreadEl) this.chatThreadEl.innerHTML = ''
        if(this.chatInputEl)  this.chatInputEl.value = ''
        this._setStage('compose')
        OverlayController.getInstance().noteClosed('ask')
    }

    /* ----- back / dismiss ----- */

    _onBack()
    {
        // Read-only replay + Kira-direct entry both bypass the chooser
        // because there's no chooser context to return to.
        if(this.readOnly || this.dismissOnBack) { this.close(); return }
        // From recording: stop the engine but DON'T review — bail to chooser.
        if(this.listening) this._abortRecording()
        // Default: route back to the chooser; OverlayController will close
        // this sheet as part of the exclusive-surface swap.
        OverlayController.getInstance().open('chooser')
    }

    /* ----- compose ----- */

    _refreshSave()
    {
        this.saveBtn.disabled = this.input.value.trim().length === 0
    }

    _saveTyped()
    {
        const text = this.input.value.trim()
        if(!text) return
        // Promote typed text into the review stage so Save and voice-stop
        // share one review surface (and one "See Kira's reading" entry).
        this.recCommitted = text
        this._goReview()
    }

    /* ----- recording ----- */

    _startRecording()
    {
        if(!SpeechRecognition) return
        const rec = new SpeechRecognition()
        rec.lang = navigator.language || 'en-US'
        rec.interimResults = true
        rec.continuous = true

        // Seed committed with any text the user has typed — recording adds
        // onto it rather than replacing.
        this.recCommitted = this.input.value.trim()
        this.recInterim   = ''
        this._paintCaptions()
        this.hintLiveEl.hidden = true

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

        rec.addEventListener('end', () =>
        {
            // Engine can self-end on long silences; advance to review only
            // if we still believe we're listening (vs explicit user stop,
            // which already routed us).
            if(this.listening) this._goReview()
        })

        rec.addEventListener('error', (event) =>
        {
            this.listening = false
            this.recognition = null
            this.hintLiveEl.hidden = false
            this.hintLiveEl.textContent = event.error === 'not-allowed'
                ? 'Mic permission denied. Type instead.'
                : `Voice input unavailable (${event.error}). Type instead.`
            // Drop back to compose so the user can keep going by typing.
            this._setStage('compose')
        })

        this.recognition = rec
        this.listening = true
        this._setStage('recording')
        try { rec.start() }
        catch(err)
        {
            this.listening = false
            this.recognition = null
            this.hintEl.hidden = false
            this.hintEl.textContent = 'Could not start mic.'
            this._setStage('compose')
        }
    }

    _stopRecording()
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
        this._goReview()
    }

    _abortRecording()
    {
        // Hard-cancel: no review, just stop the engine.
        this.listening = false
        try { this.recognition?.abort?.() ?? this.recognition?.stop?.() } catch(_) {}
        this.recognition = null
    }

    _paintCaptions()
    {
        this.captionsCommittedEl.textContent = this.recCommitted
        this.captionsInterimEl.textContent   = this.recInterim
    }

    /* ----- review ----- */

    _goReview()
    {
        const text = this.recCommitted.trim()
        if(!text)
        {
            // Nothing transcribed — return to compose, surface a hint.
            this._setStage('compose')
            this.hintEl.hidden = false
            this.hintEl.textContent = "Didn't catch anything. Try again or type it."
            return
        }
        this.reviewTextEl.textContent = text
        this._setStage('review')
    }

    _logReview()
    {
        // Raw path — student opted out of the reframe. Commit text only.
        const text = this.recCommitted.trim()
        if(!text) return
        this._commitCapture({ text })
        this.close()
    }

    _discardReview()
    {
        // Drop the transcript (and any in-progress reframe/thread) and go
        // back to the chooser.
        this.recCommitted = ''
        this.recInterim   = ''
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
        const text = (this.recCommitted || '').trim()
        if(!text) return
        // Re-run the heuristic each time we enter so the Edit path
        // produces a fresh reading on the amended transcript. The "edited"
        // flag tracks whether the student returned via Edit at least once
        // — useful provenance in the saved capture.
        const editedFlag = this.reframe?.edited === true
        this.reframe = { ...reframeFor(text), edited: editedFlag }
        this._renderReframe(this.reframe)
        this._setStage('reframe')
    }

    _renderReframe(rf)
    {
        // 1. Mood shapes — 1–2, drawn from MoodSheet's shapeSvg() so the
        //    typography of the surface stays consistent with the rest of
        //    the mood UI.
        const moodIds = rf.moods.length > 0 ? rf.moods.slice(0, 2) : ['ennui']
        this.reframeShapesEl.innerHTML = moodIds.map((id) =>
        {
            const e = EMOTION_BY_ID[id] || EMOTION_BY_ID.ennui
            return `<span class="ask-reframe__shape" data-mood="${e.id}">${shapeSvg(e.shape, e.color)}</span>`
        }).join('')

        // 2. Theme pills — theme on top, inferred need beneath. ~15% bg
        //    tinted by the first matching mood (anxiety-tinged for school,
        //    ennui-tinged for sleep, etc.).
        if(rf.themes.length === 0)
        {
            this.reframePillsEl.innerHTML = ''
        }
        else
        {
            this.reframePillsEl.innerHTML = rf.themes.slice(0, 3).map((tid, i) =>
            {
                const t = THEME_PILL[tid] || { label: tid, need: rf.needs[i] || '', mood: 'ennui' }
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
        this._openChat()
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
        const wrap = document.createElement('div')
        wrap.className = `ask-chat__bubble ${role === 'kira' ? 'ask-chat__bubble--kira' : 'ask-chat__bubble--you'}`
        wrap.innerHTML = `
            <span class="ask-chat__author">${role === 'kira' ? 'Kira' : 'you'}</span>
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
        this._commitCapture({ text, reframe: this.reframe, thread: this.thread })
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
        const text = (this.recCommitted || '').trim()
        if(!text) return
        this._commitCapture({ text, reframe: this.reframe, thread: this.thread })
        this.close()
    }

    _renderReplayExtras()
    {
        // Read-only replay shows reframe + thread stacked below the raw
        // review-card. Hidden in live mode — there the actions live on the
        // reframe stage itself.
        const showExtras = this.readOnly && (this.reframe || (this.thread && this.thread.length > 0))
        this.replayExtrasEl.hidden = !showExtras
        if(!showExtras) { this.replayExtrasEl.innerHTML = ''; return }

        let html = ''
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
                    <p class="ask-sheet__eyebrow">Kira's reading</p>
                    <p class="ask-reframe__prose">${this._escape(rf.headline || '')}</p>
                </section>
            `
        }
        if(this.thread && this.thread.length > 0)
        {
            const bubbles = this.thread.map((m) =>
            {
                const cls = m.role === 'kira' ? 'ask-chat__bubble--kira' : 'ask-chat__bubble--you'
                return `<div class="ask-chat__bubble ${cls}"><span class="ask-chat__author">${m.role === 'kira' ? 'Kira' : 'you'}</span><p class="ask-chat__text">${this._escape(m.text)}</p></div>`
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

    _commitCapture(payload)
    {
        // Single funnel so Raw-log, Reframe-log, and Chat-log share one
        // path. The mergeCapture schema is forward-additive (commit #4),
        // so extra fields here flow straight into persistence.
        const entry = { kind: 'ask', prompt: this.prompt, ...payload }
        // Strip empties so old-style captures stay { kind, text, prompt }.
        if(!entry.reframe) delete entry.reframe
        if(!entry.thread || entry.thread.length === 0) delete entry.thread
        this.captures.add(entry)
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
}
