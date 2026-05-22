// Ambient declarations for the engine onboarding copy registry. The runtime
// module is `copy.js` — these types let React surfaces (Greeting, SkipButton,
// OnboardingFlow, and step components) import the typed exports without a
// `@ts-expect-error`. Mirror the shape of the frozen object exactly so a
// drift between `.js` and `.d.ts` shows up as a missing-property error.

type GreetingCopy = {
  hello: string
  sub: string
  hint: string
  cta: string
}

type LoginCopy = {
  wordmark: string
  tagline: string
  cta: string
  connecting: string
  demoNote: string
  actions: { edupass: string; demo: string }
}

type EggColorCopy = {
  title: string
  sub: string
  cta: string
  swatchAria: string
}

type EggNameCopy = {
  title: string
  sub: string
  placeholder: string
  back: string
  cta: string
}

type EggHatchCopy = { a11yNarration: string }
type FirstMoodCopy = { title: string; sub: string }

type KiraCopy = {
  firstChatIntro: string
  firstChatInvite: string
  firstChatChatPrompt: string
  firstChatChatMore: string
  firstMoodAck: string
  islandPlantSetup: string
  islandPlantDone: string
  islandSeeded: string
  islandFinal: string
  firstMoodPatience: string
}

type FirstChatActionsCopy = { chatMore: string; feel: string }
type IslandRevealCopy = { bloomCta: string; treeCta: string; beginCta: string }

export const ONBOARDING_COPY: Readonly<{
  login: LoginCopy
  greeting: GreetingCopy
  eggColor: EggColorCopy
  eggName: EggNameCopy
  eggHatch: EggHatchCopy
  firstMood: FirstMoodCopy
  kira: KiraCopy
  firstChatActions: FirstChatActionsCopy
  islandReveal: IslandRevealCopy
}>

export const OFFLINE_DEMO_STUDENTS: ReadonlyArray<{ name: string; className: string }>

export const EGG_COLORS: ReadonlyArray<{
  id: 'flame' | 'ember' | 'regent' | 'emerald' | 'satin' | 'twilight'
  hex: string
  name: string
}>

export const EGG_COLOR_BY_ID: Readonly<Record<string, { id: string; hex: string; name: string }>>
