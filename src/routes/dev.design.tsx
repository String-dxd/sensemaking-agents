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
import type { CartographerPathwayDraft } from '~/agents/schemas'
import { ChoicesPageView } from '~/components/ChoicesPageView'
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
import type { IdentityStatusAudit, IdentityStatusId } from '~/lib/student-space/identity-status'
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
  // Tokens
  { id: 'react-color', label: 'Color — React stack', icon: Palette },
  { id: 'engine-color', label: 'Color — Engine stack', icon: Palette },
  { id: 'drift', label: 'Drift report', icon: AlertTriangle },
  // Style
  { id: 'type', label: 'Typography', icon: Type },
  { id: 'space', label: 'Spacing & radii', icon: Ruler },
  { id: 'surface', label: 'Surfaces & elevation', icon: Layers },
  { id: 'icons', label: 'Iconography', icon: Sparkles },
  { id: 'motion', label: 'Motion', icon: Move },
  // Components — type-based (shadcn / Material convention)
  { id: 'buttons', label: 'Buttons', icon: Component },
  { id: 'pills', label: 'Pills & badges', icon: Component },
  { id: 'cards', label: 'Cards', icon: Component },
  { id: 'inputs', label: 'Inputs', icon: Component },
  { id: 'overlays', label: 'Overlays', icon: Layers },
  { id: 'tabs', label: 'Tabs & navigation', icon: Component },
  { id: 'avatars', label: 'Avatars', icon: Component },
  { id: 'headers', label: 'Headers & metadata', icon: Type },
  { id: 'empty', label: 'Empty states', icon: Component },
  { id: 'viz', label: 'Data viz', icon: Component },
  // Composed views (the assemblies that need data to demo)
  { id: 'views', label: 'Composed views', icon: Component },
  { id: 'vips', label: 'VIPS profile cards', icon: Sparkles },
  { id: 'engine-surfaces', label: 'Engine surfaces', icon: Box },
  // Reference
  { id: 'inventory', label: 'Component inventory', icon: FileJson },
  { id: 'diff', label: 'Diff to apply', icon: FileJson },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

const DEFAULT_SECTION: SectionId = 'patterns'

function isSectionId(value: string): value is SectionId {
  return SECTIONS.some((s) => s.id === value)
}

function readSectionFromHash(): SectionId {
  if (typeof window === 'undefined') return DEFAULT_SECTION
  const raw = window.location.hash.replace(/^#/, '')
  return isSectionId(raw) ? raw : DEFAULT_SECTION
}

function DesignSystemPage() {
  // Live override buffer — every tweak writes to :root via useEffect and is
  // tracked here so the diff section can reproduce the changes.
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  // Active section in the right pane. SSR-safe default; client syncs to hash
  // on mount and on hashchange.
  const [activeId, setActiveId] = useState<SectionId>(DEFAULT_SECTION)

  useEffect(() => {
    const root = document.documentElement
    for (const [name, value] of Object.entries(overrides)) {
      root.style.setProperty(name, value)
    }
  }, [overrides])

  // Read the hash on mount and keep state synced with back/forward navigation.
  useEffect(() => {
    setActiveId(readSectionFromHash())
    const onHash = () => setActiveId(readSectionFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Mirror the active section back into the URL so the view is shareable.
  // replaceState (not pushState) keeps the browser history shallow — clicking
  // through every section shouldn't bury the user's previous page.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const next = `#${activeId}`
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', next)
    }
  }, [activeId])

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
      className="mx-auto w-full max-w-6xl pb-12"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <PageHeader overrideCount={Object.keys(overrides).length} onReset={resetAll} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
        <Sidebar activeId={activeId} onSelect={setActiveId} />
        <main className="min-w-0">
          <ActiveSection id={activeId} overrides={overrides} onTweak={setToken} />
        </main>
      </div>
    </div>
  )
}

interface ActiveSectionProps {
  id: SectionId
  overrides: Record<string, string>
  onTweak: (name: string, value: string) => void
}

function ActiveSection({ id, overrides, onTweak }: ActiveSectionProps) {
  switch (id) {
    case 'patterns':
      return <PatternConventions />
    case 'cli':
      return <CliProposal />
    case 'react-color':
      return (
        <ColorTokens
          title="Color — React stack"
          anchor="react-color"
          tokens={REACT_TOKENS}
          onTweak={onTweak}
          overrides={overrides}
        />
      )
    case 'engine-color':
      return (
        <ColorTokens
          title="Color — Engine stack"
          anchor="engine-color"
          tokens={ENGINE_TOKENS.filter((t) => t.name !== '--onb-shadow' && t.name !== '--onb-ease')}
          onTweak={onTweak}
          overrides={overrides}
        />
      )
    case 'drift':
      return <DriftReport />
    case 'type':
      return <Typography />
    case 'space':
      return <SpacingAndRadii />
    case 'surface':
      return <SurfacesAndElevation />
    case 'buttons':
      return <ButtonsSection />
    case 'pills':
      return <PillsSection />
    case 'cards':
      return <CardsSection />
    case 'inputs':
      return <InputsSection />
    case 'overlays':
      return <OverlaysSection />
    case 'tabs':
      return <TabsSection />
    case 'avatars':
      return <AvatarsSection />
    case 'headers':
      return <HeadersSection />
    case 'empty':
      return <EmptyStatesSection />
    case 'viz':
      return <DataVizSection />
    case 'views':
      return <ComposedViewsSection />
    case 'engine-surfaces':
      return <EngineSurfacesStage />
    case 'vips':
      return <VipsCards />
    case 'inventory':
      return <ComponentInventory />
    case 'icons':
      return <Iconography />
    case 'motion':
      return <Motion />
    case 'diff':
      return <DiffSection overrides={overrides} />
  }
}

