/**
 * Pure-function reframe over a free-form transcript. No LLM, no API. The
 * keyword groups below are the locked v1 surface; tweak with care because
 * the headline templates assume a {theme} / {need} slot pair derived from
 * those groups.
 *
 * reframeFor(text) → { headline, highlightPhrase, themes, needs, moods }
 *
 *   - themes:  ranked theme ids (top 2)        e.g. ['school', 'sleep']
 *   - needs:   matching need ids (top 2)       e.g. ['autonomy', 'rest']
 *   - moods:   ranked mood emotion ids (top 1–2) — matches MoodSheet EMOTIONS
 *   - headline: ≤3-sentence prose, observational, no advice, no
 *               double-question, no AI disclaimer.
 *   - highlightPhrase: the transcript sentence with most keyword hits.
 *
 * The function is deterministic — replays render the same reframe.
 */

// Each group lists alternates and the (theme, need) it surfaces. The first
// six groups are themes; the last six surface as moods. Order matters: ties
// in hit-count break by appearance order here.
const GROUPS = [
    { kind: 'theme', id: 'school',  need: 'autonomy',      words: ['school', 'exam', 'test', 'hw', 'homework'] },
    { kind: 'theme', id: 'sleep',   need: 'rest',          words: ['sleep', 'tired', 'exhausted', 'sleepy'] },
    { kind: 'theme', id: 'friend',  need: 'belonging',     words: ['friend', 'classmate', 'hang', 'hangout'] },
    { kind: 'theme', id: 'family',  need: 'belonging',     words: ['family', 'mom', 'dad', 'sister', 'brother', 'parents'] },
    { kind: 'theme', id: 'play',    need: 'agency',        words: ['game', 'play', 'fun', 'drawing', 'draw'] },
    { kind: 'theme', id: 'scroll',  need: 'stillness',     words: ['phone', 'scroll', 'tiktok', 'instagram'] },
    { kind: 'mood',  id: 'ennui',         words: ['sad', 'down', 'empty', 'bored'] },
    { kind: 'mood',  id: 'anxiety',       words: ['stress', 'stressed', 'worried', 'worry', 'anxious', 'anxiety'] },
    { kind: 'mood',  id: 'joy',           words: ['happy', 'good', 'yay', 'great'] },
    { kind: 'mood',  id: 'anger',         words: ['mad', 'angry', 'annoyed', 'pissed'] },
    { kind: 'mood',  id: 'embarrassment', words: ['sorry', 'shame', 'embarrass', 'embarrassed'] },
    { kind: 'mood',  id: 'envy',          words: ['jealous', 'envy', 'unfair'] },
]

const THEME_LABEL = {
    school: 'school',
    sleep:  'sleep',
    friend: 'friends',
    family: 'family',
    play:   'play',
    scroll: 'the phone',
}

const NEED_LABEL = {
    autonomy:  'autonomy',
    rest:      'rest',
    belonging: 'belonging',
    agency:    'agency',
    stillness: 'stillness',
}

// Each theme implies a mood when the transcript doesn't carry a direct
// mood word. Pulled from the canonical mood palette so the shapes/pills on
// the reframe page can fall back on a sensible emotional reading.
const THEME_IMPLIED_MOOD = {
    school: 'anxiety',
    sleep:  'ennui',
    friend: 'joy',
    family: 'joy',
    play:   'joy',
    scroll: 'anxiety',
}

// ~10 headline templates. Each slots {theme} and {need}. The voice is
// observational — no advice, no double-question, no AI disclaimer.
const TEMPLATES = [
    'It sounds like the loudest thing here is {theme}. That can read like a quiet ask for {need}.',
    "There's a lot of {theme} threaded through this. The underneath of it might be wanting {need}.",
    "The {theme} part feels like the volume's up. Sometimes that's a signal for {need}.",
    'I keep noticing {theme} in what you wrote. The room you might be trying to make is {need}.',
    'Most of this circles back to {theme}. Underneath, the ask reads like {need}.',
    'The thing that keeps coming up is {theme}. That can be the surface name for {need}.',
    'What you laid down is mostly {theme}. The shape under that often wants {need}.',
    'The center of gravity here is {theme}. Sometimes that is how {need} shows up.',
    "It reads like {theme} is doing most of the talking. The quieter line underneath might be {need}.",
    "If I had to pick the dominant note, it's {theme}. Often the second note is {need}.",
]

