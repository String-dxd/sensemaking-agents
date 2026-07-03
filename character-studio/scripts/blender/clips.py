# Animation clip authoring (plan 007) — headless Blender entry point.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python \
#       scripts/blender/clips.py -- [--only clipA,clipB] [--no-render]
#
# Authors the `core-v1` clip set on the CANONICAL skeleton at REFERENCE
# proportions (scripts/blender/build/skeleton.json -> "reference"; regenerate
# with `pnpm gen:skeleton-json`) and exports ONE animations-only GLB:
#
#   src/assets/clips/clips-core-v1.glb
#
# Contract highlights (plan 007 step 1 / plan 000 §2.2):
#   - clips are authored once on the shared skeleton; NO retargeting anywhere.
#     Rotations transfer to archetype-scaled skeletons as-is; only the hips
#     translation track is rescaled at load (see clipStateMachine.ts).
#   - spring-chain bones (earL/R.*, tail.*), sockets, jaw, breath scale and
#     face are NEVER keyed — springs/procedural layers own them. The glTF
#     exporter only emits channels for keyed bones, so the exported GLB is
#     clean by construction (test-enforced in test/core/motion/clips.test.ts).
#   - loop clips close exactly: every fcurve gets its first key repeated one
#     loop-length later and a CYCLES modifier, so sampled frame N == frame 0
#     and the auto handles become cycle-aware (tangent continuity).
#   - one-shot gestures end on the rest pose (all channels back to 0).
#
# Pose-space note (verified by export probe): every canonical bone rests with
# identity glTF rotation (+Y along bone, zero roll), so pose-bone axes align
# with glTF/world axes for EVERY bone:
#   rot X + : pitch forward/down (nod)      loc x + : character's +X (earL side)
#   rot Y + : yaw, +X side swings backward  loc y + : up
#   rot Z + : roll, +X side lifts           loc z + : forward (facing dir)
# The character faces +Z. Angles below are degrees, locations meters (deltas
# from rest — the exporter re-adds rest translations).

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import json

import bpy
import numpy as np

import blender_io
import bodies

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STUDIO_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", ".."))
CLIP_DIR = os.path.join(STUDIO_DIR, "src", "assets", "clips")
PREVIEW_DIR = os.environ.get(
    "PLAN007_PREVIEW_DIR",
    os.path.join(STUDIO_DIR, "scripts", "blender", "build", "previews-clips"),
)

FPS = 30

# ---------------------------------------------------------------------------
# keyframe helpers
# ---------------------------------------------------------------------------

ARM: bpy.types.Object | None = None


def action_fcurves(action: bpy.types.Action):
    for layer in action.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                yield from cb.fcurves


def reset_pose() -> None:
    for pb in ARM.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.location = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)


class Clip:
    """One action under authoring. `key` writes eased keyframes; `finish`
    closes loops (repeat-first-key + CYCLES modifier) or asserts gestures
    end at rest, then applies bezier/auto-clamped easing everywhere."""

    def __init__(self, name: str, frames: int, loop: bool):
        self.name = name
        self.frames = frames
        self.loop = loop
        reset_pose()
        self.action = bpy.data.actions.new(name)
        self.action.use_frame_range = True
        self.action.frame_start = 0
        self.action.frame_end = frames
        ARM.animation_data.action = self.action

    def key(self, bone: str, frame: float, rot=None, loc=None):
        pb = ARM.pose.bones[bone]
        if rot is not None:
            pb.rotation_euler = tuple(math.radians(a) for a in rot)
            pb.keyframe_insert("rotation_euler", frame=frame)
        if loc is not None:
            pb.location = loc
            pb.keyframe_insert("location", frame=frame)

    def finish(self):
        for fc in action_fcurves(self.action):
            points = sorted(fc.keyframe_points, key=lambda p: p.co[0])
            first = points[0]
            if self.loop:
                # Close the cycle: first key repeated one loop later (unless a
                # key already sits there), then cycle-aware extrapolation.
                t_close = first.co[0] + self.frames
                if abs(points[-1].co[0] - t_close) > 1e-4:
                    fc.keyframe_points.insert(t_close, first.co[1])
                else:
                    points[-1].co[1] = first.co[1]
                if not any(m.type == "CYCLES" for m in fc.modifiers):
                    fc.modifiers.new("CYCLES")
            fc.auto_smoothing = "CONT_ACCEL"
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"
                kp.handle_left_type = "AUTO_CLAMPED"
                kp.handle_right_type = "AUTO_CLAMPED"
            fc.update()
        ARM.animation_data.action = None
        reset_pose()
        return self.action


# ---------------------------------------------------------------------------
# choreography
# ---------------------------------------------------------------------------
# Overlapping action rule (plan 007 step 1): no two body parts start/stop on
# the same frame — spine leads, head follows +2, arms follow +1..3. The frame
# offsets below implement that deliberately.


