# Mesh construction toolkit for the Character Studio anatomy assets
# (plan 006 steps 2-3). Pure-python geometry (rings-of-quads shells) fed to
# Blender via from_pydata — no interactive modeling ops, so every asset is
# 100% regenerable from code. See ASSET-CONTRACT.md for the artist contract.
#
# Conventions:
#   - +Y up, character faces +Z, meters (matches canonical.ts).
#   - Shells are closed sphere-topology meshes (quad-dominant, two pole fans),
#     deformed by per-shell profile callables. Bodies/parts are unions of
#     shells; overlaps hide inside the volume (the AC "parts tucked into the
#     body" pattern).
#   - Weights, mask channels (R/G/B/A = primary/secondary/belly/accentA) and
#     UVs are all assigned analytically per vertex at build time.

from __future__ import annotations

import math
import struct
import zlib
from dataclasses import dataclass, field

import numpy as np

# ---------------------------------------------------------------------------
# Shell geometry
# ---------------------------------------------------------------------------


@dataclass
class Shell:
    """One sphere-topology blob: local param grid + world-space vertices."""

    name: str
    verts: np.ndarray  # (n, 3) float
    faces: list[tuple[int, ...]]
    # unit-sphere params per vertex: (azimuth u in [0,1], polar v in [0,1])
    params: np.ndarray  # (n, 2)
    # bone name -> (n,) weights (normalized at assembly)
    weights: dict[str, np.ndarray] = field(default_factory=dict)
    # palette-mask channel weights per vertex (n, 4) = R,G,B,A
    channels: np.ndarray | None = None
    # UV island rect (u0, v0, u1, v1) this shell's params map into
    uv_rect: tuple[float, float, float, float] = (0.0, 0.0, 1.0, 1.0)
    # front-centered UV: azimuth 0 (=+Z, the face direction) maps to u=0.5
    uv_front_center: bool = False

    def channel(self, idx: int, w: np.ndarray) -> None:
        if self.channels is None:
            self.channels = np.zeros((len(self.verts), 4), dtype=np.float64)
        self.channels[:, idx] = np.clip(w, 0.0, 1.0)


def sphere_shell(name: str, useg: int = 16, vseg: int = 12) -> Shell:
    """Unit sphere: rings of quads + two pole fans. v=0 bottom pole, v=1 top."""
    verts: list[tuple[float, float, float]] = []
    params: list[tuple[float, float]] = []
    verts.append((0.0, -1.0, 0.0))
    params.append((0.0, 0.0))
    for ring in range(1, vseg):
        pol = math.pi * ring / vseg  # 0 at bottom
        y = -math.cos(pol)
        r = math.sin(pol)
        for c in range(useg):
            az = 2 * math.pi * c / useg
            # azimuth 0 -> +Z (front), increasing toward +X
            verts.append((r * math.sin(az), y, r * math.cos(az)))
            params.append((c / useg, ring / vseg))
    verts.append((0.0, 1.0, 0.0))
    params.append((0.0, 1.0))

    faces: list[tuple[int, ...]] = []
    def rv(ring: int, c: int) -> int:
        return 1 + (ring - 1) * useg + (c % useg)

    for c in range(useg):  # bottom fan
        faces.append((0, rv(1, c + 1), rv(1, c)))
    for ring in range(1, vseg - 1):
        for c in range(useg):
            a, b = rv(ring, c), rv(ring, c + 1)
            d, e = rv(ring + 1, c), rv(ring + 1, c + 1)
            faces.append((a, b, e, d))
    top = len(verts) - 1
    for c in range(useg):  # top fan
        faces.append((top, rv(vseg - 1, c), rv(vseg - 1, c + 1)))

    return Shell(name=name, verts=np.array(verts, dtype=np.float64), faces=faces, params=np.array(params, dtype=np.float64))


def ellipsoid(
    name: str,
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    useg: int = 16,
    vseg: int = 12,
    profile=None,  # optional callable(v01, verts) -> per-vertex radial multiplier (n,)
    boxiness: float = 0.0,  # 0 = ellipse cross-section, ->1 = squarer (superellipse)
) -> Shell:
    s = sphere_shell(name, useg, vseg)
    v = s.verts
    if boxiness > 0.0:
        # push cross-sections toward a rounded square: normalize by the
        # superellipse radius at each direction
        e = 2.0 / (1.0 - 0.55 * boxiness)  # exponent grows with boxiness
        xz = np.abs(v[:, [0, 2]])
        r = np.linalg.norm(xz, axis=1)
        with np.errstate(invalid="ignore", divide="ignore"):
            se = (xz[:, 0] ** e + xz[:, 1] ** e) ** (1.0 / e)
            m = np.where(se > 1e-9, r / se, 1.0)
        v[:, 0] *= m
        v[:, 2] *= m
    if profile is not None:
        mult = profile(s.params[:, 1], v)
        v[:, 0] *= mult
        v[:, 2] *= mult
    v[:, 0] = v[:, 0] * radii[0] + center[0]
    v[:, 1] = v[:, 1] * radii[1] + center[1]
    v[:, 2] = v[:, 2] * radii[2] + center[2]
    return s


