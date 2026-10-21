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
