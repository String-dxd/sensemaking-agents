/**
 * Inline-SVG silhouettes for the four facets' bento tiles.
 *
 * Each function returns a self-contained `<svg>` markup string sized 80×80
 * with `currentColor` strokes so the tile's CSS color cascades through. The
 * silhouettes are deliberately minimal — readable category icons, not art.
 * The 3D scene continues to carry the rendered detail; these flat marks
 * only need to differentiate trees from flowers from stones from fruits.
 *
 * Keyed by `canonicalClaimId`. Falls back to a neutral disc if the id
 * isn't recognised so the UI never breaks on a future taxonomy addition.
 */

import { VIPS_BY_ID } from '../Data/vipsTaxonomy.js'

const FALLBACK = `<svg viewBox="0 0 80 80" aria-hidden="true">
    <circle cx="40" cy="40" r="20" fill="none" stroke="currentColor" stroke-width="2"/>
</svg>`

// ── Tree silhouettes (Values) ──────────────────────────────────────────────
const trunk = (x = 36, y = 50, w = 8, h = 22) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="currentColor" opacity="0.55"/>`

const TREE = {
    mangrove: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <ellipse cx="40" cy="30" rx="24" ry="14" fill="currentColor" opacity="0.85"/>
        <path d="M28 50 L24 70 M40 50 L40 70 M52 50 L56 70" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.55"/>
    </svg>`,
    oak: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="28" r="20" fill="currentColor" opacity="0.85"/>
        <circle cx="26" cy="34" r="11" fill="currentColor" opacity="0.85"/>
        <circle cx="54" cy="34" r="11" fill="currentColor" opacity="0.85"/>
        ${trunk()}
    </svg>`,
    cherry: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="26" r="16" fill="currentColor" opacity="0.85"/>
        <circle cx="28" cy="38" r="10" fill="currentColor" opacity="0.75"/>
        <circle cx="52" cy="38" r="10" fill="currentColor" opacity="0.75"/>
        <circle cx="22" cy="22" r="2.4" fill="currentColor"/>
        <circle cx="58" cy="20" r="2.4" fill="currentColor"/>
        <circle cx="40" cy="14" r="2.4" fill="currentColor"/>
        ${trunk()}
    </svg>`,
    pine: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <path d="M40 10 L24 28 L34 28 L20 46 L32 46 L18 64 L62 64 L48 46 L60 46 L46 28 L56 28 Z" fill="currentColor" opacity="0.85"/>
        <rect x="36" y="64" width="8" height="10" fill="currentColor" opacity="0.55"/>
    </svg>`,
    palm: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <path d="M40 24 C24 20 18 32 18 36" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85"/>
        <path d="M40 24 C56 20 62 32 62 36" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85"/>
        <path d="M40 24 C36 14 24 12 16 16" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85"/>
        <path d="M40 24 C44 14 56 12 64 16" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85"/>
        <circle cx="40" cy="24" r="3" fill="currentColor"/>
        <path d="M38 26 C36 40 42 56 40 70" stroke="currentColor" stroke-width="3" fill="none" opacity="0.55"/>
    </svg>`,
    maple: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <path d="M40 8 L46 22 L60 18 L52 30 L66 32 L54 40 L62 52 L48 48 L46 62 L40 50 L34 62 L32 48 L18 52 L26 40 L14 32 L28 30 L20 18 L34 22 Z" fill="currentColor" opacity="0.85"/>
        <rect x="36" y="60" width="8" height="14" fill="currentColor" opacity="0.55"/>
    </svg>`,
    willow: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <ellipse cx="40" cy="24" rx="22" ry="12" fill="currentColor" opacity="0.85"/>
        <path d="M22 28 Q24 56 26 66 M30 30 Q32 58 34 70 M40 30 Q40 60 40 72 M50 30 Q48 58 46 70 M58 28 Q56 56 54 66"
              stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.65"/>
    </svg>`,
    banyan: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <ellipse cx="40" cy="28" rx="28" ry="14" fill="currentColor" opacity="0.85"/>
        <circle cx="22" cy="32" r="6" fill="currentColor" opacity="0.7"/>
        <circle cx="58" cy="32" r="6" fill="currentColor" opacity="0.7"/>
        <path d="M28 42 L26 70 M34 44 L34 70 M40 44 L40 70 M46 44 L46 70 M52 42 L54 70"
              stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.55"/>
    </svg>`,
}

// ── Flower silhouettes (Interests) ─────────────────────────────────────────
const stem = (x = 40, y = 50, h = 22) =>
    `<rect x="${x - 1}" y="${y}" width="2" height="${h}" fill="currentColor" opacity="0.55"/>
     <path d="M${x} ${y + 6} Q${x - 8} ${y + 4} ${x - 12} ${y + 12}" stroke="currentColor" stroke-width="1.8" fill="none" opacity="0.55"/>`

const FLOWER = {
    daisy: `<svg viewBox="0 0 80 80" aria-hidden="true">
        ${stem()}
        ${Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2
            const cx = 40 + Math.cos(a) * 14
            const cy = 26 + Math.sin(a) * 14
            return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="6" ry="4" transform="rotate(${(a * 180 / Math.PI).toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})" fill="currentColor" opacity="0.85"/>`
        }).join('')}
        <circle cx="40" cy="26" r="5" fill="currentColor"/>
    </svg>`,
    pansy: `<svg viewBox="0 0 80 80" aria-hidden="true">
        ${stem()}
        <ellipse cx="30" cy="20" rx="9" ry="10" fill="currentColor" opacity="0.85"/>
        <ellipse cx="50" cy="20" rx="9" ry="10" fill="currentColor" opacity="0.85"/>
        <ellipse cx="26" cy="32" rx="9" ry="9" fill="currentColor" opacity="0.85"/>
        <ellipse cx="54" cy="32" rx="9" ry="9" fill="currentColor" opacity="0.85"/>
        <ellipse cx="40" cy="38" rx="11" ry="8" fill="currentColor" opacity="0.85"/>
        <circle cx="40" cy="28" r="3" fill="currentColor"/>
    </svg>`,
    rose: `<svg viewBox="0 0 80 80" aria-hidden="true">
        ${stem()}
        <circle cx="40" cy="28" r="16" fill="currentColor" opacity="0.85"/>
        <circle cx="40" cy="28" r="11" fill="currentColor" opacity="0.65"/>
        <circle cx="40" cy="28" r="6"  fill="currentColor" opacity="0.85"/>
        <path d="M40 22 L44 28 L40 34 L36 28 Z" fill="currentColor" opacity="0.55"/>
    </svg>`,
    lily: `<svg viewBox="0 0 80 80" aria-hidden="true">
        ${stem()}
        <path d="M40 10 Q56 20 56 32 Q48 28 40 30 Q32 28 24 32 Q24 20 40 10 Z" fill="currentColor" opacity="0.85"/>
        <path d="M40 14 L40 36" stroke="currentColor" stroke-width="2" opacity="0.65"/>
        <circle cx="40" cy="34" r="2.4" fill="currentColor"/>
    </svg>`,
    tulip: `<svg viewBox="0 0 80 80" aria-hidden="true">
        ${stem()}
        <path d="M40 14 Q56 18 54 36 Q48 32 40 36 Q32 32 26 36 Q24 18 40 14 Z" fill="currentColor" opacity="0.85"/>
        <path d="M30 22 Q40 26 50 22" stroke="currentColor" stroke-width="1.6" fill="none" opacity="0.55"/>
    </svg>`,
    hyacinth: `<svg viewBox="0 0 80 80" aria-hidden="true">
        ${stem(40, 56, 16)}
        ${[12, 22, 32, 42, 52].map((y, i) =>
            `<circle cx="${40 - (i % 2 === 0 ? 5 : -5)}" cy="${y}" r="${5 - i * 0.4}" fill="currentColor" opacity="${0.95 - i * 0.08}"/>`
        ).join('')}
    </svg>`,
}

