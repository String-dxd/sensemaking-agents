import { type CSSProperties, useEffect, useState } from 'react'
import { registerUpdate, unregisterUpdate } from '../../core/motion/frameLoop'
import { createValueNoise1d, mulberry32 } from '../../core/motion/noise'
import type { SpringJointParams } from '../../core/motion/springTypes'
import { useMotionStudio } from '../state/studioStores'
import { EAR_PARAMS, TAIL_PARAMS } from './PlaceholderBody'

// Motion debug panel (plan 003 step 4): live spring-parameter sliders, a
// cheap noise-driven "wind" toggle, and body-motion buttons (hop / shake /
// walk-in-circle) that excite the spring chains. Dev-only tooling — the
// real parameter UI arrives with the studio panels plan.

// Console access for poking the rig/mover while tuning (e.g.
// `__motionStudio.getState().rig.getParticles('earL')`).
declare global {
  interface Window {
    __motionStudio?: typeof useMotionStudio
  }
}
if (typeof window !== 'undefined') window.__motionStudio = useMotionStudio

type TunableKey = 'stiffness' | 'gravityPower' | 'dragForce' | 'hitRadius'

interface SliderSpec {
  key: TunableKey
  label: string
  min: number
  max: number
  step: number
}

const SLIDERS: SliderSpec[] = [
  { key: 'stiffness', label: 'stiffness', min: 0, max: 1, step: 0.01 },
  { key: 'gravityPower', label: 'gravityPower', min: 0, max: 80, step: 0.5 },
  { key: 'dragForce', label: 'dragForce', min: 0, max: 1, step: 0.01 },
  { key: 'hitRadius', label: 'hitRadius', min: 0, max: 0.1, step: 0.005 },
]

interface ChainGroupSpec {
  id: 'ears' | 'tail'
  label: string
  chains: string[]
  defaults: SpringJointParams
}

// Chain names come from the live rig (plan 006: parts/archetypes change the
// chain set — bird uses 'tailFeathers', a bird with ears gains ear chains).
const GROUP_TEMPLATES: ChainGroupSpec[] = [
  { id: 'ears', label: 'Ears (earL + earR)', chains: ['earL', 'earR'], defaults: EAR_PARAMS },
  { id: 'tail', label: 'Tail', chains: ['tail', 'tailFeathers'], defaults: TAIL_PARAMS },
]

type GroupParams = Record<TunableKey, number>

function pickTunable(p: SpringJointParams): GroupParams {
  return { stiffness: p.stiffness, gravityPower: p.gravityPower, dragForce: p.dragForce, hitRadius: p.hitRadius }
}

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 12,
  right: 12,
  width: 260,
  padding: '12px 14px',
  background: 'rgba(20, 20, 26, 0.88)',
  color: '#e6e6ee',
  font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)',
  zIndex: 10,
  userSelect: 'none',
}

const buttonStyle: CSSProperties = {
  font: 'inherit',
  padding: '4px 10px',
  borderRadius: 5,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.08)',
  color: 'inherit',
  cursor: 'pointer',
}

const activeButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'rgba(120, 180, 255, 0.35)',
  borderColor: 'rgba(120, 180, 255, 0.7)',
}

export function MotionDebugPanel() {
  const rig = useMotionStudio((s) => s.rig)
  const mover = useMotionStudio((s) => s.mover)
  const liveChains = useMotionStudio((s) => s.chains)
  const jointCounts: Record<string, number> = {}
  for (const chain of liveChains) jointCounts[chain.name] = chain.boneNames.length
  const GROUPS = GROUP_TEMPLATES.map((g) => ({ ...g, chains: g.chains.filter((c) => jointCounts[c] !== undefined) })).filter(
    (g) => g.chains.length > 0,
  )
  const [params, setParams] = useState<Record<string, GroupParams>>(() => ({
    ears: pickTunable(EAR_PARAMS),
    tail: pickTunable(TAIL_PARAMS),
  }))
  const [walking, setWalking] = useState(false)
  const [wind, setWind] = useState(false)
  const [windStrength, setWindStrength] = useState(30)

  // Cheap wind: per-frame noise impulse folded into each joint's gravity
  // vector (gravityDir stays unit-length; gravityPower carries magnitude).
  useEffect(() => {
    if (!wind || !rig) return
    const noiseX = createValueNoise1d(mulberry32(11))
    const noiseZ = createValueNoise1d(mulberry32(23))
    const gust = createValueNoise1d(mulberry32(37))
    let t = 0
    const onAnimation = (dt: number) => {
      t += dt
      const g = windStrength * (0.4 + 0.6 * gust(t * 0.5))
      const wx = (noiseX(t * 1.1) * 2 - 1) * g
      const wz = (noiseZ(t * 0.9) * 2 - 1) * g
      for (const group of GROUPS) {
        const base = params[group.id]
        const wy = -base.gravityPower
        const power = Math.hypot(wx, wy, wz)
        const dir: [number, number, number] =
          power > 1e-9 ? [wx / power, wy / power, wz / power] : [0, -1, 0]
        for (const chain of group.chains) {
          for (let i = 0; i < (jointCounts[chain] ?? 0); i++) {
            rig.setParams(chain, i, { gravityPower: power, gravityDir: dir })
          }
        }
      }
    }
    registerUpdate('animation', onAnimation)
    return () => {
      unregisterUpdate('animation', onAnimation)
      // Restore the slider-owned gravity settings.
      for (const group of GROUPS) {
        for (const chain of group.chains) {
          for (let i = 0; i < (jointCounts[chain] ?? 0); i++) {
            rig.setParams(chain, i, { gravityPower: params[group.id].gravityPower, gravityDir: [0, -1, 0] })
          }
        }
      }
    }
  }, [wind, windStrength, rig, params])

  if (!rig || !mover) return null

  const applyParam = (group: ChainGroupSpec, key: TunableKey, value: number) => {
    setParams((prev) => ({ ...prev, [group.id]: { ...prev[group.id], [key]: value } }))
    for (const chain of group.chains) {
      for (let i = 0; i < (jointCounts[chain] ?? 0); i++) {
        rig.setParams(chain, i, { [key]: value })
      }
    }
  }

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>motion debug</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <button type="button" style={buttonStyle} onClick={() => mover.hop()}>
          hop
        </button>
        <button type="button" style={buttonStyle} onClick={() => mover.shake()}>
          shake
        </button>
        <button
          type="button"
          style={walking ? activeButtonStyle : buttonStyle}
          onClick={() => setWalking(mover.toggleWalk())}
        >
          {walking ? 'stop walk' : 'walk circle'}
        </button>
        <button type="button" style={buttonStyle} onClick={() => rig.reset()}>
          reset springs
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <button type="button" style={wind ? activeButtonStyle : buttonStyle} onClick={() => setWind((w) => !w)}>
          wind {wind ? 'on' : 'off'}
        </button>
        <input
          type="range"
          min={0}
          max={80}
          step={1}
          value={windStrength}
          onChange={(e) => setWindStrength(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span>{windStrength}</span>
      </div>
      {GROUPS.map((group) => (
        <div key={group.id} style={{ marginBottom: 10 }}>
          <div style={{ opacity: 0.85, marginBottom: 4 }}>{group.label}</div>
          {SLIDERS.map((slider) => (
            <label key={slider.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
              <span style={{ width: 84, opacity: 0.7 }}>{slider.label}</span>
              <input
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={params[group.id][slider.key]}
                onChange={(e) => applyParam(group, slider.key, Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ width: 38, textAlign: 'right' }}>{params[group.id][slider.key]}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  )
}
