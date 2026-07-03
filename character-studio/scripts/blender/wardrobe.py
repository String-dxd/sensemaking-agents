# Wardrobe item builders (plan 008 step 2) — headless Blender entry point.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python \
#       scripts/blender/wardrobe.py -- [--only id1,id2] [--no-render]
#
# Items are FITTED to the biped-round archetype body (built in archetype
# space over the plan-006 shells, inflated 3-7 mm), then un-mapped into
# authoring/reference space through their skin weights so linear blend
# skinning reproduces the fitted shape EXACTLY after the dressing pass
# scales inverse binds by uniformScale (see ASSET-CONTRACT "Wardrobe items"):
#
#   v_authored = SUM(w_i * p_i_ref) + (v_target - SUM(w_i * p_i_arch)) / u
#
# Item-internal spring bones (scarf ends, drawstrings, strap tails) are extra
# armature bones parented under canonical bones; their names must match
# src/core/wardrobe/itemRegistry.ts springChains exactly.
#
# Writes:
#   src/assets/wardrobe/<item>.glb
#   src/assets/wardrobe/textures/item-<item>.mask.png
#   <preview-dir>/item-<item>-{front,three-quarter,side,back}.png (dressed!)

from __future__ import annotations

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
import numpy as np

import blender_io
import bodies
import parts as parts_mod
from meshkit import Shell, bend_chain, capsule_along, ellipsoid, mirror_x, rasterize_mask, smoothstep, write_png

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STUDIO_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", ".."))
ASSET_DIR = os.path.join(STUDIO_DIR, "src", "assets", "wardrobe")
TEX_DIR = os.path.join(ASSET_DIR, "textures")
PREVIEW_DIR = os.environ.get(
    "PLAN008_PREVIEW_DIR",
    os.path.join(STUDIO_DIR, "scripts", "blender", "build", "previews"),
)

TRI_BUDGET_ITEM = 3000
MAX_BYTES = 2 * 1024 * 1024

CH_PRIMARY, CH_SECONDARY, CH_BELLY, CH_ACCENT = 0, 1, 2, 3


def joints(skel: dict) -> dict[str, np.ndarray]:
    return {b["name"]: np.array(b["head"], dtype=np.float64) for b in skel["bones"]}


# ---------------------------------------------------------------------------
# Geometry helpers (garment-specific; general shells live in meshkit)
# ---------------------------------------------------------------------------


def _signed_volume(shell: Shell) -> float:
    total = 0.0
    v = shell.verts
    for f in shell.faces:
        tris = [(f[0], f[1], f[2])] if len(f) == 3 else [(f[0], f[1], f[2]), (f[0], f[2], f[3])]
        for a, b, c in tris:
            total += float(np.dot(v[a], np.cross(v[b], v[c]))) / 6.0
    return total


def ensure_outward(shell: Shell) -> Shell:
    """Flip face winding if a closed shell is inside-out (negative volume)."""
    if _signed_volume(shell) < 0:
        shell.faces = [tuple(reversed(f)) for f in shell.faces]
    return shell


def ring_tube(
    name: str,
    centers: np.ndarray,  # (n, 3) closed ring path
    radials: np.ndarray,  # (n, 3) unit in-plane outward dirs
    normal: np.ndarray,  # (3,) unit plane normal
    a: float,  # cross-section half-size along radial
    b: float,  # cross-section half-size along normal
    vseg: int = 8,
) -> Shell:
    """Closed tube along a ring path with an elliptical cross-section
    (brims, bands, collars, handles)."""
    n = len(centers)
    verts: list[np.ndarray] = []
    params: list[tuple[float, float]] = []
    for i in range(n):
        for k in range(vseg):
            th = 2 * math.pi * k / vseg
            p = centers[i] + radials[i] * (a * math.cos(th)) + normal * (b * math.sin(th))
            verts.append(p)
            params.append((i / n, k / vseg))
    faces: list[tuple[int, ...]] = []
    for i in range(n):
        for k in range(vseg):
            v00 = i * vseg + k
            v01 = i * vseg + (k + 1) % vseg
            v10 = ((i + 1) % n) * vseg + k
            v11 = ((i + 1) % n) * vseg + (k + 1) % vseg
            faces.append((v00, v10, v11, v01))
    shell = Shell(name=name, verts=np.array(verts), faces=faces, params=np.array(params))
    return ensure_outward(shell)


def arched_dome(
    name: str,
    center: np.ndarray,
    radii: tuple[float, float, float],
    rim_y,  # callable(az_rad) -> world-space y of the rim at that azimuth
    useg: int = 28,
    vseg: int = 9,
    lip: float = 0.010,
) -> Shell:
    """Upper part of an ellipsoid, cut at an azimuth-varying rim height, with
    a small inward under-rolled lip so the open edge reads as thickness.
    Row 0 = lip ring (inner), row 1 = rim ring, last row(s) = near top + pole.
    Azimuth 0 = +Z (front), matching meshkit's sphere convention."""
    cx, cy, cz = center
    rx, ry, rz = radii
    rows: list[list[np.ndarray]] = []
    lip_row: list[np.ndarray] = []
    rim_row_params: list[float] = []

    n_rows = vseg  # dome rows from rim to just-below-pole
    all_params: list[tuple[float, float]] = []
    for c in range(useg):
        az = 2 * math.pi * c / useg
        y = rim_y(az)
        cos_phi = np.clip((y - cy) / ry, -0.95, 0.95)
        phi_rim = math.acos(cos_phi)
        rim_row_params.append(phi_rim)

    verts: list[np.ndarray] = []
    params: list[tuple[float, float]] = []

    def surf(phi: float, az: float, shrink: float = 1.0, y_off: float = 0.0) -> np.ndarray:
        return np.array(
            [
                cx + rx * math.sin(phi) * math.sin(az) * shrink,
                cy + ry * math.cos(phi) + y_off,
                cz + rz * math.sin(phi) * math.cos(az) * shrink,
            ]
        )

    n_all_rows = n_rows + 1  # lip + dome rows (pole handled separately)
    # row 0: lip (rim ring rolled inward and slightly up-under)
    for c in range(useg):
        az = 2 * math.pi * c / useg
        phi = rim_row_params[c]
        r_ring = math.sin(phi) * min(rx, rz)
        shrink = max(0.0, 1.0 - lip / max(r_ring, 1e-6))
        verts.append(surf(phi, az, shrink=shrink, y_off=lip * 0.35))
        params.append((c / useg, 0.0))
    # rows 1..n_rows: rim up to near the pole
    for r in range(n_rows):
        t = r / (n_rows - 1)  # 0 at rim, 1 near pole
        for c in range(useg):
            az = 2 * math.pi * c / useg
            phi = rim_row_params[c] * (1.0 - t) + 0.14 * t  # keep off the exact pole
            verts.append(surf(phi, az))
            params.append((c / useg, (1 + r) / (n_all_rows)))
    top = len(verts)
    verts.append(np.array([cx, cy + ry, cz]))
    params.append((0.0, 1.0))

    faces: list[tuple[int, ...]] = []

    def rv(row: int, c: int) -> int:
        return row * useg + (c % useg)

    for row in range(n_all_rows - 1):
        for c in range(useg):
            a_, b_ = rv(row, c), rv(row, c + 1)
            d_, e_ = rv(row + 1, c), rv(row + 1, c + 1)
            faces.append((a_, b_, e_, d_))
    for c in range(useg):
        faces.append((top, rv(n_all_rows - 1, c), rv(n_all_rows - 1, c + 1)))

    return Shell(name=name, verts=np.array(verts), faces=faces, params=np.array(params))


