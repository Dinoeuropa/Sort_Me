import { planePoint } from "./fractals.js";

/** Matches the padding drawPaths, drawTriangles, and drawPoints use. */
export const FIT_PAD = 18;

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
  if (anchor) {
    const dist = Math.hypot(view.centerX - anchor.x, view.centerY - anchor.y);
    if (view.scale >= 0.02 || dist > view.scale * 2) {
      x = anchor.x;
      y = anchor.y;
    }
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

export function easeZoom(view, target, factor = 1.012, pull = 0.06) {
  const zoom = Number.isFinite(factor) && factor > 1 ? factor : 1.012;
  const t = Number.isFinite(pull) ? Math.min(1, Math.max(0, pull)) : 0.06;
  return {
    ...view,
    centerX: view.centerX + (target.x - view.centerX) * t,
    centerY: view.centerY + (target.y - view.centerY) * t,
    scale: Math.max(5e-14, view.scale / zoom),
  };
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
