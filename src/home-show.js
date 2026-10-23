import { createRun } from "./algorithms.js";
import { randomArray } from "./arrays.js";

/** Crossfade at the start of each screensaver scene, in milliseconds. */
export const FADE_MS = 1400;

/**
 * Screensaver order. Fractal flights and sorting runs alternate, and the cycle opens on the
 * Mandelbrot set. Durations are long enough that a fade never eats the whole scene.
 */
export const SCENES = [
  { id: "mandelbrot", kind: "fractal", fractalId: "mandelbrot", duration: 18000 },
  { id: "quick-bars", kind: "sort", programId: "quick", viewId: "bars", length: 48, seed: 11, duration: 12000 },
  { id: "julia", kind: "fractal", fractalId: "julia", duration: 16000 },
  { id: "merge-slope", kind: "sort", programId: "merge", viewId: "slope", length: 42, seed: 29, duration: 12000 },
  { id: "burning", kind: "fractal", fractalId: "burning", duration: 16000 },
  { id: "heap-radial", kind: "sort", programId: "heap", viewId: "radial", length: 36, seed: 47, duration: 12000 },
];

const FLIGHTS = {
  mandelbrot: [
    { fractalId: "mandelbrot", paletteId: "classic", centerX: -0.75, centerY: 0, scale: 2.6, iterations: 56 },
    { fractalId: "mandelbrot", paletteId: "classic", centerX: -0.42, centerY: 0.42, scale: 1.35, iterations: 64 },
    { fractalId: "mandelbrot", paletteId: "classic", centerX: -0.16, centerY: 0.84, scale: 0.48, iterations: 80 },
    { fractalId: "mandelbrot", paletteId: "classic", centerX: -0.11, centerY: 0.88, scale: 0.22, iterations: 100 },
  ],
  julia: [
    { fractalId: "julia", paletteId: "classic", centerX: 0, centerY: 0, scale: 3.2, cx: -0.123, cy: 0.745, iterations: 56 },
    { fractalId: "julia", paletteId: "classic", centerX: -0.18, centerY: 0.22, scale: 1.85, cx: -0.123, cy: 0.745, iterations: 68 },
    { fractalId: "julia", paletteId: "classic", centerX: -0.35, centerY: 0.45, scale: 0.95, cx: -0.123, cy: 0.745, iterations: 84 },
  ],
  burning: [
    { fractalId: "burning", paletteId: "heat", centerX: -0.45, centerY: -0.55, scale: 3.3, flipY: true, iterations: 56 },
    { fractalId: "burning", paletteId: "heat", centerX: -0.72, centerY: -0.32, scale: 1.7, flipY: true, iterations: 72 },
    { fractalId: "burning", paletteId: "heat", centerX: -1.05, centerY: -0.08, scale: 0.72, flipY: true, iterations: 92 },
  ],
};

function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function cycleLength() {
  return SCENES.reduce((sum, scene) => sum + scene.duration, 0);
}

/**
 * Scene playing at `elapsedMs`, measured from the start of the show. Time wraps, and a negative
 * value walks backward into the previous cycle. `fade` runs from 0 to 1 across {@link FADE_MS}.
 */
export function sceneAt(elapsedMs) {
  const cycle = cycleLength();
  let time = elapsedMs % cycle;
  if (time < 0) time += cycle;
  for (let index = 0; index < SCENES.length; index += 1) {
    const scene = SCENES[index];
    if (time < scene.duration || index === SCENES.length - 1) {
      const local = Math.min(scene.duration, Math.max(0, time));
      return {
        index,
        id: scene.id,
        kind: scene.kind,
        progress: scene.duration === 0 ? 0 : local / scene.duration,
        fade: Math.min(1, local / FADE_MS),
      };
    }
    time -= scene.duration;
  }
  const last = SCENES.length - 1;
  return { index: last, id: SCENES[last].id, kind: SCENES[last].kind, progress: 1, fade: 1 };
}

/**
 * Camera for one fractal flight. Progress 0 and 1 sit on the first and last keyframes. In between,
 * the center eases (a pan) and the scale moves geometrically (a zoom).
 */
export function fractalCamera(sceneId, progress) {
  const path = FLIGHTS[sceneId];
  if (!path) throw new Error(`Unknown screensaver flight: ${sceneId}`);
  const span = path.length - 1;
  const scaled = Math.min(1, Math.max(0, progress)) * span;
  const index = Math.min(span - 1, Math.floor(scaled));
  const local = span === 0 ? 0 : scaled - index;
  return mixCamera(path[index], path[Math.min(span, index + 1)], local);
}

function mixCamera(a, b, t) {
  const eased = smoothstep(t);
  const preset = {
    centerX: lerp(a.centerX, b.centerX, eased),
    centerY: lerp(a.centerY, b.centerY, eased),
    scale: a.scale * (b.scale / a.scale) ** eased,
  };
  if (a.cx != null) {
    preset.cx = a.cx;
    preset.cy = a.cy;
  }
  if (a.flipY) preset.flipY = true;
  return {
    fractalId: a.fractalId,
    paletteId: a.paletteId,
    iterations: Math.round(lerp(a.iterations, b.iterations, eased)),
    preset,
  };
}

/** Raster size for a fractal plate. The long edge stops at `maxEdge`; the aspect matches the screen. */
export function screensaverSize(cssWidth, cssHeight, maxEdge = 480) {
  const width = Math.max(0, cssWidth);
  const height = Math.max(0, cssHeight);
  const long = Math.max(width, height, 1);
  const scale = Math.min(1, maxEdge / long);
  return {
    width: Math.max(2, Math.round(width * scale) || 2),
    height: Math.max(2, Math.round(height * scale) || 2),
  };
}

/**
 * Index into a precomputed sort. The run finishes at 82% of the scene and the ordered array holds
 * until the next flight fades in.
 */
export function frameIndex(progress, count) {
  if (count <= 1) return 0;
  const t = Math.min(1, Math.max(0, progress) / 0.82);
  return Math.min(count - 1, Math.floor(t * (count - 1)));
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function copyFrame(frame) {
  return {
    array: frame.array.slice(),
    indices: frame.indices.slice(),
    mark: frame.mark,
    comparisons: frame.comparisons,
    writes: frame.writes,
    swaps: frame.swaps,
    sorted: new Set(frame.sorted),
    pivot: frame.pivot,
    maxValue: frame.array.length,
  };
}

/** Every frame of one seeded sorting run. The same seed replays the same shuffle. */
export function sortFrames(programId, length, seed) {
  const values = randomArray(length, mulberry32(seed));
  const run = createRun(programId, values, mulberry32(seed + 1));
  const limit = length * length * 12 + length * 80 + 100;
  const frames = [];
  let steps = 0;
  while (steps < limit) {
    const next = run.next();
    if (next.done) break;
    frames.push(copyFrame(next.value));
    steps += 1;
  }
  if (frames.length === 0) throw new Error(`Program produced no frames: ${programId}`);
  return frames;
}

/** `still` paints one Mandelbrot frame. `play` runs the screensaver. */
export function showMode(reduced) {
  return reduced ? "still" : "play";
}
