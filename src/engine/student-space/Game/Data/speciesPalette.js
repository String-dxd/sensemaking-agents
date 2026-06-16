/**
 * Species Palette — data model + default builder.
 *
 * Each species maps to its color slots:
 *   tree:   { colorA: '#rrggbb', colorB: '#rrggbb' }
 *   flower: { petal: '#rrggbb', centre?: '#rrggbb', face?: '#rrggbb' }
 *   fruit:  { color: '#rrggbb' }
 *
 * `defaultSpeciesPalette()` reproduces today's constants exactly (visual no-op).
 */

/** @param {number} hex */
function toHex(hex) {
    return '#' + hex.toString(16).padStart(6, '0').toUpperCase()
}

// ── Tree constants (Tree.js:50-53) ────────────────────────────────────────────

const OAK_COLOR_A    = 0x3A7D2A
const OAK_COLOR_B    = 0x8AAA35
const CHERRY_COLOR_A = 0xFF66A3
const CHERRY_COLOR_B = 0xFFCC66

// ── Flower constants (Flowers.js:20-27) ───────────────────────────────────────

const FLOWER_SPECIES = [
    { id: 'daisy',    petal: 0xFF8E8E, centre: 0xFFD45A },
    { id: 'tulip',    petal: 0xFFB0D5 },
    { id: 'rose',     petal: 0xF0A86A },
    { id: 'lily',     petal: 0xFFD45A, centre: 0xFAF1DC },
    { id: 'pansy',    petal: 0xD09EE8, face:   0x2B2620 },
    { id: 'hyacinth', petal: 0xFAF1DC },
]

// ── Fruit constants (Fruits.js:23-32) ─────────────────────────────────────────

const FRUIT_SPECIES = [
    { id: 'apple',  color: 0xD64242 },
    { id: 'pear',   color: 0xC9D659 },
    { id: 'plum',   color: 0x7B3F8E },
    { id: 'fig',    color: 0x6A3F62 },
    { id: 'citrus', color: 0xF1A22F },
    { id: 'berry',  color: 0xB02A5E },
]

// ── Default builder ────────────────────────────────────────────────────────────

/**
 * @typedef {{ colorA: string, colorB: string }} TreeColors
 * @typedef {{ petal: string, centre?: string, face?: string }} FlowerColors
 * @typedef {{ color: string }} FruitColors
 * @typedef {{ v: 1, tree: Record<string,TreeColors>, flower: Record<string,FlowerColors>, fruit: Record<string,FruitColors> }} PaletteSnapshot
 */

/**
 * Build the canonical default palette from baked constants — the authoritative
 * fallback if `defaultSpeciesPalette.json` is empty or invalid.
 *
 * @returns {PaletteSnapshot}
 */
export function defaultSpeciesPaletteFromConstants()
{
    /** @type {Record<string,TreeColors>} */
    const tree = {
        oak:    { colorA: toHex(OAK_COLOR_A),    colorB: toHex(OAK_COLOR_B) },
        cherry: { colorA: toHex(CHERRY_COLOR_A), colorB: toHex(CHERRY_COLOR_B) },
    }

    /** @type {Record<string,FlowerColors>} */
    const flower = {}
    for(const s of FLOWER_SPECIES)
    {
        /** @type {FlowerColors} */
        const entry = { petal: toHex(s.petal) }
        if(s.centre !== undefined) entry.centre = toHex(s.centre)
        if(s.face   !== undefined) entry.face   = toHex(s.face)
        flower[s.id] = entry
    }

    /** @type {Record<string,FruitColors>} */
    const fruit = {}
    for(const s of FRUIT_SPECIES)
    {
        fruit[s.id] = { color: toHex(s.color) }
    }

    return { v: 1, tree, flower, fruit }
}

// ── defaultSpeciesPalette.json import (loaded in separate step after JSON exists) ──

import committedPalette from './defaultSpeciesPalette.json'
import { mergeSpeciesPalette } from '../State/schema.js'

/**
 * Return the committed default species palette.
 *
 * Loads from `defaultSpeciesPalette.json`, falls back to
 * `defaultSpeciesPaletteFromConstants()` if empty or invalid.
 *
 * @returns {PaletteSnapshot}
 */
export function defaultSpeciesPalette()
{
    const merged = mergeSpeciesPalette(committedPalette)
    if(merged) return merged
    return defaultSpeciesPaletteFromConstants()
}
