# Plan 042: Archive the Character Studio — remove `character-studio/` from main behind a recovery tag

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a9e1364e..HEAD -- character-studio/ package.json docs/companion-handoff.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" facts against the live repo before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (pure removal behind a tag; nothing in the product app imports it)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `a9e1364e`, 2026-07-23

## Why this matters

Operator decision (2026-07-23): "kill the character studio for now and archive
it." The Character Studio was a completed internal tool suite (plans 001–012 in
`plans/README.md`) whose output — a `.companion.glb` runtime — was never wired
into the product app (`grep -rn "companion.glb\|companion-runtime\|loadCompanion" src/`
returns nothing). It is 353 tracked files (~52k lines) plus a large untracked
`node_modules`/asset footprint (~328 MB on disk) sitting at the repo root,
inflating clones, searches, and cognitive load while the team focuses on the
demo. Archiving = delete from main behind a recovery tag; nothing is lost.

## Current state

Facts, all verified at `a9e1364e`:

- `character-studio/` exists at the repo root: **353 git-tracked files**
  (`git ls-files character-studio | wc -l` → 353); ~328 MB on disk (mostly
  untracked `node_modules` and generated assets — the tracked content is the
  ~52k-line source tree).
- It is an **isolated pnpm root**, NOT a member of the root workspace:
  `pnpm-workspace.yaml` `packages:` lists only `'.'` and `island-editor`. So
  root `pnpm install` / `pnpm check` / `pnpm test` / `pnpm build` never touch
  it — removal cannot break the app's gates.
- Root `package.json` references it in exactly two scripts:

  ```json
  // package.json:9,14
  "dev:character-studio": "pnpm -C character-studio dev",
  "check:character-studio": "pnpm -C character-studio typecheck && pnpm -C character-studio test",
  ```

  `check:all` (line 15) runs only `check` + `check:island-editor` — it does
  NOT include character-studio.
