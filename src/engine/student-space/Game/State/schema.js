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
const LETTER_KEYS     = new Set(['id', 'from', 'subject', 'body', 'sentAt', 'read', 'prompt'])
const EVENT_KINDS     = new Set(['class', 'cca', 'note'])
const FACET_IDS       = new Set(['values', 'interests', 'personality', 'skills'])

// First-run ceremony — see DESIGN.md §"First-run ceremony" + plan
// /Users/jeongwondo/.claude/plans/steady-conjuring-panda.md
// `first-mood`, `first-grow`, `tree-narration` are kept in the accepted
// set so persisted snapshots from before the one-shot rework still load
// without losing the user mid-ceremony; OnboardingFlow's wake-up rules
// forward-map them to `first-capture` / `bloom-celebrate` / `termly-reveal`
// on the next render tick.
export const ONBOARDING_STAGES = new Set([
    'pending', 'login', 'greeting',
    'egg-color', 'egg-name', 'egg-hatch',
    'first-chat',
    'first-capture', 'bloom-celebrate', 'termly-reveal',
    'closing',
    'first-mood', 'first-grow', 'tree-narration',
    'done',
])
// 6 swatch ids exposed to the picker (lilac dropped to keep a tidy 2×3 grid;
// the seventh species still reachable via the debug BirdPicker).
export const EGG_COLOR_IDS = new Set(['flame', 'masked', 'regent', 'emerald', 'satin', 'twilight'])
// All 7 species remain valid for `profile.identity.companionSpecies` — the
// picker exposes 6, but the schema must accept what BirdPicker can write.
export const COMPANION_SPECIES_IDS = new Set(['flame', 'masked', 'regent', 'emerald', 'satin', 'twilight', 'lilac'])

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
 * @property {number|null} [backendTimelineEntryId] durable VIPS timeline row id
 * @property {number|null} [backendReflectionId] durable Mirror row id
 * @property {'confirmed'|'pending'|'forgotten'} [evidenceState]
 */
const defaultQuote = () => ({
    id:               '',
    text:             '',
    canonicalClaimId: null,
    confidence:       'medium',
    sourceCaptureId:  null,
    createdAt:        new Date(0).toISOString(),
    backendTimelineEntryId: null,
    backendReflectionId:    null,
    evidenceState:          'confirmed',
})

const EVIDENCE_STATES = new Set(['confirmed', 'pending', 'forgotten'])

const KNOWN_QUOTE_KEYS = new Set([
    'id', 'text', 'canonicalClaimId', 'confidence', 'sourceCaptureId', 'createdAt',
    'backendTimelineEntryId', 'backendReflectionId', 'evidenceState',
])

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
        if((k === 'backendTimelineEntryId' || k === 'backendReflectionId') && v !== null && !Number.isInteger(v))
        {
            warn(`${ctx}.${k} not integer`); continue
        }
        if(k === 'evidenceState' && !EVIDENCE_STATES.has(v)) { warn(`${ctx}.evidenceState invalid`); continue }
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
    // `bigFive` is a hand-authored display-only scaffold (no user writes,
    // no network). The personality facet ships it; other facets ignore it.
    // Opaque passthrough keeps schema.js free of Big-Five shape knowledge —
    // the renderer owns the contract.
    if(raw.bigFive && typeof raw.bigFive === 'object') out.bigFive = raw.bigFive
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

const KNOWN_PIN_KEYS = new Set(['id', 'createdAt', 'entryDate', 'emotion', 'intensity', 'cause', 'note', 'backendMirrorEntryId'])

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
        if(k === 'backendMirrorEntryId' && v !== null && !Number.isInteger(v)) { warn(`${ctx}.backendMirrorEntryId not integer`); continue }
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
    // Backend bridge metadata. These fields identify durable rows while
    // keeping local `ss:v1:*` persistence separate from server truth.
    'backendMirrorEntryId', 'backendCartographerOutputId',
    'reviewStatus', 'syncStatus', 'syncError', 'contextType',
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
    'letterId',
])
const CAPTURE_DIMENSIONS = new Set(['values', 'interests', 'personality', 'skills'])

const REVIEW_STATES = new Set(['pending', 'confirmed', 'forgotten'])
const SYNC_STATES   = new Set(['local', 'syncing', 'synced', 'failed'])

