# Body pattern-mask variants (plan 010). A pattern REASSIGNS palette-mask
# channel weights on the pre-weld body shells, then gen_assets rasterizes a
# variant PNG: body-<archetype>.<pattern_id>.mask.png. Channels never add
# colors — hues stay in the character's palette (species presets pair each
# pattern with its palette). Keep high-contrast boundaries away from the
# BACK centerline (UV wrap seam — mask blur bleeds across islands).

from __future__ import annotations

import numpy as np

from bodies import CH_ACCENT, CH_BELLY, CH_SECONDARY
from meshkit import Shell, smoothstep


def _by_name(shells: list[Shell]) -> dict[str, Shell]:
    return {s.name: s for s in shells}


# --- pattern-robin: red breast + warm cap ----------------------------------
def _apply_robin(shells: list[Shell], skel: dict, meta: dict) -> None:
    by = _by_name(shells)
    t = meta["torso"]
    cy, ry, rx = t["cy"], t["ry"], t["rx"]

    torso = by["torso"]
    v = torso.verts
    # LARGER, HIGHER breast ellipse (breast, not tummy)
    du = v[:, 0] / (rx * 1.05)
    dv = (v[:, 1] - (cy + ry * 0.15)) / (ry * 0.62)
    front = smoothstep(0.0, 0.35, v[:, 2] / max(rx, 1e-9))
    breast = (1.0 - smoothstep(0.75, 1.15, np.sqrt(du * du + dv * dv))) * front
    torso.channel(CH_BELLY, breast)

    # head: extend the face patch DOWN to meet the breast (chin / throat)
    head = by["head"]
    center = meta["head_center"]
    r = meta["head_r"]
    d = (head.verts - center[None, :]) / r
    face = smoothstep(0.1, 0.6, d[:, 2]) * smoothstep(0.65, -0.35, d[:, 1])
    head.channel(CH_BELLY, face * 0.9)

    # wings: darken with secondary (folded wing reads as the dark back side)
    for name in ("armL", "armR"):
        wing = by[name]
        wt = wing.params[:, 1]
        wing.channel(CH_SECONDARY, smoothstep(0.22, 0.28, wt) * 0.85)


# --- pattern-owl: facial disc + speckled chest ------------------------------
def _apply_owl(shells: list[Shell], skel: dict, meta: dict) -> None:
    by = _by_name(shells)

    # head: pale facial disc (belly channel) + ring accent outlining it
    head = by["head"]
    center = meta["head_center"]
    r = meta["head_r"]
    d = (head.verts - center[None, :]) / r
    disc = smoothstep(0.15, 0.55, d[:, 2])
    head.channel(CH_BELLY, disc)
    ring = smoothstep(0.35, 0.6, d[:, 2]) * (1.0 - smoothstep(0.75, 0.95, d[:, 2])) * 0.7
    head.channel(CH_ACCENT, ring)

    # torso front: soft horizontal barring (NOT hard dots — hard dots alias)
    torso = by["torso"]
    v = torso.verts
    belly = torso.channels[:, CH_BELLY]
    speckle = np.clip(0.75 + 0.25 * np.sin(v[:, 1] * 55.0) * np.sin(v[:, 0] * 60.0), 0.0, 1.0)
    torso.channel(CH_BELLY, belly * speckle)

    # wings: darken with secondary
    for name in ("armL", "armR"):
        wing = by[name]
        wt = wing.params[:, 1]
        wing.channel(CH_SECONDARY, smoothstep(0.17, 0.23, wt) * 0.9)


# --- pattern-duckling: crown cap + wing band --------------------------------
def _apply_duckling(shells: list[Shell], skel: dict, meta: dict) -> None:
    by = _by_name(shells)

    # head: crown cap (secondary) replacing the default bird cap
    head = by["head"]
    center = meta["head_center"]
    r = meta["head_r"]
    d = (head.verts - center[None, :]) / r
    crown = smoothstep(0.25, 0.7, d[:, 1]) * 0.95
    head.channel(CH_SECONDARY, crown)

    # torso: keep the default belly but raise its weight
    torso = by["torso"]
    belly = torso.channels[:, CH_BELLY]
    torso.channel(CH_BELLY, np.clip(belly * 1.2, 0.0, 1.0))

    # wings: speculum band (accent) — a clean band before the existing tip
    # accent, which this pattern overwrites.
    for name in ("armL", "armR"):
        wing = by[name]
        wt = wing.params[:, 1]
        band = smoothstep(0.5, 0.6, wt) * (1.0 - smoothstep(0.78, 0.88, wt))
        wing.channel(CH_ACCENT, band)


