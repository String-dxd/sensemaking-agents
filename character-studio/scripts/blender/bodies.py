# Archetype body builders (plan 006 step 2).
#
# Each body = union of sphere-topology shells (head, torso, arms, hands,
# legs, feet) sized from skeleton.json joints — NO ears/muzzle/tail (those
# are parts). Weights, palette-mask channels (R/G/B/A = primary/secondary/
# belly/accentA) and the five body morphs are computed analytically.

from __future__ import annotations

import numpy as np

import math

from meshkit import Shell, capsule_along, ellipsoid, mirror_x, smoothstep

# UV islands (head front gets generous space — front-centered island).
UV_HEAD = (0.0, 0.45, 0.55, 1.0)
UV_TORSO = (0.55, 0.45, 1.0, 1.0)
UV_ARM_L = (0.0, 0.22, 0.2, 0.45)
UV_ARM_R = (0.2, 0.22, 0.4, 0.45)
UV_HAND_L = (0.4, 0.22, 0.5, 0.45)
UV_HAND_R = (0.5, 0.22, 0.6, 0.45)
UV_LEG_L = (0.6, 0.22, 0.8, 0.45)
UV_LEG_R = (0.8, 0.22, 1.0, 0.45)
UV_FOOT_L = (0.0, 0.0, 0.25, 0.22)
UV_FOOT_R = (0.25, 0.0, 0.5, 0.22)

CH_PRIMARY, CH_SECONDARY, CH_BELLY, CH_ACCENT = 0, 1, 2, 3


def joints(skel: dict) -> dict[str, np.ndarray]:
    return {b["name"]: np.array(b["head"], dtype=np.float64) for b in skel["bones"]}


# ---------------------------------------------------------------------------
# Implicit smooth-union fillets (the "one sculpted surface" read).
#
# Shell-union bodies crease where a limb plunges into the torso — the visible
# signature of primitive stacking that AC/Pokopia sculpts never show. Instead
# of hiding the junction we reshape the limb ROOT onto the smooth-min union
# surface of (limb SDF, torso SDF): the limb flares tangentially into the
# torso like a sculpted fillet. Only limb verts move (outward, along their
# own radial), so topology/UVs/weights/params all survive; verts deep inside
# the torso stay tucked (masked by torso distance), keeping the overlap
# hidden and z-fighting-free.
# ---------------------------------------------------------------------------


def _smin(a: float, b: float, k: float) -> float:
    """Polynomial smooth min (iq) — blends two SDFs with fillet radius ~k."""
    h = min(max(0.5 + 0.5 * (b - a) / k, 0.0), 1.0)
    return b * (1.0 - h) + a * h - k * h * (1.0 - h)


def make_torso_sdf(cy: float, ry: float, rx: float, rz: float, profile):
    """Approximate SDF of the profiled torso ellipsoid (good near the skin)."""

    def sdf(p: np.ndarray) -> float:
        v01 = min(max((p[1] - (cy - ry)) / (2.0 * ry), 0.0), 1.0)
        m = float(profile(np.array([v01]), None)[0])
        qx = p[0] / (rx * m)
        qy = (p[1] - cy) / ry
        qz = p[2] / (rz * m)
        q = math.sqrt(qx * qx + qy * qy + qz * qz)
        return (q - 1.0) * min(rx * m, ry, rz * m)

    return sdf


