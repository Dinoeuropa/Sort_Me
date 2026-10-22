import { planePoint } from "./fractals.js";

/** Matches the padding drawPaths, drawTriangles, and drawPoints use. */
export const FIT_PAD = 18;

/** Long edge while a fractal is still being drawn. */
export const DRAW_RASTER_EDGE = 960;

/** Long edge of a finished, zoomed, or reactive picture. 3840 is 4K. */
export const SHARP_RASTER_EDGE = 3840;

/** Magnification per auto-zoom frame. Sixty frames about double the view. */
export const AUTO_ZOOM_STEP = 1.012;

/** How much of the remaining gap to the target is closed each auto-zoom frame. */
export const AUTO_ZOOM_PULL = 0.05;

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

export function iterationCap(baseDepth, magnification) {
  const extra = Math.max(0, Math.round(Math.log2(Math.max(1, magnification)) * 18));
  return Math.min(500, Math.max(1, baseDepth + extra));
}

/** Iterations for a continuous zoom. Grows with log2 of magnification, clamped at 500. */
export function autoZoomIterations(baseDepth, magnification) {
  return iterationCap(baseDepth, magnification);
}

/** Seahorse valley spiral. Early Mandelbrot zooms steer here, then follow finer detail. */
export const NAUTILUS = { x: -0.743643887037151, y: 0.131825904205330 };

/** How much wider than the camera an auto-zoom plate is rendered, so the view can move inside it. */
export const PLATE_SCALE = 1.65;

/** Long edge of the plate drawn while auto zoom is moving. Smaller than the settled 4K picture so the next frame arrives quickly. */
export const AUTO_ZOOM_RASTER_EDGE = 1920;

const ZOOM_PATTERNS = {
  mandelbrot: [
    { id: "seahorse", name: "Seahorse spiral", x: NAUTILUS.x, y: NAUTILUS.y },
    { id: "mini", name: "Mini Mandelbrot", x: -1.768778833, y: 0.001738915 },
    { id: "elephant", name: "Elephant valley", x: 0.25, y: 0 },
    { id: "detail", name: "Nearest detail" },
  ],
  julia: [
    { id: "detail", name: "Nearest detail" },
    { id: "right", name: "Right spiral", bias: { x: 0.82, y: 0.5 } },
    { id: "upper", name: "Upper spiral", bias: { x: 0.5, y: 0.18 } },
    { id: "left", name: "Left spiral", bias: { x: 0.18, y: 0.5 } },
  ],
  burning: [
    { id: "detail", name: "Along the hull" },
    { id: "wreck", name: "Wreck", x: -1.762, y: -0.028 },
    { id: "mast", name: "Mast", x: -1.45, y: -0.003 },
  ],
  newton: [
    { id: "detail", name: "Basin edge" },
    { id: "junction", name: "Triple point", x: 0, y: 0 },
    { id: "pinch", name: "Pinch", x: 0.42, y: 0.36 },
  ],
};

/** Named recursive targets for auto zoom. An entry without x follows whatever detail is in frame. */
export function zoomPatterns(fractalId) {
  return ZOOM_PATTERNS[fractalId] || [];
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function detailTarget(iterations, basins, width, height, view, maxIter, kind) {
  const cap = Math.max(1, maxIter);
  let best = 0;
  let bx = width / 2;
  let by = height / 2;
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 28));
  for (let y = 1; y < height - 1; y += stride) {
    for (let x = 1; x < width - 1; x += stride) {
      const score = pixelDetail(iterations, basins, width, height, x, y, cap, kind);
      if (score > best) {
        best = score;
        bx = x;
        by = y;
      }
    }
  }
  if (best <= 0) return { x: view.centerX, y: view.centerY, score: 0 };
  const point = planePoint(view, width, height, bx, by);
  return { x: point.x, y: point.y, score: best };
}

export function steerZoomTarget(detail, view, options = {}) {
  const anchor = options.anchor || null;
  let x = detail.x;
  let y = detail.y;
  if (anchor && view.scale >= 0.02) {
    x = anchor.x;
    y = anchor.y;
  }
  const bias = options.bias;
  if (bias && Number.isFinite(bias.x) && Number.isFinite(bias.y)) {
    const aspect = options.aspect > 0 ? options.aspect : 1;
    const spanX = view.scale * aspect;
    const spanY = view.scale;
    const ySign = view.flipY ? 1 : -1;
    const bx = view.centerX + (bias.x - 0.5) * spanX * 0.5;
    const by = view.centerY + ySign * (bias.y - 0.5) * spanY * 0.5;
    const weight = anchor && view.scale >= 0.02 ? 0.12 : 0.4;
    x = x * (1 - weight) + bx * weight;
    y = y * (1 - weight) + by * weight;
  }
  return { x, y, score: detail.score || 0 };
}

