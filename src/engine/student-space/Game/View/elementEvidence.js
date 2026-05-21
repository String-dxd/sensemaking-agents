import { VIPS_BY_ID, VIPS_TAXONOMY } from '../Data/vipsTaxonomy.js'

const KIND_TO_FACET = {
    tree:   'values',
    flower: 'interests',
    fruit:  'skills',
}

const CLAIM_ID_BY_KIND_AND_SPECIES = (() =>
{
    const map = {}
    for(const claim of VIPS_TAXONOMY)
    {
        const object = claim.object || {}
        if(!object.kind || !object.species) continue
        map[`${object.kind}:${object.species}`] = claim.id
    }
    return map
})()

export function speciesIdOf(target)
{
    const raw = target?.species
    if(typeof raw === 'string') return raw
    return raw?.id ?? raw?.species ?? ''
}

export function claimForElementTarget(target)
{
    const explicit = target?.claimId || target?.canonicalClaimId || target?.canonical_claim_id
    if(explicit && VIPS_BY_ID[explicit]) return VIPS_BY_ID[explicit]

    const speciesId = speciesIdOf(target)
    const kind = target?.kind
    if(!kind || !speciesId) return null

    const claimId = CLAIM_ID_BY_KIND_AND_SPECIES[`${kind}:${speciesId}`]
    return claimId ? VIPS_BY_ID[claimId] : null
}

export function resolveElementEvidence(target, profile)
{
    const claim = claimForElementTarget(target)
    const speciesId = speciesIdOf(target)
    const quotes = claim?.id && profile?.getQuotesForClaim
        ? (profile.getQuotesForClaim(claim.id) || [])
        : []
    const sortedQuotes = quotes.slice().sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt))
    const latestQuote = sortedQuotes[0] || null
    const facetId = claim?.facet || KIND_TO_FACET[target?.kind] || null

    return {
        kind: target?.kind || '',
        facetId,
        claimId: claim?.id || null,
        claimLabel: claim?.label || null,
        definition: claim?.definition || '',
        speciesId,
        speciesLabel: cap(speciesId),
        evidenceCount: quotes.length,
        hasEvidence: quotes.length > 0,
        latestQuote,
        latestQuoteText: latestQuote?.text || '',
        latestQuoteId: latestQuote?.id || null,
        sourceCaptureId: latestQuote?.sourceCaptureId || null,
        backendTimelineEntryId: latestQuote?.backendTimelineEntryId || null,
    }
}

export function elementTitle(evidence, fallback = 'Element')
{
    return evidence?.claimLabel || evidence?.speciesLabel || fallback
}

export function evidenceCountText(evidence)
{
    const count = evidence?.evidenceCount || 0
    if(count === 0) return 'No noticings yet.'
    if(count === 1) return '1 noticing'
    return `${count} noticings`
}

export function latestEvidenceLine(evidence, maxLength = 92)
{
    if(!evidence?.latestQuoteText) return evidenceCountText(evidence)
    return `${evidenceCountText(evidence)} · “${truncate(evidence.latestQuoteText, maxLength)}”`
}

export function metaphorLine(evidence)
{
    if(!evidence?.claimLabel) return ''
    const species = evidence.speciesLabel || 'This element'
    const noun = evidence.kind === 'flower' ? 'bloom'
        : evidence.kind === 'fruit' ? 'fruit'
        : evidence.kind === 'tree' ? 'tree'
        : 'element'
    return `${species} is the island ${noun} for ${evidence.claimLabel}.`
}

function truncate(text, maxLength)
{
    const clean = String(text || '').replace(/\s+/g, ' ').trim()
    if(clean.length <= maxLength) return clean
    return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function timestamp(value)
{
    if(!value) return 0
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
}

function cap(s)
{
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}
