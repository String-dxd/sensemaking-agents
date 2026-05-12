import { Radio } from '@base-ui-components/react/radio'
import { GraduationCap, Heart, Mic, Sparkles, Users } from 'lucide-react'
import { useState } from 'react'
import { type VipsContextType, VipsContextTypeSchema } from '~/agents/tools/schemas'
import { RadioGroup } from '~/components/ui/radio-group'
import { cn } from '~/lib/utils'

const CONTEXT_TYPES = VipsContextTypeSchema.options
export type ContextType = VipsContextType

const LOCAL_STORAGE_KEY = 'sensemaking.context_type.last_used'

interface OptionMeta {
  value: ContextType
  label: string
  hint: string
  Icon: typeof GraduationCap
}

const OPTIONS: OptionMeta[] = [
  { value: 'school', label: 'School', hint: 'class, homework, teachers', Icon: GraduationCap },
  { value: 'family', label: 'Family', hint: 'home, siblings, parents', Icon: Heart },
  { value: 'peer', label: 'Friends', hint: 'classmates, hangouts', Icon: Users },
  { value: 'hobby', label: 'Hobby', hint: 'CCA, side projects', Icon: Sparkles },
  { value: 'civic', label: 'Civic', hint: 'community, service', Icon: Mic },
]

function readLastUsed(): ContextType {
  if (typeof window === 'undefined') return 'school'
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (raw && (CONTEXT_TYPES as readonly string[]).includes(raw)) return raw as ContextType
  } catch {
    // localStorage unavailable (private mode / SSR / etc.) — fall through.
  }
  return 'school'
}

export interface ContextTypePickerProps {
  onSelect: (value: ContextType) => void
  /**
   * Optional initial value override. When omitted, the picker reads
   * `localStorage` and falls back to `'school'` for first use.
   */
  defaultValue?: ContextType
}

/**
 * U7 — Context-type picker. Five large-tap tiles covering the closed
 * VIPS parallax vocabulary. Built on Base UI RadioGroup so roving focus
 * + arrow-key + Home/End navigation + aria-checked semantics come from
 * the primitive.
 *
 * Persistence: the last-used value is mirrored to `localStorage` so the
 * next session pre-highlights it. First use defaults to `school`.
 */
export function ContextTypePicker({ onSelect, defaultValue }: ContextTypePickerProps) {
  const [selected, setSelected] = useState<ContextType>(() => defaultValue ?? readLastUsed())

  function handleChange(value: unknown) {
    const next = value as ContextType
    setSelected(next)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, next)
      } catch {
        // best-effort
      }
    }
    onSelect(next)
  }

  return (
    <div className="flex flex-col gap-3" data-testid="context-type-picker">
      <p className="text-sm text-muted-foreground" id="context-type-picker-label">
        What was this about?
      </p>
      <RadioGroup
        aria-labelledby="context-type-picker-label"
        value={selected}
        onValueChange={handleChange}
        className="grid grid-cols-2 gap-2 sm:grid-cols-5"
      >
        {OPTIONS.map(({ value, label, hint, Icon }) => {
          const isSelected = selected === value
          return (
            <Radio.Root
              key={value}
              value={value}
              data-testid={`context-option-${value}`}
              data-selected={isSelected ? 'true' : 'false'}
              className={cn(
                'flex h-auto cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-3 transition-colors',
                'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'data-[checked]:bg-accent data-[checked]:text-accent-foreground data-[checked]:ring-2 data-[checked]:ring-accent',
              )}
            >
              <Icon aria-hidden className="h-5 w-5" />
              <span className="text-sm font-medium">{label}</span>
              <span className="text-[10px] opacity-70">{hint}</span>
            </Radio.Root>
          )
        })}
      </RadioGroup>
    </div>
  )
}
