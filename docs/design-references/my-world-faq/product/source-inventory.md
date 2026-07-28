# My World FAQ — current product screenshot inventory

These screenshots were captured from the current branch on 2026-07-28 to
explain the product loop. They show the real interface with the repository's
synthetic `demo-a` fixture; they are not screenshots of a real student.

## Capture conditions

- Local origin: `http://127.0.0.1:3002`
- Viewport: 430 × 932 CSS pixels
- Auth: local `DEV_BYPASS_AUTH=demo-a`
- Capture-time Connector: disabled with
  `VITE_DEMO_CONNECTOR_AT_CAPTURE=0`
- Fixture source: `test/ablation/fixtures/seed-multistudent.json`
- Browser actions were read-only. No reflection was submitted, no
  sensemaking job was run, and no Confirm/Forget action was taken.
- Product screenshots contain the synthetic names and reflection copy needed
  to demonstrate the interface. Every caption must identify the data as
  synthetic.

## One-to-one inventory

| ID | Route/state | Dimensions | SHA-256 | What it demonstrates |
|---|---|---:|---|---|
| `product-01-capture` | `/`, Capture open in Text mode | 430×932 | `1659716733c8e9df6a6a77db97b0e603462337f6ceaec7c3c8738382cead7a1f` | Voice/text/feeling/image capture choices without submitting a reflection |
| `product-02-sensemake` | `/profile`, Values | 430×932 | `3cd20fa855475e3d80ff71ca81d8e6716c6afb432013a25a9ddcb2989e5fb21d` | The reviewable My Identity surface compiled from synthetic reflection evidence |
| `product-03-review` | `/history?filter=need-review`, synthetic entry open | 430×932 | `41a08c1be5279729830143a8fe6fc055af3e65555ee22d5c45745215e4ec491a` | Story reframe, validation, inferred meaning, transcript and pending-review status |
| `product-04-act-return` | `/trajectory`, first pathway selected | 430×932 | `1067d74d71b742374ab5666726d5389c882b6ee5d4b8abfb51cd352902dd4631` | Path Finder's current exploration framing and evidence-linked pathway—not task tracking or proven follow-through |

## Handling and publication check

- Originals stay under `product/originals/`; web copies live under
  `public/my-world-faq/product/`.
- The PNGs contain no `tEXt`, `zTXt`, `iTXt`, `eXIf`, or `tIME` chunks. Public
  copies are byte-for-byte copies of the clean originals.
- No crop, annotation, blur, or generated replacement was applied.
- Before sharing beyond the exact-link review group, a product owner must
  confirm the screens still match the current interaction model and that the
  synthetic fixture copy is suitable for that audience.
