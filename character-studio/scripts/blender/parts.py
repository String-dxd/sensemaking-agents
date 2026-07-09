# Anatomy part builders (plan 006 step 3).
#
# Parts are authored in REFERENCE space (uniformScale 1.0) — assembly scales
# them to the archetype (see assemble.ts). Skinned parts (ears, tails) carry
# weights for their canonical chain bones; rigid parts are exported with
# their origin at the attach bone's rest position and an `attachBone` extra.
#
# Each part returns: list of (object_name, shells, attach_bone_or_None,
# shape_keys) — one exported GLB per part id.

from __future__ import annotations

import numpy as np

from meshkit import Shell, bend_chain, capsule_along, ellipsoid, mirror_x, smooth_path, smoothstep

CH_PRIMARY, CH_SECONDARY, CH_BELLY, CH_ACCENT = 0, 1, 2, 3

EAR_BONES_L = ["earL.1", "earL.2"]
TAIL_BONES = ["tail.1", "tail.2", "tail.3", "tail.4"]


def joints(skel: dict) -> dict[str, np.ndarray]:
    return {b["name"]: np.array(b["head"], dtype=np.float64) for b in skel["bones"]}


def _chain_weights(shell: Shell, bones: list[str], t: np.ndarray, splits: list[float], width: float = 0.12) -> None:
    fs = [smoothstep(s - width, s + width, t) for s in splits]
    for i, bone in enumerate(bones):
        w = np.ones_like(t)
        if i > 0:
            w = w * fs[i - 1]
        if i < len(bones) - 1:
            w = w * (1.0 - fs[i])
        shell.weights[bone] = w


def _length_width_keys(shells: list[Shell], root: np.ndarray, tip: np.ndarray) -> dict[str, np.ndarray]:
    n = sum(len(s.verts) for s in shells)
    keys = {"length": np.zeros((n, 3)), "width": np.zeros((n, 3))}
    axis = tip - root
    axis = axis / max(float(np.linalg.norm(axis)), 1e-9)
    off = 0
    for s in shells:
        rel = s.verts - root[None, :]
        along = rel @ axis
        # mirrored shells have their own root mirrored across X
        r2 = rel.copy()
        r2[:, 0] = np.abs(r2[:, 0]) * np.sign(rel[:, 0] + 1e-12)
        keys["length"][off : off + len(s.verts)] = axis[None, :] * (np.clip(along, 0, None) * 0.30)[:, None]
        perp = rel - along[:, None] * axis[None, :]
        keys["width"][off : off + len(s.verts)] = perp * 0.32
        off += len(s.verts)
    return keys


def _mirrored_pair(shell: Shell, root_l: np.ndarray, tip_l: np.ndarray):
    """L shell + mirrored R shell, with length/width keys spanning both."""
    right = mirror_x(shell, shell.name.replace("L", "R", 1))
    shells = [shell, right]
    n_l = len(shell.verts)
    keys_l = _length_width_keys([shell], root_l, tip_l)
    root_r = root_l * np.array([-1.0, 1.0, 1.0])
    tip_r = tip_l * np.array([-1.0, 1.0, 1.0])
    keys_r = _length_width_keys([right], root_r, tip_r)
    keys = {k: np.concatenate([keys_l[k], keys_r[k]]) for k in keys_l}
    return shells, keys


def _inner_ear(shell: Shell, plane_z: float, depth: float) -> None:
    w = smoothstep(plane_z + depth * 0.15, plane_z + depth * 0.7, shell.verts[:, 2])
    shell.channel(CH_BELLY, w * 0.95)


# ---------------------------------------------------------------------------
# Ears (skinned to earL/R.1-.2)
# ---------------------------------------------------------------------------


def ears_upright_pointy(skel: dict):
    j = joints(skel)
    root, mid = j["earL.1"], j["earL.2"]
    d = (mid - root) / np.linalg.norm(mid - root)
    tip = root + d * 0.21
    ear = capsule_along("earL", tuple(root - d * 0.03), tuple(tip), 0.052, 0.008, useg=12, vseg=12)
    ear.verts[:, 2] *= 0.72  # flatten front-back
    ear.verts[:, 2] += root[2] * 0.28
    t = ear.params[:, 1]
    _chain_weights(ear, EAR_BONES_L, t, [0.5], 0.18)
    _inner_ear(ear, 0.0, 0.05)
    shells, keys = _mirrored_pair(ear, root, tip)
    return [("ears-upright-pointy", shells, None, keys)]


