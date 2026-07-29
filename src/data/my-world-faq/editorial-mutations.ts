import { normalizeMyWorldFaqDocument } from './compose-document'
import { FAQ_EDITABLE_PATHS } from './content-manifest'
import {
  type MyWorldFaqEditorialDocument,
  type MyWorldFaqValidationIssue,
  type MyWorldFaqValidationWarning,
  validateMyWorldFaqDocument,
} from './content-schema'

const EDITABLE_PATH_SET = new Set<string>(FAQ_EDITABLE_PATHS)

type MutableRecord = Record<string, unknown>

interface PathReadResult {
  found: boolean
  value: unknown
}

export type MyWorldFaqEditorialMutationIssueCode =
  | MyWorldFaqValidationIssue['code']
  | 'non_editable_change'
  | 'no_op'

export interface MyWorldFaqEditorialMutationIssue {
  path: string
  code: MyWorldFaqEditorialMutationIssueCode
  message: string
}

export type MyWorldFaqEditorialMutationFailureReason =
  | 'invalid_base'
  | 'non_editable_change'
  | 'invalid_candidate'
  | 'no_op'

export type MyWorldFaqEditorialMutationResult =
  | {
      success: true
      intentDocument: MyWorldFaqEditorialDocument
      document: MyWorldFaqEditorialDocument
      dirtyPaths: string[]
      stampTargets: string[]
      warnings: MyWorldFaqValidationWarning[]
    }
  | {
      success: false
      reason: MyWorldFaqEditorialMutationFailureReason
      issues: MyWorldFaqEditorialMutationIssue[]
      warnings: MyWorldFaqValidationWarning[]
    }

export type MyWorldFaqEditorialIntentResult =
  | {
      success: true
      intentDocument: MyWorldFaqEditorialDocument
      dirtyPaths: string[]
      stampTargets: string[]
      warnings: MyWorldFaqValidationWarning[]
    }
  | {
      success: false
      reason: MyWorldFaqEditorialMutationFailureReason
      issues: MyWorldFaqEditorialMutationIssue[]
      warnings: MyWorldFaqValidationWarning[]
    }

export type MyWorldFaqEditorialComparisonStatus =
  | 'unchanged'
  | 'local-only'
  | 'remote-only'
  | 'converged'
  | 'overlap'

export interface MyWorldFaqEditorialFieldComparison {
  path: string
  status: MyWorldFaqEditorialComparisonStatus
  baseValue: string
  localValue: string
  latestValue: string
}

export interface PrepareMyWorldFaqEditorialMutationInput {
  base: MyWorldFaqEditorialDocument
  submitted: unknown
  reviewDate: string
}

export interface PrepareMyWorldFaqEditorialIntentInput {
  base: MyWorldFaqEditorialDocument
  submitted: unknown
}

export interface StampMyWorldFaqEditorialIntentInput {
  intentDocument: MyWorldFaqEditorialDocument
  dirtyPaths: readonly string[]
  reviewDate: string
}

function isRecord(value: unknown): value is MutableRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function arrayRecordKey(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.id === 'string') return value.id
  if (typeof value.state === 'string') return value.state
  return undefined
}

function resolveArrayIndex(items: unknown[], segment: string): number {
  if (/^\d+$/.test(segment)) {
    const index = Number(segment)
    return Number.isSafeInteger(index) && index < items.length ? index : -1
  }
  return items.findIndex((item) => arrayRecordKey(item) === segment)
}

function readStablePath(input: unknown, path: string): PathReadResult {
  let current = input
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const index = resolveArrayIndex(current, segment)
      if (index < 0) return { found: false, value: undefined }
      current = current[index]
      continue
    }
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return { found: false, value: undefined }
    }
    current = current[segment]
  }
  return { found: true, value: current }
}

function assignStablePath(input: unknown, path: string, value: unknown): boolean {
  const segments = path.split('.')
  let current = input

  for (const [index, segment] of segments.entries()) {
    const isLast = index === segments.length - 1
    if (Array.isArray(current)) {
      const arrayIndex = resolveArrayIndex(current, segment)
      if (arrayIndex < 0) return false
      if (isLast) {
        current[arrayIndex] = value
        return true
      }
      current = current[arrayIndex]
      continue
    }
    if (!isRecord(current) || !Object.hasOwn(current, segment)) return false
    if (isLast) {
      current[segment] = value
      return true
    }
    current = current[segment]
  }

  return false
}

function assertEditablePath(path: string): void {
  if (!EDITABLE_PATH_SET.has(path)) {
    throw new RangeError(`Unknown My World FAQ editable path: ${path}`)
  }
}

export function readMyWorldFaqManifestPath(
  document: MyWorldFaqEditorialDocument,
  path: string,
): string {
  assertEditablePath(path)
  const result = readStablePath(document, path)
  if (!result.found || typeof result.value !== 'string') {
    throw new RangeError(`My World FAQ editable path is unavailable: ${path}`)
  }
  return result.value
}

