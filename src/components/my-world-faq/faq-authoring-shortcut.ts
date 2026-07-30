export const MY_WORLD_FAQ_EDITOR_PATH = '/my-world/faq/edit'

export type MyWorldFaqShortcutNavigator = (path: string) => void

export function createMyWorldFaqAuthoringShortcut(
  navigate: MyWorldFaqShortcutNavigator = navigateToMyWorldFaqEditor,
): (event: KeyboardEvent) => void {
  return (event) => {
    if (!isMyWorldFaqAuthoringShortcut(event)) return

    event.preventDefault()
    navigate(MY_WORLD_FAQ_EDITOR_PATH)
  }
}

export function isMyWorldFaqAuthoringShortcut(event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === 'k' &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.repeat &&
    !event.isComposing &&
    !event.defaultPrevented &&
    !isTextEntryTarget(event.target)
  )
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false

  return (
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !==
    null
  )
}

function navigateToMyWorldFaqEditor(path: string): void {
  window.location.assign(path)
}