/** Keep the next aim near the camera so a new plate cannot yank the view to another filament. */
export function steadyAim(previous, picked, camera) {
  const span = Math.max(1e-12, camera?.scale || 1);
  let x = Number.isFinite(picked?.x) ? picked.x : camera.centerX;
  let y = Number.isFinite(picked?.y) ? picked.y : camera.centerY;
  const lead = Math.hypot(x - camera.centerX, y - camera.centerY);
  const reach = span * 0.18;
  if (lead > reach) {
    const keep = reach / lead;
    x = camera.centerX + (x - camera.centerX) * keep;
    y = camera.centerY + (y - camera.centerY) * keep;
  }
  if (previous && Number.isFinite(previous.x) && Number.isFinite(previous.y)) {
    const step = span * 0.08;
    const dx = x - previous.x;
    const dy = y - previous.y;
    const dist = Math.hypot(dx, dy);
    if (dist > step) {
      x = previous.x + (dx / dist) * step;
      y = previous.y + (dy / dist) * step;
    }
  }
  return { x, y, score: picked?.score || 0 };
}

export function easeZoom(view, target, factor = AUTO_ZOOM_STEP, pull = AUTO_ZOOM_PULL) {
  const zoom = Number.isFinite(factor) && factor > 1 ? factor : AUTO_ZOOM_STEP;
  const t = Number.isFinite(pull) ? Math.min(1, Math.max(0, pull)) : AUTO_ZOOM_PULL;
  return {
    ...view,
    centerX: view.centerX + (target.x - view.centerX) * t,
    centerY: view.centerY + (target.y - view.centerY) * t,
    scale: Math.max(5e-14, view.scale / zoom),
  };
}

/** A plate that contains the camera and is shifted a little toward the next pattern. */
export function plateWindow(camera, aim, aspect = 1) {
  const safeAspect = aspect > 0 ? aspect : 1;
  const halfX = camera.scale * safeAspect * 0.5;
  const halfY = camera.scale * 0.5;
  const dx = (aim?.x ?? camera.centerX) - camera.centerX;
  const dy = (aim?.y ?? camera.centerY) - camera.centerY;
  const shiftX = Math.max(-halfX * 0.4, Math.min(halfX * 0.4, dx));
  const shiftY = Math.max(-halfY * 0.4, Math.min(halfY * 0.4, dy));
  return {
    centerX: camera.centerX + shiftX,
    centerY: camera.centerY + shiftY,
    scale: camera.scale * PLATE_SCALE,
    flipY: Boolean(camera.flipY),
  };
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

/** True while the camera still has spare picture around every edge. */
export function plateHasRoom(plate, view, aspect = 1) {
  if (!plate || !view || !(plate.scale > 0) || !(view.scale > 0)) return false;
  if (plate.scale / view.scale < 1.12) return false;
  const safeAspect = aspect > 0 ? aspect : 1;
  const plateAspect = plate.width > 0 && plate.height > 0 ? plate.width / plate.height : safeAspect;
  const plateHalfX = plate.scale * plateAspect * 0.5;
  const plateHalfY = plate.scale * 0.5;
  const camHalfX = view.scale * safeAspect * 0.5;
  const camHalfY = view.scale * 0.5;
  const marginX = plateHalfX - camHalfX - Math.abs(view.centerX - plate.centerX);
  const marginY = plateHalfY - camHalfY - Math.abs(view.centerY - plate.centerY);
  return marginX > camHalfX * 0.12 && marginY > camHalfY * 0.12;
}

/** Where the camera will be after `seconds` of auto zoom, so the next plate can cover that view. */
export function aheadView(view, target, seconds = 0.35) {
  const frames = Math.max(0, Number(seconds) || 0) * 60;
  const step = AUTO_ZOOM_STEP ** frames;
  const pull = 1 - (1 - AUTO_ZOOM_PULL) ** frames;
  return easeZoom(view, target, step, pull);
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

/** Long edge of every auto-zoom plate. One size, so the picture does not step while the zoom runs. */
export function plateRasterEdge() {
  return 2560;
}

/** Zoom factor for one frame. Brisk by default, and only slower when the last plate was too slow to keep up. */
export function zoomStepForPlate(room, durationMs, frameMs = 16.7) {
  const span = Number.isFinite(room) && room > 1.02 ? room : PLATE_SCALE;
  const frames = Math.max(8, (Number(durationMs) > 0 ? durationMs : 480) / Math.max(8, frameMs));
  const matched = Math.pow(span, 1 / frames);
  return Math.min(AUTO_ZOOM_STEP, Math.max(1.006, matched));
}

/** Pan speed that crosses the spare plate room over the same render, and no faster. */
export function glidePull(gap, room, frames) {
  if (!(gap > 0) || !(room > 0)) return 0;
  const steps = Math.max(8, frames);
  return Math.min(AUTO_ZOOM_PULL, (room / steps) / gap);
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

function pixelDetail(iterations, basins, width, height, x, y, maxIter, kind) {
  const index = y * width + x;
  const here = iterations[index];
  const basin = basins[index];
  let boundary = 0;
  let variation = 0;
  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const next = ny * width + nx;
    if (kind === "newton") {
      if (basins[next] !== basin) boundary += 1;
    } else {
      variation += Math.abs(iterations[next] - here);
      if (here < maxIter && iterations[next] < maxIter && iterations[next] !== here) boundary += 1;
    }
  }
  if (kind === "newton") return boundary * (1 + here / maxIter);
  if (here >= maxIter || here < 2) return 0;
  return (here / maxIter) * variation * (boundary > 0 ? 1 : 0);
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
