import { createFileRoute, notFound } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRight,
  Box,
  Component,
  FileJson,
  Layers,
  Move,
  Palette,
  Ruler,
  Sparkles,
  Type,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/ui/alert-dialog'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '~/components/ui/drawer'
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group'
import { Textarea } from '~/components/ui/textarea'
import {
  DIMENSION_LABEL,
  PROFILE_COLORS,
  PROFILE_HEADERS,
} from '~/engine/student-space/Game/View/profile-tokens.constants.js'
import { cn } from '~/lib/utils'
// Engine CSS is already loaded on `/` via StudentSpaceHost — re-importing here
// makes the chrome classes (.sheet-chrome, .sheet-chrome__content) and engine
// token defaults available when this route is opened directly in dev.
import '~/engine/student-space/style.css'

export const Route = createFileRoute('/dev/design')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  component: DesignSystemPage,
})

type StackKey = 'react' | 'engine'

interface TokenDef {
  name: string
  initial: string
  stack: StackKey
  /** Where the canonical declaration lives — surfaced in the diff section. */
  source: string
  /** Human-readable note next to the swatch. */
  note?: string
}

const REACT_TOKENS: TokenDef[] = [
  {
    name: '--color-background',
    initial: 'oklch(0.99 0 0)',
    stack: 'react',
    source: 'src/styles.css',
  },
  {
    name: '--color-foreground',
    initial: 'oklch(0.18 0 0)',
    stack: 'react',
    source: 'src/styles.css',
  },
  {
    name: '--color-muted',
    initial: 'oklch(0.96 0 0)',
    stack: 'react',
    source: 'src/styles.css',
  },
  {
    name: '--color-muted-foreground',
    initial: 'oklch(0.45 0 0)',
    stack: 'react',
    source: 'src/styles.css',
  },
  {
    name: '--color-border',
    initial: 'oklch(0.92 0 0)',
    stack: 'react',
    source: 'src/styles.css',
  },
  {
    name: '--color-accent',
    initial: 'oklch(0.6 0.18 256)',
    stack: 'react',
    source: 'src/styles.css',
    note: 'Cool blue — drifts from engine warm CTA.',
  },
  {
    name: '--color-accent-foreground',
    initial: 'oklch(0.99 0 0)',
    stack: 'react',
    source: 'src/styles.css',
  },
  {
    name: '--color-warning',
    initial: 'oklch(0.78 0.16 70)',
    stack: 'react',
    source: 'src/styles.css',
  },
]

