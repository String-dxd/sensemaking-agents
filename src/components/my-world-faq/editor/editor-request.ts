export const MY_WORLD_FAQ_EDITOR_REQUEST_TIMEOUT_MS = 15_000

export async function fetchEditorJsonWithDeadline<T>(
  input: RequestInfo | URL,
  init: Omit<RequestInit, 'signal'>,
  timeoutMs = MY_WORLD_FAQ_EDITOR_REQUEST_TIMEOUT_MS,
): Promise<{ response: Response; body: T | null }> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort()
      reject(new Error('FAQ editor request timed out.'))
    }, timeoutMs)
  })

  try {
    const response = await Promise.race([
      fetch(input, { ...init, signal: controller.signal }),
      deadline,
    ])
    const body = await Promise.race([
      response
        .json()
        .then((value) => value as T)
        .catch(() => null),
      deadline,
    ])
    return { response, body }
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}
