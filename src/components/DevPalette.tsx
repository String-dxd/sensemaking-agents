import { Dialog as BaseDialog } from '@base-ui-components/react/dialog'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogOverlay, DialogPortal } from '~/components/ui/dialog'
import { clearStudentSpaceLocalState } from '~/lib/clear-student-space-local-state'
import { signOutEngine } from '~/lib/sign-out-engine'
import { cn } from '~/lib/utils'

/**
 * Cmd-K developer palette. Mounted in the root layout so it is reachable
 * from any route. Listens for `Cmd-K` (macOS) or `Ctrl-K` (other platforms)
 * on the global window and opens a Base UI Dialog with a searchable
 * command list.
 *
 * The palette is the only UX seam between the new Student Space app shell
 * (UI mode at `/`) and the agent-pipeline test bench at
 * `/dev/pipeline`. It also exposes the legacy routes (`/library`, `/me`,
 * `/reflect`) so QA can reach them without typing URLs.
 */
type Command = {
  id: string
  label: string
  hint?: string
  run: () => void
}

const DEV_OVERLAY_STORAGE_KEY = 'sm:dev-overlay-hidden'
const DEV_OVERLAY_HIDDEN_CLASS = 'is-dev-overlay-hidden'
const ONBOARDING_STORAGE_KEY = 'ss:v1:onboarding'

export function DevPalette() {
  const navigate = useNavigate()
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [devOverlayHidden, setDevOverlayHidden] = useState(false)

  const applyDevOverlayHidden = useCallback((next: boolean) => {
    setDevOverlayHidden(next)
    document.body.classList.toggle(DEV_OVERLAY_HIDDEN_CLASS, next)
    try {
      if (next) localStorage.setItem(DEV_OVERLAY_STORAGE_KEY, '1')
      else localStorage.removeItem(DEV_OVERLAY_STORAGE_KEY)
    } catch {
      // Non-fatal: the class still updates for this session.
    }
  }, [])

  useEffect(() => {
    let hidden = false
    try {
      hidden = localStorage.getItem(DEV_OVERLAY_STORAGE_KEY) === '1'
    } catch {
      hidden = false
    }
    document.body.classList.toggle(DEV_OVERLAY_HIDDEN_CLASS, hidden)
    setDevOverlayHidden(hidden)
  }, [])

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      setOpen(false)
      void navigate({ to: path })
    }
    return [
      { id: 'ui', label: 'Switch to UI mode', hint: '/', run: go('/') },
      {
        id: 'backend',
        label: 'Test agent pipeline',
        hint: '/dev/pipeline',
        run: go('/dev/pipeline'),
      },
      {
        id: 'dev-overlay',
        label: devOverlayHidden ? 'Show world controls' : 'Hide world controls',
        hint: 'HUD panel',
        run: () => {
          setOpen(false)
          applyDevOverlayHidden(!devOverlayHidden)
        },
      },
      {
        id: 'restart-onboarding',
        label: 'Restart onboarding',
        hint: '/onboarding',
        run: () => {
          setOpen(false)
          signOutEngine()
          try {
            localStorage.removeItem(ONBOARDING_STORAGE_KEY)
          } catch {
            // Non-fatal: the /onboarding boot path also resets the slice.
          }
          window.location.assign('/onboarding')
        },
      },
      {
        id: 'signout',
        label: 'Sign out',
        hint: '/api/auth/sign-out',
        run: () => {
          setOpen(false)
          // Tear the engine down BEFORE wiping its localStorage keys.
          // Persistence's debounced writes (250ms) would otherwise race the
          // clear: a save scheduled at t=0 lands at t=250ms and re-creates
          // the `ss:v1:*` keys we just deleted, defeating the per-session
          // cleanup. dispose() drains the pending writes synchronously
          // (via Persistence.dispose → flush) and removes the rAF loop so
          // no further saves can fire during the sign-out POST flight.
          signOutEngine()
          clearStudentSpaceLocalState()
          // POST via a hidden form mirrors the profile sheet's sign-out
          // pattern. The GET handler skips the same-origin guard the POST
          // handler enforces; using POST removes a cross-site forced-logout
          // vector.
          const form = document.createElement('form')
          form.method = 'post'
          form.action = '/api/auth/sign-out'
          document.body.appendChild(form)
          form.submit()
        },
      },
    ]
  }, [navigate, devOverlayHidden, applyDevOverlayHidden])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.hint ?? '').toLowerCase().includes(q),
    )
  }, [commands, query])

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(0)
  }, [filtered, activeIndex])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return
      const isCmdOrCtrl = e.metaKey || e.ctrlKey
      if (!isCmdOrCtrl) return
      if (e.key !== 'k' && e.key !== 'K') return
      e.preventDefault()
      setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
  }, [open])

  function handleInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[activeIndex]?.run()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPortal>
        <DialogOverlay />
        <BaseDialog.Popup
          className={cn(
            'fixed left-1/2 top-[16svh] z-50 w-full max-w-xl -translate-x-1/2',
            'rounded-lg border border-border bg-background shadow-2xl',
            'transition-all duration-150 ease-out',
            'data-[starting-style]:opacity-0 data-[starting-style]:scale-95',
            'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
          )}
        >
          <BaseDialog.Title className="sr-only">Developer command palette</BaseDialog.Title>
          <div className="border-b border-border px-3 py-2">
            <input
              autoFocus
              type="text"
              placeholder="Type a command…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKey}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-[60svh] overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No commands match.</div>
            ) : (
              filtered.map((cmd, i) => {
                const isActive = i === activeIndex
                const isCurrent = cmd.hint === currentPath
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => cmd.run()}
                    aria-selected={isActive}
                    role="option"
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm',
                      isActive ? 'bg-muted' : 'hover:bg-muted',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span>{cmd.label}</span>
                      {isCurrent ? (
                        <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          current
                        </span>
                      ) : null}
                    </span>
                    {cmd.hint ? (
                      <span className="font-mono text-xs text-muted-foreground">{cmd.hint}</span>
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>↑ ↓ navigate · ↵ select · esc close</span>
            <span className="font-mono">⌘K</span>
          </div>
        </BaseDialog.Popup>
      </DialogPortal>
    </Dialog>
  )
}
