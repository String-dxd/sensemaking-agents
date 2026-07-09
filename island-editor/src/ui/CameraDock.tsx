import './panel.css'
import {
  DesignerViewIcon,
  IconButton,
  RecenterIcon,
  RotateLeftIcon,
  RotateRightIcon,
  TopViewIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons'

interface CameraDockProps {
  onDesignerView: () => void
  onTopView: () => void
  onRotateLeft: () => void
  onRotateRight: () => void
  onZoomOut: () => void
  onZoomIn: () => void
  onRecenter: () => void
}

/** Bottom-right camera dock: view presets + rotate/zoom/recenter nudges, with a
 *  muted caption for the hold-Cmd orbit gesture. */
export function CameraDock({
  onDesignerView,
  onTopView,
  onRotateLeft,
  onRotateRight,
  onZoomOut,
  onZoomIn,
  onRecenter,
}: CameraDockProps) {
  return (
    <div className="camera-dock">
      <div className="camera-dock__grid">
        <IconButton title="Designer view" onClick={onDesignerView}>
          <DesignerViewIcon />
        </IconButton>
        <IconButton title="Top view" onClick={onTopView}>
          <TopViewIcon />
        </IconButton>
        <IconButton title="Rotate left" onClick={onRotateLeft}>
          <RotateLeftIcon />
        </IconButton>
        <IconButton title="Rotate right" onClick={onRotateRight}>
          <RotateRightIcon />
        </IconButton>
        <IconButton title="Zoom out" onClick={onZoomOut}>
          <ZoomOutIcon />
        </IconButton>
        <IconButton title="Zoom in" onClick={onZoomIn}>
          <ZoomInIcon />
        </IconButton>
        <IconButton title="Recenter" onClick={onRecenter}>
          <RecenterIcon />
        </IconButton>
      </div>
      <div className="camera-dock__hint">Hold ⌘ to orbit</div>
    </div>
  )
}
