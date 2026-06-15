/**
 * CommandStack — unified undo/redo history for the island editor.
 *
 * Each entry is a plain `{ do, undo }` object. Both are zero-argument
 * functions; the caller is responsible for building closures that capture
 * the right state at push-time.
 *
 * The stack is intentionally simple: it does NOT call `cmd.do()` on push —
 * the caller has already executed the forward action. It only calls
 * `cmd.undo()` / re-calls `cmd.do()` on undo/redo.
 *
 * Cap: the undo history is capped at MAX_ENTRIES (100). When the cap is
 * reached, the oldest entry is silently dropped.
 */

const MAX_ENTRIES = 100

export default class CommandStack
{
    constructor()
    {
        /** @type {Array<{do: () => void, undo: () => void}>} */
        this._stack = []
        /** @type {Array<{do: () => void, undo: () => void}>} */
        this._redo  = []
    }

    /**
     * Push a command onto the history. The caller has already executed the
     * forward action; this records it for undo. Clears the redo stack.
     *
     * @param {{ do: () => void, undo: () => void }} cmd
     */
    push(cmd)
    {
        if(!cmd || typeof cmd.do !== 'function' || typeof cmd.undo !== 'function') return
        this._redo = []
        this._stack.push(cmd)
        if(this._stack.length > MAX_ENTRIES)
            this._stack.shift()
    }

    /**
     * Undo the most recent command. No-op if the history is empty.
     */
    undo()
    {
        const cmd = this._stack.pop()
        if(!cmd) return
        try { cmd.undo() } catch(err) { console.warn('[CommandStack] undo threw', err) }
        this._redo.push(cmd)
    }

    /**
     * Redo the most recently undone command. No-op if the redo stack is empty.
     */
    redo()
    {
        const cmd = this._redo.pop()
        if(!cmd) return
        try { cmd.do() } catch(err) { console.warn('[CommandStack] redo threw', err) }
        this._stack.push(cmd)
    }

    /** Number of commands available to undo. */
    get undoCount() { return this._stack.length }

    /** Number of commands available to redo. */
    get redoCount()  { return this._redo.length }

    /** Clear all history (e.g. on deactivate). */
    clear()
    {
        this._stack = []
        this._redo  = []
    }
}
