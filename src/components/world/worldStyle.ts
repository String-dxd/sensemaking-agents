export const WORLD_STYLE = {
  foliage: {
    leavesPerBlob: 80,
    planeSize: 0.5,
    alphaThreshold: 0.32,
    icoRadius: 1.4,
    oakColorA: 0x3a7d2a,
    oakColorB: 0x8aaa35,
    cherryColorA: 0xff66a3,
    cherryColorB: 0xffcc66,
  },
  island: {
    sea: 0x2a8ca0,
    seaDeep: 0x1560a0,
    foam: 0xb3ffff,
    plateau: 0x4a8f3f,
    sand: 0xf2eca8,
    cliff: 0x8a6a30,
    waterRadius: 60,
    waterSegments: 160,
    waterY: -0.15,
    waveAmplitude: 0.32,
    oceanClockBase: 0.45,
    oceanClockRainScale: 0.55,
    oceanRainAmplitudeBase: 0.85,
    oceanRainAmplitudeScale: 0.75,
  },
  grass: {
    windTextureSpeed: 0.024,
    windAmplitude: 0.45,
    distance: 50,
    cameraFadeNear: 18,
    cameraFadeFar: 32,
    fresnelOffset: 0,
    fresnelScale: 0.5,
    fresnelPower: 2,
  },
  effects: {
    maxParticles: 34,
    auroraRibbons: 6,
    weatherRainStreaks: 96,
  },
  motion: {
    full: 1,
    reduced: 0.28,
    grassWindSpeed: 1,
    grassWindAmplitude: 1,
    treeWindSpeed: 1,
    leafFlutter: 1,
  },
} as const

type DayKey = {
  h: number
  skyTop: readonly [number, number, number]
  skyBottom: readonly [number, number, number]
  sunInt: number
  sunColor: readonly [number, number, number]
  ambInt: number
  ambColor: readonly [number, number, number]
  hemiInt: number
  hemiTop: readonly [number, number, number]
  hemiBot: readonly [number, number, number]
  seaShift: number
}

export interface WorldWeatherState {
  hour: number
  skyTop: [number, number, number]
  skyMid: [number, number, number]
  skyBottom: [number, number, number]
  sunColor: [number, number, number]
  sunIntensity: number
  ambientColor: [number, number, number]
  ambientIntensity: number
  hemiTop: [number, number, number]
  hemiBottom: [number, number, number]
  hemiIntensity: number
  seaShift: number
  isNight: boolean
  rainbow: number
  rain: number
}

export interface WorldEnvironmentControls {
  hour: number
  useRealTime: boolean
  rain: boolean
  aurora: boolean
  rainbow: boolean
}

export const DEFAULT_WORLD_ENVIRONMENT_CONTROLS: WorldEnvironmentControls = {
  hour: 10.5,
  useRealTime: false,
  rain: false,
  aurora: true,
  rainbow: false,
}

