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

export function paintEscape(paletteId, iterations, basins, width, height, shownIter, rowLimit = height) {
  paletteById(paletteId);
  const data = new Uint8ClampedArray(width * height * 4);
  const limit = Math.max(0, Math.min(height, rowLimit));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      let rgb = INSIDE;
      if (y < limit) {
        const iteration = iterations[index];
        const basin = basins ? basins[index] : -1;
        const shown = iteration > shownIter ? shownIter : iteration;
        const shownBasin = iteration > shownIter ? -1 : basin;
        rgb = colorSample(paletteId, shown, shownIter, shownBasin);
      }
      data[offset] = rgb[0];
      data[offset + 1] = rgb[1];
      data[offset + 2] = rgb[2];
      data[offset + 3] = 255;
    }
  }
  return data;
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
  const map = fitTransform(bounds || boundsOf(paths), width, height, 18);
  if (clear) fillPaper(ctx, width, height);
  let index = 0;
  let total = 0;
  for (const path of paths) total += Math.max(0, path.length / 2 - 1);
  const max = Math.max(1, range?.total ?? total);
  const widthPx = Math.max(1.25, Math.min(width, height) * 0.007);
  let tip = null;
  for (const path of paths) {
    const count = path.length / 2;
    for (let i = 0; i < count - 1; i += 1) {
      const from = map(path[i * 2], path[i * 2 + 1]);
      const to = map(path[i * 2 + 2], path[i * 2 + 3]);
      if (index >= start && index < stop) {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = rgb(colorSample(paletteId, index + 1, max, -1));
        ctx.lineWidth = widthPx;
        ctx.stroke();
        tip = to;
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
    ctx.fillStyle = rgb(colorSample(paletteId, i + 1, Math.max(1, triangles), -1));
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