def clip_idle() -> bpy.types.Action:
    """4-6 s loop: weight shifts + micro moves. Breath is procedural — the
    chest is only counter-swayed, never scaled."""
    c = Clip("idle", 150, loop=True)
    # weight shift: hips drift L -> R -> L with matching roll (slow, uneven)
    c.key("hips", 0, loc=(0.004, 0.0, 0.0), rot=(0, 0, -0.8))
    c.key("hips", 42, loc=(-0.007, -0.002, 0.0), rot=(0, 0, 1.2))
    c.key("hips", 96, loc=(0.008, 0.0, 0.0), rot=(0, 0, -1.6))
    c.key("hips", 126, loc=(0.005, -0.001, 0.0), rot=(0, 0, -1.0))
    # spine answers the shift a beat later, chest a beat after that
    c.key("spine", 2, rot=(0.5, 0.6, 0.5))
    c.key("spine", 46, rot=(0.9, -1.0, -0.8))
    c.key("spine", 99, rot=(0.4, 1.2, 1.0))
    c.key("chest", 5, rot=(0.3, 0.8, 0.4))
    c.key("chest", 49, rot=(0.6, -1.4, -0.7))
    c.key("chest", 103, rot=(0.2, 1.5, 0.8))
    # head: settled micro tilts/turns (procedural gaze/blink live on top)
    c.key("head", 8, rot=(0.5, 1.0, 0.4))
    c.key("head", 34, rot=(-0.8, 2.6, 1.6))
    c.key("head", 62, rot=(0.6, -1.2, -0.6))
    c.key("head", 106, rot=(-0.4, -2.8, 0.8))
    c.key("head", 132, rot=(0.3, 0.6, 0.2))
    c.key("neck", 10, rot=(0.3, 0.5, 0.2))
    c.key("neck", 64, rot=(0.4, -0.8, -0.3))
    c.key("neck", 108, rot=(-0.2, -1.2, 0.4))
    # hand/arm micro-moves: slow forearm drift, one tiny shoulder adjust
    c.key("foreArmL", 18, rot=(0, -2.0, 1.0))
    c.key("foreArmL", 74, rot=(0, 3.0, -1.5))
    c.key("foreArmL", 128, rot=(0, -1.0, 0.5))
    c.key("foreArmR", 26, rot=(0, 2.4, -1.2))
    c.key("foreArmR", 88, rot=(0, -2.6, 1.4))
    c.key("handL", 21, rot=(0, -1.5, 1.0))
    c.key("handL", 77, rot=(0, 2.0, -1.2))
    c.key("handR", 30, rot=(0, 1.8, -0.8))
    c.key("handR", 92, rot=(0, -2.0, 1.0))
    c.key("shoulderL", 72, rot=(0, 0, 0.0))
    c.key("shoulderL", 80, rot=(0, 0, 2.2))
    c.key("shoulderL", 92, rot=(0, 0, 0.0))
    return c.finish()


def _walk_like(name: str, frames: int, *, swing: float, knee: float, bounce: float,
               sway: float, yaw: float, lean: float, arm_swing: float,
               elbow: float, foot_roll: float) -> bpy.types.Action:
    """Shared two-step gait builder. L contact at 0, R contact at frames/2.
    AC-style: exaggerated vertical bounce, torso counter-rotation, head
    stabilized. All *_R channels are the L channels phase-shifted by half."""
    c = Clip(name, frames, loop=True)
    half = frames / 2

    def cyc(f: float) -> float:
        return f % frames

    # --- legs. +X rotation moves the foot backward; contact pose has the leg
    # swung forward (negative X).
    def leg(side: str, phase: float):
        u, lo, ft, to = f"upperLeg{side}", f"lowerLeg{side}", f"foot{side}", f"toes{side}"
        # contact -> loading -> mid-stance -> toe-off -> swing tuck -> reach
        c.key(u, cyc(0 + phase), rot=(-swing, 0, 0))
        c.key(u, cyc(half * 0.47 + phase), rot=(-swing * 0.1, 0, 0))
        c.key(u, cyc(half + phase), rot=(swing * 0.92, 0, 0))
        c.key(u, cyc(half * 1.5 + phase), rot=(swing * 0.35, 0, 0))
        c.key(u, cyc(half * 1.78 + phase), rot=(-swing * 1.12, 0, 0))  # reach overshoot
        # knee: soft at strike, loaded in early stance, folded through swing
        c.key(lo, cyc(0 + phase), rot=(knee * 0.15, 0, 0))
        c.key(lo, cyc(half * 0.25 + phase), rot=(knee * 0.32, 0, 0))
        c.key(lo, cyc(half * 0.65 + phase), rot=(knee * 0.10, 0, 0))
        c.key(lo, cyc(half + phase), rot=(knee * 0.35, 0, 0))
        c.key(lo, cyc(half * 1.42 + phase), rot=(knee, 0, 0))
        c.key(lo, cyc(half * 1.85 + phase), rot=(knee * 0.12, 0, 0))
        # foot roll: heel strike (toes up) -> flat -> heel lift -> toe-off
        c.key(ft, cyc(0 + phase), rot=(-foot_roll * 0.55, 0, 0))
        c.key(ft, cyc(half * 0.35 + phase), rot=(0, 0, 0))
        c.key(ft, cyc(half * 0.85 + phase), rot=(foot_roll * 0.5, 0, 0))
        c.key(ft, cyc(half + phase), rot=(foot_roll, 0, 0))
        c.key(ft, cyc(half * 1.4 + phase), rot=(foot_roll * 0.2, 0, 0))
        c.key(ft, cyc(half * 1.8 + phase), rot=(-foot_roll * 0.6, 0, 0))
        # toes bend up as the heel rises, flick at toe-off
        c.key(to, cyc(half * 0.8 + phase), rot=(-foot_roll * 0.8, 0, 0))
        c.key(to, cyc(half + phase), rot=(-foot_roll * 1.1, 0, 0))
        c.key(to, cyc(half * 1.3 + phase), rot=(0, 0, 0))

    leg("L", 0)
    leg("R", half)

    # --- hips: double bounce (down at loading, up at passing), lateral sway
    # onto the stance leg, yaw with the stepping leg, roll off the swing hip.
    b = bounce
    c.key("hips", cyc(half * 0.2), loc=(0, -b, 0), rot=(1.0, -yaw, 0))
    c.key("hips", cyc(half * 0.55), loc=(sway, -b * 0.1, 0), rot=(0.4, -yaw * 0.3, yaw * 0.55))
    c.key("hips", cyc(half * 0.72), loc=(sway * 0.8, b * 1.0, 0), rot=(0.2, yaw * 0.2, yaw * 0.5))
    c.key("hips", cyc(half * 1.2), loc=(0, -b, 0), rot=(1.0, yaw, 0))
    c.key("hips", cyc(half * 1.55), loc=(-sway, -b * 0.1, 0), rot=(0.4, yaw * 0.3, -yaw * 0.55))
    c.key("hips", cyc(half * 1.72), loc=(-sway * 0.8, b * 1.0, 0), rot=(0.2, -yaw * 0.2, -yaw * 0.5))

    # --- torso: constant-ish forward lean; chest counter-rotates the hips.
    # spine keys +1 frame after hips, chest +2, neck/head +3..4 (overlap).
    c.key("spine", cyc(1), rot=(lean * 0.6, yaw * 0.35, 0))
    c.key("spine", cyc(half * 0.6 + 1), rot=(lean * 0.75, 0, -yaw * 0.2))
    c.key("spine", cyc(half + 1), rot=(lean * 0.6, -yaw * 0.35, 0))
    c.key("spine", cyc(half * 1.6 + 1), rot=(lean * 0.75, 0, yaw * 0.2))
    c.key("chest", cyc(2), rot=(lean * 0.4, yaw * 0.6, 0))
    c.key("chest", cyc(half * 0.6 + 2), rot=(lean * 0.5, 0, -yaw * 0.25))
    c.key("chest", cyc(half + 2), rot=(lean * 0.4, -yaw * 0.6, 0))
    c.key("chest", cyc(half * 1.6 + 2), rot=(lean * 0.5, 0, yaw * 0.25))
    # head stabilization: cancel most of the chest yaw + bounce nod
    c.key("neck", cyc(3), rot=(-lean * 0.25, -yaw * 0.3, 0))
    c.key("neck", cyc(half + 3), rot=(-lean * 0.25, yaw * 0.3, 0))
    c.key("head", cyc(4), rot=(-lean * 0.3, -yaw * 0.25, 0))
    c.key("head", cyc(half * 0.72 + 4), rot=(-lean * 0.15, 0, 0))
    c.key("head", cyc(half + 4), rot=(-lean * 0.3, yaw * 0.25, 0))
    c.key("head", cyc(half * 1.72 + 4), rot=(-lean * 0.15, 0, 0))

    # --- arms: opposite phase to legs. +Y swings the L arm backward, the R
    # arm forward — so R uses the same values phase-shifted AND negated.
    def arm(side: str, phase: float, sign: float):
        u, f, h, s = f"upperArm{side}", f"foreArm{side}", f"hand{side}", f"shoulder{side}"
        c.key(u, cyc(1 + phase), rot=(0, sign * arm_swing, sign * 2))
        c.key(u, cyc(half * 0.5 + 1 + phase), rot=(0, sign * arm_swing * 0.2, 0))
        c.key(u, cyc(half + 1 + phase), rot=(0, -sign * arm_swing * 1.06, -sign * 2))
        c.key(u, cyc(half * 1.5 + 1 + phase), rot=(0, -sign * arm_swing * 0.25, 0))
        # elbow: bends as the arm swings forward, straightens back
        c.key(f, cyc(2 + phase), rot=(0, sign * elbow * 0.15, 0))
        c.key(f, cyc(half + 2 + phase), rot=(0, -sign * elbow, 0))
        c.key(h, cyc(3 + phase), rot=(0, sign * 6, 0))
        c.key(h, cyc(half + 3 + phase), rot=(0, -sign * 8, 0))
        c.key(s, cyc(4 + phase), rot=(0, 0, sign * 1.5))
        c.key(s, cyc(half + 4 + phase), rot=(0, 0, -sign * 1.5))

    arm("L", 0, 1.0)   # L arm back at L contact (opposite the forward L leg)
    arm("R", 0, -1.0)  # R arm forward at L contact

    return c.finish()