def ear_arch_rim(base_y: float, arch_y: float, half_width_deg: float = 32.0):
    """Rim-height function with smooth arches over the ears (azimuth ±90°)."""
    hw = math.radians(half_width_deg)

    def rim(az: float) -> float:
        d = min(abs(az - math.pi / 2), abs(az - 3 * math.pi / 2))
        if d >= hw:
            return base_y
        t = math.cos(d / hw * math.pi / 2) ** 2
        return base_y + (arch_y - base_y) * t

    return rim


def path_points(pts: list[np.ndarray], n: int) -> np.ndarray:
    """Resample a polyline to n points (uniform in cumulative length)."""
    pts_arr = np.array(pts)
    seg = np.diff(pts_arr, axis=0)
    seg_len = np.linalg.norm(seg, axis=1)
    cum = np.concatenate([[0.0], np.cumsum(seg_len)])
    cum /= max(cum[-1], 1e-9)
    ts = np.linspace(0, 1, n)
    out = np.empty((n, 3))
    for i, t in enumerate(ts):
        k = min(int(np.searchsorted(cum, t, side="right")) - 1, len(seg) - 1)
        lt = (t - cum[k]) / max(cum[k + 1] - cum[k], 1e-9)
        out[i] = pts_arr[k] + seg[k] * lt
    return out


# ---------------------------------------------------------------------------
# Fit / un-map machinery
# ---------------------------------------------------------------------------


def authored_bone_positions(
    item_bones: list[tuple[str, str, np.ndarray]],
    j_ref: dict[str, np.ndarray],
    j_arch: dict[str, np.ndarray],
    u: float,
) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """name -> (authored/reference-space head, target/archetype-space head)."""
    pos: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    for name, parent, target in item_bones:
        pa, pt = pos[parent] if parent in pos else (j_ref[parent], j_arch[parent])
        h_auth = pa + (np.asarray(target, dtype=np.float64) - pt) / u
        pos[name] = (h_auth, np.asarray(target, dtype=np.float64))
    return pos


def unmap_shell(
    shell: Shell,
    bone_positions: dict[str, tuple[np.ndarray, np.ndarray]],
    j_ref: dict[str, np.ndarray],
    j_arch: dict[str, np.ndarray],
    u: float,
) -> None:
    """Transform target-space verts into authoring space through the shell's
    weights (see module docstring). Mutates shell.verts in place."""
    n = len(shell.verts)
    wsum = np.zeros(n)
    p_ref = np.zeros((n, 3))
    p_arch = np.zeros((n, 3))
    for bone, w in shell.weights.items():
        pa, pt = bone_positions[bone] if bone in bone_positions else (j_ref.get(bone), j_arch.get(bone))
        assert pa is not None and pt is not None, f"unmap: unknown bone {bone}"
        p_ref += w[:, None] * pa[None, :]
        p_arch += w[:, None] * pt[None, :]
        wsum += w
    assert wsum.min() > 1e-6, f"{shell.name}: unweighted vertices"
    p_ref /= wsum[:, None]
    p_arch /= wsum[:, None]
    shell.verts = p_ref + (shell.verts - p_arch) / u


# ---------------------------------------------------------------------------
# Shared fitted-body measurements (biped-round archetype space)
# ---------------------------------------------------------------------------


