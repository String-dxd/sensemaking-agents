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


BODY_PATTERNS: dict[str, dict] = {
    "pattern-robin": {"archetypes": ["bird"], "apply": _apply_robin},
    "pattern-owl": {"archetypes": ["bird"], "apply": _apply_owl},
    "pattern-duckling": {"archetypes": ["bird"], "apply": _apply_duckling},
}
