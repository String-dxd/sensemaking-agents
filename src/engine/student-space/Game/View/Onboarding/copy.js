/**
 * Onboarding copy registry. Single source of truth for every user-facing
 * string in the ceremony. Voice-checked against docs/companion-bird.md:
 * observation-first, no exclamation marks, no "Great job!", no advice
 * unprompted, no emoji, ≤ ~80 chars per Kira line.
 */

export const ONBOARDING_COPY = Object.freeze({

    login: {
        wordmark:   'Student Space',
        tagline:    'A place that listens',
        cta:        'Login with Edupass',
        connecting: 'Connecting',
        demoNote:   'Demo login.',
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
        firstChatIntro:   "Hi. I'm {companionName}.",
        firstChatInvite:  'How does it feel, starting this?',
        firstChatChatPrompt: 'Anything else on your mind?',
        firstChatChatMore:   "Take your time. I'm listening.",
        // Three-beat explainer played when "Tell me more" is tapped. Each
        // line names a real mechanic: beat 1 = capture → sprout + V/I/P/S
        // picker, beat 2 = threshold → species bloom, beat 3 = pattern
        // surfacing + payoff. Lines run sequentially with the same gap
        // as firstChatChatMore → firstChatChatPrompt.
        firstChatExplainer: [
            "Each share starts a sprout. I'll ask what it was — a value, interest, a part of you, or a skill.",
            'Three of the same opens it — a tree, a flower, a butterfly, or berries.',
            "I watch what keeps showing up — and tell you. By then this place will look like you.",
        ],
        firstMoodAck:     "Noticed. I'll hold that one.",
        islandPlantSetup: "I'll plant something small. Watch the south slope.",
        islandPlantDone:  'There. A first thing.',
        islandSeeded:     'Some things were here before you. The island gathered them.',
        islandFinal:      'The more you share, the more it becomes yours.',
        firstMoodPatience:"No rush. I'll wait.",
    },

    firstChatActions: {
        chatMore: 'Tell me more',
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
    { id: 'masked',   hex: '#FF8C42', name: 'Orange'   },
    { id: 'regent',   hex: '#FFD23F', name: 'Gold'     },
    { id: 'emerald',  hex: '#3AAB48', name: 'Green'    },
    { id: 'satin',    hex: '#2C7DD2', name: 'Blue'     },
    { id: 'twilight', hex: '#5A4CB8', name: 'Indigo'   },
]

export const EGG_COLOR_BY_ID = Object.fromEntries(EGG_COLORS.map(c => [c.id, c]))
