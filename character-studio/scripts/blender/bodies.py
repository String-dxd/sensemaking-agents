# Archetype body builders (plan 006 step 2).
#
# Each body = union of sphere-topology shells (head, torso, arms, hands,
# legs, feet) sized from skeleton.json joints — NO ears/muzzle/tail (those
# are parts). Weights, palette-mask channels (R/G/B/A = primary/secondary/
# belly/accentA) and the five body morphs are computed analytically.

from __future__ import annotations

import numpy as np

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


# Per-archetype styling knobs (relative to skeleton scale where sensible).
STYLE = {
    "biped-round": dict(
        torso_rx=0.80, torso_rz=0.62, pear=0.28, shoulder_taper=0.20,
        arm_r=0.036, hand_r=0.048, leg_r=0.052, foot=(0.055, 0.038, 0.090),
        head_squash=0.97, head_wide=1.05, wing=False,
    ),
    "biped-slim": dict(
        torso_rx=0.66, torso_rz=0.58, pear=0.22, shoulder_taper=0.24,
        arm_r=0.028, hand_r=0.038, leg_r=0.040, foot=(0.048, 0.034, 0.082),
        head_squash=0.99, head_wide=1.02, wing=False,
    ),
    "bird": dict(
        torso_rx=0.88, torso_rz=0.80, pear=0.36, shoulder_taper=0.14,
        arm_r=0.030, hand_r=0.0, leg_r=0.026, foot=(0.050, 0.026, 0.095),
        head_squash=0.96, head_wide=1.04, wing=True,
    ),
}


def build_body_shells(archetype: str, skel: dict) -> tuple[list[Shell], dict]:
    j = joints(skel)
    style = STYLE[archetype]
    u = skel["uniformScale"]
    head_center = j["head"] + np.array(skel["head"]["center"])
    head_r = skel["head"]["radius"]

    shells: list[Shell] = []

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
    torso_bottom = j["hips"][1] - torso_h * 0.42
    torso_top = j["neck"][1] + torso_h * 0.55  # tucks up into the head shell
    cy = (torso_bottom + torso_top) / 2
    ry = (torso_top - torso_bottom) / 2
    rx = head_r * style["torso_rx"]
    rz = head_r * style["torso_rz"]
    pear = style["pear"]
    taper = style["shoulder_taper"]

    def torso_profile(v01: np.ndarray, verts: np.ndarray) -> np.ndarray:
        # pear: widest low, tapering toward the shoulders
        return 1.0 + pear * (1.0 - v01) ** 2 * np.sin(np.pi * np.clip(v01, 0, 1)) * 2.0 - taper * v01**2

    torso = ellipsoid("torso", (0.0, cy, 0.0), (rx, ry, rz), useg=24, vseg=18, profile=torso_profile)
    _torso_weights(torso, j)
    torso.uv_rect = UV_TORSO
    _torso_channels(torso, cy, ry, rx, archetype)
    shells.append(torso)

    # --- arms / wings ----------------------------------------------------------
    arm_r = style["arm_r"] * u / 0.9
    hand_r = style["hand_r"] * u / 0.9
    if style["wing"]:
        wing = capsule_along(
            "armL", tuple(j["upperArmL"] - np.array([0.02, -0.005, 0]) * u), tuple(j["handL"] + np.array([0.02, -0.02, 0]) * u),
            arm_r * 1.1, arm_r * 1.7, useg=14, vseg=12, bulge=0.014 * u,
        )
        wing.verts[:, 2] *= 0.42  # flatten front-back into a paddle
        wing.verts[:, 2] += j["upperArmL"][2]
        t = wing.params[:, 1]
        _chain_weights(wing, ["upperArmL", "foreArmL", "handL"], t, [0.45, 0.8], 0.16)
        wing.channel(CH_ACCENT, smoothstep(0.72, 0.95, t) * 0.9)  # wing tips
        wing.uv_rect = UV_ARM_L
        shells.append(wing)
        shells.append(mirror_x(wing, "armR"))
        for s in shells[-1:]:
            s.uv_rect = UV_ARM_R
    else:
        # root the arm INSIDE the torso (shoulder) so it reads attached
        root_pull = 0.62 if archetype == "biped-round" else 0.5
        arm_root = j["upperArmL"] * np.array([root_pull, 1.0, 1.0]) + np.array([0.0, 0.01, 0.0]) * u
        arm = capsule_along("armL", tuple(arm_root), tuple(j["handL"]), arm_r * 1.25, arm_r * 0.95, useg=12, vseg=10)
        t = arm.params[:, 1]
        _chain_weights(arm, ["upperArmL", "foreArmL"], t, [0.5], 0.18)
        arm.uv_rect = UV_ARM_L
        shells.append(arm)
        armR = mirror_x(arm, "armR")
        armR.uv_rect = UV_ARM_R
        shells.append(armR)

        hand = ellipsoid("handL", tuple(j["handL"] + np.array([0.014, -0.01, 0.008]) * u), (hand_r, hand_r * 0.9, hand_r * 1.05), useg=12, vseg=9)
        hand.weights["handL"] = np.ones(len(hand.verts))
        hand.channel(CH_ACCENT, _sock(hand, j["handL"][1], hand_r) )
        hand.uv_rect = UV_HAND_L
        shells.append(hand)
        handR = mirror_x(hand, "handR")
        handR.uv_rect = UV_HAND_R
        shells.append(handR)

    # --- legs -------------------------------------------------------------------
    leg_r = style["leg_r"] * u / 0.9
    leg = capsule_along("legL", tuple(j["upperLegL"] + np.array([0, 0.02, 0]) * u), tuple(j["footL"]), leg_r, leg_r * 0.8, useg=12, vseg=10)
    t = leg.params[:, 1]
    _chain_weights(leg, ["upperLegL", "lowerLegL"], t, [0.5], 0.16)
    leg.uv_rect = UV_LEG_L
    shells.append(leg)
    legR = mirror_x(leg, "legR")
    legR.uv_rect = UV_LEG_R
    shells.append(legR)

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

    meta = dict(head_center=head_center, head_r=head_r, torso=dict(cy=cy, ry=ry, rx=rx, rz=rz))
    return shells, meta