# --- pattern-shiba: cream points (urajiro) ----------------------------------
def _apply_shiba(shells: list[Shell], skel: dict, meta: dict) -> None:
    by = _by_name(shells)

    # head: face patch widened over muzzle + cheeks + brow, plus two brow dots
    head = by["head"]
    center = meta["head_center"]
    r = meta["head_r"]
    d = (head.verts - center[None, :]) / r
    face = smoothstep(0.15, 0.6, d[:, 2]) * smoothstep(0.6, -0.3, d[:, 1])
    dots = np.zeros(len(d))
    for cx in (-0.28, 0.28):
        c = np.array([cx, 0.45, 0.72])
        dots = np.maximum(dots, np.exp(-((d - c[None, :]) ** 2).sum(1) / (2 * 0.16**2)))
    head.channel(CH_BELLY, np.clip(face + 0.9 * dots, 0.0, 1.0))

    # torso: belly ellipse extended UP the chest (higher center, ×1.15 radius)
    t = meta["torso"]
    cy, ry, rx = t["cy"], t["ry"], t["rx"]
    v = by["torso"].verts
    du = v[:, 0] / (rx * 0.85)
    dv = (v[:, 1] - (cy + ry * 0.05)) / (ry * 0.62)
    front = smoothstep(0.0, 0.35, v[:, 2] / max(rx, 1e-9))
    belly = (1.0 - smoothstep(0.55, 1.0, np.sqrt(du * du + dv * dv) / 1.15)) * front
    by["torso"].channel(CH_BELLY, belly)

    # arms/legs: cream on the FRONT faces (front-inner AC-shiba read)
    for name in ("armL", "armR", "legL", "legR"):
        sh = by[name]
        zc = sh.verts[:, 2] - sh.verts[:, 2].mean()
        half = max(float(np.abs(zc).max()), 1e-9)
        sh.channel(CH_BELLY, 0.85 * smoothstep(0.1, 0.5, zc / half))


# --- pattern-tabby: back stripes + belly ------------------------------------
def _apply_tabby(shells: list[Shell], skel: dict, meta: dict) -> None:
    by = _by_name(shells)

    # torso: soft horizontal bars on the back only (secondary). The wrap seam
    # is AT the back centerline; the sine bars run horizontally so they are
    # continuous across it (see plan 011 gate note).
    t = meta["torso"]
    rx = t["rx"]
    v = by["torso"].verts
    back_gate = smoothstep(0.1, 0.6, -v[:, 2] / max(rx, 1e-9))
    stripes = np.clip(back_gate * (0.55 + 0.45 * np.sin(v[:, 1] * 70.0)), 0.0, 1.0)
    by["torso"].channel(CH_SECONDARY, stripes)

    # head: cap extended down the forehead, broken by an M-notch
    head = by["head"]
    center = meta["head_center"]
    r = meta["head_r"]
    d = (head.verts - center[None, :]) / r
    cap = smoothstep(0.2, 0.7, d[:, 1]) * smoothstep(0.35, -0.4, d[:, 2])
    cap = cap * (0.75 + 0.25 * np.sin(d[:, 0] * 9.0))
    head.channel(CH_SECONDARY, np.clip(cap * 0.9, 0.0, 1.0))


