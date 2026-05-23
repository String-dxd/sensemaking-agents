import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  FacetSheetCard,
  type FacetSheetState,
  INITIAL_FACET_SHEET,
} from '~/components/student-space/world/FacetSheetCard'
import { meaningForSpecies } from '~/engine/student-space/Game/Data/flowerMeanings.js'
import {
  claimLabel,
  VIPS_BY_FACET,
  VIPS_TAXONOMY,
} from '~/engine/student-space/Game/Data/vipsTaxonomy.js'
import {
  elementTitle,
  evidenceCountText,
  speciesIdOf as evidenceSpeciesIdOf,
  latestEvidenceLine,
  metaphorLine,
  resolveElementEvidence,
} from '~/engine/student-space/Game/View/elementEvidence.js'
import { FACET_HEADERS, FACET_THEMES } from '~/engine/student-space/Game/View/facets.js'
import { PROFILE_COLORS, PROFILE_HEADERS } from '~/lib/profile-tokens'
import { rankClaims } from '~/lib/student-space/rank-claims'
import { cn } from '~/lib/utils'

const GREETINGS = {
  morning: ["You're back. The island's been quiet.", "Morning. The wind's from the east today."],
  afternoon: [
    "Good — I was hoping you'd come by.",
    'The fruit on the southwest tree is heavier than yesterday.',
  ],
  evening: ["Late one. I'll keep my voice down.", "Hey. The light's getting soft."],
  any: ['Settling in?', "Take your time. I'll be on the branch."],
}

const FIRST_ARRIVAL_GREETINGS = [
  "There you are. I've been on this branch a while.",
  "Welcome. The island's quiet — but it's listening.",
  "The sky was waiting for someone. That's you.",
  "Take a look around. Nothing's growing yet, and that's okay.",
]

const INVITES = [
  'Anything pull at you today?',
  'What was the loudest part of today?',
  'If you had to describe today as a kind of weather — what would it be?',
  'Something stuck with you. I can usually tell. What was it?',
  "Small thing. Big thing. Either's fine.",
  'Did anything surprise you today?',
  "Anything you'd want me to remember?",
  'What did you do that felt like *you*?',
  'If today had a color, what would it be?',
  'Heavy day or light one?',
]

const SOFT_INVITES = [
  "Quiet day. That's okay.",
  "I'm not asking anything today.",
  'Just here if you want company.',
  "The wind's gentle today.",
  "Take your time. I'll be on the branch.",
  'We can both just sit for a bit.',
  "I noticed. That's all.",
]

type Narration = { text: string; cta: string }

const TREE_NARRATION: Record<string, Narration> = {
  oak: {
    text: 'That one is an oak. They take their time — they hold the things you keep coming back to. Want me to show you what this oak is rooted in?',
    cta: 'Show me',
  },
  cherry: {
    text: 'A cherry. Those grow around values that are still becoming — something you’ve only said once or twice. I’ve been watching this one.',
    cta: 'Tell me more',
  },
}

const FLOWER_NARRATION: Record<string, Narration> = {
  daisy: {
    text: 'A daisy — small interest in motion. They open with attention and close when you look away. Curious about this one?',
    cta: 'Open',
  },
  tulip: {
    text: 'A tulip. Held close, like a secret. Sometimes the interests we don’t share yet are the ones that matter most.',
    cta: 'Open',
  },
  rose: {
    text: 'A rose. Interests with layers — practice, return, prune. The reward is the time you put in.',
    cta: 'Open',
  },
  lily: {
    text: 'A lily. Generous, reaching. These are the interests that pull other people in — making, sharing, performing.',
    cta: 'Open',
  },
  pansy: {
    text: 'A pansy. Curious, watching. Interests that are mostly about noticing — reading, observing, taking small notes.',
    cta: 'Open',
  },
  hyacinth: {
    text: 'A hyacinth. Quiet build of attention — small noticings stacked over time, becoming something tall.',
    cta: 'Open',
  },
}

const FRUIT_NARRATION: Record<string, Narration> = {
  apple: {
    text: 'An apple — a practical skill. The kind of thing that gets done when nobody’s watching.',
    cta: 'Open',
  },
  pear: {
    text: 'A pear — analytical. Slicing a problem until the shape underneath shows.',
    cta: 'Open',
  },
  plum: {
    text: 'A plum — something you’ve made where the path wasn’t drawn for you.',
    cta: 'Open',
  },
  fig: {
    text: 'A fig — reading people. Knowing what to say and when to leave it alone.',
    cta: 'Open',
  },
  citrus: {
    text: 'A citrus — leading. Setting direction, then carrying the weight of it.',
    cta: 'Open',
  },
  berry: {
    text: 'A berry — saying what you mean, in the register the listener needs.',
    cta: 'Open',
  },
}

const KIRA_NARRATION = {
  text: 'It’s me. If anything is on your mind, I’m here. Choose whatever feels easiest — words, voice, a feeling, or a picture.',
  cta: 'Talk to me',
}

const SPECIES_LINE: Record<string, string> = {
  oak: 'A value you keep returning to.',
  cherry: 'A value that’s tender, still growing.',
  daisy: 'A small interest in motion.',
  tulip: 'Held close — like a secret.',
  rose: 'Something you tend with care.',
  lily: 'Reaching, generous.',
  pansy: 'Curious, watching.',
  hyacinth: 'A quiet build of attention.',
  apple: 'A practical skill — getting things done.',
  pear: 'An analytical skill — taking it apart.',
  plum: 'A creative skill — making something new.',
  fig: 'An interpersonal skill — reading the room.',
  citrus: 'A leadership skill — setting direction.',
  berry: 'A communication skill — saying what you mean.',
}

const KIND_TO_FACET: Record<string, string> = {
  tree: 'values',
  flower: 'interests',
  fruit: 'skills',
}

const CLAIM_ID_BY_SPECIES = (() => {
  const map: Record<string, string> = {}
  for (const claim of VIPS_TAXONOMY) {
    const sp = claim.object?.species
    if (sp) map[sp] = claim.id
  }
  return map
})()

const INWARD_EMOTIONS = new Set(['anxiety', 'sadness', 'ennui'])
const SOFT_MODE_PIN_WINDOW = 7
const SOFT_MODE_THRESHOLD = 3
const HOLD_MS = 12_000
const IDLE_MS = 45_000
const ZOOM_DURATION = 600
const PICKUP_LIFT_MS = 520
const TYPER_BASE_MS = 32
const TYPER_COMMA_MS = 140
const TYPER_STOP_MS = 220
const RING_COLOR = 0xffe9c2
const RING_PULSE_HZ = 0.9

// biome-ignore lint/suspicious/noExplicitAny: this bridge attaches to untyped engine JS singletons.
type AnyEngine = any
type EngineDeps = {
  View: { getInstance: () => AnyEngine }
  State: { getInstance: () => AnyEngine }
  OverlayController: { getInstance: () => AnyEngine }
  Game: { getInstance: () => AnyEngine }
  ThumbnailRenderer: new () => AnyEngine
}

// biome-ignore lint/suspicious/noExplicitAny: hover targets are engine-shaped records from JS scene classes.
type Target = Record<string, any>

type KiraBubbleState = {
  visible: boolean
  text: string
  x: number
  y: number
  hidden: boolean
}

type NarratorState = {
  open: boolean
  name: string
  text: string
  cta: string
}

type HoverCtaState = {
  open: boolean
  x: number
  y: number
  eyebrow: string
  badge: string
  title: string
  line: string
  thumbUrl: string | null
  theme: { accent: string; soft: string; ink: string } | null
}

type ObjectPeekState = {
  open: boolean
  x: number
  y: number
  eyebrow: string
  title: string
  meaning: string
}

type ObjectPickupState = {
  open: boolean
  name: string
  text: string
  talkLabel: string
  detailLabel: string
  detailIcon: boolean
}

const INITIAL_BUBBLE: KiraBubbleState = { visible: false, text: '', x: 0, y: 0, hidden: false }
const INITIAL_NARRATOR: NarratorState = { open: false, name: 'Kira', text: '', cta: 'Open' }
const INITIAL_HOVER_CTA: HoverCtaState = {
  open: false,
  x: 0,
  y: 0,
  eyebrow: '',
  badge: '',
  title: '',
  line: '',
  thumbUrl: null,
  theme: null,
}
const INITIAL_OBJECT_PEEK: ObjectPeekState = {
  open: false,
  x: 0,
  y: 0,
  eyebrow: '',
  title: '',
  meaning: '',
}
const INITIAL_OBJECT_PICKUP: ObjectPickupState = {
  open: false,
  name: 'Kira',
  text: '',
  talkLabel: 'Talk about it more',
  detailLabel: 'Open detail page',
  detailIcon: true,
}

