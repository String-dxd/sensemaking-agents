import './panel.css'
import { type ObjectKind, OBJECT_KINDS } from '../terrain/terrainGrid'
import { IconButton, KIND_META } from './icons'

interface ModelPanelProps {
  placeKind: ObjectKind | null
  onPick: (k: ObjectKind) => void
}

/** Left-edge palette: pick an object kind to arm placement (orange = armed). */
export function ModelPanel({ placeKind, onPick }: ModelPanelProps) {
  return (
    <div className="model-panel">
      <div className="model-panel__header">Place</div>
      <div className="model-panel__tiles">
        {OBJECT_KINDS.map((k) => {
          const { label, Icon } = KIND_META[k]
          return (
            <IconButton key={k} title={label} active={placeKind === k} onClick={() => onPick(k)}>
              <Icon />
            </IconButton>
          )
        })}
      </div>
      <p className="model-panel__caption">
        Click terrain to drop · click an object to remove · Esc to stop
      </p>
    </div>
  )
}
