// Headless three GLTFLoader for tests (plan 011). three's GLTFLoader decodes
// embedded PNGs via browser image APIs (self / Blob object-URLs /
// createImageBitmap); none exist in node. These polyfills route the embedded
// image bytes through a data: URL (node's fetch handles data:) and hand back a
// stub bitmap — enough to build texture objects with .offset/.repeat/.wrap for
// the face controller; no pixels are needed headless.

let installed = false
export function installHeadlessImagePolyfills(): void {
  if (installed) return
  installed = true
  const blobBytes = new WeakMap<Blob, BlobPart[]>()
  class TrackedBlob extends Blob {
    constructor(parts: BlobPart[] = [], opts?: BlobPropertyBag) {
      super(parts, opts)
      blobBytes.set(this, parts)
    }
  }
  const g = globalThis as unknown as Record<string, unknown>
  g.Blob = TrackedBlob
  g.self ??= globalThis
  const origCreate = URL.createObjectURL?.bind(URL)
  URL.createObjectURL = (obj: Blob | MediaSource): string => {
    const parts = blobBytes.get(obj as Blob)
    if (!parts) return origCreate ? origCreate(obj) : 'data:application/octet-stream,'
    const bufs = parts.map((p) => {
      if (p instanceof ArrayBuffer) return Buffer.from(new Uint8Array(p))
      if (ArrayBuffer.isView(p)) return Buffer.from(p.buffer, p.byteOffset, p.byteLength)
      return Buffer.from(String(p))
    })
    return `data:${(obj as Blob).type || 'application/octet-stream'};base64,${Buffer.concat(bufs).toString('base64')}`
  }
  URL.revokeObjectURL = () => {}
  g.createImageBitmap = async (): Promise<ImageBitmap> =>
    ({ width: 64, height: 64, close() {} }) as unknown as ImageBitmap
}

/** Minimal shape of a three GLTFLoader for our injected-namespace tests. */
export interface GltfLoaderLike {
  setMeshoptDecoder(decoder: unknown): void
  parse(
    data: ArrayBuffer,
    path: string,
    onLoad: (gltf: unknown) => void,
    onError: (err: unknown) => void,
  ): void
}

/** Parse a GLB headlessly with the given loader + meshopt decoder. */
export async function parseGlbHeadless<T = unknown>(
  glb: Uint8Array,
  loader: GltfLoaderLike,
  meshoptDecoder: { ready: Promise<void> },
): Promise<T> {
  installHeadlessImagePolyfills()
  await meshoptDecoder.ready
  loader.setMeshoptDecoder(meshoptDecoder)
  const ab = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer
  return new Promise<T>((resolve, reject) => {
    loader.parse(ab, '', (gltf) => resolve(gltf as T), reject)
  })
}
