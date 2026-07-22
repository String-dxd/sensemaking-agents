/** Sets sRGB output + ACES filmic tone mapping (exposure 1.1) — KTD-4. */
export function configureColorPipeline(renderer: {
  outputEncoding: number
  toneMapping: number
  toneMappingExposure: number
}): void

export default class Renderer {
  instance: unknown
  resize(): void
  update(): void
  destroy(): void
}