export function WorldInteractions({
  game,
  onboardingMode = false,
}: {
  game: unknown
  onboardingMode?: boolean
}) {
  const [bubble, setBubble] = useState(INITIAL_BUBBLE)
  const [narrator, setNarrator] = useState(INITIAL_NARRATOR)
  const [hoverCta, setHoverCta] = useState(INITIAL_HOVER_CTA)
  const [objectPeek, setObjectPeek] = useState(INITIAL_OBJECT_PEEK)
  const [objectPickup, setObjectPickup] = useState(INITIAL_OBJECT_PICKUP)
  const [facetSheet, setFacetSheet] = useState(INITIAL_FACET_SHEET)
  const onboardingModeRef = useRef(onboardingMode)
  const controllersRef = useRef<{
    kiraDialogue?: KiraDialogueController
    kiraNarrator?: KiraNarratorController
    objectPeek?: ObjectPeekController
    hoverCta?: HoverCtaController
    hoverProbe?: HoverProbeController
    facetSheet?: FacetSheetController
  }>({})

  useEffect(() => {
    let cancelled = false
    let controllers: Array<{ dispose?: () => void }> = []

    void (async () => {
      const [
        { default: View },
        { default: State },
        { default: OverlayController },
        { default: Game },
        { default: ThumbnailRenderer },
      ] = await Promise.all([
        import('~/engine/student-space/Game/View/View.js'),
        import('~/engine/student-space/Game/State/State.js'),
        import('~/engine/student-space/Game/View/OverlayController.js'),
        import('~/engine/student-space/Game/Game.js'),
        import('~/engine/student-space/Game/View/ThumbnailRenderer.js'),
      ])
      if (cancelled) return
      const deps: EngineDeps = { View, State, OverlayController, Game, ThumbnailRenderer }
      const view = (game as { view?: AnyEngine } | null)?.view ?? View.getInstance()
      if (!view) return

      const kiraDialogue = new KiraDialogueController(deps, setBubble)
      const kiraNarrator = new KiraNarratorController(deps, setNarrator)
      const objectPeekController = new ObjectPeekController(deps, setObjectPeek, setObjectPickup)
      const hoverCtaController = new HoverCtaController(deps, setHoverCta)
      const facetSheetController = new FacetSheetController(deps, setFacetSheet)
      view.kiraDialogue = kiraDialogue
      view.kiraNarrator = kiraNarrator
      view.objectPeek = objectPeekController
      view.hoverCta = hoverCtaController
      view.facetView = facetSheetController
      const hoverProbe = new HoverProbeController(deps)
      view.hoverProbe = hoverProbe

      controllersRef.current = {
        kiraDialogue,
        kiraNarrator,
        objectPeek: objectPeekController,
        hoverCta: hoverCtaController,
        hoverProbe,
        facetSheet: facetSheetController,
      }
      controllers = [
        kiraDialogue,
        kiraNarrator,
        objectPeekController,
        hoverCtaController,
        hoverProbe,
        facetSheetController,
      ]
      kiraDialogue.setOnboardingMode(onboardingModeRef.current)
    })()

    return () => {
      cancelled = true
      for (const controller of controllers) {
        try {
          controller.dispose?.()
        } catch {
          // Match the engine's defensive disposal posture.
        }
      }
      const view = (game as { view?: AnyEngine } | null)?.view
      if (view) {
        if (view.kiraDialogue === controllersRef.current.kiraDialogue) view.kiraDialogue = null
        if (view.kiraNarrator === controllersRef.current.kiraNarrator) view.kiraNarrator = null
        if (view.objectPeek === controllersRef.current.objectPeek) view.objectPeek = null
        if (view.hoverCta === controllersRef.current.hoverCta) view.hoverCta = null
        if (view.hoverProbe === controllersRef.current.hoverProbe) view.hoverProbe = null
        if (view.facetView === controllersRef.current.facetSheet) view.facetView = null
      }
      controllersRef.current = {}
    }
  }, [game])

  useEffect(() => {
    onboardingModeRef.current = onboardingMode
    controllersRef.current.kiraDialogue?.setOnboardingMode(onboardingMode)
  }, [onboardingMode])

  return (
    <>
      <KiraBubble state={bubble} onDismiss={() => controllersRef.current.kiraDialogue?.hide()} />
      <HoverCtaChip state={hoverCta} />
      <ObjectPeekPopover
        state={objectPeek}
        onAdvance={() => controllersRef.current.objectPeek?._goPickup()}
      />
      <NarratorPanel
        state={narrator}
        onClose={() => controllersRef.current.kiraNarrator?.close()}
        onConfirm={() => controllersRef.current.kiraNarrator?._confirm()}
      />
      <ObjectPickupPanel
        state={objectPickup}
        onClose={() => controllersRef.current.objectPeek?.close()}
        onPrimary={() => controllersRef.current.objectPeek?._primary()}
        onSecondary={() => controllersRef.current.objectPeek?._secondary()}
      />
      <FacetSheetCard
        state={facetSheet}
        onClose={() => controllersRef.current.facetSheet?.close()}
        onToggleFull={() => controllersRef.current.facetSheet?.toggleFull()}
        onOpenProfile={() => controllersRef.current.facetSheet?.openProfile()}
      />
    </>
  )
}

class KiraDialogueController {
  view: AnyEngine
  state: AnyEngine
  dayCycle: AnyEngine
  kira: AnyEngine
  spoken = 0
  invited = false
  activeUntil = 0
  lastActivity = performance.now()
  typerId = 0
  onboardingMode = false
  worldPos = new THREE.Vector3()
  screenPos = new THREE.Vector3()
  disposed = false
  _lastSay = 0
  _greetTimerId: ReturnType<typeof setTimeout> | null = null
  _activityEvents: string[] | null = ['pointerdown', 'keydown', 'wheel']
  _onActivity: (() => void) | null = () => {
    this.lastActivity = performance.now()
  }

  constructor(
    deps: EngineDeps,
    private setBubble: Dispatch<SetStateAction<KiraBubbleState>>,
  ) {
    this.view = deps.View.getInstance()
    this.state = deps.State.getInstance()
    this.dayCycle = this.state.day
    this.kira = this.view.kira

    for (const evt of this._activityEvents ?? []) {
      window.addEventListener(evt, this._onActivity as EventListener)
    }
    this._greetTimerId = setTimeout(() => this._greet(), 1400)
  }

  dispose() {
    this.disposed = true
    if (this._greetTimerId != null) clearTimeout(this._greetTimerId)
    if (this._onActivity && this._activityEvents) {
      for (const evt of this._activityEvents) {
        window.removeEventListener(evt, this._onActivity as EventListener)
      }
    }
    this._activityEvents = null
    this._onActivity = null
    this.typerId += 1
    this.setBubble(INITIAL_BUBBLE)
  }

  _hourBand(hour: number) {
    if (hour < 12) return 'morning'
    if (hour < 17.5) return 'afternoon'
    return 'evening'
  }

  _greet() {
    if (this.onboardingMode || this.spoken >= 2 || this.disposed) return
    if (this.state.coldStart?.active) {
      this.show(randomOf(FIRST_ARRIVAL_GREETINGS))
      return
    }
    const band = this._hourBand(this.dayCycle.hour)
    this.show(randomOf(GREETINGS[band] || GREETINGS.any))
  }

  _invite() {
    if (this.spoken >= 2 || this.invited) return
    this.invited = true
    this.show(randomOf(this._isSoftMode() ? SOFT_INVITES : INVITES))
  }

  _isSoftMode() {
    const recent = this.state.moodPins.recent(SOFT_MODE_PIN_WINDOW)
    let inward = 0
    for (const pin of recent) if (INWARD_EMOTIONS.has(pin.emotion)) inward += 1
    return inward >= SOFT_MODE_THRESHOLD
  }

  show(text: string) {
    this.activeUntil = performance.now() + HOLD_MS
    this.spoken += 1
    this.setBubble((prev) => ({ ...prev, visible: true }))
    this._type(text)
  }

  say(text: string, { cooldown = 3500 } = {}) {
    const now = performance.now()
    if (now - this._lastSay < cooldown) return
    this._lastSay = now
    this.activeUntil = now + HOLD_MS
    this.setBubble((prev) => ({ ...prev, visible: true }))
    this._type(text)
  }

  hide() {
    this.activeUntil = 0
    this.setBubble((prev) => ({ ...prev, visible: false }))
  }

  setOnboardingMode(active: boolean) {
    this.onboardingMode = !!active
    this.spoken = 0
    this.invited = false
    this.lastActivity = performance.now()
    if (active) this.hide()
  }

  sayOnboarding(text: string) {
    if (!this.onboardingMode) return
    this.activeUntil = 0
    this.setBubble((prev) => ({ ...prev, visible: true }))
    this._type(text)
  }

  clearOnboardingBubble() {
    if (this.onboardingMode) this.hide()
  }

  update() {
    if (this.disposed) return
    const now = performance.now()
    if (this.activeUntil && now >= this.activeUntil) this.hide()
    if (
      !this.onboardingMode &&
      !this.invited &&
      this.spoken < 2 &&
      now - this.lastActivity > IDLE_MS
    ) {
      this._invite()
    }

    const cam = this.view.camera.instance
    this.kira.getHeadWorldPosition(this.worldPos)
    this.worldPos.y += 0.4
    this.screenPos.copy(this.worldPos).project(cam)
    const x = (this.screenPos.x * 0.5 + 0.5) * window.innerWidth
    const y = (-this.screenPos.y * 0.5 + 0.5) * window.innerHeight
    const hidden = this.screenPos.z > 1
    this.setBubble((prev) => ({ ...prev, x, y, hidden }))
  }

  _type(text: string) {
    this.typerId += 1
    const myId = this.typerId
    if (prefersReducedMotion()) {
      this.setBubble((prev) => ({ ...prev, text }))
      return
    }
    this.setBubble((prev) => ({ ...prev, text: '' }))
    let index = 0
    const step = () => {
      if (myId !== this.typerId || this.disposed) return
      if (index >= text.length) return
      const ch = text[index] ?? ''
      this.setBubble((prev) => ({ ...prev, text: prev.text + ch }))
      index += 1
      setTimeout(step, typeDelay(ch))
    }
    step()
  }
}