def fillet_limb_into_torso(
    shell: Shell,
    axis_a: np.ndarray,
    axis_b: np.ndarray,
    r0: float,
    r1: float,
    torso_sdf,
    k: float,
) -> None:
    """Project limb verts outward onto the smin(limb, torso) union surface.

    Mutates shell.verts. `k` is the fillet radius; larger = softer shoulder.
    """
    axis = axis_b - axis_a
    L = float(np.linalg.norm(axis))
    axis = axis / max(L, 1e-9)

    def limb_sdf(p: np.ndarray) -> float:
        t = min(max(float(np.dot(p - axis_a, axis)) / L, 0.0), 1.0)
        q = axis_a + axis * (t * L)
        return float(np.linalg.norm(p - q)) - (r0 + (r1 - r0) * t)

    def union_sdf(p: np.ndarray) -> float:
        return _smin(torso_sdf(p), limb_sdf(p), k)

    for i in range(len(shell.verts)):
        p = shell.verts[i]
        d_t = torso_sdf(p)
        # deep-inside verts stay tucked (hidden overlap); fillet zone blends in
        lam = float(smoothstep(-0.6 * k, 0.3 * k, np.array([d_t]))[0])
        if lam <= 1e-4:
            continue
        t = min(max(float(np.dot(p - axis_a, axis)) / L, 0.0), 1.0)
        q = axis_a + axis * (t * L)
        radial = p - q
        rl = float(np.linalg.norm(radial))
        if rl < 1e-6:
            continue  # on-axis pole vert
        u_dir = radial / rl
        if union_sdf(p) >= 0.0:
            continue  # already on/outside the union surface
        # bisect the outward crossing of the union surface
        lo, hi = 0.0, 3.0 * k
        if union_sdf(p + u_dir * hi) < 0.0:
            continue  # no crossing within reach — leave untouched
        for _ in range(20):
            mid = (lo + hi) / 2.0
            if union_sdf(p + u_dir * mid) < 0.0:
                lo = mid
            else:
                hi = mid
        shell.verts[i] = p + u_dir * ((lo + hi) / 2.0) * lam


# Per-archetype styling knobs (relative to skeleton scale where sensible).
# Kept in lockstep with src/core/procgen/body.ts STYLE (chibi remodel 2026-07-08
# + AC bird villager remodel 2026-07-09) — the TS procgen lane and these GLBs
# must produce the same silhouette.
STYLE = {
    "biped-round": dict(
        torso_rx=0.80, torso_rz=0.64, pear=0.30, shoulder_taper=0.18,
        torso_bottom_overshoot=0.42, torso_top_overshoot=0.55,
        arm_r=0.046, hand_r=0.052, leg_r=0.064, foot=(0.060, 0.042, 0.096),
        head_squash=0.95, head_wide=1.05, wing=False,
    ),
    "biped-slim": dict(
        torso_rx=0.80, torso_rz=0.70, pear=0.30, shoulder_taper=0.22,
        torso_bottom_overshoot=0.42, torso_top_overshoot=0.55,
        arm_r=0.042, hand_r=0.048, leg_r=0.060, foot=(0.058, 0.042, 0.088),
        head_squash=0.95, head_wide=1.06, wing=False,
    ),
    # Bird (AC villager remodel 2026-07-09): egg torso narrower than the head
    # but clearly present, lifted off thin stick legs (small bottom overshoot),
    # small top overshoot so the head sits ON the body with a chin tuck.
    "bird": dict(
        torso_rx=0.68, torso_rz=0.70, pear=0.30, shoulder_taper=0.14,
        torso_bottom_overshoot=0.30, torso_top_overshoot=0.33,
        arm_r=0.055, hand_r=0.0, leg_r=0.05, foot=(0.060, 0.046, 0.13),
        head_squash=1.02, head_wide=1.0, wing=True,
    ),
}


