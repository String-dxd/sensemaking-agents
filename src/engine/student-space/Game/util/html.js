/**
 * Shared HTML escaping. The codebase had three slightly different copies
 * of this helper — one of them (LettersSheet) dropped the apostrophe
 * escape, which is a latent XSS surface inside attribute strings.
 * Canonical 5-char form here is the safe one.
 */

const HTML_ESCAPE_MAP = {
    '&':  '&amp;',
    '<':  '&lt;',
    '>':  '&gt;',
    '"':  '&quot;',
    "'":  '&#39;',
}

export const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c])

/** Alias for clarity at call sites that escape attribute values
 *  rather than text content. Same implementation. */
export const escapeAttr = escapeHtml
