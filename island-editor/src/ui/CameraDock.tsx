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
 *  muted caption for the hold-Space orbit gesture. */
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
        <IconButton title="Designer view" tipSide="left" onClick={onDesignerView}>
          <DesignerViewIcon />
        </IconButton>
        <IconButton title="Top view" tipSide="left" onClick={onTopView}>
          <TopViewIcon />
        </IconButton>
        <IconButton title="Rotate left" tipSide="left" onClick={onRotateLeft}>
          <RotateLeftIcon />
        </IconButton>
        <IconButton title="Rotate right" tipSide="left" onClick={onRotateRight}>
          <RotateRightIcon />
        </IconButton>
        <IconButton title="Zoom out" tipSide="left" onClick={onZoomOut}>
          <ZoomOutIcon />
        </IconButton>
        <IconButton title="Zoom in" tipSide="left" onClick={onZoomIn}>
          <ZoomInIcon />
        </IconButton>
        <IconButton title="Recenter" tipSide="left" onClick={onRecenter}>
          <RecenterIcon />
        </IconButton>
      </div>
      <div className="camera-dock__hint">Hold Space + drag to orbit</div>
    </div>
  )
}