def clip_walk() -> bpy.types.Action:
    return _walk_like(
        "walk", 27,
        swing=42, knee=70, bounce=0.022, sway=0.010, yaw=8, lean=6,
        arm_swing=24, elbow=18, foot_roll=36,
    )


def clip_run() -> bpy.types.Action:
    return _walk_like(
        "run", 18,
        swing=58, knee=104, bounce=0.042, sway=0.007, yaw=11, lean=15,
        arm_swing=38, elbow=56, foot_roll=42,
    )


# Shared floor-sit pose: sitDown ends here, sitIdle oscillates around it,
# standUp starts here. (bone -> (rot, loc)); loc only for hips.
SIT_POSE = {
    "hips": ((-8, 0, 0), (0.0, -0.245, -0.035)),
    "spine": ((6, 0, 0), None),
    "chest": ((3, 0, 0), None),
    "neck": ((-2, 0, 0), None),
    "head": ((-3, 0, 0), None),
    "upperLegL": ((-76, -8, 0), None),
    "upperLegR": ((-76, 8, 0), None),
    "lowerLegL": ((58, 0, 0), None),
    "lowerLegR": ((58, 0, 0), None),
    "footL": ((16, 0, 0), None),
    "footR": ((16, 0, 0), None),
    "toesL": ((-6, 0, 0), None),
    "toesR": ((-6, 0, 0), None),
    # hands toward the knees
    "shoulderL": ((0, 0, -4), None),
    "shoulderR": ((0, 0, 4), None),
    "upperArmL": ((0, -32, -26), None),
    "upperArmR": ((0, 32, 26), None),
    "foreArmL": ((0, -28, -6), None),
    "foreArmR": ((0, 28, 6), None),
    "handL": ((0, -10, -8), None),
    "handR": ((0, 10, 8), None),
}


def _key_pose(c: Clip, pose: dict, frame: float, offset: dict | None = None):
    for bone, (rot, loc) in pose.items():
        off = (offset or {}).get(bone, 0)
        c.key(bone, frame + off, rot=rot, loc=loc)