class KiraNarratorController {
  view: AnyEngine
  state: AnyEngine
  isActive = false
  target: Target | null = null
  typerId = 0
  disposed = false
  _timers = new Set<ReturnType<typeof setTimeout>>()
  _kiraTurn: AnyEngine = null
  _kiraRestYaw: number | null = null
  _onKeyDown = (event: KeyboardEvent) => {
    if (this.isActive && event.key === 'Escape') this.close()
  }

  constructor(
    private deps: EngineDeps,
    private setNarrator: Dispatch<SetStateAction<NarratorState>>,
  ) {
    this.view = deps.View.getInstance()
    this.state = deps.State.getInstance()
    document.addEventListener('keydown', this._onKeyDown)
  }

  dispose() {
    this.disposed = true
    document.removeEventListener('keydown', this._onKeyDown)
    this.typerId += 1
    this._clearTimers()
    this._kiraTurn = null
    this._kiraRestYaw = null
    this.setNarrator(INITIAL_NARRATOR)
  }

  narrate(target: Target) {
    if (!target) return
    this.target = target
    const narration = narrationFor(target, this.state)
    this.setNarrator((prev) => ({ ...prev, cta: narration.cta, text: '' }))
    this._scheduleType(narration.text, 260)

    this.view.kiraDialogue?.hide?.()
    if (this.view.facetView?.isOpen) this.view.facetView.close()
    this.view.hoverCta?.hide?.()
    this.view.hoverProbe?.setEnabled?.(false)

    const kira = this.view.kira
    const perch = kira.group.position
    const liveCam = this.view.camera.instance.position
    const fromKiraDx = liveCam.x - perch.x
    const fromKiraDz = liveCam.z - perch.z
    const flatLen = Math.hypot(fromKiraDx, fromKiraDz) || 1
    const unitX = fromKiraDx / flatLen
    const unitZ = fromKiraDz / flatLen
    const camPos = new THREE.Vector3(perch.x + unitX * 2.6, perch.y + 1.05, perch.z + unitZ * 2.6)
    const camLook = new THREE.Vector3(perch.x, perch.y + 0.85, perch.z)
    this.view.camera.zoomTo(camPos, camLook, ZOOM_DURATION, { owner: 'kira-narrator' })

    if (this._kiraRestYaw === null) this._kiraRestYaw = kira.group.rotation.y
    this._kiraTurn = {
      mode: 'in',
      startTime: performance.now(),
      from: kira.group.rotation.y,
      to: Math.atan2(-unitZ, unitX),
      duration: ZOOM_DURATION,
    }

    this._schedule(() => {
      if (this.disposed) return
      this.setNarrator((prev) => ({
        ...prev,
        name: this.state?.profile?.displayCompanionName?.() || 'Kira',
        open: true,
      }))
    }, 180)
    this.isActive = true
  }

  _scheduleType(text: string, delay = 0) {
    this.typerId += 1
    const myId = this.typerId
    if (prefersReducedMotion()) {
      this.setNarrator((prev) => ({ ...prev, text }))
      return
    }
    this.setNarrator((prev) => ({ ...prev, text: '' }))
    let index = 0
    const step = () => {
      if (myId !== this.typerId || this.disposed) return
      if (index >= text.length) return
      const ch = text[index] ?? ''
      this.setNarrator((prev) => ({ ...prev, text: prev.text + ch }))
      index += 1
      this._schedule(step, typeDelay(ch))
    }
    this._schedule(step, delay)
  }

  _confirm() {
    const target = this.target
    this.close()
    if (!target) return
    if (target.kind === 'kira') {
      this._schedule(() => {
        if (this.disposed) return
        this.deps.OverlayController.getInstance().open('ask', { dismissOnBack: true })
      }, 280)
      return
    }
    if (this.view.facetView)
      this._schedule(() => {
        if (!this.disposed) this.view.facetView.openFor(target)
      }, 280)
  }

  close() {
    if (!this.isActive) return
    this.isActive = false
    this.typerId += 1
    this._clearTimers()
    this.setNarrator((prev) => ({ ...prev, open: false }))
    this.view.camera.restoreZoom(ZOOM_DURATION, { owner: 'kira-narrator' })

    if (this._kiraRestYaw !== null) {
      this._kiraTurn = {
        mode: 'out',
        startTime: performance.now(),
        from: this.view.kira.group.rotation.y,
        to: this._kiraRestYaw,
        duration: ZOOM_DURATION,
      }
    }
    this._schedule(() => {
      if (!this.disposed) this.view.hoverProbe?.setEnabled?.(true)
    }, ZOOM_DURATION + 80)
  }

