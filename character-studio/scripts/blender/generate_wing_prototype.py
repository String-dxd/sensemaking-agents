"""Generate clean, species-specific authored bird wings.

The wing is a closed longitudinal quad grid. Raptor feather divisions only
change the terminal silhouette; interior feather rows are deformation-safe
RGBA palette weights exported as glTF COLOR_0.
"""

from __future__ import annotations

import json
import math
import os
import sys
from dataclasses import dataclass

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(__file__))
from blender_io import build_armature, clean_scene, export_glb, render_turntable

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
SKEL = os.path.join(ROOT, "scripts/blender/build/skeleton.json")
U_SEGMENTS = 16
# Fourteen span lanes put the raptor tips at +/-5/7 and valleys at +/-2/7,
# preserving three explicit fused feathers through Catmull-Clark smoothing.
V_SEGMENTS = 14

def _clamp01(value: float) -> float:
    return min(1.0, max(0.0, value))


def _smoothstep(value: float) -> float:
    value = _clamp01(value)
    return value * value * (3.0 - 2.0 * value)


def _profile(points: tuple[tuple[float, float], ...], value: float) -> float:
    if value <= points[0][0]:
        return points[0][1]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if value <= x1:
            amount = _smoothstep((value - x0) / (x1 - x0))
            return y0 + (y1 - y0) * amount
    return points[-1][1]


def _terminal_profile(points: tuple[tuple[float, float], ...], v: float) -> float:
    return _profile(points, v)


def _symmetric_width(root: float, maximum: float, peak: float, tip: float) -> tuple[tuple[float, float], ...]:
    return (
        (0.0, root),
        (0.24, root * 1.10),
        (peak - 0.16, maximum * 0.78),
        (peak, maximum),
        (0.84, maximum * 0.92),
        (1.0, tip),
    )


def _round_terminal(point: float) -> tuple[tuple[float, float], ...]:
    return (
        (-1.0, 1.0),
        (-0.72, 1.0 + point * 0.10),
        (-0.38, 1.0 + point * 0.62),
        (0.0, 1.0 + point),
        (0.38, 1.0 + point * 0.62),
        (0.72, 1.0 + point * 0.10),
        (1.0, 1.0),
    )


@dataclass(frozen=True)
class WingDesign:
    key: str
    root_center: tuple[float, float]
    length: float
    angle_deg: float
    upper_width: tuple[tuple[float, float], ...]
    lower_width: tuple[tuple[float, float], ...]
    terminal: tuple[tuple[float, float], ...]
    terminal_start: float
    curve: float
    root_round: float
    max_front_depth: float
    max_back_depth: float
    edge_depth: float
    band_zones: tuple[tuple[float, int], ...]
    color: tuple[float, float, float, float]


EAGLE_UPPER = (
    (0.00, 0.050), (0.15, 0.057), (0.36, 0.064), (0.57, 0.069),
    (0.70, 0.084), (0.86, 0.103), (1.00, 0.098),
)
EAGLE_LOWER = (
    (0.00, 0.050), (0.21, 0.060), (0.44, 0.074), (0.67, 0.090),
    (0.86, 0.104), (1.00, 0.098),
)
EAGLE_TERMINAL = (
    (-1.000, 1.050), (-0.714, 1.180), (-0.286, 1.120),
    (0.000, 1.220), (0.286, 1.160), (0.714, 1.255), (1.000, 1.050),
)

OWL_UPPER = (
    (0.00, 0.052), (0.14, 0.064), (0.34, 0.072), (0.52, 0.078),
    (0.68, 0.090), (0.84, 0.110), (1.00, 0.106),
)
OWL_LOWER = (
    (0.00, 0.052), (0.20, 0.064), (0.44, 0.078), (0.66, 0.094),
    (0.86, 0.108), (1.00, 0.094),
)
OWL_TERMINAL = (
    (-1.000, 1.030), (-0.714, 1.180), (-0.286, 1.085),
    (0.000, 1.190), (0.286, 1.100), (0.714, 1.200), (1.000, 1.000),
)