def clip_sit_down() -> bpy.types.Action:
    c = Clip("sitDown", 24, loop=False)
    # anticipation: a breath up + look down before the drop
    c.key("hips", 0, loc=(0, 0, 0), rot=(0, 0, 0))
    c.key("hips", 4, loc=(0, 0.008, 0.004), rot=(2, 0, 0))
    c.key("spine", 1, rot=(0, 0, 0))
    c.key("spine", 6, rot=(-2, 0, 0))
    c.key("head", 2, rot=(0, 0, 0))
    c.key("head", 7, rot=(7, 0, 0))
    c.key("neck", 6, rot=(3, 0, 0))
    # descent: balance lean forward mid-way, legs fold under
    c.key("hips", 15, loc=(0, -0.19, -0.02), rot=(-4, 0, 0))
    c.key("spine", 13, rot=(14, 0, 0))
    c.key("chest", 3, rot=(0, 0, 0))
    c.key("chest", 14, rot=(8, 0, 0))
    for side, ysign in (("L", -1), ("R", 1)):
        c.key(f"upperLeg{side}", 3, rot=(0, 0, 0))
        c.key(f"upperLeg{side}", 15, rot=(-52, ysign * 5, 0))
        c.key(f"lowerLeg{side}", 4, rot=(0, 0, 0))
        c.key(f"lowerLeg{side}", 16, rot=(34, 0, 0))
        c.key(f"foot{side}", 5, rot=(0, 0, 0))
        c.key(f"foot{side}", 16, rot=(8, 0, 0))
        c.key(f"toes{side}", 16, rot=(0, 0, 0))
        c.key(f"shoulder{side}", 6, rot=(0, 0, 0))
        c.key(f"upperArm{side}", 5, rot=(0, 0, 0))
        c.key(f"foreArm{side}", 6, rot=(0, 0, 0))
        c.key(f"hand{side}", 7, rot=(0, 0, 0))
    # settle into the shared pose with a tiny rebound (down past, ease back)
    settle = {b: (r, (l[0], l[1] - 0.006, l[2]) if l else None) for b, (r, l) in SIT_POSE.items()}
    _key_pose(c, settle, 19, offset={"spine": -1, "chest": 0, "neck": 1, "head": 1})
    _key_pose(c, SIT_POSE, 24, offset={"head": 0})
    return c.finish()


def clip_sit_idle() -> bpy.types.Action:
    c = Clip("sitIdle", 120, loop=True)

    def d(bone, frame, drot=(0, 0, 0), dloc=None):
        rot, loc = SIT_POSE.get(bone, ((0, 0, 0), None))
        r = tuple(a + b for a, b in zip(rot, drot))
        l = None
        if loc is not None:
            l = tuple(a + b for a, b in zip(loc, dloc or (0, 0, 0)))
        c.key(bone, frame, rot=r, loc=l)

    d("hips", 0, (0, 0, 0), (0, 0, 0))
    d("hips", 34, (1.5, 0, 0.8), (0.004, 0.002, 0))
    d("hips", 78, (-1.0, 0, -1.0), (-0.005, 0, 0))
    d("spine", 3, (0, 1.5, 0))
    d("spine", 39, (1.5, -1.5, 0.5))
    d("spine", 82, (-1.0, 0.5, -0.5))
    d("chest", 6, (0, 1.0, 0))
    d("chest", 43, (1.0, -1.8, 0))
    d("chest", 86, (-0.5, 0.8, 0))
    d("head", 10, (1.0, 2.5, 0.5))
    d("head", 30, (-1.5, -1.0, -1.0))
    d("head", 58, (0.5, 3.5, 1.2))
    d("head", 94, (-0.5, -2.5, 0))
    d("neck", 12, (0.5, 1.0, 0))
    d("neck", 60, (0.3, -1.5, 0))
    # elbow/hand micro-adjustments on the knees
    d("foreArmL", 20, (0, -3, -1))
    d("foreArmL", 70, (0, 2, 1))
    d("foreArmR", 44, (0, 3, 1))
    d("foreArmR", 100, (0, -2, -1))
    d("handL", 24, (0, -2, 0))
    d("handL", 74, (0, 1, 0))
    d("handR", 48, (0, 2, 0))
    # feet wiggle once
    d("footL", 52, (3, 0, 0))
    d("footL", 66, (0, 0, 0))
    d("toesL", 55, (-4, 0, 0))
    d("toesL", 70, (0, 0, 0))
    return c.finish()


def clip_stand_up() -> bpy.types.Action:
    c = Clip("standUp", 24, loop=False)
    _key_pose(c, SIT_POSE, 0)
    # anticipation: rock forward over the feet, tuck the feet in
    c.key("spine", 6, rot=(20, 0, 0))
    c.key("chest", 7, rot=(12, 0, 0))
    c.key("head", 5, rot=(6, 0, 0))
    c.key("neck", 6, rot=(2, 0, 0))
    c.key("hips", 7, loc=(0, -0.24, -0.02), rot=(-2, 0, 0))
    for side in "LR":
        c.key(f"lowerLeg{side}", 7, rot=(66, 0, 0))
        c.key(f"foot{side}", 7, rot=(22, 0, 0))
    # drive up: legs extend, arms release off the knees and trail behind
    c.key("hips", 17, loc=(0, 0.012, 0.006), rot=(3, 0, 0))  # overshoot above rest
    c.key("hips", 24, loc=(0, 0, 0), rot=(0, 0, 0))
    c.key("spine", 15, rot=(8, 0, 0))
    c.key("spine", 21, rot=(-2.5, 0, 0))
    c.key("spine", 24, rot=(0, 0, 0))
    c.key("chest", 16, rot=(4, 0, 0))
    c.key("chest", 22, rot=(-1.5, 0, 0))
    c.key("chest", 24, rot=(0, 0, 0))
    c.key("head", 14, rot=(-4, 0, 0))
    c.key("head", 21, rot=(1.5, 0, 0))
    c.key("head", 24, rot=(0, 0, 0))
    c.key("neck", 15, rot=(-2, 0, 0))
    c.key("neck", 24, rot=(0, 0, 0))
    for side, ysign in (("L", -1), ("R", 1)):
        c.key(f"upperLeg{side}", 16, rot=(-14, ysign * 2, 0))
        c.key(f"upperLeg{side}", 23, rot=(0, 0, 0))
        c.key(f"lowerLeg{side}", 17, rot=(14, 0, 0))
        c.key(f"lowerLeg{side}", 23, rot=(0, 0, 0))
        c.key(f"foot{side}", 18, rot=(4, 0, 0))
        c.key(f"foot{side}", 23, rot=(0, 0, 0))
        c.key(f"toes{side}", 18, rot=(0, 0, 0))
        c.key(f"shoulder{side}", 15, rot=(0, 0, 0))
        c.key(f"upperArm{side}", 14, rot=(0, -ysign * 6, ysign * 3))
        c.key(f"upperArm{side}", 22, rot=(0, 0, 0))
        c.key(f"foreArm{side}", 15, rot=(0, -ysign * 4, 0))
        c.key(f"foreArm{side}", 23, rot=(0, 0, 0))
        c.key(f"hand{side}", 16, rot=(0, 0, 0))
    return c.finish()


