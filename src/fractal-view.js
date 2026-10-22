import { planePoint } from "./fractals.js";

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
};

export function escapeWindow(preset) {
  return {
    centerX: preset.centerX,
    centerY: preset.centerY,
    scale: preset.scale,
    flipY: Boolean(preset.flipY),
  };
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

/** Iterations for a continuous zoom. Grows with log2 of magnification for as long as the zoom runs. */
export function autoZoomIterations(baseDepth, magnification) {
  return iterationCap(baseDepth, magnification);
}

/** Octaves of zoom per frame at full pace. Sixty frames about double the view. */
export const AUTO_OCTAVES_PER_FRAME = Math.log2(AUTO_ZOOM_STEP);

/** How much wider than the camera an auto-zoom plate is rendered, so the view can move inside it. */
export const PLATE_SCALE = 1.65;

/** Octaves over which the target slides from where it started to the middle of the frame. */
const AUTO_ENTER_OCTAVES = 4;

/** Octaves at either end of the path over which the pace eases to a crawl. */
const AUTO_TURN_OCTAVES = 2.5;

/**
 * A fixed path from the starting view into a target point.
 * The scale falls exponentially with `octave`, and the target drifts to the center of the frame
 * on a smooth curve. Nothing is measured while zooming, so the camera never re-aims.
 * `floor` keeps the pixel size above what a double can tell apart.
 */
export function autoZoomPath(start, target, floor = 5e-12) {
  const reach = Math.max(1, Math.hypot(target.x, target.y));
  const minScale = Math.max(Number(floor) || 5e-12, 0) * reach;
  const maxOctave = Math.max(1, Math.log2(start.scale / minScale));
  return {
    start: { centerX: start.centerX, centerY: start.centerY, scale: start.scale, flipY: Boolean(start.flipY) },
    target: { x: target.x, y: target.y },
    offsetX: (target.x - start.centerX) / start.scale,
    offsetY: (target.y - start.centerY) / start.scale,
    maxOctave,
  };
}

/** The camera at a point on the path. */
export function autoZoomView(path, octave) {
  const o = Math.min(path.maxOctave, Math.max(0, Number.isFinite(octave) ? octave : 0));
  const p = Math.min(1, o / AUTO_ENTER_OCTAVES);
  const keep = 1 - p * p * (3 - 2 * p);
  const scale = path.start.scale * 2 ** -o;
  return {
    centerX: path.target.x - path.offsetX * keep * scale,
    centerY: path.target.y - path.offsetY * keep * scale,
    scale,
    flipY: path.start.flipY,
  };
}

/** Next position on the path. The pace eases down near both ends, and `done` marks the deepest point. */
export function advanceAutoZoom(path, octave, frames, pace = 1) {
  const left = path.maxOctave - octave;
  const ease = Math.min(
    1,
    0.1 + 0.9 * Math.min(1, left / AUTO_TURN_OCTAVES),
    0.1 + 0.9 * Math.min(1, octave / AUTO_TURN_OCTAVES),
  );
  const next = octave + AUTO_OCTAVES_PER_FRAME * Math.max(0, frames) * pace * ease;
  if (next >= path.maxOctave) return { octave: path.maxOctave, done: true };
  return { octave: next, done: false };
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
export function coverViews(views, aspect = 1) {
  const camera = views[0];
  const safeAspect = aspect > 0 ? aspect : 1;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const view of views) {
    const halfX = view.scale * safeAspect * 0.5;
    const halfY = view.scale * 0.5;
    minX = Math.min(minX, view.centerX - halfX);
    maxX = Math.max(maxX, view.centerX + halfX);
    minY = Math.min(minY, view.centerY - halfY);
    maxY = Math.max(maxY, view.centerY + halfY);
  }
  const spanX = (maxX - minX) * 1.08;
  const spanY = (maxY - minY) * 1.08;
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    scale: Math.max(spanY, spanX / safeAspect, camera.scale * PLATE_SCALE),
    flipY: Boolean(camera.flipY),
  };
}

