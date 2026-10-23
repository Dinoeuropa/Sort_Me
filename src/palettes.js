const INSIDE = [16, 14, 12];
const PAPER = "#100e0c";
const BASINS = [
  [226, 182, 87],
  [121, 194, 168],
  [142, 180, 232],
];

export const PALETTES = [
  {
    id: "classic",
    name: "Classic",
    blurb: "Brass bands on a dark ground, in the same ink as the sorting charts.",
    paint: classicPaint,
  },
  {
    id: "heat",
    name: "Heat",
    blurb: "Cyan through gold into coral, the same ramp as the sorting heat strip.",
    paint: heatPaint,
  },
  {
    id: "ocean",
    name: "Ocean",
    blurb: "Deep water lightening toward the boundary.",
    paint: oceanPaint,
  },
  {
    id: "ink",
    name: "Ink",
    blurb: "A gray ramp. Late escapes are the lightest.",
    paint: inkPaint,
  },
  {
    id: "hue",
    name: "Color wheel",
    blurb: "Iteration walks around the hue circle.",
    paint: huePaint,
  },
];

export function paletteById(id) {
  const palette = PALETTES.find((item) => item.id === id);
  if (!palette) throw new Error(`Unknown coloring: ${id}`);
  return palette;
}

export function colorSample(paletteId, iteration, maxIter, basin = -1) {
  const palette = paletteById(paletteId);
  const max = Math.max(1, maxIter);
  const iter = Math.max(0, iteration);
  if (basin >= 0) {
    const hue = BASINS[((basin % 3) + 3) % 3];
    const lift = 0.4 + 0.6 * (1 - Math.min(1, iter / max));
    return hue.map((channel) => clampChannel(channel * lift));
  }
  if (iter >= max) return INSIDE.slice();
  return palette.paint(iter, max);
}

/** A plate whose sampled iterations span less than this share of the cap gets a fitted palette. */
const WINDOW_SPREAD = 0.25;

/**
 * The iteration range to spread a palette over, from a grid of sampled iterations and the cap.
 * Samples at the cap are inside and keep their own color, so only the escaped ones count. The
 * range runs from a little under their fifth percentile to a little over their ninety-fifth, and
 * on to the cap when that is no farther than twice the samples' width, so the pixels closest to
 * the set keep their own shades. It eases in as they crowd together: a plate whose escapes cover a quarter of the cap or more keeps
 * the whole cap, so an ordinary picture is colored exactly as before, and one whose escapes cover
 * an eighth or less is fitted in full. The top comes down geometrically, so the brightening it
 * brings is even. `weight` scales the fit down, so a dive can begin with the palette it had
 * before diving and fit it as it goes.
 */
export function paletteWindow(samples, cap, weight = 1) {
  const max = Math.max(1, cap | 0);
  const whole = { floor: 0, top: max };
  if (!samples || samples.length === 0 || !(weight > 0)) return whole;
  const escaped = [];
  for (const value of samples) {
    const iter = Math.max(0, value | 0);
    if (iter < max) escaped.push(iter);
  }
  if (escaped.length < 3) return whole;
  escaped.sort((a, b) => a - b);
  const low = escaped[Math.floor(escaped.length * 0.05)];
  const high = escaped[Math.min(escaped.length - 1, Math.floor(escaped.length * 0.95))];
  const spread = (high - low) / max;
  if (spread >= WINDOW_SPREAD) return whole;
  const ease = Math.min(1, (WINDOW_SPREAD - spread) / (WINDOW_SPREAD / 2)) * Math.min(1, weight);
  const pad = Math.max(1, (high - low) * 0.1, max * 0.002);
  const fittedFloor = Math.max(0, low - pad);
  const gap = max - (high + pad);
  const hold = Math.min(1, Math.max(0, 2 - gap / (2 * Math.max(1, high - low, pad))));
  const fittedTop = high + pad + gap * hold;
  const floor = Math.round(fittedFloor * ease);
  const top = Math.round(max * (fittedTop / max) ** ease);
  return { floor: Math.min(floor, max - 1), top: Math.max(floor + 1, Math.min(max, top)) };
}

