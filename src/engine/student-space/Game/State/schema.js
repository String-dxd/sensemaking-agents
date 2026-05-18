/**
 * Schema contract for persistent state slices.
 *
 * Mirrors the lenient-merge posture from DESIGN.md §"Schema contract":
 *   - unknown keys → warn-and-drop
 *   - missing keys → fall back to defaults
 *   - type mismatches → warn-and-default
 *   - never throws on a corrupted blob; the app should always boot
 *
 * `SCHEMA_VERSION` is the persistence-level version. When it changes, write a
 * `migrateV{n}toV{n+1}(snapshot)` function and call it in Persistence.load()
 * before passing the slice through the merge functions below.
 */

import { isCanonicalClaim } from '../Data/vipsTaxonomy.js'

export const SCHEMA_VERSION = 1

// ── Allowed enums ───────────────────────────────────────────────────────────
const CONFIDENCE      = new Set(['low', 'medium', 'high'])
const MOOD_EMOTION    = new Set(['joy', 'sadness', 'anger', 'fear', 'disgust', 'anxiety', 'envy', 'embarrassment', 'ennui'])
const MOOD_INTENSITY  = new Set([1, 2, 3, 4])
const MOOD_CAUSE      = new Set(['school', 'friends', 'family', 'social', 'body', 'achievement', 'uncertainty', 'alone', 'gratitude', 'other'])
const CAPTURE_KIND    = new Set(['ask', 'photo', 'trajectory'])
const LETTER_KEYS     = new Set(['id', 'from', 'subject', 'body', 'sentAt', 'read'])
const EVENT_KINDS     = new Set(['class', 'cca', 'note'])
const FACET_IDS       = new Set(['values', 'interests', 'personality', 'skills'])

// First-run ceremony — see DESIGN.md §"First-run ceremony" + plan
// /Users/jeongwondo/.claude/plans/steady-conjuring-panda.md
export const ONBOARDING_STAGES = new Set([
    'pending', 'login', 'greeting',
    'egg-color', 'egg-name', 'egg-hatch',
    'first-chat', 'first-mood',
    'first-grow', 'tree-narration', 'closing',
    'done',
])
// 6 swatch ids exposed to the picker (lilac dropped to keep a tidy 2×3 grid;
// the seventh species still reachable via the debug BirdPicker).
export const EGG_COLOR_IDS = new Set(['flame', 'ember', 'regent', 'emerald', 'satin', 'twilight'])
// All 7 species remain valid for `profile.identity.companionSpecies` — the
// picker exposes 6, but the schema must accept what BirdPicker can write.
export const COMPANION_SPECIES_IDS = new Set(['flame', 'ember', 'regent', 'emerald', 'satin', 'twilight', 'lilac'])

// ── Helpers ────────────────────────────────────────────────────────────────
const warn = (msg) => console.warn(`[schema] ${msg}`)
const isString = (v) => typeof v === 'string'
const isBool   = (v) => typeof v === 'boolean'
const isISO    = (v) => isString(v) && !isNaN(Date.parse(v))

// ── Quote ──────────────────────────────────────────────────────────────────
/**
 * @typedef {Object} Quote
 * @property {string} id
 * @property {string} text
 * @property {string} canonicalClaimId   one of VIPS_TAXONOMY entries
 * @property {'low'|'medium'|'high'} confidence
 * @property {string|null} sourceCaptureId   may match a row in Captures or MoodPins
 * @property {string} createdAt   ISO
 */
const defaultQuote = () => ({
    id:               '',
    text:             '',
    canonicalClaimId: null,
    confidence:       'medium',
    sourceCaptureId:  null,
    createdAt:        new Date(0).toISOString(),
})

const KNOWN_QUOTE_KEYS = new Set(['id', 'text', 'canonicalClaimId', 'confidence', 'sourceCaptureId', 'createdAt'])

export function mergeQuote(raw, ctx = 'quote')
{
    if(!raw || typeof raw !== 'object')
    {
        warn(`${ctx}: not an object, defaulting`); return defaultQuote()
    }
    const out = defaultQuote()
    for(const k of Object.keys(raw))
    {
        if(!KNOWN_QUOTE_KEYS.has(k)) { warn(`${ctx}: dropping unknown key "${k}"`); continue }
        const v = raw[k]
        if(k === 'canonicalClaimId')
        {
            if(v === null || v === undefined) { out.canonicalClaimId = null; continue }
            if(!isString(v) || !isCanonicalClaim(v))
            {
                warn(`${ctx}.canonicalClaimId not in taxonomy: "${v}"`); continue
            }
        }
        if(k === 'confidence' && !CONFIDENCE.has(v))     { warn(`${ctx}.confidence invalid`); continue }
        if(k === 'text'       && !isString(v))           { warn(`${ctx}.text not string`);   continue }
        if(k === 'id'         && !isString(v))           { warn(`${ctx}.id not string`);     continue }
        if(k === 'createdAt'  && !isISO(v))              { warn(`${ctx}.createdAt invalid`); continue }
        if(k === 'sourceCaptureId' && v !== null && !isString(v))
        {
            warn(`${ctx}.sourceCaptureId not string`); continue
        }
        out[k] = v
    }
    // Quotes without an id can't survive — `forgetQuote` needs to find them.
    if(!out.id) out.id = `q_${Math.random().toString(36).slice(2, 10)}`
    return out
}

