import { normalizeMyWorldFaqDocument } from './compose-document'
import {
  buildMyWorldFaqEditableFields,
  MY_WORLD_FAQ_STRUCTURE_VERSION,
  MY_WORLD_FAQ_V1_STRUCTURE_VERSION,
} from './content-manifest'
import {
  type MyWorldFaqEditorialDocument,
  type MyWorldFaqValidationIssue,
  type MyWorldFaqValidationWarning,
  validateMyWorldFaqDocument,
} from './content-schema'
import { materializeMyWorldFaqEditorDocument } from './editor-projection'
import {
  deriveTeamFaqWorkingAnswerContract,
  isTeamFaqQuestionId,
  MAX_TEAM_FAQ_ADDITIONS_PER_PUBLISH,
} from './team-question-contract'

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

function editablePathsForDocument(document: MyWorldFaqEditorialDocument): string[] {
  return buildMyWorldFaqEditableFields(document).map((field) => field.path)
}

function editablePathSetForDocument(document: MyWorldFaqEditorialDocument): Set<string> {
  return new Set(editablePathsForDocument(document))
}

function assertEditablePath(document: MyWorldFaqEditorialDocument, path: string): void {
  if (!editablePathSetForDocument(document).has(path)) {
    throw new RangeError(`Unknown My World FAQ editable path: ${path}`)
  }
}

export function readMyWorldFaqManifestPath(
  document: MyWorldFaqEditorialDocument,
  path: string,
): string {
  assertEditablePath(document, path)
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
  assertEditablePath(document, path)
  const updated = structuredClone(document)
  if (!assignStablePath(updated, path, value)) {
    throw new RangeError(`My World FAQ editable path is unavailable: ${path}`)
  }
  return updated
}

/**
 * Apply an editor change together with the small set of system-owned fields
 * that are derived from that editable text.
 */