def _paddle_design(
    key: str,
    length: float,
    root_width: float,
    max_width: float,
    tip_point: float,
    depths: tuple[float, float, float],
    angle: float,
    peak: float,
    color: tuple[float, float, float, float],
    bands: tuple[tuple[float, int], ...],
) -> WingDesign:
    tip_width = max(root_width * 0.78, max_width * (0.50 if key == "penguin" else 0.66))
    widths = _symmetric_width(root_width, max_width, peak, tip_width)
    return WingDesign(
        key=key,
        root_center=(0.080, 0.535),
        length=length,
        angle_deg=angle,
        upper_width=widths,
        lower_width=widths,
        # `tip_point` is authored in reference-space metres; the terminal
        # profile is longitudinal and therefore normalized by wing length.
        terminal=_round_terminal(tip_point / length),
        terminal_start=0.68,
        curve=0.004 if key != "penguin" else 0.012,
        root_round=0.050,
        max_front_depth=depths[0],
        max_back_depth=depths[1],
        edge_depth=depths[2],
        band_zones=bands,
        color=color,
    )


DESIGNS = (
    WingDesign(
        key="eagle", root_center=(0.080, 0.535), length=0.300, angle_deg=68.0,
        upper_width=EAGLE_UPPER, lower_width=EAGLE_LOWER,
        terminal=EAGLE_TERMINAL, terminal_start=0.62, curve=0.014, root_round=0.050,
        max_front_depth=0.028, max_back_depth=0.018, edge_depth=0.0065,
        band_zones=((0.014, 3), (0.030, 2), (0.047, 1), (0.061, 2), (999.0, 0)),
        color=(0.30, 0.21, 0.16, 1.0),
    ),
    WingDesign(
        key="owl", root_center=(0.080, 0.535), length=0.270, angle_deg=64.0,
        upper_width=OWL_UPPER, lower_width=OWL_LOWER,
        terminal=OWL_TERMINAL, terminal_start=0.58, curve=0.007, root_round=0.050,
        max_front_depth=0.029, max_back_depth=0.019, edge_depth=0.0065,
        band_zones=((0.014, 3), (0.030, 2), (0.047, 1), (0.064, 2), (999.0, 0)),
        color=(0.34, 0.24, 0.17, 1.0),
    ),
    _paddle_design(
        "robin", 0.235, 0.032, 0.050, 0.040, (0.018, 0.012, 0.0035), 67.0, 0.61,
        (0.39, 0.25, 0.19, 1.0), ((0.012, 3), (0.026, 2), (0.041, 1), (999.0, 0)),
    ),
    _paddle_design(
        "duck", 0.210, 0.044, 0.076, 0.014, (0.022, 0.015, 0.0045), 64.0, 0.58,
        (0.55, 0.47, 0.18, 1.0), ((0.014, 2), (0.030, 1), (999.0, 0)),
    ),
    _paddle_design(
        "chicken", 0.240, 0.048, 0.086, 0.012, (0.024, 0.016, 0.0050), 68.0, 0.60,
        (0.72, 0.68, 0.60, 1.0), ((0.015, 2), (0.032, 1), (999.0, 0)),
    ),
    _paddle_design(
        "peacock", 0.205, 0.034, 0.060, 0.018, (0.019, 0.013, 0.0040), 66.0, 0.60,
        (0.16, 0.32, 0.48, 1.0), ((0.011, 3), (0.023, 2), (0.036, 1), (0.049, 3), (999.0, 0)),
    ),
    _paddle_design(
        "bowerbird", 0.225, 0.034, 0.056, 0.028, (0.018, 0.012, 0.0035), 65.0, 0.60,
        (0.14, 0.31, 0.38, 1.0), ((0.012, 3), (0.026, 2), (0.040, 1), (999.0, 0)),
    ),
    _paddle_design(
        "penguin", 0.285, 0.028, 0.042, 0.032, (0.015, 0.010, 0.0030), 70.0, 0.56,
        (0.08, 0.10, 0.16, 1.0), ((0.013, 1), (999.0, 0)),
    ),
)


