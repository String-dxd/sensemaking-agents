import * as THREE from 'three'
import { addWorldHitTarget, attachWorldHotspot, hotspotForMailbox } from './hotspots'
import { islandHeightAt } from './island'
import type { MailboxDescriptor } from './vipsWorldMapping'

const COLORS = {
  base: 0x1a1a1a,
  bracket: 0x2a2520,
  red: 0xc8202a,
  redDark: 0x9f161e,
  knob: 0x707070,
} as const

const FLAG_DOWN_RAD = -Math.PI * 0.45
const FLAG_UP_RAD = 0
const MAILBOX_X = -0.6
const MAILBOX_Z = 2.5

export function createMailbox(mailbox: MailboxDescriptor): THREE.Group {
  const group = new THREE.Group()
  group.name = 'student-space-mailbox'
  attachWorldHotspot(group, hotspotForMailbox(mailbox))

  group.position.set(MAILBOX_X, islandHeightAt(MAILBOX_X, MAILBOX_Z), MAILBOX_Z)
  group.rotation.y = Math.PI * 0.92
  group.scale.setScalar(0.8)

  const matBase = lambert(COLORS.base)
  const matBracket = lambert(COLORS.bracket)
  const matRed = lambert(COLORS.red)
  const matDoor = lambert(COLORS.redDark)
  const matKnob = lambert(COLORS.knob)
  const matFlag = lambert(COLORS.red, THREE.DoubleSide)

  const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.36), matBase)
  basePlate.position.y = 0.02
  group.add(basePlate)

  const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.95, 0.07), matBracket)
  post.position.y = 0.5
  group.add(post)

  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.22), matBracket)
  bracket.position.y = 0.94
  group.add(bracket)

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.5, 16, 1, false, 0, Math.PI),
    matRed,
  )
  body.rotation.z = Math.PI / 2
  body.position.set(0, 1.16, 0)
  group.add(body)

  const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.36), matRed)
  bottom.position.set(0, 0.99, 0)
  group.add(bottom)

  const back = new THREE.Mesh(new THREE.CircleGeometry(0.18, 24, 0, Math.PI), matDoor)
  back.rotation.set(0, Math.PI / 2, 0)
  back.position.set(-0.25, 1.16, 0)
  group.add(back)

  const door = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24, 0, Math.PI), matDoor)
  door.rotation.set(0, -Math.PI / 2, 0)
  door.position.set(0.25, 1.16, 0)
  group.add(door)

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), matKnob)
  knob.position.set(0.255, 1.08, 0)
  group.add(knob)

  const flagPole = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.04, 0.014), matFlag)
  flagPole.position.set(0.27, 1.18, 0.18)
  const flagPivot = new THREE.Group()
  flagPivot.position.set(0.27, 1.16, 0.18)
  const flagShape = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.18, 0.12), matFlag)
  flagShape.position.set(0, 0.09, 0.06)
  flagPivot.add(flagShape)
  group.add(flagPole, flagPivot)

  const targetAngle = mailbox.state === 'unread' ? FLAG_UP_RAD : FLAG_DOWN_RAD
  flagPivot.rotation.x = targetAngle

  addWorldHitTarget(group, {
    name: 'mailbox-hit-target',
    position: new THREE.Vector3(0, 1.05, 0),
    scale: new THREE.Vector3(0.6, 0.7, 0.6),
    priority: 70,
  })

  group.userData.mailboxMotion = {
    flagPivot,
    targetAngle,
    currentAngle: targetAngle,
  } satisfies MailboxMotion

  return group
}

export function tickMailbox(root: THREE.Object3D, _time: number, motionScale = 1) {
  root.traverse((object) => {
    const motion = object.userData.mailboxMotion as MailboxMotion | undefined
    if (!motion) return
    const ease = 0.12 * motionScale
    motion.currentAngle += (motion.targetAngle - motion.currentAngle) * ease
    motion.flagPivot.rotation.x = motion.currentAngle
  })
}

function lambert(color: number, side: THREE.Side = THREE.FrontSide): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, side })
}

interface MailboxMotion {
  flagPivot: THREE.Object3D
  targetAngle: number
  currentAngle: number
}