def clip_talk_idle() -> bpy.types.Action:
    """3 s loop of conversational body language — the mouth is procedural."""
    c = Clip("talkIdle", 90, loop=True)
    # head: nodding beats with tilts, irregular rhythm
    c.key("head", 0, rot=(1, 0, 0))
    c.key("head", 8, rot=(4.5, 2, 0.5))
    c.key("head", 16, rot=(-1.5, 1, -1))
    c.key("head", 26, rot=(3.5, -2.5, 0))
    c.key("head", 38, rot=(0, -1, 2.2))
    c.key("head", 52, rot=(-3, 2, 1))    # tilt up: "you know?"
    c.key("head", 64, rot=(2.5, 3, -0.5))
    c.key("head", 76, rot=(0.5, 0.5, 0.5))
    c.key("neck", 2, rot=(0.5, 0, 0))
    c.key("neck", 10, rot=(2, 1, 0))
    c.key("neck", 28, rot=(1.5, -1, 0))
    c.key("neck", 54, rot=(-1.5, 1, 0))
    c.key("neck", 78, rot=(0.2, 0, 0))
    # chest/spine: small emphatic pushes
    c.key("chest", 4, rot=(1, 1, 0))
    c.key("chest", 24, rot=(2.2, -1, 0))
    c.key("chest", 48, rot=(-0.8, 1.5, 0))
    c.key("chest", 70, rot=(1.5, 0, 0))
    c.key("spine", 3, rot=(0.5, 0.5, 0))
    c.key("spine", 47, rot=(-0.5, 1, 0))
    c.key("hips", 6, loc=(0.002, 0, 0))
    c.key("hips", 50, loc=(-0.003, 0, 0))
    # L hand gesticulates (beats), R hand stays quieter
    c.key("shoulderL", 6, rot=(0, 0, 1))
    c.key("shoulderL", 30, rot=(0, 0, 3))
    c.key("shoulderL", 56, rot=(0, 0, 0.5))
    c.key("upperArmL", 7, rot=(0, -6, 4))
    c.key("upperArmL", 22, rot=(0, -16, 10))
    c.key("upperArmL", 34, rot=(0, -8, 5))
    c.key("upperArmL", 50, rot=(0, -20, 12))
    c.key("upperArmL", 68, rot=(0, -4, 2))
    c.key("foreArmL", 9, rot=(0, -14, 6))
    c.key("foreArmL", 24, rot=(0, -34, 14))  # palm-up beat
    c.key("foreArmL", 36, rot=(0, -12, 6))
    c.key("foreArmL", 52, rot=(0, -38, 16))
    c.key("foreArmL", 70, rot=(0, -8, 3))
    c.key("handL", 11, rot=(0, -6, 4))
    c.key("handL", 26, rot=(0, -14, 10))
    c.key("handL", 54, rot=(0, -16, 12))
    c.key("handL", 72, rot=(0, -3, 2))
    c.key("upperArmR", 12, rot=(0, 5, -3))
    c.key("upperArmR", 44, rot=(0, 10, -6))
    c.key("upperArmR", 74, rot=(0, 3, -2))
    c.key("foreArmR", 14, rot=(0, 10, -4))
    c.key("foreArmR", 46, rot=(0, 20, -8))
    c.key("foreArmR", 76, rot=(0, 6, -2))
    c.key("handR", 48, rot=(0, 8, -4))
    return c.finish()