def ears_floppy_long(skel: dict):
    j = joints(skel)
    root = j["earL.1"]
    L = 0.34
    ear = capsule_along("earL", tuple(root), tuple(root + np.array([0, L, 0])), 0.062, 0.034, useg=12, vseg=18, bulge=0.014)
    ear.verts[:, 2] = root[2] + (ear.verts[:, 2] - root[2]) * 0.45  # thin leaf
    t = ear.params[:, 1]
    # swing well clear of the (wide) skull before drooping — hound silhouette
    path = [root, root + np.array([0.07, 0.085, 0.008]), root + np.array([0.135, 0.03, 0.018]),
            root + np.array([0.165, -0.085, 0.032]), root + np.array([0.17, -0.20, 0.048])]
    ear.verts = bend_chain(ear.verts, root, L, smooth_path(path, 40))
    _chain_weights(ear, EAR_BONES_L, t, [0.4], 0.2)
    _inner_ear(ear, 0.01, 0.04)
    tip = path[-1]
    shells, keys = _mirrored_pair(ear, root, tip)
    return [("ears-floppy-long", shells, None, keys)]


def ears_round_bear(skel: dict):
    j = joints(skel)
    root, mid = j["earL.1"], j["earL.2"]
    d = (mid - root) / np.linalg.norm(mid - root)
    c = root + d * 0.055
    ear = ellipsoid("earL", tuple(c), (0.062, 0.058, 0.032), useg=14, vseg=10)
    t = smoothstep(c[1] - 0.06, c[1] + 0.06, ear.verts[:, 1])
    ear.weights["earL.1"] = 1.0 - 0.35 * t
    ear.weights["earL.2"] = 0.35 * t
    _inner_ear(ear, c[2], 0.032)
    shells, keys = _mirrored_pair(ear, root, root + d * 0.12)
    return [("ears-round-bear", shells, None, keys)]


def ears_bunny_tall(skel: dict):
    j = joints(skel)
    root = j["earL.1"]
    L = 0.30
    tip_straight = root + np.array([0.02, L, -0.01])
    ear = capsule_along("earL", tuple(root - np.array([0, 0.02, 0])), tuple(tip_straight), 0.038, 0.024, useg=12, vseg=14, bulge=0.014)
    ear.verts[:, 2] = root[2] + (ear.verts[:, 2] - root[2]) * 0.55
    t = ear.params[:, 1]
    path = [root, root + np.array([0.02, 0.12, -0.005]), root + np.array([0.05, 0.22, -0.015]), root + np.array([0.085, 0.29, -0.03])]
    ear.verts = bend_chain(ear.verts, root - np.array([0, 0.02, 0]), L + 0.02, smooth_path(path, 32))
    _chain_weights(ear, EAR_BONES_L, t, [0.45], 0.2)
    _inner_ear(ear, 0.0, 0.035)
    shells, keys = _mirrored_pair(ear, root, path[-1])
    return [("ears-bunny-tall", shells, None, keys)]


# ---------------------------------------------------------------------------
# Muzzles / beaks (rigid at socket.muzzle)
# ---------------------------------------------------------------------------


def _muzzle_length_key(shells: list[Shell], attach: np.ndarray) -> dict[str, np.ndarray]:
    n = sum(len(s.verts) for s in shells)
    key = np.zeros((n, 3))
    off = 0
    for s in shells:
        w = smoothstep(attach[2] - 0.02, attach[2] + 0.08, s.verts[:, 2])
        key[off : off + len(s.verts), 2] = w * 0.055
        off += len(s.verts)
    return {"length": key}


def muzzle_short_cat(skel: dict):
    j = joints(skel)
    a = j["socket.muzzle"]
    m = ellipsoid("muzzle", (a[0], a[1] - 0.008, a[2] + 0.028), (0.075, 0.052, 0.052), useg=16, vseg=12, boxiness=0.15)
    m.channel(CH_BELLY, np.full(len(m.verts), 0.9))
    m.uv_rect = (0.0, 0.0, 0.72, 1.0)
    nose = ellipsoid("nose", (a[0], a[1] + 0.028, a[2] + 0.062), (0.020, 0.015, 0.014), useg=10, vseg=8)
    nose.channel(CH_ACCENT, np.ones(len(nose.verts)))
    nose.uv_rect = (0.74, 0.3, 1.0, 0.7)
    shells = [m, nose]
    return [("muzzle-short-cat", shells, "socket.muzzle", _muzzle_length_key(shells, a))]