// ── Profile facet ──────────────────────────────────────────────────────────
/**
 * @typedef {Object} ProfileFacet
 * @property {'values'|'interests'|'personality'|'skills'} id
 * @property {string} paragraph
 * @property {string} openQuestion
 * @property {string} lastRefinedAt   ISO
 * @property {Quote[]} quotes   mixed across all claims within this facet
 */
const defaultProfileFacet = (id) => ({
    id,
    paragraph:     '',
    openQuestion:  '',
    lastRefinedAt: new Date(0).toISOString(),
    quotes:        [],
})

export function mergeProfileFacet(raw, facetId, ctx = `facet.${facetId}`)
{
    const out = defaultProfileFacet(facetId)
    if(!raw || typeof raw !== 'object') return out
    if(isString(raw.paragraph))     out.paragraph     = raw.paragraph
    if(isString(raw.openQuestion))  out.openQuestion  = raw.openQuestion
    if(isISO(raw.lastRefinedAt))    out.lastRefinedAt = raw.lastRefinedAt
    if(Array.isArray(raw.quotes))   out.quotes        = raw.quotes.map((q, i) => mergeQuote(q, `${ctx}.quotes[${i}]`))
    return out
}

export function mergeProfile(raw)
{
    const out = {}
    for(const id of FACET_IDS) out[id] = mergeProfileFacet(raw?.[id], id)
    return out
}

// ── Mood pin ───────────────────────────────────────────────────────────────
/**
 * @typedef {Object} MoodPin
 * @property {string} id, createdAt, entryDate
 * @property {string} emotion   one of the IO2 emotions
 * @property {1|2|3|4} intensity
 * @property {string|null} cause
 * @property {string|null} note
 */
const defaultMoodPin = () => ({
    id:        '',
    createdAt: new Date(0).toISOString(),
    entryDate: '1970-01-01',
    emotion:   'joy',
    intensity: 1,
    cause:     null,
    note:      null,
})

const KNOWN_PIN_KEYS = new Set(['id', 'createdAt', 'entryDate', 'emotion', 'intensity', 'cause', 'note'])

export function mergeMoodPin(raw, ctx = 'pin')
{
    if(!raw || typeof raw !== 'object') { warn(`${ctx}: not an object`); return null }
    const out = defaultMoodPin()
    for(const k of Object.keys(raw))
    {
        if(!KNOWN_PIN_KEYS.has(k)) { warn(`${ctx}: dropping unknown key "${k}"`); continue }
        const v = raw[k]
        if(k === 'emotion'   && !MOOD_EMOTION.has(v))   { warn(`${ctx}.emotion invalid`);   continue }
        if(k === 'intensity' && !MOOD_INTENSITY.has(v)) { warn(`${ctx}.intensity invalid`); continue }
        if(k === 'cause'     && v !== null && !MOOD_CAUSE.has(v)) { warn(`${ctx}.cause invalid`); continue }
        out[k] = v
    }
    if(!out.id) return null   // refuse to hydrate an id-less pin; forget action would fail
    return out
}

// ── Capture (ask / photo) ──────────────────────────────────────────────────
const defaultCapture = () => ({
    id:        '',
    createdAt: new Date(0).toISOString(),
    entryDate: '1970-01-01',
    kind:      'ask',
})

const KNOWN_CAPTURE_KEYS = new Set([
    'id', 'createdAt', 'entryDate', 'kind', 'text', 'prompt',
    'dataUrl', 'caption',
    // Forward-additive reframe + dive-deeper chat (Open chat v1.2):
    'reframe', 'thread',
    // Path Finder — trajectory captures carry { throughLine, bearings }.
    'trajectory',
    // Sprout dimension picked by the student post-capture (values /
    // interests / personality / skills). Drives sprout species.
    'dimension',
    // Optional finer-grained claim id from the VIPS taxonomy (e.g.,
    // 'values.contribution', 'skills.communication'). Recorded for
    // future analysis + display; species is still derived from the
    // top-level dimension above so this is purely additive.
    'subClaimId',
])
const CAPTURE_DIMENSIONS = new Set(['values', 'interests', 'personality', 'skills'])