const GENERIC_SOFT = "There isn't a single loud thread in this yet. Sometimes what we say first is just the noise on top of the thing underneath."

// Stable string hash so identical input picks the same template every time.
function hashString(s)
{
    let h = 5381
    for(let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return Math.abs(h)
}

// Lowercase + strip punctuation, keep word boundaries.
function normalize(raw)
{
    return (raw || '').toLowerCase().replace(/[^\p{L}\p{N}\s.?!]/gu, ' ').replace(/\s+/g, ' ').trim()
}

// Count hits per group. Whole-word match — "scrolling" counts for "scroll"
// only if "scroll" is a substring at a word boundary, which we approximate
// by matching against tokens that *start with* the keyword. Good enough at
// this scale; we're not building a stemmer.
function tally(tokens)
{
    const hits = new Map()
    for(const g of GROUPS) hits.set(g.id, 0)
    for(const t of tokens)
    {
        for(const g of GROUPS)
        {
            for(const w of g.words)
            {
                if(t === w || t.startsWith(w))
                {
                    hits.set(g.id, hits.get(g.id) + 1)
                    break
                }
            }
        }
    }
    return hits
}

function rank(hits, kind)
{
    return GROUPS
        .filter((g) => g.kind === kind && hits.get(g.id) > 0)
        .map((g) => ({ id: g.id, need: g.need, hits: hits.get(g.id) }))
        .sort((a, b) => b.hits - a.hits)
}

function pickHighlightPhrase(normText, originalText)
{
    // Split on sentence terminators. Use the normalised text for hit-counting
    // and the original (case-preserving) text for the surfaced phrase.
    const splitter = /[.?!]+/
    const normSentences = normText.split(splitter).map((s) => s.trim()).filter(Boolean)
    if(normSentences.length === 0) return originalText.trim()
    const origSentences = originalText.split(splitter).map((s) => s.trim()).filter(Boolean)

    let bestIdx = 0
    let bestHits = -1
    normSentences.forEach((s, i) =>
    {
        const tokens = s.split(' ')
        const hits = tally(tokens)
        const total = [...hits.values()].reduce((a, b) => a + b, 0)
        if(total > bestHits)
        {
            bestHits = total
            bestIdx = i
        }
    })
    return origSentences[bestIdx] || origSentences[0] || originalText.trim()
}

export function reframeFor(text)
{
    const original = String(text || '')
    const norm = normalize(original)
    const tokens = norm.split(' ').filter(Boolean)

    const hits = tally(tokens)
    const themesRanked = rank(hits, 'theme').slice(0, 2)
    const moodsRanked  = rank(hits, 'mood').slice(0, 2)

    const themes = themesRanked.map((t) => t.id)
    const needs  = themesRanked.map((t) => t.need)

    // Moods: direct keyword hits first, then theme-implied moods filling up
    // to two. Dedup so a theme that implies a mood already named directly
    // doesn't double up. This is how the reframe surfaces emotional colour
    // for transcripts that name a topic but not an emotion ("math test +
    // tired" → anxiety + ennui).
    const moods = []
    const seen = new Set()
    for(const m of moodsRanked)
    {
        if(seen.has(m.id)) continue
        seen.add(m.id); moods.push(m.id)
    }
    for(const t of themesRanked)
    {
        if(moods.length >= 2) break
        const implied = THEME_IMPLIED_MOOD[t.id]
        if(!implied || seen.has(implied)) continue
        seen.add(implied); moods.push(implied)
    }

    const highlightPhrase = pickHighlightPhrase(norm, original)

    let headline
    if(themesRanked.length === 0)
    {
        headline = GENERIC_SOFT
    }
    else
    {
        // The {theme} slot reads top-1 theme. The {need} slot reads the
        // second theme's need when there is one — pairs naturally surface
        // contrasts ("school / rest" beats "school / autonomy" in a single
        // transcript). Fall back to the top theme's own need when there's
        // only one.
        const t = themesRanked[0]
        const need = themesRanked[1] ? themesRanked[1].need : t.need
        const tpl = TEMPLATES[hashString(norm) % TEMPLATES.length]
        headline = tpl
            .replace('{theme}', THEME_LABEL[t.id] || t.id)
            .replace('{need}',  NEED_LABEL[need] || need)
    }

    return { headline, highlightPhrase, themes, needs, moods }
}
