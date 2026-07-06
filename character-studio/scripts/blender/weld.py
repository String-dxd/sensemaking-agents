# Body weld pass (plan 003): turn the union-of-overlapping-shells body into a
# single continuous closed manifold — the AC-villager structure where limbs are
# welded into the torso so no pose can open a seam.
#
# Pipeline (all headless / deterministic, still "regenerable from code"):
#   1. Build one Blender object per shell (raw capsules/ellipsoids — NOT the
#      SDF-filleted variant: the fillet makes limb surfaces tangent to the torso
#      and the EXACT boolean then yields non-manifold slivers on the slim body.
#      A true weld + junction smoothing restores the smooth shoulder the fillet
#      was faking, so we weld from the clean raw shells instead).
#   2. Boolean UNION (EXACT) every shell into the torso -> one mesh; merge by
#      distance, recalc outside normals, triangulate.
#   3. Transfer UV loops from the original concatenated shell object
#      (POLYINTERP_NEAREST) so the committed mask PNG layout stays valid.
#   4. Transfer skin weights / mask channels / morph offsets from the source
#      shells by nearest source vertex (KD-tree), then Laplacian-smooth the
#      weights + morph offsets + surface across each junction band so the
#      junction blends across bones (>=2 influences) and no morph tears the seam.
#
# Coordinate spaces: shells are authored +Y up (our space); Blender is +Z up.
#   our (x,y,z) -> blender (x, -z, y);  blender (X,Y,Z) -> our (X, Z, -Y).

from __future__ import annotations

import bmesh
import bpy
import numpy as np
from mathutils import Vector, kdtree

import blender_io
import bodies
from meshkit import Shell

CH_DEFAULT = np.array([1.0, 0.0, 0.0, 0.0])  # full primary where a shell has no channels


def _our_to_blender(v: np.ndarray) -> np.ndarray:
    return np.column_stack([v[:, 0], -v[:, 2], v[:, 1]])


def _blender_to_our(v: np.ndarray) -> np.ndarray:
    return np.column_stack([v[:, 0], v[:, 2], -v[:, 1]])