  update() {
    const turn = this._kiraTurn
    if (!turn) return
    const t = Math.min(1, (performance.now() - turn.startTime) / turn.duration)
    const eased = smootherStep(t)
    let delta = turn.to - turn.from
    delta = ((delta + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    this.view.kira.group.rotation.y = turn.from + delta * eased
    if (t >= 1) {
      this._kiraTurn = null
      if (turn.mode === 'out') this._kiraRestYaw = null
    }
  }

  _schedule(callback: () => void, delay: number) {
    const id = setTimeout(() => {
      this._timers.delete(id)
      callback()
    }, delay)
    this._timers.add(id)
    return id
  }

  _clearTimers() {
    for (const id of this._timers) clearTimeout(id)
    this._timers.clear()
  }
}

class HoverCtaController {
  view: AnyEngine
  target: Target | null = null
  _thumbs: AnyEngine = null

  constructor(
    private deps: EngineDeps,
    private setHoverCta: Dispatch<SetStateAction<HoverCtaState>>,
  ) {
    this.view = deps.View.getInstance()
  }

  showFor(target: Target, screenX: number, screenY: number) {
    this.target = target
    this._renderContent(target)
    this.setAnchor(screenX, screenY)
    this.setHoverCta((prev) => ({ ...prev, open: true }))
  }

  _renderContent(target: Target) {
    if (target.kind === 'mailbox') {
      const unread = this.deps.State.getInstance()?.letters?.unreadCount?.() ?? 0
      this._setContent({
        eyebrow: 'Letters from your teacher',
        badge: 'Letters',
        title: 'Mailbox',
        line:
          unread > 0
            ? unread === 1
              ? '1 unread letter.'
              : `${unread} unread letters.`
            : 'All read.',
        thumbUrl: null,
        theme: null,
      })
      return
    }
    if (target.kind === 'kira') {
      this._setContent({
        eyebrow: 'How today is landing',
        badge: 'Mood',
        title: this.deps.State.getInstance()?.profile?.displayCompanionName?.() || 'Kira',
        line: 'Your island’s resident finch.',
        thumbUrl: null,
        theme: themeForFacet('mood'),
      })
      return
    }
    if (target.kind === 'telescope') {
      this._setContent({
        eyebrow: 'Possible directions',
        badge: 'Path Finder',
        title: 'Telescope',
        line: 'Read the compass for paths your profile points at.',
        thumbUrl: null,
        theme: null,
      })
      return
    }

    const facetId = KIND_TO_FACET[target.kind]
    const header = facetId ? FACET_HEADERS[facetId] : null
    const sp = evidenceSpeciesIdOf(target)
    const evidence = resolveElementEvidence(target, this.deps.State.getInstance()?.profile)
    const claimId = evidence.claimId || CLAIM_ID_BY_SPECIES[sp]
    this._setContent({
      eyebrow: header?.eyebrow ? cap(header.eyebrow.toLowerCase()) : '',
      badge: header?.tag ?? '',
      title: elementTitle(evidence, cap(sp) || 'Element'),
      line: evidence.claimId ? latestEvidenceLine(evidence, 72) : (SPECIES_LINE[sp] ?? ''),
      thumbUrl: this._thumbUrl(claimId),
      theme: themeForFacet(facetId),
    })
  }

  _setContent(next: Omit<HoverCtaState, 'open' | 'x' | 'y'>) {
    this.setHoverCta((prev) => ({ ...prev, ...next }))
  }

  _thumbUrl(claimId: string | undefined) {
    if (!claimId) return null
    if (!this._thumbs) {
      try {
        this._thumbs = new this.deps.ThumbnailRenderer()
      } catch (err) {
        console.warn('[HoverCta] thumbnail renderer init failed', err)
        return null
      }
    }
    return this._thumbs.getThumbnail(claimId) || null
  }

  setAnchor(screenX: number, screenY: number) {
    this.setHoverCta((prev) => ({ ...prev, x: screenX + 16, y: screenY - 12 }))
  }

  hide() {
    this.target = null
    this.setHoverCta((prev) => ({ ...prev, open: false }))
  }

  dispose() {
    try {
      this._thumbs?.dispose?.()
    } catch {}
    this._thumbs = null
    this.target = null
    this.setHoverCta(INITIAL_HOVER_CTA)
  }

  update() {}
}

const KIND_CONFIG: Record<string, AnyEngine> = {
  flower: {
    eyebrow: 'FLOWER',
    title: (target: Target, _view: AnyEngine, state: AnyEngine) => {
      const evidence = resolveElementEvidence(target, state?.profile)
      return elementTitle(evidence, cap(speciesIdOf(target)) || 'Flower')
    },
    peekText: (target: Target, _view: AnyEngine, state: AnyEngine) => {
      const evidence = resolveElementEvidence(target, state?.profile)
      if (evidence.claimId) return `${metaphorLine(evidence)} ${latestEvidenceLine(evidence, 86)}`
      const meaning = meaningForSpecies(speciesIdOf(target))
      return meaning?.peek || 'A small interest in motion.'
    },
    loreText: (target: Target, _view: AnyEngine, state: AnyEngine) => {
      const evidence = resolveElementEvidence(target, state?.profile)
      if (evidence.claimId && evidence.hasEvidence) {
        return `${evidence.definition} Latest noticing: “${evidence.latestQuoteText}”`
      }
      if (evidence.claimId) {
        return `${metaphorLine(evidence)} No noticings have landed here yet. When a noticing lands here, this bloom will open onto the matching timeline.`
      }
      const meaning = meaningForSpecies(speciesIdOf(target))
      return meaning?.lore || 'A flower — small evidence of an interest still finding its shape.'
    },
    cameraOffset: { dist: 1.8, lift: 0.42, lookLift: 0.2 },
    peekAnchorLift: 0.32,
    pickup: true,
    primaryCta: { label: 'Talk about it more' },
    secondaryCta: { label: 'Open detail page', icon: true },
    primaryAction: (target: Target, _view: AnyEngine, state: AnyEngine, deps: EngineDeps) => {
      const evidence = resolveElementEvidence(target, state?.profile)
      const meaning = meaningForSpecies(speciesIdOf(target))
      const prompt = evidence.claimLabel
        ? `Tell me about ${evidence.claimLabel.toLowerCase()} as an interest.`
        : meaning?.ask || `Tell me about your interest in ${speciesIdOf(target) || 'this flower'}.`
      deps.OverlayController.getInstance().open('ask', { prompt, dismissOnBack: true })
    },
    secondaryAction: (target: Target, view: AnyEngine) => view.facetView?.openFor(target),
  },
  mailbox: {
    eyebrow: 'MAIL',
    title: () => 'Mailbox',
    peekText: (_target: Target, _view: AnyEngine, state: AnyEngine) => {
      const unread = state?.letters?.unreadCount?.() ?? 0
      if (unread === 0) return 'All read. The mailbox is quiet today.'
      return unread === 1 ? '1 unread letter from school.' : `${unread} unread letters from school.`
    },
    loreText: (_target: Target, _view: AnyEngine, state: AnyEngine) => {
      const unread = state?.letters?.unreadCount?.() ?? 0
      if (unread > 0) {
        return "The flag is up because something's waiting. Letters from teachers, the school, sometimes a parent — they sit here so you can read them on your own time, not when they're delivered. Want to look?"
      }
      return "Empty box, but the past letters are still in there. Sometimes it helps to reread what someone said to you weeks ago, when you've changed enough to hear it differently."
    },
    cameraOffset: { dist: 2.4, lift: 0.85, lookLift: 1.05 },
    peekAnchorLift: 1.4,
    pickup: false,
    primaryCta: { label: 'Talk about it more' },
    secondaryCta: { label: 'Open mail', icon: true },
    primaryAction: (_target: Target, _view: AnyEngine, _state: AnyEngine, deps: EngineDeps) =>
      deps.OverlayController.getInstance().open('ask', {
        prompt: 'Tell me about a teacher or message that has stayed with you.',
        dismissOnBack: true,
      }),
    secondaryAction: (_target: Target, _view: AnyEngine, _state: AnyEngine, deps: EngineDeps) =>
      deps.Game.getInstance()?.navigate('/letters'),
  },
  telescope: {
    eyebrow: 'PATH FINDER',
    title: () => 'Telescope',
    peekText: () =>
      'A small lens fixed on the future — pointed at the directions your profile already leans toward.',
    loreText: () =>
      "The compass reads everything the island has noticed about you — values, interests, skills, the way you respond — and translates it into pathways worth trying next. Three at a time, not many; each one carries its own risks. You're not deciding here; you're picking what to test.",
    cameraOffset: { dist: 2.6, lift: 0.55, lookLift: 0.7 },
    peekAnchorLift: 1.1,
    pickup: false,
    primaryCta: { label: 'Talk about it more' },
    secondaryCta: { label: 'Open Path Finder', icon: true },
    primaryAction: (_target: Target, _view: AnyEngine, _state: AnyEngine, deps: EngineDeps) =>
      deps.OverlayController.getInstance().open('ask', {
        prompt: "Tell me about a path you've been quietly curious about.",
        dismissOnBack: true,
      }),
    secondaryAction: (_target: Target, _view: AnyEngine, _state: AnyEngine, deps: EngineDeps) =>
      deps.Game.getInstance()?.navigate('/trajectory'),
  },
}

class ObjectPeekController {
  view: AnyEngine
  state: AnyEngine
  scene: AnyEngine
  isOpen = false
  step: 'peek' | 'pickup' | null = null
  target: Target | null = null
  config: AnyEngine = null
  pickupGroup: THREE.Group | null = null
  pickupTween: AnyEngine = null
  typerId = 0
  disposed = false
  _timers = new Set<ReturnType<typeof setTimeout>>()
  tmpVec = new THREE.Vector3()
  _onKeyDown = (event: KeyboardEvent) => {
    if (this.isOpen && event.key === 'Escape') this.close()
  }
  _onDocPointerDown = (event: PointerEvent) => {
    if (!this.isOpen) return
    const target = event.target as HTMLElement | null
    const inside = target?.closest?.(
      '[data-object-peek], [data-object-pickup], [data-kira-dialogue], [data-facet-sheet], [data-facet-sheet-scrim]',
    )
    if (!inside && target?.tagName === 'CANVAS') this.close()
  }

  constructor(
    private deps: EngineDeps,
    private setObjectPeek: Dispatch<SetStateAction<ObjectPeekState>>,
    private setObjectPickup: Dispatch<SetStateAction<ObjectPickupState>>,
  ) {
    this.view = deps.View.getInstance()
    this.state = deps.State.getInstance()
    this.scene = this.view.scene
    document.addEventListener('keydown', this._onKeyDown)
    document.addEventListener('pointerdown', this._onDocPointerDown)
  }

  canHandle(target: Target) {
    return !!(target && KIND_CONFIG[target.kind])
  }

  open(target: Target) {
    const config = target && KIND_CONFIG[target.kind]
    if (!config) return
    this.disposed = false
    this._clearTimers()
    this.target = target
    this.config = config
    this.isOpen = true
    this.step = 'peek'

    this.view.hoverCta?.hide?.()
    this.view.hoverProbe?.setEnabled?.(false)
    this.view.kiraDialogue?.hide?.()
    if (this.view.facetView?.isOpen) this.view.facetView.close()

    const anchor = this._objectAnchor(target)
    const liveCam = this.view.camera.instance.position
    const dx = liveCam.x - target.x
    const dz = liveCam.z - target.z
    const flatLen = Math.hypot(dx, dz) || 1
    const unitX = dx / flatLen
    const unitZ = dz / flatLen
    const { dist, lift, lookLift } = config.cameraOffset
    const camPos = new THREE.Vector3(
      target.x + unitX * dist,
      anchor.y + lift,
      target.z + unitZ * dist,
    )
    const camLook = new THREE.Vector3(target.x, anchor.y + lookLift, target.z)
    this.view.camera.zoomTo(camPos, camLook, ZOOM_DURATION, { owner: 'object-peek' })

    this.setObjectPeek({
      open: false,
      x: 0,
      y: 0,
      eyebrow: config.eyebrow,
      title: config.title(target, this.view, this.state),
      meaning: config.peekText(target, this.view, this.state),
    })
    this._schedule(() => {
      if (this.disposed || this.step !== 'peek') return
      this.setObjectPeek((prev) => ({ ...prev, open: true }))
      this._anchorPeek()
    }, 200)
  }

  _goPickup() {
    if (!this.target) return
    const config = this.config
    this.step = 'pickup'
    this.setObjectPeek((prev) => ({ ...prev, open: false }))

    const kira = this.view.kira
    if (kira) {
      const perch = kira.group.position
      const liveCam = this.view.camera.instance.position
      const dx = liveCam.x - perch.x
      const dz = liveCam.z - perch.z
      const flatLen = Math.hypot(dx, dz) || 1
      const unitX = dx / flatLen
      const unitZ = dz / flatLen
      const camPos = new THREE.Vector3(perch.x + unitX * 2.6, perch.y + 1.05, perch.z + unitZ * 2.6)
      const camLook = new THREE.Vector3(perch.x, perch.y + 0.85, perch.z)
      this.view.camera.zoomTo(camPos, camLook, ZOOM_DURATION, { owner: 'object-peek' })
      if (config.pickup) this._spawnPickup(kira)
    }

    this.setObjectPickup({
      open: false,
      name: this.state?.profile?.displayCompanionName?.() || 'Kira',
      text: '',
      talkLabel: config.primaryCta.label,
      detailLabel: config.secondaryCta.label,
      detailIcon: Boolean(config.secondaryCta.icon),
    })
    this._schedulePickupType(config.loreText(this.target, this.view, this.state), 280)
    this._schedule(() => {
      if (this.disposed || this.step !== 'pickup') return
      this.setObjectPickup((prev) => ({ ...prev, open: true }))
    }, 200)
  }

  _primary() {
    const config = this.config
    const target = this.target
    this.close()
    if (!config) return
    this._schedule(() => {
      if (!this.disposed) config.primaryAction(target, this.view, this.state, this.deps)
    }, 240)
  }

  _secondary() {
    const config = this.config
    const target = this.target
    this.close()
    if (!config) return
    this._schedule(() => {
      if (!this.disposed) config.secondaryAction(target, this.view, this.state, this.deps)
    }, 240)
  }

  close() {
    if (!this.isOpen) return
    this.isOpen = false
    this.step = null
    this.typerId += 1
    this._clearTimers()
    this.setObjectPeek((prev) => ({ ...prev, open: false }))
    this.setObjectPickup((prev) => ({ ...prev, open: false }))
    this.view.camera.restoreZoom(ZOOM_DURATION, { owner: 'object-peek' })
    this._despawnPickup()
    this._schedule(() => {
      if (!this.disposed) this.view.hoverProbe?.setEnabled?.(true)
    }, ZOOM_DURATION + 80)
    this._schedule(() => {
      if (this.disposed) return
      this.target = null
      this.config = null
    }, ZOOM_DURATION + 200)
  }

  dispose() {
    this.disposed = true
    document.removeEventListener('keydown', this._onKeyDown)
    document.removeEventListener('pointerdown', this._onDocPointerDown)
    this.typerId += 1
    this._clearTimers()
    if (this.pickupGroup) disposeGroup(this.pickupGroup)
    this.pickupGroup = null
    this.pickupTween = null
    this.isOpen = false
    this.target = null
    this.config = null
    this.setObjectPeek(INITIAL_OBJECT_PEEK)
    this.setObjectPickup(INITIAL_OBJECT_PICKUP)
  }

  update() {
    if (this.isOpen && this.step === 'peek' && this.target) this._anchorPeek()
    if (this.pickupTween && this.pickupGroup) {
      const t = Math.min(
        1,
        (performance.now() - this.pickupTween.start) / this.pickupTween.duration,
      )
      const eased = smootherStep(t)
      this.pickupGroup.position.y =
        this.pickupTween.from + (this.pickupTween.to - this.pickupTween.from) * eased
      if (t >= 1) {
        const mode = this.pickupTween.mode
        this.pickupTween = null
        if (mode === 'down') {
          disposeGroup(this.pickupGroup)
          this.pickupGroup = null
        }
      }
    }
  }

  _objectAnchor(target: Target) {
    return { y: this.state.island.heightAt(target.x, target.z) }
  }

  _anchorPeek() {
    const target = this.target
    const config = this.config
    if (!target || !config) return
    const groundY = this.state.island.heightAt(target.x, target.z)
    this.tmpVec.set(target.x, groundY + config.peekAnchorLift, target.z)
    this.tmpVec.project(this.view.camera.instance)
    const dom = this.view.renderer.instance.domElement
    const rect = dom.getBoundingClientRect()
    const x = (this.tmpVec.x * 0.5 + 0.5) * rect.width + rect.left
    const y = (-this.tmpVec.y * 0.5 + 0.5) * rect.height + rect.top
    this.setObjectPeek((prev) => ({ ...prev, x, y }))
  }

  _schedulePickupType(text: string, delay = 0) {
    this.typerId += 1
    const myId = this.typerId
    if (prefersReducedMotion()) {
      this.setObjectPickup((prev) => ({ ...prev, text }))
      return
    }
    this.setObjectPickup((prev) => ({ ...prev, text: '' }))
    let index = 0
    const step = () => {
      if (myId !== this.typerId || this.disposed) return
      if (index >= text.length) return
      const ch = text[index] ?? ''
      this.setObjectPickup((prev) => ({ ...prev, text: prev.text + ch }))
      index += 1
      this._schedule(step, typeDelay(ch))
    }
    this._schedule(step, delay)
  }

  _spawnPickup(kira: AnyEngine) {
    const target = this.target
    if (!target || !kira?.group) return
    const grp = new THREE.Group()
    const petalMat = new THREE.MeshLambertMaterial({
      color: speciesColor(target),
      flatShading: true,
    })
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x6f8a4a, flatShading: true })
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), stemMat)
    stem.position.y = 0.06
    grp.add(stem)
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), petalMat)
      petal.position.set(Math.cos(angle) * 0.05, 0.13, Math.sin(angle) * 0.05)
      petal.scale.set(1, 0.5, 1)
      grp.add(petal)
    }
    grp.position.set(0.12, 0, 0.12)
    kira.group.add(grp)
    this.pickupGroup = grp
    this.pickupTween = {
      start: performance.now(),
      from: 0.02,
      to: 0.78,
      duration: PICKUP_LIFT_MS,
      mode: 'up',
    }
  }

  _despawnPickup() {
    if (!this.pickupGroup) return
    this.pickupTween = {
      start: performance.now(),
      from: this.pickupGroup.position.y,
      to: 0,
      duration: PICKUP_LIFT_MS,
      mode: 'down',
    }
  }

  _schedule(callback: () => void, delay: number) {
    const id = setTimeout(() => {
      this._timers.delete(id)
      callback()
    }, delay)
    this._timers.add(id)
    return id
  }

  _clearTimers() {
    for (const id of this._timers) clearTimeout(id)
    this._timers.clear()
  }
}