// ── Personality silhouettes ─────────────────────────────────────────────────
const PERSONALITY = {
    windStone: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <path d="M30 12 L34 8 L46 8 L50 12 L48 26 L32 26 Z" fill="currentColor" opacity="0.85"/>
        <path d="M40 26 L40 50" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.65"/>
        <path d="M28 32 L52 32" stroke="currentColor" stroke-width="2" opacity="0.55"/>
        <path d="M30 38 L34 64 M40 38 L40 68 M50 38 L46 64"
              stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.65"/>
        <circle cx="30" cy="68" r="2" fill="currentColor"/>
        <circle cx="40" cy="72" r="2" fill="currentColor"/>
        <circle cx="50" cy="68" r="2" fill="currentColor"/>
    </svg>`,
    pool: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <ellipse cx="40" cy="44" rx="28" ry="18" fill="currentColor" opacity="0.30"/>
        <ellipse cx="40" cy="44" rx="22" ry="14" fill="none" stroke="currentColor" stroke-width="1.6" opacity="0.55"/>
        <ellipse cx="40" cy="44" rx="14" ry="9"  fill="none" stroke="currentColor" stroke-width="1.6" opacity="0.7"/>
        <ellipse cx="40" cy="44" rx="6"  ry="3.5" fill="currentColor" opacity="0.85"/>
        <path d="M16 30 Q24 22 32 30" stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.45"/>
    </svg>`,
}

