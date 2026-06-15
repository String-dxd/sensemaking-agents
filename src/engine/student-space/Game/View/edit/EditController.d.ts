import type { TransformPatch, EditableViews } from './editableViews'
import type Selection from './Selection'
import type CommandStack from './CommandStack'

export interface EditControllerParams {
  view: object
  state: object
}

export default class EditController {
  readonly editableViews: EditableViews
  readonly selection: Selection
  readonly commandStack: CommandStack

  constructor(params: EditControllerParams)

  /** Add canvas pointer listener. Called by the 003 panel. */
  activate(): void

  /** Remove canvas pointer listener. Cancels in-flight drag. */
  deactivate(): void

  /** Called from View.dispose(). */
  dispose(): void

  /**
   * Apply a partial transform to an object.
   * Returns false if rejected (not placeable, unknown id).
   */
  applyTransform(id: string, patch: TransformPatch): boolean
}