const TRAJECTORY_BEARING_KEYS = new Set(['id', 'title', 'prompt', 'traitTags', 'ecgTags', 'risk', 'msfUrl'])

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
        if(k === 'msfUrl' && v !== null && typeof v !== 'string') { warn(`${ctx}.msfUrl not string`); continue }
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
        if((k === 'backendMirrorEntryId' || k === 'backendCartographerOutputId') && v !== null && !Number.isInteger(v))
        {
            warn(`${ctx}.${k} not integer`); continue
        }
        if(k === 'reviewStatus' && !REVIEW_STATES.has(v)) { warn(`${ctx}.reviewStatus invalid`); continue }
        if(k === 'syncStatus' && !SYNC_STATES.has(v)) { warn(`${ctx}.syncStatus invalid`); continue }
        if(k === 'syncError' && typeof v !== 'string') { warn(`${ctx}.syncError not string`); continue }
        if(k === 'contextType' && typeof v !== 'string') { warn(`${ctx}.contextType not string`); continue }
        if(k === 'letterId' && typeof v !== 'string') { warn(`${ctx}.letterId not string`); continue }
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
    prompt:  '',
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

// ── Relationships ──────────────────────────────────────────────────────────
/**
 * Three lists under one slice — keep them together so a single hydrate() and
 * a single _persist() cover the whole "who is in my life" surface.
 *
 * @typedef {Object} RelationshipMapEntry
 * @property {string} id
 * @property {string} createdAt ISO
 * @property {string} name
 * @property {'family'|'cca'|'close-friend'|'teacher'|'other'} category
 * @property {'rely-on'|'give-to'|'mutual'|'uncertain'|null} quality
 * @property {string|null} note
 *
 * @typedef {Object} BelongingEntry
 * @property {string} id
 * @property {string} createdAt ISO
 * @property {'cca'|'class'|'school'|'society'|'other'} groupKind
 * @property {string} groupName
 * @property {'belong'|'participate'|'edge'} belongLevel
 * @property {string|null} note
 *
 * @typedef {Object} OutsidePerspectiveEntry
 * @property {string} id
 * @property {string} createdAt ISO
 * @property {'peer'|'teacher'|'coach'|'family'|'other'} source
 * @property {string|null} sourceLabel
 * @property {string} observation
 * @property {'values'|'interests'|'personality'|'skills'|null} vipsDimensionRef
 * @property {'matches'|'partly'|'differs'|'unknown'} agreementSelf
 */

const RELATIONSHIP_CATEGORIES = new Set(['family', 'cca', 'close-friend', 'teacher', 'other'])
const RELATIONSHIP_QUALITIES = new Set(['rely-on', 'give-to', 'mutual', 'uncertain'])
const BELONG_GROUP_KINDS = new Set(['cca', 'class', 'school', 'society', 'other'])
const BELONG_LEVELS = new Set(['belong', 'participate', 'edge'])
const PERSPECTIVE_SOURCES = new Set(['peer', 'teacher', 'coach', 'family', 'other'])
const PERSPECTIVE_AGREEMENTS = new Set(['matches', 'partly', 'differs', 'unknown'])
const VIPS_DIM_SET = new Set(['values', 'interests', 'personality', 'skills'])

const KNOWN_RELATIONSHIP_MAP_KEYS = new Set(['id', 'createdAt', 'name', 'category', 'quality', 'note'])
const KNOWN_BELONGING_KEYS = new Set(['id', 'createdAt', 'groupKind', 'groupName', 'belongLevel', 'note'])
const KNOWN_PERSPECTIVE_KEYS = new Set([
    'id', 'createdAt', 'source', 'sourceLabel', 'observation', 'vipsDimensionRef', 'agreementSelf',
])

const defaultRelationshipMapEntry = () => ({
    id:        '',
    createdAt: new Date(0).toISOString(),
    name:      '',
    category:  'other',
    quality:   null,
    note:      null,
})

export function mergeRelationshipMapEntry(raw, ctx = 'relationship')
{
    if(!raw || typeof raw !== 'object') { warn(`${ctx}: not an object`); return null }
    const out = defaultRelationshipMapEntry()
    for(const k of Object.keys(raw))
    {
        if(!KNOWN_RELATIONSHIP_MAP_KEYS.has(k)) { warn(`${ctx}: dropping unknown key "${k}"`); continue }
        const v = raw[k]
        if(k === 'category' && !RELATIONSHIP_CATEGORIES.has(v)) { warn(`${ctx}.category invalid: "${v}"`); continue }
        if(k === 'quality' && v !== null && !RELATIONSHIP_QUALITIES.has(v)) { warn(`${ctx}.quality invalid: "${v}"`); continue }
        if(k === 'note' && v !== null && !isString(v)) { warn(`${ctx}.note not string`); continue }
        if(k === 'name' && !isString(v)) { warn(`${ctx}.name not string`); continue }
        if(k === 'id' && !isString(v)) { warn(`${ctx}.id not string`); continue }
        if(k === 'createdAt' && !isISO(v)) { warn(`${ctx}.createdAt invalid`); continue }
        out[k] = v
    }
    if(!out.id || !out.name) return null
    return out
}