def build_body_shells(archetype: str, skel: dict, fillet: bool = True) -> tuple[list[Shell], dict]:
    """Build the body shells. `fillet=False` skips the SDF smooth-union fillet:
    the weld pass (plan 003) booleans the RAW shells — filleted limb surfaces
    lie tangent to the torso, and Blender's EXACT boolean then produces
    non-manifold slivers (verified on biped-slim). The weld's own junction
    smoothing restores the smooth shoulder/haunch read instead."""
    j = joints(skel)
    style = STYLE[archetype]
    u = skel["uniformScale"]
    head_center = j["head"] + np.array(skel["head"]["center"])
    head_r = skel["head"]["radius"]

    shells: list[Shell] = []
    # junction metadata for the weld pass (plan 003 step 1): per-limb axis,
    # radii and fillet k so weld.py can rebuild the junction band SDFs in numpy.
    junctions: list[dict] = []

    def _mir(p) -> list[float]:
        return [-float(p[0]), float(p[1]), float(p[2])]

    # --- head ---------------------------------------------------------------
    head = ellipsoid(
        "head",
        tuple(head_center),
        (head_r * style["head_wide"], head_r * style["head_squash"], head_r),
        useg=32,
        vseg=22,
    )
    head.weights["head"] = np.ones(len(head.verts))
    head.uv_rect = UV_HEAD
    head.uv_front_center = True
    _head_channels(head, head_center, head_r, archetype)
    shells.append(head)

    # --- torso ---------------------------------------------------------------
    torso_h = j["neck"][1] - j["hips"][1]
    torso_bottom = j["hips"][1] - torso_h * style["torso_bottom_overshoot"]
    torso_top = j["neck"][1] + torso_h * style["torso_top_overshoot"]  # tucks up into the head shell
    cy = (torso_bottom + torso_top) / 2
    ry = (torso_top - torso_bottom) / 2
    rx = head_r * style["torso_rx"]
    rz = head_r * style["torso_rz"]
    pear = style["pear"]
    taper = style["shoulder_taper"]

    def torso_profile(v01: np.ndarray, verts: np.ndarray) -> np.ndarray:
        # pear: widest low, tapering toward the shoulders
        return 1.0 + pear * (1.0 - v01) ** 2 * np.sin(np.pi * np.clip(v01, 0, 1)) * 2.0 - taper * v01**2

    torso_sdf = make_torso_sdf(cy, ry, rx, rz, torso_profile)
    torso = ellipsoid("torso", (0.0, cy, 0.0), (rx, ry, rz), useg=24, vseg=18, profile=torso_profile)
    _torso_weights(torso, j)
    torso.uv_rect = UV_TORSO
    torso.uv_front_center = True  # UV seam at the BACK (belly mask stays clean)
    _torso_channels(torso, cy, ry, rx, archetype)
    shells.append(torso)

    # --- arms / wings ----------------------------------------------------------
    arm_r = style["arm_r"] * u / 0.9
    hand_r = style["hand_r"] * u / 0.9
    if style["wing"]:
        # Draped wing with READABLE mass (AC benchmark, plan 007 rev 1): the
        # bird torso's flank half-width peaks ~0.196 mid-height, so an inboard
        # drape axis (root x~0.05) gets swallowed by the weld leaving only a
        # tip nub. The drape line runs OUTBOARD of the flank instead: rounded
        # shoulder mass proud of the silhouette at the top (root still overlaps
        # the torso ~0.05 inboard, so the weld joins at the shoulder), the tip
        # tapered and leaning outward/backward so it parts slightly from the
        # body near torso bottom, like Jacques'/Lucha's.
        # T-POSE wing (AC catalogue rest state, 2026-07-09 rev 3): the arm
        # chain runs horizontally (skeleton arms y-scale ~0), so the wing is a
        # flat tapered feather-plank extending straight out past the head's
        # silhouette — plump at the shoulder, pointy horizontal tip.
        wing_a = j["upperArmL"] + np.array([0.02, 0.005, 0]) * u  # shoulder mass, proud of the flank
        wing_b = j["handL"] + np.array([0.05, -0.005, -0.005]) * u  # feather tip straight out
        w_r0, w_r1 = arm_r * 1.05, arm_r * 0.18
        wing = capsule_along(
            "armL", tuple(wing_a), tuple(wing_b),
            w_r0, w_r1, useg=14, vseg=12, bulge=0.014 * u, fullness=0.45,
        )
        # strong flatten about the FLANK plane (shoulder z) — a thin feather
        # BLADE, not a paddle; flattening toward world z=0 would slide the
        # wing onto the torso's widest cross-section and the weld would eat it
        z_flank = j["upperArmL"][2] + 0.02 * u
        wing.verts[:, 2] = z_flank + (wing.verts[:, 2] - z_flank) * 0.42
        # outward push past the belly bulge: the root stays planted inside the
        # torso (the weld joins there), the mid+tip clear the egg's silhouette
        # so the hanging wing reads at each side of the body from the front
        t_wing = wing.params[:, 1]
        wing.verts[:, 0] += np.sign(wing_b[0]) * smoothstep(0.12, 0.55, t_wing) * 0.02 * u
        # sculpted fillet: wing root flows into the torso, no crease
        if fillet:
            fillet_limb_into_torso(
                wing, wing_a, wing_b,
                w_r0 * 0.55, w_r1 * 0.55, torso_sdf, k=0.05 * u,
            )
        t = wing.params[:, 1]
        _chain_weights(wing, ["upperArmL", "foreArmL", "handL"], t, [0.45, 0.8], 0.16)
        wing.channel(CH_ACCENT, smoothstep(0.72, 0.95, t) * 0.9)  # wing tips
        wing.uv_rect = UV_ARM_L
        shells.append(wing)
        shells.append(mirror_x(wing, "armR"))
        for s in shells[-1:]:
            s.uv_rect = UV_ARM_R
        wa = wing_a.tolist()
        wb = wing_b.tolist()
        junctions.append(dict(shell="armL", a=wa, b=wb, r0=w_r0 * 0.55, r1=w_r1 * 0.55, k=0.05 * u))
        junctions.append(dict(shell="armR", a=_mir(wa), b=_mir(wb), r0=w_r0 * 0.55, r1=w_r1 * 0.55, k=0.05 * u))
    else:
        # root the arm INSIDE the torso (shoulder) so it reads attached;
        # carrot taper (wide shoulder -> narrow wrist), plump AC limb
        root_pull = 0.52 if archetype == "biped-round" else 0.44
        arm_root = j["upperArmL"] * np.array([root_pull, 1.0, 1.0]) + np.array([0.0, 0.018, 0.0]) * u
        # near-constant-width plush limb (AC benchmark, plan 007): soft mitten
        # end, not a carrot taper. Was 1.45 -> 0.78; now 1.15 -> 0.95.
        arm = capsule_along("armL", tuple(arm_root), tuple(j["handL"]), arm_r * 1.15, arm_r * 0.95, useg=12, vseg=10, fullness=0.55)
        # outward push (chibi remodel 2026-07-08 skeletons): the stubby A-pose
        # arm chain hugs the fat pear flank — without pushing the mid/wrist
        # clear of the torso surface the weld boolean swallows the whole arm
        # (and the mitten with it), exporting an armless body
        t_arm = arm.params[:, 1]
        arm.verts[:, 0] += np.sign(j["handL"][0]) * smoothstep(0.18, 0.62, t_arm) * 0.07 * u
        # sculpted fillet: the shoulder flares tangentially into the torso
        if fillet:
            fillet_limb_into_torso(arm, arm_root, j["handL"], arm_r * 1.15, arm_r * 0.95, torso_sdf, k=0.055 * u)
        t = arm.params[:, 1]
        _chain_weights(arm, ["upperArmL", "foreArmL"], t, [0.5], 0.18)
        # the buried root ring rides the CHEST: pre-blended source weights so
        # the weld's nearest-vertex transfer never lands the whole arm|torso
        # gradient on a single seam edge (candy-wrapper stretch on arm poses —
        # the emerged stub is short, so its gradient runway is too)
        root_blend = 1.0 - smoothstep(0.02, 0.32, t)
        for bone in ("upperArmL", "foreArmL"):
            arm.weights[bone] = arm.weights[bone] * (1.0 - root_blend)
        arm.weights["chest"] = root_blend
        arm.uv_rect = UV_ARM_L
        shells.append(arm)
        armR = mirror_x(arm, "armR")
        armR.uv_rect = UV_ARM_R
        shells.append(armR)
        aa = arm_root.tolist()
        ab = j["handL"].tolist()
        # k is deliberately wider than the fillet's: on the chibi-stubby arm the
        # emerged surface is short, so the weld's weight-smoothing band must
        # reach further or the whole arm/torso gradient lands on a couple of
        # edge rings (candy-wrapper stretch when the arm poses)
        junctions.append(dict(shell="armL", a=aa, b=ab, r0=arm_r * 1.15, r1=arm_r * 0.95, k=0.1 * u))
        junctions.append(dict(shell="armR", a=_mir(aa), b=_mir(ab), r0=arm_r * 1.15, r1=arm_r * 0.95, k=0.1 * u))

        # mitten hand blended INTO the arm end — deep tuck so the silhouette
        # reads as one soft mitten, not a ball on a stick (plan 007).
        wrist_in = (arm_root - j["handL"])
        wrist_in /= max(float(np.linalg.norm(wrist_in)), 1e-9)
        # the wrist end of the arm capsule was pushed 0.03u outboard above —
        # the mitten rides the same offset so it stays socketed on the arm end
        wrist_out_x = np.array([float(np.sign(j["handL"][0])) * 0.07, 0.0, 0.0]) * u
        hand_center = j["handL"] + wrist_in * hand_r * 0.85 + np.array([0.0, 0.0, 0.004]) * u + wrist_out_x
        hand = ellipsoid("handL", tuple(hand_center), (hand_r, hand_r * 0.92, hand_r * 1.08), useg=12, vseg=9)
        hand.weights["handL"] = np.ones(len(hand.verts))
        hand.channel(CH_ACCENT, np.full(len(hand.verts), 0.85))
        hand.uv_rect = UV_HAND_L
        shells.append(hand)
        handR = mirror_x(hand, "handR")
        handR.uv_rect = UV_HAND_R
        shells.append(handR)

    # --- legs -------------------------------------------------------------------
    leg_r = style["leg_r"] * u / 0.9
    # root the leg high inside the torso underside so the hip junction hides;
    # the tip dips BELOW the ankle into the foot ellipsoid's volume so the weld
    # boolean actually intersects them (the capsule converges to a point at its
    # endpoint — ending exactly at footL leaves the thin bird leg disjoint from
    # its foot and the union exports floating feet).
    leg_end = j["footL"] * np.array([1.0, 0.7, 1.0])
    leg = capsule_along("legL", tuple(j["upperLegL"] + np.array([0, 0.05, 0]) * u), tuple(leg_end), leg_r, leg_r * 0.85, useg=12, vseg=10, fullness=0.55)
    # sculpted fillet: thighs flow out of the torso underside (haunch read)
    if fillet:
        fillet_limb_into_torso(
            leg, j["upperLegL"] + np.array([0, 0.05, 0]) * u, leg_end, leg_r, leg_r * 0.85, torso_sdf, k=0.05 * u
        )
    t = leg.params[:, 1]
    _chain_weights(leg, ["upperLegL", "lowerLegL"], t, [0.5], 0.16)
    leg.uv_rect = UV_LEG_L
    shells.append(leg)
    legR = mirror_x(leg, "legR")
    legR.uv_rect = UV_LEG_R
    shells.append(legR)
    lga = (j["upperLegL"] + np.array([0, 0.05, 0]) * u).tolist()
    lgb = j["footL"].tolist()
    junctions.append(dict(shell="legL", a=lga, b=lgb, r0=leg_r, r1=leg_r * 0.85, k=0.05 * u))
    junctions.append(dict(shell="legR", a=_mir(lga), b=_mir(lgb), r0=leg_r, r1=leg_r * 0.85, k=0.05 * u))

    fx, fy, fz = style["foot"]
    fx, fy, fz = fx * u / 0.9, fy * u / 0.9, fz * u / 0.9
    foot_center = (j["footL"][0], j["footL"][1] * 0.55, j["footL"][2] + fz * 0.42)
    foot = ellipsoid("footL", foot_center, (fx, fy, fz), useg=12, vseg=9)
    tz = smoothstep(foot_center[2], foot_center[2] + fz * 0.7, foot.verts[:, 2])
    foot.weights["footL"] = 1.0 - 0.6 * tz
    foot.weights["toesL"] = 0.6 * tz
    foot.channel(CH_ACCENT, np.full(len(foot.verts), 0.85))
    foot.uv_rect = UV_FOOT_L
    shells.append(foot)
    footR = mirror_x(foot, "footR")
    footR.uv_rect = UV_FOOT_R
    shells.append(footR)

    meta = dict(
        head_center=head_center,
        head_r=head_r,
        torso=dict(cy=cy, ry=ry, rx=rx, rz=rz),
        junctions=junctions,
        torso_sdf_params=dict(cy=cy, ry=ry, rx=rx, rz=rz, pear=pear, taper=taper),
    )
    return shells, meta


