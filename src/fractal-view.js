import { deepCenter, hasDeepCenter, shiftView, viewOffset } from "./precision.js";

/** Matches the padding drawPaths, drawTriangles, and drawPoints use. */
export const FIT_PAD = 18;

/** Long edge while a fractal is still being drawn. */
export const DRAW_RASTER_EDGE = 960;

/** Long edge of a finished, zoomed, or reactive picture. 3840 is 4K. */
export const SHARP_RASTER_EDGE = 3840;

/** Magnification per auto-zoom frame. Sixty frames about double the view. */
export const AUTO_ZOOM_STEP = 1.012;

const RATIOS = {
  koch: 3,
  sierpinski: 2,
  hilbert: 2,
  dragon: Math.SQRT2,
  gosper: Math.sqrt(7),
  levy: Math.SQRT2,
  tree: 1.5,
};

/** Presets whose segments shrink by a different factor per level than the rest of their fractal. */
const PRESET_RATIOS = {
  "koch:cesaro": 2 * (1 + Math.cos((85 * Math.PI) / 180)),
  "koch:island": 2 * (1 + Math.cos((85 * Math.PI) / 180)),
  "koch:minkowski": 4,
  "dragon:terdragon": Math.sqrt(3),
  "hilbert:peano": 3,
};

/** How much the view must grow before the next level of a curve is needed. */
export function levelRatio(fractalId, presetId) {
  return PRESET_RATIOS[`${fractalId}:${presetId}`] || RATIOS[fractalId];
}

export function escapeWindow(preset) {
  return {
    centerX: preset.centerX,
    centerY: preset.centerY,
    scale: preset.scale,
    flipY: Boolean(preset.flipY),
  };
}

/** A plate's window: the camera it was drawn for, with its pixel size, keeping a double-double center. */
export function plateFrame(view, width, height) {
  const frame = {
    centerX: view.centerX,
    centerY: view.centerY,
    scale: view.scale,
    flipY: Boolean(view.flipY),
    width,
    height,
  };
  if (hasDeepCenter(view)) {
    frame.centerXLo = view.centerXLo || 0;
    frame.centerYLo = view.centerYLo || 0;
  }
  return frame;
}

export function escapeMagnification(home, view) {
  return home.scale / view.scale;
}

export function boundsMagnification(home, view) {
  return (home.maxX - home.minX) / Math.max(1e-12, view.maxX - view.minX);
}

/** Deep zooms stay on the boundary only while the cap keeps rising. 18 per octave goes blank near 200M×. */
export const ITERATION_LIMIT = 16384;

export function iterationCap(baseDepth, magnification) {
  const extra = Math.max(0, Math.round(Math.log2(Math.max(1, magnification)) * 96));
  return Math.min(ITERATION_LIMIT, Math.max(1, baseDepth + extra));
}

/**
 * Steps Newton's method gains per octave. Beside the pole one step throws a pixel out to about
 * 1/(3z²), and the way back shrinks by 2/3 a step, so about 3.4 more steps are spent per halving.
 * The escape-time rate of 96 would squeeze every pixel into the first sliver of the shading.
 */
const NEWTON_STEPS_PER_OCTAVE = 5;

export function escapeIterationCap(fractalId, baseDepth, magnification) {
  if (fractalId !== "newton") return iterationCap(baseDepth, magnification);
  const extra = Math.max(0, Math.round(Math.log2(Math.max(1, magnification)) * NEWTON_STEPS_PER_OCTAVE));
  return Math.min(ITERATION_LIMIT, Math.max(1, baseDepth + extra));
}

/** Iterations for a continuous zoom. Grows with log2 of magnification for as long as the zoom runs. */
export function autoZoomIterations(baseDepth, magnification) {
  return iterationCap(baseDepth, magnification);
}

/** Octaves of zoom per frame at full pace. Sixty frames about double the view. */
export const AUTO_OCTAVES_PER_FRAME = Math.log2(AUTO_ZOOM_STEP);

/** How much wider than the camera an auto-zoom plate is rendered, so the view can move inside it. */
export const PLATE_SCALE = 1.65;

