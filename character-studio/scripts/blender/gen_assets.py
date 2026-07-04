# Anatomy asset generator (plan 006) — headless Blender entry point.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python \
#       scripts/blender/gen_assets.py -- [--only id1,id2] [--no-render]
#
# Reads scripts/blender/build/skeleton.json (regenerate with
# `pnpm gen:skeleton-json` after any canonical.ts/archetypes.ts change),
# authors the three archetype bodies + the anatomy part library, writes:
#   src/assets/anatomy/body-<archetype>.glb
#   src/assets/anatomy/parts/<part>.glb
#   src/assets/anatomy/textures/{body-*,part-*}.mask.png
#   <scratch>/plan006/blender/<asset>-{front,three-quarter,side,back}.png

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
import numpy as np

import blender_io
import bodies
import parts as parts_mod
from meshkit import rasterize_mask, write_png

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STUDIO_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", ".."))
ASSET_DIR = os.path.join(STUDIO_DIR, "src", "assets", "anatomy")
TEX_DIR = os.path.join(ASSET_DIR, "textures")
PREVIEW_DIR = os.environ.get(
    "PLAN006_PREVIEW_DIR",
    os.path.join(STUDIO_DIR, "scripts", "blender", "build", "previews"),
)

TRI_BUDGET_BODY = 18000
TRI_BUDGET_PART = 2500


def tri_count(objects) -> int:
    total = 0
    for obj in objects:
        if obj.type != "MESH":
            continue
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def body_region_ids(shells, skel: dict) -> list[int]:
    """Per-face hide-region ids (plan 008 body-hide submeshes): 1 = torso
    (torso shell at/above the spine joint), 2 = hips (torso shell below it),
    3 = upperLegs (leg shells above the knee). 0 = never hidden."""
    j = bodies.joints(skel)
    spine_y = j["spine"][1]
    knee_y = j["lowerLegL"][1]
    ids: list[int] = []
    for shell in shells:
        if shell.name == "torso":
            for f in shell.faces:
                cy = float(np.mean(shell.verts[list(f), 1]))
                ids.append(1 if cy >= spine_y else 2)
        elif shell.name in ("legL", "legR"):
            for f in shell.faces:
                cy = float(np.mean(shell.verts[list(f), 1]))
                ids.append(3 if cy >= knee_y else 0)
        else:
            ids.extend([0] * len(shell.faces))
    return ids


def build_body(archetype: str, skel: dict, render: bool) -> None:
    blender_io.clean_scene()
    arm = blender_io.build_armature(f"rig", skel)
    shells, meta = bodies.build_body_shells(archetype, skel)
    obj, offsets = blender_io.build_object("body", shells)
    blender_io.skin_object(obj, arm, shells, offsets)
    keys = bodies.body_shape_keys(shells, meta, skel["uniformScale"])
    blender_io.add_shape_keys(obj, keys)

    # plan 008 cross-plan fix: split hideable regions into tagged submeshes
    # (same shells, same silhouette; boundary verts duplicate at the seams —
    # custom normals keep shading continuous).
    regions = blender_io.split_object_by_face_regions(
        obj, body_region_ids(shells, skel), {1: "torso", 2: "hips", 3: "upperLegs"}
    )
    body_objects = [obj, *regions.values()]

    tris = tri_count(body_objects)
    assert tris <= TRI_BUDGET_BODY, f"{archetype} body {tris} tris > {TRI_BUDGET_BODY}"

    mask = rasterize_mask(shells, size=1024, blur=3)
    write_png(os.path.join(TEX_DIR, f"body-{archetype}.mask.png"), mask)

    glb = os.path.join(ASSET_DIR, f"body-{archetype}.glb")
    blender_io.export_glb(glb, [arm, *body_objects])
    print(f"[body {archetype}] {tris} tris -> {glb} ({os.path.getsize(glb) // 1024} KB)")

    if render:
        height = skel["height"]
        blender_io.render_turntable(
            os.path.join(PREVIEW_DIR, f"body-{archetype}"), center_z=height * 0.52, radius=height * 2.2
        )


def build_part(part_id: str, skel_ref: dict, render: bool) -> None:
    blender_io.clean_scene()
    builder = parts_mod.PART_BUILDERS[part_id]
    results = builder(skel_ref)

    skinned = any(attach is None for _, _, attach, _ in results)
    arm = blender_io.build_armature("rig", skel_ref) if skinned else None

    export_objects = []
    all_shells = []
    for obj_name, shells, attach, keys in results:
        all_shells.extend(shells)
        if attach is not None:
            # rigid: re-express verts relative to the attach bone rest position
            attach_pos = parts_mod.joints(skel_ref)[attach]
            for s in shells:
                s.verts = s.verts - attach_pos[None, :]
        obj, offsets = blender_io.build_object(obj_name, shells)
        if attach is None:
            blender_io.skin_object(obj, arm, shells, offsets)
        else:
            obj["attachBone"] = attach
        if keys:
            blender_io.add_shape_keys(obj, keys)
        export_objects.append(obj)

    tris = tri_count(export_objects)
    assert tris <= TRI_BUDGET_PART, f"{part_id} {tris} tris > {TRI_BUDGET_PART}"

    mask = rasterize_mask(all_shells, size=256, blur=2)
    write_png(os.path.join(TEX_DIR, f"part-{part_id}.mask.png"), mask)

    glb = os.path.join(ASSET_DIR, "parts", f"{part_id}.glb")
    exports = ([arm] if arm else []) + export_objects
    blender_io.export_glb(glb, exports)
    print(f"[part {part_id}] {tris} tris -> {glb} ({os.path.getsize(glb) // 1024} KB)")

    if render:
        # frame the part around its bounds (our coords -> blender: x, -z, y)
        vs = np.concatenate([s.verts for s in all_shells])
        center = (vs.max(axis=0) + vs.min(axis=0)) / 2
        size = float(np.linalg.norm(vs.max(axis=0) - vs.min(axis=0)))
        if arm:
            arm.hide_render = True
        blender_io.render_turntable(
            os.path.join(PREVIEW_DIR, f"part-{part_id}"),
            center_z=float(center[1]),
            radius=max(size * 2.6, 0.45),
            center_xy=(float(center[0]), float(-center[2])),
        )


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

    os.makedirs(TEX_DIR, exist_ok=True)
    os.makedirs(os.path.join(ASSET_DIR, "parts"), exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)

    for archetype in ("biped-round", "biped-slim", "bird"):
        name = f"body-{archetype}"
        if only and name not in only:
            continue
        build_body(archetype, skel_data["archetypes"][archetype], render)

    for part_id in parts_mod.PART_BUILDERS:
        if only and part_id not in only:
            continue
        build_part(part_id, skel_data["reference"], render)

    print("done")


main()
