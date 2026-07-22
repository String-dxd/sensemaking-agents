/**
 * Onboarding copy registry. Single source of truth for every user-facing
 * string in the ceremony. Voice-checked against docs/companion-bird.md:
 * observation-first, no exclamation marks, no "Great job!", no advice
 * unprompted, no emoji, ≤ ~80 chars per Kira line.
 */

export const ONBOARDING_COPY = Object.freeze({

    login: {
        wordmark:   'My World',
        tagline:    'A place that listens',
        cta:        'Login with Edupass',
        connecting: 'Connecting',
        // The primary action keeps the "Edupass" wordmark for the
        // Singapore-school cue while the click routes to real WorkOS
        // auth (Google as the social provider in v0.2). The dummy
        // behaviour from before U2 has been removed; the button now
        // hits `/api/auth/sign-in` which delegates the OAuth dance to
        // the WorkOS hosted login page.
        actions:    {
            edupass: 'Sign in with Edupass',
            demo:    'Use a demo account',
        },
    },

    greeting: {
        hello: 'Hi, {name}.',
        sub:   "Let's hatch your companion.",
        hint:  'A bird who lives on your island.',
        cta:   "Let's begin.",
    },

    eggColor: {
        title:      'Pick a color.',
        sub:        "This will be your companion's plumage.",
        cta:        'Next',
        swatchAria: '{colorName} egg',
    },

    eggName: {
        title:       'Name your companion.',
        sub:         'Something short, like a nickname.',
        placeholder: 'A name',
        back:        'Back to color',
        cta:         'Hatch the egg',
    },

    eggHatch: {
        a11yNarration: 'The egg is hatching.',
    },

    firstMood: {
        title: 'How does it feel, starting this?',
        sub:   'Closest one is fine.',
    },

    kira: {
        // Onboarding dialogue (MyWorld demo transcripts, "Onboarding
        // dialogue" screens 1-3). Screen 1 is the intro line; screens 2-3
        // follow one CTA tap at a time, spoken by the companion in the
        // narrator panel while the talk clip plays. The final screen ends
        // the ceremony ("I'll let you get started").
        firstChatIntro:   "Hey, I'm {companionName}, thank you for bringing me into your world! Tap the mic and tell me what's on your mind. There's no right answer, no grades, or expectations. Let's chat.",
        firstChatInvite:  'How does it feel, starting this?',
        firstChatChatPrompt: 'Anything else on your mind?',
        firstChatChatMore:   "Take your time. I'm listening.",
        firstChatExplainer: [
            'Every time you share something with me, you help your world grow. Share things that connect with you. It could be things you care about, choices you made, people who matter; and trees, flowers, plants will come to life.',
            "Over time your world will start to look like you: reflecting what you care about, how you think, what you're like. I hope you enjoy your time here! I'll let you get started :)",
        ],
        // One-shot onboarding beats. Each line shows alone in the narrator
        // panel; the user advances with the CTA. No bubbles overlap.
        firstCaptureInvite: "Share something. Words, a voice note, a photo — anything.",
        bloomCelebrate:     'You bloomed the first flower just now.',
        termlyReveal:       "And there's more — we already captured a few things through your Termly Check-in.",
        closing:            "I hope you enjoy your time here. I'll let you get started.",
        firstMoodAck:     "Noticed. I'll hold that one.",
        firstMoodPatience:"No rush. I'll wait.",
    },

    firstChatActions: {
        chatMore: 'Next',
        feel:     "Let's go",
    },

    firstCapture: {
        prompt:  "What's on your mind right now?",
        cta:     'Start first capture',
    },

    bloomCelebrate: {
        cta:     'Tell me more',
    },

    termlyReveal: {
        cta:     'Continue',
    },

    closing: {
        cta:     'Begin',
    },
})

// Offline-only students for the dummy Edupass login. When the backend bridge
// is present, identity comes from the server snapshot instead.
export const OFFLINE_DEMO_STUDENTS = [
    { name: 'Alice Tan',       className: 'Sec 3B' },
    { name: 'Aisyah Rahim',  className: 'Sec 2A' },
    { name: 'Jia Hao',       className: 'Sec 3C' },
    { name: 'Priya Devi',    className: 'Sec 4B' },
    { name: 'Ethan Lim',     className: 'Sec 3A' },
    { name: 'Nur Liyana',    className: 'Sec 2B' },
]

// Egg color → species mapping. 6 entries; the 7th species (lilac) is dropped
// from the picker but still reachable via debug BirdPicker. Hex used for the
// SVG/3D egg shell tint. Display name appears in aria-label.
export const EGG_COLORS = [
    { id: 'flame',    hex: '#E63946', name: 'Coral'    },
    { id: 'masked',   hex: '#FF8C42', name: 'Orange'   },
    { id: 'regent',   hex: '#FFD23F', name: 'Gold'     },
    { id: 'emerald',  hex: '#3AAB48', name: 'Green'    },
    { id: 'satin',    hex: '#2C7DD2', name: 'Blue'     },
    { id: 'twilight', hex: '#5A4CB8', name: 'Indigo'   },
]

export const EGG_COLOR_BY_ID = Object.fromEntries(EGG_COLORS.map(c => [c.id, c]))