export function setMyWorldFaqManifestPath(
  document: MyWorldFaqEditorialDocument,
  path: string,
  value: string,
): MyWorldFaqEditorialDocument {
  assertEditablePath(path)
  const updated = structuredClone(document)
  if (!assignStablePath(updated, path, value)) {
    throw new RangeError(`My World FAQ editable path is unavailable: ${path}`)
  }
  return updated
}

function stableRecordArrayKeys(items: unknown[]): string[] | undefined {
  const keys = items.map(arrayRecordKey)
  if (keys.some((key) => key === undefined)) return undefined
  const definedKeys = keys as string[]
  return new Set(definedKeys).size === definedKeys.length ? definedKeys : undefined
}

function joinPath(parent: string, segment: string): string {
  return parent.length > 0 ? `${parent}.${segment}` : segment
}

function collectStableDiffPaths(
  left: unknown,
  right: unknown,
  path: string,
  differences: Set<string>,
): void {
  if (Object.is(left, right)) return

  if (Array.isArray(left) && Array.isArray(right)) {
    const leftKeys = stableRecordArrayKeys(left)
    const rightKeys = stableRecordArrayKeys(right)
    if (leftKeys && rightKeys) {
      if (
        leftKeys.length !== rightKeys.length ||
        leftKeys.some((key, index) => key !== rightKeys[index])
      ) {
        differences.add(path)
      }
      const leftByKey = new Map(leftKeys.map((key, index) => [key, left[index]]))
      const rightByKey = new Map(rightKeys.map((key, index) => [key, right[index]]))
      const keys = [...new Set([...leftKeys, ...rightKeys])].sort()
      for (const key of keys) {
        if (!leftByKey.has(key) || !rightByKey.has(key)) {
          differences.add(joinPath(path, key))
          continue
        }
        collectStableDiffPaths(
          leftByKey.get(key),
          rightByKey.get(key),
          joinPath(path, key),
          differences,
        )
      }
      return
    }

    if (left.length !== right.length) differences.add(path)
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      if (index >= left.length || index >= right.length) {
        differences.add(joinPath(path, String(index)))
        continue
      }
      collectStableDiffPaths(left[index], right[index], joinPath(path, String(index)), differences)
    }
    return
  }

  if (isRecord(left) && isRecord(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
    for (const key of keys) {
      if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) {
        differences.add(joinPath(path, key))
        continue
      }
      collectStableDiffPaths(left[key], right[key], joinPath(path, key), differences)
    }
    return
  }

  differences.add(path)
}

function isLockedArrayContainerPath(path: string): boolean {
  return (
    /^(?:productSteps|signalQuotes|ledgerPreview|concernClusters|questions|sources|productProvenance|guardrails|assets)$/.test(
      path,
    ) ||
    /^questions\.[^.]+\.blocks$/.test(path) ||
    /^sources\.[^.]+\.authors$/.test(path)
  )
}

function isEditableValueOrPlainObjectContainer(path: string): boolean {
  if (EDITABLE_PATH_SET.has(path)) return true
  if (path.length === 0 || isLockedArrayContainerPath(path)) return false
  return FAQ_EDITABLE_PATHS.some((editablePath) => editablePath.startsWith(`${path}.`))
}

function editableDirtyPaths(
  base: MyWorldFaqEditorialDocument,
  candidate: MyWorldFaqEditorialDocument,
): string[] {
  return FAQ_EDITABLE_PATHS.filter(
    (path) =>
      readMyWorldFaqManifestPath(base, path) !== readMyWorldFaqManifestPath(candidate, path),
  )
}

function stampTargetForEditablePath(path: string): string | undefined {
  const questionBlock = path.match(/^questions\.([^.]+)\.blocks\.([^.]+)\./)
  if (questionBlock) {
    return `questions.${questionBlock[1]}.blocks.${questionBlock[2]}.review.lastReviewed`
  }

  const question = path.match(/^questions\.([^.]+)\.(?:displayedQuestion|shortAnswer)$/)
  if (question) return `questions.${question[1]}.review.lastReviewed`

  const source = path.match(/^sources\.([^.]+)\./)
  if (source) return `sources.${source[1]}.lastChecked`

  const provenance = path.match(/^productProvenance\.([^.]+)\./)
  if (provenance) return `productProvenance.${provenance[1]}.lastChecked`

  const guardrail = path.match(/^guardrails\.([^.]+)\./)
  if (guardrail) return `guardrails.${guardrail[1]}.review.lastReviewed`

  const asset = path.match(/^assets\.([^.]+)\.(?:alt|transcript)$/)
  if (asset) return `assets.${asset[1]}.lastReviewed`

  return undefined
}

function stampTargetsForDirtyPaths(dirtyPaths: readonly string[]): string[] {
  const targets = new Set<string>()
  for (const path of dirtyPaths) {
    const target = stampTargetForEditablePath(path)
    if (target) targets.add(target)
  }
  return [...targets]
}

function validationIssues(
  issues: readonly MyWorldFaqValidationIssue[],
): MyWorldFaqEditorialMutationIssue[] {
  return issues.map((issue) => ({ ...issue }))
}