export const STUDENT_SPACE_DAY_KEYS: readonly DayKey[] = [
  {
    h: 0,
    skyTop: [2, 8, 24],
    skyBottom: [90, 52, 200],
    sunInt: 0,
    sunColor: [40, 80, 170],
    ambInt: 0.2,
    ambColor: [112, 136, 187],
    hemiInt: 0.42,
    hemiTop: [40, 60, 128],
    hemiBot: [16, 32, 44],
    seaShift: -0.55,
  },
  {
    h: 5,
    skyTop: [14, 10, 42],
    skyBottom: [224, 120, 40],
    sunInt: 0.35,
    sunColor: [255, 170, 64],
    ambInt: 0.26,
    ambColor: [255, 216, 160],
    hemiInt: 0.5,
    hemiTop: [255, 153, 68],
    hemiBot: [85, 68, 34],
    seaShift: -0.3,
  },
  {
    h: 6.5,
    skyTop: [30, 92, 144],
    skyBottom: [242, 236, 168],
    sunInt: 0.9,
    sunColor: [255, 240, 208],
    ambInt: 0.42,
    ambColor: [255, 250, 230],
    hemiInt: 0.85,
    hemiTop: [128, 204, 221],
    hemiBot: [102, 170, 68],
    seaShift: 0,
  },
  {
    h: 9,
    skyTop: [30, 92, 144],
    skyBottom: [242, 236, 168],
    sunInt: 1.15,
    sunColor: [255, 240, 208],
    ambInt: 0.58,
    ambColor: [255, 255, 255],
    hemiInt: 1,
    hemiTop: [128, 204, 221],
    hemiBot: [102, 170, 68],
    seaShift: 0.08,
  },
  {
    h: 12,
    skyTop: [26, 74, 130],
    skyBottom: [255, 240, 80],
    sunInt: 1.3,
    sunColor: [255, 240, 208],
    ambInt: 0.64,
    ambColor: [255, 255, 255],
    hemiInt: 1.05,
    hemiTop: [128, 204, 221],
    hemiBot: [102, 170, 68],
    seaShift: 0.1,
  },
  {
    h: 15,
    skyTop: [42, 140, 180],
    skyBottom: [224, 240, 208],
    sunInt: 1.05,
    sunColor: [255, 240, 208],
    ambInt: 0.52,
    ambColor: [255, 244, 220],
    hemiInt: 0.92,
    hemiTop: [128, 204, 221],
    hemiBot: [102, 170, 68],
    seaShift: 0.05,
  },
  {
    h: 17.5,
    skyTop: [74, 32, 120],
    skyBottom: [240, 160, 48],
    sunInt: 0.8,
    sunColor: [255, 170, 64],
    ambInt: 0.36,
    ambColor: [255, 216, 160],
    hemiInt: 0.68,
    hemiTop: [255, 153, 68],
    hemiBot: [85, 68, 34],
    seaShift: -0.05,
  },
  {
    h: 18.2,
    skyTop: [26, 16, 80],
    skyBottom: [248, 200, 88],
    sunInt: 0.65,
    sunColor: [255, 170, 64],
    ambInt: 0.34,
    ambColor: [255, 216, 160],
    hemiInt: 0.62,
    hemiTop: [255, 153, 68],
    hemiBot: [85, 68, 34],
    seaShift: -0.12,
  },
  {
    h: 18.7,
    skyTop: [26, 16, 80],
    skyBottom: [224, 120, 40],
    sunInt: 0.55,
    sunColor: [255, 170, 64],
    ambInt: 0.3,
    ambColor: [255, 216, 160],
    hemiInt: 0.58,
    hemiTop: [255, 153, 68],
    hemiBot: [85, 68, 34],
    seaShift: -0.18,
  },
  {
    h: 19,
    skyTop: [14, 10, 42],
    skyBottom: [252, 224, 160],
    sunInt: 0.42,
    sunColor: [255, 170, 64],
    ambInt: 0.28,
    ambColor: [255, 216, 160],
    hemiInt: 0.54,
    hemiTop: [255, 153, 68],
    hemiBot: [85, 68, 34],
    seaShift: -0.22,
  },
  {
    h: 20.5,
    skyTop: [12, 24, 52],
    skyBottom: [68, 40, 160],
    sunInt: 0.16,
    sunColor: [40, 80, 170],
    ambInt: 0.24,
    ambColor: [112, 136, 187],
    hemiInt: 0.46,
    hemiTop: [40, 60, 128],
    hemiBot: [16, 32, 44],
    seaShift: -0.4,
  },
  {
    h: 22,
    skyTop: [5, 15, 34],
    skyBottom: [50, 28, 112],
    sunInt: 0.06,
    sunColor: [40, 80, 170],
    ambInt: 0.22,
    ambColor: [112, 136, 187],
    hemiInt: 0.44,
    hemiTop: [40, 60, 128],
    hemiBot: [16, 32, 44],
    seaShift: -0.5,
  },
  {
    h: 24,
    skyTop: [2, 8, 24],
    skyBottom: [90, 52, 200],
    sunInt: 0,
    sunColor: [40, 80, 170],
    ambInt: 0.2,
    ambColor: [112, 136, 187],
    hemiInt: 0.42,
    hemiTop: [40, 60, 128],
    hemiBot: [16, 32, 44],
    seaShift: -0.55,
  },
] as const

export function worldMotionScale(reduceMotion: boolean): number {
  return reduceMotion ? WORLD_STYLE.motion.reduced : WORLD_STYLE.motion.full
}

export function worldHourAtElapsed(elapsed: number): number {
  return (15 + elapsed * 0.012) % 24
}