/**
 * Plate margin once the target sits in the middle of the frame. From then on the camera only
 * moves inward, so a wide ring around it would be drawn and never shown.
 */
export const PLATE_SCALE_SETTLED = 1.08;

/** Octaves over which the target slides from where it started to the middle of the frame. */
const AUTO_ENTER_OCTAVES = 6;

/** How much wider than the camera to draw the next plate at this point on the path. */
export function plateMargin(octave) {
  return octave >= AUTO_ENTER_OCTAVES ? PLATE_SCALE_SETTLED : PLATE_SCALE;
}

/** Milliseconds over which auto zoom builds from rest to full pace when it starts. */
export const AUTO_RAMP_MS = 1400;

/** Milliseconds a freshly finished plate takes to blend over the stretched one beneath it. */
export const PLATE_BLEND_MS = 320;

/** How long a plate should take to draw, so the next one is ready before the view has stretched far. */
export const PLATE_TARGET_MS = 650;

/** Long edge of the largest auto-zoom plate. */
export const PLATE_EDGE_MAX = 2560;

/**
 * A fixed path from the starting view into a target point.
 * The scale falls exponentially with `octave`, and the target drifts to the center of the frame
 * on a smooth curve. Nothing is measured while zooming, so the camera never re-aims.
 * `floor` keeps the pixel size above what the arithmetic can tell apart.
 * A target with `xLo` and `yLo` is double-double, and the camera center then stays double-double.
 */
export function autoZoomPath(start, target, floor = 5e-12) {
  const reach = Math.max(1, Math.hypot(target.x, target.y));
  const minScale = Math.max(Number(floor) || 5e-12, 0) * reach;
  const maxOctave = Math.max(1, Math.log2(start.scale / minScale));
  const deep = typeof target.xLo === "number" || typeof target.yLo === "number";
  const aim = { centerX: target.x, centerY: target.y, centerXLo: target.xLo || 0, centerYLo: target.yLo || 0 };
  const offset = viewOffset(aim, start);
  return {
    start: { centerX: start.centerX, centerY: start.centerY, scale: start.scale, flipY: Boolean(start.flipY) },
    target: deep ? { x: target.x, y: target.y, xLo: target.xLo || 0, yLo: target.yLo || 0 } : { x: target.x, y: target.y },
    offsetX: offset.dx / start.scale,
    offsetY: offset.dy / start.scale,
    maxOctave,
  };
}

/** The camera at a point on the path. Octaves past the deepest point keep diving, for the dissolve. */
export function autoZoomView(path, octave) {
  const o = Math.max(0, Number.isFinite(octave) ? octave : 0);
  const p = Math.min(1, o / AUTO_ENTER_OCTAVES);
  const keep = 1 - p * p * (3 - 2 * p);
  const scale = path.start.scale * 2 ** -o;
  const dx = -path.offsetX * keep * scale;
  const dy = -path.offsetY * keep * scale;
  if (typeof path.target.xLo === "number") {
    return { ...deepCenter(path.target, dx, dy), scale, flipY: path.start.flipY };
  }
  return {
    centerX: path.target.x + dx,
    centerY: path.target.y + dy,
    scale,
    flipY: path.start.flipY,
  };
}

/** Next position on the path at a steady pace. `done` marks passing the deepest point. */
export function advanceAutoZoom(path, octave, frames, pace = 1) {
  const next = octave + AUTO_OCTAVES_PER_FRAME * Math.max(0, frames) * Math.max(0, pace);
  return { octave: next, done: next >= path.maxOctave };
}

/** Pace from rest to full over the first moments, so the start is a glide rather than a lurch. */
export function autoZoomRamp(elapsedMs) {
  const t = Math.min(1, Math.max(0, elapsedMs / AUTO_RAMP_MS));
  return t * t * (3 - 2 * t);
}

/** Smallest long edge of an auto-zoom plate. A late plate is stretched further than a small one is blurred. */
export const PLATE_EDGE_MIN = 400;

export const MANUAL_MAGNIFICATION = 1e6;

/**
 * Long edge for the next plate, from how long the last one took.
 * A slow machine, or a deep view where every pixel runs thousands of iterations, gets smaller
 * plates so they keep arriving before the view has stretched far.
 */
