import type { ChangeEvent } from 'react'
import { cn } from '~/lib/utils'
import type { WorldEnvironmentControls } from './world/worldStyle'

export interface EnvironmentPanelProps {
  controls: WorldEnvironmentControls
  disabled?: boolean
  onChange: (controls: WorldEnvironmentControls) => void
}

const SWITCHES = [
  { id: 'rain', label: 'rain' },
  { id: 'aurora', label: 'aurora' },
  { id: 'rainbow', label: 'rainbow' },
] as const satisfies readonly {
  id: keyof Pick<WorldEnvironmentControls, 'rain' | 'aurora' | 'rainbow'>
  label: string
}[]

export function EnvironmentPanel({ controls, disabled = false, onChange }: EnvironmentPanelProps) {
  const updateHour = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...controls,
      hour: Number(event.currentTarget.value),
      useRealTime: false,
    })
  }

  const useRealTime = () => {
    onChange({ ...controls, useRealTime: true })
  }

  const toggle = (key: (typeof SWITCHES)[number]['id']) => {
    onChange({ ...controls, [key]: !controls[key] })
  }

  return (
    <section
      aria-label="Environment controls"
      className={cn(
        'pointer-events-auto absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 rounded-[14px]',
        'bg-slate-950/55 px-3.5 py-3 text-[11px] font-medium text-[#f4f1ea] shadow-[0_16px_44px_rgba(15,23,42,0.16)] backdrop-blur-md',
        'max-sm:right-3 max-sm:w-[min(18rem,calc(100vw-1.5rem))]',
        disabled && 'opacity-55',
      )}
      data-testid="environment-panel"
    >
      <label className="grid grid-cols-[1.875rem_8.75rem_2rem] items-center gap-2 max-sm:grid-cols-[1.875rem_minmax(0,1fr)_2rem]">
        <span className="opacity-70">hour</span>
        <input
          aria-label="hour"
          className="h-4 min-w-0 accent-blue-500"
          disabled={disabled}
          max={24}
          min={0}
          onChange={updateHour}
          step={0.1}
          type="range"
          value={controls.hour}
        />
        <span className="text-right tabular-nums opacity-85">{controls.hour.toFixed(1)}</span>
      </label>

      <button
        type="button"
        className={cn(
          'rounded-md border border-white/25 px-2 py-1 text-center text-[11px] text-[#f4f1ea] transition-colors hover:border-white/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
          controls.useRealTime && 'border-white/55 bg-white/18',
        )}
        disabled={disabled}
        onClick={useRealTime}
      >
        use real time
      </button>

      <div aria-hidden className="h-px bg-white/14" />

      <div className="grid gap-2">
        {SWITCHES.map((item) => (
          <div className="flex items-center justify-between gap-3.5" key={item.id}>
            <span className="opacity-70">{item.label}</span>
            <button
              type="button"
              aria-checked={controls[item.id]}
              className={cn(
                'relative h-[22px] w-[38px] flex-shrink-0 rounded-full border border-white/30 bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                controls[item.id] && switchOnClassName(item.id),
              )}
              data-switch={item.id}
              disabled={disabled}
              onClick={() => toggle(item.id)}
              role="switch"
            >
              <span
                className={cn(
                  'absolute left-px top-px size-[18px] rounded-full bg-[#f4f1ea] transition-transform duration-200 ease-out',
                  controls[item.id] && 'translate-x-4',
                )}
              />
              <span className="sr-only">{item.label}</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function switchOnClassName(id: (typeof SWITCHES)[number]['id']): string {
  if (id === 'rain') return 'border-[#7fb3d9]/90 bg-[#7fb3d9]/65'
  if (id === 'aurora') return 'border-[#a8e6c8]/90 bg-[#96dcaa]/55'
  return 'border-white/85 bg-[linear-gradient(90deg,#d63131_0%,#f0a82a_22%,#f3d533_42%,#5cb35b_60%,#4a9adb_78%,#9555c5_100%)]'
}
