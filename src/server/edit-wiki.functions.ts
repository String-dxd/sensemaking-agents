import { createServerFn } from '@tanstack/react-start'
import {
  editMirrorCautionHandler,
  editMirrorCautionInputSchema,
  editMirrorSignalsHandler,
  editMirrorSignalsInputSchema,
  editMirrorSummaryHandler,
  editMirrorSummaryInputSchema,
} from './edit-wiki.handler.server'

export const editMirrorCaution = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => editMirrorCautionInputSchema.parse(raw))
  .handler(({ data }) => editMirrorCautionHandler(data))

export const editMirrorSignals = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => editMirrorSignalsInputSchema.parse(raw))
  .handler(({ data }) => editMirrorSignalsHandler(data))

export const editMirrorSummary = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => editMirrorSummaryInputSchema.parse(raw))
  .handler(({ data }) => editMirrorSummaryHandler(data))