def clip_gesture_wave() -> bpy.types.Action:
    c = Clip("gestureWave", 45, loop=False)
    # anticipation: R arm dips in/down before flying up
    c.key("upperArmR", 0, rot=(0, 0, 0))
    c.key("upperArmR", 4, rot=(0, 4, 10))
    c.key("upperArmR", 11, rot=(0, 8, -76))   # arm up-out (Z- lifts the -X limb)
    c.key("upperArmR", 34, rot=(0, 6, -72))
    c.key("upperArmR", 41, rot=(0, -3, 5))    # drop-through overshoot
    c.key("upperArmR", 45, rot=(0, 0, 0))
    c.key("shoulderR", 1, rot=(0, 0, 0))
    c.key("shoulderR", 10, rot=(0, 0, -8))
    c.key("shoulderR", 36, rot=(0, 0, -6))
    c.key("shoulderR", 45, rot=(0, 0, 0))
    # forearm wave: decaying oscillation, hand lags one frame behind
    c.key("foreArmR", 2, rot=(0, 0, 0))
    c.key("foreArmR", 12, rot=(0, 0, -26))
    for f, a in [(16, 26), (21, -24), (26, 22), (30, -16), (33, 10)]:
        c.key("foreArmR", f, rot=(0, 0, a - 8))
    c.key("foreArmR", 42, rot=(0, 0, 4))
    c.key("foreArmR", 45, rot=(0, 0, 0))
    c.key("handR", 3, rot=(0, 0, 0))
    for f, a in [(13, -14), (17, 12), (22, -12), (27, 10), (31, -8), (35, 0)]:
        c.key("handR", f, rot=(0, 0, a))
    c.key("handR", 45, rot=(0, 0, 0))
    # body english: chest opens toward the wave, head tilts, tiny hip shift
    c.key("chest", 2, rot=(0, 0, 0))
    c.key("chest", 13, rot=(0, -6, -2))
    c.key("chest", 37, rot=(0, -4, -1))
    c.key("chest", 45, rot=(0, 0, 0))
    c.key("spine", 3, rot=(0, 0, 0))
    c.key("spine", 15, rot=(0, -3, -1))
    c.key("spine", 45, rot=(0, 0, 0))
    c.key("head", 5, rot=(0, 0, 0))
    c.key("head", 15, rot=(-2, 6, -5))
    c.key("head", 30, rot=(-1, 4, -4))
    c.key("head", 44, rot=(0, 0, 0))
    c.key("hips", 6, loc=(0, 0, 0))
    c.key("hips", 16, loc=(-0.006, 0, 0), rot=(0, 0, 1.5))
    c.key("hips", 45, loc=(0, 0, 0), rot=(0, 0, 0))
    return c.finish()


def clip_gesture_nod() -> bpy.types.Action:
    c = Clip("gestureNod", 30, loop=False)
    c.key("head", 0, rot=(0, 0, 0))
    c.key("head", 4, rot=(-5, 0, 0))   # anticipation: tip up first
    c.key("head", 10, rot=(15, 0, 0))  # nod down
    c.key("head", 15, rot=(2, 0, 0))
    c.key("head", 20, rot=(11, 0, 0))  # second, smaller nod
    c.key("head", 26, rot=(-1.5, 0, 0))
    c.key("head", 30, rot=(0, 0, 0))
    c.key("neck", 2, rot=(0, 0, 0))
    c.key("neck", 6, rot=(-2, 0, 0))
    c.key("neck", 12, rot=(7, 0, 0))
    c.key("neck", 17, rot=(1, 0, 0))
    c.key("neck", 22, rot=(5, 0, 0))
    c.key("neck", 30, rot=(0, 0, 0))
    c.key("spine", 3, rot=(0, 0, 0))
    c.key("spine", 13, rot=(1.5, 0, 0))
    c.key("spine", 30, rot=(0, 0, 0))
    return c.finish()


def clip_gesture_shrug() -> bpy.types.Action:
    c = Clip("gestureShrug", 36, loop=False)
    for side, s in (("L", 1.0), ("R", -1.0)):
        sh, ua, fa, ha = f"shoulder{side}", f"upperArm{side}", f"foreArm{side}", f"hand{side}"
        c.key(sh, 0, rot=(0, 0, 0))
        c.key(sh, 4, rot=(0, 0, -s * 3))          # anticipation: drop first
        c.key(sh, 10, rot=(0, 0, s * 14))          # shoulders up
        c.key(sh, 22, rot=(0, 0, s * 13))          # hold
        c.key(sh, 29, rot=(0, 0, -s * 2))          # release overshoot
        c.key(sh, 34, rot=(0, 0, 0))
        # forearms swing out, palms-up-ish
        c.key(ua, 1, rot=(0, 0, 0))
        c.key(ua, 12, rot=(0, -s * 10, s * 14))
        c.key(ua, 23, rot=(0, -s * 9, s * 13))
        c.key(ua, 35, rot=(0, 0, 0))
        c.key(fa, 2, rot=(0, 0, 0))
        c.key(fa, 13, rot=(0, -s * 26, s * 30))
        c.key(fa, 24, rot=(0, -s * 24, s * 28))
        c.key(fa, 36, rot=(0, 0, 0))
        c.key(ha, 3, rot=(0, 0, 0))
        c.key(ha, 14, rot=(0, -s * 10, s * 18))
        c.key(ha, 25, rot=(0, -s * 9, s * 16))
        c.key(ha, 36, rot=(0, 0, 0))
    c.key("head", 2, rot=(0, 0, 0))
    c.key("head", 12, rot=(-4, 0, 6))  # tilt with the shrug
    c.key("head", 24, rot=(-3, 0, 5))
    c.key("head", 33, rot=(0.5, 0, -0.5))
    c.key("head", 36, rot=(0, 0, 0))
    c.key("hips", 1, loc=(0, 0, 0))
    c.key("hips", 11, loc=(0, -0.007, 0))
    c.key("hips", 23, loc=(0, -0.006, 0))
    c.key("hips", 33, loc=(0, 0, 0))
    return c.finish()