export function plateBudget(edge, durationMs, ceiling = PLATE_EDGE_MAX) {
  const current = Number.isFinite(edge) && edge > 0 ? edge : ceiling;
  const took = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : PLATE_TARGET_MS;
  const factor = Math.min(1.25, Math.max(0.6, Math.sqrt(PLATE_TARGET_MS / took)));
  return Math.round(Math.max(PLATE_EDGE_MIN, Math.min(ceiling, current * factor)));
}

/** Index of the finest plate that covers the camera whole, or -1 when none does. */
export function pickPlate(plates, view, aspect = 1) {
  for (let index = plates.length - 1; index >= 0; index -= 1) {
    if (plateCovers(plates[index].view, view, aspect, COVER_SLACK)) return index;
  }
  return -1;
}

/**
 * Draw the plate through its source pixels.
 * A destination rect millions of pixels wide is dropped by the browser and leaves the paper color.
 */
export function escapeSourceBlit(plate, view, width, height) {
  if (!plate || !view || !(view.scale > 0) || !(plate.scale > 0)) return null;
  const plateW = Math.max(1, plate.width || width);
  const plateH = Math.max(1, plate.height || height);
  const rect = escapeBlitRect(plate, view, width, height);
  if (!(rect.w > 0) || !(rect.h > 0) || !Number.isFinite(rect.x) || !Number.isFinite(rect.y)) return null;
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(width, rect.x + rect.w);
  const y1 = Math.min(height, rect.y + rect.h);
  if (!(x1 > x0) || !(y1 > y0)) return null;
  let sx = ((x0 - rect.x) / rect.w) * plateW;
  let sy = ((y0 - rect.y) / rect.h) * plateH;
  let sw = ((x1 - x0) / rect.w) * plateW;
  let sh = ((y1 - y0) / rect.h) * plateH;
  if (!(sw > 0) || !(sh > 0) || !Number.isFinite(sx) || !Number.isFinite(sy)) return null;
  if (sw < 1 || sh < 1) {
    const cx = Math.min(plateW - 0.5, Math.max(0.5, sx + sw / 2));
    const cy = Math.min(plateH - 0.5, Math.max(0.5, sy + sh / 2));
    sw = Math.max(sw, 1);
    sh = Math.max(sh, 1);
    sx = cx - sw / 2;
    sy = cy - sh / 2;
  }
  sx = Math.min(plateW - 0.01, Math.max(0, sx));
  sy = Math.min(plateH - 0.01, Math.max(0, sy));
  sw = Math.min(sw, plateW - sx);
  sh = Math.min(sh, plateH - sy);
  if (!(sw > 0) || !(sh > 0)) return null;
  return { sx, sy, sw, sh, dx: x0, dy: y0, dw: x1 - x0, dh: y1 - y0 };
}

/**
 * Zoom out only as far as the plate still covers.
 * A closer plate must not shrink away and leave the paper color around it.
 */
export function fitZoomOut(plate, from, proposed, aspect = 1) {
  if (!plate || !from || !proposed || !(proposed.scale > from.scale)) return proposed;
  if (plateCovers(plate, proposed, aspect)) return proposed;
  const safeAspect = aspect > 0 ? aspect : 1;
  const plateAspect = plate.width > 0 && plate.height > 0 ? plate.width / plate.height : safeAspect;
  const fullX = plate.scale * plateAspect;
  const fullY = plate.scale;
  const maxScale = Math.min(fullY, fullX / safeAspect);
  const scale = Math.min(proposed.scale, Math.max(from.scale, maxScale));
  if (!(scale > from.scale * (1 + 1e-9))) return { ...from };
  const t = (scale - from.scale) / (proposed.scale - from.scale);
  return clampViewToPlate(plate, {
    ...proposed,
    centerX: from.centerX + (proposed.centerX - from.centerX) * t,
    centerY: from.centerY + (proposed.centerY - from.centerY) * t,
    scale,
  }, safeAspect);
}

