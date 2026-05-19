/**
 * Onboarding copy registry. Single source of truth for every user-facing
 * string in the ceremony. Voice-checked against docs/companion-bird.md:
 * observation-first, no exclamation marks, no "Great job!", no advice
 * unprompted, no emoji, ≤ ~80 chars per Kira line.
 */

export const ONBOARDING_COPY = Object.freeze({

    login: {
        wordmark:   'Student Space',
        tagline:    'a place that listens',
        cta:        'Login with Edupass',
        connecting: 'Connecting',
        demoNote:   'Demo login.',
        actions:    {
            google:  'Sign in with Google',
            demo:    'Use a demo account',
            offline: 'Continue offline',
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
        firstChatIntro:   "Hi. I'm {companionName}.",
        firstChatInvite:  'How does it feel, starting this?',
        firstChatChatPrompt: 'Anything else on your mind?',
        firstChatChatMore:   "Take your time. I'm listening.",
        firstMoodAck:     "Noticed. I'll hold that one.",
        islandPlantSetup: "I'll plant something small. Watch the south slope.",
        islandPlantDone:  'There. A first thing.',
        islandSeeded:     'Some things were here before you. The island gathered them.',
        islandFinal:      'The more you share, the more it becomes yours.',
        firstMoodPatience:"No rush. I'll wait.",
    },

    firstChatActions: {
        chatMore: 'Chat a bit more',
        feel:     'Tell me how I feel now',
    },

    islandReveal: {
        bloomCta: 'Show me what just bloomed',
        treeCta:  'What else is here?',
        beginCta: 'Begin',
    },
})

// Offline-only students for the dummy Edupass login. When the backend bridge
// is present, identity comes from the server snapshot instead.
export const OFFLINE_DEMO_STUDENTS = [
    { name: 'Mei Tan',       className: 'Sec 3B' },
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
    { id: 'ember',    hex: '#F4791F', name: 'Orange'   },
    { id: 'regent',   hex: '#FFD23F', name: 'Gold'     },
    { id: 'emerald',  hex: '#3AAB48', name: 'Green'    },
    { id: 'satin',    hex: '#2C7DD2', name: 'Blue'     },
    { id: 'twilight', hex: '#5A4CB8', name: 'Indigo'   },
]

export const EGG_COLOR_BY_ID = Object.fromEntries(EGG_COLORS.map(c => [c.id, c]))