const defaultBelongingEntry = () => ({
    id:          '',
    createdAt:   new Date(0).toISOString(),
    groupKind:   'other',
    groupName:   '',
    belongLevel: 'participate',
    note:        null,
})

export function mergeBelongingEntry(raw, ctx = 'belonging')
{
    if(!raw || typeof raw !== 'object') { warn(`${ctx}: not an object`); return null }
    const out = defaultBelongingEntry()
    for(const k of Object.keys(raw))
    {
        if(!KNOWN_BELONGING_KEYS.has(k)) { warn(`${ctx}: dropping unknown key "${k}"`); continue }
        const v = raw[k]
        if(k === 'groupKind' && !BELONG_GROUP_KINDS.has(v)) { warn(`${ctx}.groupKind invalid: "${v}"`); continue }
        if(k === 'belongLevel' && !BELONG_LEVELS.has(v)) { warn(`${ctx}.belongLevel invalid: "${v}"`); continue }
        if(k === 'note' && v !== null && !isString(v)) { warn(`${ctx}.note not string`); continue }
        if(k === 'groupName' && !isString(v)) { warn(`${ctx}.groupName not string`); continue }
        if(k === 'id' && !isString(v)) { warn(`${ctx}.id not string`); continue }
        if(k === 'createdAt' && !isISO(v)) { warn(`${ctx}.createdAt invalid`); continue }
        out[k] = v
    }
    if(!out.id || !out.groupName) return null
    return out
}

const defaultPerspectiveEntry = () => ({
    id:               '',
    createdAt:        new Date(0).toISOString(),
    source:           'peer',
    sourceLabel:      null,
    observation:      '',
    vipsDimensionRef: null,
    agreementSelf:    'unknown',
})

export function mergeOutsidePerspectiveEntry(raw, ctx = 'perspective')
{
    if(!raw || typeof raw !== 'object') { warn(`${ctx}: not an object`); return null }
    const out = defaultPerspectiveEntry()
    for(const k of Object.keys(raw))
    {
        if(!KNOWN_PERSPECTIVE_KEYS.has(k)) { warn(`${ctx}: dropping unknown key "${k}"`); continue }
        const v = raw[k]
        if(k === 'source' && !PERSPECTIVE_SOURCES.has(v)) { warn(`${ctx}.source invalid: "${v}"`); continue }
        if(k === 'agreementSelf' && !PERSPECTIVE_AGREEMENTS.has(v)) { warn(`${ctx}.agreementSelf invalid: "${v}"`); continue }
        if(k === 'vipsDimensionRef' && v !== null && !VIPS_DIM_SET.has(v)) { warn(`${ctx}.vipsDimensionRef invalid: "${v}"`); continue }
        if(k === 'sourceLabel' && v !== null && !isString(v)) { warn(`${ctx}.sourceLabel not string`); continue }
        if(k === 'observation' && !isString(v)) { warn(`${ctx}.observation not string`); continue }
        if(k === 'id' && !isString(v)) { warn(`${ctx}.id not string`); continue }
        if(k === 'createdAt' && !isISO(v)) { warn(`${ctx}.createdAt invalid`); continue }
        out[k] = v
    }
    if(!out.id || !out.observation) return null
    return out
}

const defaultRelationships = () => ({
    map:          [],
    belonging:    [],
    perspectives: [],
})

export function mergeRelationships(raw)
{
    const out = defaultRelationships()
    if(!raw || typeof raw !== 'object') return out
    if(Array.isArray(raw.map))          out.map          = mergeArray(raw.map,          mergeRelationshipMapEntry,    'relationships.map')
    if(Array.isArray(raw.belonging))    out.belonging    = mergeArray(raw.belonging,    mergeBelongingEntry,          'relationships.belonging')
    if(Array.isArray(raw.perspectives)) out.perspectives = mergeArray(raw.perspectives, mergeOutsidePerspectiveEntry, 'relationships.perspectives')
    return out
}

// ── Choices ────────────────────────────────────────────────────────────────
/**
 * @typedef {Object} DecisionEntry
 * @property {string} id
 * @property {string} createdAt ISO
 * @property {string} decision    headline of the choice (eg "CCA captain election")
 * @property {string[]} options   alternatives the student considered
 * @property {string} chose       which option was taken
 * @property {Array<'consequential'|'peer-acceptance'|'values'|'family'|'gut'|'other'>} forces
 * @property {string} when        free-form date or "last term"
 * @property {string|null} note
 * @property {'avoidant'|'impulsive'|'deliberate'|null} patternTag
 *
 * @typedef {Object} ChangeIntention
 * @property {string} id
 * @property {string} createdAt ISO
 * @property {string} current      the pattern or behaviour the student sees today
 * @property {string} change       what they want to do differently
 * @property {string|null} byWhen
 * @property {'avoidant'|'impulsive'|'deliberate'|null} linkedPatternTag
 */