const MOOD_THEME = { accent: '#7FB3D9', soft: '#DBE9F3', ink: '#365770' }
const MOOD_HEADER = {
  eyebrow: 'HOW TODAY IS LANDING',
  tag: 'Mood',
  title: "What you're carrying today",
  subtitle: 'Small weather across the week',
}
const MOOD_PIN_COLORS: Record<string, string> = {
  joy: '#FFD66B',
  sadness: '#7FB3D9',
  anger: '#E36A55',
  fear: '#B49AD6',
  disgust: '#9CC36E',
  anxiety: '#F1A04E',
  envy: '#6FC2B3',
  embarrassment: '#F0A6B5',
  ennui: '#A8A5BD',
}
const KIRA_BODY_TEXT =
  'Kira watches the shape of what you say and places things on the ground that match — oaks for values, blooms for interests, fruits for skills, butterflies for thoughts passing through.'

function facetIdForTarget(target: Target): string {
  if (target.kind === 'tree') return 'values'
  if (target.kind === 'flower') return 'interests'
  if (target.kind === 'fruit') return 'skills'
  if (target.kind === 'kira') return 'mood'
  return 'values'
}

function compassBucket(x: number, z: number): string {
  if (Math.hypot(x, z) < 0.6) return 'centre of the island'
  const angle = Math.atan2(x, z)
  const slice = Math.PI / 8
  if (angle >= -slice && angle < slice) return 'north of the plateau'
  if (angle >= slice && angle < 3 * slice) return 'northeast slope'
  if (angle >= 3 * slice && angle < 5 * slice) return 'east toward the shore'
  if (angle >= 5 * slice && angle < 7 * slice) return 'southeast bend'
  if (angle >= 7 * slice || angle < -7 * slice) return 'south side'
  if (angle >= -7 * slice && angle < -5 * slice) return 'southwest bend'
  if (angle >= -5 * slice && angle < -3 * slice) return 'west toward the shore'
  return 'northwest slope'
}

