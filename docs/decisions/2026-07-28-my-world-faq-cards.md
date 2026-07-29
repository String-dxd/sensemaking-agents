# Design decision record — My World FAQ cards

## 2026-07-29 interaction and visual-direction amendment

The project owner superseded the accordion treatment after reviewing the first
implementation.

- FAQ questions use a three-column card grid at desktop, two columns at
  intermediate widths and one column on narrow screens.
- A card front carries one question. Activating it turns the card to a concise
  answer.
- The answer face links to a focused evidence dialog for research, product
  facts, limitations and proposed pilot checks.
- Product at a glance uses short recordings of the real desktop prototype with
  synthetic data. Mobile screenshots are out of scope.
- The public page takes visual cues from Fauna Robotics' geometric warmth,
  confident scale and distinctive control silhouettes. It must not reproduce
  Fauna's logo, robotics imagery, typeface, exact palette or compositions.
- Product at a glance and FAQ remain separate top-level navigation
  destinations.
- Audience questions appear as quotes. The Pigeonhole interface does not
  appear.
- Copy stays brief at the first layer. Evidence remains available by choice.

This amendment is the authority wherever the earlier accordion decision,
static product screenshots or prior visual treatment differ.

- **Date:** 2026-07-28
- **Product:** My World working prototype
- **Change type:** modification
- **Page type:** reference / FAQ page; no existing product-page template applies
- **Run type:** attended
- **The teacher and the moment:** A DXD colleague, educator or parent wants to understand My World before exploring a concern.

## Sprint contract (done-criteria)

1. The top navigation has separate links for Product at a glance and FAQ.
2. Product tabs show all four full prototype screens without cropping.
3. Anonymous event concerns appear as quotes, with no Pigeonhole interface images.
4. FAQ topics use accessible tabs and card accordions with concise first-layer answers.
5. Evidence and limitations remain available through a second disclosure.
6. The page reflows at 320, 360, 768 and 1280 CSS pixels.

## Chosen approach

The page follows a short reading flow: introduction, product walkthrough, quoted concerns and FAQ. Product and FAQ categories use Base UI-based ShadCN tabs. Each FAQ card is an accordion item, so the card itself is the interaction.

## Rejected options

- **Question list beside a sticky answer panel** — scanning was dense and the answer felt detached from the selected question on mobile.
- **Pigeonhole screenshot strip** — the third-party interface drew attention away from the concern itself.
- **Static four-card product grid** — full screens became too small to read and encouraged cropping.

## Tradeoffs, named

Only one product screen and one FAQ topic lead at a time. This adds a selection step, but keeps full screenshots legible and prevents a long wall of answers.

## Controls in scope

A11Y-1, A11Y-2, A11Y-3, A11Y-4, A11Y-5, A11Y-6, A11Y-7, A11Y-8, A11Y-9, A11Y-10, TOK-1, TOK-2, TOK-3, TYP-1, TYP-2, TYP-3, TYP-4, COL-1, COL-2, CMP-1, CMP-5, CNT-2, CNT-3, CNT-4, CNT-5, CNT-6, CNT-7, SLP-1, SLP-4, SLP-5, SLP-6, SLP-7, SLP-8, SLP-9, SLP-10, SLP-11, LAY-2, LAY-3, LAY-4, LAY-5, LAY-6, LAY-7.

## Waivers granted

None.

## Plan approval

- **Approved by:** Project owner, through the attended Codex thread
- **Approved on:** 2026-07-28

## Verify verdict

- **Screenshots:**
  - `docs/design-references/my-world-faq/faq-cards/faq-320.png`
  - `docs/design-references/my-world-faq/faq-cards/faq-360.png`
  - `docs/design-references/my-world-faq/faq-cards/faq-768.png`
  - `docs/design-references/my-world-faq/faq-cards/faq-1280.png`
  - `docs/design-references/my-world-faq/faq-cards/product-sensemake-360.png`
  - `docs/design-references/my-world-faq/faq-cards/faq-answer-360.png`
- **CMP-3 evidence:** N/A. This page has no async action.
- **Token block line range:** Existing semantic tokens in `src/styles.css`; this change adds no raw colour.
- **Dark mode:** N/A — product has no dark mode
- **Component evidence:** Reviewed the product codebase and Base UI / ShadCN component catalog directly.

