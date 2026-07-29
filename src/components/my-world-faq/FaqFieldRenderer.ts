import type { ReactNode } from 'react'

export type MyWorldFaqFieldPresentation = 'single-line' | 'multi-line' | 'url'

export interface MyWorldFaqFieldRenderArgs {
  path: string
  label: string
  value: string
  presentation?: MyWorldFaqFieldPresentation
}

export type MyWorldFaqFieldRenderer = (args: MyWorldFaqFieldRenderArgs) => ReactNode
