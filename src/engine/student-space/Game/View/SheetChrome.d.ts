/**
 * Type declarations for the engine SheetChrome primitive.
 *
 * The engine substrate stays vanilla JS (see CLAUDE.md / engine-substrate
 * doctrine). This .d.ts is the same pattern used by `profile-tokens.constants.d.ts`
 * — a hand-maintained companion that lets TS-side code import the JS module
 * with proper types. Kept minimal: only the surface area current TS consumers
 * touch.
 */

export interface SheetChromeHeader {
  eyebrow?: string
  title?: string
  subtitle?: string
}

export type SheetChromeLayout = 'stacked' | 'split'

export interface SheetChromeOptions {
  key: string
  sheetClassName?: string
  withCloseButton?: boolean
  closeOnBackdrop?: boolean
  layout?: SheetChromeLayout
  header?: SheetChromeHeader
  onOpen?: (opts?: unknown) => void
  onClose?: () => void
}

export default class SheetChrome {
  constructor(opts: SheetChromeOptions)
  readonly key: string
  readonly layout: SheetChromeLayout
  isOpen: boolean
  root: HTMLElement | null
  contentSlot: HTMLElement
  bodySlot: HTMLElement
  introSlot: HTMLElement | null
  leftPane: HTMLElement | null
  rightPane: HTMLElement | null
  headerEl: HTMLElement | null
  portalTarget: HTMLElement | null
  closeBtn: HTMLButtonElement | null
  open(opts?: unknown): void
  close(): void
  setHeader(parts: SheetChromeHeader): void
  dispose(): void
}