CMP-1: asserted, no manifest — manifest absent for My World
- **Verification ledger:**

  | Control | Method | Evidence |
  |---------|--------|----------|
  | A11Y-1 | script | `checks/contrast.py` clean against `src/styles.css` |
  | A11Y-2 | script | `checks/a11y-static.py` clean; tabs and disclosures operated by keyboard |
  | A11Y-3 | manual | Interactive snapshot exposes visible names for every link, tab and disclosure |
  | A11Y-4 | manual | Browser computed scan found no visible target below 44px at 320px |
  | A11Y-5 | manual | Transitions name properties and carry reduced-motion variants |
  | A11Y-6 | manual | Product images have descriptive alt text; chevrons are decorative |
  | A11Y-7 | manual | One h1; h2 sections; h3 questions; h4 evidence headings; semantic lists and landmarks |
  | A11Y-8 | manual | Browser snapshot shows selected tabs and updated `aria-expanded` states |
  | A11Y-9 | manual | Document title is descriptive and root language is `en` |
  | A11Y-10 | manual | Header navigation and main landmark are present |
  | TOK-1 | script | `checks/token-audit.py` clean |
  | TOK-2 | script | `checks/token-audit.py` clean |
  | TOK-3 | script | `checks/token-audit.py` clean |
  | TYP-1 | script | `checks/type-scan.py` clean |
  | TYP-2 | script | `checks/type-scan.py` clean |
  | TYP-3 | script | `checks/type-scan.py` clean |
  | TYP-4 | script | `checks/type-scan.py` clean |
  | COL-1 | manual | The established My World warm accent remains the only emphasis colour |
  | COL-2 | script | `checks/token-audit.py` clean |
  | CMP-1 | manual | Base UI-based ShadCN tabs, accordion, collapsible, badge and button variants used |
  | CMP-5 | manual | The page has navigation and disclosures, with no competing primary action |
  | CNT-2 | manual | Navigation and section labels use plain language |
  | CNT-3 | script | `checks/content-lint.py` clean except verbatim audience questions |
  | CNT-4 | manual | Product screens are labelled as synthetic demo data; audience quotes stay verbatim |
  | CNT-5 | script | `checks/content-lint.py` found no device-bound instructions |
  | CNT-6 | script | Remaining lint hits are preserved verbatim audience questions |
  | CNT-7 | manual | Section introductions lead with reader purpose |
  | SLP-1 | manual | No purple, gradient text or decorative glow added |
  | SLP-4 | manual | No nested cards |
  | SLP-5 | manual | FAQ cards are a vertical interaction list, not a static tile grid |
  | SLP-6 | manual | Hero, section and card hierarchy is distinct at all captured widths |
  | SLP-7 | manual | Section, group and item spacing use different rhythm tiers |
  | SLP-8 | manual | Motion uses direct easing with no bounce |
  | SLP-9 | script | `checks/content-lint.py` clean except quoted audience wording |
  | SLP-10 | manual | The multi-section reference experience remains a page |
  | SLP-11 | manual | Card chrome is reserved for the FAQ disclosure interaction |
  | LAY-2 | manual | Body and root scroll widths equal 320px at the 320px viewport |
  | LAY-3 | manual | Reference-page structure is documented because no product template applies |
  | LAY-4 | manual | Running text is capped between 48ch and 70ch |
  | LAY-5 | manual | Reading density remains open; evidence appears only after a second action |
  | LAY-6 | manual | Section edges align to one shared max-width and gutter system |
  | LAY-7 | manual | The hero leads, followed by product understanding and FAQ |

### Independent evaluator verdict

VERDICT: PASS

CONTRACT COMPLIANCE

- Separate “Product at a glance” and “FAQ” navigation — met.
- Four complete, uncropped product screens — met.
- Event concerns shown as quotes without Pigeonhole UI — met.
- Accessible topic tabs and card accordions — met.
- Evidence and limitations available through a second disclosure — met.
- Usable reflow at 320, 360, 768 and 1280 — met.

PLAN FIDELITY

Pass. The implementation amendment explicitly makes the approved card decision the authority where the earlier plan differs.

BLOCKING

- None.

ADVISORY

- None.

QUALITY GRADES: design quality **strong** / originality **strong** / craft **strong** / functionality **strong**

- Design quality — clear hierarchy and a purposeful progression from product understanding to concerns and answers.
- Originality — the quote rail and interactive FAQ cards add character without unnecessary novelty.
- Craft — responsive behavior, interaction states, typography, spacing and copy now read as deliberate throughout.
- Functionality — readers can understand the prototype, inspect concerns and reach evidence without a dead end.

RE-EVALUATED CONTROL NOTES

- [A11Y-1] pass — `--color-faq-ink-faint` at 0.68 opacity resolves to approximately 5.15:1 against the FAQ paper background, clearing the 4.5:1 requirement for small text.
- [SLP-9] pass — the malformed dinner-table sentence is replaced with clear, natural prose.
- [Plan fidelity] pass — the amendment explicitly supersedes the Pigeonhole-image and focused-panel directions.

All previously passing control findings remain unchanged. Dark mode remains N/A because the product has no dark mode.

## Ratchet

ratchet: no proposal — nothing uncovered