export function updateMyWorldFaqDraftPath(
  base: MyWorldFaqEditorialDocument,
  document: MyWorldFaqEditorialDocument,
  path: string,
  value: string,
): MyWorldFaqEditorialDocument {
  const updated = setMyWorldFaqManifestPath(document, path, value)
  const questionMatch = /^questions\.([^.]+)\.displayedQuestion$/.exec(path)
  if (
    questionMatch?.[1] &&
    isTeamFaqQuestionId(questionMatch[1]) &&
    !base.questions.some((question) => question.id === questionMatch[1])
  ) {
    const question = updated.questions.find((item) => item.id === questionMatch[1])
    if (question) question.title = value
  }

  const blockTextMatch = /^questions\.([^.]+)\.blocks\.([^.]+)\.text$/.exec(path)
  if (blockTextMatch?.[1] && blockTextMatch[2] && isTeamFaqQuestionId(blockTextMatch[1])) {
    const question = updated.questions.find((item) => item.id === blockTextMatch[1])
    const block = question?.blocks.find((item) => item.id === blockTextMatch[2])
    if (block) {
      const contract = deriveTeamFaqWorkingAnswerContract(blockTextMatch[1], value)
      block.id = contract.id
      block.kind = contract.kind
      block.label = contract.label
      block.sourceIds = contract.sourceIds
      block.provenanceIds = contract.provenanceIds
      block.guardrailIds = contract.guardrailIds
      block.review.status = contract.review.status
      block.review.reviewerRole = contract.review.reviewerRole
    }
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

function collapseDescendantPaths(paths: readonly string[]): string[] {
  return [...paths]
    .sort((left, right) => left.length - right.length || left.localeCompare(right))
    .filter(
      (path, _index, candidates) =>
        !candidates.some((candidate) => candidate !== path && path.startsWith(`${candidate}.`)),
    )
    .sort()
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

function additiveQuestionTransitionIssues(
  base: MyWorldFaqEditorialDocument,
  candidate: MyWorldFaqEditorialDocument,
): MyWorldFaqEditorialMutationIssue[] {
  const issues: MyWorldFaqEditorialMutationIssue[] = []
  const baseIds = base.questions.map((question) => question.id)
  const candidatePrefix = candidate.questions.slice(0, baseIds.length)
  if (
    candidatePrefix.length !== baseIds.length ||
    candidatePrefix.some((question, index) => question.id !== baseIds[index])
  ) {
    issues.push({
      path: 'questions',
      code: 'non_editable_change',
      message: 'Published questions cannot be removed or reordered.',
    })
    return issues
  }

  const additions = candidate.questions.slice(base.questions.length)
  const controlledUpgrade =
    base.structureVersion === MY_WORLD_FAQ_V1_STRUCTURE_VERSION &&
    candidate.structureVersion === MY_WORLD_FAQ_STRUCTURE_VERSION &&
    additions.length > 0
  if (candidate.structureVersion !== base.structureVersion && !controlledUpgrade) {
    issues.push({
      path: 'structureVersion',
      code: 'non_editable_change',
      message: 'The FAQ structure version can only advance when the first team question is added.',
    })
  }
  if (additions.length > 0 && candidate.structureVersion !== MY_WORLD_FAQ_STRUCTURE_VERSION) {
    issues.push({
      path: 'structureVersion',
      code: 'non_editable_change',
      message: 'Team-added questions require the current FAQ structure version.',
    })
  }
  if (additions.length > MAX_TEAM_FAQ_ADDITIONS_PER_PUBLISH) {
    issues.push({
      path: 'questions',
      code: 'non_editable_change',
      message: `Add up to ${MAX_TEAM_FAQ_ADDITIONS_PER_PUBLISH} questions in one publication.`,
    })
  }

  const nextOrderByCluster = new Map<string, number>()
  for (const question of base.questions) {
    nextOrderByCluster.set(
      question.clusterId,
      Math.max(nextOrderByCluster.get(question.clusterId) ?? 0, question.order),
    )
  }

  for (const question of additions) {
    const path = `questions.${question.id}`
    if (!isTeamFaqQuestionId(question.id)) {
      issues.push({
        path: `${path}.id`,
        code: 'non_editable_change',
        message: 'New questions require a generated team UUID.',
      })
    }
    if (question.title !== question.displayedQuestion) {
      issues.push({
        path: `${path}.title`,
        code: 'non_editable_change',
        message: 'The initial internal title must match the displayed question.',
      })
    }
    const expectedOrder = (nextOrderByCluster.get(question.clusterId) ?? 0) + 1
    if (question.order !== expectedOrder) {
      issues.push({
        path: `${path}.order`,
        code: 'non_editable_change',
        message: 'New questions are appended to the end of their topic.',
      })
    }
    nextOrderByCluster.set(question.clusterId, expectedOrder)
  }

  return issues
}

function rawTrailingAddedQuestionIds(
  base: MyWorldFaqEditorialDocument,
  submitted: unknown,
): Set<string> {
  if (!isRecord(submitted) || !Array.isArray(submitted.questions)) return new Set()
  const submittedQuestions = submitted.questions
  if (submittedQuestions.length < base.questions.length) return new Set()
  for (const [index, question] of base.questions.entries()) {
    const submittedQuestion = submittedQuestions[index]
    if (!isRecord(submittedQuestion) || submittedQuestion.id !== question.id) return new Set()
  }
  const ids = submittedQuestions.slice(base.questions.length).flatMap((question) => {
    if (!isRecord(question) || typeof question.id !== 'string') return []
    return [question.id]
  })
  return new Set(ids)
}

function isEditableValueOrPlainObjectContainer(
  path: string,
  editablePaths: readonly string[],
  addedQuestionIds: ReadonlySet<string>,
  base: MyWorldFaqEditorialDocument,
  candidate: unknown,
): boolean {
  if (path === 'page.build' || path === 'page.why' || path === 'page.posture') {
    const baseValue = readStablePath(base, path)
    const candidateValue = readStablePath(candidate, path)
    return (
      (!baseValue.found || baseValue.value === undefined) &&
      candidateValue.found &&
      isRecord(candidateValue.value)
    )
  }
  if (editablePaths.includes(path)) return true
  if (path === 'questions' && addedQuestionIds.size > 0) return true
  if (
    path === 'structureVersion' &&
    base.structureVersion === MY_WORLD_FAQ_V1_STRUCTURE_VERSION &&
    readStablePath(candidate, 'structureVersion').value === MY_WORLD_FAQ_STRUCTURE_VERSION &&
    addedQuestionIds.size > 0
  ) {
    return true
  }
  if (isAuthorizedDerivedTeamMetadataPath(base, candidate, path)) return true
  const questionRecord = /^questions\.([^.]+)$/.exec(path)
  if (questionRecord?.[1] && addedQuestionIds.has(questionRecord[1])) return true
  if (path.length === 0 || isLockedArrayContainerPath(path)) return false
  return editablePaths.some((editablePath) => editablePath.startsWith(`${path}.`))
}

function isAuthorizedDerivedTeamMetadataPath(
  base: MyWorldFaqEditorialDocument,
  candidate: unknown,
  path: string,
): boolean {
  const match =
    /^questions\.([^.]+)\.blocks\.([^.]+)\.(kind|label|review\.(?:status|reviewerRole))$/.exec(path)
  const questionId = match?.[1]
  const blockId = match?.[2]
  const field = match?.[3]
  if (
    !questionId ||
    !blockId ||
    !field ||
    !isTeamFaqQuestionId(questionId) ||
    !base.questions.some((question) => question.id === questionId)
  ) {
    return false
  }

  const textPath = `questions.${questionId}.blocks.${blockId}.text`
  const baseText = readStablePath(base, textPath)
  const candidateText = readStablePath(candidate, textPath)
  if (
    !baseText.found ||
    !candidateText.found ||
    typeof baseText.value !== 'string' ||
    typeof candidateText.value !== 'string' ||
    baseText.value === candidateText.value
  ) {
    return false
  }

  const contract = deriveTeamFaqWorkingAnswerContract(questionId, candidateText.value)
  if (contract.id !== blockId) return false
  const expected =
    field === 'kind'
      ? contract.kind
      : field === 'label'
        ? contract.label
        : field === 'review.status'
          ? contract.review.status
          : contract.review.reviewerRole
  const candidateValue = readStablePath(candidate, path)
  return candidateValue.found && candidateValue.value === expected
}

function editableDirtyPaths(
  base: MyWorldFaqEditorialDocument,
  candidate: MyWorldFaqEditorialDocument,
): string[] {
  const comparisonBase = materializeMyWorldFaqEditorDocument(base)
  const comparisonCandidate = materializeMyWorldFaqEditorDocument(candidate)
  const baseIds = new Set(base.questions.map((question) => question.id))
  const candidateIds = new Set(candidate.questions.map((question) => question.id))
  const addedQuestionPaths = candidate.questions
    .filter((question) => !baseIds.has(question.id))
    .map((question) => `questions.${question.id}`)
  const commonPaths = [
    ...new Set([
      ...editablePathsForDocument(comparisonBase),
      ...editablePathsForDocument(comparisonCandidate),
    ]),
  ].filter((path) => {
    const baseValue = readStablePath(comparisonBase, path)
    const candidateValue = readStablePath(comparisonCandidate, path)
    return (
      baseValue.found &&
      candidateValue.found &&
      typeof baseValue.value === 'string' &&
      typeof candidateValue.value === 'string' &&
      baseValue.value !== candidateValue.value
    )
  })

  for (const question of base.questions) {
    if (!candidateIds.has(question.id)) commonPaths.push(`questions.${question.id}`)
  }
  return [...commonPaths, ...addedQuestionPaths]
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

function stampTargetsForDirtyPaths(
  dirtyPaths: readonly string[],
  document: MyWorldFaqEditorialDocument,
): string[] {
  const targets = new Set<string>()
  for (const path of dirtyPaths) {
    const addedQuestion = /^questions\.([^.]+)$/.exec(path)
    if (addedQuestion?.[1] && isTeamFaqQuestionId(addedQuestion[1])) {
      const question = document.questions.find((item) => item.id === addedQuestion[1])
      if (question) {
        targets.add(`questions.${question.id}.review.lastReviewed`)
        for (const block of question.blocks) {
          targets.add(`questions.${question.id}.blocks.${block.id}.review.lastReviewed`)
        }
      }
      continue
    }
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

  const submittedDifferences = new Set<string>()
  collectStableDiffPaths(validatedBase.document, submitted, '', submittedDifferences)
  const rawAddedQuestionIds = rawTrailingAddedQuestionIds(validatedBase.document, submitted)
  // The protected editor materialises optional narrative defaults before a
  // colleague edits anything. Authorise those projected leaf paths even when
  // an older stored revision contains only part of the optional section.
  const baseEditablePaths = editablePathsForDocument(
    materializeMyWorldFaqEditorDocument(validatedBase.document),
  )
  const unauthorizedSubmittedDifferences = collapseDescendantPaths(
    [...submittedDifferences].filter(
      (path) =>
        !isEditableValueOrPlainObjectContainer(
          path,
          baseEditablePaths,
          rawAddedQuestionIds,
          validatedBase.document,
          submitted,
        ),
    ),
  )
  if (unauthorizedSubmittedDifferences.length > 0) {
    return {
      success: false,
      reason: 'non_editable_change',
      issues: unauthorizedSubmittedDifferences.map((path) => ({
        path,
        code: 'non_editable_change' as const,
        message: 'This field is controlled by the application and cannot be published here.',
      })),
      warnings: [],
    }
  }

  const validatedCandidate = validateMyWorldFaqDocument(submitted)
  if (!validatedCandidate.success) {
    return {
      success: false,
      reason: 'invalid_candidate',
      issues: validationIssues(validatedCandidate.errors),
      warnings: validatedCandidate.warnings,
    }
  }

  const candidate = validatedCandidate.document
  const transitionIssues = additiveQuestionTransitionIssues(validatedBase.document, candidate)
  if (transitionIssues.length > 0) {
    return {
      success: false,
      reason: 'non_editable_change',
      issues: transitionIssues,
      warnings: validatedCandidate.warnings,
    }
  }

  const normalizedDifferences = new Set<string>()
  collectStableDiffPaths(validatedBase.document, candidate, '', normalizedDifferences)
  const baseQuestionIds = new Set(validatedBase.document.questions.map((question) => question.id))
  const addedQuestionIds = new Set(
    candidate.questions
      .filter((question) => !baseQuestionIds.has(question.id))
      .map((question) => question.id),
  )
  const editablePaths = [
    ...new Set([
      ...editablePathsForDocument(validatedBase.document),
      ...editablePathsForDocument(candidate),
    ]),
  ]
  const nonEditableDifferences = collapseDescendantPaths(
    [...normalizedDifferences].filter(
      (path) =>
        !isEditableValueOrPlainObjectContainer(
          path,
          editablePaths,
          addedQuestionIds,
          validatedBase.document,
          candidate,
        ),
    ),
  )
  if (nonEditableDifferences.length > 0) {
    return {
      success: false,
      reason: 'non_editable_change',
      issues: nonEditableDifferences.map((path) => ({
        path,
        code: 'non_editable_change' as const,
        message: 'This field is controlled by the application and cannot be published here.',
      })),
      warnings: [],
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

  const stampTargets = stampTargetsForDirtyPaths(dirtyPaths, intentDocument)
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
  const stampTargets = stampTargetsForDirtyPaths(dirtyPaths, intentDocument)
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
  const comparisonBase = materializeMyWorldFaqEditorDocument(base)
  const comparisonLocal = materializeMyWorldFaqEditorDocument(local)
  const comparisonLatest = materializeMyWorldFaqEditorDocument(latest)
  const baseQuestions = new Map(base.questions.map((question) => [question.id, question]))
  const localQuestions = new Map(local.questions.map((question) => [question.id, question]))
  const latestQuestions = new Map(latest.questions.map((question) => [question.id, question]))
  const questionIds = [
    ...new Set([...baseQuestions.keys(), ...localQuestions.keys(), ...latestQuestions.keys()]),
  ]
  const recordComparisons = questionIds.flatMap((id) => {
    const baseQuestion = baseQuestions.get(id)
    const localQuestion = localQuestions.get(id)
    const latestQuestion = latestQuestions.get(id)
    if (Boolean(localQuestion) === Boolean(latestQuestion)) return []
    const baseValue = baseQuestion?.displayedQuestion ?? ''
    const localValue = localQuestion?.displayedQuestion ?? ''
    const latestValue = latestQuestion?.displayedQuestion ?? ''
    return [
      {
        path: `questions.${id}`,
        status: comparisonStatus(baseValue, localValue, latestValue),
        baseValue,
        localValue,
        latestValue,
      },
    ]
  })
  const paths = [
    ...new Set([
      ...editablePathsForDocument(comparisonBase),
      ...editablePathsForDocument(comparisonLocal),
      ...editablePathsForDocument(comparisonLatest),
    ]),
  ]
  const fieldComparisons = paths.flatMap((path) => {
    const baseValue = comparisonValue(comparisonBase, path)
    const localValue = comparisonValue(comparisonLocal, path)
    const latestValue = comparisonValue(comparisonLatest, path)
    if (baseValue === undefined || localValue === undefined || latestValue === undefined) return []
    return [
      {
        path,
        status: comparisonStatus(baseValue, localValue, latestValue),
        baseValue,
        localValue,
        latestValue,
      },
    ]
  })
  return [...fieldComparisons, ...recordComparisons]
}

function comparisonValue(document: MyWorldFaqEditorialDocument, path: string): string | undefined {
  const result = readStablePath(document, path)
  if (result.found && typeof result.value === 'string') return result.value

  const questionMatch = /^questions\.([^.]+)\./.exec(path)
  if (
    questionMatch?.[1] &&
    !document.questions.some((question) => question.id === questionMatch[1])
  ) {
    return ''
  }
  return undefined
}

function comparisonStatus(
  baseValue: string,
  localValue: string,
  latestValue: string,
): MyWorldFaqEditorialComparisonStatus {
  const localChanged = localValue !== baseValue
  const remoteChanged = latestValue !== baseValue
  if (!localChanged && !remoteChanged) return 'unchanged'
  if (localChanged && !remoteChanged) return 'local-only'
  if (!localChanged) return 'remote-only'
  if (localValue === latestValue) return 'converged'
  return 'overlap'
}
