const BASE = "#d9cbb3";
const COMPARE = "#f0c14d";
const SWAP = "#ef6f4c";
const WRITE = "#8eb4e8";
const READ = "#e2b657";
const PIVOT = "#c4a1ff";
const SORTED = "#79c2a8";
const PAPER = "#17140f";
const GRID = "#3a332b";

export const VIEWS = [
  { id: "bars", name: "Bars", blurb: "Height is the value.", draw: drawBars },
  { id: "dots", name: "Dots", blurb: "Each value is a point on a shared line.", draw: drawDots },
  { id: "heat", name: "Heat strip", blurb: "Color carries the value. A finished strip stays a gradient, even after a fast sort.", draw: drawHeat },
  { id: "scatter", name: "Scatter", blurb: "Index across, value upward.", draw: drawScatter },
  { id: "radial", name: "Radial", blurb: "Values radiate from the center.", layout: "quadrants", draw: drawRadial },
  { id: "slope", name: "Slope", blurb: "A filled profile of the whole array.", draw: drawSlope },
  { id: "wheel", name: "Color wheel", blurb: "Each value is a hue on a ring. Sorting winds them into one circular gradient.", layout: "quadrants", draw: drawWheel },
];

export function usesQuadrants(viewId) {
  return VIEWS.find((view) => view.id === viewId)?.layout === "quadrants";
}

/**
 * Compare cell for a radial or color-wheel view.
 * Two programs split the canvas into left and right halves.
 * Three or four use quarters, index 0 at the top-left.
 */
export function quadrantFrame(index, width, height, count = 4) {
  if (count === 2) {
    const cellWidth = width / 2;
    return { x: index * cellWidth, y: 0, width: cellWidth, height };
  }
  const cellWidth = width / 2;
  const cellHeight = height / 2;
  const col = index % 2;
  const row = Math.floor(index / 2);
  return { x: col * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight };
}

export function draw(viewId, ctx, frame, width, height) {
  const view = VIEWS.find((item) => item.id === viewId);
  if (!view) throw new Error(`Unknown visualization: ${viewId}`);
  view.draw(ctx, frame, width, height);
}

function prepare(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
}

function maxOf(frame) {
  return Math.max(1, frame.maxValue || 1);
}

function point(frame, index, width, height, pad = 16) {
  const n = frame.array.length;
  const x = n === 1 ? width / 2 : (index / (n - 1)) * (width - pad * 2) + pad;
  const y = height - pad - (frame.array[index] / maxOf(frame)) * (height - pad * 2);
  return { x, y };
}

function colorFor(index, frame) {
  if (frame.indices.includes(index)) {
    if (frame.mark === "swap") return SWAP;
    if (frame.mark === "write") return WRITE;
    if (frame.mark === "read") return READ;
    if (frame.mark === "sorted") return SORTED;
    if (frame.mark === "pivot") return PIVOT;
    return COMPARE;
  }
  if (frame.pivot === index) return PIVOT;
  if (frame.sorted.has(index)) return SORTED;
  return BASE;
}

function heatColor(value, maxValue) {
  const t = Math.min(1, Math.max(0, (value - 1) / Math.max(1, maxValue - 1)));
  if (t < 0.5) return mix("#3ec6c6", "#efe07a", t / 0.5);
  return mix("#efe07a", "#ef5d4a", (t - 0.5) / 0.5);
}

function hueFor(value, maxValue) {
  const t = Math.min(1, Math.max(0, (value - 1) / Math.max(1, maxValue - 1)));
  return Math.round(t * 320);
}