def _chain_weights(shell: Shell, bones: list[str], t: np.ndarray, splits: list[float], width: float) -> None:
    fs = [smoothstep(s - width, s + width, t) for s in splits]
    n = len(bones)
    for i, bone in enumerate(bones):
        w = np.ones_like(t)
        if i > 0:
            w = w * fs[i - 1]
        if i < n - 1:
            w = w * (1.0 - fs[i])
        shell.weights[bone] = w


def _torso_weights(torso: Shell, j: dict[str, np.ndarray]) -> None:
    y = torso.verts[:, 1]
    band = (j["chest"][1] - j["hips"][1]) * 0.45
    s1 = smoothstep(j["spine"][1] - band, j["spine"][1] + band, y)
    s2 = smoothstep(j["chest"][1] - band, j["chest"][1] + band, y)
    torso.weights["hips"] = 1.0 - s1
    torso.weights["spine"] = s1 * (1.0 - s2)
    torso.weights["chest"] = s1 * s2


def _torso_channels(torso: Shell, cy: float, ry: float, rx: float, archetype: str) -> None:
    # Ported from procgen/kit/channels.ts torsoChannels (AC flat-region look):
    # a crisp front breast oval at FULL strength with a narrow soft edge — no
    # wide airbrush falloff and no back saddle; the rest of the body reads as
    # one solid primary, exactly like AC/Pokopia color blocking.
    v = torso.verts
    du = v[:, 0] / (rx * 0.85)
    # breast oval: centered high on the chest so it meets the head bib at the
    # neck seam (robin breast, not a low belly blob)
    dv = (v[:, 1] - (cy + ry * 0.12)) / (ry * 0.75)
    # front hemisphere gate, narrow transition so the oval doesn't wrap
    front = smoothstep(0.05, 0.15, v[:, 2] / max(rx, 1e-9))
    # full 1.0 inside the oval, ~0.08-wide soft edge at the rim
    belly = (1.0 - smoothstep(0.82, 0.9, np.sqrt(du * du + dv * dv))) * front
    torso.channel(CH_BELLY, belly)


