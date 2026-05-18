/**
 * Pure-function reply generator for the dive-deeper chat. Mocks Kira's voice
 * with four behavioural branches, ordered by precedence:
 *
 *   1. turn 0           → acknowledge (~6 variants)
 *   2. <8 words         → ask-back (~8 variants)        [unless turn ≥ 4]
 *   3. turn ≥ 4         → soft-close "want to log this?" (~4 variants)
 *   4. else             → surface-name (~8 reflective templates)
 *
 * kiraReplyFor({ studentText, turnIndex }) → string
 *
 * Voice rules (locked in docs/companion-bird.md): observational, no advice,
 * no double-question, no AI disclaimer, no emoji. Templates here are
 * hand-written to that bar; the picker hashes the student's text so the
 * same input produces the same reply on replay.
 */

const ACKNOWLEDGE = [
    "I'm here. Say more.",
    "Okay — I'm listening.",
    "I hear you. Keep going.",
    "Got it. What else is in this?",
    "Yeah. Tell me the next bit.",
    "I'm with you. Go on.",
]

const ASK_BACK = [
    "What's underneath that, do you think?",
    "What part feels heaviest?",
    "Say more about that.",
    "Where did that land for you?",
    "What did you notice in the moment?",
    "What did you want to happen instead?",
    "What does that sit closest to — relief, frustration, tiredness?",
    "If you stretched the sentence out, what comes next?",
]

const SOFT_CLOSE = [
    "We've laid down a lot. Want to log this?",
    "That feels like a full thought. Want to log it?",
    "Good place to stop, if you want. Log this?",
    "Enough has landed here. Want to log this and pick it up later?",
]

// Theme detection for surface-name. Same group order as
// reframeHeuristics — keeps the two pure functions in sync.
const SURFACE_GROUPS = [
    { id: 'school',  words: ['school', 'exam', 'test', 'hw', 'homework'],         label: 'school' },
    { id: 'sleep',   words: ['sleep', 'tired', 'exhausted', 'sleepy'],            label: 'sleep' },
    { id: 'friend',  words: ['friend', 'classmate', 'hang', 'hangout'],           label: 'friends' },
    { id: 'family',  words: ['family', 'mom', 'dad', 'sister', 'brother'],        label: 'family' },
    { id: 'play',    words: ['game', 'play', 'fun', 'drawing'],                   label: 'play' },
    { id: 'scroll',  words: ['phone', 'scroll', 'tiktok', 'instagram'],           label: 'the phone' },
    { id: 'ennui',   words: ['sad', 'down', 'empty', 'bored'],                    label: 'flatness' },
    { id: 'anxiety', words: ['stress', 'stressed', 'worried', 'anxious'],         label: 'the worry' },
    { id: 'joy',     words: ['happy', 'good', 'yay', 'great'],                    label: 'the brightness' },
    { id: 'anger',   words: ['mad', 'angry', 'annoyed', 'pissed'],                label: 'the anger' },
    { id: 'embarr',  words: ['sorry', 'shame', 'embarrass'],                      label: 'the embarrassment' },
    { id: 'envy',    words: ['jealous', 'envy', 'unfair'],                        label: 'the unfairness' },
]

// Templates that slot {theme}. Observational, no advice, no
// double-question.
const SURFACE_TEMPLATES = [
    "It sounds like {theme} is doing a lot of the weight here.",
    "I keep noticing {theme} threaded through this.",
    "The thing that keeps coming up is {theme}.",
    "There's a lot of {theme} in what you just said.",
    "{theme} seems to be at the center of this one.",
    "If I had to name the loudest thread, it's {theme}.",
    "What you're describing reads like {theme} more than anything else.",
    "I think {theme} is what this is mostly about.",
]

// Cap the surface-name fallback so a transcript with no detectable theme
// still gets a thoughtful reply rather than a templated blank.
const NO_THEME_FALLBACK = [
    "I'm sitting with that. Say a bit more if you want.",
    "That's a real thing to be holding. What else is in it?",
    "I hear you. Where does that land?",
]

function hashString(s)
{
    let h = 5381
    for(let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return Math.abs(h)
}

function normalize(raw)
{
    return (raw || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

function wordCount(raw)
{
    const n = normalize(raw)
    if(!n) return 0
    return n.split(' ').filter(Boolean).length
}

function detectSurface(tokens)
{
    let best = null
    let bestHits = 0
    for(const g of SURFACE_GROUPS)
    {
        let hits = 0
        for(const t of tokens)
        {
            for(const w of g.words)
            {
                if(t === w || t.startsWith(w)) { hits += 1; break }
            }
        }
        if(hits > bestHits) { best = g; bestHits = hits }
    }
    return best
}

function pick(list, key)
{
    return list[hashString(key) % list.length]
}

export function kiraReplyFor({ studentText, turnIndex })
{
    const text = String(studentText || '')
    const turn = Number.isFinite(turnIndex) ? turnIndex : 0
    const key  = `${turn}|${text}`

    // turn 0 → acknowledge. The opening utterance always gets the same
    // gentle hello so the student knows Kira heard the first thing.
    if(turn === 0) return pick(ACKNOWLEDGE, key)

    // turn ≥ 4 → soft-close. Capped before the ask-back branch so a short
    // utterance late in the thread doesn't keep the loop spinning.
    if(turn >= 4) return pick(SOFT_CLOSE, key)

    // <8 words → ask-back. Open the field so the student says more.
    if(wordCount(text) < 8) return pick(ASK_BACK, key)

    // else → surface-name. Detect the loudest theme and slot it.
    const tokens = normalize(text).split(' ').filter(Boolean)
    const g = detectSurface(tokens)
    if(!g) return pick(NO_THEME_FALLBACK, key)
    const tpl = pick(SURFACE_TEMPLATES, key)
    return tpl.replace('{theme}', g.label)
}