/** Keep a camera inside the world rectangle a plate actually covers. */
export function clampViewToPlate(plate, view, aspect = 1) {
  const safeAspect = aspect > 0 ? aspect : 1;
  const plateAspect = plate.width > 0 && plate.height > 0 ? plate.width / plate.height : safeAspect;
  const fullX = plate.scale * plateAspect;
  const fullY = plate.scale;
  const maxScale = Math.min(fullY, fullX / safeAspect);
  const scale = Math.min(view.scale, maxScale);
  const camX = scale * safeAspect;
  const camY = scale;
  const insetX = Math.min(fullX * 0.012, Math.max(0, (fullX - camX) / 2));
  const insetY = Math.min(fullY * 0.012, Math.max(0, (fullY - camY) / 2));
  const roomX = Math.max(0, (fullX - camX) / 2 - insetX);
  const roomY = Math.max(0, (fullY - camY) / 2 - insetY);
  return {
    ...view,
    centerX: Math.min(plate.centerX + roomX, Math.max(plate.centerX - roomX, view.centerX)),
    centerY: Math.min(plate.centerY + roomY, Math.max(plate.centerY - roomY, view.centerY)),
    scale,
  };
}

/** One window that contains every camera, widened so the view can keep moving inside it. */
export function coverViews(views, aspect = 1, margin = PLATE_SCALE) {
  const camera = views[0];
  const safeAspect = aspect > 0 ? aspect : 1;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const view of views) {
    const halfX = view.scale * safeAspect * 0.5;
    const halfY = view.scale * 0.5;
    const at = viewOffset(view, camera);
    minX = Math.min(minX, at.dx - halfX);
    maxX = Math.max(maxX, at.dx + halfX);
    minY = Math.min(minY, at.dy - halfY);
    maxY = Math.max(maxY, at.dy + halfY);
  }
  const spanX = (maxX - minX) * 1.08;
  const spanY = (maxY - minY) * 1.08;
  const center = shiftView(camera, (minX + maxX) / 2, (minY + maxY) / 2);
  return {
    ...centerOf(center),
    scale: Math.max(spanY, spanX / safeAspect, camera.scale * (margin > 1 ? margin : PLATE_SCALE)),
    flipY: Boolean(camera.flipY),
  };
}

function centerOf(view) {
  const center = { centerX: view.centerX, centerY: view.centerY };
  if (hasDeepCenter(view)) {
    center.centerXLo = view.centerXLo || 0;
    center.centerYLo = view.centerYLo || 0;
  }
  return center;
}

/**
 * True when the camera rectangle sits inside the plate, including a zoomed-in camera.
 * `slack` is a fraction of the camera height the plate may fall short by, for a picture whose
 * pixel grid rounds to a slightly different aspect than the frame.
 */
export function plateCovers(plate, view, aspect = 1, slack = 0) {
  if (!plate || !view || !(plate.scale > 0) || !(view.scale > 0)) return false;
  const safeAspect = aspect > 0 ? aspect : 1;
  const plateAspect = plate.width > 0 && plate.height > 0 ? plate.width / plate.height : safeAspect;
  const plateHalfX = plate.scale * plateAspect * 0.5;
  const plateHalfY = plate.scale * 0.5;
  const camHalfX = view.scale * safeAspect * 0.5;
  const camHalfY = view.scale * 0.5;
  const at = viewOffset(view, plate);
  const marginX = plateHalfX - camHalfX - Math.abs(at.dx);
  const marginY = plateHalfY - camHalfY - Math.abs(at.dy);
  const allowed = Math.max(1e-9, slack) * view.scale;
  return marginX >= -allowed && marginY >= -allowed;
}

/** Fraction of the frame a plate may fall short by and still count as covering it: under a pixel. */
export const COVER_SLACK = 0.003;

/**
 * Long edge of an auto-zoom plate.
 * Stays large through ordinary depths. Deeper caps shrink the plate so the next
 * frame still arrives before the zoom outruns it.
 */
export function plateRasterEdge(cap = 500) {
  const iterations = Number.isFinite(cap) && cap > 0 ? cap : 500;
  if (iterations <= 240) return 2560;
  const edge = Math.round(2560 * Math.sqrt(240 / iterations));
  return Math.max(760, Math.min(2560, edge));
}

