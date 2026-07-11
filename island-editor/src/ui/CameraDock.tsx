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

/** Bottom-right camera dock: view presets + rotate/zoom/recenter nudges. The
 *  free-orbit and scroll-zoom gestures have no button of their own, so they ride
 *  along in the tooltips of the buttons that do the same job in discrete steps. */
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
        <IconButton
          title="Designer view"
          hint="The default three-quarter framing."
          tipSide="left"
          onClick={onDesignerView}
        >
          <DesignerViewIcon />
        </IconButton>
        <IconButton
          title="Top view"
          hint="Straight down — best for laying out paths."
          tipSide="left"
          onClick={onTopView}
        >
          <TopViewIcon />
        </IconButton>
        <IconButton
          title="Rotate left"
          hint="22.5° step · hold Space + drag to orbit freely"
          tipSide="left"
          onClick={onRotateLeft}
        >
          <RotateLeftIcon />
        </IconButton>
        <IconButton
          title="Rotate right"
          hint="22.5° step · hold Space + drag to orbit freely"
          tipSide="left"
          onClick={onRotateRight}
        >
          <RotateRightIcon />
        </IconButton>
        <IconButton
          title="Zoom out"
          hint="Or scroll on the island."
          tipSide="left"
          onClick={onZoomOut}
        >
          <ZoomOutIcon />
        </IconButton>
        <IconButton
          title="Zoom in"
          hint="Or scroll on the island."
          tipSide="left"
          onClick={onZoomIn}
        >
          <ZoomInIcon />
        </IconButton>
        <IconButton
          title="Recenter"
          hint="Reframe the island in the default view."
          tipSide="left"
          onClick={onRecenter}
        >
          <RecenterIcon />
        </IconButton>
      </div>
    </div>
  )
}