- `CLAUDE.md` does not mention `character-studio`
  (`grep -n "character-studio" CLAUDE.md` → no matches; its "standalone
  studios" paragraph names only `island-editor/` and `bird-builder/`).
- **Branch reality — important, and contrary to what the plans index
  implies**: the tip of `origin/feat/character-studio` (`69df9988`, the
  merge-base with main) does **not** contain a `character-studio/` directory
  at all (`git ls-tree origin/feat/character-studio --name-only` lists no such
  path; `git diff --stat origin/feat/character-studio..HEAD -- character-studio/`
  shows all 353 files as insertions). `origin/character-studio/bird-villager-remodel`
  (tip `6f749ffd`) holds an **older** copy. The current, most-complete copy of
  the studio exists **only on main's HEAD**. Therefore the recovery tag in
  Step 1 is mandatory, not belt-and-braces.
- `docs/companion-handoff.md` documents the exported `.companion.glb`
  contract; it stays as historical reference and gets a short archive banner.
- Other references to the string `character-studio` exist in `plans/*.md`,
  `advisor-plans/*.md`, `docs/*`, and memory notes — those are historical
  records and must NOT be edited (except the one banner in
  `docs/companion-handoff.md`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Lint + typecheck | `pnpm check` | exit 0 (18 pre-existing lint warnings OK, 0 errors) |
| Full tests | `pnpm test` | 10 pre-existing failures in 5 files (see plans/034) — no NEW failures |
| Tag exists | `git tag -l 'archive/character-studio-*'` | prints the tag name |
| Dir gone | `test -d character-studio; echo $?` | `1` |

## Scope

**In scope** (the only paths you should modify):
- `character-studio/` (delete, via `git rm -r`)
- `package.json` (remove 2 script lines)
- `docs/companion-handoff.md` (prepend one archive-note paragraph — append-only edit; change nothing else in the file)
- The git tag `archive/character-studio-2026-07-23` (create)

**Out of scope** (do NOT touch, even though they look related):
- `bird-builder/` and `island-editor/` — live standalone studios.
- `plans/**` and `advisor-plans/**` — historical records of the studio's
  execution; leave every mention intact (the README status table already says
  the suite lives on a branch; do not rewrite history to match the deletion).
- `docs/**` other than the single banner in `companion-handoff.md`.
- `pnpm-workspace.yaml`, `pnpm-lock.yaml`, root `biome.json` / `tsconfig.json`
  / `vitest.config.ts` — none reference character-studio; there is nothing to
  clean there.
- Any attempt to wire the companion runtime into the app — explicitly rejected
  by the operator for now.
- The remote branches `feat/character-studio` and
  `character-studio/bird-villager-remodel` — do not delete them.

## Git workflow

- Branch: `advisor/042-archive-character-studio`
- Conventional commits, e.g. `chore(character-studio): archive — remove from main behind archive/character-studio-2026-07-23 tag`
- The tag is created on **main's current HEAD** (`a9e1364e` or later), not on
  the advisor branch, so recovery does not depend on this branch surviving.
- Do NOT push the branch or the tag, and do NOT open a PR, unless the operator
  instructed it. Note in your report that the tag must be pushed
  (`git push origin archive/character-studio-2026-07-23`) when the removal
  merges, or the archive is local-only.

## Steps

### Step 1: Create the recovery tag at current main HEAD

```sh
git tag archive/character-studio-2026-07-23 $(git rev-parse HEAD)
```

Rationale (inline because it is load-bearing): the studio's current copy
exists only on main — `origin/feat/character-studio` does not contain the
directory and `origin/character-studio/bird-villager-remodel` is stale. The
tag makes recovery one command regardless of what happens to any branch.

**Verify**: `git tag -l 'archive/character-studio-*'` → `archive/character-studio-2026-07-23`, and `git ls-tree archive/character-studio-2026-07-23 --name-only | grep -c '^character-studio$'` → `1`.

### Step 2: Remove the directory on the advisor branch

```sh
git checkout -b advisor/042-archive-character-studio
git rm -r character-studio
```

`git rm` only removes tracked files; the untracked `node_modules`/asset
residue may remain on disk. Remove the leftover directory with
`rm -rf character-studio` afterward (it is untracked residue only — confirm
`git status` shows no `character-studio` entries first).

**Verify**: `test -d character-studio; echo $?` → `1`; `git ls-files character-studio | wc -l` → `0`.

### Step 3: Remove the two package.json scripts

Delete lines `"dev:character-studio": …` and `"check:character-studio": …`
from root `package.json` (currently lines 9 and 14). Touch nothing else in the
file.

**Verify**: `grep -c "character-studio" package.json` → `0`; `pnpm check` → exit 0.

### Step 4: Sweep for remaining live-tooling references

```sh
grep -rn "character-studio" --exclude-dir=node_modules --exclude-dir=plans --exclude-dir=advisor-plans --exclude-dir=docs --exclude-dir=.git .
```

Expected: **no matches** (as of `a9e1364e`, the only live references are the
two package.json scripts removed in Step 3). If a new live reference appeared
since (a script in `scripts/`, a CI file, an import), remove or update only
that reference; if it is anything more entangled than a path string, STOP.

**Verify**: the grep above → exit 1 (no matches).

### Step 5: Archive banner on the handoff doc

Prepend to `docs/companion-handoff.md` (immediately after its title line) one
paragraph:

> **Archived 2026-07-23.** The Character Studio was removed from main
> (operator decision: park it for now). The complete final source lives at
> git tag `archive/character-studio-2026-07-23` (and in main's history via
> `git log -- character-studio/`). This document remains as the export-contract
> reference for the `.companion.glb` format should the studio be revived.

Change nothing else in the file.

**Verify**: `head -10 docs/companion-handoff.md` shows the banner; `git diff --stat -- docs/companion-handoff.md` shows exactly 1 file changed with only additions.

### Step 6: Full gates

**Verify**: `pnpm check` → exit 0. `pnpm test` → no NEW failures (10 pre-existing failures in 5 files are known; if plans/034 landed first, the suite must be fully green). `pnpm check:island-editor` → passes (proves the sibling studio is untouched).

## Test plan

No new tests — this plan removes an isolated workspace the root gates never
covered. The done-criteria commands below ARE the test plan; run them all.
The one behavioral assertion worth making explicit: `pnpm check:island-editor`
must pass after the removal, proving workspace isolation held.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `git tag -l 'archive/character-studio-*'` prints `archive/character-studio-2026-07-23`
- [ ] `git ls-tree archive/character-studio-2026-07-23 --name-only | grep -c '^character-studio$'` → `1`
- [ ] `test -d character-studio` exits 1 on the advisor branch
- [ ] `grep -c "character-studio" package.json` → `0`
- [ ] Step 4's repo-wide grep (with the listed excludes) → no matches
- [ ] `docs/companion-handoff.md` has the archive banner and no other changes
- [ ] `pnpm check` exits 0; `pnpm test` has no new failures; `pnpm check:island-editor` passes
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated
- [ ] Report notes that the tag must be pushed alongside the merge

## STOP conditions

Stop and report back (do not improvise) if:

- `git ls-files character-studio | wc -l` is not 353 (the tree drifted — new
  work may have landed in the studio since this plan; the operator must
  re-confirm the archive decision).
- Step 4's grep finds a live reference that is more than a removable path
  string (e.g. product code importing from `character-studio/`).
- `pnpm check` or `pnpm check:island-editor` fails after the removal — that
  would mean the isolation assumption was wrong; do not "fix forward."
- You are tempted to edit anything under `plans/` or `advisor-plans/` beyond
  this plan's own status row — don't; those are historical records.

## Maintenance notes

**How to resurrect the studio** (for whoever needs it later):

```sh
git checkout archive/character-studio-2026-07-23 -- character-studio
cd character-studio && pnpm install
```

then re-add the two package.json scripts removed in Step 3. The export
contract for its `.companion.glb` output remains documented in
`docs/companion-handoff.md`.

- The tag only protects the archive if it is **pushed**; the reviewer merging
  this must run `git push origin archive/character-studio-2026-07-23`.
- `plans/README.md`'s Character Studio table (plans 001–012) intentionally
  still describes the suite; a future reconcile pass may add a one-line
  "archived, see tag" note there, but that is deferred out of this plan to
  keep the diff mechanical.
- If the operator later revives the studio, the memory/plan notes about
  Blender asset regeneration (`pnpm gen:assets`, headless Blender) live in the
  studio's own README and `plans/000-architecture-and-strategy.md`.