# --- pattern-fox: mask + dark socks -----------------------------------------
def _apply_fox(shells: list[Shell], skel: dict, meta: dict) -> None:
    by = _by_name(shells)

    # head: white cheek flares (belly), widened at the cheeks
    head = by["head"]
    center = meta["head_center"]
    r = meta["head_r"]
    d = (head.verts - center[None, :]) / r
    cheek = smoothstep(0.05, 0.5, d[:, 2]) * smoothstep(0.5, -0.4, d[:, 1])
    cheek = cheek * (1.0 + 0.4 * smoothstep(0.1, 0.5, np.abs(d[:, 0])))
    head.channel(CH_BELLY, np.clip(cheek, 0.0, 1.0))

    # arms/legs: dark socks (accent) over the OUTER half; hands/feet fully dark
    for name in ("armL", "armR", "legL", "legR"):
        sh = by[name]
        sh.channel(CH_ACCENT, smoothstep(0.45, 0.7, sh.params[:, 1]))
    for name in ("handL", "handR", "footL", "footR"):
        sh = by[name]
        sh.channel(CH_ACCENT, np.ones(len(sh.verts)))


# --- pattern-bear: muzzle patch + chest crescent ----------------------------
def _apply_bear(shells: list[Shell], skel: dict, meta: dict) -> None:
    by = _by_name(shells)

    # head: REPLACE the default face patch with a tight muzzle oval
    head = by["head"]
    center = meta["head_center"]
    r = meta["head_r"]
    d = (head.verts - center[None, :]) / r
    muzzle = smoothstep(0.45, 0.8, d[:, 2]) * smoothstep(0.25, -0.35, d[:, 1])
    head.channel(CH_BELLY, muzzle)

    # torso: small chest crescent (belly ellipse ×0.55, raised center)
    t = meta["torso"]
    cy, ry, rx = t["cy"], t["ry"], t["rx"]
    v = by["torso"].verts
    du = v[:, 0] / (rx * 0.85)
    dv = (v[:, 1] - (cy + ry * 0.2)) / (ry * 0.62)
    front = smoothstep(0.0, 0.35, v[:, 2] / max(rx, 1e-9))
    belly = (1.0 - smoothstep(0.55, 1.0, np.sqrt(du * du + dv * dv) / 0.55)) * front
    by["torso"].channel(CH_BELLY, belly)


# --- pattern-rabbit: soft underside -----------------------------------------
def _apply_rabbit(shells: list[Shell], skel: dict, meta: dict) -> None:
    by = _by_name(shells)

    # torso: wide belly (×1.2), full weight
    t = meta["torso"]
    cy, ry, rx = t["cy"], t["ry"], t["rx"]
    v = by["torso"].verts
    du = v[:, 0] / (rx * 0.85)
    dv = (v[:, 1] - (cy - ry * 0.12)) / (ry * 0.62)
    front = smoothstep(0.0, 0.35, v[:, 2] / max(rx, 1e-9))
    belly = (1.0 - smoothstep(0.55, 1.0, np.sqrt(du * du + dv * dv) / 1.2)) * front
    by["torso"].channel(CH_BELLY, belly)

    # head: full muzzle-to-chest blaze (no vertical gate below the eye line)
    head = by["head"]
    center = meta["head_center"]
    r = meta["head_r"]
    d = (head.verts - center[None, :]) / r
    head.channel(CH_BELLY, smoothstep(0.2, 0.55, d[:, 2]))

    # feet: pale paws
    for name in ("footL", "footR"):
        sh = by[name]
        sh.channel(CH_BELLY, np.full(len(sh.verts), 0.6))


BODY_PATTERNS: dict[str, dict] = {
    "pattern-robin": {"archetypes": ["bird"], "apply": _apply_robin},
    "pattern-owl": {"archetypes": ["bird"], "apply": _apply_owl},
    "pattern-duckling": {"archetypes": ["bird"], "apply": _apply_duckling},
    "pattern-shiba": {"archetypes": ["biped-round"], "apply": _apply_shiba},
    "pattern-tabby": {"archetypes": ["biped-slim"], "apply": _apply_tabby},
    "pattern-fox": {"archetypes": ["biped-slim"], "apply": _apply_fox},
    "pattern-bear": {"archetypes": ["biped-round"], "apply": _apply_bear},
    "pattern-rabbit": {"archetypes": ["biped-slim"], "apply": _apply_rabbit},
}
