// Headless GLB parse for the version-matrix tests. three's GLTFLoader decodes
// embedded PNGs via browser image APIs absent in node; these polyfills route
// the bytes through a data: URL and hand back a stub bitmap (no pixels needed
// for spring/blink/no-NaN assertions). Version-independent (patches globals),
// so it serves both three-149 and three-185.

// DOM types (Blob/URL/ImageBitmap) aren't in this package's lib on purpose
// (the runtime is DOM-free); the polyfill uses node's runtime globals with
// loose typing so tsconfig can stay DOM-free.
const G = globalThis as unknown as {
  Blob: new (parts?: unknown[], opts?: unknown) => object
  self?: unknown
  createImageBitmap?: (...args: unknown[]) => Promise<unknown>
  URL: { createObjectURL(o: unknown): string; revokeObjectURL(u: string): void }
}

let installed = false
function installPolyfills(): void {
  if (installed) return
  installed = true
  const blobBytes = new WeakMap<object, unknown[]>()
  const NativeBlob = G.Blob
  class TrackedBlob extends NativeBlob {
    constructor(parts: unknown[] = [], opts?: unknown) {
      super(parts, opts)
      blobBytes.set(this, parts)
    }
  }
  G.Blob = TrackedBlob as unknown as typeof G.Blob
  G.self ??= globalThis
  G.URL.createObjectURL = (obj: unknown): string => {
    const parts = blobBytes.get(obj as object)
    if (!parts) return 'data:application/octet-stream,'
    const bufs = parts.map((p) => {
      if (p instanceof ArrayBuffer) return Buffer.from(new Uint8Array(p))
      if (ArrayBuffer.isView(p)) return Buffer.from(p.buffer, p.byteOffset, p.byteLength)
      return Buffer.from(String(p))
    })
    const type = (obj as { type?: string }).type || 'application/octet-stream'
    return `data:${type};base64,${Buffer.concat(bufs).toString('base64')}`
  }
  G.URL.revokeObjectURL = () => {}
  G.createImageBitmap = async () => ({ width: 64, height: 64, close() {} })
}

interface LoaderCtor {
  new (): {
    setMeshoptDecoder(d: unknown): void
    parse(data: ArrayBuffer, path: string, onLoad: (g: unknown) => void, onError: (e: unknown) => void): void
  }
}

/** Parse a GLB with a specific three version's GLTFLoader + meshopt decoder. */
export async function parseGlb<T = unknown>(
  glb: Uint8Array,
  GLTFLoader: LoaderCtor,
  meshoptDecoder: { ready: Promise<void> },
): Promise<T> {
  installPolyfills()
  await meshoptDecoder.ready
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(meshoptDecoder)
  const ab = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer
  return new Promise<T>((resolve, reject) => {
    loader.parse(ab, '', (g) => resolve(g as T), reject)
  })
}