class Fit:
    """Biped-round body measurements every garment builder uses."""

    def __init__(self, skel_arch: dict):
        self.j = joints(skel_arch)
        self.u = skel_arch["uniformScale"]
        self.style = bodies.STYLE["biped-round"]
        j = self.j
        self.head_center = j["head"] + np.array(skel_arch["head"]["center"])
        self.head_r = skel_arch["head"]["radius"]
        self.head_radii = np.array(
            [self.head_r * self.style["head_wide"], self.head_r * self.style["head_squash"], self.head_r]
        )
        torso_h = j["neck"][1] - j["hips"][1]
        self.torso_bottom = j["hips"][1] - torso_h * 0.42
        self.torso_top = j["neck"][1] + torso_h * 0.55
        self.cy = (self.torso_bottom + self.torso_top) / 2
        self.ry = (self.torso_top - self.torso_bottom) / 2
        self.rx = self.head_r * self.style["torso_rx"]
        self.rz = self.head_r * self.style["torso_rz"]
        self.pear = self.style["pear"]
        self.taper = self.style["shoulder_taper"]
        self.arm_r = self.style["arm_r"] * self.u / 0.9
        root_pull = 0.62
        self.arm_root = j["upperArmL"] * np.array([root_pull, 1.0, 1.0]) + np.array([0.0, 0.01, 0.0]) * self.u

    def torso_profile(self, v01: np.ndarray, verts: np.ndarray) -> np.ndarray:
        return (
            1.0
            + self.pear * (1.0 - v01) ** 2 * np.sin(np.pi * np.clip(v01, 0, 1)) * 2.0
            - self.taper * v01**2
        )

    def torso_mult_at_y(self, y: float) -> float:
        v = np.clip((y - self.torso_bottom) / (self.torso_top - self.torso_bottom), 0.0, 1.0)
        return float(self.torso_profile(np.array([v]), None)[0])

    def torso_front_z(self, y: float, x: float, clearance: float) -> float:
        """z of the torso front surface at (x, y), pushed out by clearance."""
        m = self.torso_mult_at_y(y)
        rx = self.rx * m
        rz = self.rz * m
        vy = np.clip((y - self.cy) / self.ry, -0.999, 0.999)
        shrink = math.sqrt(max(1.0 - vy * vy, 1e-6))
        rx *= shrink
        rz *= shrink
        inner = max(1.0 - (x / max(rx, 1e-6)) ** 2, 0.05)
        return rz * math.sqrt(inner) + clearance

    def torso_weights(self, shell: Shell) -> None:
        bodies._torso_weights(shell, self.j)

    def garment_torso_shell(self, name: str, inflate: float, useg: int = 24, vseg: int = 16) -> Shell:
        s = ellipsoid(
            name,
            (0.0, self.cy, 0.0),
            (self.rx + inflate, self.ry + inflate * 0.6, self.rz + inflate),
            useg=useg,
            vseg=vseg,
            profile=self.torso_profile,
        )
        self.torso_weights(s)
        return s

    def torso_body_keys(self, shells: list[Shell]) -> dict[str, np.ndarray]:
        """Body-follow shape keys (bellyRound/chubby/slim), target space —
        the exact torso/limb formulas from bodies.body_shape_keys."""
        n = sum(len(s.verts) for s in shells)
        keys = {k: np.zeros((n, 3)) for k in ("bellyRound", "chubby", "slim")}
        off = 0
        for shell in shells:
            v = shell.verts
            m = len(v)
            if shell.name.startswith("sleeve"):
                centroid = v.mean(axis=0)
                radial = v - centroid[None, :]
                keys["chubby"][off : off + m] = radial * 0.10
                keys["slim"][off : off + m] = radial * -0.08
            else:  # torso-hugging shells
                du = v[:, 0] / (self.rx * 1.1)
                dv = (v[:, 1] - (self.cy - self.ry * 0.18)) / (self.ry * 0.7)
                w = (1.0 - smoothstep(0.4, 1.0, np.sqrt(du * du + dv * dv))) * smoothstep(
                    -0.1, 0.5, v[:, 2] / self.rx
                )
                radial = v.copy()
                radial[:, 1] = 0.0
                norm = np.linalg.norm(radial, axis=1, keepdims=True)
                radial = np.divide(radial, norm, out=np.zeros_like(radial), where=norm > 1e-9)
                keys["bellyRound"][off : off + m] = (
                    radial * (w * 0.075 * self.u)[:, None]
                    + np.array([0, 0, 1.0])[None, :] * (w * 0.02 * self.u)[:, None]
                )
                keys["chubby"][off : off + m] = radial * 0.05 * self.u
                keys["slim"][off : off + m] = radial * -0.038 * self.u
            off += m
        return keys

    def sleeve(self, name: str, inflate: float, cover: float, useg: int = 12, vseg: int = 8) -> Shell:
        """Sleeve over the LEFT arm from the root to `cover` (0..1 toward the
        hand), weighted with the body's own arm falloff."""
        j = self.j
        end = self.arm_root + (j["handL"] - self.arm_root) * cover
        r0 = self.arm_r * 1.25 + inflate
        r1 = self.arm_r * (1.25 - 0.3 * cover) + inflate
        s = capsule_along(name, tuple(self.arm_root), tuple(end), r0, r1, useg=useg, vseg=vseg)
        # weight against the FULL arm t so the falloff matches the body arm
        axis = j["handL"] - self.arm_root
        L = float(np.linalg.norm(axis))
        axis /= L
        t = np.clip(((s.verts - self.arm_root[None, :]) @ axis) / L, 0.0, 1.0)
        fs = smoothstep(0.5 - 0.18, 0.5 + 0.18, t)
        s.weights["upperArmL"] = 1.0 - fs
        s.weights["foreArmL"] = fs
        return s


# ---------------------------------------------------------------------------
# Item builders. Each returns a dict:
#   objects: [(object_name, [shells], attach_bone_or_None, keys_dict_target_space)]
#   item_bones: [(name, parent, target_head)]
#   display_ears: bool (render hat previews with upright ears)
# ---------------------------------------------------------------------------


def build_cap_baseball(fit: Fit):
    hc, hr = fit.head_center, fit.head_radii
    radii = (hr[0] + 0.009, hr[1] + 0.009, hr[2] + 0.009)
    ear_root_y = fit.j["earL.1"][1]
    # Narrow arches: just enough for upright ears to pass in `through` mode
    # without reading as bites out of the cap when ears are `under` (the
    # step-4 gate caught 40°/+0.065 as a huge scallop of bare head).
    rim = ear_arch_rim(base_y=ear_root_y - 0.055, arch_y=ear_root_y + 0.028, half_width_deg=22)
    dome = arched_dome("cap", hc, radii, rim, useg=32, vseg=8)
    dome.uv_rect = (0.0, 0.3, 0.7, 1.0)

    # brim: rounded tongue attached at the front rim, tilted slightly down
    rim_front_y = rim(0.0)
    brim_z = hc[2] + radii[2] * math.sin(math.acos(np.clip((rim_front_y - hc[1]) / radii[1], -1, 1)))
    brim = ellipsoid("brim", (0.0, rim_front_y + 0.006, brim_z + 0.040), (0.082, 0.009, 0.072), useg=14, vseg=8)
    brim.verts[:, 1] += (brim.verts[:, 2] - brim_z) * -0.22  # downward tilt
    brim.channel(CH_ACCENT, np.ones(len(brim.verts)))
    brim.uv_rect = (0.72, 0.3, 1.0, 0.7)

    button = ellipsoid("button", (0.0, hc[1] + radii[1] + 0.002, hc[2]), (0.016, 0.009, 0.016), useg=8, vseg=6)
    button.channel(CH_ACCENT, np.ones(len(button.verts)))
    button.uv_rect = (0.72, 0.75, 0.9, 0.95)

    return dict(objects=[("cap-baseball", [dome, brim, button], "socket.hat", {})], item_bones=[], display_ears=True, frame="head")


