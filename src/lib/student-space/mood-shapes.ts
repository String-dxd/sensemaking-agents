export type EmotionEntry = {
  id: string
  label: string
  color: string
  shape: string
}

export const EMOTIONS: ReadonlyArray<EmotionEntry> = [
  { id: 'joy', label: 'Joy', color: '#FFD66B', shape: 'sphere' },
  { id: 'sadness', label: 'Sadness', color: '#7FB3D9', shape: 'teardrop' },
  { id: 'anger', label: 'Anger', color: '#E36A55', shape: 'octahedron' },
  { id: 'fear', label: 'Fear', color: '#B49AD6', shape: 'cube' },
  { id: 'disgust', label: 'Disgust', color: '#9CC36E', shape: 'torus' },
  { id: 'anxiety', label: 'Anxiety', color: '#F1A04E', shape: 'capsule' },
  { id: 'envy', label: 'Envy', color: '#6FC2B3', shape: 'egg' },
  { id: 'embarrassment', label: 'Embarrassed', color: '#F0A6B5', shape: 'halfcube' },
  { id: 'ennui', label: 'Ennui', color: '#A8A5BD', shape: 'disk' },
]

function lighten(hex: string, amount: number) {
  const h = hex.replace('#', '')
  let r = Number.parseInt(h.slice(0, 2), 16)
  let g = Number.parseInt(h.slice(2, 4), 16)
  let b = Number.parseInt(h.slice(4, 6), 16)
  r = Math.round(r + (255 - r) * amount)
  g = Math.round(g + (255 - g) * amount)
  b = Math.round(b + (255 - b) * amount)
  return `rgb(${r},${g},${b})`
}

function darken(hex: string, amount: number) {
  const h = hex.replace('#', '')
  let r = Number.parseInt(h.slice(0, 2), 16)
  let g = Number.parseInt(h.slice(2, 4), 16)
  let b = Number.parseInt(h.slice(4, 6), 16)
  r = Math.round(r * (1 - amount))
  g = Math.round(g * (1 - amount))
  b = Math.round(b * (1 - amount))
  return `rgb(${r},${g},${b})`
}

export function shapeSvg(shape: string, color: string) {
  const light = lighten(color, 0.18)
  const mid = color
  const dark = darken(color, 0.22)
  switch (shape) {
    case 'sphere':
      return `<svg viewBox="0 0 100 100"><circle cx="50" cy="55" r="32" fill="${dark}"/><circle cx="50" cy="50" r="28" fill="${mid}"/><circle cx="40" cy="40" r="12" fill="${light}"/></svg>`
    case 'teardrop':
      return `<svg viewBox="0 0 100 100"><path d="M50 18 L72 70 A24 24 0 1 1 28 70 Z" fill="${mid}"/><path d="M50 18 L62 50 A14 14 0 0 1 38 56 Z" fill="${light}"/><path d="M50 18 L72 70 A24 24 0 0 1 50 88 Z" fill="${dark}"/></svg>`
    case 'octahedron':
      return `<svg viewBox="0 0 100 100"><path d="M50 14 L84 50 L50 86 L16 50 Z" fill="${dark}"/><path d="M50 14 L84 50 L50 50 Z" fill="${light}"/><path d="M50 14 L16 50 L50 50 Z" fill="${mid}"/><path d="M50 86 L84 50 L50 50 Z" fill="${dark}"/><path d="M50 86 L16 50 L50 50 Z" fill="${mid}"/></svg>`
    case 'cube':
      return `<svg viewBox="0 0 100 100"><path d="M22 30 L50 18 L78 30 L78 70 L50 82 L22 70 Z" fill="${dark}"/><path d="M22 30 L50 18 L50 58 L22 70 Z" fill="${mid}"/><path d="M50 18 L78 30 L78 70 L50 58 Z" fill="${dark}"/><path d="M22 30 L50 42 L78 30 L50 18 Z" fill="${light}"/></svg>`
    case 'torus':
      return `<svg viewBox="0 0 100 100"><ellipse cx="50" cy="55" rx="34" ry="14" fill="${dark}"/><ellipse cx="50" cy="50" rx="34" ry="14" fill="${mid}"/><ellipse cx="50" cy="50" rx="14" ry="6" fill="${dark}"/><ellipse cx="40" cy="44" rx="6" ry="3" fill="${light}"/></svg>`
    case 'capsule':
      return `<svg viewBox="0 0 100 100"><rect x="36" y="18" width="28" height="64" rx="14" fill="${dark}"/><rect x="36" y="18" width="14" height="64" rx="7" fill="${mid}"/><rect x="38" y="22" width="6" height="50" rx="3" fill="${light}"/></svg>`
    case 'egg':
      return `<svg viewBox="0 0 100 100"><path d="M50 16 C68 16 80 38 80 60 C80 76 66 86 50 86 C34 86 20 76 20 60 C20 38 32 16 50 16 Z" transform="rotate(15 50 50)" fill="${mid}"/><path d="M50 16 C58 16 65 22 70 32" transform="rotate(15 50 50)" fill="${light}" stroke="${light}" stroke-width="6" stroke-linecap="round"/></svg>`
    case 'halfcube':
      return `<svg viewBox="0 0 100 100"><path d="M22 30 L50 18 L78 30 L78 70 L50 82 L22 70 Z" fill="${dark}" opacity="0.5"/><path d="M50 30 L78 30 L78 70 L50 82 Z" fill="${mid}"/><path d="M50 30 L78 30 L78 50 L50 42 Z" fill="${light}"/></svg>`
    case 'disk':
      return `<svg viewBox="0 0 100 100"><ellipse cx="50" cy="58" rx="36" ry="10" fill="${dark}"/><ellipse cx="50" cy="54" rx="36" ry="10" fill="${mid}"/><ellipse cx="44" cy="52" rx="14" ry="3" fill="${light}"/></svg>`
    default:
      return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="${mid}"/></svg>`
  }
}

export function shapeDataUri(emotion: EmotionEntry) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(shapeSvg(emotion.shape, emotion.color))}`
}

export const EMOTION_BY_ID = Object.fromEntries(EMOTIONS.map((emotion) => [emotion.id, emotion]))
