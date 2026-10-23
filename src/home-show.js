/** Crossfade at the start of each zoom, in milliseconds. */
export const FADE_MS = 1800;

/** Pre-recorded plate. The page plays these files; it does not draw them. */
export const FRAME_WIDTH = 3840;
export const FRAME_HEIGHT = 2160;
export const FRAME_RATE = 24;
export const FRAME_COUNT = 192;

/** Length of one film, matching FRAME_COUNT frames at FRAME_RATE. */
export const FILM_MS = Math.round((FRAME_COUNT / FRAME_RATE) * 1000);

/**
 * Zoom films. The center stays put for the whole film, and the scale moves in toward it.
 * Mandelbrot and the Julia set use the classic brass coloring. The burning ship uses heat.
 * Three sorting films follow them. Every boundary eases across {@link FADE_MS}.
 */
export const ZOOMS = [
  {
    id: "mandelbrot",
    fractalId: "mandelbrot",
    paletteId: "classic",
    centerX: -0.125,
    centerY: 0.9,
    startScale: 2.45,
    endScale: 0.18,
    baseIterations: 72,
    src: "/media/mandelbrot-zoom.mp4",
    poster: "/media/mandelbrot-zoom.jpg",
    duration: FILM_MS,
  },
  {
    id: "julia",
    fractalId: "julia",
    paletteId: "classic",
    centerX: -0.32,
    centerY: 0.42,
    startScale: 3.05,
    endScale: 0.5,
    baseIterations: 64,
    cx: -0.123,
    cy: 0.745,
    src: "/media/julia-zoom.mp4",
    poster: "/media/julia-zoom.jpg",
    duration: FILM_MS,
  },
  {
    id: "burning",
    fractalId: "burning",
    paletteId: "heat",
    centerX: -0.5537,
    centerY: -0.8921,
    startScale: 3.2,
    endScale: 0.42,
    baseIterations: 64,
    flipY: true,
    src: "/media/burning-zoom.mp4",
    poster: "/media/burning-zoom.jpg",
    duration: FILM_MS,
  },
];

/**
 * Sorting films. Recorded offline, same length and plate as the zooms.
 * Quicksort uses bars, mergesort the slope, heapsort the radial view.
 */
export const SORTS = [
  {
    id: "quick",
    programId: "quick",
    viewId: "bars",
    length: 64,
    seed: 11,
    src: "/media/quick-sort.mp4",
    poster: "/media/quick-sort.jpg",
    duration: FILM_MS,
  },
  {
    id: "merge",
    programId: "merge",
    viewId: "slope",
    length: 64,
    seed: 29,
    src: "/media/merge-sort.mp4",
    poster: "/media/merge-sort.jpg",
    duration: FILM_MS,
  },
  {
    id: "heap",
    programId: "heap",
    viewId: "radial",
    length: 48,
    seed: 47,
    src: "/media/heap-sort.mp4",
    poster: "/media/heap-sort.jpg",
    duration: FILM_MS,
  },
];

const zoomScenes = ZOOMS.map((zoom) => ({
  id: zoom.id,
  kind: "zoom",
  fractalId: zoom.fractalId,
  src: zoom.src,
  poster: zoom.poster,
  duration: zoom.duration,
}));

const sortScenes = SORTS.map((sort) => ({
  id: sort.id,
  kind: "sort",
  programId: sort.programId,
  viewId: sort.viewId,
  src: sort.src,
  poster: sort.poster,
  duration: sort.duration,
}));

export const SCENES = [...zoomScenes, ...sortScenes];

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function freezeFrame(frame, viewId) {
  return {
    array: frame.array.slice(),
    indices: frame.indices.slice(),
    mark: frame.mark,
    sorted: new Set(frame.sorted),
    pivot: frame.pivot,
    maxValue: frame.array.length,
    viewId,
  };
}

/**
 * One pre-recorded sort, sampled across {@link FRAME_COUNT} frames.
 * The home page does not call this. The offline recorder does.
 */
export async function sortFrames(sortId) {
  const sort = SORTS.find((item) => item.id === sortId);
  if (!sort) throw new Error(`Unknown screensaver sort: ${sortId}`);
  const { createRun } = await import("./algorithms.js");
  const { randomArray } = await import("./arrays.js");
  const values = randomArray(sort.length, mulberry32(sort.seed));
  const run = createRun(sort.programId, values, mulberry32(sort.seed + 97));
  const taken = [];
  let step = run.next();
  while (!step.done) {
    taken.push(freezeFrame(step.value, sort.viewId));
    step = run.next();
  }
  if (taken.length === 0) throw new Error(`Sort produced no frames: ${sortId}`);
  const sampled = [];
  for (let i = 0; i < FRAME_COUNT; i += 1) {
    const index = Math.round((i / (FRAME_COUNT - 1)) * (taken.length - 1));
    sampled.push(taken[index]);
  }
  return sampled;
}

function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * How far a crossfade has come, eased so it leaves slowly, moves through the middle, and settles.
 * `linear` is 0 at the start of the blend and 1 when the incoming film is fully there.
 */
export function fadeAmount(linear) {
  return smoothstep(linear);
}

/**
 * Film playing at `elapsedMs`. A film keeps its own picture for {@link FILM_MS} minus {@link FADE_MS},
 * then the next one fades in across the frames the previous film still has left. Time wraps, so the
 * last film blends into the first the same way. `fade` is {@link fadeAmount} across {@link FADE_MS}.
 * `outgoingLeft` is how many milliseconds of the previous film remain.
 */
export function sceneAt(elapsedMs) {
  const slot = FILM_MS - FADE_MS;
  const cycle = slot * SCENES.length;
  let time = elapsedMs % cycle;
  if (time < 0) time += cycle;
  const index = Math.min(SCENES.length - 1, Math.floor(time / slot));
  const local = time - index * slot;
  const scene = SCENES[index];
  return {
    index,
    id: scene.id,
    kind: scene.kind,
    progress: FILM_MS === 0 ? 0 : Math.min(1, local / FILM_MS),
    fade: fadeAmount(Math.min(1, local / FADE_MS)),
    outgoingLeft: Math.max(0, FADE_MS - local),
  };
}

/**
 * One zoom frame. The center, and any Julia or burning-ship parameter, is the same at every
 * progress. Only the scale changes, geometrically, and the iteration cap rises with the zoom so a
 * closer frame keeps its edge.
 */
export function zoomCamera(sceneId, progress) {
  const zoom = ZOOMS.find((item) => item.id === sceneId);
  if (!zoom) throw new Error(`Unknown screensaver zoom: ${sceneId}`);
  const t = Math.min(1, Math.max(0, progress));
  const scale = zoom.startScale * (zoom.endScale / zoom.startScale) ** t;
  const magnification = zoom.startScale / scale;
  const extra = Math.round(Math.log2(Math.max(1, magnification)) * 36);
  const preset = {
    centerX: zoom.centerX,
    centerY: zoom.centerY,
    scale,
  };
  if (zoom.cx != null) {
    preset.cx = zoom.cx;
    preset.cy = zoom.cy;
  }
  if (zoom.flipY) preset.flipY = true;
  return {
    fractalId: zoom.fractalId,
    paletteId: zoom.paletteId,
    iterations: Math.min(280, zoom.baseIterations + extra),
    preset,
  };
}

/** `still` holds the opening frame. `play` runs the films. */
export function showMode(reduced) {
  return reduced ? "still" : "play";
}