const FACET_PLURAL: Record<string, string> = {
  cherry: 'cherries',
  lily: 'lilies',
  daisy: 'daisies',
  berry: 'berries',
}
function pluralize(word: string, n: number): string {
  if (n === 1) return word
  if (!word) return word
  if (FACET_PLURAL[word]) return FACET_PLURAL[word]
  if (/[^aeiou]y$/i.test(word)) return word.replace(/y$/i, 'ies')
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`
  return `${word}s`
}

function truncateText(text: string, maxLength: number): string {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
}

const TREE_COPY: Record<string, string> = {
  oak: "Oaks hold the things you don't outgrow — the principles you act on without naming them. They take a long time to grow, and a long time to leave.",
  cherry:
    "Cherry trees mark something you've said once or twice but not anchored yet. They bloom early, fade if ignored — they need return visits to root.",
}
const FLOWER_COPY: Record<string, string> = {
  daisy:
    "Daisies move with attention — opening when you look at them, closing when you don't. They mark interests that breathe with curiosity.",
  tulip:
    'Tulips stay cupped. They mark interests you protect — not yet ready to share, but worth keeping warm.',
  rose: 'Roses take effort. They mark practiced interests — things you return to, prune, refine.',
  lily: 'Lilies face outward. They mark interests that pull other people in — making, performing, sharing, hosting.',
  pansy:
    'Pansies are observational interests. Reading, noticing patterns, taking small notes about how things work.',
  hyacinth:
    "Hyacinths stack. Small repeated noticings, each adding to the pillar — interests that don't reveal themselves until they're tall.",
}
const FRUIT_COPY: Record<string, string> = {
  apple:
    'Apples are the practical skills — getting things done, finishing what you start, adapting plans to constraints.',
  pear: 'Pears are the analytical skills — taking a problem apart, reasoning with evidence, reaching defensible conclusions.',
  plum: "Plums are the creative skills — making something where the path wasn't pre-drawn.",
  fig: 'Figs are the interpersonal skills — reading the room, building trust, working across differences.',
  citrus:
    'Citrus is the leadership skill — setting direction, coordinating others, taking responsibility for outcomes.',
  berry:
    'Berries are the communication skills — saying what you mean, in the register your audience needs.',
}

function elementTitleForTarget(target: Target, state: AnyEngine): string {
  if (target.kind === 'kira') return state?.profile?.displayCompanionName?.() || 'Kira'
  const species = evidenceSpeciesIdOf(target)
  return species ? capitalize(species) : 'Element'
}

function elementBodyForTarget(target: Target): string {
  if (target.kind === 'kira') return KIRA_BODY_TEXT
  const species = evidenceSpeciesIdOf(target)
  if (target.kind === 'tree') return TREE_COPY[species] ?? ''
  if (target.kind === 'flower') return FLOWER_COPY[species] ?? ''
  if (target.kind === 'fruit') return FRUIT_COPY[species] ?? ''
  return ''
}

function elementBodyForEvidence(evidence: AnyEngine, target: Target): string {
  if (!evidence?.claimId) return elementBodyForTarget(target)
  const line = metaphorLine(evidence)
  if (evidence.hasEvidence)
    return `${line} It is backed by ${evidenceCountText(evidence).toLowerCase()} in your profile timeline.`
  return `${line} No saved noticings have landed here yet.`
}

class FacetSheetController {
  view: AnyEngine
  state: AnyEngine
  isOpen = false
  isFull = false
  activeFacetId: string | null = null
  disposed = false

  constructor(
    private deps: EngineDeps,
    private setFacetSheet: Dispatch<SetStateAction<FacetSheetState>>,
  ) {
    this.view = deps.View.getInstance()
    this.state = deps.State.getInstance()
  }

  openFor(target: Target) {
    if (!target) return
    const evidence = resolveElementEvidence(target, this.state?.profile)
    const facetId = evidence?.facetId || facetIdForTarget(target)
    const header =
      facetId === 'mood'
        ? MOOD_HEADER
        : (PROFILE_HEADERS[facetId as keyof typeof PROFILE_HEADERS] ?? PROFILE_HEADERS.values)
    const theme =
      facetId === 'mood'
        ? MOOD_THEME
        : (PROFILE_COLORS[facetId as keyof typeof PROFILE_COLORS] ?? PROFILE_COLORS.values)

    const next = this._computeStateFor(target, facetId, header, theme, evidence)
    this.activeFacetId = facetId
    this.isOpen = true
    this.isFull = false
    this.setFacetSheet(next)
  }

  close() {
    if (!this.isOpen) return
    this.isOpen = false
    this.isFull = false
    this.setFacetSheet((prev) => ({ ...prev, open: false, isFull: false }))
  }

  toggleFull() {
    if (!this.isOpen) return
    this.isFull = !this.isFull
    const next = this.isFull
    this.setFacetSheet((prev) => ({ ...prev, isFull: next }))
  }

  openProfile() {
    const facetId = this.activeFacetId
    if (!facetId || facetId === 'mood') return
    this.close()
    const href = facetId === 'values' ? '/profile' : `/profile/${facetId}`
    this.deps.Game.getInstance()?.navigate?.(href)
  }

  dispose() {
    this.disposed = true
    this.isOpen = false
    this.activeFacetId = null
    this.setFacetSheet(INITIAL_FACET_SHEET)
  }

  update() {}

  _computeStateFor(
    target: Target,
    facetId: string,
    header: { eyebrow: string; tag: string; title: string; subtitle: string },
    theme: { accent: string; soft: string; ink: string },
    evidence: AnyEngine,
  ): FacetSheetState {
    const detailTitle = elementTitle(evidence, elementTitleForTarget(target, this.state))
    const detailBody = elementBodyForEvidence(evidence, target)

    if (facetId === 'mood') {
      const pins: AnyEngine[] = this.state?.moodPins?.recent?.(5) ?? []
      const top = pins[0]
      const last = pins[pins.length - 1]
      return {
        open: true,
        isFull: false,
        facetId,
        eyebrow: header.eyebrow,
        tag: header.tag,
        title: header.title,
        subtitle: header.subtitle,
        accent: theme.accent,
        soft: theme.soft,
        ink: theme.ink,
        mostCommonLabel: top
          ? `${capitalize(top.emotion)} — ${top.intensity}/4`
          : 'Still listening.',
        quietlyEmergingLabel:
          last && last !== top
            ? `${capitalize(last.emotion)} — ${last.intensity}/4`
            : 'Capture one today to seed the picture.',
        detailTitle,
        detailBody,
        bentoRows: [],
        moodPins: pins.map((p) => ({
          emotion: p.emotion,
          intensity: p.intensity,
          entryDate: p.entryDate,
          color: MOOD_PIN_COLORS[p.emotion] || '#888',
        })),
        ctaLabel: '',
        ctaVisible: false,
      }
    }

    const canonical = (VIPS_BY_FACET as Record<string, AnyEngine[]>)[facetId] ?? []
    const counts: Record<string, number> = this.state?.profile?.countByClaim
      ? this.state.profile.countByClaim(facetId)
      : {}
    const ranked = rankClaims(canonical, counts)
    const mostCommonLabel = ranked.mostCommon?.label ?? ''
    const quietlyEmergingLabel = ranked.quietlyEmerging?.label ?? ''

    const rows: Array<{ label: string; value: string }> = []
    if (evidence?.claimId) {
      rows.push({ label: 'Claim', value: claimLabel(evidence.claimId) })
      rows.push({ label: 'Evidence', value: evidenceCountText(evidence) })
      if (evidence.latestQuoteText)
        rows.push({
          label: 'Latest noticing',
          value: `“${truncateText(evidence.latestQuoteText, 96)}”`,
        })
    }
    rows.push({ label: 'Where it lives', value: compassBucket(target.x ?? 0, target.z ?? 0) })

    const species = evidenceSpeciesIdOf(target)
    if (facetId === 'values' && this.view.tree?.entries) {
      const others =
        this.view.tree.entries.filter((e: AnyEngine) => evidenceSpeciesIdOf(e) === species).length -
        1
      rows.push({
        label: 'Companions',
        value:
          others <= 0
            ? 'only one of its kind'
            : `${others} other ${pluralize(species, others)} on the island`,
      })
    } else if (facetId === 'interests' && this.view.flowers?.flowers) {
      const others =
        this.view.flowers.flowers.filter((e: AnyEngine) => evidenceSpeciesIdOf(e) === species)
          .length - 1
      rows.push({
        label: 'Companions',
        value:
          others <= 0
            ? 'first of its species'
            : `${others} other ${pluralize(species, others)} nearby`,
      })
    } else if (facetId === 'skills' && this.view.fruits) {
      const entries: AnyEngine[] = this.view.fruits.entries ?? []
      const others = entries.filter((e: AnyEngine) => evidenceSpeciesIdOf(e) === species).length - 1
      rows.push({
        label: 'Companions',
        value:
          others <= 0
            ? 'only one ripening'
            : `${others} other ${pluralize(species, others)} ripening nearby`,
      })
    }

    const tag = (header.tag || facetId).toLowerCase()
    const ctaLabel = evidence?.claimLabel
      ? `Open ${evidence.claimLabel} timeline →`
      : `See all your ${tag} →`

    return {
      open: true,
      isFull: false,
      facetId,
      eyebrow: header.eyebrow,
      tag: header.tag,
      title: header.title,
      subtitle: header.subtitle,
      accent: theme.accent,
      soft: theme.soft,
      ink: theme.ink,
      mostCommonLabel,
      quietlyEmergingLabel,
      detailTitle,
      detailBody,
      bentoRows: rows,
      moodPins: [],
      ctaLabel,
      ctaVisible: true,
    }
  }
}

export class HoverProbeController {
  view: AnyEngine
  state: AnyEngine
  scene: AnyEngine
  camera: AnyEngine
  dom: HTMLElement
  ray = new THREE.Raycaster()
  pointer = new THREE.Vector2()
  tempScreen = new THREE.Vector3()
  _lastPickCameraPosition = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN)
  _lastPickCameraQuaternion = new THREE.Quaternion(Number.NaN, Number.NaN, Number.NaN, Number.NaN)
  hovered: Target | null = null
  lastHovered: Target | null = null
  enabled = true
  _pointerDirty = false
  _latestPointer: { x: number; y: number; type: string } | null = null
  ring: AnyEngine = null
  _onEditMode: ((event: CustomEvent<{ on?: boolean }>) => void) | null = null
  _onPointerMove: ((event: PointerEvent) => void) | null = null
  _onPointerLeave: (() => void) | null = null
  _onDomPointerDown: ((event: PointerEvent) => void) | null = null
  _onPointerUp: ((event: PointerEvent) => void) | null = null
  _onDocPointerDown: ((event: PointerEvent) => void) | null = null

  constructor(deps?: EngineDeps) {
    const View = deps?.View
    const State = deps?.State
    this.view = View?.getInstance?.()
    this.state = State?.getInstance?.()
    this.scene = this.view?.scene
    this.camera = this.view?.camera?.instance
    this.dom = this.view?.renderer?.instance?.domElement
    if (!this.view) return
    this._buildRing()
    this._bindPointer()
    this._onEditMode = (event) => this.setEnabled(!event?.detail?.on)
    window.addEventListener('ss:edit-mode', this._onEditMode as EventListener)
  }

  setEnabled(on: boolean) {
    this.enabled = !!on
    if (!on) this._setHover(null)
  }

  _buildRing() {
    const geo = new THREE.RingGeometry(0.42, 0.55, 36, 1)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({
      color: RING_COLOR,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.ring = new THREE.Mesh(geo, mat)
    this.ring.renderOrder = 5
    this.ring.visible = false
    this.scene.add(this.ring)
  }

  _bindPointer() {
    this._onPointerMove = (event) => {
      const type = event.pointerType || 'mouse'
      if (
        !this._latestPointer ||
        this._latestPointer.x !== event.clientX ||
        this._latestPointer.y !== event.clientY ||
        this._latestPointer.type !== type
      ) {
        this._pointerDirty = true
      }
      this._latestPointer = { x: event.clientX, y: event.clientY, type }
    }
    this.dom.addEventListener('pointermove', this._onPointerMove)

    this._onPointerLeave = () => {
      this._latestPointer = null
      this._setHover(null)
    }
    this.dom.addEventListener('pointerleave', this._onPointerLeave)

    let downX = 0
    let downY = 0
    this._onDomPointerDown = (event) => {
      downX = event.clientX
      downY = event.clientY
    }
    this.dom.addEventListener('pointerdown', this._onDomPointerDown)

    this._onPointerUp = (event) => this._handlePointerUp(event, downX, downY)
    this.dom.addEventListener('pointerup', this._onPointerUp)

    this._onDocPointerDown = (event) => {
      const target = event.target as HTMLElement | null
      const onCanvas = target === this.dom
      const onChip = Boolean(target?.closest?.('[data-world-hover-cta]'))
      const onCard = Boolean(target?.closest?.('[data-facet-sheet], [data-facet-sheet-scrim]'))
      if (!onCanvas && !onChip && !onCard) this._setHover(null)
    }
    document.addEventListener('pointerdown', this._onDocPointerDown)
  }

  dispose() {
    if (this._onEditMode)
      window.removeEventListener('ss:edit-mode', this._onEditMode as EventListener)
    if (this._onDocPointerDown) document.removeEventListener('pointerdown', this._onDocPointerDown)
    if (this.dom) {
      if (this._onPointerMove) this.dom.removeEventListener('pointermove', this._onPointerMove)
      if (this._onPointerLeave) this.dom.removeEventListener('pointerleave', this._onPointerLeave)
      if (this._onDomPointerDown)
        this.dom.removeEventListener('pointerdown', this._onDomPointerDown)
      if (this._onPointerUp) this.dom.removeEventListener('pointerup', this._onPointerUp)
    }
    if (this.ring) {
      this.scene?.remove?.(this.ring)
      this.ring.geometry?.dispose?.()
      this.ring.material?.dispose?.()
    }
    this.hovered = null
    this.lastHovered = null
    this._latestPointer = null
    this.enabled = false
    this.ring = null
  }

  _handlePointerUp(
    event: Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerType'>,
    downX: number,
    downY: number,
  ) {
    const dx = event.clientX - downX
    const dy = event.clientY - downY
    if (Math.hypot(dx, dy) > 6) return

    const hit = this._pick(event.clientX, event.clientY)
    this._latestPointer = { x: event.clientX, y: event.clientY, type: event.pointerType || 'mouse' }
    this._pointerDirty = false
    this._rememberPickCamera()
    if (hit) {
      if (
        event.pointerType === 'touch' &&
        (!this.lastHovered || this.lastHovered.group !== hit.group)
      ) {
        this._setHover(hit)
        return
      }
      this._setHover(hit)
      if (this.view.objectPeek?.canHandle?.(hit)) this.view.objectPeek.open(hit)
      else if (this.view.kiraNarrator) this.view.kiraNarrator.narrate(hit)
      else this.view.facetView.openFor(hit)
    } else {
      this._setHover(null)
    }
  }

  update() {
    if (!this.enabled || !this.ring) return
    if (
      this._latestPointer &&
      this._latestPointer.type !== 'touch' &&
      (this._pointerDirty || this._cameraChangedSincePick())
    ) {
      const hit = this._pick(this._latestPointer.x, this._latestPointer.y)
      this._setHover(hit)
      this._pointerDirty = false
      this._rememberPickCamera()
    }
    if (this.hovered) {
      const t = this.state.time.elapsed
      this.ring.material.opacity = 0.55 + 0.25 * Math.sin(t * Math.PI * 2 * RING_PULSE_HZ)
    }
    if (this.hovered && this.view.hoverCta) {
      const pos = this._screenPos(this.hovered)
      this.view.hoverCta.setAnchor(pos.x, pos.y)
    }
  }

  _cameraChangedSincePick() {
    if (!this.camera || !this._lastPickCameraPosition || !this._lastPickCameraQuaternion)
      return true
    if (!Number.isFinite(this._lastPickCameraPosition.x)) return true
    const moved = this.camera.position.distanceToSquared(this._lastPickCameraPosition) > 0.000001
    const rotated =
      1 - Math.abs(this.camera.quaternion.dot(this._lastPickCameraQuaternion)) > 0.000001
    return moved || rotated
  }

  _rememberPickCamera() {
    if (!this.camera || !this._lastPickCameraPosition || !this._lastPickCameraQuaternion) return
    this._lastPickCameraPosition.copy(this.camera.position)
    this._lastPickCameraQuaternion.copy(this.camera.quaternion)
  }

  _pick(clientX: number, clientY: number) {
    const rect = this.dom.getBoundingClientRect()
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.ray.setFromCamera(this.pointer, this.camera)

    const telescopeGroup = this.view.telescope?.group
    if (telescopeGroup && this.ray.intersectObject(telescopeGroup, true)[0]) {
      return {
        kind: 'telescope',
        group: telescopeGroup,
        x: telescopeGroup.position.x,
        z: telescopeGroup.position.z,
      }
    }
    const mailboxGroup = this.view.mailbox?.group
    if (mailboxGroup && this.ray.intersectObject(mailboxGroup, true)[0]) {
      return {
        kind: 'mailbox',
        group: mailboxGroup,
        x: mailboxGroup.position.x,
        z: mailboxGroup.position.z,
      }
    }
    const kiraGroup = this.view.kira.group
    if (this.ray.intersectObject(kiraGroup, true)[0]) {
      return { kind: 'kira', group: kiraGroup, x: kiraGroup.position.x, z: kiraGroup.position.z }
    }
    for (const fruit of this.view.fruits?.entries ?? []) {
      if (this.ray.intersectObject(fruit.group, true)[0]) {
        return {
          kind: 'fruit',
          group: fruit.group,
          index: fruit.index,
          species: fruit.species,
          host: fruit.host,
          x: fruit.x,
          z: fruit.z,
        }
      }
    }
    for (const flower of this.view.flowers.flowers) {
      if (this.ray.intersectObject(flower.group, true)[0]) {
        return {
          kind: 'flower',
          group: flower.group,
          index: flower.index,
          species: flower.species,
          x: flower.x,
          z: flower.z,
        }
      }
    }
    for (const entry of this.view.tree.entries) {
      if (this.ray.intersectObject(entry.group, true)[0]) {
        return {
          kind: 'tree',
          group: entry.group,
          index: entry.index,
          species: entry.species,
          x: entry.x,
          z: entry.z,
        }
      }
    }
    return null
  }

  _setHover(target: Target | null) {
    if (this._sameTarget(target, this.hovered)) return
    this.hovered = target
    this.lastHovered = target

    if (target) {
      this.dom.style.cursor = 'pointer'
      const ringScale =
        target.kind === 'tree'
          ? 1.6
          : target.kind === 'flower'
            ? 0.65
            : target.kind === 'fruit'
              ? 0.55
              : target.kind === 'kira'
                ? 1
                : target.kind === 'mailbox'
                  ? 0.85
                  : target.kind === 'telescope'
                    ? 0.7
                    : 1
      const groundY = this.state.island.heightAt(target.x ?? 0, target.z ?? 0)
      this.ring.position.set(target.x ?? 0, groundY + 0.02, target.z ?? 0)
      this.ring.scale.setScalar(ringScale)
      this.ring.visible = true
      if (this.view.hoverCta) {
        const pos = this._screenPos(target)
        this.view.hoverCta.showFor(target, pos.x, pos.y)
      }
    } else {
      this.dom.style.cursor = ''
      this.ring.visible = false
      this.ring.material.opacity = 0
      this.view.hoverCta?.hide?.()
    }
  }

  _sameTarget(a: Target | null, b: Target | null) {
    if (a === b) return true
    if (!a || !b) return false
    return a.kind === b.kind && a.index === b.index && a.group === b.group
  }

  _screenPos(target: Target) {
    const lift =
      target.kind === 'tree'
        ? 1.8
        : target.kind === 'kira'
          ? 0.5
          : target.kind === 'flower'
            ? 0.25
            : target.kind === 'fruit'
              ? target.host === 'bush'
                ? 0.35
                : 1.6
              : target.kind === 'mailbox'
                ? 1.35
                : target.kind === 'telescope'
                  ? 1
                  : 0
    this.tempScreen.set(
      target.x ?? 0,
      this.state.island.heightAt(target.x ?? 0, target.z ?? 0) + lift,
      target.z ?? 0,
    )
    this.tempScreen.project(this.camera)
    const rect = this.dom.getBoundingClientRect()
    return {
      x: (this.tempScreen.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-this.tempScreen.y * 0.5 + 0.5) * rect.height + rect.top,
    }
  }
}

function KiraBubble({ state, onDismiss }: { state: KiraBubbleState; onDismiss: () => void }) {
  if (!state.visible || state.hidden) return null
  return (
    <button
      type="button"
      data-kira-bubble
      onClick={onDismiss}
      style={{
        transform: `translate(calc(${Math.round(state.x)}px - 50%), calc(${Math.round(state.y)}px - 100% - 16px))`,
      }}
      className={cn(
        'pointer-events-auto fixed left-0 top-0 z-[54] max-w-[260px] rounded-[18px] border border-white/80 bg-white/92 px-4 py-3 text-left font-sans text-[13px] leading-[1.45] font-semibold text-[#2b2620] shadow-[0_10px_28px_rgba(40,30,20,0.16)] backdrop-blur-md transition duration-200',
        'after:absolute after:left-1/2 after:top-full after:size-3 after:-translate-x-1/2 after:-translate-y-1/2 after:rotate-45 after:border-r after:border-b after:border-white/80 after:bg-white/92',
        state.visible ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0',
      )}
    >
      <span>{state.text}</span>
    </button>
  )
}

function HoverCtaChip({ state }: { state: HoverCtaState }) {
  return (
    <div
      role="tooltip"
      aria-hidden={!state.open}
      data-world-hover-cta
      style={
        {
          left: state.x,
          top: state.y,
          '--cta-accent': state.theme?.accent,
          '--cta-soft': state.theme?.soft,
          '--cta-ink': state.theme?.ink,
        } as CSSProperties
      }
      className={cn(
        'pointer-events-none fixed z-[26] flex max-w-[296px] flex-row-reverse items-center gap-3.5 rounded-[18px] bg-white/92 pt-3 pr-3.5 pb-4 pl-5 font-sans text-[#2b2620] antialiased shadow-[0_1px_2px_rgba(34,26,18,0.06),0_12px_28px_rgba(34,26,18,0.16)] backdrop-blur-md transition duration-160',
        state.open ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
      )}
    >
      {state.thumbUrl ? (
        <span
          aria-hidden
          className="size-10 shrink-0 self-center rounded-full bg-white/60 bg-cover bg-center ring-1 ring-black/15"
          style={{ backgroundImage: `url(${state.thumbUrl})` }}
        />
      ) : null}
      <div className="min-w-0">
        {state.title ? (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] leading-tight font-semibold text-[var(--cta-ink,#7b3a20)]"
            style={{
              background: `color-mix(in srgb, var(--cta-soft, #fde0e0) 70%, #fff)`,
            }}
          >
            {state.title}
          </span>
        ) : null}
        <p
          className={cn(
            'm-0 text-[15px] leading-tight font-semibold tracking-[-0.005em] text-balance',
            state.title ? 'mt-1.5' : null,
          )}
        >
          {state.badge}
        </p>
        {state.line ? (
          <p className="m-0 mt-1 text-[12.5px] leading-[1.35] text-pretty text-[#5e5145]">
            {state.line}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function NarratorPanel({
  state,
  onClose,
  onConfirm,
}: {
  state: NarratorState
  onClose: () => void
  onConfirm: () => void
}) {
  if (!state.open) return null
  return (
    <div
      role="dialog"
      aria-label={`${state.name || 'Kira'} dialogue`}
      data-kira-dialogue
      className={cn(
        'fixed inset-x-[max(18px,8vw)] bottom-6 z-[58] mx-auto max-w-3xl rounded-[26px] border border-white/75 bg-[#fff7e8]/96 px-6 pt-8 pb-5 font-sans text-[#2b2620] shadow-[0_22px_60px_rgba(35,25,18,0.26)] backdrop-blur-md transition duration-220 max-[640px]:inset-x-4 max-[640px]:bottom-4 max-[640px]:px-5 max-[640px]:pt-7',
        state.open ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-5 opacity-0',
      )}
    >
      <div className="absolute -top-3 left-6 rounded-full bg-[#ffd15f] px-3 py-1 text-xs font-extrabold text-[#402a10] shadow-[0_8px_18px_rgba(64,42,16,0.18)]">
        {state.name}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-lg leading-none text-[#4c4034]/72 transition hover:bg-black/10 hover:text-[#2b2620] active:scale-95"
      >
        ×
      </button>
      <p className="m-0 min-h-[3lh] text-[17px] leading-[1.65] font-semibold">{state.text}</p>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-full bg-[#ff8a5c] px-4 py-2 text-sm font-extrabold text-white shadow-[0_10px_20px_rgba(255,120,66,0.24)] transition hover:-translate-y-px hover:bg-[#ff7842] active:translate-y-0"
        >
          {state.cta} <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  )
}

function ObjectPeekPopover({
  state,
  onAdvance,
}: {
  state: ObjectPeekState
  onAdvance: () => void
}) {
  if (!state.open) return null
  return (
    <div
      data-object-peek
      style={{ left: state.x, top: state.y }}
      className={cn(
        'fixed z-[56] w-[250px] -translate-x-1/2 -translate-y-full rounded-[18px] border border-white/76 bg-white/94 p-4 font-sans text-[#2b2620] shadow-[0_16px_40px_rgba(32,24,18,0.2)] backdrop-blur-md transition duration-180',
        state.open
          ? 'translate-y-[calc(-100%-12px)] opacity-100'
          : 'pointer-events-none translate-y-[calc(-100%-4px)] opacity-0',
      )}
    >
      <p className="m-0 text-[10px] font-extrabold tracking-[0.16em] text-[#7b6b59] uppercase">
        {state.eyebrow}
      </p>
      <h3 className="mt-1 mb-0 text-lg font-extrabold">{state.title}</h3>
      <p className="mt-2 mb-3 text-sm leading-[1.45] text-[#5d5146]">{state.meaning}</p>
      <button
        type="button"
        onClick={onAdvance}
        className="rounded-full bg-[#2f2a24] px-3 py-2 text-xs font-extrabold text-white transition hover:bg-[#3a342b] active:scale-95"
      >
        Find out more <span aria-hidden>→</span>
      </button>
    </div>
  )
}

function ObjectPickupPanel({
  state,
  onClose,
  onPrimary,
  onSecondary,
}: {
  state: ObjectPickupState
  onClose: () => void
  onPrimary: () => void
  onSecondary: () => void
}) {
  if (!state.open) return null
  return (
    <div
      role="dialog"
      aria-label={`${state.name || 'Kira'} detail`}
      data-object-pickup
      data-kira-dialogue
      className={cn(
        'fixed inset-x-[max(18px,8vw)] bottom-6 z-[58] mx-auto max-w-3xl rounded-[26px] border border-white/75 bg-[#fff7e8]/96 px-6 pt-8 pb-5 font-sans text-[#2b2620] shadow-[0_22px_60px_rgba(35,25,18,0.26)] backdrop-blur-md transition duration-220 max-[640px]:inset-x-4 max-[640px]:bottom-4 max-[640px]:px-5 max-[640px]:pt-7',
        state.open ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-5 opacity-0',
      )}
    >
      <div className="absolute -top-3 left-6 rounded-full bg-[#ffd15f] px-3 py-1 text-xs font-extrabold text-[#402a10] shadow-[0_8px_18px_rgba(64,42,16,0.18)]">
        {state.name}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-lg leading-none text-[#4c4034]/72 transition hover:bg-black/10 hover:text-[#2b2620] active:scale-95"
      >
        ×
      </button>
      <p className="m-0 min-h-[3lh] text-[17px] leading-[1.65] font-semibold">{state.text}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onPrimary}
          className="rounded-full border border-[#ff8a5c]/35 bg-white/70 px-4 py-2 text-sm font-extrabold text-[#9b4a28] transition hover:-translate-y-px hover:bg-white active:translate-y-0"
        >
          {state.talkLabel}
        </button>
        <button
          type="button"
          onClick={onSecondary}
          className="rounded-full bg-[#ff8a5c] px-4 py-2 text-sm font-extrabold text-white shadow-[0_10px_20px_rgba(255,120,66,0.24)] transition hover:-translate-y-px hover:bg-[#ff7842] active:translate-y-0"
        >
          {state.detailLabel} {state.detailIcon ? <span aria-hidden>→</span> : null}
        </button>
      </div>
    </div>
  )
}

function narrationFor(target: Target, state: AnyEngine) {
  if (target.kind === 'kira') return KIRA_NARRATION
  const evidence = resolveElementEvidence(target, state?.profile)
  if (evidence.claimId && ['tree', 'flower', 'fruit'].includes(target.kind)) {
    const text = evidence.hasEvidence
      ? `${metaphorLine(evidence)} ${latestEvidenceLine(evidence, 110)}`
      : `${metaphorLine(evidence)} No noticings have landed here yet.`
    return { text, cta: 'Open' }
  }
  const sp = speciesIdOf(target)
  if (target.kind === 'tree') return TREE_NARRATION[sp] ?? { text: 'A tree.', cta: 'Open' }
  if (target.kind === 'flower') return FLOWER_NARRATION[sp] ?? { text: 'A flower.', cta: 'Open' }
  if (target.kind === 'fruit')
    return FRUIT_NARRATION[sp] ?? { text: 'A fruit — a skill ripening.', cta: 'Open' }
  return { text: '...', cta: 'Open' }
}

function randomOf<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)] as T
}

function cap(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
}

function speciesIdOf(target: Target) {
  const raw = target?.species
  if (typeof raw === 'string') return raw
  return String(raw?.id ?? raw?.species ?? '')
}

function speciesColor(target: Target) {
  return target?.species?.petal ?? 0xe0a0c0
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function typeDelay(ch: string) {
  if (ch === '.' || ch === '?' || ch === '!') return TYPER_STOP_MS
  if (ch === ',' || ch === ';' || ch === ':' || ch === '—') return TYPER_COMMA_MS
  return TYPER_BASE_MS
}

function smootherStep(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function themeForFacet(facetId: string | undefined) {
  const theme = facetId ? FACET_THEMES[facetId] : null
  return theme ? { accent: theme.accent, soft: theme.soft, ink: theme.ink } : null
}

function disposeGroup(group: THREE.Group) {
  if (group.parent) group.parent.remove(group)
  group.traverse((node: AnyEngine) => {
    node.geometry?.dispose?.()
    node.material?.dispose?.()
  })
}