def capsule_along(
    name: str,
    a: tuple[float, float, float],
    b: tuple[float, float, float],
    radius_a: float,
    radius_b: float,
    useg: int = 12,
    vseg: int = 10,
    bulge: float = 0.0,
) -> Shell:
    """Tapered capsule from a to b (sphere shell stretched along the segment)."""
    s = sphere_shell(name, useg, vseg)
    a_ = np.array(a)
    b_ = np.array(b)
    axis = b_ - a_
    length = float(np.linalg.norm(axis))
    axis = axis / max(length, 1e-9)
    # orthonormal frame around the axis
    up = np.array([0.0, 1.0, 0.0]) if abs(axis[1]) < 0.9 else np.array([0.0, 0.0, 1.0])
    x = np.cross(up, axis)
    x /= max(float(np.linalg.norm(x)), 1e-9)
    z = np.cross(axis, x)

    t = s.params[:, 1]  # 0 at "a" pole, 1 at "b" pole
    r = radius_a + (radius_b - radius_a) * t + bulge * np.sin(np.pi * t)
    # local sphere coords: y along axis, xz radial
    local = s.verts
    radial = local[:, [0, 2]]
    along = (local[:, 1] * 0.5 + 0.5) * length  # sphere y in [-1,1] -> [0,len]
    world = (
        a_[None, :]
        + axis[None, :] * along[:, None]
        + x[None, :] * (radial[:, 0] * r)[:, None]
        + z[None, :] * (radial[:, 1] * r)[:, None]
    )
    s.verts = world
    return s


def mirror_x(shell: Shell, name: str) -> Shell:
    """Mirrored copy across X (winding flipped to keep outward normals)."""
    m = Shell(
        name=name,
        verts=shell.verts.copy(),
        faces=[tuple(reversed(f)) for f in shell.faces],
        params=shell.params.copy(),
        weights={mirror_bone_name(bone): w.copy() for bone, w in shell.weights.items()},
        channels=None if shell.channels is None else shell.channels.copy(),
        uv_rect=shell.uv_rect,
        uv_front_center=shell.uv_front_center,
    )
    m.verts[:, 0] *= -1.0
    return m