function PageHeader({ overrideCount, onReset }: { overrideCount: number; onReset: () => void }) {
  return (
    <header className="border-b border-border pb-5 pt-6 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Dev · design system
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Sensemaking · shadcn on Base UI + Tailwind v4
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Pick a category on the left. Tweaks write to{' '}
            <code className="rounded bg-muted px-1 py-0.5">:root</code> and feed the diff page.
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

/**
 * Group the flat SECTIONS list into a labelled set of buckets for the left
 * rail — easier to scan than 15 unbroken rows. Order preserved within each
 * bucket; the buckets themselves are the natural reading order of the page.
 */
const NAV_GROUPS: { label: string; ids: SectionId[] }[] = [
  { label: 'Foundations', ids: ['patterns', 'cli'] },
  { label: 'Tokens', ids: ['react-color', 'engine-color', 'drift'] },
  { label: 'Style', ids: ['type', 'space', 'surface', 'icons', 'motion'] },
  {
    label: 'Components',
    ids: [
      'buttons',
      'pills',
      'cards',
      'inputs',
      'overlays',
      'tabs',
      'avatars',
      'headers',
      'empty',
      'viz',
    ],
  },
  { label: 'Composed', ids: ['views', 'vips', 'engine-surfaces'] },
  { label: 'Reference', ids: ['inventory', 'diff'] },
]

function Sidebar({
  activeId,
  onSelect,
}: {
  activeId: SectionId
  onSelect: (id: SectionId) => void
}) {
  return (
    <aside className="md:sticky md:top-4 md:self-start md:max-h-[calc(100vh-2rem)] md:overflow-y-auto">
      <nav aria-label="Design system sections" className="flex flex-col gap-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.ids.map((id) => {
                const section = SECTIONS.find((s) => s.id === id)
                if (!section) return null
                const isActive = id === activeId
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onSelect(id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        isActive
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <section.icon
                        className={cn('size-3.5 shrink-0', isActive ? '' : 'opacity-70')}
                      />
                      <span className="truncate">{section.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
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
    // No border / scroll-margin — each section is its own right-pane view now.
    <section id={id}>
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
    topic: 'Product UI ignores both stacks',
    react:
      'src/components/*.tsx hard-codes inline hex: bg-[#fdfaf3], text-[#2b2620]/60, border-[#e3d8c4], bg-[#f1ede5]',
    engine: 'engine sheets use --cta-*, --onb-*, --facet-* via CSS classes',
    verdict: 'harmonize',
    note: "The actual user-facing React surfaces (ProfileSheetView, ChoicesPageView, TrajectoryPageView) bypass BOTH shadcn semantic tokens and engine CSS vars. They hard-code warm hex literals inline. This is the real drift — neither stack's tokens flow through to the live product. Picking a token names + applying them across src/components/*.tsx is the harmonization work.",
  },
  {
    topic: 'Primary action color',
    react: '--color-accent: oklch(0.6 0.18 256)  (cool blue, infrastructure only)',
    engine: '--cta-accent: #C99B73  (warm tan)',
    verdict: 'TBD',
    note: 'React stack inherited a generic shadcn blue but it is invisible to users — the shadcn tokens only show up in dev surfaces. Engine is intentionally warm. Decide whether to retire the shadcn blue or document it as dev-only.',
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

// Stable no-op handlers for sample views. Memoising at module scope avoids
// triggering ChoicesPageView's internal effects on every render of the parent.
const NOOP_CHOICES_ACTIONS = {
  addDecision: () => null,
  removeDecision: () => null,
  tagDecisionPattern: () => null,
  addChangeIntention: () => null,
  removeChangeIntention: () => null,
} as const

// ─── Components, organized by type (shadcn / Material convention) ───────
// Each section surfaces every variant that exists in this codebase — both
// the shadcn primitive (src/components/ui/*.tsx) AND the product-specific
// instances (inline JSX in src/components/*.tsx, engine DOM in
// src/engine/student-space/*). One section per shape; consistency reviews
// span the whole system.

function ButtonsSection() {
  return (
    <SectionShell
      id="buttons"
      title="Buttons"
      subtitle="Every button-shaped affordance in the system — shadcn primitive variants, the engine cream pill family, and the product-specific VoiceButton."
    >
      <div className="flex flex-col gap-5">
        <ComponentBlock
          title="<Button>  ·  shadcn primitive"
          file="src/components/ui/button.tsx"
          blurb="cva variant matrix. 5 visual variants × 4 sizes. Used directly in dev surfaces and as composition inside the product views."
        >
          <div className="flex flex-wrap gap-2">
            <Button>Default</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm">sm</Button>
            <Button size="default">default</Button>
            <Button size="lg">lg</Button>
            <Button size="icon" aria-label="Icon button">
              <ArrowRight aria-hidden className="size-4" />
            </Button>
          </div>
        </ComponentBlock>

        <ComponentBlock
          title="Cream pill action button  ·  product recipe"
          file="ChoicesPageView.tsx · RelationshipsPageView.tsx (inline)"
          blurb='"Log a decision" / "Add an intention" / "Share" — right-aligned form openers. Hard-coded with arbitrary hex (#e3d8c4 border, white fill) — strong candidate for an ActionPill primitive.'
        >
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e3d8c4] bg-[#fdfaf3] p-4">
            <button
              type="button"
              disabled
              className="rounded-full border border-[#e3d8c4] bg-white px-4 py-2 text-sm font-medium text-[#2b2620] shadow-sm"
            >
              Log a decision
            </button>
            <button
              type="button"
              disabled
              className="rounded-full border border-[#e3d8c4] bg-white px-4 py-2 text-sm font-medium text-[#2b2620] shadow-sm"
            >
              Add an intention
            </button>
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1 rounded-full border border-[#e3d8c4] bg-white px-3 py-1.5 text-xs font-medium text-[#2b2620] shadow-sm"
            >
              <ArrowRight aria-hidden className="size-3" />
              Share
            </button>
          </div>
        </ComponentBlock>

        <ComponentBlock
          title='"Run sense-making" / "Show me all paths"  ·  engine recipe'
          file="src/engine/student-space/Game/View/TrajectorySheet.js (DOM)"
          blurb="The two Path Finder head actions. Solid cream for the primary action, outline for the escape hatch. Currently hand-rolled in engine DOM; product code mirrors the styling inline."
        >
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e3d8c4] bg-[#fdfaf3] p-4">
            <button
              type="button"
              disabled
              className="rounded-full bg-[#f5e9d4] px-4 py-2 text-sm font-medium text-[#6a4a26] shadow-sm hover:bg-[#ead9bd]"
            >
              Run sense-making
            </button>
            <button
              type="button"
              disabled
              className="rounded-full border border-[#e3d8c4] bg-white px-4 py-2 text-sm font-medium text-[#2b2620] shadow-sm"
            >
              Show me all paths
            </button>
          </div>
        </ComponentBlock>
      </div>
    </SectionShell>
  )
}

function PillsSection() {
  return (
    <SectionShell
      id="pills"
      title="Pills & badges"
      subtitle="Small chip-shaped affordances. Status indicators, emotion chips, dimension tags, override prefixes — every small rounded surface in the system."
    >
      <div className="flex flex-col gap-5">
        <ComponentBlock
          title="<Badge>  ·  shadcn primitive"
          file="src/components/ui/badge.tsx"
          blurb="cva matrix — 6 variants × 2 sizes × 2 radii. The infrastructure pill primitive."
        >
          <div className="flex flex-wrap gap-2">
            <Badge>default</Badge>
            <Badge variant="secondary">secondary</Badge>
            <Badge variant="accent">accent</Badge>
            <Badge variant="accent-soft">accent-soft</Badge>
            <Badge variant="outline">outline</Badge>
            <Badge variant="warning">warning</Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge size="sm">sm</Badge>
            <Badge size="default">default</Badge>
            <Badge radius="sm">square</Badge>
            <Badge radius="pill">pill</Badge>
          </div>
        </ComponentBlock>

        <ComponentBlock
          title="IdentityStatusPill — 5 statuses  ·  product"
          file="src/components/TrajectoryPageView.tsx (internal · candidate for export)"
          blurb="Click-to-reveal pill rendered next to the Trajectory eyebrow. The colored dot communicates Marcia quadrant — starter (amber) → diffused (orange) → searching (blue) → foreclosed (rose) → achieved (emerald)."
        >
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS_DOT_CLASS) as IdentityStatusId[]).map((status) => (
              <button
                key={status}
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.10em] text-foreground/80 hover:bg-muted/60"
                data-status={status}
              >
                <span
                  aria-hidden="true"
                  className={cn('size-2 rounded-full', STATUS_DOT_CLASS[status])}
                />
                {STATUS_LABEL[status]}
              </button>
            ))}
          </div>
        </ComponentBlock>

        <ComponentBlock
          title="PREVIEW · ACHIEVED override pill  ·  engine"
          file="src/engine/student-space/Game/View/StatusPreviewHud.js"
          blurb="The status pill grows a `PREVIEW ·` prefix when an identity-status override is active. Same dot color as the inferred status."
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.10em] text-foreground/80">
            <span aria-hidden className="size-2 rounded-full bg-emerald-500" />
            PREVIEW · ACHIEVED
          </span>
        </ComponentBlock>

        <ComponentBlock
          title="Tag pill (next to eyebrow)  ·  product recipe"
          file="ChoicesPageView.tsx · ProfileSheetView.tsx (inline)"
          blurb='Small cream-soft pill ("Choices" / "Values" / etc.) sitting next to an uppercase eyebrow. Inlined across views with `bg-[#f1ede5] text-[#2b2620]/70` — candidate for extraction.'
        >
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/20 p-3">
            <span className="rounded-full bg-[#f1ede5] px-2 py-0.5 text-[11px] font-semibold text-[#2b2620]/70">
              Choices
            </span>
            <span className="rounded-full bg-[#f1ede5] px-2 py-0.5 text-[11px] font-semibold text-[#2b2620]/70">
              Values
            </span>
            <span className="rounded-full bg-[#f1ede5] px-2 py-0.5 text-[11px] font-semibold text-[#2b2620]/70">
              Personality
            </span>
            <span className="rounded-full bg-[#f1ede5] px-2 py-0.5 text-[11px] font-semibold text-[#2b2620]/70">
              Relationships
            </span>
          </div>
        </ComponentBlock>
      </div>
    </SectionShell>
  )
}

function CardsSection() {
  return (
    <SectionShell
      id="cards"
      title="Cards"
      subtitle="Surfaces that group content — the shadcn primitive plus product card recipes used inside the dimension views."
    >
      <div className="flex flex-col gap-5">
        <ComponentBlock
          title="<Card> / <CardHeader> / <CardContent>  ·  shadcn primitive"
          file="src/components/ui/card.tsx"
          blurb="The infrastructure card. Composes Header / Title / Description / Content / Footer with consistent gap + padding."
        >
          <Card>
            <CardHeader>
              <CardTitle>Card title</CardTitle>
              <CardDescription>Description with --color-muted-foreground.</CardDescription>
            </CardHeader>
            <CardContent>Body text rendered in --color-foreground.</CardContent>
          </Card>
        </ComponentBlock>

        <ComponentBlock
          title="Cream surface card  ·  product recipe"
          file="ChoicesPageView.tsx · TrajectoryPageView.tsx (inline)"
          blurb="Repeated cream-tan card surround: `rounded-2xl border border-[#e3d8c4] bg-[#fdfaf3] p-6 text-[#2b2620]`. Wraps every Section row + empty state combo in the product views."
        >
          <div className="rounded-2xl border border-[#e3d8c4] bg-[#fdfaf3] p-6 text-[#2b2620]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55">
              DECISIONS I'VE MADE AND WHY
            </p>
            <p className="mt-3 text-sm italic leading-relaxed text-[#2b2620]/60">
              Log a real choice — CCA leadership, subject combination, a conflict you handled. Name
              your options and what pushed you.
            </p>
          </div>
        </ComponentBlock>

        <ComponentBlock
          title="Numbered list card (pathway card)  ·  product"
          file="src/components/TrajectoryPageView.tsx (PathwayCard)"
          blurb="Each Cartographer pathway gets a numbered circle counter + label + exploration prompt + expandable evidence/tradeoffs. The numbered-list-card shape recurs in MirrorReflectionSections, PostMirrorReview."
        >
          <ol className="flex flex-col">
            {SAMPLE_PATHWAYS.slice(0, 2).map((pathway, index) => (
              <li
                key={pathway.label}
                className="border-t border-border/70 py-5 first:border-t-0 first:pt-0"
              >
                <div className="grid gap-4 sm:grid-cols-[2.25rem_minmax(0,1fr)]">
                  <span className="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">{pathway.label}</h3>
                    <p className="mt-2 text-sm leading-relaxed">{pathway.exploration_prompt}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </ComponentBlock>

        <ComponentBlock
          title="TLDR hero  ·  engine primitive"
          file="src/engine/student-space/Game/View/visualPrimitives.js  ·  .tldr-hero in style.css"
          blurb="Glanceable summary card at the top of a full-viewport sheet. Composes an uppercase eyebrow, a one-line headline, a chip row (each chip is a clickable filter), and a muted meta footer. Used by Profile (per-tab) and Path Finder (per-quadrant)."
        >
          <div
            className="rounded-2xl border bg-white/55 p-5 shadow-[0_4px_14px_-10px_rgba(43,38,32,0.18)]"
            style={{ borderColor: 'rgba(43, 38, 32, 0.10)' }}
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#2b2620]/55">
              TOP VOICES IN YOUR REFLECTIONS
            </p>
            <h2 className="mt-2 text-[18px] font-semibold leading-tight text-[#2b2620]/90">
              Five values keep surfacing
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { label: 'BELONGING', accent: '#c2a572' },
                { label: 'CURIOSITY', accent: '#b88660' },
                { label: 'SERVICE', accent: '#4f8acb' },
                { label: 'HONESTY', accent: '#4f9b6a' },
                { label: 'FAMILY', accent: '#c97a4e' },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold tracking-[0.06em]"
                  style={{
                    borderColor: 'rgba(43, 38, 32, 0.12)',
                    background: 'rgba(43, 38, 32, 0.04)',
                    color: 'rgba(43, 38, 32, 0.82)',
                  }}
                >
                  <span
                    aria-hidden
                    className="size-[7px] rounded-full"
                    style={{ background: chip.accent }}
                  />
                  {chip.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[12px] tabular-nums text-[#2b2620]/55">
              12 noticings · last refined 2 days ago
            </p>
          </div>
        </ComponentBlock>

        <ComponentBlock
          title="Disclosure  ·  engine primitive"
          file="src/engine/student-space/Game/View/visualPrimitives.js  ·  .disclosure in style.css"
          blurb="Chevron-driven collapsible. data-expanded='true|false' flips on the section root; aria-expanded mirrors on the toggle button. CSS animates the panel via grid-template-rows. Honors prefers-reduced-motion."
        >
          <div className="grid gap-3">
            <details
              className="rounded-lg border bg-white/40 px-3 py-2"
              style={{ borderColor: 'rgba(43, 38, 32, 0.10)' }}
            >
              <summary className="cursor-pointer text-[13px] font-semibold text-[#2b2620]/80">
                More about this dimension
              </summary>
              <p className="mt-2 text-[13px] leading-relaxed text-[#2b2620]/70">
                Curiosity shows up across capture moments — when describing what energises you, what
                drains you, and how you spent your free time last week.
              </p>
            </details>
            <p className="text-[11px] text-muted-foreground">
              Default: <code className="rounded bg-muted px-1">data-expanded="false"</code>. Toggle
              flips both the section attribute and the toggle's{' '}
              <code className="rounded bg-muted px-1">aria-expanded</code>.
            </p>
          </div>
        </ComponentBlock>

        <ComponentBlock
          title="Stat tile row  ·  engine primitive"
          file="src/engine/student-space/Game/View/visualPrimitives.js  ·  .stat-tile-row in style.css"
          blurb="2-up grid of stat tiles. Each tile is a big tabular-numeric value plus a small uppercase label plus an optional icon. Used wherever a flat meta line would otherwise carry the count — Profile (noticings · voiced claims) and Path Finder (pathways · last generated)."
        >
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { value: '12', label: 'NOTICINGS', icon: '✶' },
              { value: '5', label: 'VOICED CLAIMS', icon: '◐' },
            ].map((t) => (
              <div
                key={t.label}
                className="relative grid gap-1 rounded-2xl border bg-white/55 p-3.5"
                style={{ borderColor: 'rgba(43, 38, 32, 0.08)' }}
              >
                <div className="text-[22px] font-bold leading-none tabular-nums tracking-tight text-[#2b2620]">
                  {t.value}
                </div>
                <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#2b2620]/55">
                  {t.label}
                </div>
                <div className="absolute right-3.5 top-3 text-[16px] opacity-55">{t.icon}</div>
              </div>
            ))}
          </div>
        </ComponentBlock>

        <ComponentBlock
          title="Callout strip  ·  engine primitive"
          file="src/engine/student-space/Game/View/visualPrimitives.js  ·  .callout-strip in style.css"
          blurb="Left-accent prompt block — 4px border in the facet accent color, soft tinted background, italic body. Replaces the inline 'Open Question' callout on Profile tabs and any future inline prompt that should read as a soft invitation, not a primary CTA."
        >
          <aside
            className="rounded-xl border-l-4 bg-[#2b262008] p-3.5"
            style={{ borderLeftColor: '#c2a572' }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#2b2620]/55">
              OPEN QUESTION
            </p>
            <p className="mt-1 text-[14px] italic leading-snug text-[#2b2620]/80">
              What part of school last week energised you, in a way that surprised you?
            </p>
          </aside>
        </ComponentBlock>
      </div>
    </SectionShell>
  )
}

function InputsSection() {
  return (
    <SectionShell
      id="inputs"
      title="Inputs"
      subtitle="Form controls — text + selection. The shadcn primitives that compose the product editors (EditableField, EmotionPicker, ContextTypePicker)."
    >
      <div className="flex flex-col gap-5">
        <ComponentBlock
          title="<Textarea>  ·  shadcn primitive"
          file="src/components/ui/textarea.tsx"
          blurb="Native textarea with shadcn border, focus ring (--color-accent), and disabled treatment. Used by EditableField and capture flows."
        >
          <Textarea placeholder="Type something — focus ring uses --color-accent." />
        </ComponentBlock>

        <ComponentBlock
          title="<RadioGroup> / <RadioGroupItem>  ·  shadcn primitive (Base UI)"
          file="src/components/ui/radio-group.tsx"
          blurb="Base UI radio-group with data-[checked] styling. The product pickers (EmotionPicker, ContextTypePicker) render tile-style children inside RadioGroupItem to get the right tap-target shape."
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
        </ComponentBlock>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">Not yet rendered</CardTitle>
            <CardDescription className="text-xs">
              EditableField, EmotionPicker, ContextTypePicker, CaptureTagPicker — all listed in
              Component inventory. Ask "render EditableField" and they migrate here.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </SectionShell>
  )
}

function ComponentBlock({
  title,
  file,
  blurb,
  children,
}: {
  title: string
  file: string
  blurb: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="font-mono text-[10px]">{file}</CardDescription>
        <p className="mt-1 text-xs text-muted-foreground">{blurb}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function OverlaysSection() {
  return (
    <SectionShell
      id="overlays"
      title="Overlays"
      subtitle="Modal surfaces — Dialog (centered), Drawer (bottom sheet), AlertDialog (destructive confirm). All built on Base UI's Dialog primitive with data-[starting-style] / data-[ending-style] for enter/exit. The engine SheetChrome (full-viewport vanilla-JS sheets) is documented under Surfaces & elevation."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <ComponentBlock
          title="<Dialog>  ·  shadcn primitive (Base UI)"
          file="src/components/ui/dialog.tsx"
          blurb="Centered modal with backdrop + ×. Base UI's Dialog under the hood. Click to open."
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
        </ComponentBlock>

        <ComponentBlock
          title="<Drawer>  ·  shadcn primitive (Base UI)"
          file="src/components/ui/drawer.tsx"
          blurb="Bottom-anchored sheet. Slides up via data-[starting-style]:translate-y-full. Used by capture flows + mobile picker surfaces."
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
        </ComponentBlock>

        <ComponentBlock
          title="<AlertDialog>  ·  shadcn primitive (Base UI)"
          file="src/components/ui/alert-dialog.tsx"
          blurb="Focus-trapping confirm for destructive flows. Use this — not Dialog — when the action is irreversible."
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
        </ComponentBlock>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">SheetChrome (engine full-viewport)</CardTitle>
            <CardDescription className="font-mono text-[10px]">
              src/engine/student-space/Game/View/SheetChrome.js
            </CardDescription>
            <p className="mt-1 text-xs text-muted-foreground">
              The vanilla-JS full-viewport sheet primitive (History, Profile, Letters, Path Finder,
              Calendar all build on this). Backdrop, 10px blur, 200ms fade, z-60. Live demo is in{' '}
              <a className="underline" href="#surface">
                Surfaces & elevation
              </a>
              .
            </p>
          </CardHeader>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">Not yet rendered</CardTitle>
            <CardDescription className="text-xs">
              ConfirmDialog (lightweight wrapper around AlertDialog), BottomSheet (Drawer wrapper).
              Listed in Component inventory.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </SectionShell>
  )
}

function TabsSection() {
  // Mirror the ProfileStudentChrome tab rail without the avatar half. The
  // engine uses these same tabs at the top of every dimension page.
  const PROFILE_TABS = [
    'values',
    'interests',
    'personality',
    'skills',
    'relationships',
    'choices',
  ] as const
  const TAB_LABEL = {
    values: 'Values',
    interests: 'Interests',
    personality: 'Personality',
    skills: 'Skills',
    relationships: 'Relationships',
    choices: 'Choices',
  } as const
  return (
    <SectionShell
      id="tabs"
      title="Tabs & navigation"
      subtitle="Horizontal tab rails. The profile dimension rail appears across every dimension page; the SheetEntryRail is its sibling for sheet triggers."
    >
      <div className="flex flex-col gap-5">
        <ComponentBlock
          title="Profile dimension tabs  ·  product"
          file="src/components/ProfileSheetChrome.tsx (nav block)"
          blurb="The active tab takes that dimension's theme color (per PROFILE_THEMES / PROFILE_TAB_THEMES). Inactive tabs are muted on a cream backdrop. This is the tab strip from the Profile sheet — same pattern shown standalone."
        >
          <nav
            aria-label="Profile dimensions sample"
            className="flex w-full gap-2 overflow-x-auto rounded-2xl border border-[#e6dcc9]/80 bg-[#fdfaf3]/90 px-4 py-3"
          >
            {PROFILE_TABS.map((tab) => {
              const isActive = tab === 'choices'
              return (
                <button
                  key={tab}
                  type="button"
                  disabled
                  className={cn(
                    'h-8 shrink-0 rounded-full border border-transparent px-3.5 text-sm font-medium transition-colors',
                    isActive ? 'border-[#C99B73] bg-[#f5e9d4] text-[#6A4A26]' : 'text-[#2b2620]/55',
                  )}
                >
                  {TAB_LABEL[tab]}
                </button>
              )
            })}
          </nav>
        </ComponentBlock>

        <ComponentBlock
          title="<SheetEntryRail>  ·  product"
          file="src/components/SheetEntryRail.tsx"
          blurb="Same six tabs styled differently — outlined pills on a neutral background. Used at sheet trigger points (e.g. above an embedded BottomSheet)."
        >
          <nav
            aria-label="Sheet entry rail sample"
            className="flex w-full gap-2 overflow-x-auto py-1 sm:flex-wrap"
          >
            {PROFILE_TABS.map((tab) => {
              const isActive = tab === 'choices'
              return (
                <button
                  key={tab}
                  type="button"
                  disabled
                  className={cn(
                    'inline-flex shrink-0 items-center rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors',
                    isActive && 'bg-muted',
                  )}
                >
                  {TAB_LABEL[tab]}
                </button>
              )
            })}
          </nav>
        </ComponentBlock>
      </div>
    </SectionShell>
  )
}

function AvatarsSection() {
  return (
    <SectionShell
      id="avatars"
      title="Avatars"
      subtitle="The cream-circle initial avatar used across the profile chrome and share surfaces. Three sizes today — could use a real Avatar primitive (shadcn ships one we haven't installed)."
    >
      <div className="flex flex-col gap-5">
        <ComponentBlock
          title="Cream-circle initial avatar  ·  product recipe"
          file="src/components/ProfileSheetChrome.tsx (inline JSX)"
          blurb="Soft cream circle (#fae1ce) with a warm-tan initial (#b5532a) and an inset bottom shadow. Sizes are inlined per use site — small (size-10), default (size-16), large (size-20). Candidate for a shadcn Avatar install + theme."
        >
          <div className="flex items-end gap-6">
            {[
              { size: 'size-10', text: 'text-base', label: 'small (40)' },
              { size: 'size-16', text: 'text-[26px]', label: 'default (64)' },
              { size: 'size-20', text: 'text-3xl', label: 'large (80)' },
            ].map((spec) => (
              <div key={spec.label} className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    'flex shrink-0 items-center justify-center rounded-full bg-[#fae1ce] font-semibold text-[#b5532a] shadow-[inset_0_-2px_0_rgba(0,0,0,0.04)]',
                    spec.size,
                    spec.text,
                  )}
                  role="img"
                  aria-label="Mei avatar"
                >
                  M
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">{spec.label}</p>
              </div>
            ))}
          </div>
        </ComponentBlock>
      </div>
    </SectionShell>
  )
}

function HeadersSection() {
  return (
    <SectionShell
      id="headers"
      title="Headers & metadata"
      subtitle="Page-opening eyebrow + tag + title patterns and the metadata lines that sit below. Repeated verbatim across every dimension page and the engine sheets — strong candidates for extraction into header primitives."
    >
      <div className="flex flex-col gap-5">
        <ComponentBlock
          title="Eyebrow + tag + display title  ·  product recipe"
          file="ChoicesPageView.tsx · ProfileSheetView.tsx · TrajectoryPageView.tsx (inline)"
          blurb="The pattern that opens every page — small uppercase eyebrow, optional pill tag, big display title, subtitle. Same shape on cream backgrounds for product views and on neutral for dev surfaces."
        >
          <div className="rounded-2xl border border-[#e3d8c4] bg-[#fdfaf3] p-6 text-[#2b2620]">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55">
                WHAT I'VE CHOSEN, AND WHY
              </p>
              <span className="rounded-full bg-[#f1ede5] px-2 py-0.5 text-[11px] font-semibold text-[#2b2620]/70">
                Choices
              </span>
            </div>
            <h1 className="mt-2 text-[clamp(1.6rem,4vw,2rem)] font-semibold leading-tight tracking-tight">
              What I've chosen, and why
            </h1>
            <p className="mt-2 text-sm text-[#2b2620]/60">
              A log of real decisions and the patterns across them
            </p>
          </div>
        </ComponentBlock>

        <ComponentBlock
          title="Status eyebrow recipe (PATH FINDER · status)  ·  engine"
          file="src/engine/student-space/Game/View/statusHeuristics.js (eyebrow strings)"
          blurb='The "PATH FINDER · ACHIEVED" eyebrow pattern — base label + bullet separator + status. Used at the top of the Trajectory sheet to communicate the current CCE quadrant at a glance. Includes a status dot.'
        >
          <div className="space-y-3 rounded-2xl border border-[#e3d8c4] bg-[#fdfaf3] p-6 text-[#2b2620]">
            {(Object.keys(STATUS_LABEL) as IdentityStatusId[]).map((status) => (
              <div key={status} className="flex items-baseline gap-3">
                <span aria-hidden className={cn('size-2 rounded-full', STATUS_DOT_CLASS[status])} />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2b2620]/55">
                  PATH FINDER · {STATUS_LABEL[status].toUpperCase()}
                </p>
              </div>
            ))}
          </div>
        </ComponentBlock>

        <ComponentBlock
          title="Metadata line  ·  product / engine recipe"
          file="TrajectorySheet.js · TrajectoryPageView.tsx"
          blurb="Inline metadata line sitting below a display title. Engine uses a single line; the React route uses a <dl> grid — same information, different presentation."
        >
          <div className="rounded-2xl border border-[#e3d8c4] bg-[#fdfaf3] p-6">
            <p className="text-sm text-[#2b2620]/60">Generated 5/20/2026, 8:23 AM · 3 pathways</p>
          </div>
        </ComponentBlock>
      </div>
    </SectionShell>
  )
}

// ─── Path Finder / Trajectory components ─────────────────────────────────
// Mirrors the screenshot the user shared: PREVIEW · ACHIEVED green-dot pill,
// PATH FINDER · ACHIEVED eyebrow, numbered pathway cards, "Run sense-making"
// + "Show me all paths" action pair, and the full TrajectoryPageView.

// Local mirror of TrajectoryPageView's internal STATUS_DOT_CLASS so the inline
// recipes below match the live component. If TrajectoryPageView exports this
// later, swap to the imported version.
const STATUS_DOT_CLASS: Record<IdentityStatusId, string> = {
  starter: 'bg-amber-400',
  diffused: 'bg-orange-500',
  searching: 'bg-blue-500',
  foreclosed: 'bg-rose-500',
  achieved: 'bg-emerald-500',
}

const STATUS_LABEL: Record<IdentityStatusId, string> = {
  starter: 'Starter',
  diffused: 'Diffused',
  searching: 'Searching',
  foreclosed: 'Foreclosed',
  achieved: 'Achieved',
}

const SAMPLE_STATUS_AUDIT: IdentityStatusAudit = {
  status: 'achieved',
  exploration: {
    score: 0.82,
    band: 'high',
    inputs: {
      distinctClaims: 14,
      weightedQuotes: 11,
      askCount: 8,
      hasBackendCartographer: true,
    },
  },
  commitment: {
    score: 0.71,
    band: 'high',
    inputs: { decisionCount: 6, intentionCount: 3, dominantPatternTag: 'deliberate' },
  },
  reason:
    'High exploration (distinct claims across all four dimensions) and high commitment (recurring deliberate-pattern decisions) — student has both searched and chosen.',
}

const SAMPLE_PATHWAYS: CartographerPathwayDraft[] = [
  {
    label: 'Teaching, tutoring, and community learning',
    trait_combination: [
      { claim_id: 'v.empathy', dimension: 'values' },
      { claim_id: 's.explaining', dimension: 'skills' },
    ],
    ecg_region_tags: ['education', 'community-leadership'],
    risks_tradeoffs:
      'Risk: time pressure during exam terms can erode the routine — protect a small fixed slot rather than scaling up.',
    exploration_prompt:
      'Run a small recurring tutoring experiment for four weeks. After each session, note what energised or drained you, and whether asking before helping changed the quality of the help you gave.',
  },
  {
    label: 'Designing for unfamiliar users',
    trait_combination: [
      { claim_id: 'p.curiosity', dimension: 'personality' },
      { claim_id: 'i.systems', dimension: 'interests' },
    ],
    ecg_region_tags: ['human-centered-design', 'product'],
    risks_tradeoffs:
      'Risk: gravitating to familiar audiences. Tradeoff: deeper insight vs. broader reach.',
    exploration_prompt:
      'Pick one user group whose context you do not share. Spend an afternoon shadowing them; sketch three small interventions afterwards.',
  },
  {
    label: 'Long-form writing as a sense-making tool',
    trait_combination: [
      { claim_id: 'v.honesty', dimension: 'values' },
      { claim_id: 's.writing', dimension: 'skills' },
    ],
    ecg_region_tags: ['writing', 'reflection'],
    risks_tradeoffs:
      'Risk: writing becomes performance. Tradeoff: discipline of unpublished writing vs. feedback of publishing.',
    exploration_prompt:
      'Write a 600-word piece weekly for a month — half published, half kept private. Note which mode surfaced more honest thinking.',
  },
]

function EmptyStatesSection() {
  return (
    <SectionShell
      id="empty"
      title="Empty states"
      subtitle="The italic muted-copy pattern that fills every panel before the student logs content. Repeated across Choices, Relationships, VIPS, Path Finder — all the same italic + muted + leading-relaxed shape."
    >
      <div className="flex flex-col gap-5">
        <ComponentBlock
          title="Section-level italic empty copy  ·  product recipe"
          file="ChoicesPageView.tsx · RelationshipsPageView.tsx (inline)"
          blurb="Inside a cream surface card, after the eyebrow, before any logged content. Two common voices: invitational (telling the student what to log) and conditional (telling them what will appear once they do)."
        >
          <div className="rounded-2xl border border-[#e3d8c4] bg-[#fdfaf3] p-6 text-[#2b2620]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55">
              DECISIONS I'VE MADE AND WHY
            </p>
            <p className="mt-3 text-sm italic leading-relaxed text-[#2b2620]/60">
              Log a real choice — CCA leadership, subject combination, a conflict you handled. Name
              your options and what pushed you.
            </p>
            <hr className="my-5 border-t border-[#e3d8c4]" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55">
              PATTERNS IN HOW I HANDLE HARD SITUATIONS
            </p>
            <p className="mt-3 text-sm italic leading-relaxed text-[#2b2620]/60">
              Once you've logged a few decisions, tag each one so the pattern surfaces here.
            </p>
          </div>
        </ComponentBlock>

        <ComponentBlock
          title="Dimension panel empty copy  ·  product recipe"
          file="src/components/ProfileSheetView.tsx (inline)"
          blurb="Inside the active-dimension panel of the Profile sheet, when no compiled-truth has been generated yet. Same italic-muted treatment, sized to match body copy."
        >
          <div className="rounded-2xl border border-[#e3d8c4] bg-[#fdfaf3] p-6 text-[#2b2620]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2b2620]/55">
              WHAT MATTERS TO ME
            </p>
            <h2 className="mt-2 text-[clamp(1.6rem,4vw,2rem)] font-semibold leading-tight tracking-tight">
              What you keep coming back to
            </h2>
            <p className="mt-6 text-sm italic leading-relaxed text-[#2b2620]/60">
              Profile evidence will appear here after confirmed reflections are connected.
            </p>
          </div>
        </ComponentBlock>
      </div>
    </SectionShell>
  )
}

function DataVizSection() {
  return (
    <SectionShell
      id="viz"
      title="Data viz"
      subtitle="Custom visualizations. Today: the CompassBearingMap in TrajectoryPageView. Future: AgentRunVisualizer event stream, ECG region maps."
    >
      <div className="flex flex-col gap-5">
        <ComponentBlock
          title="CompassBearingMap  ·  product"
          file="src/components/TrajectoryPageView.tsx (internal · candidate for export)"
          blurb="Circular compass with N/S/E/W cardinal marks + needle + numbered bearings. Each bearing is an anchor link to the matching numbered pathway card below. Rendered inside the full Trajectory view — see Composed views."
        >
          <p className="text-xs text-muted-foreground">
            The compass is a function-local component in TrajectoryPageView.tsx — not exported. See
            it in context via the{' '}
            <a className="underline" href="#views">
              Composed views
            </a>{' '}
            section (TrajectoryPageView with three mock pathways renders the compass).
          </p>
        </ComponentBlock>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">Not yet rendered</CardTitle>
            <CardDescription className="text-xs">
              AgentRunVisualizer (Cartographer event timeline), MirrorEvalReview (grader UX) — both
              are listed in Component inventory.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </SectionShell>
  )
}

function ComposedViewsSection() {
  return (
    <SectionShell
      id="views"
      title="Composed views"
      subtitle="Full page assemblies — the surfaces a user actually sees. Rendered with mock data so the parts compose, but disabled so clicks do not mutate state."
    >
      <div className="flex flex-col gap-6">
        <ComponentBlock
          title="<ChoicesPageView> (omitChrome, empty state)"
          file="src/components/ChoicesPageView.tsx"
          blurb="The Choices tab content. Rendered with omitChrome (no avatar/tabs) + empty decisions/intentions + no-op actions — what a brand-new student sees the first time they tap Choices."
        >
          <div className="overflow-hidden rounded-2xl border border-[#e3d8c4]">
            <ChoicesPageView
              decisions={[]}
              intentions={[]}
              actions={NOOP_CHOICES_ACTIONS}
              omitChrome
              disabled
            />
          </div>
        </ComponentBlock>
      </div>
    </SectionShell>
  )
}

// ─── Component inventory ─────────────────────────────────────────────────
// A flat list of every src/components/*.tsx file. Each row has a one-line
// description and a status flag indicating whether it has a live render
// elsewhere on this design page yet. When the user asks "show me X",
// the next iteration moves it from "not rendered" → "rendered above".

interface InventoryEntry {
  file: string
  name: string
  summary: string
  // Where this component is rendered on this design page (if at all).
  renderedAt?: SectionId
}

const INVENTORY: InventoryEntry[] = [
  // Profile / dimension surfaces
  {
    file: 'src/components/ProfileSheetChrome.tsx',
    name: 'ProfileStudentChrome',
    summary: 'Avatar + name + dimension tab rail used by every per-dimension page.',
    renderedAt: 'views',
  },
  {
    file: 'src/components/ProfileSheetView.tsx',
    name: 'ProfileSheetView',
    summary:
      'Full profile sheet — chrome + active dimension panel + signed-out auth nag. Top-level wrapper for a dimension page inside the engine bottom sheet.',
  },
  {
    file: 'src/components/ChoicesPageView.tsx',
    name: 'ChoicesPageView',
    summary:
      'Choices tab — three MECE sections (decisions, patterns, intentions). Reads/writes the engine Choices state slice.',
    renderedAt: 'views',
  },
  {
    file: 'src/components/RelationshipsPageView.tsx',
    name: 'RelationshipsPageView',
    summary: 'Relationships tab — three MECE sections, parallel to ChoicesPageView.',
  },
  {
    file: 'src/components/VipsPageView.tsx',
    name: 'VipsPageView',
    summary: 'One VIPS dimension page — identity chrome + ranked claim rows.',
  },
  {
    file: 'src/components/TrajectoryPageView.tsx',
    name: 'TrajectoryPageView',
    summary:
      'Cartographer lead-sheet output — trajectory paragraph, compass bearing map, pathway cards, open questions, disclaimer, warnings.',
    renderedAt: 'views',
  },
  {
    file: 'src/components/TrajectorySheetView.tsx',
    name: 'TrajectorySheetView',
    summary: 'Engine-side Trajectory sheet wrapper with empty-state copy.',
  },
  {
    file: 'src/components/ReflectionsSheetView.tsx',
    name: 'ReflectionsSheetView',
    summary: 'Reflections list sheet — entries grouped by recency.',
  },
  // Mirror flow
  {
    file: 'src/components/MirrorSession.tsx',
    name: 'MirrorSession',
    summary:
      'Voice-mode session controller. Audio-only; recording + transcription + reflection composer.',
  },
  {
    file: 'src/components/MirrorReflectionSections.tsx',
    name: 'MirrorReflectionSections',
    summary: 'Three editable sections (validation, inferred meaning, caution) post-Mirror.',
  },
  {
    file: 'src/components/PostMirrorReview.tsx',
    name: 'PostMirrorReview',
    summary:
      'Post-Mirror review surface — staged diffs grouped by VIPS dimension with verified ✓ / aspirational ⚠ / discard chips.',
  },
  {
    file: 'src/components/MirrorEvalReview.tsx',
    name: 'MirrorEvalReview',
    summary: 'Mirror evaluation review (eval grader UX).',
  },
  // Capture
  {
    file: 'src/components/CaptureTagPicker.tsx',
    name: 'CaptureTagPicker',
    summary: 'Two-step picker after each capture submit — species + tag refinement.',
  },
  {
    file: 'src/components/CaptureActionMenu.tsx',
    name: 'CaptureActionMenu',
    summary: 'Action menu surfaced from the capture tier.',
  },
  {
    file: 'src/components/ContextTypePicker.tsx',
    name: 'ContextTypePicker',
    summary: 'Picker for context-type tags during capture.',
  },
  {
    file: 'src/components/EmotionPicker.tsx',
    name: 'EmotionPicker',
    summary:
      '3×3 emotion picker — Joy / Sadness / Anger / Fear / Disgust / Anxiety / Envy / Embarrassed / Ennui.',
  },
  {
    file: 'src/components/EmotionChip.tsx',
    name: 'EmotionChip / EmotionConnector',
    summary:
      'Read-only chip (Mirror sensed / You felt) + a connector that says same / aligned / different.',
    renderedAt: 'pills',
  },
  {
    file: 'src/components/VoiceButton.tsx',
    name: 'VoiceButton',
    summary: 'Primary capture affordance — idle / recording (with halo) / working / disabled.',
    renderedAt: 'buttons',
  },
  // Cards / fields
  {
    file: 'src/components/WikiEntryCard.tsx',
    name: 'WikiEntryCard',
    summary:
      'Quiet-mirror reflection card — three editable lenses (validation, inferred meaning, caution).',
  },
  {
    file: 'src/components/EditableField.tsx',
    name: 'EditableField',
    summary: 'Display ↔ textarea toggle with explicit Confirm / Cancel.',
  },
  {
    file: 'src/components/ConfirmAndSave.tsx',
    name: 'ConfirmAndSave',
    summary: 'EditableField wrapped in a TanStack Query mutation.',
  },
  {
    file: 'src/components/ConnectedVipsLinks.tsx',
    name: 'ConnectedVipsLinks',
    summary: 'Linked VIPS claims surfaced from an entry.',
  },
  // Chrome / nav
  {
    file: 'src/components/SheetEntryRail.tsx',
    name: 'SheetEntryRail',
    summary: 'Row of profile dimension trigger pills (similar to ProfileStudentChrome tabs).',
  },
  {
    file: 'src/components/BottomSheet.tsx',
    name: 'BottomSheet',
    summary: 'Bottom-sheet wrapper around the Base UI Drawer.',
  },
  {
    file: 'src/components/ConfirmDialog.tsx',
    name: 'ConfirmDialog',
    summary: 'Lightweight modal confirm built on Base UI AlertDialog.',
  },
  // World / engine integration
  {
    file: 'src/components/StudentSpaceHost.tsx',
    name: 'StudentSpaceHost',
    summary:
      'Mounts the vendored engine on `/`. Dispatches dynamic import + adds the body.student-space-shell class.',
  },
  {
    file: 'src/components/WorldHud.tsx',
    name: 'WorldHud',
    summary: 'Floating HUD over the engine canvas — capture corner anchor.',
  },
  {
    file: 'src/components/WorldStage.tsx',
    name: 'WorldStage',
    summary: 'Engine stage shell — provides the container the engine mounts into.',
  },
  {
    file: 'src/components/FloatingWorldActions.tsx',
    name: 'FloatingWorldActions',
    summary:
      'Legacy floating action shell. Largely retired but kept for backwards-compat type re-export.',
  },
  {
    file: 'src/components/IslandProgressionOverlay.tsx',
    name: 'IslandProgressionOverlay',
    summary: 'Toast overlay above the engine canvas — capture / grow / bloom events.',
  },
  // Agent debug
  {
    file: 'src/components/AgentDebugPanel.tsx',
    name: 'AgentDebugPanel',
    summary: 'Dev panel for live agent runs.',
  },
  {
    file: 'src/components/AgentRunVisualizer.tsx',
    name: 'AgentRunVisualizer',
    summary: 'Live-ish visualization of the Cartographer sense-making run.',
  },
  {
    file: 'src/components/EnvironmentPanel.tsx',
    name: 'EnvironmentPanel',
    summary: 'Environment / config inspector for dev surfaces.',
  },
  {
    file: 'src/components/DevPalette.tsx',
    name: 'DevPalette',
    summary: 'Cmd-K developer palette — mounted in the root layout.',
  },
  // Share
  {
    file: 'src/components/share/PublicProfilePage.tsx',
    name: 'PublicProfilePage',
    summary: 'Public-facing share page. Reads a token, renders the owner-allowed profile slice.',
  },
  {
    file: 'src/components/share/OwnerPreviewBanner.tsx',
    name: 'OwnerPreviewBanner',
    summary: 'Sticky banner shown on share pages when the viewer is the link owner.',
  },
  {
    file: 'src/components/share/RevokedShareCard.tsx',
    name: 'RevokedShareCard',
    summary: 'Card shown when a share token has been revoked.',
  },
]

function ComponentInventory() {
  const rendered = INVENTORY.filter((e) => e.renderedAt)
  const notRendered = INVENTORY.filter((e) => !e.renderedAt)
  return (
    <SectionShell
      id="inventory"
      title="Component inventory"
      subtitle="Every src/components/*.tsx file. Components with a live render on this page are linked to their section; the rest are listed so you can ask for them by name."
    >
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Rendered on this page ({rendered.length})
          </h3>
          <InventoryTable entries={rendered} />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Not yet rendered ({notRendered.length})
          </h3>
          <InventoryTable entries={notRendered} />
        </div>
      </div>
    </SectionShell>
  )
}

function InventoryTable({ entries }: { entries: InventoryEntry[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">File</th>
            <th className="px-3 py-2 font-medium">Summary</th>
            <th className="px-3 py-2 font-medium">Rendered</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const target = entry.renderedAt ? SECTIONS.find((s) => s.id === entry.renderedAt) : null
            return (
              <tr key={`${entry.file}-${entry.name}`} className="border-t border-border align-top">
                <td className="px-3 py-2 font-medium text-foreground">{entry.name}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                  {entry.file}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{entry.summary}</td>
                <td className="px-3 py-2">
                  {target ? (
                    <a
                      href={`#${target.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
                    >
                      <ArrowRight className="size-3" />
                      {target.label}
                    </a>
                  ) : (
                    <Badge variant="secondary" size="sm">
                      not yet
                    </Badge>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
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
