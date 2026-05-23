// Ambient declarations for the engine's shared easing / interpolation
// primitives. The runtime module is `easing.js`; these types let React
// surfaces import the helpers without an implicit-any error.

export function clamp(v: number, lo: number, hi: number): number
export function clamp01(v: number): number
export function lerp(a: number, b: number, t: number): number
export function lerpRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number }
export function smoothstep(t: number): number
export function smootherstep(t: number): number
export function easeOutCubic(t: number): number
export function easeInCubic(t: number): number
export function progress(now: number, start: number, duration: number): number