def _shell_object(shell: Shell) -> bpy.types.Object:
    verts = [(float(x), float(-z), float(y)) for x, y, z in shell.verts]
    faces = [tuple(int(i) for i in f) for f in shell.faces]
    mesh = bpy.data.meshes.new(shell.name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(shell.name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def _boolean_union(shells: list[Shell]) -> bpy.types.Object:
    """One manifold from all shells via pairwise EXACT boolean union."""
    objs = [_shell_object(s) for s in shells]
    base = next(o for o in objs if o.name == "torso")
    operands = [o for o in objs if o is not base]
    for o in operands:
        m = base.modifiers.new(name=f"bool_{o.name}", type="BOOLEAN")
        m.operation = "UNION"
        m.solver = "EXACT"
        m.use_self = False
        m.object = o
        bpy.context.view_layer.objects.active = base
        bpy.ops.object.modifier_apply(modifier=f"bool_{o.name}")
    for o in operands:
        bpy.data.objects.remove(o, do_unlink=True)

    bpy.context.view_layer.objects.active = base
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=1e-5)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.object.mode_set(mode="OBJECT")
    base.name = "body"
    base.data.name = "body"
    return base


def _transfer_uvs(welded: bpy.types.Object, src: bpy.types.Object) -> None:
    """Nearest-face-interpolated UV transfer from the shell source object."""
    bpy.context.view_layer.objects.active = welded
    mod = welded.modifiers.new("uv_transfer", "DATA_TRANSFER")
    mod.object = src
    mod.use_loop_data = True
    mod.data_types_loops = {"UV"}
    mod.loop_mapping = "POLYINTERP_NEAREST"
    bpy.ops.object.datalayout_transfer(modifier="uv_transfer")
    bpy.ops.object.modifier_apply(modifier="uv_transfer")


def _source_arrays(shells: list[Shell], meta: dict, u: float):
    """Concatenated per-vertex source data (same order as blender_io.build_object)."""
    bones: list[str] = []
    for s in shells:
        for b in s.weights:
            if b not in bones:
                bones.append(b)
    bone_index = {b: i for i, b in enumerate(bones)}

    total = sum(len(s.verts) for s in shells)
    verts = np.zeros((total, 3))
    weights = np.zeros((total, len(bones)))
    channels = np.zeros((total, 4))
    morph_src = bodies.body_shape_keys(shells, meta, u)  # name -> (total,3)

    off = 0
    for s in shells:
        n = len(s.verts)
        verts[off : off + n] = s.verts
        for b, w in s.weights.items():
            weights[off : off + n, bone_index[b]] = w
        channels[off : off + n] = CH_DEFAULT if s.channels is None else s.channels
        off += n

    row_sum = weights.sum(axis=1, keepdims=True)
    row_sum[row_sum <= 1e-9] = 1.0
    weights /= row_sum
    return bones, verts, weights, channels, morph_src


def _junction_mask(our_verts: np.ndarray, meta: dict) -> np.ndarray:
    """Per-vertex smoothing strength in [0,1] for the junction bands
    (code-defined, from Step-1 metadata): limb roots (shoulder/hip), limb tips
    (wrist/ankle — where the hand/foot shell welds into the limb), and the
    head-neck band. SOFT falloff (smoothstep 1 -> 0 toward each band edge) so
    the Laplacian smoothing leaves no gradient kink at the band boundary —
    a hard mask concentrates the whole weight gradient on the boundary ring
    and a 60° arm pose then stretches those edges past 2x rest length."""

    def band(centers: np.ndarray, radius: float) -> np.ndarray:
        d = np.linalg.norm(our_verts - centers[None, :], axis=1)
        t = np.clip(1.0 - d / max(radius, 1e-9), 0.0, 1.0)
        return t * t * (3.0 - 2.0 * t)  # smoothstep(0, radius, radius - d)

    strength = np.zeros(len(our_verts))
    for j in meta["junctions"]:
        a = np.array(j["a"])
        b = np.array(j["b"])
        r0, r1, k = float(j["r0"]), float(j["r1"]), float(j["k"])
        strength = np.maximum(strength, band(a, 3.6 * r0 + 2.0 * k))
        strength = np.maximum(strength, band(b, 2.4 * r1 + 2.0 * k))
    # head <-> torso (neck/chin) band
    hc = np.asarray(meta["head_center"], dtype=np.float64)
    hr = float(meta["head_r"])
    head_bottom = hc - np.array([0.0, hr, 0.0])
    strength = np.maximum(strength, band(head_bottom, hr * 0.8))
    return strength


def nonmanifold_edge_count(obj: bpy.types.Object) -> int:
    """Count non-manifold edges (STOP-condition check for the boolean weld)."""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.mesh.select_non_manifold()
    bm = bmesh.from_edit_mesh(obj.data)
    n = sum(1 for e in bm.edges if e.select)
    bpy.ops.object.mode_set(mode="OBJECT")
    return n


def _smooth(values: np.ndarray, edges: np.ndarray, strength: np.ndarray, iters: int) -> np.ndarray:
    """Laplacian (self+neighbour mean) smoothing, per-vertex lerped by the
    soft junction strength (0 = untouched, 1 = full umbrella average)."""
    v = values.astype(np.float64).copy()
    n = v.shape[0]
    s = strength[:, None]
    for _ in range(iters):
        acc = v.copy()
        cnt = np.ones(n)
        np.add.at(acc, edges[:, 0], v[edges[:, 1]])
        np.add.at(acc, edges[:, 1], v[edges[:, 0]])
        np.add.at(cnt, edges[:, 0], 1.0)
        np.add.at(cnt, edges[:, 1], 1.0)
        mean = acc / cnt[:, None]
        v = v * (1.0 - s) + mean * s
    return v


def _mesh_edges(obj: bpy.types.Object) -> np.ndarray:
    ne = len(obj.data.edges)
    ed = np.empty(ne * 2, dtype=np.int64)
    obj.data.edges.foreach_get("vertices", ed)
    return ed.reshape(-1, 2)


def weld_body(shells: list[Shell], meta: dict, skel: dict, arm: bpy.types.Object):
    """Weld the body shells into one skinned manifold.

    Returns (welded_object, morph_keys, junction_vert_count). morph_keys is a
    name -> (nverts,3) dict of our-Y-up offsets ready for add_shape_keys.
    """
    u = skel["uniformScale"]
    welded = _boolean_union(shells)
    nm = nonmanifold_edge_count(welded)
    assert nm == 0, f"welded body is non-manifold ({nm} edges) — STOP condition"

    # source object (UV loops) + numpy source per-vertex data
    src_obj, _offsets = blender_io.build_object("body_src", shells)
    _transfer_uvs(welded, src_obj)

    bones, src_verts, src_w, src_c, morph_src = _source_arrays(shells, meta, u)

    nw = len(welded.data.vertices)
    co = np.empty(nw * 3)
    welded.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)  # blender space
    our = _blender_to_our(co)

    # nearest source vertex per welded vertex
    kd = kdtree.KDTree(len(src_verts))
    for i, p in enumerate(src_verts):
        kd.insert(Vector((float(p[0]), float(p[1]), float(p[2]))), i)
    kd.balance()
    nearest = np.empty(nw, dtype=np.int64)
    for i in range(nw):
        _, idx, _ = kd.find(Vector((float(our[i, 0]), float(our[i, 1]), float(our[i, 2]))))
        nearest[i] = idx

    W = src_w[nearest]
    C = src_c[nearest]
    morph = {name: arr[nearest] for name, arr in morph_src.items()}

    # junction smoothing
    strength = _junction_mask(our, meta)
    edges = _mesh_edges(welded)
    W = _smooth(W, edges, strength, iters=48)
    for name in morph:
        morph[name] = _smooth(morph[name], edges, strength, iters=40)
    co = _smooth(co, edges, strength, iters=4)  # geometric fillet on the boolean seam

    # write smoothed positions
    welded.data.vertices.foreach_set("co", co.reshape(-1))
    welded.data.update()

    # renormalize weights
    rs = W.sum(axis=1, keepdims=True)
    rs[rs <= 1e-9] = 1.0
    W /= rs

    # vertex groups
    for vg in list(welded.vertex_groups):
        welded.vertex_groups.remove(vg)
    for bi, bone in enumerate(bones):
        col = W[:, bi]
        nz = np.nonzero(col > 1e-4)[0]
        if len(nz) == 0:
            continue
        vg = welded.vertex_groups.new(name=bone)
        for vi in nz:
            vg.add([int(vi)], float(col[vi]), "REPLACE")

    # armature
    mod = welded.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    welded.parent = arm

    # smooth shading + preview materials (dominant channel per face)
    smooth = [True] * len(welded.data.polygons)
    welded.data.polygons.foreach_set("use_smooth", smooth)
    mats = blender_io._ensure_preview_materials()
    for m in mats:
        welded.data.materials.append(m)
    for poly in welded.data.polygons:
        mean = C[list(poly.vertices)].mean(axis=0)
        poly.material_index = int(np.argmax(mean)) if mean.max() > 0.4 else 0

    bpy.data.objects.remove(src_obj, do_unlink=True)

    # our-space morph offsets for add_shape_keys
    morph_keys = {name: morph[name] for name in morph}
    return welded, morph_keys, int((strength > 0.05).sum())