def _frame(design: WingDesign) -> tuple[tuple[float, float], tuple[float, float]]:
    angle = math.radians(design.angle_deg)
    return (math.cos(angle), -math.sin(angle)), (math.sin(angle), math.cos(angle))


def _local_point(design: WingDesign, u: float, v: float) -> tuple[float, float]:
    upper = _profile(design.upper_width, u)
    lower = _profile(design.lower_width, u)
    across = (v + 1.0) * 0.5
    width = -lower + (upper + lower) * across
    width += design.curve * math.sin(math.pi * u)

    terminal = _terminal_profile(design.terminal, v)
    terminal_blend = _smoothstep((u - design.terminal_start) / (1.0 - design.terminal_start))
    t = u + (terminal - 1.0) * terminal_blend
    t -= design.root_round * (1.0 - v * v) * (1.0 - _smoothstep(u / 0.18))
    return t, width


def _place(design: WingDesign, t: float, width: float) -> tuple[float, float]:
    axis, normal = _frame(design)
    return (
        design.root_center[0] + design.length * axis[0] * t + normal[0] * width,
        design.root_center[1] + design.length * axis[1] * t + normal[1] * width,
    )


def _pillow_depth(design: WingDesign, u: float, v: float, front: bool) -> float:
    span = max(0.0, math.cos(math.pi * v * 0.5)) ** 0.72
    body = max(0.0, math.sin(math.pi * u)) ** 0.68
    shoulder = 0.72 * (1.0 - _smoothstep(u / 0.22))
    tip = 0.55 * _smoothstep((u - 0.84) / 0.16)
    longitudinal = max(body, shoulder, tip)
    maximum = design.max_front_depth if front else design.max_back_depth
    depth = design.edge_depth + (maximum - design.edge_depth) * span * longitudinal
    return depth if front else -depth


def _forward_offset(u: float) -> float:
    """Place the wing at the torso's lateral tangent, behind the belly crown.

    The body should occlude the buried root and inner contour.  Only a shallow
    distal ramp remains so the palm clears the flank without moving onto the
    character's front surface.
    """
    return 0.024 + 0.014 * _smoothstep(u / 0.68)


def _outward_offset(u: float) -> float:
    """Move the whole root onto the flank, then add a small distal clearance."""
    return 0.025 + 0.007 * _smoothstep((u - 0.18) / 0.55)