const ENGINE_TOKENS: TokenDef[] = [
  // Sky
  {
    name: '--sky-top',
    initial: 'rgb(26, 74, 130)',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
    note: 'Sky gradient top — rewritten each frame by CssSky.js.',
  },
  {
    name: '--sky-mid',
    initial: 'rgb(96, 216, 232)',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  {
    name: '--sky-bottom',
    initial: 'rgb(255, 240, 80)',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  // Ink
  {
    name: '--ink',
    initial: '#1a2b3a',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
    note: 'Primary engine text color.',
  },
  // CTA
  {
    name: '--cta-accent',
    initial: '#C99B73',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
    note: "Warm tan — the engine's primary action color.",
  },
  {
    name: '--cta-soft',
    initial: 'rgba(232, 184, 148, 0.16)',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  {
    name: '--cta-ink',
    initial: '#3A2A1E',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  // Facet (Values facet — historical naming, the bare --facet-* family)
  {
    name: '--facet-accent',
    initial: '#A07659',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
    note: 'Matches Values dimension. Kept in sync with PROFILE_COLORS.values.',
  },
  {
    name: '--facet-soft',
    initial: '#EAD7BE',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  {
    name: '--facet-ink',
    initial: '#6A4A26',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  // Personality facet (Personality dimension)
  {
    name: '--facet-personality-accent',
    initial: '#8E6FB8',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
    note: 'Matches Personality dimension. Kept in sync with PROFILE_COLORS.personality.',
  },
  {
    name: '--facet-personality-soft',
    initial: '#E8DDF2',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  {
    name: '--facet-personality-ink',
    initial: '#4C3470',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  // Onboarding
  {
    name: '--onb-bg-cream',
    initial: '#faf2e3',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  {
    name: '--onb-bg-deep',
    initial: '#0f1224',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  {
    name: '--onb-ink',
    initial: '#2b2620',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  {
    name: '--onb-ink-soft',
    initial: 'rgba(43, 38, 32, 0.62)',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  {
    name: '--onb-ink-faint',
    initial: 'rgba(43, 38, 32, 0.32)',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  {
    name: '--onb-accent',
    initial: '#ff8a5c',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  {
    name: '--onb-accent-deep',
    initial: '#e26a3c',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  {
    name: '--onb-card',
    initial: 'rgba(255, 255, 255, 0.92)',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  {
    name: '--onb-card-line',
    initial: 'rgba(43, 38, 32, 0.10)',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  {
    name: '--onb-shadow',
    initial: '0 8px 28px rgba(43, 38, 32, 0.10)',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
  },
  {
    name: '--onb-ease',
    initial: 'cubic-bezier(0.22, 1, 0.36, 1)',
    stack: 'engine',
    source: 'src/engine/student-space/style.css',
    note: 'Onboarding ease curve. Not a color.',
  },
]

const SECTIONS = [
  { id: 'patterns', label: 'Pattern conventions', icon: Sparkles },
  { id: 'cli', label: 'shadcn CLI proposal', icon: FileJson },
  { id: 'react-color', label: 'Color — React stack', icon: Palette },
  { id: 'engine-color', label: 'Color — Engine stack', icon: Palette },
  { id: 'drift', label: 'Drift report', icon: AlertTriangle },
  { id: 'type', label: 'Typography', icon: Type },
  { id: 'space', label: 'Spacing & radii', icon: Ruler },
  { id: 'surface', label: 'Surfaces & elevation', icon: Layers },
  { id: 'react-primitives', label: 'React primitives', icon: Component },
  { id: 'engine-surfaces', label: 'Engine surfaces', icon: Box },
  { id: 'vips', label: 'VIPS profile cards', icon: Sparkles },
  { id: 'icons', label: 'Iconography', icon: Sparkles },
  { id: 'motion', label: 'Motion', icon: Move },
  { id: 'diff', label: 'Diff to apply', icon: FileJson },
] as const

function DesignSystemPage() {
  // Live override buffer — every tweak writes to :root via useEffect and is
  // tracked here so the diff section at the bottom can reproduce the changes.
  const [overrides, setOverrides] = useState<Record<string, string>>({})

  useEffect(() => {
    const root = document.documentElement
    for (const [name, value] of Object.entries(overrides)) {
      root.style.setProperty(name, value)
    }
    return () => {
      // Cleanup is intentionally skipped: tweaks should persist while
      // navigating around the page. To reset, the user clicks "Reset all"
      // which clears overrides and removes the inline styles.
    }
  }, [overrides])

  function setToken(name: string, value: string) {
    setOverrides((prev) => ({ ...prev, [name]: value }))
  }

  function resetAll() {
    const root = document.documentElement
    for (const name of Object.keys(overrides)) {
      root.style.removeProperty(name)
    }
    setOverrides({})
  }

  return (
    // Force Inter for the surrounding page chrome — the engine CSS we just
    // imported sets --font-sans to Plus Jakarta Sans on :root, which would
    // otherwise swap the entire page font. Engine-content previews opt back
    // into Plus Jakarta Sans explicitly where they need it.
    <div
      className="mx-auto w-full max-w-6xl pb-24"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <PageHeader overrideCount={Object.keys(overrides).length} onReset={resetAll} />
      <SectionNav />
      <PatternConventions />
      <CliProposal />
      <ColorTokens
        title="Color — React stack"
        anchor="react-color"
        tokens={REACT_TOKENS}
        onTweak={setToken}
        overrides={overrides}
      />
      <ColorTokens
        title="Color — Engine stack"
        anchor="engine-color"
        tokens={ENGINE_TOKENS.filter((t) => t.name !== '--onb-shadow' && t.name !== '--onb-ease')}
        onTweak={setToken}
        overrides={overrides}
      />
      <DriftReport />
      <Typography />
      <SpacingAndRadii />
      <SurfacesAndElevation />
      <ReactPrimitivesGallery />
      <EngineSurfacesStage />
      <VipsCards />
      <Iconography />
      <Motion />
      <DiffSection overrides={overrides} />
    </div>
  )
}

function PageHeader({ overrideCount, onReset }: { overrideCount: number; onReset: () => void }) {
  return (
    <header className="border-b border-border pb-6 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Dev · design system
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            shadcn/ui patterns on Base UI + Tailwind v4
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            One canvas for every visual primitive in the Sensemaking Agents app. Tweaks update{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">:root</code> live and the diff at
            the bottom shows what to copy into the three token files.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={overrideCount > 0 ? 'accent' : 'secondary'}>
            {overrideCount === 0
              ? 'No live tweaks'
              : `${overrideCount} live tweak${overrideCount === 1 ? '' : 's'}`}
          </Badge>
          {overrideCount > 0 ? (
            <Button variant="outline" size="sm" onClick={onReset}>
              Reset all
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  )
}

function SectionNav() {
  return (
    <nav className="sticky top-0 z-20 my-6 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
      <ul className="flex flex-wrap gap-2 text-xs">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <s.icon className="size-3" />
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function SectionShell({
  id,
  title,
  subtitle,
  children,
}: {
  id: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-border py-8">
      <header className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </section>
  )
}

function PatternConventions() {
  return (
    <SectionShell
      id="patterns"
      title="Pattern conventions"
      subtitle="How this codebase composes UI today — shadcn architectural patterns on a Base UI primitive layer, with Tailwind v4 tokens in CSS."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ConventionCard
          title="cn() — clsx + tailwind-merge"
          file="src/lib/utils.ts"
          snippet={`export function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs))\n}`}
        />
        <ConventionCard
          title="cva() variants"
          file="src/components/ui/button.tsx"
          snippet={`const buttonVariants = cva(\n  'inline-flex items-center justify-center …',\n  { variants: { variant: { … }, size: { … } } },\n)`}
        />
        <ConventionCard
          title="Base UI primitive imports"
          file="src/components/ui/dialog.tsx"
          snippet={`import { Dialog as BaseDialog } from\n  '@base-ui-components/react/dialog'`}
        />
        <ConventionCard
          title="Base UI transition attributes"
          file="src/components/ui/dialog.tsx"
          snippet={`'data-[starting-style]:opacity-0\n data-[ending-style]:opacity-0\n data-[starting-style]:scale-95'`}
        />
        <ConventionCard
          title="Tailwind v4 theme in CSS"
          file="src/styles.css"
          snippet={`@import 'tailwindcss';\n\n@theme {\n  --color-background: oklch(0.99 0 0);\n  --color-foreground: oklch(0.18 0 0);\n  --color-accent: oklch(0.6 0.18 256);\n  --font-sans: 'Inter', system-ui, sans-serif;\n}`}
        />
        <ConventionCard
          title="forwardRef + displayName"
          file="src/components/ui/card.tsx"
          snippet={`export const Card = forwardRef<…>(…)\nCard.displayName = 'Card'`}
        />
      </div>
      <Card className="mt-5 border-warning/40 bg-warning/5">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">
            Do not install Radix
          </CardTitle>
          <CardDescription className="text-xs">
            The primitive layer is{' '}
            <code className="rounded bg-muted px-1 py-0.5">
              @base-ui-components/react@1.0.0-rc.0
            </code>
            . shadcn officially supports Base UI as of January 2026. New primitives must come from{' '}
            <code className="rounded bg-muted px-1 py-0.5">--base base-ui</code> — never from the
            Radix variant.
          </CardDescription>
        </CardHeader>
      </Card>
    </SectionShell>
  )
}

function ConventionCard({
  title,
  file,
  snippet,
}: {
  title: string
  file: string
  snippet: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <CardDescription className="font-mono text-[11px] text-muted-foreground">
          {file}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-foreground">
          {snippet}
        </pre>
      </CardContent>
    </Card>
  )
}

function CliProposal() {
  const proposal = `{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "~/components",
    "ui": "~/components/ui",
    "lib": "~/lib",
    "utils": "~/lib/utils",
    "hooks": "~/hooks"
  },
  "iconLibrary": "lucide"
}`
  return (
    <SectionShell
      id="cli"
      title="shadcn CLI proposal"
      subtitle="Draft components.json so future primitives can be installed via the CLI against the Base UI variant — instead of being hand-rolled. Live at /components.json."
    >
      <Card className="border-accent/40 bg-accent/5">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">Proposal — not adopted</CardTitle>
            <Badge variant="accent-soft" size="sm">
              draft
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Confirm with{' '}
            <code className="rounded bg-muted px-1 py-0.5">
              npx shadcn@latest init -d --base base-ui
            </code>{' '}
            (in a throwaway branch) before adopting. The CLI may normalise{' '}
            <code className="rounded bg-muted px-1 py-0.5">style</code> to its current canonical
            Base UI form.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {proposal}
          </pre>
          <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
            <span>To add a missing primitive once adopted:</span>
            <code className="rounded border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground">
              npx shadcn@latest add tooltip --base base-ui
            </code>
          </div>
        </CardContent>
      </Card>
    </SectionShell>
  )
}

function ColorTokens({
  title,
  anchor,
  tokens,
  onTweak,
  overrides,
}: {
  title: string
  anchor: string
  tokens: TokenDef[]
  onTweak: (name: string, value: string) => void
  overrides: Record<string, string>
}) {
  return (
    <SectionShell
      id={anchor}
      title={title}
      subtitle="Each swatch reads from :root. Tweaks write to :root immediately so React primitives + engine surfaces re-paint live."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tokens.map((token) => (
          <SwatchCard
            key={token.name}
            token={token}
            current={overrides[token.name] ?? token.initial}
            onTweak={(value) => onTweak(token.name, value)}
          />
        ))}
      </div>
    </SectionShell>
  )
}

function SwatchCard({
  token,
  current,
  onTweak,
}: {
  token: TokenDef
  current: string
  onTweak: (value: string) => void
}) {
  const swatchRef = useRef<HTMLDivElement | null>(null)
  const [resolved, setResolved] = useState<string>('')

  useEffect(() => {
    if (!swatchRef.current) return
    // Read the *computed* color so we can populate the native color picker
    // even when the token is declared in oklch or rgb. Referencing `current`
    // here is intentional — it is the trigger that tells us the :root override
    // has been applied and the DOM has been re-painted.
    void current
    const cs = getComputedStyle(swatchRef.current)
    setResolved(cs.backgroundColor)
  }, [current])

  const hex = useMemo(() => rgbStringToHex(resolved), [resolved])
  const isColor = !token.name.includes('shadow') && !token.name.includes('ease')

  return (
    <Card className="overflow-hidden p-0">
      <div
        ref={swatchRef}
        role="img"
        aria-label={`${token.name} swatch`}
        className="h-20 w-full"
        style={{ background: `var(${token.name})` }}
      />
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <code className="font-mono text-[11px] font-semibold text-foreground">{token.name}</code>
          <Badge variant="outline" size="sm" radius="sm">
            {token.stack}
          </Badge>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          {current}
          {hex && hex !== current.toLowerCase() ? (
            <span className="ml-1 text-muted-foreground/70">· {hex}</span>
          ) : null}
        </p>
        {token.note ? <p className="text-[11px] text-muted-foreground">{token.note}</p> : null}
        {isColor ? (
          <label className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <input
              type="color"
              value={hex || '#000000'}
              onChange={(e) => onTweak(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded border border-border bg-background"
              aria-label={`Tweak ${token.name}`}
            />
            <span>Native picker writes hex — original form preserved in diff.</span>
          </label>
        ) : (
          <p className="text-[10px] text-muted-foreground">Non-color token — edit via the diff.</p>
        )}
        <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">{token.source}</p>
      </div>
    </Card>
  )
}

function rgbStringToHex(rgb: string): string {
  // Accepts "rgb(R, G, B)" or "rgba(R, G, B, A)" — returns "#rrggbb".
  if (!rgb) return ''
  const m = rgb.match(/rgba?\(([^)]+)\)/i)
  if (!m?.[1]) return ''
  const parts = m[1].split(',').map((p) => Number.parseFloat(p.trim()))
  const r = parts[0]
  const g = parts[1]
  const b = parts[2]
  if (r === undefined || g === undefined || b === undefined) return ''
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

interface DriftRow {
  topic: string
  react: string
  engine: string
  verdict: 'harmonize' | 'keep separate' | 'TBD'
  note: string
}

const DRIFT_ROWS: DriftRow[] = [
  {
    topic: 'Primary action color',
    react: '--color-accent: oklch(0.6 0.18 256)  (cool blue)',
    engine: '--cta-accent: #C99B73  (warm tan)',
    verdict: 'TBD',
    note: 'React stack inherited a generic shadcn blue; engine is intentionally warm. Decide whether the React stack adopts the engine palette or stays neutral.',
  },
  {
    topic: 'Body font',
    react: "--font-sans: 'Inter', system-ui, sans-serif",
    engine: "--font-sans: 'Plus Jakarta Sans', system-ui, sans-serif",
    verdict: 'TBD',
    note: 'Both stacks define --font-sans on :root with different families. Whichever stylesheet loads later wins — currently the engine sheet wins inside the app shell. Pick one or namespace.',
  },
  {
    topic: 'Neutral palette',
    react: 'oklch grayscale (--color-background, --color-foreground, --color-border)',
    engine: 'warm hex (--ink #1a2b3a, --onb-bg-cream #faf2e3)',
    verdict: 'keep separate',
    note: 'React neutrals are deliberately blank-canvas; engine neutrals are warm to support the sky gradient. Document the split rather than converge.',
  },
  {
    topic: 'Border radius',
    react: 'Tailwind defaults (rounded-md, rounded-lg)',
    engine: '28px on bottom sheets, 999px on capture pills (style.css)',
    verdict: 'TBD',
    note: 'No shared radius scale. Capture a token like --radius-sheet-grip and reuse.',
  },
  {
    topic: 'Backdrop blur',
    react: 'data-[starting-style]:opacity-0 — no blur',
    engine: 'backdrop-filter: blur(10px) on .sheet-chrome',
    verdict: 'harmonize',
    note: "React drawers and dialogs should match the engine's 10px blur for SheetChrome parity — the CLAUDE.md sheet contract explicitly calls this out.",
  },
]

function DriftReport() {
  return (
    <SectionShell
      id="drift"
      title="Drift report"
      subtitle="Where the two stacks visibly disagree. Mark each row harmonize / keep separate / TBD as you decide."
    >
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Topic</th>
              <th className="px-3 py-2 font-medium">React stack</th>
              <th className="px-3 py-2 font-medium">Engine stack</th>
              <th className="px-3 py-2 font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {DRIFT_ROWS.map((row) => (
              <tr key={row.topic} className="border-t border-border align-top">
                <td className="px-3 py-3 font-medium text-foreground">{row.topic}</td>
                <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">
                  {row.react}
                </td>
                <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">
                  {row.engine}
                </td>
                <td className="px-3 py-3">
                  <Badge
                    variant={
                      row.verdict === 'harmonize'
                        ? 'accent'
                        : row.verdict === 'keep separate'
                          ? 'secondary'
                          : 'warning'
                    }
                    size="sm"
                  >
                    {row.verdict}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
        {DRIFT_ROWS.map((row) => (
          <li key={row.topic}>
            <span className="font-medium text-foreground">{row.topic}:</span> {row.note}
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}

function Typography() {
  const inter = "'Inter', system-ui, sans-serif"
  const pjs = "'Plus Jakarta Sans', system-ui, sans-serif"
  return (
    <SectionShell
      id="type"
      title="Typography"
      subtitle="Both stacks define their own --font-sans; the two are previewed side-by-side here."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">React stack — Inter</CardTitle>
            <CardDescription className="font-mono text-[11px]">src/styles.css</CardDescription>
          </CardHeader>
          <CardContent className="gap-3" style={{ fontFamily: inter }}>
            <TypeSpecimen size="text-3xl" weight="font-semibold" label="Display / 30px / 600" />
            <TypeSpecimen
              size="text-xl"
              weight="font-semibold"
              label="Section title / 20px / 600"
            />
            <TypeSpecimen size="text-base" weight="font-medium" label="Body lead / 16px / 500" />
            <TypeSpecimen size="text-sm" weight="font-normal" label="Body / 14px / 400" />
            <TypeSpecimen size="text-xs" weight="font-medium" label="Eyebrow / 12px / 500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Engine stack — Plus Jakarta Sans</CardTitle>
            <CardDescription className="font-mono text-[11px]">
              src/engine/student-space/style.css
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-3" style={{ fontFamily: pjs }}>
            <TypeSpecimen
              size="text-3xl"
              weight="font-semibold"
              label="Sheet header / clamp(1.6, 4vw, 2.25rem)"
            />
            <TypeSpecimen size="text-xl" weight="font-semibold" label="Profile title / 1.75rem" />
            <TypeSpecimen size="text-base" weight="font-medium" label="Subtitle / 1rem" />
            <TypeSpecimen size="text-sm" weight="font-normal" label="Body / 0.95rem" />
            <TypeSpecimen
              size="text-xs"
              weight="font-medium"
              label="Eyebrow / 0.75rem / uppercase"
            />
          </CardContent>
        </Card>
      </div>
    </SectionShell>
  )
}

function TypeSpecimen({ size, weight, label }: { size: string; weight: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 pb-2 last:border-b-0">
      <p className={cn(size, weight, 'text-foreground leading-tight')}>The mirror remembers</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function SpacingAndRadii() {
  const spaces = [4, 8, 12, 16, 20, 24, 32, 48]
  const radii = [
    { name: 'rounded-sm', value: '2px' },
    { name: 'rounded-md', value: '6px' },
    { name: 'rounded-lg', value: '8px' },
    { name: 'rounded-xl', value: '12px' },
    { name: 'rounded-2xl', value: '16px' },
    { name: 'rounded-[28px] (drawer)', value: '28px' },
    { name: 'rounded-full', value: '9999px' },
  ]
  return (
    <SectionShell
      id="space"
      title="Spacing & radii"
      subtitle="The implicit scale Tailwind v4 inherits, plus the radii currently used by chrome surfaces."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Spacing scale</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {spaces.map((s) => (
                <div key={s} className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="w-14 font-mono text-foreground">{s}px</span>
                  <span className="h-3 rounded bg-accent" style={{ width: `${s * 2}px` }} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Border radii</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {radii.map((r) => (
                <div key={r.name} className="flex flex-col items-center gap-1">
                  <div
                    className="size-14 border border-border bg-muted"
                    style={{ borderRadius: r.value }}
                  />
                  <p className="font-mono text-[10px] text-foreground">{r.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{r.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </SectionShell>
  )
}

function SurfacesAndElevation() {
  const sheetChromeRef = useRef<HTMLDivElement | null>(null)
  const [chromeOpen, setChromeOpen] = useState(false)

  useEffect(() => {
    // Lazy-construct a minimal SheetChrome demo. We can't import SheetChrome
    // statically because it pulls OverlayController which calls
    // document.body.classList — which would break SSR. Defer the import to
    // the effect so it runs only in the browser, and only when the user
    // clicks "Open sheet chrome demo."
    if (!chromeOpen) return
    let chrome: { dispose?: () => void } | null = null
    let cancelled = false

    void (async () => {
      const [{ default: OverlayController }, { default: SheetChrome }] = await Promise.all([
        import('~/engine/student-space/Game/View/OverlayController.js'),
        import('~/engine/student-space/Game/View/SheetChrome.js'),
      ])
      if (cancelled) return
      // The singleton may already exist if the user navigated here from `/`.
      if (!OverlayController.getInstance()) {
        new OverlayController()
      }
      const instance = new SheetChrome({
        key: 'dev-design-demo',
        sheetClassName: 'dev-design-demo-sheet',
        withCloseButton: true,
        closeOnBackdrop: true,
        header: {
          eyebrow: 'CHROME DEMO',
          title: 'This is SheetChrome',
          subtitle:
            'Every full-viewport engine sheet sits on this primitive — backdrop, 10px blur, 200ms fade, z-60.',
        },
        onClose: () => setChromeOpen(false),
      })
      // Per-sheet content goes in bodySlot when header is provided.
      instance.bodySlot.innerHTML = `
        <p style="font-size: 14px; line-height: 1.6; color: var(--ink); max-width: 32rem;">
          History, Profile, Letters, Path Finder, and Calendar all inherit this chrome.
          The contract is locked by CLAUDE.md — no sheet may hand-roll its own backdrop.
        </p>
      `
      // getInstance() may return undefined if the singleton was never
      // constructed; we constructed it a few lines up so this branch only
      // fires in a hypothetical race. Guard rather than non-null-assert.
      OverlayController.getInstance()?.open('dev-design-demo')
      chrome = instance
    })()

    return () => {
      cancelled = true
      try {
        chrome?.dispose?.()
      } catch {
        // ignored
      }
    }
  }, [chromeOpen])

  return (
    <SectionShell
      id="surface"
      title="Surfaces & elevation"
      subtitle="The sheet chrome contract — backdrop (rgba 0.55 → 0.92), 10px blur, 200ms fade, z-60. Open the live demo to see the actual primitive."
    >
      <div ref={sheetChromeRef} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">SheetChrome — live</CardTitle>
            <CardDescription className="font-mono text-[11px]">
              src/engine/student-space/Game/View/SheetChrome.js
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Mounts the real engine primitive (no game state required). Demonstrates the backdrop,
              blur, fade, and × button used by every full-viewport sheet.
            </p>
            <Button variant="accent" size="sm" onClick={() => setChromeOpen(true)}>
              Open sheet chrome demo
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Shadow scale</CardTitle>
            <CardDescription className="font-mono text-[11px]">
              Tailwind defaults + engine --onb-shadow
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <ShadowSwatch label="shadow-sm" cls="shadow-sm" />
              <ShadowSwatch label="shadow" cls="shadow" />
              <ShadowSwatch label="shadow-lg" cls="shadow-lg" />
              <ShadowSwatch label="--onb-shadow" style={{ boxShadow: 'var(--onb-shadow)' }} />
            </div>
          </CardContent>
        </Card>
      </div>
    </SectionShell>
  )
}

function ShadowSwatch({
  label,
  cls,
  style,
}: {
  label: string
  cls?: string
  style?: React.CSSProperties
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn('h-16 w-full rounded-md border border-border bg-background', cls)}
        style={style}
      />
      <p className="font-mono text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function ReactPrimitivesGallery() {
  return (
    <SectionShell
      id="react-primitives"
      title="React primitives"
      subtitle="Every src/components/ui/*.tsx in default + interactive states. Each card calls out which Base UI primitive it wraps."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <PrimitiveBlock title="Button" basePrim="(no Base UI dependency — pure cva)">
          <div className="flex flex-wrap gap-2">
            <Button>Default</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm">sm</Button>
            <Button size="default">default</Button>
            <Button size="lg">lg</Button>
          </div>
        </PrimitiveBlock>
        <PrimitiveBlock title="Badge" basePrim="(no Base UI dependency — pure cva)">
          <div className="flex flex-wrap gap-2">
            <Badge>default</Badge>
            <Badge variant="secondary">secondary</Badge>
            <Badge variant="accent">accent</Badge>
            <Badge variant="accent-soft">accent-soft</Badge>
            <Badge variant="outline">outline</Badge>
            <Badge variant="warning">warning</Badge>
          </div>
        </PrimitiveBlock>
        <PrimitiveBlock title="Card" basePrim="(no Base UI dependency)">
          <Card>
            <CardHeader>
              <CardTitle>Card title</CardTitle>
              <CardDescription>Description with --color-muted-foreground.</CardDescription>
            </CardHeader>
            <CardContent>Body text rendered in --color-foreground.</CardContent>
          </Card>
        </PrimitiveBlock>
        <PrimitiveBlock title="Textarea" basePrim="(native textarea)">
          <Textarea placeholder="Type something — focus ring uses --color-accent." />
        </PrimitiveBlock>
        <PrimitiveBlock
          title="Dialog"
          basePrim="@base-ui-components/react/dialog · uses data-[starting-style] for enter/exit"
        >
          <Dialog>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm">
                  Open dialog
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dialog title</DialogTitle>
                <DialogDescription>
                  Base UI Dialog wired via Backdrop + Popup. Enter/exit transitions use
                  data-[starting-style] / data-[ending-style] — not Radix's data-state.
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Press Escape, click the backdrop, or click the × button to close.
              </p>
            </DialogContent>
          </Dialog>
        </PrimitiveBlock>
        <PrimitiveBlock
          title="Drawer"
          basePrim="@base-ui-components/react/dialog · slides up via data-[starting-style]:translate-y-full"
        >
          <Drawer>
            <DrawerTrigger
              render={
                <Button variant="outline" size="sm">
                  Open drawer
                </Button>
              }
            />
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Drawer title</DrawerTitle>
              </DrawerHeader>
              <p className="text-sm text-muted-foreground">
                Bottom-anchored. Locks scroll, traps focus, dismisses on Escape and backdrop click.
              </p>
            </DrawerContent>
          </Drawer>
        </PrimitiveBlock>
        <PrimitiveBlock
          title="AlertDialog"
          basePrim="@base-ui-components/react/alert-dialog · destructive confirmation"
        >
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" size="sm">
                  Delete something
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  AlertDialog blocks focus until acknowledged — use for destructive flows.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button variant="destructive">Delete</Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </PrimitiveBlock>
        <PrimitiveBlock
          title="RadioGroup"
          basePrim="@base-ui-components/react/radio-group · uses data-[checked] not aria-checked alone"
        >
          <RadioGroup defaultValue="b" className="grid-cols-3 gap-2">
            <RadioGroupItem value="a" className="px-3 py-2">
              <span className="text-xs">Option A</span>
            </RadioGroupItem>
            <RadioGroupItem value="b" className="px-3 py-2">
              <span className="text-xs">Option B</span>
            </RadioGroupItem>
            <RadioGroupItem value="c" className="px-3 py-2">
              <span className="text-xs">Option C</span>
            </RadioGroupItem>
          </RadioGroup>
        </PrimitiveBlock>
      </div>
    </SectionShell>
  )
}

function PrimitiveBlock({
  title,
  basePrim,
  children,
}: {
  title: string
  basePrim: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="font-mono text-[10px]">{basePrim}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

interface EngineSurface {
  key: string
  label: string
  file: string
  blurb: string
  /** URL search param so the engine opens the right sheet on `/`. */
  sheetParam?: string
}

const ENGINE_SURFACES: EngineSurface[] = [
  {
    key: 'history',
    label: 'History Sheet',
    file: 'src/engine/student-space/Game/View/HistorySheet.js',
    blurb: 'Timeline + Growth tabs. The canonical SheetChrome consumer.',
    sheetParam: 'history',
  },
  {
    key: 'profile',
    label: 'Profile / Letters',
    file: 'src/engine/student-space/Game/View/LettersSheet.js',
    blurb: 'Letters inbox + profile facets. Unread dot is in Personality lavender.',
    sheetParam: 'profile',
  },
  {
    key: 'trajectory',
    label: 'Path Finder',
    file: 'src/engine/student-space/Game/View/TrajectorySheet.js',
    blurb: 'CCE / Marcia identity-status branching. Floating preview HUD.',
    sheetParam: 'trajectory',
  },
  {
    key: 'calendar',
    label: 'Calendar Sheet',
    file: 'src/engine/student-space/Game/View/CalendarSheet.js',
    blurb: 'Day-detail card portals into the active sheet via OverlayController.getActiveRoot().',
    sheetParam: 'calendar',
  },
  {
    key: 'mood',
    label: 'Mood Sheet',
    file: 'src/engine/student-space/Game/View/MoodSheet.js',
    blurb: 'Capture tier — bottom-anchored, NOT a SheetChrome consumer.',
  },
  {
    key: 'photo',
    label: 'Photo Sheet',
    file: 'src/engine/student-space/Game/View/PhotoSheet.js',
    blurb: 'Capture tier. Phone-style camera.',
  },
  {
    key: 'ask',
    label: 'Ask Sheet',
    file: 'src/engine/student-space/Game/View/AskSheet.js',
    blurb: 'Capture tier. Voice-first reflection.',
  },
  {
    key: 'chooser',
    label: 'Capture Chooser',
    file: 'src/engine/student-space/Game/View/CaptureChooser.js',
    blurb: 'Tier-1 popover above the FAB. Has its own has-chooser body class.',
  },
  {
    key: 'kira',
    label: 'KiraDialogue',
    file: 'src/engine/student-space/Game/View/KiraDialogue.js',
    blurb: 'Inline character dialogue. NOT a sheet — does not register with OverlayController.',
  },
]

function EngineSurfacesStage() {
  return (
    <SectionShell
      id="engine-surfaces"
      title="Engine surfaces"
      subtitle="Engine sheets have hard runtime dependencies (View, State, Three.js, /api endpoints) — they can't be safely mounted in isolation. The SheetChrome demo above shows the shared primitive; each surface below links to the live engine route."
    >
      <Card className="mb-4 border-warning/40 bg-warning/5">
        <CardContent className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-xs text-muted-foreground">
            Clicking <span className="font-medium text-foreground">Open in app</span> navigates to{' '}
            <code className="rounded bg-muted px-1 py-0.5">/?sheet=&lt;key&gt;</code>. The engine
            reads that URL on mount and opens the corresponding sheet via{' '}
            <code className="rounded bg-muted px-1 py-0.5">studentSpaceSurfaceFromLocation</code>.
            Surfaces without a sheet param are inline UI (capture tier, dialogues) that surface
            inside the engine without a deep-link.
          </p>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ENGINE_SURFACES.map((surface) => (
          <Card key={surface.key}>
            <CardHeader>
              <CardTitle className="text-sm">{surface.label}</CardTitle>
              <CardDescription className="font-mono text-[10px]">{surface.file}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{surface.blurb}</p>
              <div className="mt-3">
                {/* Plain <a> deliberately — TanStack Router's typed Link
                    rejects dynamic search params against the home route's
                    inferred schema, and we don't need prefetching for these
                    dev-only deep links into the engine. */}
                <a
                  href={surface.sheetParam ? `/?sheet=${surface.sheetParam}` : '/'}
                  className={cn(
                    'inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    surface.sheetParam
                      ? 'border-border bg-background text-foreground hover:bg-muted'
                      : 'border-transparent text-foreground hover:bg-muted',
                  )}
                >
                  {surface.sheetParam ? 'Open in app' : 'Open app'}
                  <ArrowRight className="ml-1 size-3.5" />
                </a>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </SectionShell>
  )
}

function VipsCards() {
  const dims = ['values', 'interests', 'personality', 'skills'] as const
  return (
    <SectionShell
      id="vips"
      title="VIPS profile cards"
      subtitle="Rendered from the engine mirror (profile-tokens.constants.js). If the TS source, engine mirror, or engine CSS drift, the test/lib/profile-tokens.test.ts fails — these cards are the visual canary."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dims.map((d) => {
          const colors = PROFILE_COLORS[d as keyof typeof PROFILE_COLORS]
          const header = PROFILE_HEADERS[d as keyof typeof PROFILE_HEADERS]
          return (
            <div
              key={d}
              className="overflow-hidden rounded-xl border"
              style={{ borderColor: colors.accent, background: colors.soft }}
            >
              <div
                className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider"
                style={{
                  color: colors.ink,
                  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                }}
              >
                {header.eyebrow}
              </div>
              <div
                className="px-4 pb-4"
                style={{
                  color: colors.ink,
                  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                }}
              >
                <h3 className="text-lg font-semibold leading-tight">{header.title}</h3>
                <p className="mt-1 text-xs opacity-80">{header.subtitle}</p>
                <div
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px]"
                  style={{ background: colors.accent, color: '#fff' }}
                >
                  {DIMENSION_LABEL[d as keyof typeof DIMENSION_LABEL]}
                </div>
                <p className="mt-3 font-mono text-[10px] opacity-60">
                  accent {colors.accent} · soft {colors.soft} · ink {colors.ink}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </SectionShell>
  )
}

function Iconography() {
  const icons = [
    { Icon: Palette, label: 'Palette' },
    { Icon: Type, label: 'Type' },
    { Icon: Ruler, label: 'Ruler' },
    { Icon: Layers, label: 'Layers' },
    { Icon: Component, label: 'Component' },
    { Icon: Box, label: 'Box' },
    { Icon: Move, label: 'Move' },
    { Icon: Sparkles, label: 'Sparkles' },
    { Icon: FileJson, label: 'FileJson' },
    { Icon: AlertTriangle, label: 'AlertTriangle' },
    { Icon: ArrowRight, label: 'ArrowRight' },
  ]
  return (
    <SectionShell
      id="icons"
      title="Iconography"
      subtitle="React side uses lucide-react. Engine side has its own SVG set in claimIcons.js — view those in-engine."
    >
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
        {icons.map(({ Icon, label }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1 rounded-md border border-border bg-background p-3"
          >
            <Icon className="size-5 text-foreground" />
            <p className="font-mono text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}

function Motion() {
  const motions = [
    {
      name: 'opacity 200ms ease',
      cls: 'transition-opacity duration-200 ease-out',
      from: 'opacity-0',
      to: 'opacity-100',
    },
    {
      name: 'scale 200ms ease',
      cls: 'transition-transform duration-200 ease-out',
      from: 'scale-95',
      to: 'scale-100',
    },
    {
      name: 'translateY 200ms ease',
      cls: 'transition-transform duration-200 ease-out',
      from: 'translate-y-4',
      to: 'translate-y-0',
    },
  ]
  return (
    <SectionShell
      id="motion"
      title="Motion"
      subtitle="Every transition this codebase uses. Click play to feel each one."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {motions.map((m) => (
          <MotionDemo key={m.name} name={m.name} cls={m.cls} from={m.from} to={m.to} />
        ))}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">--onb-ease</CardTitle>
            <CardDescription className="font-mono text-[10px]">
              cubic-bezier(0.22, 1, 0.36, 1)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OnbEaseDemo />
          </CardContent>
        </Card>
      </div>
    </SectionShell>
  )
}

function MotionDemo({
  name,
  cls,
  from,
  to,
}: {
  name: string
  cls: string
  from: string
  to: string
}) {
  const [playing, setPlaying] = useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-16 items-center justify-center rounded-md border border-border bg-muted/30">
          <span
            key={playing ? 'on' : 'off'}
            className={cn(
              'inline-flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground',
              cls,
              playing ? to : from,
            )}
          >
            ✓
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            setPlaying(false)
            // Re-trigger by mounting/unmounting via the key prop.
            setTimeout(() => setPlaying(true), 16)
          }}
        >
          Play
        </Button>
      </CardContent>
    </Card>
  )
}

function OnbEaseDemo() {
  const [playing, setPlaying] = useState(false)
  return (
    <>
      <div className="flex h-16 items-center justify-center rounded-md border border-border bg-muted/30">
        <span
          key={playing ? 'on' : 'off'}
          className="inline-flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground"
          style={{
            transition: 'transform 400ms var(--onb-ease, ease)',
            transform: playing ? 'translateX(80px)' : 'translateX(-80px)',
          }}
        >
          →
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => {
          setPlaying(false)
          setTimeout(() => setPlaying(true), 16)
        }}
      >
        Play
      </Button>
    </>
  )
}

function DiffSection({ overrides }: { overrides: Record<string, string> }) {
  const reactDiff = Object.entries(overrides)
    .filter(([name]) => REACT_TOKENS.some((t) => t.name === name))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')
  const engineDiff = Object.entries(overrides)
    .filter(([name]) => ENGINE_TOKENS.some((t) => t.name === name))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')

  const hasReact = reactDiff.length > 0
  const hasEngine = engineDiff.length > 0
  const empty = !hasReact && !hasEngine

  return (
    <SectionShell
      id="diff"
      title="Diff to apply"
      subtitle="Live tweaks above write to :root only. Below is the copy-paste diff for the source files. Apply manually — the VIPS test/lib/profile-tokens.test.ts test would fail if I auto-wrote across the three-file mirror."
    >
      {empty ? (
        <p className="text-sm text-muted-foreground">
          No tweaks yet. Use the color pickers in the React / Engine color sections to start.
        </p>
      ) : null}
      {hasReact ? (
        <Card className="mb-3">
          <CardHeader>
            <CardTitle className="text-sm">src/styles.css</CardTitle>
            <CardDescription>
              Inside the existing{' '}
              <code className="rounded bg-muted px-1 py-0.5">@theme {'{ … }'}</code> block.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px]">
              {`@theme {\n${reactDiff}\n}`}
            </pre>
          </CardContent>
        </Card>
      ) : null}
      {hasEngine ? (
        <Card className="mb-3">
          <CardHeader>
            <CardTitle className="text-sm">src/engine/student-space/style.css</CardTitle>
            <CardDescription>
              Inside the existing{' '}
              <code className="rounded bg-muted px-1 py-0.5">:root {'{ … }'}</code> block — note
              multiple :root blocks exist across the file (sky, ink, facets, onboarding); apply to
              the appropriate block per token.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px]">
              {`:root {\n${engineDiff}\n}`}
            </pre>
          </CardContent>
        </Card>
      ) : null}
      <Card className="border-warning/40 bg-warning/5">
        <CardHeader>
          <CardTitle className="text-sm">VIPS token sync</CardTitle>
          <CardDescription className="text-xs">
            If any tweak touches a VIPS dimension (values / interests / personality / skills), it
            must also be applied to{' '}
            <code className="rounded bg-muted px-1 py-0.5">src/lib/profile-tokens.ts</code> AND{' '}
            <code className="rounded bg-muted px-1 py-0.5">
              src/engine/student-space/Game/View/profile-tokens.constants.js
            </code>
            . The CI test{' '}
            <code className="rounded bg-muted px-1 py-0.5">test/lib/profile-tokens.test.ts</code>{' '}
            enforces all three stay in sync.
          </CardDescription>
        </CardHeader>
      </Card>
    </SectionShell>
  )
}