/** True when the camera rectangle sits inside the plate, including a zoomed-in camera. */
export function plateCovers(plate, view, aspect = 1) {
  if (!plate || !view || !(plate.scale > 0) || !(view.scale > 0)) return false;
  const safeAspect = aspect > 0 ? aspect : 1;
  const plateAspect = plate.width > 0 && plate.height > 0 ? plate.width / plate.height : safeAspect;
  const plateHalfX = plate.scale * plateAspect * 0.5;
  const plateHalfY = plate.scale * 0.5;
  const camHalfX = view.scale * safeAspect * 0.5;
  const camHalfY = view.scale * 0.5;
  const marginX = plateHalfX - camHalfX - Math.abs(view.centerX - plate.centerX);
  const marginY = plateHalfY - camHalfY - Math.abs(view.centerY - plate.centerY);
  return marginX >= -1e-9 && marginY >= -1e-9;
}

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

/** Spend part of a pending zoom. One frame stays inside a fractal level. */
export function easeFactor(pending, rate = 0.22) {
  const safe = Number.isFinite(pending) && pending > 0 ? pending : 1;
  if (Math.abs(Math.log(safe)) < 0.004) return { applied: safe, rest: 1 };
  let applied = Math.exp(Math.log(safe) * rate);
  const cap = 1.06;
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
  const left = plate.centerX - spanX / 2;
  const right = plate.centerX + spanX / 2;
  const topY = plate.centerY + (plate.flipY ? -spanY / 2 : spanY / 2);
  const botY = plate.centerY + (plate.flipY ? spanY / 2 : -spanY / 2);
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
export function levelBlend(fractalId, magnification) {
  const ratio = RATIOS[fractalId];
  if (!ratio || !(magnification > 0)) return { extra: 0, fade: 0 };
  const t = Math.log(Math.max(1, magnification)) / Math.log(ratio);
  if (!Number.isFinite(t) || t <= 0) return { extra: 0, fade: 0 };
  const extra = Math.floor(t + 1e-9);
  const fade = Math.min(1, Math.max(0, t - extra));
  return { extra, fade: fade < 1e-9 ? 0 : fade };
}

export function recursionLevel(fractalId, baseDepth, magnification, minDepth, maxDepth) {
  const ratio = RATIOS[fractalId];
  const extra = ratio
    ? Math.max(0, Math.floor(Math.log(Math.max(1, magnification)) / Math.log(ratio) + 1e-9))
    : 0;
  return Math.min(maxDepth, Math.max(minDepth, baseDepth + extra));
}

export function pointBudget(baseCount, magnification, maxCount) {
  const scaled = Math.round(baseCount * Math.min(6, Math.max(1, magnification)));
  return Math.min(maxCount, Math.max(baseCount, scaled));
}

export function zoomEscape(view, factor, px, py, width, height, homeScale) {
  const before = planePoint(view, width, height, px, py);
  const applied = appliedFactor(escapeMagnification({ scale: homeScale }, view), factor);
  const next = { ...view, scale: view.scale / applied };
  const after = planePoint(next, width, height, px, py);
  return {
    ...next,
    centerX: next.centerX + (before.x - after.x),
    centerY: next.centerY + (before.y - after.y),
  };
}

export function panEscape(view, dx, dy, width, height) {
  const spanY = view.scale;
  const spanX = view.scale * (width / Math.max(1, height));
  const ySign = view.flipY ? -1 : 1;
  return {
    ...view,
    centerX: view.centerX - (dx / Math.max(1, width)) * spanX,
    centerY: view.centerY + ySign * (dy / Math.max(1, height)) * spanY,
  };
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

function worldToPixel(view, width, height, wx, wy) {
  const spanY = view.scale;
  const spanX = spanY * (width / Math.max(1, height));
  const ny = (wy - view.centerY) / spanY;
  return {
    x: ((wx - view.centerX) / spanX + 0.5) * width,
    y: view.flipY ? (ny + 0.5) * height : (0.5 - ny) * height,
  };
}

function appliedFactor(magnification, factor) {
  const safe = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const next = Math.min(1e6, Math.max(0.25, magnification * safe));
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