/**
 * True when one pixel is still many float32 steps across, so a shader can color it
 * from the plain coordinates. A deep view, or a low word that moves the center by
 * more than a pixel, stays on the double-double path.
 */
export function gpuPrecisionHolds(view, height) {
  if (!view || !(view.scale > 0)) return false;
  if (!Number.isFinite(view.centerX) || !Number.isFinite(view.centerY)) return false;
  const pixel = view.scale / Math.max(1, height);
  const step = Math.max(float32Ulp(view.centerX), float32Ulp(view.centerY), float32Ulp(view.scale));
  if (!(pixel >= step * 32)) return false;
  const low = Math.max(Math.abs(view.centerXLo || 0), Math.abs(view.centerYLo || 0));
  return low <= pixel * 0.25;
}

/**
 * Smallest pixel the shader takes. Offsets from the reference are carried in units of the view
 * scale, so only the scale itself has to stay a normal float32.
 */
const GPU_PIXEL_FLOOR = 1e-34;

/**
 * How the shader can draw a view: "direct" from plain float32 coordinates, "perturb" as float32
 * offsets from a double-double reference orbit, or null when the view is past both.
 */
export function gpuDepthMode(view, height) {
  if (!view || !(view.scale > 0) || !Number.isFinite(view.scale)) return null;
  if (gpuPrecisionHolds(view, height)) return "direct";
  if (!Number.isFinite(view.centerX) || !Number.isFinite(view.centerY)) return null;
  return view.scale / Math.max(1, height) >= GPU_PIXEL_FLOOR ? "perturb" : null;
}

/** Smallest share of the screen's width a moving picture is drawn at. */
export const MOTION_SCALE_MIN = 0.2;

/**
 * Share of full width and height to draw a moving frame at, from what a full frame is expected
 * to cost in milliseconds per million pixels, so the frame fits `budgetMs`.
 */
export function motionScale(msPerMegapixel, pixels, budgetMs) {
  const full = (msPerMegapixel * pixels) / 1e6;
  if (!(full > budgetMs)) return 1;
  return Math.max(MOTION_SCALE_MIN, Math.sqrt(budgetMs / full));
}

export const SETTLED_DPR_MAX = 3;
export const SETTLED_SUPERSAMPLE = 2;
export const SETTLED_EDGE_MAX = 7680;

/** Pixel size of a settled GPU frame: device pixels up to 3x, then doubled, then fit to 7680. */
export function settledRaster(width, height, dpr = 1) {
  const ratio = Math.min(Math.max(Number(dpr) || 1, 1), SETTLED_DPR_MAX);
  let pixelW = Math.max(1, Math.floor(Math.max(0, width) * ratio * SETTLED_SUPERSAMPLE));
  let pixelH = Math.max(1, Math.floor(Math.max(0, height) * ratio * SETTLED_SUPERSAMPLE));
  const edge = Math.max(pixelW, pixelH);
  if (edge > SETTLED_EDGE_MAX) {
    const fit = SETTLED_EDGE_MAX / edge;
    pixelW = Math.max(1, Math.floor(pixelW * fit));
    pixelH = Math.max(1, Math.floor(pixelH * fit));
  }
  return { width: pixelW, height: pixelH };
}

function float32Ulp(value) {
  const mag = Math.abs(value);
  if (!(mag > 0) || !Number.isFinite(mag)) return 2 ** -149;
  return 2 ** (Math.floor(Math.log2(mag)) - 23);
}

export function rasterSize(width, height, dpr = 1, sharp = false, longEdge = 0) {
  const ratio = Math.min(Math.max(Number(dpr) || 1, 1), 2);
  let pixelW = Math.max(1, Math.floor(width * ratio));
  let pixelH = Math.max(1, Math.floor(height * ratio));
  const cap = longEdge > 0 ? longEdge : sharp ? SHARP_RASTER_EDGE : DRAW_RASTER_EDGE;
  const edge = Math.max(pixelW, pixelH);
  if (edge > cap) {
    const fit = cap / edge;
    pixelW = Math.max(1, Math.floor(pixelW * fit));
    pixelH = Math.max(1, Math.floor(pixelH * fit));
  } else if (sharp && edge < cap) {
    const grow = cap / edge;
    pixelW = Math.max(1, Math.round(pixelW * grow));
    pixelH = Math.max(1, Math.round(pixelH * grow));
  }
  return { width: pixelW, height: pixelH };
}