def _sock(shell: Shell, joint_y: float, r: float) -> np.ndarray:
    return np.full(len(shell.verts), 0.85)


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
    v = torso.verts
    # belly: soft front ellipse, centred slightly below the torso middle
    du = v[:, 0] / (rx * 0.85)
    dv = (v[:, 1] - (cy - ry * 0.12)) / (ry * 0.62)
    front = smoothstep(0.0, 0.35, v[:, 2] / max(rx, 1e-9))
    belly = (1.0 - smoothstep(0.55, 1.0, np.sqrt(du * du + dv * dv))) * front
    torso.channel(CH_BELLY, belly)
    # secondary: back saddle
    back = smoothstep(0.15, 0.75, -v[:, 2] / max(rx, 1e-9)) * smoothstep(cy - ry * 0.5, cy + ry * 0.45, v[:, 1])
    torso.channel(CH_SECONDARY, back * 0.9)


def _head_channels(head: Shell, center: np.ndarray, r: float, archetype: str) -> None:
    d = (head.verts - center[None, :]) / r
    # face patch (belly tone): forward and slightly down — the muzzle zone
    face = smoothstep(0.25, 0.75, d[:, 2]) * smoothstep(0.55, -0.1, d[:, 1])
    head.channel(CH_BELLY, face * 0.9)
    # cap (secondary): top-back
    cap = smoothstep(0.3, 0.8, d[:, 1]) * smoothstep(0.25, -0.35, d[:, 2])
    if archetype == "bird":
        cap = smoothstep(0.05, 0.6, d[:, 1])  # bolder bird cap
    head.channel(CH_SECONDARY, cap * 0.9)


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