def build_beanie(fit: Fit):
    hc, hr = fit.head_center, fit.head_radii
    radii = (hr[0] + 0.008, hr[1] + 0.010, hr[2] + 0.008)
    ear_root_y = fit.j["earL.1"][1]
    base_y = ear_root_y - 0.055
    dome = arched_dome("beanie", hc, radii, lambda az: base_y, useg=26, vseg=8)
    dome.uv_rect = (0.0, 0.3, 0.7, 1.0)

    # fold band at the rim
    phi = math.acos(np.clip((base_y - hc[1]) / radii[1], -1, 1))
    n = 26
    az = np.linspace(0, 2 * math.pi, n, endpoint=False)
    centers = np.stack(
        [
            hc[0] + radii[0] * math.sin(phi) * np.sin(az),
            np.full(n, base_y + 0.004),
            hc[2] + radii[2] * math.sin(phi) * np.cos(az),
        ],
        axis=1,
    )
    radials = np.stack([np.sin(az), np.zeros(n), np.cos(az)], axis=1)
    band = ring_tube("band", centers, radials, np.array([0.0, 1.0, 0.0]), 0.012, 0.017, vseg=8)
    band.channel(CH_SECONDARY, np.ones(len(band.verts)))
    band.uv_rect = (0.0, 0.0, 0.7, 0.28)

    pompom = ellipsoid("pompom", (hc[0], hc[1] + radii[1] + 0.018, hc[2]), (0.028, 0.026, 0.028), useg=10, vseg=8)
    pompom.channel(CH_SECONDARY, np.ones(len(pompom.verts)))
    pompom.uv_rect = (0.72, 0.3, 1.0, 0.7)

    return dict(objects=[("beanie", [dome, band, pompom], "socket.hat", {})], item_bones=[], display_ears=True, frame="head")


def build_strawhat(fit: Fit):
    hc, hr = fit.head_center, fit.head_radii
    radii = (hr[0] + 0.006, hr[1] + 0.018, hr[2] + 0.006)
    ear_root_y = fit.j["earL.1"][1]
    base_y = ear_root_y - 0.025
    rim = ear_arch_rim(base_y=base_y, arch_y=ear_root_y + 0.072, half_width_deg=38)
    dome = arched_dome("crown", hc, radii, rim, useg=32, vseg=7)
    dome.uv_rect = (0.0, 0.35, 0.62, 1.0)

    # wide FLAT brim ring at the (unarched) base — the crown arches over the
    # ears above it, so ears pass between crown edge and brim
    phi_base = math.acos(np.clip((base_y - hc[1]) / radii[1], -1, 1))
    ring_r = float(min(radii[0], radii[2])) * math.sin(phi_base)
    n = 40
    az = np.linspace(0, 2 * math.pi, n, endpoint=False)
    brim_half = 0.052
    centers = np.stack(
        [
            hc[0] + (ring_r + brim_half * 0.85) * np.sin(az),
            np.full(n, base_y + 0.002),
            hc[2] + (ring_r + brim_half * 0.85) * np.cos(az),
        ],
        axis=1,
    )
    radials = np.stack([np.sin(az), np.zeros(n), np.cos(az)], axis=1)
    brim = ring_tube("brim", centers, radials, np.array([0.0, 1.0, 0.0]), brim_half, 0.0045, vseg=6)
    # gentle downward slope toward the outer edge
    rad_dist = np.sqrt(brim.verts[:, 0] ** 2 + brim.verts[:, 2] ** 2)
    brim.verts[:, 1] -= np.clip((rad_dist - ring_r) / (2 * brim_half), 0, 1) * 0.016
    brim.uv_rect = (0.0, 0.0, 1.0, 0.33)

    # ribbon band around the crown just above the brim
    band_y = base_y + 0.026
    phi_b = math.acos(np.clip((band_y - hc[1]) / radii[1], -1, 1))
    nb = 26
    azb = np.linspace(0, 2 * math.pi, nb, endpoint=False)
    centers_b = np.stack(
        [
            hc[0] + (radii[0] * math.sin(phi_b) + 0.003) * np.sin(azb),
            np.full(nb, band_y),
            hc[2] + (radii[2] * math.sin(phi_b) + 0.003) * np.cos(azb),
        ],
        axis=1,
    )
    radials_b = np.stack([np.sin(azb), np.zeros(nb), np.cos(azb)], axis=1)
    band = ring_tube("ribbon", centers_b, radials_b, np.array([0.0, 1.0, 0.0]), 0.007, 0.013, vseg=6)
    band.channel(CH_ACCENT, np.ones(len(band.verts)))
    band.uv_rect = (0.64, 0.35, 1.0, 0.6)

    return dict(objects=[("strawhat", [dome, brim, band], "socket.hat", {})], item_bones=[], display_ears=True, frame="head")


def _eye_positions(fit: Fit) -> tuple[np.ndarray, float]:
    """Approximate drawn-eye centers on the face sphere (for eyewear)."""
    hc = fit.head_center
    r = float(fit.head_radii[2]) * 1.10  # just off the face-plane shell
    x = 0.072
    y = hc[1] + 0.018
    z = hc[2] + math.sqrt(max(r * r - x * x - (y - hc[1]) ** 2, 0.0))
    return np.array([x, y, z]), r


def build_sunglasses_round(fit: Fit):
    eye, _ = _eye_positions(fit)
    shells = []
    for sx, side in ((1.0, "L"), (-1.0, "R")):
        c = eye * np.array([sx, 1.0, 1.0])
        lens = ellipsoid(f"lens{side}", tuple(c), (0.047, 0.047, 0.010), useg=14, vseg=8)
        lens.channel(CH_ACCENT, np.ones(len(lens.verts)))
        lens.uv_rect = (0.0 if sx > 0 else 0.25, 0.5, 0.24 if sx > 0 else 0.49, 1.0)
        shells.append(lens)
        # rim ring around the lens (in a plane facing +Z, tilted by x offset)
        n = 18
        th = np.linspace(0, 2 * math.pi, n, endpoint=False)
        e1 = np.array([1.0, 0.0, -c[0] * 0.4 / max(c[2], 1e-6)])
        e1 /= np.linalg.norm(e1)
        e2 = np.array([0.0, 1.0, 0.0])
        centers = c[None, :] + 0.049 * (np.outer(np.cos(th), e1) + np.outer(np.sin(th), e2))
        radials = np.outer(np.cos(th), e1) + np.outer(np.sin(th), e2)
        normal = np.cross(e1, e2)
        normal /= np.linalg.norm(normal)
        rim = ring_tube(f"rim{side}", centers, radials, normal, 0.006, 0.006, vseg=6)
        rim.uv_rect = (0.5 if sx > 0 else 0.65, 0.5, 0.64 if sx > 0 else 0.79, 1.0)
        shells.append(rim)
    bridge = capsule_along("bridge", (-0.026, eye[1] + 0.012, eye[2] + 0.002), (0.026, eye[1] + 0.012, eye[2] + 0.002), 0.006, 0.006, useg=8, vseg=4)
    bridge.uv_rect = (0.8, 0.5, 1.0, 0.75)
    shells.append(bridge)
    for sx, side in ((1.0, "L"), (-1.0, "R")):
        temple = capsule_along(
            f"temple{side}",
            (sx * (eye[0] + 0.046), eye[1] + 0.01, eye[2] - 0.01),
            (sx * (fit.head_radii[0] + 0.004), eye[1] + 0.028, fit.head_center[2] - 0.03),
            0.005,
            0.005,
            useg=8,
            vseg=4,
        )
        temple.uv_rect = (0.0 if sx > 0 else 0.25, 0.0, 0.24 if sx > 0 else 0.49, 0.48)
        shells.append(temple)
    return dict(objects=[("sunglasses-round", shells, "socket.face", {})], item_bones=[], display_ears=False, frame="head")