const WHEEL_GAIN = 0.0012;

/** Pixel, line, and page wheel deltas become one modest zoom factor. */
export function wheelZoomFactor(deltaY, deltaMode = 0) {
  const dy = Number(deltaY);
  if (!Number.isFinite(dy) || dy === 0) return 1;
  const mode = deltaMode | 0;
  const pixels = mode === 1 ? dy * 32 : mode === 2 ? dy * 800 : dy;
  const clamped = Math.max(-180, Math.min(180, pixels));
  return Math.exp(-clamped * WHEEL_GAIN);
}

/** Spend part of a pending zoom. A frame grows by at most 3%, so one frame stays inside a level. */
export function easeFactor(pending, rate = 0.22) {
  const safe = Number.isFinite(pending) && pending > 0 ? pending : 1;
  if (Math.abs(Math.log(safe)) < 0.004) return { applied: safe, rest: 1 };
  let applied = Math.exp(Math.log(safe) * rate);
  const cap = 1.03;
  if (applied > cap) applied = cap;
  else if (applied < 1 / cap) applied = 1 / cap;
  if ((safe > 1 && applied > safe) || (safe < 1 && applied < safe)) applied = safe;
  return { applied, rest: safe / applied };
}

/** Where a finished escape plate is drawn so its world window matches `view`. */
export function escapeBlitRect(plate, view, width, height) {
  const plateW = Math.max(1, plate.width || width);
  const plateH = Math.max(1, plate.height || height);
  const spanY = plate.scale;
  const spanX = spanY * (plateW / plateH);
  const at = viewOffset(plate, view);
  const left = at.dx - spanX / 2;
  const right = at.dx + spanX / 2;
  const topY = at.dy + (plate.flipY ? -spanY / 2 : spanY / 2);
  const botY = at.dy + (plate.flipY ? spanY / 2 : -spanY / 2);
  const topLeft = worldToPixel(view, width, height, left, topY);
  const bottomRight = worldToPixel(view, width, height, right, botY);
  return {
    x: topLeft.x,
    y: topLeft.y,
    w: bottomRight.x - topLeft.x,
    h: bottomRight.y - topLeft.y,
  };
}

/** Fractional progress toward the next generation, so a level change is a fade. */
export function levelBlend(fractalId, magnification, presetId) {
  const ratio = levelRatio(fractalId, presetId);
  if (!ratio || !(magnification > 0)) return { extra: 0, fade: 0 };
  const t = Math.log(Math.max(1, magnification)) / Math.log(ratio);
  if (!Number.isFinite(t) || t <= 0) return { extra: 0, fade: 0 };
  const extra = Math.floor(t + 1e-9);
  const fade = Math.min(1, Math.max(0, t - extra));
  return { extra, fade: fade < 1e-9 ? 0 : fade };
}

/**
 * How much of the incoming level to draw. `progress` is the fractional step toward the next
 * ratio, and `nextSegmentPx` is how long one of its segments is on screen now. A segment shorter
 * than the stroke is hidden, because drawing it only lays a second curve over the one already
 * there. Once a segment reaches the stroke, the fade runs over the rest of the step.
 */
export function incomingLevelFade(progress, nextSegmentPx, ratio, minPx) {
  const fade = Math.min(1, Math.max(0, progress || 0));
  if (!(fade > 0)) return 0;
  if (!(ratio > 1) || !(nextSegmentPx > 0) || !(minPx > 0)) return fade;
  const grown = ratio ** fade;
  const atStart = nextSegmentPx / grown;
  if (atStart >= minPx) return fade;
  const openAt = Math.log(minPx / atStart) / Math.log(ratio);
  if (!(openAt < 1) || fade <= openAt) return 0;
  return (fade - openAt) / (1 - openAt);
}

export function recursionLevel(fractalId, baseDepth, magnification, minDepth, maxDepth, presetId) {
  const ratio = levelRatio(fractalId, presetId);
  const extra = ratio
    ? Math.max(0, Math.floor(Math.log(Math.max(1, magnification)) / Math.log(ratio) + 1e-9))
    : 0;
  return Math.min(maxDepth, Math.max(minDepth, baseDepth + extra));
}