export function prepareMyWorldFaqEditorialIntent({
  base,
  submitted,
}: PrepareMyWorldFaqEditorialIntentInput): MyWorldFaqEditorialIntentResult {
  const validatedBase = validateMyWorldFaqDocument(base)
  if (!validatedBase.success) {
    return {
      success: false,
      reason: 'invalid_base',
      issues: validationIssues(validatedBase.errors),
      warnings: validatedBase.warnings,
    }
  }

  const candidate = structuredClone(validatedBase.document)
  for (const path of FAQ_EDITABLE_PATHS) {
    const submittedValue = readStablePath(submitted, path)
    assignStablePath(candidate, path, submittedValue.found ? submittedValue.value : undefined)
  }

  const submittedDifferences = new Set<string>()
  collectStableDiffPaths(validatedBase.document, submitted, '', submittedDifferences)
  const nonEditableDifferences = [...submittedDifferences].filter(
    (path) => !isEditableValueOrPlainObjectContainer(path),
  )
  if (nonEditableDifferences.length > 0) {
    return {
      success: false,
      reason: 'non_editable_change',
      issues: nonEditableDifferences.sort().map((path) => ({
        path,
        code: 'non_editable_change' as const,
        message: 'This field is controlled by the application and cannot be published here.',
      })),
      warnings: [],
    }
  }

  const validatedCandidate = validateMyWorldFaqDocument(candidate)
  if (!validatedCandidate.success) {
    return {
      success: false,
      reason: 'invalid_candidate',
      issues: validationIssues(validatedCandidate.errors),
      warnings: validatedCandidate.warnings,
    }
  }

  const intentDocument = normalizeMyWorldFaqDocument(validatedCandidate.document)
  const dirtyPaths = editableDirtyPaths(validatedBase.document, intentDocument)
  if (dirtyPaths.length === 0) {
    return {
      success: false,
      reason: 'no_op',
      issues: [
        {
          path: '',
          code: 'no_op',
          message: 'No editable wording has changed.',
        },
      ],
      warnings: [],
    }
  }

  const stampTargets = stampTargetsForDirtyPaths(dirtyPaths)
  return {
    success: true,
    intentDocument,
    dirtyPaths,
    stampTargets,
    warnings: validatedCandidate.warnings,
  }
}

export function stampMyWorldFaqEditorialIntent({
  intentDocument,
  dirtyPaths,
  reviewDate,
}: StampMyWorldFaqEditorialIntentInput): MyWorldFaqEditorialMutationResult {
  const stampTargets = stampTargetsForDirtyPaths(
    dirtyPaths.filter((path) => EDITABLE_PATH_SET.has(path)),
  )
  const candidate = structuredClone(intentDocument)
  for (const path of stampTargets) {
    if (!assignStablePath(candidate, path, reviewDate)) {
      throw new Error(`My World FAQ stamp target is unavailable: ${path}`)
    }
  }

  const validatedCandidate = validateMyWorldFaqDocument(candidate)
  if (!validatedCandidate.success) {
    return {
      success: false,
      reason: 'invalid_candidate',
      issues: validationIssues(validatedCandidate.errors),
      warnings: validatedCandidate.warnings,
    }
  }

  return {
    success: true,
    intentDocument: normalizeMyWorldFaqDocument(intentDocument),
    document: normalizeMyWorldFaqDocument(validatedCandidate.document),
    dirtyPaths: [...dirtyPaths],
    stampTargets,
    warnings: validatedCandidate.warnings,
  }
}

export function prepareMyWorldFaqEditorialMutation({
  base,
  submitted,
  reviewDate,
}: PrepareMyWorldFaqEditorialMutationInput): MyWorldFaqEditorialMutationResult {
  const intent = prepareMyWorldFaqEditorialIntent({ base, submitted })
  if (!intent.success) return intent
  return stampMyWorldFaqEditorialIntent({
    intentDocument: intent.intentDocument,
    dirtyPaths: intent.dirtyPaths,
    reviewDate,
  })
}

export function compareMyWorldFaqEditorialVersions(
  base: MyWorldFaqEditorialDocument,
  local: MyWorldFaqEditorialDocument,
  latest: MyWorldFaqEditorialDocument,
): MyWorldFaqEditorialFieldComparison[] {
  return FAQ_EDITABLE_PATHS.map((path) => {
    const baseValue = readMyWorldFaqManifestPath(base, path)
    const localValue = readMyWorldFaqManifestPath(local, path)
    const latestValue = readMyWorldFaqManifestPath(latest, path)
    const localChanged = localValue !== baseValue
    const remoteChanged = latestValue !== baseValue

    let status: MyWorldFaqEditorialComparisonStatus
    if (!localChanged && !remoteChanged) status = 'unchanged'
    else if (localChanged && !remoteChanged) status = 'local-only'
    else if (!localChanged) status = 'remote-only'
    else if (localValue === latestValue) status = 'converged'
    else status = 'overlap'

    return { path, status, baseValue, localValue, latestValue }
  })
}
