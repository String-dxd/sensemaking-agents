import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MyWorldFaqFieldRenderer } from '~/components/my-world-faq/FaqFieldRenderer'
import { MyWorldFaqPage } from '~/components/my-world-faq/MyWorldFaqPage'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { PortalContainerProvider } from '~/components/ui/portal-container'
import {
  addTeamFaqQuestion,
  buildMyWorldFaqEditableFields,
  compareMyWorldFaqEditorialVersions,
  getTeamFaqQuestionCapacity,
  type MyWorldFaqEditorialDocument,
  type MyWorldFaqEditorialFieldComparison,
  type MyWorldFaqValidationIssue,
  validateMyWorldFaqDocument,
} from '~/data/my-world-faq'
import {
  checkMyWorldFaqEditorSession,
  loadMyWorldFaqEditor,
  type MyWorldFaqEditorBaseSnapshot,
  type MyWorldFaqEditorLoaderData,
  type MyWorldFaqEditorSessionState,
  type PublishMyWorldFaqEditorRequest,
  type PublishMyWorldFaqEditorResponse,
  type RestoreMyWorldFaqEditorResponse,
  serializeMyWorldFaqEditorPublishRequest,
} from '~/server/my-world-faq-editor.functions'
import { EditableFaqField, FaqEditorProvider } from './EditableFaqField'
import {
  fetchEditorJsonWithDeadline,
  MY_WORLD_FAQ_EDITOR_REQUEST_TIMEOUT_MS,
} from './editor-request'
import { deriveMyWorldFaqDirtyPaths, updateMyWorldFaqEditableValue } from './editor-state'
import { type AddFaqQuestionDraft, FaqAddQuestionDialog } from './FaqAddQuestionDialog'
import { FaqConflictDialog } from './FaqConflictDialog'
import { FaqEditorGate } from './FaqEditorGate'
import { type FaqEditorNavigationBlock, FaqEditorToolbar } from './FaqEditorToolbar'
import { FaqRevisionHistoryDialog } from './FaqRevisionHistoryDialog'
import { FaqSupportingRecordsDialog } from './FaqSupportingRecordsDialog'

type ReadyEditorData = Extract<MyWorldFaqEditorLoaderData, { status: 'ready' }>
type AccessOverlayState = 'checking' | 'locked' | 'unavailable' | null
type PublishState = 'idle' | 'saving' | 'published' | 'error'
type ActiveMutation = 'publish' | 'restore' | null
type SuccessfulRestore = Extract<RestoreMyWorldFaqEditorResponse, { ok: true }>
type ConflictState = {
  kind: 'stale' | 'superseded'
  base: MyWorldFaqEditorBaseSnapshot
  local: MyWorldFaqEditorialDocument
  latest: MyWorldFaqEditorBaseSnapshot
  committed?: MyWorldFaqEditorBaseSnapshot
  comparisons: readonly MyWorldFaqEditorialFieldComparison[]
}

