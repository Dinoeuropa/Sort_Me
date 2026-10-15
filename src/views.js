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
  { id: "heat", name: "Heat strip", blurb: "Color carries the value from left to right.", draw: drawHeat },
  { id: "scatter", name: "Scatter", blurb: "Index across, value upward.", draw: drawScatter },
  { id: "radial", name: "Radial", blurb: "Values radiate from the center.", draw: drawRadial },
  { id: "slope", name: "Slope", blurb: "A filled profile of the whole array.", draw: drawSlope },
];

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
  const t = (value - 1) / Math.max(1, maxValue - 1);
  if (t < 0.5) return mix("#314056", "#e2b657", t / 0.5);
  return mix("#e2b657", "#e36a4a", (t - 0.5) / 0.5);
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
  for (let i = 0; i < n; i += 1) {
    const highlighted = frame.indices.includes(i) || frame.sorted.has(i) || frame.pivot === i;
    ctx.fillStyle = highlighted ? colorFor(i, frame) : heatColor(frame.array[i], maxOf(frame));
    ctx.fillRect(i * cell, y, Math.max(0.4, cell - gap), band);
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
  ctx.fillText(String(maxOf(frame)), 6, pad - 2);
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