def welded_region_ids(welded: bpy.types.Object, shells: list[Shell], skel: dict) -> list[int]:
    """Per-face hide-region ids on the welded mesh (plan 008 body-hide submeshes),
    classified by nearest source shell + joint y (mirrors gen_assets.body_region_ids
    but position-based, since shell identity is gone after the weld)."""
    j = bodies.joints(skel)
    spine_y = j["spine"][1]
    knee_y = j["lowerLegL"][1]

    # nearest-shell lookup over source verts
    src_pts: list[np.ndarray] = []
    src_shell: list[str] = []
    for s in shells:
        for p in s.verts:
            src_pts.append(p)
            src_shell.append(s.name)
    kd = kdtree.KDTree(len(src_pts))
    for i, p in enumerate(src_pts):
        kd.insert(Vector((float(p[0]), float(p[1]), float(p[2]))), i)
    kd.balance()

    mesh = welded.data
    ids: list[int] = []
    for poly in mesh.polygons:
        idxs = list(poly.vertices)
        c = np.mean([mesh.vertices[i].co for i in idxs], axis=0)  # blender space
        our = (float(c[0]), float(c[2]), float(-c[1]))
        _, ni, _ = kd.find(Vector(our))
        name = src_shell[ni]
        cy = our[1]
        if name == "torso":
            ids.append(1 if cy >= spine_y else 2)
        elif name in ("legL", "legR"):
            ids.append(3 if cy >= knee_y else 0)
        else:
            ids.append(0)
    return ids