function mix(from, to, t) {
  const a = hex(from);
  const b = hex(to);
  const u = Math.min(1, Math.max(0, t));
  const channels = a.map((channel, i) => Math.round(channel + (b[i] - channel) * u));
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

function hex(value) {
  return [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
}

function drawBars(ctx, frame, width, height) {
  prepare(ctx, width, height);
  const n = frame.array.length;
  if (!n) return;
  const gap = n > 180 ? 0 : 1;
  const slot = width / n;
  const barWidth = Math.max(0.4, slot - gap);
  const max = maxOf(frame);
  for (let i = 0; i < n; i += 1) {
    const barHeight = Math.max(2, (frame.array[i] / max) * (height - 12));
    ctx.fillStyle = colorFor(i, frame);
    ctx.fillRect(i * slot, height - barHeight, barWidth, barHeight);
  }
}

function drawDots(ctx, frame, width, height) {
  prepare(ctx, width, height);
  const n = frame.array.length;
  if (!n) return;
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const { x, y } = point(frame, i, width, height);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#6d6254";
  ctx.lineWidth = 1.25;
  ctx.stroke();
  const radius = n > 240 ? 1.6 : n > 80 ? 2.6 : 4;
  for (let i = 0; i < n; i += 1) {
    const { x, y } = point(frame, i, width, height);
    ctx.beginPath();
    ctx.fillStyle = colorFor(i, frame);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHeat(ctx, frame, width, height) {
  prepare(ctx, width, height);
  const n = frame.array.length;
  if (!n) return;
  const cell = width / n;
  const band = Math.min(height * 0.46, 168);
  const y = (height - band) / 2;
  const gap = n > 240 ? 0 : 1;
  const max = maxOf(frame);
  for (let i = 0; i < n; i += 1) {
    ctx.fillStyle = heatColor(frame.array[i], max);
    ctx.fillRect(i * cell, y, Math.max(0.4, cell - gap), band);
  }
  const cap = Math.max(3, band * 0.12);
  for (const index of frame.indices) {
    if (!Number.isInteger(index) || index < 0 || index >= n) continue;
    ctx.fillStyle = colorFor(index, frame);
    ctx.fillRect(index * cell, y, Math.max(0.4, cell - gap), cap);
  }
}

function drawWheel(ctx, frame, width, height) {
  prepare(ctx, width, height);
  const n = frame.array.length;
  if (!n) return;
  const cx = width / 2;
  const cy = height / 2;
  const outer = Math.max(8, Math.min(width, height) * 0.42);
  const inner = outer * 0.52;
  const gap = n > 80 ? 0 : 0.01;
  const max = maxOf(frame);
  for (let i = 0; i < n; i += 1) {
    const start = -Math.PI / 2 + (i / n) * Math.PI * 2 + gap;
    const end = -Math.PI / 2 + ((i + 1) / n) * Math.PI * 2 - gap;
    const sweep = Math.max(start + 0.001, end);
    ctx.beginPath();
    ctx.arc(cx, cy, outer, start, sweep);
    ctx.arc(cx, cy, inner, sweep, start, true);
    ctx.closePath();
    ctx.fillStyle = `hsl(${hueFor(frame.array[i], max)} 72% 56%)`;
    ctx.fill();
    if (frame.indices.includes(i) || frame.pivot === i) {
      ctx.lineWidth = Math.max(2, outer * 0.045);
      ctx.strokeStyle = colorFor(i, frame);
      ctx.stroke();
    }
  }
}

function drawScatter(ctx, frame, width, height) {
  prepare(ctx, width, height);
  const n = frame.array.length;
  if (!n) return;
  const pad = 36;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, height - pad);
  ctx.lineTo(width - 12, height - pad);
  ctx.stroke();
  ctx.font = "12px Georgia, serif";
  ctx.fillStyle = "#b3a694";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(String(maxOf(frame)), 64, pad - 2);
  ctx.textBaseline = "bottom";
  ctx.fillText("1", 18, height - 8);
  const radius = n > 240 ? 1.8 : 3.4;
  for (let i = 0; i < n; i += 1) {
    const x = pad + (n === 1 ? 0 : (i / (n - 1)) * (width - pad - 20));
    const y = height - pad - (frame.array[i] / maxOf(frame)) * (height - pad * 2);
    ctx.beginPath();
    ctx.fillStyle = colorFor(i, frame);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRadial(ctx, frame, width, height) {
  prepare(ctx, width, height);
  const n = frame.array.length;
  if (!n) return;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.42;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (const ring of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * ring, 0, Math.PI * 2);
    ctx.stroke();
  }
  const dot = n > 240 ? 1.7 : 3.2;
  for (let i = 0; i < n; i += 1) {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const len = (frame.array[i] / maxOf(frame)) * radius;
    const x = cx + Math.cos(angle) * len;
    const y = cy + Math.sin(angle) * len;
    ctx.beginPath();
    ctx.strokeStyle = colorFor(i, frame);
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = colorFor(i, frame);
    ctx.arc(x, y, dot, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSlope(ctx, frame, width, height) {
  prepare(ctx, width, height);
  const n = frame.array.length;
  if (!n) return;
  const pad = 16;
  ctx.beginPath();
  ctx.moveTo(pad, height - pad);
  for (let i = 0; i < n; i += 1) {
    const { x, y } = point(frame, i, width, height, pad);
    ctx.lineTo(x, y);
  }
  const end = point(frame, n - 1, width, height, pad);
  ctx.lineTo(end.x, height - pad);
  ctx.closePath();
  ctx.fillStyle = "rgba(226, 182, 87, 0.18)";
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const { x, y } = point(frame, i, width, height, pad);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#e2b657";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  if (n <= 180) {
    for (let i = 0; i < n; i += 1) {
      const { x, y } = point(frame, i, width, height, pad);
      ctx.beginPath();
      ctx.fillStyle = colorFor(i, frame);
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