export function pointBudget(baseCount, magnification, maxCount) {
  const scaled = Math.round(baseCount * Math.min(6, Math.max(1, magnification)));
  return Math.min(maxCount, Math.max(baseCount, scaled));
}

/**
 * Zoom about a pixel. The point under the pointer moves by its offset from the center times the
 * change in span, a small plain double, so a double-double center keeps its digits.
 */
export function zoomEscape(view, factor, px, py, width, height, homeScale) {
  const applied = appliedFactor(escapeMagnification({ scale: homeScale }, view), factor);
  const scale = view.scale / applied;
  const aspect = width / Math.max(1, height);
  const nx = px / Math.max(1, width) - 0.5;
  const ny = view.flipY ? py / Math.max(1, height) - 0.5 : 0.5 - py / Math.max(1, height);
  const shrink = view.scale - scale;
  return { ...shiftView(view, nx * shrink * aspect, ny * shrink), scale };
}

export function panEscape(view, dx, dy, width, height) {
  const spanY = view.scale;
  const spanX = view.scale * (width / Math.max(1, height));
  const ySign = view.flipY ? -1 : 1;
  return shiftView(view, -(dx / Math.max(1, width)) * spanX, ySign * (dy / Math.max(1, height)) * spanY);
}

export function panPixels(oldView, newView, width, height) {
  if (!oldView || !newView || !(oldView.scale > 0) || oldView.scale !== newView.scale) return null;
  if (Boolean(oldView.flipY) !== Boolean(newView.flipY)) return null;
  const spanY = newView.scale;
  const spanX = spanY * (width / Math.max(1, height));
  const worldX = (newView.centerX + (newView.centerXLo || 0)) - (oldView.centerX + (oldView.centerXLo || 0));
  const worldY = (newView.centerY + (newView.centerYLo || 0)) - (oldView.centerY + (oldView.centerYLo || 0));
  const ySign = newView.flipY ? -1 : 1;
  return {
    x: Math.round((-worldX / spanX) * width),
    y: Math.round((ySign * worldY / spanY) * height),
  };
}

export function panRepaint(frameWidth, frameHeight, shiftX, shiftY) {
  const sx = Math.round(shiftX);
  const sy = Math.round(shiftY);
  const width = frameWidth | 0;
  const height = frameHeight | 0;
  if (width < 1 || height < 1) return null;
  if (sx === 0 && sy === 0) return null;
  if (Math.abs(sx) > width / 2 || Math.abs(sy) > height / 2) return null;
  const rects = [];
  if (sx > 0) rects.push({ x: 0, y: 0, w: sx, h: height });
  else if (sx < 0) rects.push({ x: width + sx, y: 0, w: -sx, h: height });
  const overlapW = width - Math.abs(sx);
  const overlapX = sx > 0 ? sx : 0;
  if (sy > 0) rects.push({ x: overlapX, y: 0, w: overlapW, h: sy });
  else if (sy < 0) rects.push({ x: overlapX, y: height + sy, w: overlapW, h: -sy });
  const copy = {
    sx: sx > 0 ? 0 : -sx,
    sy: sy > 0 ? 0 : -sy,
    sw: overlapW,
    sh: height - Math.abs(sy),
    dx: sx > 0 ? sx : 0,
    dy: sy > 0 ? sy : 0,
  };
  return { copy, rects };
}

export function zoomBounds(bounds, factor, px, py, width, height, home) {
  const applied = appliedFactor(boundsMagnification(home, bounds), factor);
  const anchor = unproject(bounds, px, py, width, height);
  return {
    minX: anchor.x + (bounds.minX - anchor.x) / applied,
    maxX: anchor.x + (bounds.maxX - anchor.x) / applied,
    minY: anchor.y + (bounds.minY - anchor.y) / applied,
    maxY: anchor.y + (bounds.maxY - anchor.y) / applied,
  };
}