def _build_wing(name: str, design: WingDesign) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    front: list[list[int]] = []
    back: list[list[int]] = []
    for front_side, grid in ((True, front), (False, back)):
        for ui in range(U_SEGMENTS + 1):
            u = ui / U_SEGMENTS
            row: list[int] = []
            for vi in range(V_SEGMENTS + 1):
                v = -1.0 + 2.0 * vi / V_SEGMENTS
                t, width = _local_point(design, u, v)
                x, z = _place(design, t, width)
                x += _outward_offset(u)
                row.append(len(vertices))
                depth = _forward_offset(u) + _pillow_depth(design, u, v, front_side)
                vertices.append((x, -depth, z))
            grid.append(row)

    faces: list[tuple[int, ...]] = []
    face_uvs: list[list[tuple[float, float]]] = []
    for grid, back_side in ((front, False), (back, True)):
        for ui in range(U_SEGMENTS):
            u0, u1 = ui / U_SEGMENTS, (ui + 1) / U_SEGMENTS
            for vi in range(V_SEGMENTS):
                v0, v1 = vi / V_SEGMENTS, (vi + 1) / V_SEGMENTS
                face = (grid[ui][vi], grid[ui + 1][vi], grid[ui + 1][vi + 1], grid[ui][vi + 1])
                if back_side:
                    face = tuple(reversed(face))
                    uvs = [(0.53 + u0 * 0.45, 0.02 + v1 * 0.76), (0.53 + u1 * 0.45, 0.02 + v1 * 0.76), (0.53 + u1 * 0.45, 0.02 + v0 * 0.76), (0.53 + u0 * 0.45, 0.02 + v0 * 0.76)]
                else:
                    uvs = [(0.02 + u0 * 0.45, 0.02 + v0 * 0.76), (0.02 + u1 * 0.45, 0.02 + v0 * 0.76), (0.02 + u1 * 0.45, 0.02 + v1 * 0.76), (0.02 + u0 * 0.45, 0.02 + v1 * 0.76)]
                faces.append(face)
                face_uvs.append(uvs)

    for vi in (0, V_SEGMENTS):
        x0 = 0.02 if vi == 0 else 0.53
        for ui in range(U_SEGMENTS):
            u0, u1 = ui / U_SEGMENTS, (ui + 1) / U_SEGMENTS
            faces.append((front[ui][vi], back[ui][vi], back[ui + 1][vi], front[ui + 1][vi]))
            face_uvs.append([(x0 + u0 * 0.45, 0.88), (x0 + u0 * 0.45, 0.82), (x0 + u1 * 0.45, 0.82), (x0 + u1 * 0.45, 0.88)])

    for ui in (0, U_SEGMENTS):
        x0 = 0.02 if ui == 0 else 0.53
        for vi in range(V_SEGMENTS):
            v0, v1 = vi / V_SEGMENTS, (vi + 1) / V_SEGMENTS
            faces.append((front[ui][vi + 1], back[ui][vi + 1], back[ui][vi], front[ui][vi]))
            face_uvs.append([(x0 + v1 * 0.45, 0.98), (x0 + v1 * 0.45, 0.92), (x0 + v0 * 0.45, 0.92), (x0 + v0 * 0.45, 0.98)])

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon, uvs in zip(mesh.polygons, face_uvs):
        for corner, loop_index in enumerate(polygon.loop_indices):
            uv_layer.data[loop_index].uv = uvs[corner]

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def _polish(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("surface-polish", "SUBSURF")
    modifier.subdivision_type = "CATMULL_CLARK"
    modifier.levels = 1
    modifier.render_levels = 1
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def _band_weights(distance: float, zones: tuple[tuple[float, int], ...], blend: float = 0.0025) -> tuple[float, float, float, float]:
    for index, (threshold, channel) in enumerate(zones[:-1]):
        if abs(distance - threshold) <= blend:
            following = zones[index + 1][1]
            amount = _smoothstep((distance - threshold + blend) / (blend * 2.0))
            weights = [0.0, 0.0, 0.0, 0.0]
            weights[channel] += 1.0 - amount
            weights[following] += amount
            return tuple(weights)
    for threshold, channel in zones:
        if distance <= threshold:
            weights = [0.0, 0.0, 0.0, 0.0]
            weights[channel] = 1.0
            return tuple(weights)
    return (1.0, 0.0, 0.0, 0.0)


def _terminal_samples(design: WingDesign) -> list[tuple[float, float]]:
    samples: list[tuple[float, float]] = []
    for index in range(193):
        v = -1.0 + 2.0 * index / 192
        t, width = _local_point(design, 1.0, v)
        x, z = _place(design, t, width)
        samples.append((x + _outward_offset(1.0), z))
    return samples


def _add_palette_channels(obj: bpy.types.Object, design: WingDesign) -> None:
    edge = _terminal_samples(design)
    axis, _ = _frame(design)
    colors = obj.data.color_attributes
    existing = colors.get("paletteChannels")
    if existing is not None:
        colors.remove(existing)
    attribute = colors.new(name="paletteChannels", type="FLOAT_COLOR", domain="POINT")
    for vertex in obj.data.vertices:
        x, blender_depth, z = vertex.co
        distance = min(math.hypot(x - ex, z - ez) for ex, ez in edge)
        pattern = _band_weights(distance, design.band_zones)
        local_x = x - design.root_center[0]
        local_z = z - design.root_center[1]
        u = _clamp01((local_x * axis[0] + local_z * axis[1]) / design.length)
        surface_depth = -blender_depth - _forward_offset(u)
        front_mix = _smoothstep((surface_depth + design.edge_depth) / (design.edge_depth * 2.0))
        weights = [pattern[index] * front_mix for index in range(4)]
        weights[0] += 1.0 - front_mix
        total = sum(weights)
        attribute.data[vertex.index].color = tuple(weight / total for weight in weights)
    colors.active_color_index = len(colors) - 1
    colors.render_color_index = len(colors) - 1


def _palette_material(design: WingDesign) -> bpy.types.Material:
    material = bpy.data.materials.new(f"wing-{design.key}-palette")
    material.diffuse_color = design.color
    material.roughness = 0.82
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Roughness"].default_value = 0.82
        vertex_color = nodes.new("ShaderNodeVertexColor")
        vertex_color.layer_name = "paletteChannels"
        links.new(vertex_color.outputs["Color"], bsdf.inputs["Base Color"])
        # Blender exports COLOR_0 as VEC4 only when alpha participates in the graph.
        links.new(vertex_color.outputs["Alpha"], bsdf.inputs["Alpha"])
    return material


def _mirror(source: bpy.types.Object, name: str) -> bpy.types.Object:
    mirrored = source.copy()
    mirrored.data = source.data.copy()
    mirrored.name = name
    mirrored.data.name = name
    for vertex in mirrored.data.vertices:
        vertex.co.x *= -1.0
    bm = bmesh.new()
    bm.from_mesh(mirrored.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mirrored.data)
    bm.free()
    bpy.context.collection.objects.link(mirrored)
    return mirrored


def _weight(obj: bpy.types.Object, design: WingDesign, side: str) -> None:
    groups = {bone: obj.vertex_groups.new(name=f"{bone}{side}") for bone in ("upperArm", "foreArm", "hand")}
    if design.key not in {"eagle", "owl"}:
        for vertex in obj.data.vertices:
            groups["upperArm"].add([vertex.index], 1.0, "REPLACE")
        return

    axis, _ = _frame(design)
    sign = 1.0 if side == "L" else -1.0
    for vertex in obj.data.vertices:
        x = vertex.co.x * sign - design.root_center[0]
        z = vertex.co.z - design.root_center[1]
        u = _clamp01((x * axis[0] + z * axis[1]) / design.length)
        upper_to_fore = _smoothstep((u - 0.20) / 0.24)
        fore_to_hand = _smoothstep((u - 0.50) / 0.24)
        weights = {
            "upperArm": 1.0 - upper_to_fore,
            "foreArm": upper_to_fore * (1.0 - fore_to_hand),
            "hand": fore_to_hand,
        }
        total = sum(weights.values())
        for bone, weight in weights.items():
            if weight > 1e-6:
                groups[bone].add([vertex.index], weight / total, "REPLACE")


def main() -> None:
    with open(SKEL, encoding="utf-8") as handle:
        skeleton = json.load(handle)
    for design in DESIGNS:
        clean_scene()
        armature = build_armature("WingRig", skeleton["reference"])
        stem = f"wing{design.key.title()}"
        left = _build_wing(f"{stem}L", design)
        _polish(left)
        _add_palette_channels(left, design)
        left.data.materials.append(_palette_material(design))
        right = _mirror(left, f"{stem}R")
        for obj, side in ((left, "L"), (right, "R")):
            _weight(obj, design, side)
            modifier = obj.modifiers.new("Armature", "ARMATURE")
            modifier.object = armature
            obj.parent = armature

        output = os.path.join(ROOT, f"src/assets/anatomy/parts/wing-{design.key}-authored.glb")
        source = os.path.join(ROOT, f"src/assets/anatomy/source/wing-{design.key}-authored.blend")
        preview = os.path.join(ROOT, f"scripts/blender/build/wing-{design.key}")
        os.makedirs(os.path.dirname(output), exist_ok=True)
        os.makedirs(os.path.dirname(source), exist_ok=True)
        export_glb(output, [armature, left, right])
        bpy.ops.wm.save_as_mainfile(filepath=source)
        render_turntable(preview, center_z=0.42, radius=1.25, res=640)


if __name__ == "__main__":
    main()