const DECISION_FORCES = new Set(['consequential', 'peer-acceptance', 'values', 'family', 'gut', 'other'])
const DECISION_PATTERN_TAGS = new Set(['avoidant', 'impulsive', 'deliberate'])

const KNOWN_DECISION_KEYS = new Set([
    'id', 'createdAt', 'decision', 'options', 'chose', 'forces', 'when', 'note', 'patternTag',
])
const KNOWN_INTENTION_KEYS = new Set([
    'id', 'createdAt', 'current', 'change', 'byWhen', 'linkedPatternTag',
])

const defaultDecision = () => ({
    id:         '',
    createdAt:  new Date(0).toISOString(),
    decision:   '',
    options:    [],
    chose:      '',
    forces:     [],
    when:       '',
    note:       null,
    patternTag: null,
})

export function mergeDecisionEntry(raw, ctx = 'decision')
{
    if(!raw || typeof raw !== 'object') { warn(`${ctx}: not an object`); return null }
    const out = defaultDecision()
    for(const k of Object.keys(raw))
    {
        if(!KNOWN_DECISION_KEYS.has(k)) { warn(`${ctx}: dropping unknown key "${k}"`); continue }
        const v = raw[k]
        if(k === 'options')
        {
            if(!Array.isArray(v)) { warn(`${ctx}.options not array`); continue }
            out.options = v.filter((x) => typeof x === 'string')
            continue
        }
        if(k === 'forces')
        {
            if(!Array.isArray(v)) { warn(`${ctx}.forces not array`); continue }
            out.forces = v.filter((x) => DECISION_FORCES.has(x))
            continue
        }
        if(k === 'patternTag' && v !== null && !DECISION_PATTERN_TAGS.has(v)) { warn(`${ctx}.patternTag invalid: "${v}"`); continue }
        if(k === 'note' && v !== null && !isString(v)) { warn(`${ctx}.note not string`); continue }
        if((k === 'decision' || k === 'chose' || k === 'when') && !isString(v)) { warn(`${ctx}.${k} not string`); continue }
        if(k === 'id' && !isString(v)) { warn(`${ctx}.id not string`); continue }
        if(k === 'createdAt' && !isISO(v)) { warn(`${ctx}.createdAt invalid`); continue }
        out[k] = v
    }
    if(!out.id || !out.decision) return null
    return out
}

const defaultIntention = () => ({
    id:               '',
    createdAt:        new Date(0).toISOString(),
    current:          '',
    change:           '',
    byWhen:           null,
    linkedPatternTag: null,
})

export function mergeChangeIntention(raw, ctx = 'intention')
{
    if(!raw || typeof raw !== 'object') { warn(`${ctx}: not an object`); return null }
    const out = defaultIntention()
    for(const k of Object.keys(raw))
    {
        if(!KNOWN_INTENTION_KEYS.has(k)) { warn(`${ctx}: dropping unknown key "${k}"`); continue }
        const v = raw[k]
        if(k === 'linkedPatternTag' && v !== null && !DECISION_PATTERN_TAGS.has(v)) { warn(`${ctx}.linkedPatternTag invalid: "${v}"`); continue }
        if(k === 'byWhen' && v !== null && !isString(v)) { warn(`${ctx}.byWhen not string`); continue }
        if((k === 'current' || k === 'change') && !isString(v)) { warn(`${ctx}.${k} not string`); continue }
        if(k === 'id' && !isString(v)) { warn(`${ctx}.id not string`); continue }
        if(k === 'createdAt' && !isISO(v)) { warn(`${ctx}.createdAt invalid`); continue }
        out[k] = v
    }
    if(!out.id || !out.change) return null
    return out
}

const defaultChoices = () => ({
    decisions:  [],
    intentions: [],
})

export function mergeChoices(raw)
{
    const out = defaultChoices()
    if(!raw || typeof raw !== 'object') return out
    if(Array.isArray(raw.decisions))  out.decisions  = mergeArray(raw.decisions,  mergeDecisionEntry,     'choices.decisions')
    if(Array.isArray(raw.intentions)) out.intentions = mergeArray(raw.intentions, mergeChangeIntention,   'choices.intentions')
    return out
}
