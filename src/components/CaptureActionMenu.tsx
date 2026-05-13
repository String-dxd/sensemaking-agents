import { Mic, SmilePlus } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

export interface CaptureActionMode {
  id: string
  label: string
  description?: string
  disabled?: boolean
  onSelect: () => void
}

export interface CaptureActionMenuProps {
  modes: CaptureActionMode[]
  disabled?: boolean
  triggerSlot?: ReactNode
}

export function CaptureActionMenu({
  modes,
  disabled = false,
  triggerSlot,
}: CaptureActionMenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const availableModes = modes.filter((mode) => !mode.disabled)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  if (triggerSlot && modes.length <= 1) {
    return (
      <div className="pointer-events-auto" data-testid="capture-action">
        {triggerSlot}
      </div>
    )
  }

  const selectMode = (mode: CaptureActionMode) => {
    if (disabled || mode.disabled) return
    mode.onSelect()
    setOpen(false)
  }

  return (
    <div className="pointer-events-auto relative" data-testid="capture-action">
      <Button
        ref={triggerRef}
        type="button"
        size="icon"
        variant="outline"
        aria-label="Open capture"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || availableModes.length === 0}
        onClick={() => {
          const onlyMode = availableModes[0]
          if (availableModes.length === 1 && onlyMode) {
            selectMode(onlyMode)
            return
          }
          setOpen((next) => !next)
        }}
        className="h-11 w-11 rounded-full border-white/70 bg-background/82 text-foreground shadow-sm backdrop-blur hover:bg-muted"
        data-testid="capture-action-trigger"
        title="Capture"
      >
        <Mic aria-hidden className="h-5 w-5" />
      </Button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Capture options"
          className="absolute bottom-12 right-0 flex min-w-56 flex-col gap-1 rounded-lg border border-border bg-background/95 p-2 text-sm shadow-lg backdrop-blur"
          data-testid="capture-action-menu"
        >
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="menuitem"
              disabled={disabled || mode.disabled}
              onClick={() => selectMode(mode)}
              className={cn(
                'flex items-center gap-2 rounded px-2 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                disabled || mode.disabled ? 'cursor-not-allowed opacity-50' : null,
              )}
              data-testid={`capture-mode-${mode.id}`}
            >
              {mode.id === 'mood' ? (
                <SmilePlus aria-hidden className="h-4 w-4" />
              ) : (
                <Mic aria-hidden className="h-4 w-4" />
              )}
              <span className="flex flex-col">
                <span className="font-medium">{mode.label}</span>
                {mode.description ? (
                  <span className="text-xs text-muted-foreground">{mode.description}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