export function MyWorldFaqEditorPage({
  data,
  onSessionStateChanged,
  onDirtyStateChanged,
  navigationBlock,
}: {
  data: ReadyEditorData
  onSessionStateChanged(state: MyWorldFaqEditorSessionState): void | Promise<void>
  onDirtyStateChanged?(dirty: boolean): void
  navigationBlock?: FaqEditorNavigationBlock
}) {
  const protectedRootRef = useRef<HTMLDivElement>(null)
  const protectedPortalHostRef = useRef<HTMLDivElement>(null)
  const suppressUnloadRef = useRef(false)
  const publishAttemptRef = useRef<{ draftKey: string; attemptId: string } | null>(null)
  const activeMutationRef = useRef<ActiveMutation>(null)
  const accessProbeGenerationRef = useRef(0)
  const workingGenerationRef = useRef(0)
  const [base, setBase] = useState<MyWorldFaqEditorBaseSnapshot>(() =>
    deepFreeze(structuredClone(data.base)),
  )
  const [working, setWorking] = useState<MyWorldFaqEditorialDocument>(() =>
    structuredClone(data.base.document),
  )
  const workingRef = useRef(working)
  const [activeMutation, setActiveMutation] = useState<ActiveMutation>(null)
  const [accessOverlay, setAccessOverlay] = useState<AccessOverlayState>(null)
  const [protectedUiVersion, setProtectedUiVersion] = useState(0)
  const [displayName, setDisplayName] = useState(data.identity.displayName)
  const [idleExpiresAt, setIdleExpiresAt] = useState(data.identity.idleExpiresAt)
  const [absoluteExpiresAt, setAbsoluteExpiresAt] = useState(data.identity.absoluteExpiresAt)
  const [recordsOpen, setRecordsOpen] = useState(false)
  const [recordsTargetPath, setRecordsTargetPath] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [serverIssues, setServerIssues] = useState<readonly MyWorldFaqValidationIssue[]>([])
  const [publishState, setPublishState] = useState<PublishState>('idle')
  const [publishMessage, setPublishMessage] = useState<string | null>(null)
  const [degradedWarning, setDegradedWarning] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [conflictOpen, setConflictOpen] = useState(false)
  const editableFields = useMemo(() => buildMyWorldFaqEditableFields(working), [working])
  const editablePaths = useMemo(() => editableFields.map((field) => field.path), [editableFields])
  const dirtyPaths = useMemo(
    () => deriveMyWorldFaqDirtyPaths(base.document, working, editablePaths),
    [base.document, editablePaths, working],
  )
  const dirtyPathSet = useMemo(() => new Set(dirtyPaths), [dirtyPaths])
  const validation = useMemo(() => validateMyWorldFaqDocument(working), [working])
  const clientErrors = validation.success ? [] : validation.errors
  const errors = useMemo(
    () => deduplicateIssues([...clientErrors, ...serverIssues]),
    [clientErrors, serverIssues],
  )
  const warnings = validation.warnings
  const isDirty = dirtyPaths.length > 0
  const mutationLocked = activeMutation !== null
  const questionCapacity = useMemo(
    () => getTeamFaqQuestionCapacity(base.document, working),
    [base.document, working],
  )

  const replaceWorkingDocument = useCallback((document: MyWorldFaqEditorialDocument) => {
    workingGenerationRef.current += 1
    workingRef.current = document
    setWorking(document)
  }, [])

  const beginMutation = useCallback((kind: Exclude<ActiveMutation, null>): boolean => {
    if (activeMutationRef.current) return false
    activeMutationRef.current = kind
    setActiveMutation(kind)
    return true
  }, [])

  const endMutation = useCallback((kind: Exclude<ActiveMutation, null>) => {
    if (activeMutationRef.current !== kind) return
    activeMutationRef.current = null
    setActiveMutation(null)
  }, [])

  const updateField = useCallback(
    (path: string, value: string) => {
      if (activeMutationRef.current) return
      publishAttemptRef.current = null
      setServerIssues([])
      setPublishState('idle')
      setPublishMessage(null)
      const nextWorking = updateMyWorldFaqEditableValue(
        base.document,
        workingRef.current,
        path,
        value,
      )
      workingGenerationRef.current += 1
      workingRef.current = nextWorking
      setWorking(nextWorking)
      setConflict((currentConflict) => {
        if (!currentConflict) return null
        const nextLocal = updateMyWorldFaqEditableValue(
          currentConflict.base.document,
          currentConflict.local,
          path,
          value,
        )
        return {
          ...currentConflict,
          local: nextLocal,
          comparisons: compareMyWorldFaqEditorialVersions(
            currentConflict.base.document,
            nextLocal,
            currentConflict.latest.document,
          ),
        }
      })
    },
    [base.document],
  )

  const addQuestion = useCallback(
    (draft: AddFaqQuestionDraft): string | null => {
      if (activeMutationRef.current) return 'Wait for the current save to finish.'
      const capacity = getTeamFaqQuestionCapacity(base.document, workingRef.current)
      if (capacity.disabledReason) return capacity.disabledReason

      try {
        const questionId = `team-${crypto.randomUUID()}`
        const nextWorking = addTeamFaqQuestion(workingRef.current, {
          ...draft,
          id: questionId,
          reviewDate: new Date().toISOString().slice(0, 10),
        })
        publishAttemptRef.current = null
        setServerIssues([])
        setPublishState('idle')
        setPublishMessage(null)
        workingGenerationRef.current += 1
        workingRef.current = nextWorking
        setWorking(nextWorking)
        focusAddedQuestion(questionId)
        return null
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The question could not be added.'
        setPublishState('error')
        setPublishMessage(message)
        return message
      }
    },
    [base.document],
  )

  const renderField = useCallback<MyWorldFaqFieldRenderer>(
    (args) => <EditableFaqField {...args} />,
    [],
  )

  const closeProtectedPortals = useCallback(() => {
    setProtectedUiVersion((version) => version + 1)
    setRecordsOpen(false)
    setRecordsTargetPath(null)
    setHistoryOpen(false)
    setConflictOpen(false)
  }, [])

  useEffect(() => {
    onDirtyStateChanged?.(isDirty)
    return () => onDirtyStateChanged?.(false)
  }, [isDirty, onDirtyStateChanged])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty || suppressUnloadRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const checkAccess = useCallback(async () => {
    const probeGeneration = accessProbeGenerationRef.current + 1
    accessProbeGenerationRef.current = probeGeneration
    closeProtectedPortals()
    setEditorProtectedRootVisibility(protectedRootRef.current, false)
    setAccessOverlay('checking')
    let session: MyWorldFaqEditorSessionState = { status: 'unavailable' }
    try {
      session = await settleEditorTaskWithinDeadline(checkMyWorldFaqEditorSession())
    } catch {
      session = { status: 'unavailable' }
    }

    if (accessProbeGenerationRef.current !== probeGeneration) return

    if (session.status === 'ready' && !isAbsolutelyExpired(session.identity.absoluteExpiresAt)) {
      setDisplayName(session.identity.displayName)
      setIdleExpiresAt(session.identity.idleExpiresAt)
      setAbsoluteExpiresAt(session.identity.absoluteExpiresAt)
      setAccessOverlay(null)
      setEditorProtectedRootVisibility(protectedRootRef.current, true)
      return
    }

    const accessFailure: Exclude<MyWorldFaqEditorSessionState, { status: 'ready' }> =
      session.status === 'ready' ? { status: 'locked' } : session
    setAccessOverlay(accessFailure.status)
    await onSessionStateChanged(accessFailure)
  }, [closeProtectedPortals, onSessionStateChanged])

  useEffect(() => {
    const hideProtectedContent = () => {
      accessProbeGenerationRef.current += 1
      closeProtectedPortals()
      setEditorProtectedRootVisibility(protectedRootRef.current, false)
    }
    const onPageShow = async (event: PageTransitionEvent) => {
      if (!event.persisted) {
        return
      }
      await checkAccess()
    }

    window.addEventListener('pagehide', hideProtectedContent)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      window.removeEventListener('pagehide', hideProtectedContent)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [checkAccess, closeProtectedPortals])

  const lockExpiredSession = useCallback(async () => {
    accessProbeGenerationRef.current += 1
    closeProtectedPortals()
    setEditorProtectedRootVisibility(protectedRootRef.current, false)
    setAccessOverlay('locked')
    await onSessionStateChanged({ status: 'locked' })
  }, [closeProtectedPortals, onSessionStateChanged])

  useEffect(() => {
    const idleDeadline = Date.parse(idleExpiresAt)
    const absoluteDeadline = Date.parse(absoluteExpiresAt)
    if (!Number.isFinite(idleDeadline) || !Number.isFinite(absoluteDeadline)) {
      void lockExpiredSession()
      return
    }
    const expiresAt = Math.min(idleDeadline, absoluteDeadline)

    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) {
        if (Date.now() >= absoluteDeadline) {
          void lockExpiredSession()
          return
        }
        void checkAccess()
        return
      }
      timer = setTimeout(schedule, Math.min(remaining, 2_147_483_647))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [absoluteExpiresAt, checkAccess, idleExpiresAt, lockExpiredSession])

  async function logout() {
    accessProbeGenerationRef.current += 1
    closeProtectedPortals()
    setEditorProtectedRootVisibility(protectedRootRef.current, false)
    setAccessOverlay('checking')
    try {
      await fetch('/api/my-world/faq/editor/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    } finally {
      window.location.assign('/my-world/faq/edit')
    }
  }

  function confirmDiscard() {
    suppressUnloadRef.current = true
  }

  function openValidationIssue(path: string) {
    const inlineControl = [...document.querySelectorAll<HTMLElement>('[data-editor-path]')].find(
      (candidate) => candidate.dataset.editorPath === path,
    )
    if (inlineControl) {
      focusEditorControl(path)
      return
    }

    if (isSupportingRecordPath(path)) {
      setRecordsTargetPath(path)
      setRecordsOpen(true)
      return
    }

    const evidenceMatch = /^questions\.([^.]+)\.blocks\./.exec(path)
    if (evidenceMatch) {
      const questionId = evidenceMatch[1]
      const questionIndex = working.questions.findIndex((question) => question.id === questionId)
      const card = document.querySelectorAll<HTMLElement>(
        '[data-testid="faq-editor-question-card"]',
      )[questionIndex]
      card?.querySelector<HTMLElement>('[data-testid="faq-evidence-trigger"]')?.click()
    }

    focusEditorControl(path)
  }

  async function publish() {
    if (
      !isDirty ||
      errors.length > 0 ||
      conflict ||
      publishState === 'saving' ||
      !beginMutation('publish')
    ) {
      return
    }

    const baseAtRequest = deepFreeze(structuredClone(base))
    const expectedBase = { ...baseAtRequest.head }
    const documentAtRequest = structuredClone(workingRef.current)
    const generationAtRequest = workingGenerationRef.current
    const draftKey = JSON.stringify({ document: documentAtRequest, expectedBase })
    if (publishAttemptRef.current?.draftKey !== draftKey) {
      publishAttemptRef.current = { draftKey, attemptId: createPublishAttemptId() }
    }
    const requestBody: PublishMyWorldFaqEditorRequest = {
      schemaVersion: 1,
      document: documentAtRequest,
      expectedBase,
      attemptId: publishAttemptRef.current.attemptId,
    }
    const serializedRequest = serializeMyWorldFaqEditorPublishRequest(requestBody)

    setPublishMessage(null)
    setServerIssues([])
    if (serializedRequest.exceedsLimit) {
      setPublishState('error')
      setPublishMessage(
        'The FAQ draft is too large to publish. Shorten some fields, then try again.',
      )
      endMutation('publish')
      return
    }

    setPublishState('saving')
    try {
      let response: Response
      let body: PublishMyWorldFaqEditorResponse | null
      try {
        const result = await fetchEditorJsonWithDeadline<PublishMyWorldFaqEditorResponse>(
          '/api/my-world/faq/editor/publish',
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: serializedRequest.body,
          },
        )
        response = result.response
        body = result.body
      } catch {
        setPublishState('error')
        setPublishMessage('Publishing could not be confirmed. Try again. Your draft is unchanged.')
        return
      }

      if (response.status === 401) {
        accessProbeGenerationRef.current += 1
        setPublishState('error')
        setPublishMessage('Your editor session expired. Unlock it to try publishing again.')
        closeProtectedPortals()
        setEditorProtectedRootVisibility(protectedRootRef.current, false)
        setAccessOverlay('locked')
        await onSessionStateChanged({ status: 'locked' })
        return
      }

      if (response.status === 422 && body && !body.ok) {
        const returnedIssues = (body.issues ?? []).map<MyWorldFaqValidationIssue>((issue) => ({
          path: issue.path,
          code: 'schema',
          message: issue.message,
        }))
        setServerIssues(returnedIssues)
        setPublishState('error')
        setPublishMessage(body.message)
        const target = returnedIssues.find((issue) => editablePaths.includes(issue.path))
        if (target) openValidationIssue(target.path)
        return
      }

      if (response.status === 409 && body && !body.ok && body.latest) {
        const local = structuredClone(workingRef.current)
        const latest = deepFreeze(structuredClone(body.latest))
        setConflict({
          kind: 'stale',
          base: baseAtRequest,
          local,
          latest,
          comparisons: compareMyWorldFaqEditorialVersions(
            baseAtRequest.document,
            local,
            latest.document,
          ),
        })
        setConflictOpen(true)
        setPublishState('error')
        setPublishMessage(body.message)
        return
      }

      if (!response.ok || !body?.ok) {
        setPublishState('error')
        setPublishMessage(
          body && !body.ok
            ? body.message
            : 'The FAQ could not be published right now. Your draft is unchanged.',
        )
        return
      }

      publishAttemptRef.current = null
      setServerIssues([])
      setDegradedWarning(
        body.resilience === 'degraded'
          ? 'Published successfully, but the public cache could not be refreshed. The saved version is safe.'
          : null,
      )

      if (body.outcome === 'committed-but-superseded') {
        const local = structuredClone(workingRef.current)
        const committed = deepFreeze(structuredClone(body.committed))
        const live = deepFreeze(structuredClone(body.live))
        setConflict({
          kind: 'superseded',
          base: baseAtRequest,
          local,
          latest: live,
          committed,
          comparisons: compareMyWorldFaqEditorialVersions(
            baseAtRequest.document,
            local,
            live.document,
          ),
        })
        setConflictOpen(true)
        setPublishState('published')
        setPublishMessage(
          `Published version ${committed.head.version}, but version ${live.head.version} is now live.`,
        )
        return
      }

      adoptPublishedSnapshot(body.committed, generationAtRequest)
    } finally {
      endMutation('publish')
    }
  }

  function adoptPublishedSnapshot(
    snapshot: MyWorldFaqEditorBaseSnapshot,
    generationAtRequest: number,
  ) {
    const authoritative = deepFreeze(structuredClone(snapshot))
    const hasNewerDraft = workingGenerationRef.current !== generationAtRequest
    setBase(authoritative)
    if (!hasNewerDraft) {
      replaceWorkingDocument(structuredClone(authoritative.document))
    }
    setConflict(null)
    setConflictOpen(false)
    setPublishState('published')
    setPublishMessage(
      hasNewerDraft
        ? `Published version ${authoritative.head.version}. Your newer edits remain as a draft.`
        : `Published. Version ${authoritative.head.version} is live.`,
    )
  }

  function startFromLive() {
    if (!conflict) return
    const live = deepFreeze(structuredClone(conflict.latest))
    publishAttemptRef.current = null
    setBase(live)
    replaceWorkingDocument(structuredClone(live.document))
    setServerIssues([])
    setConflict(null)
    setConflictOpen(false)
    setPublishState('idle')
    setPublishMessage(`Started from live version ${live.head.version}.`)
  }

  const handleHistoryAccessLost = useCallback(
    async (state: Exclude<MyWorldFaqEditorSessionState, { status: 'ready' }>) => {
      accessProbeGenerationRef.current += 1
      closeProtectedPortals()
      setEditorProtectedRootVisibility(protectedRootRef.current, false)
      setAccessOverlay(state.status)
      await onSessionStateChanged(state)
    },
    [closeProtectedPortals, onSessionStateChanged],
  )

  const reloadCurrentBase = useCallback(
    async (_options: { discardDraft: boolean }): Promise<boolean> => {
      let result: MyWorldFaqEditorLoaderData
      try {
        result = await settleEditorTaskWithinDeadline(loadMyWorldFaqEditor())
      } catch {
        return false
      }
      if (result.status === 'locked') {
        await handleHistoryAccessLost(result)
        return false
      }
      if (result.status === 'unavailable') return false

      const authoritative = deepFreeze(structuredClone(result.base))
      publishAttemptRef.current = null
      setDisplayName(result.identity.displayName)
      setIdleExpiresAt(result.identity.idleExpiresAt)
      setAbsoluteExpiresAt(result.identity.absoluteExpiresAt)
      setBase(authoritative)
      replaceWorkingDocument(structuredClone(authoritative.document))
      setServerIssues([])
      setConflict(null)
      setConflictOpen(false)
      setPublishState('idle')
      setPublishMessage(`Reloaded current version ${authoritative.head.version}.`)
      return true
    },
    [handleHistoryAccessLost, replaceWorkingDocument],
  )

  const handleRestored = useCallback(
    (result: SuccessfulRestore) => {
      const authoritative = deepFreeze(structuredClone(result.live))
      publishAttemptRef.current = null
      setBase(authoritative)
      replaceWorkingDocument(structuredClone(authoritative.document))
      setServerIssues([])
      setConflict(null)
      setConflictOpen(false)
      setHistoryOpen(false)
      setPublishState('published')
      setPublishMessage(
        result.outcome === 'committed-but-superseded'
          ? `Restored as version ${result.committed.head.version}, but version ${authoritative.head.version} is now live. The editor reloaded the live version.`
          : `Restored. Version ${authoritative.head.version} is live.`,
      )
      setDegradedWarning(
        result.resilience === 'degraded'
          ? 'Restored successfully, but the public cache could not be refreshed. The saved version is safe.'
          : null,
      )
    },
    [replaceWorkingDocument],
  )

  const handleHistoryMutationStateChanged = useCallback(
    (active: boolean) => {
      if (active) {
        beginMutation('restore')
        return
      }
      endMutation('restore')
    },
    [beginMutation, endMutation],
  )

  const editorContext = useMemo(
    () => ({
      fields: editableFields,
      limits: data.manifest.limits,
      working,
      dirtyPaths: dirtyPathSet,
      errors,
      warnings,
      disabled: mutationLocked,
      updateField,
    }),
    [
      data.manifest.limits,
      dirtyPathSet,
      editableFields,
      errors,
      mutationLocked,
      updateField,
      warnings,
      working,
    ],
  )

  return (
    <FaqEditorProvider value={editorContext}>
      {accessOverlay ? (
        <FaqEditorGate
          overlay
          checking={accessOverlay === 'checking'}
          unavailable={accessOverlay === 'unavailable'}
          onUnlocked={checkAccess}
        />
      ) : null}
      <PortalContainerProvider container={protectedPortalHostRef}>
        <div ref={protectedRootRef} data-testid="faq-editor-protected-root">
          <div ref={protectedPortalHostRef} data-testid="faq-editor-protected-portal-host" />
          <FaqEditorToolbar
            key={`toolbar-${protectedUiVersion}`}
            displayName={displayName}
            baseVersion={base.head.version}
            dirtyCount={dirtyPaths.length}
            invalidCount={errors.length}
            mutationLocked={mutationLocked}
            recordsControl={
              <FaqSupportingRecordsDialog
                key={`records-${protectedUiVersion}`}
                document={working}
                disabled={mutationLocked}
                open={recordsOpen}
                targetPath={recordsTargetPath}
                onOpenChange={(open) => {
                  if (mutationLocked) return
                  setRecordsOpen(open)
                  if (!open) setRecordsTargetPath(null)
                }}
              />
            }
            onExit={() => window.location.assign('/my-world/faq')}
            onLogout={logout}
            saving={publishState === 'saving'}
            published={publishState === 'published'}
            saveBlocked={conflict !== null}
            publishNotice={
              publishMessage
                ? {
                    tone:
                      publishState === 'error'
                        ? 'error'
                        : publishState === 'published'
                          ? 'success'
                          : 'info',
                    message: publishMessage,
                  }
                : null
            }
            degradedWarning={degradedWarning}
            conflictControl={
              conflict ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto min-h-11 px-2 text-xs underline underline-offset-4"
                  onClick={() => setConflictOpen(true)}
                >
                  Review comparison
                </Button>
              ) : null
            }
            onHistory={() => {
              if (!mutationLocked) setHistoryOpen(true)
            }}
            onSave={publish}
            onDiscardConfirmed={confirmDiscard}
            navigationBlock={navigationBlock}
          />

          <section className="border-b border-(--color-faq-line-strong) bg-(--color-faq-surface) px-5 py-8 text-(--color-faq-ink)">
            <Card className="mx-auto grid w-full max-w-5xl gap-4 rounded-[1.5rem_0.5rem_1.5rem_0.5rem] border-(--color-faq-line-strong) bg-(--color-faq-paper) p-4 shadow-none sm:grid-cols-2 sm:p-5">
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-(--color-faq-stage-ink)">
                  Link preview
                </p>
                <p className="mt-1 text-sm leading-relaxed text-(--color-faq-ink-soft)">
                  These fields appear in browser tabs and shared-link previews.
                </p>
              </div>
              <EditableFaqField path="route.title" label="Page title" value={working.route.title} />
              <EditableFaqField
                path="route.description"
                label="Page description"
                value={working.route.description}
              />
            </Card>
          </section>

          {errors.length > 0 ? (
            <section
              aria-labelledby="faq-editor-validation-title"
              className="border-b border-(--color-faq-line-strong) bg-(--color-faq-yellow) px-5 py-5 text-(--color-faq-ink)"
            >
              <div className="mx-auto w-full max-w-5xl">
                <h2 id="faq-editor-validation-title" className="text-sm font-semibold">
                  {errors.length} {errors.length === 1 ? 'issue needs' : 'issues need'} attention
                </h2>
                <ul className="mt-2 space-y-2 text-xs leading-relaxed">
                  {errors.map((issue) => (
                    <li key={`${issue.path}-${issue.code}-${issue.message}`}>
                      {issue.path ? (
                        <button
                          type="button"
                          className="rounded-sm text-left underline decoration-(--color-faq-line-strong) underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)"
                          onClick={() => openValidationIssue(issue.path)}
                        >
                          <span className="font-semibold">{issue.path}:</span> {issue.message}
                        </button>
                      ) : (
                        <>
                          <span className="font-semibold">Complete page:</span> {issue.message}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          <MyWorldFaqPage
            key={`editor-page-${protectedUiVersion}`}
            feedbackEnabled={false}
            content={working}
            authoringShortcutEnabled={false}
            editorMode
            renderField={renderField}
            faqEditorControl={
              <FaqAddQuestionDialog
                document={working}
                disabled={mutationLocked || conflict !== null}
                disabledReason={questionCapacity.disabledReason}
                limits={data.manifest.limits}
                onAdd={addQuestion}
              />
            }
          />

          {conflict ? (
            <FaqConflictDialog
              key={`conflict-${protectedUiVersion}`}
              open={conflictOpen}
              kind={conflict.kind}
              comparisons={conflict.comparisons}
              committedVersion={conflict.committed?.head.version}
              liveVersion={conflict.latest.head.version}
              onKeepDraft={() => setConflictOpen(false)}
              onStartFromLive={startFromLive}
            />
          ) : null}

          <FaqRevisionHistoryDialog
            key={`history-${protectedUiVersion}`}
            open={historyOpen}
            currentBase={base}
            isDirty={isDirty}
            onOpenChange={setHistoryOpen}
            onReloadCurrent={reloadCurrentBase}
            onRestored={handleRestored}
            onAccessLost={handleHistoryAccessLost}
            onMutationStateChanged={handleHistoryMutationStateChanged}
          />
        </div>
      </PortalContainerProvider>
    </FaqEditorProvider>
  )
}

export function setEditorProtectedRootVisibility(root: HTMLElement | null, visible: boolean): void {
  if (!root) return
  root.hidden = !visible
  root.inert = !visible
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child)
  }
  return value
}

function isSupportingRecordPath(path: string): boolean {
  return /^(?:sources|productProvenance|guardrails|assets)\./.test(path)
}

function focusEditorControl(path: string, attempts = 12): void {
  const control = [...document.querySelectorAll<HTMLElement>('[data-editor-path]')].find(
    (candidate) => candidate.dataset.editorPath === path,
  )
  if (control) {
    const details = control.closest('details')
    if (details) details.open = true
    control.focus()
    control.scrollIntoView?.({ block: 'center' })
    return
  }
  if (attempts > 0) requestAnimationFrame(() => focusEditorControl(path, attempts - 1))
}

function focusAddedQuestion(questionId: string, attempts = 12): void {
  requestAnimationFrame(() => {
    const card = [...document.querySelectorAll<HTMLElement>('[data-question-id]')].find(
      (candidate) => candidate.dataset.questionId === questionId,
    )
    const control = card?.querySelector<HTMLElement>('[data-editor-path]')
    if (control) {
      control.focus()
      control.scrollIntoView?.({ block: 'center' })
      return
    }
    if (attempts > 1) focusAddedQuestion(questionId, attempts - 1)
  })
}

function deduplicateIssues(
  issues: readonly MyWorldFaqValidationIssue[],
): readonly MyWorldFaqValidationIssue[] {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.path}\u0000${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function createPublishAttemptId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

async function settleEditorTaskWithinDeadline<T>(task: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error('FAQ editor task timed out.')),
      MY_WORLD_FAQ_EDITOR_REQUEST_TIMEOUT_MS,
    )
  })

  try {
    return await Promise.race([task, deadline])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

function isAbsolutelyExpired(absoluteExpiresAt: string): boolean {
  const deadline = Date.parse(absoluteExpiresAt)
  return !Number.isFinite(deadline) || deadline <= Date.now()
}
