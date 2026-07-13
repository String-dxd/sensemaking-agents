# Blender-side assembly/export for the anatomy assets (plan 006).
# Everything Blender-API-specific lives here; geometry math lives in meshkit.

from __future__ import annotations

import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

from meshkit import Shell, shell_loop_uvs

# Preview material colors = the studio DEFAULT_PALETTE (defaults.ts) so
# Blender turntables approximate the in-studio recolor.
PREVIEW_COLORS = {
    0: ("primary", (0.909, 0.631, 0.361, 1.0)),
    1: ("secondary", (0.941, 0.690, 0.416, 1.0)),
    2: ("belly", (0.992, 0.945, 0.878, 1.0)),
    3: ("accentA", (0.541, 0.353, 0.204, 1.0)),
}


def clean_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build_armature(name: str, skel: dict) -> bpy.types.Object:
    """Armature from skeleton.json — bone heads at rest positions, ALL bones
    pointing +Y with zero roll so glTF exports identity rest rotations
    (canonical.ts contract). Bone names are byte-identical to BONE_NAMES."""
    arm_data = bpy.data.armatures.new(name)
    arm_obj = bpy.data.objects.new(name, arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = arm_data.edit_bones
    for bone in skel["bones"]:
        eb = edit_bones.new(bone["name"])
        # Blender is Z-up; our data is Y-up. glTF export (+Y up) converts
        # back, so author in Blender coords: (x, y, z)_ours -> (x, -z, y)_blender.
        hx, hy, hz = bone["head"]
        eb.head = Vector((hx, -hz, hy))
        eb.tail = eb.head + Vector((0.0, 0.0, 0.035))  # +Z blender == +Y ours
        eb.roll = 0.0
        if bone["parent"]:
            eb.parent = edit_bones[bone["parent"]]
            eb.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def add_extra_bones(arm: bpy.types.Object, bones: list[tuple[str, str, "np.ndarray"]]) -> None:
    """Append item-internal bones (plan 008 wardrobe spring chains) to an
    already-built armature: (name, parent, head-in-our-Y-up-space). Same
    conventions as build_armature (+Y tails, zero roll, identity rest)."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = arm.data.edit_bones
    for name, parent, head in bones:
        eb = edit_bones.new(name)
        hx, hy, hz = (float(v) for v in head)
        eb.head = Vector((hx, -hz, hy))
        eb.tail = eb.head + Vector((0.0, 0.0, 0.03))
        eb.roll = 0.0
        eb.parent = edit_bones[parent]
        eb.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")


def _ensure_preview_materials() -> list[bpy.types.Material]:
    mats = []
    for idx in sorted(PREVIEW_COLORS):
        name, color = PREVIEW_COLORS[idx]
        mat = bpy.data.materials.get(f"preview-{name}")
        if mat is None:
            mat = bpy.data.materials.new(f"preview-{name}")
            mat.use_nodes = True
            bsdf = mat.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                bsdf.inputs["Base Color"].default_value = color
                bsdf.inputs["Roughness"].default_value = 0.9
            mat.diffuse_color = color
        mats.append(mat)
    return mats


def build_object(name: str, shells: list[Shell]) -> tuple[bpy.types.Object, list[int]]:
    """One mesh object from shells (concatenated). Returns (object, per-shell
    vertex offsets). Y-up -> Blender Z-up conversion happens here."""
    verts: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    offsets: list[int] = []
    for shell in shells:
        offsets.append(len(verts))
        base = len(verts)
        verts.extend((float(x), float(-z), float(y)) for x, y, z in shell.verts)
        faces.extend(tuple(base + i for i in f) for f in shell.faces)

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    # UVs
    uv_layer = mesh.uv_layers.new(name="UVMap")
    loop_i = 0
    for shell in shells:
        for corners in shell_loop_uvs(shell):
            for uv in corners:
                uv_layer.data[loop_i].uv = uv
                loop_i += 1

    # smooth shading
    smooth = [True] * len(mesh.polygons)
    mesh.polygons.foreach_set("use_smooth", smooth)

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    # preview materials by dominant mask channel per face
    mats = _ensure_preview_materials()
    for mat in mats:
        obj.data.materials.append(mat)
    poly_i = 0
    for shell in shells:
        ch = shell.channels
        for f in shell.faces:
            if ch is None:
                idx = 0
            else:
                mean = ch[list(f)].mean(axis=0)
                idx = int(np.argmax(mean)) if mean.max() > 0.4 else 0
            mesh.polygons[poly_i].material_index = idx
            poly_i += 1

    return obj, offsets


def skin_object(obj: bpy.types.Object, arm: bpy.types.Object, shells: list[Shell], offsets: list[int]) -> None:
    """Vertex groups from shell weights (normalized), armature modifier."""
    groups: dict[str, bpy.types.VertexGroup] = {}
    nverts = len(obj.data.vertices)
    acc: dict[str, np.ndarray] = {}
    total = np.zeros(nverts, dtype=np.float64)
    for shell, off in zip(shells, offsets):
        for bone, w in shell.weights.items():
            arr = acc.setdefault(bone, np.zeros(nverts, dtype=np.float64))
            arr[off : off + len(w)] += w
            total[off : off + len(w)] += w
    total[total <= 1e-9] = 1.0
    for bone, arr in acc.items():
        arr /= total
        vg = groups.get(bone) or obj.vertex_groups.new(name=bone)
        groups[bone] = vg
        for vi in np.nonzero(arr > 1e-4)[0]:
            vg.add([int(vi)], float(arr[vi]), "REPLACE")
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    obj.parent = arm


def split_object_by_face_regions(
    obj: bpy.types.Object,
    region_ids: list[int],
    region_names: dict[int, str],
) -> dict[str, bpy.types.Object]:
    """Split faces with region id != 0 into per-region objects (plan 008
    body-hide submeshes). `region_ids` is per-polygon in the object's current
    polygon order; `region_names` maps id -> region name (0 = stay on `obj`).

    Vertex groups, shape keys, UVs, materials and the armature modifier are
    preserved by Blender's separate operator. Current smooth vertex normals
    are baked as custom split normals FIRST so the duplicated boundary ring
    does not create a shading seam. Each new object is named
    `<obj>_<region>` and tagged with a `bodyRegion` custom property (exports
    as a glTF extra the dressing pass reads).
    """
    mesh = obj.data
    assert len(region_ids) == len(mesh.polygons), "region_ids must be per-polygon"

    # continuous shading across the split boundary
    normals = [v.normal.copy() for v in mesh.vertices]
    mesh.normals_split_custom_set_from_vertices(normals)

    # face attribute survives polygon reindexing during separation
    attr = mesh.attributes.new(name="bodyRegionId", type="INT", domain="FACE")
    attr.data.foreach_set("value", region_ids)

    out: dict[str, bpy.types.Object] = {}
    base_name = obj.name
    for rid, region in region_names.items():
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.context.tool_settings.mesh_select_mode = (False, False, True)
        bm = bmesh.from_edit_mesh(obj.data)
        layer = bm.faces.layers.int["bodyRegionId"]
        count = 0
        for f in bm.faces:
            sel = f[layer] == rid
            f.select_set(sel)
            count += int(sel)
        bmesh.update_edit_mesh(obj.data)
        assert count > 0, f"region {region}: no faces matched"
        before = set(bpy.data.objects)
        bpy.ops.mesh.separate(type="SELECTED")
        bpy.ops.object.mode_set(mode="OBJECT")
        new_obj = next(o for o in bpy.data.objects if o not in before)
        new_obj.name = f"{base_name}_{region}"
        new_obj.data.name = new_obj.name
        new_obj["bodyRegion"] = region
        out[region] = new_obj

    for o in [obj, *out.values()]:
        layer_attr = o.data.attributes.get("bodyRegionId")
        if layer_attr is not None:
            o.data.attributes.remove(layer_attr)
    return out


def add_shape_keys(obj: bpy.types.Object, keys: dict[str, np.ndarray]) -> None:
    """keys: name -> (nverts, 3) OFFSETS in our Y-up space."""
    obj.shape_key_add(name="Basis")
    base = np.empty(len(obj.data.vertices) * 3, dtype=np.float64)
    obj.data.vertices.foreach_get("co", base)
    base = base.reshape(-1, 3)
    for name, offsets in keys.items():
        kb = obj.shape_key_add(name=name)
        blender_offsets = np.stack([offsets[:, 0], -offsets[:, 2], offsets[:, 1]], axis=1)
        co = base + blender_offsets
        kb.data.foreach_set("co", co.reshape(-1).astype(np.float32))
        # exported as the glTF mesh's default morph weight — MUST be 0 or
        # every consumer renders all morphs fully on (plan 008 gate finding:
        # the belly occluded dressed garments because bellyRound+chubby+slim
        # shipped at weight 1). assemble.ts also zeroes influences on load,
        # so already-committed GLBs render correctly without regeneration.
        kb.value = 0.0


def export_glb(path: str, objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    kwargs = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=False,
        export_skins=True,
        export_morph=True,
        export_morph_normal=True,
        export_extras=True,
        export_yup=True,
        export_def_bones=False,
        export_lights=False,
        export_cameras=False,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
    )
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in kwargs.items() if k in props})


def render_turntable(path_prefix: str, center_z: float, radius: float, res: int = 768, center_xy: tuple[float, float] = (0.0, 0.0)) -> list[str]:
    """Workbench studio renders from front / 3-4 / side / back."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    scene.world.color = (0.72, 0.72, 0.76)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 65
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    out: list[str] = []
    # our-forward +Z is Blender -Y; front view looks along +Y from -Y
    cx, cy = center_xy
    for label, yaw_deg in (("front", 0), ("three-quarter", 40), ("side", 90), ("back", 180)):
        yaw = math.radians(yaw_deg)
        cam.location = (cx + radius * math.sin(yaw), cy - radius * math.cos(yaw), center_z + radius * 0.18)
        direction = Vector((cx, cy, center_z)) - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = f"{path_prefix}-{label}.png"
        bpy.ops.render.render(write_still=True)
        out.append(scene.render.filepath)
    return out