def clip_gesture_cheer() -> bpy.types.Action:
    c = Clip("gestureCheer", 60, loop=False)
    # 0-12 anticipation crouch: knees bend, arms sweep back, look down a touch
    c.key("hips", 0, loc=(0, 0, 0), rot=(0, 0, 0))
    c.key("hips", 12, loc=(0, -0.058, -0.008), rot=(4, 0, 0))
    c.key("spine", 1, rot=(0, 0, 0))
    c.key("spine", 13, rot=(11, 0, 0))
    c.key("chest", 2, rot=(0, 0, 0))
    c.key("chest", 14, rot=(7, 0, 0))
    c.key("head", 3, rot=(0, 0, 0))
    c.key("head", 13, rot=(6, 0, 0))
    for side, s in (("L", 1.0), ("R", -1.0)):
        c.key(f"upperLeg{side}", 1, rot=(0, 0, 0))
        c.key(f"upperLeg{side}", 12, rot=(-30, 0, 0))
        c.key(f"lowerLeg{side}", 2, rot=(0, 0, 0))
        c.key(f"lowerLeg{side}", 13, rot=(52, 0, 0))
        c.key(f"foot{side}", 2, rot=(0, 0, 0))
        c.key(f"foot{side}", 13, rot=(-16, 0, 0))
        c.key(f"upperArm{side}", 2, rot=(0, 0, 0))
        c.key(f"upperArm{side}", 13, rot=(0, s * 28, -s * 4))  # sweep back
        c.key(f"foreArm{side}", 3, rot=(0, 0, 0))
        c.key(f"foreArm{side}", 14, rot=(0, s * 12, 0))
    # 12-20 launch: hips rocket up, legs extend, arms throw skyward
    c.key("hips", 20, loc=(0, 0.128, 0.004), rot=(-6, 0, 0))
    c.key("spine", 19, rot=(-8, 0, 0))
    c.key("chest", 20, rot=(-5, 0, 0))
    c.key("head", 21, rot=(-13, 0, 0))  # look up at the hands
    c.key("neck", 20, rot=(-5, 0, 0))
    for side, s in (("L", 1.0), ("R", -1.0)):
        c.key(f"upperLeg{side}", 18, rot=(4, 0, 0))
        c.key(f"lowerLeg{side}", 19, rot=(6, 0, 0))
        c.key(f"foot{side}", 18, rot=(24, 0, 0))  # toes point in the air
        c.key(f"upperArm{side}", 18, rot=(0, -s * 10, s * 102))  # arms up!
        c.key(f"foreArm{side}", 19, rot=(0, -s * 6, s * 20))
        c.key(f"hand{side}", 20, rot=(0, 0, s * 10))
    # airborne tuck, then 26-31 landing squash
    for side in "LR":
        c.key(f"lowerLeg{side}", 24, rot=(18, 0, 0))
    c.key("hips", 29, loc=(0, -0.052, 0), rot=(5, 0, 0))
    c.key("spine", 30, rot=(9, 0, 0))
    c.key("chest", 31, rot=(6, 0, 0))
    c.key("head", 31, rot=(4, 0, 2))
    c.key("neck", 30, rot=(2, 0, 0))
    for side, s in (("L", 1.0), ("R", -1.0)):
        c.key(f"upperLeg{side}", 29, rot=(-26, 0, 0))
        c.key(f"lowerLeg{side}", 29, rot=(46, 0, 0))
        c.key(f"foot{side}", 28, rot=(-12, 0, 0))
        c.key(f"upperArm{side}", 30, rot=(0, -s * 4, s * 58))  # arms half-down
        c.key(f"foreArm{side}", 31, rot=(0, 0, s * 10))
    # 31-52 settle with overshoot, tail frames hold rest
    c.key("hips", 37, loc=(0, 0.012, 0), rot=(-1.5, 0, 0))
    c.key("hips", 45, loc=(0, 0, 0), rot=(0, 0, 0))
    c.key("spine", 39, rot=(-2.5, 0, 0))
    c.key("spine", 47, rot=(0, 0, 0))
    c.key("chest", 40, rot=(-1.5, 0, 0))
    c.key("chest", 48, rot=(0, 0, 0))
    c.key("head", 40, rot=(-2, 0, -1))
    c.key("head", 49, rot=(0, 0, 0))
    c.key("neck", 41, rot=(-1, 0, 0))
    c.key("neck", 49, rot=(0, 0, 0))
    for side, s in (("L", 1.0), ("R", -1.0)):
        c.key(f"upperLeg{side}", 38, rot=(3, 0, 0))
        c.key(f"upperLeg{side}", 46, rot=(0, 0, 0))
        c.key(f"lowerLeg{side}", 38, rot=(-4, 0, 0))
        c.key(f"lowerLeg{side}", 46, rot=(0, 0, 0))
        c.key(f"foot{side}", 37, rot=(3, 0, 0))
        c.key(f"foot{side}", 45, rot=(0, 0, 0))
        c.key(f"upperArm{side}", 41, rot=(0, s * 5, -s * 5))  # swing-through
        c.key(f"upperArm{side}", 50, rot=(0, 0, 0))
        c.key(f"foreArm{side}", 42, rot=(0, s * 3, 0))
        c.key(f"foreArm{side}", 50, rot=(0, 0, 0))
        c.key(f"hand{side}", 43, rot=(0, 0, -s * 3))
        c.key(f"hand{side}", 51, rot=(0, 0, 0))
    c.key("hips", 60, loc=(0, 0, 0), rot=(0, 0, 0))
    c.key("head", 60, rot=(0, 0, 0))
    return c.finish()


CLIP_BUILDERS = {
    "idle": clip_idle,
    "walk": clip_walk,
    "run": clip_run,
    "sitDown": clip_sit_down,
    "sitIdle": clip_sit_idle,
    "standUp": clip_stand_up,
    "talkIdle": clip_talk_idle,
    "gestureWave": clip_gesture_wave,
    "gestureNod": clip_gesture_nod,
    "gestureShrug": clip_gesture_shrug,
    "gestureCheer": clip_gesture_cheer,
}

LOOP_CLIPS = {"idle", "walk", "run", "sitIdle", "talkIdle"}


# ---------------------------------------------------------------------------
# measurement + preview rendering
# ---------------------------------------------------------------------------