const TRAJECTORY_BEARING_KEYS = new Set(['id', 'title', 'prompt', 'traitTags', 'ecgTags', 'risk'])

function mergeTrajectoryBearing(raw, ctx)
{
    if(!raw || typeof raw !== 'object') return null
    const out = { id: '', title: '', prompt: '', traitTags: [], ecgTags: [], risk: '' }
    for(const k of Object.keys(raw))
    {
        if(!TRAJECTORY_BEARING_KEYS.has(k)) { warn(`${ctx}: dropping unknown key "${k}"`); continue }
        const v = raw[k]
        if(k === 'traitTags' || k === 'ecgTags')
        {
            if(!Array.isArray(v)) { warn(`${ctx}.${k} not array`); continue }
            out[k] = v.filter((x) => typeof x === 'string')
            continue
        }
        if(typeof v !== 'string') { warn(`${ctx}.${k} not string`); continue }
        out[k] = v
    }
    if(!out.title) return null
    return out
}

function mergeTrajectory(raw, ctx)
{
    if(!raw || typeof raw !== 'object') return null
    const out = { throughLine: '', bearings: [] }
    if(typeof raw.throughLine === 'string') out.throughLine = raw.throughLine
    if(Array.isArray(raw.bearings))
    {
        out.bearings = raw.bearings
            .map((b, i) => mergeTrajectoryBearing(b, `${ctx}.bearings[${i}]`))
            .filter(Boolean)
    }
    if(!out.throughLine && out.bearings.length === 0) return null
    return out
}

const REFRAME_KEYS = new Set(['headline', 'highlightPhrase', 'themes', 'needs', 'moods', 'edited'])

function mergeReframe(raw, ctx)
{
    if(!raw || typeof raw !== 'object') return null
    const out = {}
    for(const k of Object.keys(raw))
    {
        if(!REFRAME_KEYS.has(k)) { warn(`${ctx}.reframe: dropping unknown key "${k}"`); continue }
        const v = raw[k]
        if((k === 'themes' || k === 'needs' || k === 'moods'))
        {
            if(!Array.isArray(v)) { warn(`${ctx}.reframe.${k} not array`); continue }
            out[k] = v.filter((x) => typeof x === 'string')
            continue
        }
        if(k === 'edited') { out[k] = !!v; continue }
        if(typeof v !== 'string') { warn(`${ctx}.reframe.${k} not string`); continue }
        out[k] = v
    }
    return out
}

function mergeThread(raw, ctx)
{
    if(!Array.isArray(raw)) return null
    return raw
        .map((m, i) =>
        {
            if(!m || typeof m !== 'object') { warn(`${ctx}.thread[${i}] not object`); return null }
            const role = m.role === 'kira' || m.role === 'you' ? m.role : null
            const text = typeof m.text === 'string' ? m.text : null
            if(!role || text === null) { warn(`${ctx}.thread[${i}] missing role/text`); return null }
            return { role, text }
        })
        .filter(Boolean)
}

export function mergeCapture(raw, ctx = 'capture')
{
    if(!raw || typeof raw !== 'object') { warn(`${ctx}: not an object`); return null }
    const out = defaultCapture()
    for(const k of Object.keys(raw))
    {
        if(!KNOWN_CAPTURE_KEYS.has(k)) { warn(`${ctx}: dropping unknown key "${k}"`); continue }
        const v = raw[k]
        if(k === 'kind' && !CAPTURE_KIND.has(v)) { warn(`${ctx}.kind invalid`); continue }
        if(k === 'dimension' && v !== null && !CAPTURE_DIMENSIONS.has(v)) { warn(`${ctx}.dimension invalid: "${v}"`); continue }
        if(k === 'subClaimId' && v !== null && !isCanonicalClaim(v)) { warn(`${ctx}.subClaimId not in taxonomy: "${v}"`); continue }
        if(k === 'reframe')
        {
            const rf = mergeReframe(v, ctx)
            if(rf) out.reframe = rf
            continue
        }
        if(k === 'thread')
        {
            const th = mergeThread(v, ctx)
            if(th && th.length > 0) out.thread = th
            continue
        }
        if(k === 'trajectory')
        {
            const tj = mergeTrajectory(v, ctx)
            if(tj) out.trajectory = tj
            continue
        }
        out[k] = v
    }
    if(!out.id) return null
    return out
}