/**
 * Color an iteration grid. `floorIter` is where the palette starts: iterations at or below it take
 * the first color. The ramp runs from there to `topIter`, or to `shownIter` when no top is given,
 * and iterations past the top take its last color. Pixels at `shownIter` are inside.
 */
export function paintEscape(
  paletteId,
  iterations,
  basins,
  width,
  height,
  shownIter,
  rowLimit = height,
  revealIter = null,
  floorIter = 0,
  topIter = null,
) {
  paletteById(paletteId);
  const data = new Uint8ClampedArray(width * height * 4);
  const limit = Math.max(0, Math.min(height, rowLimit));
  const max = Math.max(1, shownIter);
  const span = max + 1;
  const floor = Math.min(Math.max(0, floorIter | 0), max - 1);
  const top = topIter == null ? max : Math.min(max, Math.max(floor + 1, topIter | 0));
  const range = top - floor;
  const lut = new Uint8ClampedArray(4 * span * 3);
  for (let iter = 0; iter < span; iter += 1) {
    const lifted = Math.max(0, iter - floor);
    const inside = iter >= max;
    const value = inside ? lifted : Math.min(lifted, range);
    const over = inside ? lifted : top < max ? range + 1 : range;
    writeLut(lut, span, 3, iter, colorSample(paletteId, value, over, -1));
    for (let basin = 0; basin < 3; basin += 1) {
      writeLut(lut, span, basin, iter, colorSample(paletteId, value, over, basin));
    }
  }
  const revealing = revealIter != null;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const visible = y < limit;
    for (let x = 0; x < width; x += 1) {
      const index = row + x;
      const offset = index * 4;
      let slot = 3;
      let iter = max;
      if (visible) {
        const iteration = iterations[index];
        const basin = basins ? basins[index] : -1;
        if (revealing && iteration > revealIter) {
          iter = max;
          slot = 3;
        } else if (!revealing && iteration > shownIter) {
          iter = shownIter > max ? max : shownIter;
          if (iter < 0) iter = 0;
          slot = 3;
        } else {
          iter = iteration > max ? max : iteration;
          if (iter < 0) iter = 0;
          slot = basin >= 0 ? ((basin % 3) + 3) % 3 : 3;
        }
      }
      const sample = (slot * span + iter) * 3;
      data[offset] = lut[sample];
      data[offset + 1] = lut[sample + 1];
      data[offset + 2] = lut[sample + 2];
      data[offset + 3] = 255;
    }
  }
  return data;
}

function segmentHits(from, to, width, height, pad) {
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);
  return maxX >= -pad && minX <= width + pad && maxY >= -pad && minY <= height + pad;
}

function writeLut(lut, span, slot, iter, rgb) {
  const offset = (slot * span + iter) * 3;
  lut[offset] = rgb[0];
  lut[offset + 1] = rgb[1];
  lut[offset + 2] = rgb[2];
}

export function fitTransform(bounds, width, height, pad = 16) {
  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);
  const spanX = Math.max(1e-9, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-9, bounds.maxY - bounds.minY);
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const offsetX = pad + (innerW - drawnW) / 2;
  const offsetY = pad + (innerH - drawnH) / 2;
  return (x, y) => ({
    x: offsetX + (x - bounds.minX) * scale,
    y: offsetY + (bounds.maxY - y) * scale,
  });
}