def build_glasses_square(fit: Fit):
    eye, _ = _eye_positions(fit)
    shells = []
    for sx, side in ((1.0, "L"), (-1.0, "R")):
        c = eye * np.array([sx, 1.0, 1.0])
        n = 24
        th = np.linspace(0, 2 * math.pi, n, endpoint=False)
        # superellipse (squarish) ring
        ct, st = np.cos(th), np.sin(th)
        e = 4.0
        m = (np.abs(ct) ** e + np.abs(st) ** e) ** (-1.0 / e)
        e1 = np.array([1.0, 0.0, -c[0] * 0.4 / max(c[2], 1e-6)])
        e1 /= np.linalg.norm(e1)
        e2 = np.array([0.0, 1.0, 0.0])
        centers = c[None, :] + 0.046 * (np.outer(ct * m, e1) + np.outer(st * m * 0.82, e2))
        radials = np.outer(ct, e1) + np.outer(st, e2)
        radials /= np.linalg.norm(radials, axis=1, keepdims=True)
        normal = np.cross(e1, e2)
        normal /= np.linalg.norm(normal)
        rim = ring_tube(f"rim{side}", centers, radials, normal, 0.0055, 0.0055, vseg=6)
        rim.uv_rect = (0.0 if sx > 0 else 0.35, 0.4, 0.34 if sx > 0 else 0.69, 1.0)
        shells.append(rim)
    bridge = capsule_along("bridge", (-0.026, eye[1] + 0.014, eye[2]), (0.026, eye[1] + 0.014, eye[2]), 0.0055, 0.0055, useg=8, vseg=4)
    bridge.uv_rect = (0.72, 0.4, 1.0, 0.7)
    shells.append(bridge)
    for sx, side in ((1.0, "L"), (-1.0, "R")):
        temple = capsule_along(
            f"temple{side}",
            (sx * (eye[0] + 0.044), eye[1] + 0.012, eye[2] - 0.008),
            (sx * (fit.head_radii[0] + 0.004), eye[1] + 0.03, fit.head_center[2] - 0.03),
            0.0045,
            0.0045,
            useg=8,
            vseg=4,
        )
        temple.uv_rect = (0.0 if sx > 0 else 0.35, 0.0, 0.34 if sx > 0 else 0.69, 0.38)
        shells.append(temple)
    return dict(objects=[("glasses-square", shells, "socket.face", {})], item_bones=[], display_ears=False, frame="head")


def build_tee_basic(fit: Fit):
    body = fit.garment_torso_shell("teeBody", inflate=0.0045)
    body.uv_rect = (0.0, 0.3, 0.62, 1.0)
    body.uv_front_center = True
    # collar band (secondary) near the top, trim at the bottom hem
    v = body.params[:, 1]
    body.channel(CH_SECONDARY, smoothstep(0.9, 0.97, v) * 0.9)

    sleeveL = fit.sleeve("sleeveL", inflate=0.0045, cover=0.42)
    t = sleeveL.params[:, 1]
    sleeveL.channel(CH_SECONDARY, smoothstep(0.78, 0.95, t) * 0.9)
    sleeveL.uv_rect = (0.64, 0.3, 0.98, 0.65)
    sleeveR = mirror_x(sleeveL, "sleeveR")
    sleeveR.channel(CH_SECONDARY, smoothstep(0.78, 0.95, t) * 0.9)
    sleeveR.uv_rect = (0.64, 0.68, 0.98, 1.0)

    shells = [body, sleeveL, sleeveR]
    keys = fit.torso_body_keys(shells)
    return dict(objects=[("tee-basic", shells, None, keys)], item_bones=[], display_ears=False, frame="torso")