def muzzle_boxy_dog(skel: dict):
    j = joints(skel)
    a = j["socket.muzzle"]
    m = ellipsoid("muzzle", (a[0], a[1] - 0.012, a[2] + 0.045), (0.082, 0.058, 0.078), useg=16, vseg=12, boxiness=0.55)
    m.channel(CH_BELLY, np.full(len(m.verts), 0.9))
    m.uv_rect = (0.0, 0.0, 0.72, 1.0)
    nose = ellipsoid("nose", (a[0], a[1] + 0.026, a[2] + 0.112), (0.026, 0.019, 0.017), useg=10, vseg=8, boxiness=0.2)
    nose.channel(CH_ACCENT, np.ones(len(nose.verts)))
    nose.uv_rect = (0.74, 0.3, 1.0, 0.7)
    shells = [m, nose]
    return [("muzzle-boxy-dog", shells, "socket.muzzle", _muzzle_length_key(shells, a))]


def muzzle_beak_small(skel: dict):
    # AC bird beak (remodel 2026-07-09, in lockstep with procgen/parts.ts):
    # a BIG pointy wedge — base spans ~a third of the face width, drooping
    # slightly down to a near-point tip. The base cap TUCKS INTO the head so
    # the wedge grows out of the face with no air gap; the high fullness
    # keeps the cross-section wide where it exits the surface.
    j = joints(skel)
    a = j["socket.muzzle"]
    beak = capsule_along("beak", (a[0], a[1] + 0.02, a[2] - 0.045), (a[0], a[1] - 0.025, a[2] + 0.165), 0.16, 0.014, useg=12, vseg=10, fullness=0.7)
    beak.verts[:, 1] = (a[1] + 0.004) + (beak.verts[:, 1] - (a[1] + 0.004)) * 0.8  # squash vertically
    beak.channel(CH_ACCENT, np.ones(len(beak.verts)))
    shells = [beak]
    return [("muzzle-beak-small", shells, "socket.muzzle", _muzzle_length_key(shells, a))]


def muzzle_beak_round(skel: dict):
    j = joints(skel)
    a = j["socket.muzzle"]
    upper = capsule_along("beakU", (a[0], a[1] + 0.025, a[2] - 0.03), (a[0], a[1] - 0.02, a[2] + 0.07), 0.052, 0.018, useg=12, vseg=10, bulge=0.008)
    lower = ellipsoid("beakL", (a[0], a[1] - 0.018, a[2] + 0.012), (0.038, 0.02, 0.038), useg=10, vseg=8)
    for s in (upper, lower):
        s.channel(CH_ACCENT, np.ones(len(s.verts)))
    shells = [upper, lower]
    return [("muzzle-beak-round", shells, "socket.muzzle", _muzzle_length_key(shells, a))]


def muzzle_beak_hooked(skel: dict):
    j = joints(skel)
    a = j["socket.muzzle"]
    # sized against the beak-small wedge: a real base, not a button nose. Base
    # cap tucks INTO the head so the hook grows out of the face with no gap.
    upper = capsule_along("beakU", (a[0], a[1] + 0.03, a[2] - 0.045), (a[0], a[1] - 0.005, a[2] + 0.13), 0.095, 0.022, useg=12, vseg=10, bulge=0.006, fullness=0.5)
    # hook: curl the tip DOWN and slightly back (smooth curl, no crease)
    t = upper.params[:, 1]
    hook = np.clip(t - 0.65, 0.0, None) ** 2
    upper.verts[:, 1] -= hook * 0.22
    upper.verts[:, 2] -= hook * 0.042
    # lower mandible: small ellipsoid tucked under
    lower = ellipsoid("beakL", (a[0], a[1] - 0.024, a[2] - 0.005), (0.06, 0.026, 0.055), useg=10, vseg=8)
    shells = [upper, lower]
    for s in shells:
        s.channel(CH_ACCENT, np.ones(len(s.verts)))
    return [("muzzle-beak-hooked", shells, "socket.muzzle", _muzzle_length_key(shells, a))]


def muzzle_bill_duck(skel: dict):
    j = joints(skel)
    a = j["socket.muzzle"]
    bill = capsule_along("bill", (a[0], a[1] + 0.012, a[2] - 0.02), (a[0], a[1] - 0.006, a[2] + 0.135), 0.07, 0.042, useg=14, vseg=10)
    bill.verts[:, 0] = a[0] + (bill.verts[:, 0] - a[0]) * 1.5  # wide
    bill.verts[:, 1] = a[1] + (bill.verts[:, 1] - a[1]) * 0.42  # flat
    t = bill.params[:, 1]
    bill.verts[:, 1] += smoothstep(0.7, 1.0, t) * 0.011  # subtle tip upturn
    bill.channel(CH_ACCENT, np.ones(len(bill.verts)))
    shells = [bill]
    return [("muzzle-bill-duck", shells, "socket.muzzle", _muzzle_length_key(shells, a))]


