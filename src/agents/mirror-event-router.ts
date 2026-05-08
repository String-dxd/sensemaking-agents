import type { SearchPastMirrorsOutput } from '~/agents/tools/schemas'
import { SEARCH_PAST_MIRRORS_NAME } from '~/agents/tools/search-corpus'

/**
 * Pure routing layer for OpenAI Realtime events. The browser
 * `MirrorSession` calls into this on every data-channel message; tests
 * can call it directly with synthetic events.
 *
 * Recognized events:
 * - `response.audio_transcript.delta` / `.done` — collected by the
 *   caller via `onTranscript`.
 * - `response.function_call_arguments.done` — Mirror invokes
 *   `search_past_mirrors`. The router parses arguments, calls
 *   `runSearch`, and pushes a `conversation.item.create` event back
 *   onto the session via `send`.
 *
 * Unknown events are ignored. The router does not own UI state.
 */

interface FunctionCallEvent {
  type: 'response.function_call_arguments.done'
  name?: string
  call_id?: string
  arguments?: string
}

interface TranscriptDeltaEvent {
  type: 'response.audio_transcript.delta'
  delta?: string
}

interface TranscriptDoneEvent {
  type: 'response.audio_transcript.done'
  transcript?: string
}

type RealtimeEvent =
  | FunctionCallEvent
  | TranscriptDeltaEvent
  | TranscriptDoneEvent
  | { type: string; [k: string]: unknown }

export interface HandleRealtimeEventOpts {
  raw: string
  studentId: string
  send: (envelope: unknown) => void
  onToolCall?: (name: string) => void
  onTranscriptDelta?: (delta: string) => void
  onTranscriptDone?: (full: string) => void
  runSearch: (input: {
    query: string
    limit?: number
  }) => SearchPastMirrorsOutput | Promise<SearchPastMirrorsOutput>
}

export async function handleRealtimeEvent(opts: HandleRealtimeEventOpts): Promise<void> {
  let event: RealtimeEvent
  try {
    event = JSON.parse(opts.raw) as RealtimeEvent
  } catch {
    return
  }

  if (event.type === 'response.audio_transcript.delta') {
    const delta = (event as TranscriptDeltaEvent).delta
    if (typeof delta === 'string') opts.onTranscriptDelta?.(delta)
    return
  }

  if (event.type === 'response.audio_transcript.done') {
    const full = (event as TranscriptDoneEvent).transcript
    if (typeof full === 'string') opts.onTranscriptDone?.(full)
    return
  }

  if (event.type === 'response.function_call_arguments.done') {
    const fc = event as FunctionCallEvent
    if (fc.name !== SEARCH_PAST_MIRRORS_NAME || !fc.call_id) {
      // Mirror may only invoke search_past_mirrors. Anything else is ignored
      // — Mirror's surface is the single tool by construction.
      return
    }
    opts.onToolCall?.(fc.name)
    let parsedArgs: { query: string; limit?: number }
    try {
      parsedArgs = JSON.parse(fc.arguments ?? '{}') as { query: string; limit?: number }
    } catch {
      parsedArgs = { query: '' }
    }
    let result: SearchPastMirrorsOutput
    try {
      result = await opts.runSearch(parsedArgs)
    } catch (err) {
      result = { results: [] }
      opts.send({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: fc.call_id,
          output: JSON.stringify({ error: err instanceof Error ? err.message : 'search_failed' }),
        },
      })
      return
    }
    opts.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: fc.call_id,
        output: JSON.stringify(result),
      },
    })
    // Tell the model to continue after we feed back the tool result.
    opts.send({ type: 'response.create' })
  }
}
