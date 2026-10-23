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
 * Zoom films only. The center stays put for the whole film, and the scale moves in toward it.
 * Mandelbrot and the Julia set use the classic brass coloring. The burning ship uses heat.
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

export const SCENES = ZOOMS.map((zoom) => ({
  id: zoom.id,
  kind: "zoom",
  fractalId: zoom.fractalId,
  src: zoom.src,
  poster: zoom.poster,
  duration: zoom.duration,
}));

function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function cycleLength() {
  return SCENES.reduce((sum, scene) => sum + scene.duration, 0);
}

/**
 * How far a crossfade has come, eased so it leaves slowly, moves through the middle, and settles.
 * `linear` is 0 at the start of the blend and 1 when the incoming film is fully there.
 */
export function fadeAmount(linear) {
  return smoothstep(linear);
}

/**
 * Film playing at `elapsedMs`. Time wraps. `fade` is {@link fadeAmount} across {@link FADE_MS}.
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
        fade: fadeAmount(Math.min(1, local / FADE_MS)),
      };
    }
    time -= scene.duration;
  }
  const last = SCENES.length - 1;
  return { index: last, id: SCENES[last].id, kind: SCENES[last].kind, progress: 1, fade: 1 };
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