# ---------------------------------------------------------------------------
# Tails (skinned to tail.1-.4)
# ---------------------------------------------------------------------------


def _tail_chain(skel: dict) -> tuple[np.ndarray, np.ndarray]:
    j = joints(skel)
    return j["tail.1"], j["tail.4"]


def tail_curl_shiba(skel: dict):
    root, _ = _tail_chain(skel)
    L = 0.30
    tail = capsule_along("tail", tuple(root), tuple(root + np.array([0, L, 0])), 0.058, 0.030, useg=14, vseg=20, bulge=0.012, fullness=0.5)
    t = tail.params[:, 1]
    path = [root, root + np.array([0, 0.05, -0.09]), root + np.array([0, 0.14, -0.115]),
            root + np.array([0, 0.215, -0.06]), root + np.array([0, 0.23, 0.03])]
    tail.verts = bend_chain(tail.verts, root, L, smooth_path(path, 44))
    _chain_weights(tail, TAIL_BONES, t, [0.3, 0.55, 0.8], 0.1)
    tail.channel(CH_BELLY, smoothstep(0.72, 0.95, t) * 0.9)
    keys = _length_width_keys([tail], root, path[-1])
    return [("tail-curl-shiba", [tail], None, keys)]


def tail_fluff_fox(skel: dict):
    root, _ = _tail_chain(skel)
    L = 0.36

    tail = capsule_along("tail", tuple(root), tuple(root + np.array([0, L, 0])), 0.052, 0.032, useg=16, vseg=18, bulge=0.07, fullness=0.35)
    t = tail.params[:, 1]
    path = [root, root + np.array([0, 0.015, -0.12]), root + np.array([0, 0.06, -0.24]), root + np.array([0, 0.15, -0.335])]
    tail.verts = bend_chain(tail.verts, root, L, smooth_path(path, 36))
    _chain_weights(tail, TAIL_BONES, t, [0.3, 0.55, 0.8], 0.1)
    tail.channel(CH_BELLY, smoothstep(0.68, 0.92, t))
    keys = _length_width_keys([tail], root, path[-1])
    return [("tail-fluff-fox", [tail], None, keys)]


def tail_slim_cat(skel: dict):
    root, _ = _tail_chain(skel)
    L = 0.34
    tail = capsule_along("tail", tuple(root), tuple(root + np.array([0, L, 0])), 0.026, 0.02, useg=12, vseg=18, bulge=0.0, fullness=0.5)
    t = tail.params[:, 1]
    path = [root, root + np.array([0, 0.02, -0.10]), root + np.array([0, 0.10, -0.16]),
            root + np.array([0, 0.22, -0.14]), root + np.array([0, 0.30, -0.07])]
    tail.verts = bend_chain(tail.verts, root, L, smooth_path(path, 40))
    _chain_weights(tail, TAIL_BONES, t, [0.3, 0.55, 0.8], 0.1)
    tail.channel(CH_ACCENT, smoothstep(0.8, 0.95, t) * 0.9)
    keys = _length_width_keys([tail], root, path[-1])
    return [("tail-slim-cat", [tail], None, keys)]


def tail_stub_round(skel: dict):
    root, _ = _tail_chain(skel)
    c = root + np.array([0, 0.015, -0.045])
    stub = ellipsoid("tail", tuple(c), (0.052, 0.048, 0.055), useg=14, vseg=10)
    t = smoothstep(c[2] + 0.05, c[2] - 0.05, stub.verts[:, 2])
    stub.weights["tail.1"] = 1.0 - 0.4 * t
    stub.weights["tail.2"] = 0.4 * t
    keys = _length_width_keys([stub], root, c + np.array([0, 0, -0.06]))
    return [("tail-stub-round", [stub], None, keys)]


