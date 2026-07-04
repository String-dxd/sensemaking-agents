// The version-matrix devDep aliases (`three-149`, `three-185` = npm:three@…)
// carry no type declarations of their own; map both (and the example loader
// subpath the tests import) to @types/three so the assignability proof and the
// load-companion matrix check against real three API surface (not `any`).
declare module 'three-149' {
  export * from 'three'
}
declare module 'three-185' {
  export * from 'three'
}
declare module 'three-149/examples/jsm/loaders/GLTFLoader.js' {
  export * from 'three/examples/jsm/loaders/GLTFLoader.js'
}
declare module 'three-185/examples/jsm/loaders/GLTFLoader.js' {
  export * from 'three/examples/jsm/loaders/GLTFLoader.js'
}