def measure_gait_speed(action: bpy.types.Action, frames: int) -> float:
    """Mean backward foot speed (m/s) across each foot's stance window —
    the ground speed this in-place clip 'covers'. locomotion.ts must drive
    the root at this speed for zero skate (printed for calibration)."""
    ARM.animation_data.action = action
    speeds = []
    for foot in ("footL", "footR"):
        zs = []
        ys = []
        for f in range(frames + 1):
            bpy.context.scene.frame_set(f)
            m = ARM.pose.bones[foot].matrix  # armature space (blender: x, -zours, yours)
            zs.append(-m.translation.y)  # our +Z (forward)
            ys.append(m.translation.z)   # our +Y (up)
        y_min, y_max = min(ys), max(ys)
        thresh = y_min + 0.25 * (y_max - y_min)
        dt = 1.0 / FPS
        for i in range(frames):
            if ys[i] <= thresh and ys[i + 1] <= thresh:
                dz = zs[i + 1] - zs[i]
                if dz < 0:  # planted foot moves backward in an in-place gait
                    speeds.append(-dz / dt)
    ARM.animation_data.action = None
    return float(np.mean(speeds)) if speeds else 0.0


def setup_camera(view: str, height: float = 1.0):
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 60
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    from mathutils import Vector

    yaw = {"front": 0.0, "three-quarter": math.radians(38), "side": math.radians(90)}[view]
    radius = height * 2.6
    center = Vector((0.0, 0.0, height * 0.52))
    cam.location = (radius * math.sin(yaw), -radius * math.cos(yaw), center.z + radius * 0.14)
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam


def render_strip(name: str, action: bpy.types.Action, frames: list[int], view: str, res: int = 300):
    """Render `frames` of `action` and tile them into one horizontal strip PNG."""
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

    ARM.animation_data.action = action
    tiles = []
    tmp = os.path.join(PREVIEW_DIR, "_tile.png")
    for f in frames:
        scene.frame_set(f)
        scene.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(tmp)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(res, res, 4)
        tiles.append(px)
        bpy.data.images.remove(img)
    ARM.animation_data.action = None

    strip = np.concatenate(tiles, axis=1)  # blender pixel rows are bottom-up; fine for save
    out = bpy.data.images.new("strip", width=strip.shape[1], height=res, alpha=True)
    out.pixels = strip.reshape(-1).tolist()
    path = os.path.join(PREVIEW_DIR, f"{name}-{view}.png")
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    os.remove(tmp)
    print(f"[strip] {path}")


STRIP_PLAN = {
    # clip -> (frames to render, views)
    "idle": ([0, 25, 50, 75, 100, 125], ("three-quarter",)),
    "walk": ([0, 4, 7, 10, 13, 17, 20, 24], ("side", "three-quarter")),
    "run": ([0, 2, 4, 7, 9, 11, 13, 16], ("side", "three-quarter")),
    "sitDown": ([0, 5, 10, 15, 19, 24], ("three-quarter",)),
    "sitIdle": ([0, 30, 60, 90], ("three-quarter",)),
    "standUp": ([0, 5, 10, 15, 19, 24], ("three-quarter",)),
    "talkIdle": ([0, 12, 24, 38, 52, 64, 76], ("three-quarter",)),
    "gestureWave": ([0, 5, 11, 17, 23, 30, 38, 44], ("front",)),
    "gestureNod": ([0, 4, 10, 15, 20, 26], ("three-quarter",)),
    "gestureShrug": ([0, 4, 10, 17, 24, 30, 35], ("front",)),
    "gestureCheer": ([0, 8, 13, 17, 20, 24, 29, 34, 40, 50], ("three-quarter",)),
}


# ---------------------------------------------------------------------------
# export
# ---------------------------------------------------------------------------


def export_clips(path: str, actions: list[bpy.types.Action]) -> None:
    reset_pose()
    # Stash every action in a muted NLA track — the ACTIONS export mode picks
    # them up and names glTF animations after the actions.
    ad = ARM.animation_data
    for track in list(ad.nla_tracks):
        ad.nla_tracks.remove(track)
    for action in actions:
        track = ad.nla_tracks.new()
        track.name = action.name
        track.mute = True
        track.strips.new(action.name, int(action.frame_start), action)

    bpy.ops.object.select_all(action="DESELECT")
    ARM.select_set(True)
    bpy.context.view_layer.objects.active = ARM
    kwargs = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=False,
        export_skins=True,
        export_morph=False,
        export_yup=True,
        export_lights=False,
        export_cameras=False,
    )
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in kwargs.items() if k in props})
    print(f"[clips] {path} ({os.path.getsize(path) // 1024} KB)")


def main() -> None:
    global ARM
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
    ref = skel_data["reference"]

    os.makedirs(CLIP_DIR, exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)

    blender_io.clean_scene()
    bpy.context.scene.render.fps = FPS
    ARM = blender_io.build_armature("rig", ref)
    ARM.animation_data_create()

    # Preview body: the biped-round shells built at REFERENCE proportions
    # (clips are authored at reference; this body exists only for renders).
    shells, _meta = bodies.build_body_shells("biped-round", ref)
    body_obj, offsets = blender_io.build_object("preview-body", shells)
    blender_io.skin_object(body_obj, ARM, shells, offsets)

    actions: list[bpy.types.Action] = []
    for name, builder in CLIP_BUILDERS.items():
        if only and name not in only:
            continue
        action = builder()
        actions.append(action)
        if name in ("walk", "run"):
            frames = int(action.frame_end)
            speed = measure_gait_speed(action, frames)
            print(f"[gait] {name}: stance-foot ground speed ≈ {speed:.3f} m/s over {frames} fr")

    if render:
        for action in actions:
            frames, views = STRIP_PLAN[action.name]
            for view in views:
                setup_camera(view)
                render_strip(action.name, action, frames, view)
                bpy.data.objects.remove(bpy.data.objects["cam"])

    if not only:
        export_clips(os.path.join(CLIP_DIR, "clips-core-v1.glb"), actions)
    else:
        print("[clips] partial build (--only) — skipping export")

    print("done")


main()