def tail_feather_fan(skel: dict):
    root, _ = _tail_chain(skel)
    shells: list[Shell] = []
    for i, ang in enumerate((-38, -19, 0, 19, 38)):
        a = np.radians(ang)
        # back-and-UP fan (AC style): plump rounded feathers, not a droopy
        # scraggle (in lockstep with procgen/parts.ts tailFeatherFan)
        direction = np.array([np.sin(a) * 0.9, 0.5, -np.cos(a) * 0.9])
        direction /= np.linalg.norm(direction)
        tip = root + direction * (0.27 if abs(ang) < 30 else 0.22)
        f = capsule_along(f"feather{i}", tuple(root), tuple(tip), 0.034, 0.056, useg=10, vseg=10, bulge=0.012)
        f.verts[:, 1] = root[1] + (f.verts[:, 1] - root[1]) * 0.35  # flat feathers
        t = f.params[:, 1]
        _chain_weights(f, TAIL_BONES, t, [0.3, 0.55, 0.8], 0.12)
        f.channel(CH_SECONDARY, smoothstep(0.6, 0.9, t) * 0.85)
        shells.append(f)
    keys = _length_width_keys(shells, root, root + np.array([0, 0.097, -0.175]))
    return [("tail-feather-fan", shells, None, keys)]


# ---------------------------------------------------------------------------
# Claws (rigid, one object per attach bone) + crest
# ---------------------------------------------------------------------------


def claws_stub(skel: dict):
    j = joints(skel)
    out = []
    hand_dir = j["handL"] - j["foreArmL"]
    hand_dir /= np.linalg.norm(hand_dir)
    for bone, base, direction, spread in (
        ("handL", j["handL"] + hand_dir * 0.035, hand_dir, np.array([0.0, 0.0, 1.0])),
        ("handR", (j["handL"] + hand_dir * 0.035) * np.array([-1, 1, 1]), hand_dir * np.array([-1, 1, 1]), np.array([0.0, 0.0, 1.0])),
        ("footL", j["toesL"] + np.array([0, 0.012, 0.055]), np.array([0.0, -0.15, 1.0]), np.array([1.0, 0.0, 0.0])),
        ("footR", (j["toesL"] + np.array([0, 0.012, 0.055])) * np.array([-1, 1, 1]), np.array([0.0, -0.15, 1.0]), np.array([1.0, 0.0, 0.0])),
    ):
        d = np.array(direction, dtype=np.float64)
        d /= np.linalg.norm(d)
        shells = []
        for k in (-1, 0, 1):
            c = base + spread * (k * 0.02)
            claw = capsule_along(f"claw{k + 1}", tuple(c), tuple(c + d * 0.028), 0.009, 0.002, useg=8, vseg=6)
            claw.channel(CH_BELLY, np.ones(len(claw.verts)))
            shells.append(claw)
        out.append((f"claws-stub@{bone}", shells, bone, {}))
    return out


def crest_feather_tuft(skel: dict):
    j = joints(skel)
    a = j["socket.hat"]
    shells = []
    for i, (ang, ln) in enumerate(((-24, 0.10), (0, 0.14), (24, 0.10))):
        r = np.radians(ang)
        direction = np.array([np.sin(r) * 0.45, np.cos(r * 0.6), -0.35])
        direction /= np.linalg.norm(direction)
        base = a + np.array([np.sin(r) * 0.02, -0.01, 0.0])
        f = capsule_along(f"tuft{i}", tuple(base), tuple(base + direction * ln), 0.016, 0.024, useg=8, vseg=8, bulge=0.006)
        f.verts[:, 0] = base[0] + (f.verts[:, 0] - base[0]) * 0.5  # thin
        f.channel(CH_ACCENT, np.ones(len(f.verts)))
        shells.append(f)
    return [("crest-feather-tuft", shells, "socket.hat", {})]


PART_BUILDERS = {
    "ears-upright-pointy": ears_upright_pointy,
    "ears-floppy-long": ears_floppy_long,
    "ears-round-bear": ears_round_bear,
    "ears-bunny-tall": ears_bunny_tall,
    "muzzle-short-cat": muzzle_short_cat,
    "muzzle-boxy-dog": muzzle_boxy_dog,
    "muzzle-beak-small": muzzle_beak_small,
    "muzzle-beak-round": muzzle_beak_round,
    "muzzle-beak-hooked": muzzle_beak_hooked,
    "muzzle-bill-duck": muzzle_bill_duck,
    "tail-curl-shiba": tail_curl_shiba,
    "tail-fluff-fox": tail_fluff_fox,
    "tail-slim-cat": tail_slim_cat,
    "tail-stub-round": tail_stub_round,
    "tail-feather-fan": tail_feather_fan,
    "claws-stub": claws_stub,
    "crest-feather-tuft": crest_feather_tuft,
}