export function worldWeatherAtElapsed(
  elapsed: number,
  controls?: WorldEnvironmentControls,
): WorldWeatherState {
  const hour = controls ? worldHourFromControls(controls) : worldHourAtElapsed(elapsed)
  const [left, right] = findDayKeys(hour)
  const t = (hour - left.h) / Math.max(0.001, right.h - left.h)
  const skyTop = lerpRgb(left.skyTop, right.skyTop, t)
  const skyBottom = lerpRgb(left.skyBottom, right.skyBottom, t)
  let sunIntensity = lerp(left.sunInt, right.sunInt, t)
  let skyMid = lerpRgb(
    averageRgb(skyTop, skyBottom),
    [96, 216, 232],
    hour >= 6 && hour <= 16.5 ? clamp01(sunIntensity) * 0.85 : 0,
  )

  const twilight = worldTwilightFactor(elapsed)
  const baseRainbow = clamp01(
    bell(hour, 8.4, 10.2) * 0.16 + bell(hour, 15.2, 17.9) * 0.28 + twilight * 0.18,
  )
  const baseRain = clamp01(bell(hour, 13.2, 14.35) * 0.16)
  const rainbow = controls ? (controls.rainbow ? 1 : 0) : baseRainbow
  const rain = controls ? (controls.rain ? Math.max(baseRain, 0.65) : 0) : baseRain
  let sunColor = lerpRgb(left.sunColor, right.sunColor, t)
  let ambientColor = lerpRgb(left.ambColor, right.ambColor, t)
  let ambientIntensity = lerp(left.ambInt, right.ambInt, t)
  let hemiTop = lerpRgb(left.hemiTop, right.hemiTop, t)
  let hemiBottom = lerpRgb(left.hemiBot, right.hemiBot, t)
  let hemiIntensity = lerp(left.hemiInt, right.hemiInt, t)
  const seaShift = lerp(left.seaShift, right.seaShift, t)
  if (rain > 0.001) {
    const desat = rain * 0.3
    const dim = 1 - rain * 0.1
    const rainySkyTop = dimRgb(greyMix(skyTop, desat), dim)
    const rainySkyBottom = dimRgb(greyMix(skyBottom, desat), dim)
    skyTop[0] = rainySkyTop[0]
    skyTop[1] = rainySkyTop[1]
    skyTop[2] = rainySkyTop[2]
    skyBottom[0] = rainySkyBottom[0]
    skyBottom[1] = rainySkyBottom[1]
    skyBottom[2] = rainySkyBottom[2]
    sunColor = greyMix(sunColor, desat * 0.5)
    sunIntensity *= 1 - rain * 0.3
    hemiIntensity *= 1 - rain * 0.12
    ambientIntensity *= 1 - rain * 0.05
    ambientColor = greyMix(ambientColor, desat * 0.35)
    hemiTop = greyMix(hemiTop, desat * 0.35)
    hemiBottom = greyMix(hemiBottom, desat * 0.35)
    skyMid = lerpRgb(
      averageRgb(skyTop, skyBottom),
      [96, 216, 232],
      hour >= 6 && hour <= 16.5 ? clamp01(sunIntensity) * 0.85 : 0,
    )
  }

  return {
    hour,
    skyTop,
    skyMid,
    skyBottom,
    sunColor,
    sunIntensity,
    ambientColor,
    ambientIntensity,
    hemiTop,
    hemiBottom,
    hemiIntensity,
    seaShift,
    isNight: hour < 6 || hour > 19.5,
    rainbow,
    rain,
  }
}

export function worldNightFactor(elapsed: number): number {
  return worldNightFactorAtHour(worldHourAtElapsed(elapsed))
}

export function worldNightFactorAtHour(hour: number): number {
  if (hour < 6) return clamp01(1 - hour / 6)
  if (hour > 19.5) return clamp01((hour - 19.5) / 4.5)
  return 0
}

export function worldNightFactorForControls(
  elapsed: number,
  controls?: WorldEnvironmentControls,
): number {
  const hour = controls ? worldHourFromControls(controls) : worldHourAtElapsed(elapsed)
  return worldNightFactorAtHour(hour)
}

export function worldTwilightFactor(elapsed: number): number {
  return worldTwilightFactorAtHour(worldHourAtElapsed(elapsed))
}

export function worldTwilightFactorForControls(
  elapsed: number,
  controls?: WorldEnvironmentControls,
): number {
  const hour = controls ? worldHourFromControls(controls) : worldHourAtElapsed(elapsed)
  return worldTwilightFactorAtHour(hour)
}

function worldTwilightFactorAtHour(hour: number): number {
  if (hour < 18 || hour > 19.5) return 0
  return Math.sin(((hour - 18) / 1.5) * Math.PI)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function worldHourFromControls(controls: WorldEnvironmentControls): number {
  if (!controls.useRealTime) return clampHour(controls.hour)
  const date = new Date()
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
}

function clampHour(hour: number): number {
  return Math.max(0, Math.min(24, hour))
}

function findDayKeys(hour: number): readonly [DayKey, DayKey] {
  const first = STUDENT_SPACE_DAY_KEYS[0] as DayKey
  const last = STUDENT_SPACE_DAY_KEYS[STUDENT_SPACE_DAY_KEYS.length - 1] as DayKey
  for (let index = 0; index < STUDENT_SPACE_DAY_KEYS.length - 1; index += 1) {
    const left = STUDENT_SPACE_DAY_KEYS[index] ?? first
    const right = STUDENT_SPACE_DAY_KEYS[index + 1] ?? last
    if (hour >= left.h && hour <= right.h) return [left, right] as const
  }
  return [first, last] as const
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function averageRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] {
  return [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5]
}

function greyMix(rgb: readonly [number, number, number], weight: number): [number, number, number] {
  const luminance = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114
  return [
    rgb[0] * (1 - weight) + luminance * weight,
    rgb[1] * (1 - weight) + luminance * weight,
    rgb[2] * (1 - weight) + luminance * weight,
  ]
}

function dimRgb(rgb: readonly [number, number, number], dim: number): [number, number, number] {
  return [rgb[0] * dim, rgb[1] * dim, rgb[2] * dim]
}

function bell(value: number, start: number, end: number): number {
  if (value < start || value > end) return 0
  const t = (value - start) / (end - start)
  return Math.sin(t * Math.PI)
}