def build_hoodie(fit: Fit):
    j = fit.j
    body = fit.garment_torso_shell("hoodieBody", inflate=0.0075)
    body.uv_rect = (0.0, 0.35, 0.55, 1.0)
    body.uv_front_center = True
    # kangaroo pocket: secondary patch low on the front
    v = body.verts
    du = v[:, 0] / (fit.rx * 0.55)
    dv = (v[:, 1] - (fit.cy - fit.ry * 0.28)) / (fit.ry * 0.30)
    front = smoothstep(0.3, 0.7, v[:, 2] / max(fit.rz, 1e-9))
    pocket = (1.0 - smoothstep(0.6, 1.0, np.sqrt(du * du + dv * dv))) * front
    body.channel(CH_SECONDARY, pocket * 0.9)

    sleeveL = fit.sleeve("sleeveL", inflate=0.006, cover=0.95)
    t = sleeveL.params[:, 1]
    sleeveL.channel(CH_SECONDARY, smoothstep(0.85, 0.97, t) * 0.9)
    sleeveL.uv_rect = (0.57, 0.35, 0.98, 0.66)
    sleeveR = mirror_x(sleeveL, "sleeveR")
    sleeveR.channel(CH_SECONDARY, smoothstep(0.85, 0.97, t) * 0.9)
    sleeveR.uv_rect = (0.57, 0.69, 0.98, 1.0)

    # down hood: soft lump behind the neck
    hood_c = (0.0, j["neck"][1] + 0.02, -fit.rz * fit.torso_mult_at_y(j["neck"][1]) - 0.028)
    hood = ellipsoid("hood", hood_c, (0.088, 0.052, 0.047), useg=14, vseg=9)
    hood.weights["chest"] = np.ones(len(hood.verts))
    hood.channel(CH_SECONDARY, np.full(len(hood.verts), 0.9))
    hood.uv_rect = (0.0, 0.0, 0.3, 0.33)

    shells = [body, sleeveL, sleeveR, hood]
    keys = fit.torso_body_keys([body, sleeveL, sleeveR])
    keys_hood = {k: np.zeros((len(hood.verts), 3)) for k in keys}
    keys = {k: np.concatenate([keys[k], keys_hood[k]]) for k in keys}

    # drawstrings: two cords hanging from the collar front, own bone chains
    item_bones: list[tuple[str, str, np.ndarray]] = []
    string_shells = []
    y0 = j["chest"][1] + 0.055
    for sx, side in ((1.0, "L"), (-1.0, "R")):
        x = sx * 0.034
        z0 = fit.torso_front_z(y0, x, 0.0075 + 0.004)
        # plumb-line bones (see scarf note): vertical at the cord-END's front
        # z so spring equilibrium == authored pose and the cords never sink
        # under the chest bulge; the mesh top still meets the collar.
        zc = fit.torso_front_z(y0 - 0.078, x, 0.0075 + 0.006)
        top = np.array([x, y0, z0])
        mid = np.array([x, y0 - 0.038, zc])
        end = np.array([x, y0 - 0.078, zc])
        item_bones.append((f"hoodieDraw{side}1", "chest", np.array([x, y0, zc])))
        item_bones.append((f"hoodieDraw{side}2", f"hoodieDraw{side}1", mid))
        L = 0.078
        cord = capsule_along(f"cord{side}", tuple(top), tuple(top + np.array([0, L, 0])), 0.0058, 0.008, useg=8, vseg=8)
        tc = cord.params[:, 1]
        cord.verts = bend_chain(cord.verts, top, L, [top, mid, end])
        # bend_chain's frame mirrors X for downward tangents (side = up×ref
        # with up ≈ −Y) — re-orient the closed shell or its faces render
        # inside-out and get backface-culled in three (step-4 gate finding)
        ensure_outward(cord)
        f1 = smoothstep(0.32, 0.68, tc)
        cord.weights[f"hoodieDraw{side}1"] = 1.0 - f1
        cord.weights[f"hoodieDraw{side}2"] = f1
        cord.channel(CH_ACCENT, np.ones(len(cord.verts)))
        cord.uv_rect = (0.32 if sx > 0 else 0.5, 0.0, 0.48 if sx > 0 else 0.66, 0.33)
        string_shells.append(cord)

    keys_strings = {k: np.zeros((sum(len(s.verts) for s in string_shells), 3)) for k in keys}
    keys = {k: np.concatenate([keys[k], keys_strings[k]]) for k in keys}
    return dict(objects=[("hoodie", shells + string_shells, None, keys)], item_bones=item_bones, display_ears=False, frame="torso")


def build_scarf(fit: Fit):
    j = fit.j
    # collar: elliptical ring hugging the neck base
    neck_y = j["neck"][1] + 0.012
    m = fit.torso_mult_at_y(neck_y)
    vy = np.clip((neck_y - fit.cy) / fit.ry, -0.999, 0.999)
    shrink = math.sqrt(max(1.0 - vy * vy, 1e-6))
    ra = fit.rx * m * shrink + 0.016
    rb = fit.rz * m * shrink + 0.016
    n = 26
    az = np.linspace(0, 2 * math.pi, n, endpoint=False)
    centers = np.stack([ra * np.sin(az), np.full(n, neck_y), rb * np.cos(az)], axis=1)
    radials = np.stack([np.sin(az), np.zeros(n), np.cos(az)], axis=1)
    radials /= np.linalg.norm(radials, axis=1, keepdims=True)
    collar = ring_tube("collar", centers, radials, np.array([0.0, 1.0, 0.0]), 0.020, 0.026, vseg=8)
    wneck = smoothstep(neck_y - 0.05, neck_y + 0.05, collar.verts[:, 1])
    collar.weights["chest"] = 1.0 - wneck * 0.4
    collar.weights["neck"] = wneck * 0.4
    collar.uv_rect = (0.0, 0.6, 1.0, 1.0)

    item_bones: list[tuple[str, str, np.ndarray]] = []
    shells = [collar]
    for sx, side, length in ((1.0, "L", 0.165), (-1.0, "R", 0.135)):
        x = sx * 0.045
        top_y = neck_y + 0.010  # start inside the collar tube
        ys = [top_y, top_y - length / 3, top_y - 2 * length / 3, top_y - length]
        drift = [0.0, 0.004, 0.008, 0.012]  # tips lean gently outward
        # PLUMB-LINE physics (step-4 gate finding): a hanging spring chain
        # equilibrates VERTICALLY UNDER ITS ROOT — any authored forward slope
        # verticalizes away and the ends sink behind the pot belly. So the
        # BONES live on a vertical line 26 mm proud of the belly's widest
        # point (visible even from the usual high grazing camera); only the
        # MESH's top segment slopes back to tuck into the collar tube.
        z_hang = fit.torso_front_z(ys[-1], x, 0.026)
        path = [np.array([x, ys[0], fit.torso_front_z(ys[0], x, 0.020)])] + [
            np.array([x + sx * drift[i], y, z_hang]) for i, y in list(enumerate(ys))[1:]
        ]
        bone_pts = [np.array([x + sx * drift[i], ys[i], z_hang]) for i in range(3)]
        item_bones.append((f"scarf{side}1", "chest", bone_pts[0]))
        item_bones.append((f"scarf{side}2", f"scarf{side}1", bone_pts[1]))
        item_bones.append((f"scarf{side}3", f"scarf{side}2", bone_pts[2]))
        strap = capsule_along(f"end{side}", tuple(path[0]), tuple(path[0] + np.array([0, length, 0])), 0.034, 0.031, useg=10, vseg=12, bulge=0.004)
        # flat wide scarf cross-section: widen across, flatten against the chest
        strap.verts[:, 0] = path[0][0] + (strap.verts[:, 0] - path[0][0]) * 1.35
        strap.verts[:, 2] = path[0][2] + (strap.verts[:, 2] - path[0][2]) * 0.30
        t = strap.params[:, 1]
        strap.verts = bend_chain(strap.verts, path[0], length, path)
        ensure_outward(strap)  # downward bend mirrors X — see hoodie note
        f1 = smoothstep(0.22, 0.44, t)
        f2 = smoothstep(0.55, 0.77, t)
        strap.weights[f"scarf{side}1"] = 1.0 - f1
        strap.weights[f"scarf{side}2"] = f1 * (1.0 - f2)
        strap.weights[f"scarf{side}3"] = f1 * f2
        # fringe stripes at the tip
        stripe = (smoothstep(0.80, 0.84, t) - smoothstep(0.88, 0.92, t)) + smoothstep(0.955, 0.985, t)
        strap.channel(CH_SECONDARY, np.clip(stripe, 0, 1) * 0.95)
        strap.uv_rect = (0.0 if sx > 0 else 0.5, 0.0, 0.48 if sx > 0 else 0.98, 0.58)
        shells.append(strap)

    return dict(objects=[("scarf", shells, None, {})], item_bones=item_bones, display_ears=False, frame="torso")


