---
title: Engine component vocabulary — buttons, tabs, chips, tags, badges
type: design-system
status: active
date: 2026-05-20
related_plan: docs/plans/2026-05-20-002-refactor-e2e-ux-motion-audit-plan.md
references: docs/audit/mobbin-references-2026-05-20.md
---

# Engine component vocabulary

A grammar for the small rounded surfaces in the engine. The audit walks showed five different "pills" sitting next to each other on one screen, each rounded the same way, each at a similar size, each at similar visual weight — so users can't tell at a glance which one to tap, which one is a state label, and which one is just metadata.

This doc commits to six distinct roles, gives each one a clear visual character, and maps existing class names onto those roles.

---

## Mobbin grammar lessons

These specific app screens settled the conventions used below:

- **mymind** ([screen](https://mobbin.com/screens/ce489db8-d617-4ef3-9209-d9b3b6725563)) — three vocabulary levels visible at once: solid orange `+ Add tag` (primary), outlined cream `Web Page` (secondary), flat gray `Design / Creative Arts / Brand Identity` (tags). The vocabulary is legible because **fill weight encodes interactivity** and **size encodes hierarchy**.
- **Reminders** ([screen](https://mobbin.com/screens/cfb22b2c-c522-4842-afb9-186ab2cda394)) — `All Tags` is solid blue (active filter), `#Work` is flat gray (inactive). One axis (fill) carries the entire active/inactive distinction.
- **Fi** ([screen](https://mobbin.com/screens/e7930c22-9826-40b7-94fa-f6841a73f6a0)) — the single solid-dark `Start setup` CTA dominates the surface. There is exactly one primary action per screen; everything else recedes.
- **Mimo** ([screen](https://mobbin.com/screens/b33e7987-1a4c-4fef-a965-db3eb7359297)) — `DAILY REVIEW` badge (uppercase, low-contrast, no border, non-interactive) sits comfortably next to `Start now` (outlined CTA, interactive) and feels like a different *kind* of element, not a different *color* of the same element.

---

## The shape grammar (most important rule)

The single distinction that resolves every previous confusion:

| Shape | Used for | `border-radius` |
|---|---|---|
| **Squircle** (rounded square) | Anything **you tap** — buttons, tabs, chips, links-as-buttons | 10 – 14 px (≈30% of element height) |
| **Pill** (fully round) | Anything **you read** — status labels, metadata tags, eyebrows | 999 px (so the ends stay perfectly hemispherical) |

This means: if you see a rounded-rectangle, it's a control. If you see a full pill, it's a label. The eye learns this in 5 seconds and never mistakes one for the other again. Inspired by iOS continuous-corner buttons and the absolute-bans section of the impeccable skill.

## The six roles

| # | Role | Shape | Fill | Border | Height | Type | Cursor | Used for |
|---|---|---|---|---|---|---|---|---|
| 1 | **Primary CTA** | Squircle 14 | Solid `#2b2620` (or facet-accent), white text + drop shadow | none | 44 | 14 / 600 | pointer | The single most important action on the surface — "Run sense-making", "Start a chat with Kira", primary form submit |
| 2 | **Secondary CTA** | Squircle 12 | Translucent cream, dark text | 1px rgba(43,38,32,0.20) | 36 | 13 / 600 | pointer | "Share", "Today", escape actions, secondary form submits |
| 3 | **Tab** | Squircle 12 | Inactive flat / Active = facet-soft + accent border | conditional | 36 | 13.5 / 600 | pointer | Profile facet tabs, History year scrubber, History Timeline/Growth |
| 4 | **Status badge** | **Pill** 999 | Very low-contrast flat | **none** | 26 | 11 / 700 UPPERCASE 0.10em | default | Read-only state labels: "SEARCHING", "PATH FINDER", section eyebrows |
| 5 | **Metadata tag** | **Pill** 999 | Very low-contrast flat | **none** | 26 | 12.5 / 500 | default | Read-only metadata: "Interests → Social", trait combination chips |
| 6 | **Numbered nav chip** | Squircle 10 | Flat with leading number circle (still round) | accent border when active | 32 | 13 / 600 | pointer | Path Finder 1/2/3 tabs where the number IS the visual hook |

### Grammar rules

1. **Shape encodes affordance.** Squircle = tap. Pill = read. This is the headline rule.
2. **Border = secondary visual confirmation of interactivity.** Squircles can have borders or not, but pills never do.
3. **Uppercase + tracking = status, not action.** Lowercase or sentence case = action.
4. **Fill weight encodes emphasis.** Solid → outlined → flat. Solid is reserved for the one primary action per surface.
5. **Height encodes hierarchy.** 44 > 36 > 32 > 26. Never use 28 / 30 / 34 — those values blur the steps.
6. **Primary CTA gets a drop shadow.** The single most-important button lifts off the surface. Secondary CTAs do not.
7. **Don't morph between shapes on state change.** A squircle stays a squircle; a pill stays a pill. Active states change fill/border/elevation, not radius.

---

## Class mapping

This is the mapping from the existing engine selectors onto the roles above. Names stay unchanged so JS doesn't break; the styles update.

| Existing class | Role | Notes |
|---|---|---|
| `.trajectory-starter__cta` ("Start a chat with Kira") | Primary CTA | Already solid dark; standardise to 44px height |
| `.trajectory-foreclosed__cta` ("Run sense-making" in foreclosed branch) | Primary CTA | Same |
| `.share-dialog__action` ("Copy", "Sign in to share") | Primary CTA | Same |
| `.kira-dialogue__cta` | Primary CTA | Already solid; align padding |
| `.cal-today`, `.cal-connector` | Secondary CTA | Outlined cream pill |
| `.trajectory-sheet__escape`, share-dialog `__action--download` | Secondary CTA | Same |
| `.profile-tab`, `.trajectory-tab`, `.history-sheet__pill` | Tab | Inactive flat / active accent — already in this family, standardise heights to 36 |
| `.trajectory-sheet__status-pill` ("SEARCHING") | **Status badge** | Today reads as a button (border + cursor pointer). Drop the border, drop cursor pointer, drop uppercase tracking to badge tier |
| `.trajectory-chip`, `.trajectory-chip--ecg`, `.chip--claim`, `.chip--confidence` | Metadata tag | Already flat, no border — confirm consistency |
| `.trajectory-tab` (numbered 1/2/3 in Searching) | Numbered nav chip | Slight character change: keep number circle prominent, give clearer active vs inactive |
| `.trajectory-panel__chip-label` ("TRAIT COMBINATION") | Eyebrow (text-only role, not a chip) | Stays as inline `<p>`, not a pill |

### What's NOT in this vocabulary

- The 3D world's HUD buttons (`.zoom-hud__btn`, `.hour-hud__btn`) live outside the sheets and stay tied to the world's own visual language.
- Capture sheets' `.capture-stage__btn` is a multi-state stage button, not a pill — it has its own grammar (canvas-style frame).
- The shared `.sheet-chrome__close` (×) is a fixed-position chrome control, not in the inline button family.

---

## Why this matters

Today, on the Path Finder Searching screen, the user sees in a vertical stack:
1. **SEARCHING** — a bordered pill that looks tappable but isn't
2. **Run sense-making** — a white outlined pill that IS tappable
3. **Path 1 / 2 / 3** — bordered pills with numbers, tappable section jumps
4. **TRAIT COMBINATION** — uppercase eyebrow text
5. **Interests → Social** — a flat pill that looks similar to (1) and (3)

The flat-vs-bordered axis is muddled, the uppercase axis is split across two of them, and the sizes (28 / 36 / 32 / 24px) bear no consistent meaning. Fix is to commit each one to a role and let the role's character carry the meaning.

---

## What this doc is NOT

Not a Tailwind preset or a token JSON. The engine is vanilla CSS by design (no shadcn, no design-tokens layer — per `CLAUDE.md` guardrails). This doc is a vocabulary committed in prose, mirrored in `style.css` via grouped selectors at the top of the file under `/* ===== Component vocabulary ===== */`, so future additions can follow the same rules without re-deriving them.

A future plan could lift these into CSS custom properties (`--ds-button-height-primary: 44px` etc.) — out of scope here.