def mirror_bone_name(bone: str) -> str:
    if bone.endswith("L"):
        return bone[:-1] + "R"
    if bone.endswith("R"):
        return bone[:-1] + "L"
    if ".1" in bone or ".2" in bone:  # earL.1 -> earR.1
        return bone.replace("L.", "R.") if "L." in bone else bone.replace("R.", "L.")
    return bone


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    """Hermite step; supports reversed edges (e1 < e0 -> decreasing)."""
    if e1 < e0:
        return 1.0 - smoothstep(e1, e0, x)
    t = np.clip((x - e0) / max(e1 - e0, 1e-9), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def blend_two(shell: Shell, bone_a: str, bone_b: str, coord: np.ndarray, split: float, width: float) -> None:
    """Weight a shell between two bones with a smooth blend band at `split`."""
    wb = smoothstep(split - width, split + width, coord)
    shell.weights[bone_a] = 1.0 - wb
    shell.weights[bone_b] = wb


def bend_chain(verts: np.ndarray, origin: np.ndarray, length: float, points: list[np.ndarray]) -> np.ndarray:
    """Bend straight-authored verts along a polyline.

    The shell must be authored straight along +Y from `origin` with extent
    `length`. Each vertex's park position t = (y - origin.y) / length picks a
    point + tangent frame on the polyline; the vertex's radial (x/z) offset
    is preserved in that frame. Used for curled tails / drooping ears.
    """
    pts = np.array(points, dtype=np.float64)
    seg = np.diff(pts, axis=0)
    seg_len = np.linalg.norm(seg, axis=1)
    total = float(seg_len.sum())
    cum = np.concatenate([[0.0], np.cumsum(seg_len)]) / max(total, 1e-9)

    out = verts.copy()
    origin = np.asarray(origin, dtype=np.float64)
    for i in range(len(verts)):
        ti = float(np.clip((verts[i][1] - origin[1]) / max(length, 1e-9), 0.0, 1.0))
        k = int(np.searchsorted(cum, ti, side="right") - 1)
        k = min(max(k, 0), len(seg) - 1)
        local_t = (ti - cum[k]) / max(cum[k + 1] - cum[k], 1e-9)
        base = pts[k] + seg[k] * local_t
        up = seg[k] / max(seg_len[k], 1e-9)
        # radial offset in the authored frame (pure x/z once y maps to t).
        # Frame: when up == +Y this must be the identity mapping
        # (side == +X, fwd == +Z); ref flips for near-Z tangents (tails).
        offset = verts[i] - origin
        ref = np.array([0.0, 0.0, 1.0]) if abs(up[2]) < 0.9 else np.array([0.0, 1.0, 0.0])
        side = np.cross(up, ref)
        side /= max(float(np.linalg.norm(side)), 1e-9)
        fwd = np.cross(side, up)
        out[i] = base + side * offset[0] + fwd * offset[2]
    return out


# ---------------------------------------------------------------------------
# UV packing
# ---------------------------------------------------------------------------


def shell_loop_uvs(shell: Shell) -> list[list[tuple[float, float]]]:
    """Per-face per-corner UVs inside the shell's island rect.

    Azimuth u comes from the param grid; the corner belonging to the seam
    column wrap gets u=1 instead of 0 (faces never span the whole rect).
    """
    u0, v0, u1, v1 = shell.uv_rect
    us = shell.params[:, 0].copy()
    vs = shell.params[:, 1]
    if shell.uv_front_center:
        us = (us + 0.5) % 1.0  # front (azimuth 0) lands mid-island

    face_uvs: list[list[tuple[float, float]]] = []
    for f in shell.faces:
        raw_u = [us[i] for i in f]
        # unwrap seam: if the face's u range spans the wrap, lift small u's
        if max(raw_u) - min(raw_u) > 0.5:
            raw_u = [u + 1.0 if u < 0.5 else u for u in raw_u]
        corners = []
        for idx, i in enumerate(f):
            uu = raw_u[idx]
            if uu > 1.0:
                uu -= 0.0  # poles keep param 0; rect clamp below handles it
            corners.append((u0 + min(uu, 1.0) * (u1 - u0), v0 + vs[i] * (v1 - v0)))
        face_uvs.append(corners)
    return face_uvs


# ---------------------------------------------------------------------------
# Mask rasterization + PNG writer (no PIL dependency)
# ---------------------------------------------------------------------------


def rasterize_mask(shells: list[Shell], size: int = 512, blur: int = 2) -> np.ndarray:
    """Rasterize per-vertex channel weights into UV space -> (size,size,4) u8."""
    img = np.zeros((size, size, 4), dtype=np.float64)
    img[:, :, 0] = 1.0  # default: full primary
    for shell in shells:
        if shell.channels is None:
            continue
        uvs = shell_loop_uvs(shell)
        for f, corners in zip(shell.faces, uvs):
            cols = [shell.channels[i] for i in f]
            tris = [(0, 1, 2)] if len(f) == 3 else [(0, 1, 2), (0, 2, 3)]
            for tri in tris:
                _fill_tri(img, [corners[k] for k in tri], [cols[k] for k in tri], size)
    if blur > 0:
        img = _box_blur(img, blur)
    return (np.clip(img, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)


def _fill_tri(img: np.ndarray, uv: list[tuple[float, float]], cols: list[np.ndarray], size: int) -> None:
    pts = np.array([[u * (size - 1), (1.0 - v) * (size - 1)] for u, v in uv])
    x0, y0 = np.floor(pts.min(axis=0)).astype(int)
    x1, y1 = np.ceil(pts.max(axis=0)).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0)
    x1, y1 = min(x1, size - 1), min(y1, size - 1)
    if x1 < x0 or y1 < y0:
        return
    (ax, ay), (bx, by), (cx, cy) = pts
    den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(den) < 1e-12:
        return
    ys, xs = np.mgrid[y0 : y1 + 1, x0 : x1 + 1]
    w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
    w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
    w2 = 1.0 - w0 - w1
    inside = (w0 >= -0.001) & (w1 >= -0.001) & (w2 >= -0.001)
    if not inside.any():
        return
    col = (
        w0[..., None] * cols[0][None, None, :]
        + w1[..., None] * cols[1][None, None, :]
        + w2[..., None] * cols[2][None, None, :]
    )
    region = img[y0 : y1 + 1, x0 : x1 + 1]
    region[inside] = col[inside]


def _box_blur(img: np.ndarray, r: int) -> np.ndarray:
    pad = np.pad(img, ((r, r), (r, r), (0, 0)), mode="edge")
    out = np.zeros_like(img)
    n = (2 * r + 1) ** 2
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out += pad[r + dy : r + dy + img.shape[0], r + dx : r + dx + img.shape[1]]
    return out / n


def write_png(path: str, rgba_u8: np.ndarray) -> None:
    h, w = rgba_u8.shape[:2]
    raw = b"".join(b"\x00" + rgba_u8[y].tobytes() for y in range(h))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