def build_backpack_mini(fit: Fit):
    j = fit.j
    sb = j["socket.back"]
    back_z = -fit.rz * fit.torso_mult_at_y(sb[1]) - 0.060
    pack_c = np.array([0.0, sb[1] + 0.03, back_z])
    pack = ellipsoid("pack", tuple(pack_c), (0.092, 0.115, 0.052), useg=16, vseg=12, boxiness=0.45)
    pack.uv_rect = (0.0, 0.3, 0.7, 1.0)
    flap = ellipsoid("flap", tuple(pack_c + np.array([0, 0.062, -0.012])), (0.084, 0.05, 0.05), useg=12, vseg=8, boxiness=0.3)
    flap.channel(CH_ACCENT, np.ones(len(flap.verts)))
    flap.uv_rect = (0.72, 0.62, 1.0, 1.0)
    # shoulder straps: over-the-shoulder tubes (rigid, part of the pack)
    rigid_shells = [pack, flap]
    for sx, side in ((1.0, "L"), (-1.0, "R")):
        x = sx * 0.056
        shoulder_y = j["shoulderL"][1] + 0.055
        pts = [
            np.array([x, pack_c[1] + 0.09, back_z + 0.03]),
            np.array([x, shoulder_y, -0.02]),
            np.array([x, shoulder_y - 0.005, 0.06]),
            np.array([x, j["chest"][1] + 0.03, fit.torso_front_z(j["chest"][1] + 0.03, x, 0.006)]),
        ]
        pp = path_points(pts, 10)
        strap = capsule_along(f"shoulder{side}", tuple(pp[0]), tuple(pp[0] + np.array([0, float(np.sum(np.linalg.norm(np.diff(pp, axis=0), axis=1))), 0])), 0.016, 0.014, useg=8, vseg=10)
        strap.verts = bend_chain(strap.verts, pp[0], float(np.sum(np.linalg.norm(np.diff(pp, axis=0), axis=1))), list(pp))
        strap.verts[:, 2] = np.minimum(strap.verts[:, 2], fit.torso_front_z(j["chest"][1] + 0.03, x, 0.012))
        ensure_outward(strap)  # mixed-tangent bend — normalize the winding
        strap.channel(CH_ACCENT, np.ones(len(strap.verts)))
        strap.uv_rect = (0.0 if sx > 0 else 0.2, 0.0, 0.18 if sx > 0 else 0.38, 0.28)
        rigid_shells.append(strap)

    # dangling adjuster tails: item-bone chains under socket.back
    item_bones: list[tuple[str, str, np.ndarray]] = []
    tail_shells = []
    for sx, side in ((1.0, "L"), (-1.0, "R")):
        x = sx * 0.066
        top = np.array([x, pack_c[1] - 0.10, back_z + 0.012])
        mid = top + np.array([0, -0.032, 0.004])
        end = top + np.array([0, -0.065, 0.006])
        item_bones.append((f"packStrap{side}1", "socket.back", top))
        item_bones.append((f"packStrap{side}2", f"packStrap{side}1", mid))
        L = 0.065
        tail = capsule_along(f"tail{side}", tuple(top), tuple(top + np.array([0, L, 0])), 0.0105, 0.0095, useg=8, vseg=8)
        tail.verts[:, 2] = top[2] + (tail.verts[:, 2] - top[2]) * 0.5
        t = tail.params[:, 1]
        tail.verts = bend_chain(tail.verts, top, L, [top, mid, end])
        ensure_outward(tail)  # downward bend mirrors X — see hoodie note
        f1 = smoothstep(0.32, 0.68, t)
        tail.weights[f"packStrap{side}1"] = 1.0 - f1
        tail.weights[f"packStrap{side}2"] = f1
        tail.channel(CH_ACCENT, np.ones(len(tail.verts)))
        tail.uv_rect = (0.4 if sx > 0 else 0.55, 0.0, 0.53 if sx > 0 else 0.68, 0.28)
        tail_shells.append(tail)

    return dict(
        objects=[
            ("backpack-mini", rigid_shells, "socket.back", {}),
            ("backpack-mini-tails", tail_shells, None, {}),
        ],
        item_bones=item_bones,
        display_ears=False,
        frame="torso",
    )


def build_mug(fit: Fit):
    j = fit.j
    s = j["socket.handL"]
    c = s + np.array([0.020, -0.012, 0.062])
    half_h = 0.047
    body = capsule_along("mugBody", (c[0], c[1] - half_h, c[2]), (c[0], c[1] + half_h, c[2]), 0.040, 0.043, useg=14, vseg=10)
    # coffee: darken the top cap
    top_w = smoothstep(c[1] + half_h * 0.6, c[1] + half_h * 0.95, body.verts[:, 1])
    body.channel(CH_ACCENT, top_w)
    body.uv_rect = (0.0, 0.0, 0.7, 1.0)
    # handle: vertical ring on the outer (+x) side
    n = 14
    th = np.linspace(0, 2 * math.pi, n, endpoint=False)
    e1 = np.array([1.0, 0.0, 0.0])
    e2 = np.array([0.0, 1.0, 0.0])
    hc = c + np.array([0.040, 0.0, 0.0])
    centers = hc[None, :] + 0.026 * (np.outer(np.cos(th), e1) + np.outer(np.sin(th), e2))
    radials = np.outer(np.cos(th), e1) + np.outer(np.sin(th), e2)
    normal = np.array([0.0, 0.0, 1.0])
    handle = ring_tube("handle", centers, radials, normal, 0.0085, 0.0085, vseg=6)
    handle.channel(CH_SECONDARY, np.ones(len(handle.verts)))
    handle.uv_rect = (0.72, 0.3, 1.0, 0.7)
    return dict(objects=[("mug", [body, handle], "socket.handL", {})], item_bones=[], display_ears=False, frame="hand")


