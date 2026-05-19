export interface StudentSpaceAudioCapture {
  mimeType: string
  stop: () => Promise<Blob>
  abort: () => void
}

export function canRecordStudentSpaceAudio(): boolean {
  return Boolean(
    typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined',
  )
}

export async function startStudentSpaceAudioCapture(): Promise<StudentSpaceAudioCapture> {
  if (!canRecordStudentSpaceAudio()) {
    throw new Error('This browser does not support audio recording.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = pickStudentSpaceAudioMimeType()
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  let stopPromise: Promise<Blob> | null = null

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  recorder.start(250)

  return {
    mimeType: recorder.mimeType || mimeType || 'audio/webm',
    stop: () => {
      if (stopPromise) return stopPromise
      stopPromise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          stopStream(stream)
          resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }))
        }
        recorder.onerror = (event) => {
          stopStream(stream)
          const error = (event as Event & { error?: DOMException }).error
          reject(new Error(error?.message ?? 'Recorder error.'))
        }
        try {
          if (recorder.state === 'inactive') {
            stopStream(stream)
            resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }))
          } else {
            recorder.stop()
          }
        } catch (err) {
          stopStream(stream)
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })
      return stopPromise
    },
    abort: () => {
      try {
        if (recorder.state !== 'inactive') recorder.stop()
      } catch {
        /* noop */
      }
      stopStream(stream)
    },
  }
}

export async function blobToStudentSpaceAudioBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export function pickStudentSpaceAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return undefined
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    try {
      track.stop()
    } catch {
      /* noop */
    }
  }
}