export function boundsOf(paths) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    for (let i = 0; i < path.length; i += 2) {
      const x = path[i];
      const y = path[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  if (maxX === minX) maxX += 1;
  if (maxY === minY) maxY += 1;
  return { minX, maxX, minY, maxY };
}

export function drawPaths(paletteId, ctx, paths, width, height, bounds, range) {
  const start = range?.from ?? 0;
  const stop = range?.until ?? Infinity;
  const clear = range?.clear !== undefined ? range.clear : start === 0;
  const pad = range?.pad ?? 18;
  const map = fitTransform(bounds || boundsOf(paths), width, height, pad);
  const cull = range?.cull === true;
  if (clear) fillPaper(ctx, width, height);
  let index = 0;
  let total = 0;
  for (const path of paths) total += Math.max(0, path.length / 2 - 1);
  const max = Math.max(2, (range?.total ?? total) + 1);
  const widthPx = Math.max(1.25, Math.min(width, height) * 0.007);
  let tip = null;
  for (const path of paths) {
    const count = path.length / 2;
    for (let i = 0; i < count - 1; i += 1) {
      if (index >= start && index < stop) {
        const from = map(path[i * 2], path[i * 2 + 1]);
        const to = map(path[i * 2 + 2], path[i * 2 + 3]);
        if (!cull || segmentHits(from, to, width, height, pad)) {
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.strokeStyle = rgb(colorSample(paletteId, index + 1, max, -1));
          ctx.lineWidth = widthPx;
          ctx.stroke();
          tip = to;
        }
      }
      index += 1;
      if (index >= stop) break;
    }
    if (index >= stop) break;
  }
  if (range?.tip && tip) {
    ctx.beginPath();
    ctx.fillStyle = "#e2b657";
    ctx.arc(tip.x, tip.y, Math.max(2.4, widthPx * 1.8), 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawTriangles(paletteId, ctx, vertices, width, height, bounds, range) {
  const start = range?.from ?? 0;
  const stop = range?.until ?? Infinity;
  const clear = range?.clear !== undefined ? range.clear : start === 0;
  const map = fitTransform(bounds || boundsOf([vertices]), width, height, 18);
  if (clear) fillPaper(ctx, width, height);
  const available = vertices.length / 6;
  const triangles = range?.total ?? available;
  const last = Math.min(available, stop);
  for (let i = start; i < last; i += 1) {
    const offset = i * 6;
    const a = map(vertices[offset], vertices[offset + 1]);
    const b = map(vertices[offset + 2], vertices[offset + 3]);
    const c = map(vertices[offset + 4], vertices[offset + 5]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fillStyle = rgb(colorSample(paletteId, i + 1, Math.max(2, triangles + 1), -1));
    ctx.fill();
  }
}

export function drawPoints(paletteId, ctx, points, bounds, width, height, range) {
  const map = fitTransform(bounds, width, height, 18);
  const clear = range?.clear !== undefined ? range.clear : true;
  if (clear) fillPaper(ctx, width, height);
  const count = points.length / 2;
  const planned = range?.total ?? count;
  const size = planned > 12000 ? 1 : 1.6;
  const span = Math.max(1e-9, bounds.maxY - bounds.minY);
  for (let i = 0; i < count; i += 1) {
    const y = points[i * 2 + 1];
    const point = map(points[i * 2], y);
    const along = Math.round(((y - bounds.minY) / span) * 70) + 1;
    ctx.fillStyle = rgb(colorSample(paletteId, along, 72, -1));
    ctx.fillRect(point.x, point.y, size, size);
  }
}

function fillPaper(ctx, width, height) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
}

function rgb(channels) {
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

function classicPaint(iter, max) {
  const t = Math.min(1, iter / max);
  const band = 0.72 + 0.28 * Math.sin(iter * 0.7);
  const dark = [24, 20, 16];
  const brass = [226, 182, 87];
  const coral = [239, 111, 76];
  const cream = [246, 239, 228];
  if (t < 0.35) return mix(dark, brass, (t / 0.35) * band);
  if (t < 0.75) return mix(brass, coral, ((t - 0.35) / 0.4) * band);
  return mix(coral, cream, (t - 0.75) / 0.25);
}

function heatPaint(iter, max) {
  const t = iter / max;
  if (t < 0.5) return mix([62, 198, 198], [239, 224, 122], t / 0.5);
  return mix([239, 224, 122], [239, 93, 74], (t - 0.5) / 0.5);
}

function oceanPaint(iter, max) {
  const t = iter / max;
  if (t < 0.5) return mix([6, 40, 61], [19, 99, 223], t / 0.5);
  return mix([19, 99, 223], [223, 246, 255], (t - 0.5) / 0.5);
}

function inkPaint(iter, max) {
  const value = clampChannel(36 + 200 * (iter / max));
  return [value, value, value];
}

function huePaint(iter, max) {
  return hsl((iter / max) * 300, 0.7, 0.56);
}

function mix(from, to, t) {
  const u = Math.min(1, Math.max(0, t));
  return from.map((channel, index) => clampChannel(channel + (to[index] - channel) * u));
}

function hsl(hue, sat, light) {
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = (((hue % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = light - c / 2;
  return [r, g, b].map((channel) => clampChannel((channel + m) * 255));
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