ITEM_BUILDERS = {
    "cap-baseball": build_cap_baseball,
    "beanie": build_beanie,
    "strawhat": build_strawhat,
    "sunglasses-round": build_sunglasses_round,
    "glasses-square": build_glasses_square,
    "tee-basic": build_tee_basic,
    "hoodie": build_hoodie,
    "scarf": build_scarf,
    "backpack-mini": build_backpack_mini,
    "mug": build_mug,
}


# ---------------------------------------------------------------------------
# Preview + export
# ---------------------------------------------------------------------------


def _gray_material() -> bpy.types.Material:
    mat = bpy.data.materials.get("preview-graybody")
    if mat is None:
        mat = bpy.data.materials.new("preview-graybody")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.55, 0.55, 0.6, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.9
        mat.diffuse_color = (0.55, 0.55, 0.6, 1.0)
    return mat


def render_dressed_preview(item_id: str, result: dict, fit: Fit, skel_arch: dict, skel_ref: dict) -> None:
    """Workbench turntable of the FITTED item over a neutral-gray body."""
    blender_io.clean_scene()
    gray = _gray_material()

    def build_gray(name: str, shells: list[Shell]) -> None:
        obj, _offsets = blender_io.build_object(name, shells)
        obj.data.materials.clear()
        obj.data.materials.append(gray)
        for poly in obj.data.polygons:
            poly.material_index = 0

    body_shells, _meta = bodies.build_body_shells("biped-round", skel_arch)
    build_gray("previewBody", body_shells)
    if result.get("display_ears"):
        ear_results = parts_mod.ears_upright_pointy(skel_ref)
        for _name, ear_shells, _attach, _keys in ear_results:
            scaled = [
                Shell(name=f"preview_{s.name}", verts=s.verts * fit.u, faces=s.faces, params=s.params)
                for s in ear_shells
            ]
            build_gray("previewEars", scaled)
    for obj_name, shells, _attach, _keys in result["objects"]:
        display = [
            Shell(name=f"disp_{s.name}", verts=s.verts.copy(), faces=s.faces, params=s.params, channels=s.channels, uv_rect=s.uv_rect)
            for s in shells
        ]
        blender_io.build_object(f"preview_{obj_name}", display)

    frame = result.get("frame", "torso")
    center_xy = (0.0, 0.0)
    if frame == "head":
        center_y, radius = float(fit.head_center[1]) + 0.05, 1.15
    elif frame == "hand":
        s = fit.j["socket.handL"]
        center_y, radius = float(s[1]) - 0.02, 0.55
        center_xy = (float(s[0]) + 0.02, -float(s[2]) - 0.05)
    else:
        center_y, radius = float(fit.cy) + 0.08, 1.45
    blender_io.render_turntable(os.path.join(PREVIEW_DIR, f"item-{item_id}"), center_z=center_y, radius=radius, center_xy=center_xy)


def export_item(item_id: str, result: dict, fit: Fit, skel_ref: dict, skel_arch: dict) -> None:
    blender_io.clean_scene()
    j_ref = joints(skel_ref)
    j_arch = fit.j
    u = fit.u

    skinned = any(attach is None for _n, _s, attach, _k in result["objects"])
    arm = None
    bone_positions = authored_bone_positions(result["item_bones"], j_ref, j_arch, u)
    if skinned:
        arm = blender_io.build_armature("rig", skel_ref)
        if result["item_bones"]:
            blender_io.add_extra_bones(arm, [(n, p, bone_positions[n][0]) for n, p, _t in result["item_bones"]])

    export_objects = []
    all_shells: list[Shell] = []
    for obj_name, shells, attach, keys in result["objects"]:
        all_shells.extend(shells)
        if attach is not None:
            # rigid: re-express relative to the socket, at reference scale
            socket_pos = j_arch[attach]
            for s in shells:
                s.verts = (s.verts - socket_pos[None, :]) / u
        else:
            for s in shells:
                unmap_shell(s, bone_positions, j_ref, j_arch, u)
        obj, offsets = blender_io.build_object(obj_name, shells)
        if attach is None:
            blender_io.skin_object(obj, arm, shells, offsets)
        else:
            obj["attachBone"] = attach
        if keys:
            blender_io.add_shape_keys(obj, {k: v / u for k, v in keys.items()})
        export_objects.append(obj)

    tris = sum(len(o.data.loop_triangles) for o in export_objects if (o.data.calc_loop_triangles() or True))
    assert tris <= TRI_BUDGET_ITEM, f"{item_id}: {tris} tris > {TRI_BUDGET_ITEM}"

    mask = rasterize_mask(all_shells, size=256, blur=2)
    write_png(os.path.join(TEX_DIR, f"item-{item_id}.mask.png"), mask)

    glb = os.path.join(ASSET_DIR, f"{item_id}.glb")
    exports = ([arm] if arm else []) + export_objects
    blender_io.export_glb(glb, exports)
    size = os.path.getsize(glb)
    assert size <= MAX_BYTES, f"{item_id}: {size} bytes > {MAX_BYTES}"
    print(f"[item {item_id}] {tris} tris -> {glb} ({size // 1024} KB)")


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    only = None
    render = True
    for i, a in enumerate(argv):
        if a == "--only":
            only = set(argv[i + 1].split(","))
        if a == "--no-render":
            render = False

    with open(os.path.join(SCRIPT_DIR, "build", "skeleton.json")) as f:
        skel_data = json.load(f)
    skel_ref = skel_data["reference"]
    skel_arch = skel_data["archetypes"]["biped-round"]
    fit = Fit(skel_arch)

    os.makedirs(TEX_DIR, exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)

    for item_id, builder in ITEM_BUILDERS.items():
        if only and item_id not in only:
            continue
        result = builder(fit)
        if render:
            render_dressed_preview(item_id, result, fit, skel_arch, skel_ref)
            result = builder(fit)  # rebuild: preview pass must not leak mutations
        export_item(item_id, result, fit, skel_ref, skel_arch)

    print("done")


main()
