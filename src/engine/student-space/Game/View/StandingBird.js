import * as THREE from 'three'

/**
 * StandingBird — chibi companion mesh.
 *
 * Reads spec.palette (back / belly / accent / beak / legs) and returns
 * the parts dictionary Kira's animator wires up (head bob, wing flap,
 * beak talk, leg step, tail wag).
 *
 * Local axis convention: +X is forward (head, beak), -X is rear (tail),
 * ±Z are the bird's sides (wings), +Y is up.
 *
 * Style: solid colour blocks (Town Star / Pocket City). One mesh per
 * part, no sub-feathers, no face detail beyond two black dot eyes.
 */

const ROOT_SCALE = 0.74

export function buildStandingBird(spec)
{
    const palette = resolvePalette(spec)

    const root = new THREE.Group()
    root.scale.setScalar(ROOT_SCALE)

    const body = addBody(root, palette)
    const head = addHead(root, palette)
    const beak = addBeak(palette)
    head.add(beak)

    addCrest(head, palette)
    addEye(head, +1)
    addEye(head, -1)

    const tail = addTail(root, palette)
    const wingL = addWing(root, palette, +1)
    const wingR = addWing(root, palette, -1)
    const legL = addLeg(root, palette, +1)
    const legR = addLeg(root, palette, -1)

    return {
        root,
        body,
        head,
        tail,
        wingL,
        wingR,
        legL,
        legR,
        beak,
        headBaseY:   head.position.y,
        headBaseRotZ: 0,
        wingBaseZL:  wingL.rotation.z,
        wingBaseZR:  wingR.rotation.z,
    }
}

/* ---------- palette ---------- */

function resolvePalette(spec)
{
    const p = spec.palette
    const accent = new THREE.Color(p.accent)
    const belly = new THREE.Color(p.belly)
    return {
        back:   new THREE.Color(p.back),
        belly,
        accent,
        beak:   new THREE.Color(getFriendlyBeak(p.beak, accent, belly)),
        legs:   new THREE.Color(p.legs),
        eye:    new THREE.Color('#141414'),
    }
}

// Dark beaks read as crow/grackle. Lighten to warm cream when luminance
// is too low — companion style uses a soft pale beak.
function getFriendlyBeak(beak, accent, belly)
{
    const c = new THREE.Color(beak)
    const luminance = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
    if(luminance < 0.30)
        return accent.clone().lerp(belly, 0.55)
    return c
}

/* ---------- body ---------- */

function addBody(root, palette)
{
    const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.46, 32, 24),
        softMat(palette.belly),
    )
    body.position.y = 0.62
    body.scale.set(1.0, 1.12, 0.92)
    root.add(body)
    return body
}

/* ---------- head ---------- */

function addHead(root, palette)
{
    const head = new THREE.Group()
    head.position.set(0.04, 1.28, 0)

    const skull = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 32, 24),
        softMat(palette.back),
    )
    skull.scale.set(1.04, 1.0, 0.98)
    head.add(skull)

    root.add(head)
    return head
}

function addEye(head, side)
{
    // Simple dot. No whites, no highlight, no brow.
    const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.052, 16, 12),
        flatMat('#141414'),
    )
    eye.position.set(0.38, 0.06, side * 0.18)
    eye.scale.set(0.85, 1.0, 0.85)
    head.add(eye)
}

function addCrest(head, palette)
{
    // One soft tuft on top — same tone as the head so it reads as a
    // contour bump, not a separate prop.
    const tuft = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 18, 14),
        softMat(palette.back),
    )
    tuft.position.set(0.02, 0.42, 0)
    tuft.scale.set(0.65, 0.85, 0.65)
    head.add(tuft)
}

/* ---------- beak ---------- */

function addBeak(palette)
{
    const beak = new THREE.Group()

    const upper = new THREE.Mesh(
        new THREE.ConeGeometry(0.085, 0.20, 14),
        softMat(palette.beak),
    )
    upper.position.set(0.52, 0.00, 0)
    upper.rotation.z = -Math.PI * 0.5 + 0.10
    upper.scale.set(1.0, 0.7, 0.7)
    beak.add(upper)

    // Keep the lower-pivot group so the animator's
    // beak.userData.lowerPivot rotation still has a target — but no
    // visible lower mandible to clutter the silhouette.
    const lowerPivot = new THREE.Group()
    lowerPivot.position.set(0.50, -0.02, 0)
    beak.add(lowerPivot)
    beak.userData.lowerPivot = lowerPivot
    beak.userData.restOpen = 0

    return beak
}

/* ---------- wings ---------- */

function addWing(root, palette, side)
{
    // One solid blob per side — a flattened teardrop. No feather fan.
    const wing = new THREE.Group()
    wing.position.set(0.04, 0.78, side * 0.36)

    const blade = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 20, 16),
        softMat(palette.accent),
    )
    blade.position.set(-0.02, -0.06, side * 0.10)
    blade.scale.set(0.42, 1.05, 0.78)
    wing.add(blade)

    wing.rotation.z = -0.12
    root.add(wing)
    return wing
}

/* ---------- tail ---------- */

function addTail(root, palette)
{
    const tail = new THREE.Group()
    tail.position.set(-0.34, 0.62, 0)

    const blob = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 20, 14),
        softMat(palette.accent),
    )
    blob.position.set(-0.06, 0.02, 0)
    blob.scale.set(0.75, 0.55, 0.55)
    blob.rotation.z = 0.35
    tail.add(blob)

    root.add(tail)
    return tail
}

/* ---------- legs ---------- */

function addLeg(root, palette, side)
{
    const leg = new THREE.Group()
    leg.position.set(0.06, 0.0, side * 0.14)

    const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.034, 0.034, 0.22, 12),
        flatMat(palette.legs),
    )
    shin.position.y = -0.08
    leg.add(shin)

    const foot = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 16, 12),
        flatMat(palette.legs),
    )
    foot.position.set(0.04, -0.20, 0)
    foot.scale.set(1.55, 0.55, 1.0)
    leg.add(foot)

    root.add(leg)
    return leg
}

/* ---------- materials ---------- */

function softMat(color)
{
    const c = color instanceof THREE.Color ? color : new THREE.Color(color)
    return new THREE.MeshLambertMaterial({ color: c })
}

function flatMat(color)
{
    const c = color instanceof THREE.Color ? color : new THREE.Color(color)
    return new THREE.MeshLambertMaterial({ color: c })
}