// ── Teacher letter ─────────────────────────────────────────────────────────
const defaultLetter = () => ({
    id:      '',
    from:    '',
    subject: '',
    body:    '',
    sentAt:  new Date(0).toISOString(),
    read:    false,
})

export function mergeTeacherLetter(raw, ctx = 'letter')
{
    if(!raw || typeof raw !== 'object') { warn(`${ctx}: not an object`); return null }
    const out = defaultLetter()
    for(const k of Object.keys(raw))
    {
        if(!LETTER_KEYS.has(k)) { warn(`${ctx}: dropping unknown key "${k}"`); continue }
        const v = raw[k]
        if(k === 'read' && !isBool(v)) { warn(`${ctx}.read not bool`); continue }
        if(k === 'sentAt' && !isISO(v)) { warn(`${ctx}.sentAt invalid`); continue }
        out[k] = v
    }
    if(!out.id) return null
    return out
}

// ── Calendar event ─────────────────────────────────────────────────────────
const defaultEvent = () => ({
    id:    '',
    label: '',
    kind:  'note',
    date:  '1970-01-01',
})

const KNOWN_EVENT_KEYS = new Set(['id', 'label', 'kind', 'date'])

export function mergeCalendarEvent(raw, ctx = 'event')
{
    if(!raw || typeof raw !== 'object') { warn(`${ctx}: not an object`); return null }
    const out = defaultEvent()
    for(const k of Object.keys(raw))
    {
        if(!KNOWN_EVENT_KEYS.has(k)) { warn(`${ctx}: dropping unknown key "${k}"`); continue }
        const v = raw[k]
        if(k === 'kind' && !EVENT_KINDS.has(v)) { warn(`${ctx}.kind invalid`); continue }
        out[k] = v
    }
    if(!out.id) return null
    return out
}

// ── Sprout ─────────────────────────────────────────────────────────────────
/**
 * @typedef {Object} Sprout
 * @property {string} id
 * @property {string} createdAt ISO
 * @property {string} entryDate YYYY-MM-DD
 * @property {'tree'} species v1 fixed to tree; v2 widens to flower/fruit
 * @property {string} treeSpecies engine tree variety (oak, cherry, ...)
 * @property {number} placementSeed deterministic seed → island position
 * @property {number} threshold captures required to mark ready
 * @property {number} count captures attached so far
 * @property {boolean} readyToBloom threshold crossed, awaiting student tap
 * @property {string|null} bloomedAt ISO; non-null once bloomed (sprout is then removed from active list anyway)
 * @property {string[]} captureRefs capture/mood ids contributing to this sprout
 */
// Species widened in v1.1: 'pending' is the holding state until the
// student tags the sprout's first capture; the picker then maps the
// dimension → species (value=tree, interest=flower, personality=
// butterfly, skill=fruit). Tree variety (oak/cherry) cycles within
// the 'tree' species.
const SPROUT_SPECIES = new Set(['pending', 'tree', 'flower', 'butterfly', 'fruit'])
const SPROUT_TREE_SPECIES = new Set(['oak', 'cherry'])  // matches Tree.js PLACEMENTS
const SPROUT_DIMENSIONS = new Set(['values', 'interests', 'personality', 'skills'])

const defaultSprout = () => ({
    id:            '',
    createdAt:     new Date(0).toISOString(),
    entryDate:     '1970-01-01',
    species:       'pending',
    treeSpecies:   'oak',
    placementSeed: 0,
    threshold:     3,
    count:         0,
    readyToBloom:  false,
    bloomedAt:     null,
    captureRefs:   [],
    dimension:     null,
    // Explicit student-set position (pick-and-plant). When null, the view
    // falls back to seededAngleAndRadius(placementSeed). Plain object —
    // not frozen — because the slice may mutate it in place via
    // setSproutPosition.
    position:      null,
})

const KNOWN_SPROUT_KEYS = new Set([
    'id', 'createdAt', 'entryDate', 'species', 'treeSpecies', 'dimension',
    'placementSeed', 'threshold', 'count', 'readyToBloom', 'bloomedAt', 'captureRefs',
    'position',
])

/**
 * Validate a `{ x, z }` position payload. Returns the cleaned position
 * or `null` for any invalid shape. Used by both the schema merger and
 * the slice's `setSproutPosition` / `setBloomedPosition` methods so the
 * two paths can't drift.
 */
export function coercePosition(raw)
{
    if(raw === null || raw === undefined) return null
    if(typeof raw !== 'object') return null
    const x = raw.x
    const z = raw.z
    if(typeof x !== 'number' || typeof z !== 'number') return null
    if(!Number.isFinite(x) || !Number.isFinite(z)) return null
    return { x, z }
}

