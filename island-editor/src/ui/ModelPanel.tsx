import './panel.css'
import { type ObjectKind, OBJECT_KINDS } from '../terrain/terrainGrid'
import { IconButton, KIND_META } from './icons'

/** Same for every kind — how placement works once a tile is armed. */
const PLACE_HINT = 'Click terrain to drop · click an object to remove · Esc to stop'

interface ModelPanelProps {
  placeKind: ObjectKind | null
  onPick: (k: ObjectKind) => void
}

/** Left-edge palette: pick an object kind to arm placement (orange = armed). */
export function ModelPanel({ placeKind, onPick }: ModelPanelProps) {
  return (
    <div className="model-panel">
      {OBJECT_KINDS.map((k) => {
        const { label, Icon } = KIND_META[k]
        return (
          <IconButton
            key={k}
            title={label}
            hint={PLACE_HINT}
            tipSide="right"
            active={placeKind === k}
            onClick={() => onPick(k)}
          >
            <Icon />
          </IconButton>
        )
      })}
    </div>
  )
}