export function panBounds(bounds, dx, dy, width, height) {
  const scale = fitScale(bounds, width, height);
  const worldDx = dx / scale;
  const worldDy = dy / scale;
  return {
    minX: bounds.minX - worldDx,
    maxX: bounds.maxX - worldDx,
    minY: bounds.minY + worldDy,
    maxY: bounds.maxY + worldDy,
  };
}

export function unproject(bounds, px, py, width, height) {
  const scale = fitScale(bounds, width, height);
  const offset = fitOffset(bounds, width, height, scale);
  return {
    x: bounds.minX + (px - offset.x) / scale,
    y: bounds.maxY - (py - offset.y) / scale,
  };
}

export function mapPointsInto(points, native, home) {
  const spanX = Math.max(1e-9, native.maxX - native.minX);
  const spanY = Math.max(1e-9, native.maxY - native.minY);
  const scale = Math.min((home.maxX - home.minX) / spanX, (home.maxY - home.minY) / spanY);
  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const ox = home.minX + (home.maxX - home.minX - drawnW) / 2;
  const oy = home.minY + (home.maxY - home.minY - drawnH) / 2;
  const out = new Float64Array(points.length);
  for (let i = 0; i < points.length; i += 2) {
    out[i] = ox + (points[i] - native.minX) * scale;
    out[i + 1] = oy + (points[i + 1] - native.minY) * scale;
  }
  return out;
}

/**
 * A curve level carried from its own frame (see levelFrame) into the native coordinates of the
 * level whose frame is `home`. The home level itself comes back untouched.
 */
export function placeLevel(geometry, frame, home) {
  if (frame.re === home.re && frame.im === home.im && frame.x === home.x && frame.y === home.y) return geometry;
  const norm = home.re * home.re + home.im * home.im;
  const invRe = home.re / norm;
  const invIm = -home.im / norm;
  const re = invRe * frame.re - invIm * frame.im;
  const im = invRe * frame.im + invIm * frame.re;
  const sx = frame.x - home.x;
  const sy = frame.y - home.y;
  const x = invRe * sx - invIm * sy;
  const y = invRe * sy + invIm * sx;
  const move = (points) => {
    const out = new Float64Array(points.length);
    for (let i = 0; i < points.length; i += 2) {
      const px = points[i];
      const py = points[i + 1];
      out[i] = re * px - im * py + x;
      out[i + 1] = im * px + re * py + y;
    }
    return out;
  };
  if (geometry.mode === "polyline") return { mode: "polyline", paths: geometry.paths.map(move) };
  return { mode: "triangles", vertices: move(geometry.vertices) };
}

/** Pixel of a point given by its offset from the camera center. */
function worldToPixel(view, width, height, dx, dy) {
  const spanY = view.scale;
  const spanX = spanY * (width / Math.max(1, height));
  const ny = dy / spanY;
  return {
    x: (dx / spanX + 0.5) * width,
    y: view.flipY ? (ny + 0.5) * height : (0.5 - ny) * height,
  };
}

/**
 * Manual zoom stops at a million times; a view already deeper than that (left there by the auto
 * zoom) holds still instead of snapping back out.
 */
function appliedFactor(magnification, factor) {
  const safe = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const ceiling = Math.max(MANUAL_MAGNIFICATION, magnification);
  const next = Math.min(ceiling, Math.max(0.25, magnification * safe));
  return next / Math.max(1e-12, magnification);
}

function fitScale(bounds, width, height) {
  const innerW = Math.max(1, width - FIT_PAD * 2);
  const innerH = Math.max(1, height - FIT_PAD * 2);
  const spanX = Math.max(1e-9, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-9, bounds.maxY - bounds.minY);
  return Math.min(innerW / spanX, innerH / spanY);
}

function fitOffset(bounds, width, height, scale) {
  const innerW = Math.max(1, width - FIT_PAD * 2);
  const innerH = Math.max(1, height - FIT_PAD * 2);
  const drawnW = Math.max(1e-9, bounds.maxX - bounds.minX) * scale;
  const drawnH = Math.max(1e-9, bounds.maxY - bounds.minY) * scale;
  return {
    x: FIT_PAD + (innerW - drawnW) / 2,
    y: FIT_PAD + (innerH - drawnH) / 2,
  };
}