def _head_channels(head: Shell, center: np.ndarray, r: float, archetype: str) -> None:
    # Ported from procgen/kit/channels.ts headChannels: a crisp full-strength
    # face bib with a narrow edge; no secondary "cap" — a solid head reads
    # cleaner on the chibi silhouette (AC color blocking).
    d = (head.verts - center[None, :]) / r
    side = 1.0 - smoothstep(0.45, 0.65, np.abs(d[:, 0]))
    bib = smoothstep(0.35, 0.5, d[:, 2]) * (1.0 - smoothstep(0.1, 0.22, d[:, 1])) * side
    head.channel(CH_BELLY, bib)


# ---------------------------------------------------------------------------
# Body morphs (offsets per vertex, our Y-up space)
# ---------------------------------------------------------------------------


def body_shape_keys(shells: list[Shell], meta: dict, u: float) -> dict[str, np.ndarray]:
    n = sum(len(s.verts) for s in shells)
    keys = {k: np.zeros((n, 3)) for k in ("bellyRound", "chubby", "slim", "headBig", "headSmall")}
    t = meta["torso"]
    hc = meta["head_center"]
    off = 0
    for shell in shells:
        v = shell.verts
        m = len(v)
        if shell.name == "torso":
            # bellyRound: push the lower front out
            du = v[:, 0] / (t["rx"] * 1.1)
            dv = (v[:, 1] - (t["cy"] - t["ry"] * 0.18)) / (t["ry"] * 0.7)
            w = (1.0 - smoothstep(0.4, 1.0, np.sqrt(du * du + dv * dv))) * smoothstep(-0.1, 0.5, v[:, 2] / t["rx"])
            radial = v - np.array([0.0, 1.0, 0.0])[None, :] * v[:, 1][:, None]
            radial[:, 1] = 0.0
            norm = np.linalg.norm(radial, axis=1, keepdims=True)
            radial = np.divide(radial, norm, out=np.zeros_like(radial), where=norm > 1e-9)
            keys["bellyRound"][off : off + m] = radial * (w * 0.075 * u)[:, None] + np.array([0, 0, 1.0])[None, :] * (w * 0.02 * u)[:, None]
            keys["chubby"][off : off + m] = radial * 0.05 * u
            keys["slim"][off : off + m] = radial * -0.038 * u
        elif shell.name in ("armL", "armR", "legL", "legR", "handL", "handR", "footL", "footR"):
            centroid = v.mean(axis=0)
            radial = v - centroid[None, :]
            keys["chubby"][off : off + m] = radial * 0.10
            keys["slim"][off : off + m] = radial * -0.08
        elif shell.name == "head":
            radial = v - hc[None, :]
            keys["headBig"][off : off + m] = radial * 0.13
            keys["headSmall"][off : off + m] = radial * -0.11
            keys["chubby"][off : off + m] = radial * 0.02
        off += m
    return keys
