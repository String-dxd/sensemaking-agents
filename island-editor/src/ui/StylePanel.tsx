import './panel.css'
import { useState } from 'react'
import {
  currentTextureTheme,
  setTextureTheme,
  TEXTURE_THEMES,
  type TextureTheme,
} from '../models/textureThemes'

const LABELS: Record<TextureTheme, string> = {
  classic: 'Classic',
  pastel: 'Pastel',
  storybook: 'Storybook',
  off: 'Off',
}

/** Top-center style panel: pick the models' texture theme (or turn textures
 *  off for the flat matte look). Switching re-points the live materials, so
 *  the scene restyles in place — no reload, no respawn. */
export function StylePanel() {
  const [theme, setTheme] = useState<TextureTheme>(() => currentTextureTheme())
  const pick = (t: TextureTheme) => {
    setTextureTheme(t)
    setTheme(t)
  }
  return (
    <div className="style-panel">
      <span className="style-panel__label">Texture</span>
      {TEXTURE_THEMES.map((t) => (
        <button
          key={t}
          type="button"
          className={`style-panel__chip${theme === t ? ' is-active' : ''}`}
          onClick={() => pick(t)}
        >
          {LABELS[t]}
        </button>
      ))}
    </div>
  )
}