// ── Fruit silhouettes (Skills) ─────────────────────────────────────────────
const FRUIT = {
    fig: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <path d="M40 16 L44 22 L36 22 Z" fill="currentColor" opacity="0.65"/>
        <path d="M40 22 C56 22 60 36 60 46 C60 60 50 68 40 68 C30 68 20 60 20 46 C20 36 24 22 40 22 Z" fill="currentColor" opacity="0.85"/>
        <circle cx="34" cy="48" r="2" fill="currentColor" opacity="0.4"/>
        <circle cx="44" cy="44" r="2" fill="currentColor" opacity="0.4"/>
        <circle cx="42" cy="56" r="2" fill="currentColor" opacity="0.4"/>
    </svg>`,
    pear: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <path d="M40 12 L42 22 L38 22 Z" fill="currentColor" opacity="0.55"/>
        <ellipse cx="40" cy="50" rx="22" ry="22" fill="currentColor" opacity="0.85"/>
        <ellipse cx="40" cy="30" rx="12" ry="10" fill="currentColor" opacity="0.85"/>
    </svg>`,
    plum: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="44" r="24" fill="currentColor" opacity="0.85"/>
        <path d="M40 22 L40 64" stroke="currentColor" stroke-width="1.4" opacity="0.45"/>
        <path d="M40 16 Q48 18 50 24" stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.55"/>
    </svg>`,
    apple: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <path d="M40 24 C32 16 22 22 22 36 C22 52 32 64 40 64 C48 64 58 52 58 36 C58 22 48 16 40 24 Z" fill="currentColor" opacity="0.85"/>
        <path d="M40 24 Q44 18 50 16" stroke="currentColor" stroke-width="2" fill="none" opacity="0.55"/>
    </svg>`,
    citrus: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="44" r="22" fill="currentColor" opacity="0.85"/>
        <circle cx="40" cy="44" r="14" fill="none" stroke="currentColor" stroke-width="1.6" opacity="0.45"/>
        <path d="M40 22 L40 66 M18 44 L62 44 M24 28 L56 60 M56 28 L24 60"
              stroke="currentColor" stroke-width="1" opacity="0.35"/>
    </svg>`,
    berry: `<svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="30" cy="34" r="8" fill="currentColor" opacity="0.85"/>
        <circle cx="48" cy="32" r="9" fill="currentColor" opacity="0.85"/>
        <circle cx="38" cy="46" r="9" fill="currentColor" opacity="0.85"/>
        <circle cx="52" cy="50" r="8" fill="currentColor" opacity="0.85"/>
        <circle cx="28" cy="52" r="7" fill="currentColor" opacity="0.85"/>
        <path d="M40 16 L42 26 L38 26 Z" fill="currentColor" opacity="0.55"/>
    </svg>`,
}

/**
 * Return the SVG markup for a canonical claim id's silhouette.
 * Looks up the claim's `object` in vipsTaxonomy and dispatches to the
 * appropriate map. Unknown claims fall back to a neutral disc.
 */
export function iconForClaim(claimId)
{
    const claim = VIPS_BY_ID[claimId]
    if(!claim) return FALLBACK
    const o = claim.object
    if(!o) return FALLBACK
    if(o.kind === 'tree'      && TREE[o.species])        return TREE[o.species]
    if(o.kind === 'flower'    && FLOWER[o.species])      return FLOWER[o.species]
    if(o.kind === 'fruit'     && FRUIT[o.species])       return FRUIT[o.species]
    if(o.kind === 'windStone' && PERSONALITY.windStone)  return PERSONALITY.windStone
    if(o.kind === 'pool'      && PERSONALITY.pool)       return PERSONALITY.pool
    return FALLBACK
}
