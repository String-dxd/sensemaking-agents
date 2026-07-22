/** Sets sRGB output + ACES filmic tone mapping (exposure 1.1) and enables
 *  soft shadow maps — KTD-4. */
export function configureColorPipeline(renderer: {
  outputEncoding: number
  toneMapping: number
  toneMappingExposure: number
  shadowMap: { enabled: boolean; type: number }
}): void

export default class Renderer {
  instance: unknown
  resize(): void
  update(): void
  destroy(): void
}
