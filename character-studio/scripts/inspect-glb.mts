import { NodeIO } from '@gltf-transform/core'
const io = new NodeIO()
const doc = await io.read(process.argv[2])
const root = doc.getRoot()
const skins = root.listSkins()
console.log('scenes:', root.listScenes().length, 'nodes:', root.listNodes().length, 'skins:', skins.length, 'meshes:', root.listMeshes().length)
for (const skin of skins) {
  const joints = skin.listJoints()
  console.log('skin joints:', joints.length)
  console.log('first 10:', joints.slice(0, 10).map(j => j.getName()).join(', '))
  const nonIdentity = joints.filter(j => { const r = j.getRotation(); return Math.abs(r[0])+Math.abs(r[1])+Math.abs(r[2])+Math.abs(1-r[3]) > 1e-5 })
  console.log('joints with non-identity rotation:', nonIdentity.length, nonIdentity.slice(0,5).map(j=>j.getName()))
  const scaled = joints.filter(j => { const s = j.getScale(); return Math.abs(s[0]-1)+Math.abs(s[1]-1)+Math.abs(s[2]-1) > 1e-5 })
  console.log('joints with non-unit scale:', scaled.length)
}
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    console.log('prim:', mesh.getName(), 'targets:', prim.listTargets().length, 'attrs:', prim.listSemantics().join(','), 'indices:', prim.getIndices()?.getCount())
  }
  console.log('targetNames extras:', JSON.stringify(mesh.getExtras()))
}
const head = root.listNodes().find(n => n.getName() === 'head')
console.log('head node translation:', head?.getTranslation())
const hips = root.listNodes().find(n => n.getName() === 'hips')
console.log('hips translation:', hips?.getTranslation())