export function mergeSprout(raw, ctx = 'sprout')
{
    if(!raw || typeof raw !== 'object') { warn(`${ctx}: not an object`); return null }
    const out = defaultSprout()
    for(const k of Object.keys(raw))
    {
        if(!KNOWN_SPROUT_KEYS.has(k)) { warn(`${ctx}: dropping unknown key "${k}"`); continue }
        const v = raw[k]
        if(k === 'species' && !SPROUT_SPECIES.has(v)) { warn(`${ctx}.species invalid: "${v}"`); continue }
        if(k === 'treeSpecies' && !SPROUT_TREE_SPECIES.has(v)) { warn(`${ctx}.treeSpecies invalid: "${v}"`); continue }
        if(k === 'dimension' && v !== null && !SPROUT_DIMENSIONS.has(v)) { warn(`${ctx}.dimension invalid: "${v}"`); continue }
        if((k === 'placementSeed' || k === 'threshold' || k === 'count') && typeof v !== 'number') { warn(`${ctx}.${k} not number`); continue }
        if(k === 'readyToBloom' && !isBool(v)) { warn(`${ctx}.readyToBloom not bool`); continue }
        if(k === 'bloomedAt' && v !== null && !isISO(v)) { warn(`${ctx}.bloomedAt invalid`); continue }
        if(k === 'captureRefs')
        {
            if(!Array.isArray(v)) { warn(`${ctx}.captureRefs not array`); continue }
            out.captureRefs = v.filter((x) => typeof x === 'string')
            continue
        }
        if(k === 'position')
        {
            const coerced = coercePosition(v)
            if(coerced === null && v !== null && v !== undefined)
            {
                warn(`${ctx}.position invalid shape; defaulting to null`)
            }
            out.position = coerced
            continue
        }
        if((k === 'id' || k === 'entryDate' || k === 'createdAt') && !isString(v)) { warn(`${ctx}.${k} not string`); continue }
        out[k] = v
    }
    if(!out.id) return null
    return out
}

// ── Array helpers ──────────────────────────────────────────────────────────
export const mergeArray = (raw, mergeFn, ctx) =>
    (Array.isArray(raw) ? raw.map((r, i) => mergeFn(r, `${ctx}[${i}]`)).filter(Boolean) : [])

// ── Onboarding ─────────────────────────────────────────────────────────────
/**
 * @typedef {Object} OnboardingSnapshot
 * @property {string}      stage           one of ONBOARDING_STAGES
 * @property {string|null} eggColorId      one of EGG_COLOR_IDS, or null
 * @property {string|null} companionName   trimmed ≤32 chars, or null
 * @property {string|null} completedAt     ISO, or null while in-flight
 * @property {string|null} firstMoodPinId  points into moodPins.pins[]
 * @property {number}      version         per-slice version (currently 1)
 */
export const defaultOnboarding = () => ({
    stage:          'pending',
    eggColorId:     null,
    companionName:  null,
    completedAt:    null,
    firstMoodPinId: null,
    version:        1,
})

const KNOWN_ONBOARDING_KEYS = new Set([
    'stage', 'eggColorId', 'companionName', 'completedAt', 'firstMoodPinId', 'version',
])

export function mergeOnboarding(raw, ctx = 'onboarding')
{
    if(!raw || typeof raw !== 'object') return defaultOnboarding()
    const out = defaultOnboarding()
    for(const k of Object.keys(raw))
    {
        if(!KNOWN_ONBOARDING_KEYS.has(k)) { warn(`${ctx}: dropping unknown key "${k}"`); continue }
        const v = raw[k]
        if(k === 'stage')
        {
            if(!ONBOARDING_STAGES.has(v)) { warn(`${ctx}.stage invalid: "${v}"`); continue }
        }
        if(k === 'eggColorId')
        {
            if(v !== null && !EGG_COLOR_IDS.has(v)) { warn(`${ctx}.eggColorId invalid: "${v}"`); continue }
        }
        if(k === 'companionName')
        {
            if(v !== null && (!isString(v) || v.trim().length === 0))
            {
                warn(`${ctx}.companionName not a non-empty string`); continue
            }
        }
        if(k === 'completedAt')
        {
            if(v !== null && !isISO(v)) { warn(`${ctx}.completedAt not ISO`); continue }
        }
        if(k === 'firstMoodPinId')
        {
            if(v !== null && !isString(v)) { warn(`${ctx}.firstMoodPinId not string`); continue }
        }
        if(k === 'version' && v !== 1) { warn(`${ctx}.version unknown`); continue }
        out[k] = v
    }
    return out
}
