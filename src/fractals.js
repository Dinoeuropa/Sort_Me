const NEWTON_ROOTS = [
  [1, 0],
  [-0.5, Math.sqrt(3) / 2],
  [-0.5, -Math.sqrt(3) / 2],
];

const FERN_CLASSIC = [
  { a: 0, b: 0, c: 0, d: 0.16, e: 0, f: 0, p: 0.01 },
  { a: 0.85, b: 0.04, c: -0.04, d: 0.85, e: 0, f: 1.6, p: 0.85 },
  { a: 0.2, b: -0.26, c: 0.23, d: 0.22, e: 0, f: 1.6, p: 0.07 },
  { a: -0.15, b: 0.28, c: 0.26, d: 0.24, e: 0, f: 0.44, p: 0.07 },
];

const FERN_LEPTO = [
  { a: 0, b: 0, c: 0, d: 0.25, e: 0, f: -0.4, p: 0.02 },
  { a: 0.95, b: 0.005, c: -0.005, d: 0.93, e: -0.002, f: 0.5, p: 0.84 },
  { a: 0.035, b: -0.2, c: 0.16, d: 0.04, e: -0.09, f: 0.02, p: 0.07 },
  { a: -0.04, b: 0.2, c: 0.16, d: 0.04, e: 0.083, f: 0.12, p: 0.07 },
];

const TREE_ANGLE = Math.PI / 6;
const TREE_SCALE = 0.68;

function treeBranch(sign, probability) {
  const cosine = Math.cos(sign * TREE_ANGLE);
  const sine = Math.sin(sign * TREE_ANGLE);
  return {
    a: TREE_SCALE * cosine,
    b: -TREE_SCALE * sine,
    c: TREE_SCALE * sine,
    d: TREE_SCALE * cosine,
    e: 0,
    f: 1,
    p: probability,
  };
}

const FERN_TREE = [
  { a: 0.02, b: 0, c: 0, d: 0.5, e: 0, f: 0, p: 0.08 },
  treeBranch(1, 0.46),
  treeBranch(-1, 0.46),
];

const FERN_BOUNDS = { minX: -2.55, maxX: 2.85, minY: -0.2, maxY: 10.4 };
const LEPTO_BOUNDS = { minX: -2.2, maxX: 2.2, minY: -1, maxY: 8 };
const TREE_BOUNDS = { minX: -1.95, maxX: 1.95, minY: -0.05, maxY: 3.25 };

export const FRACTALS = [
  {
    id: "mandelbrot",
    name: "Mandelbrot set",
    kind: "escape",
    latex: "z_{n+1}=z_n^2+c",
    blurb: "Square z and add the pixel. Points that stay bounded form the set.",
    note: "Depth is the escape-time cap. Move the cursor to see the Julia set of that point. Choose a pattern, then auto zoom into that copy.",
    depthLabel: "Iterations",
    legend: ["Inside", "Early", "Late"],
    minDepth: 8,
    maxDepth: 120,
    defaultDepth: 48,
    frame: "raster",
    presets: [
      { id: "classic", name: "Classic", centerX: -0.75, centerY: 0, scale: 2.6 },
      { id: "seahorse", name: "Seahorse", centerX: -0.75, centerY: 0.11, scale: 0.22 },
      { id: "mini", name: "Mini", centerX: -1.7687788, centerY: 0.0017389, scale: 0.012 },
    ],
  },
  {
    id: "julia",
    name: "Julia set",
    kind: "escape",
    latex: "z_{n+1}=z_n^2+c",
    blurb: "The same map as the Mandelbrot set, with c fixed and the pixel as z.",
    note: "Move the cursor to choose c on the Mandelbrot window. Depth is how long z is allowed to wander.",
    depthLabel: "Iterations",
    legend: ["Inside", "Early", "Late"],
    minDepth: 8,
    maxDepth: 120,
    defaultDepth: 48,
    frame: "raster",
    presets: [
      { id: "disk", name: "Disk", centerX: 0, centerY: 0, scale: 3.2, cx: 0, cy: 0 },
      { id: "rabbit", name: "Rabbit", centerX: 0, centerY: 0, scale: 3.2, cx: -0.123, cy: 0.745 },
      { id: "siegel", name: "Siegel", centerX: 0, centerY: 0, scale: 3.2, cx: -0.391, cy: -0.587 },
    ],
  },
  {
    id: "burning",
    name: "Burning ship",
    kind: "escape",
    latex: "z_{n+1}=(|\\operatorname{Re} z_n|+i|\\operatorname{Im} z_n|)^2+c",
    blurb: "A Mandelbrot cousin that folds both axes before squaring.",
    note: "Move the cursor to choose c. Depth is the escape-time cap. The ship points up because the view is flipped.",
    depthLabel: "Iterations",
    legend: ["Inside", "Early", "Late"],
    minDepth: 8,
    maxDepth: 120,
    defaultDepth: 48,
    frame: "raster",
    presets: [
      { id: "ship", name: "Ship", centerX: -0.45, centerY: -0.55, scale: 3.3, flipY: true },
      { id: "wreck", name: "Wreck", centerX: -1.762, centerY: -0.028, scale: 0.16, flipY: true },
      { id: "mast", name: "Mast", centerX: -1.45, centerY: -0.003, scale: 0.06, flipY: true },
    ],
  },
  {
    id: "newton",
    name: "Newton fractal",
    kind: "escape",
    latex: "z_{n+1}=z_n-\\frac{z_n^3-1}{3z_n^2}",
    blurb: "Newton’s method for z³ − 1. Color is the root the pixel falls into.",
    note: "Move the cursor to bend z³ − 1 a little. The three roots stay. Depth is the iteration cap.",
    depthLabel: "Iterations",
    legend: ["Root 1", "Root ω", "Root ω²"],
    minDepth: 4,
    maxDepth: 40,
    defaultDepth: 16,
    frame: "raster",
    presets: [
      { id: "roots", name: "Roots", centerX: 0, centerY: 0, scale: 3.4 },
      { id: "pinch", name: "Pinch", centerX: 0.42, centerY: 0.36, scale: 0.85 },
      { id: "offset", name: "Offset", centerX: -0.62, centerY: 0.48, scale: 1.35 },
    ],
  },
  {
    id: "koch",
    name: "Koch snowflake",
    kind: "curve",
    latex: "\\dim=\\frac{\\log 4}{\\log 3}",
    blurb: "Replace the middle third of every segment with two sides of an equilateral bump.",
    note: "Depth is how many times each segment is replaced.",
    depthLabel: "Depth",
    legend: ["Start", "Middle", "End"],
    minDepth: 0,
    maxDepth: 6,
    defaultDepth: 4,
    frame: "final",
    presets: [
      { id: "snowflake", name: "Snowflake", mode: "snowflake" },
      { id: "curve", name: "Curve", mode: "curve" },
      { id: "inward", name: "Inward", mode: "inward" },
    ],
  },
  {
    id: "dragon",
    name: "Dragon curve",
    kind: "curve",
    latex: "\\dim=2",
    blurb: "Fold a strip of paper in half, again and again, then open each fold to a right angle.",
    note: "Depth is the number of folds. The twin draws a second copy turned halfway around.",
    depthLabel: "Depth",
    legend: ["Start", "Middle", "End"],
    minDepth: 0,
    maxDepth: 14,
    defaultDepth: 10,
    frame: "final",
    presets: [
      { id: "heighway", name: "Heighway", mode: "heighway" },
      { id: "mirrored", name: "Mirrored", mode: "mirrored" },
      { id: "twin", name: "Twin", mode: "twin" },
    ],
  },
  {
    id: "sierpinski",
    name: "Sierpinski gasket",
    kind: "gasket",
    latex: "\\dim=\\frac{\\log 3}{\\log 2}",
    blurb: "Join the midpoints, drop the middle triangle, and repeat on what remains.",
    note: "Depth is how many times the middle is removed.",
    depthLabel: "Depth",
    legend: ["Corner", "Middle", "Tip"],
    minDepth: 0,
    maxDepth: 7,
    defaultDepth: 5,
    frame: "level",
    presets: [
      { id: "upright", name: "Upright", mode: "upright" },
      { id: "inverted", name: "Inverted", mode: "inverted" },
      { id: "right", name: "Right", mode: "right" },
    ],
  },
  {
    id: "hilbert",
    name: "Hilbert curve",
    kind: "curve",
    latex: "\\dim=2",
    blurb: "A path that visits every cell of a square grid and never takes a diagonal step.",
    note: "Depth doubles the grid on each side. Moore closes the path into a loop.",
    depthLabel: "Depth",
    legend: ["Start", "Middle", "End"],
    minDepth: 1,
    maxDepth: 7,
    defaultDepth: 5,
    frame: "level",
    presets: [
      { id: "hilbert", name: "Hilbert", mode: "hilbert" },
      { id: "moore", name: "Moore", mode: "moore" },
      { id: "transpose", name: "Transpose", mode: "transpose" },
    ],
  },
  {
    id: "fern",
    name: "Barnsley fern",
    kind: "ifs",
    latex: "\\mathbf{x}_{n+1}=A_i\\mathbf{x}_n+b_i",
    blurb: "A handful of affine maps, chosen at random, land on a fern.",
    note: "Depth is how many points are plotted. The tree preset uses a different set of maps.",
    depthLabel: "Points",
    legend: ["Stem", "Frond", "Tip"],
    minDepth: 2000,
    maxDepth: 50000,
    defaultDepth: 20000,
    frame: "points",
    presets: [
      { id: "classic", name: "Classic", maps: FERN_CLASSIC, bounds: FERN_BOUNDS },
      { id: "lepto", name: "Lepto", maps: FERN_LEPTO, bounds: LEPTO_BOUNDS },
      { id: "tree", name: "Tree", maps: FERN_TREE, bounds: TREE_BOUNDS },
    ],
  },
];

export function fractalById(id) {
  const fractal = FRACTALS.find((item) => item.id === id);
  if (!fractal) throw new Error(`Unknown fractal: ${id}`);
  return fractal;
}

export function presetById(fractalId, presetId) {
  const preset = fractalById(fractalId).presets.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Unknown preset: ${presetId}`);
  return preset;
}

/** Fixed c-window. Zoom must not shrink the cursor's parameter range. */
export const CURSOR_WINDOW = { minX: -2, maxX: 1, minY: -1.2, maxY: 1.2 };

export function cursorParameter(px, py, width, height) {
  const u = clampUnit(px / Math.max(1, width));
  const v = clampUnit(py / Math.max(1, height));
  return {
    x: CURSOR_WINDOW.minX + u * (CURSOR_WINDOW.maxX - CURSOR_WINDOW.minX),
    y: CURSOR_WINDOW.maxY - v * (CURSOR_WINDOW.maxY - CURSOR_WINDOW.minY),
  };
}

/** A small bend of z³ − 1. The middle of the cursor window is the plain polynomial. */
export function newtonCursor(px, py, width, height) {
  const point = cursorParameter(px, py, width, height);
  const gain = 0.28;
  return {
    px: ((point.x + 0.5) / 1.5) * gain,
    py: (point.y / 1.2) * gain,
  };
}

export function planePoint(preset, width, height, x, y) {
  const spanY = preset.scale;
  const spanX = preset.scale * (width / Math.max(1, height));
  const ny = preset.flipY ? y / height - 0.5 : 0.5 - y / height;
  return {
    x: preset.centerX + (x / width - 0.5) * spanX,
    y: preset.centerY + ny * spanY,
  };
}

export function escapeValue(fractalId, preset, zx, zy, maxIter) {
  const fractal = fractalById(fractalId);
  const cap = clampIter(maxIter);
  if (fractal.id === "julia") return julia(zx, zy, preset.cx || 0, preset.cy || 0, cap);
  if (fractal.id === "burning") {
    if ("cx" in preset || "cy" in preset) return burningJulia(zx, zy, preset.cx || 0, preset.cy || 0, cap);
    return burning(zx, zy, cap);
  }
  if (fractal.id === "newton") return newton(zx, zy, cap, preset.px || 0, preset.py || 0);
  if (fractal.id === "mandelbrot") return mandelbrot(zx, zy, cap);
  throw new Error(`${fractal.name} is not an escape-time fractal.`);
}

export function escapeBand(fractalId, preset, width, height, maxIter, y0, rowCount) {
  const fractal = fractalById(fractalId);
  if (fractal.kind !== "escape") throw new Error(`${fractal.name} is not an escape-time fractal.`);
  const cap = clampIter(maxIter);
  const start = Math.max(0, y0 | 0);
  const rows = Math.max(0, Math.min(Math.max(0, height - start), rowCount | 0));
  const iterations = new Uint16Array(Math.max(0, width) * rows);
  const basins = new Int8Array(iterations.length);
  basins.fill(-1);
  if (rows === 0 || width <= 0 || height <= 0) return { iterations, basins };
  const spanY = preset.scale;
  const spanX = preset.scale * (width / height);
  const flip = Boolean(preset.flipY);
  const cursorC = fractal.id === "burning" && ("cx" in preset || "cy" in preset);
  const paramX = preset.cx || 0;
  const paramY = preset.cy || 0;
  const bendX = preset.px || 0;
  const bendY = preset.py || 0;
  for (let row = 0; row < rows; row += 1) {
    const py = start + row;
    const ny = flip ? (py + 0.5) / height - 0.5 : 0.5 - (py + 0.5) / height;
    const cy = preset.centerY + ny * spanY;
    const offset = row * width;
    for (let px = 0; px < width; px += 1) {
      const cx = preset.centerX + ((px + 0.5) / width - 0.5) * spanX;
      const index = offset + px;
      if (fractal.id === "julia") {
        iterations[index] = juliaIterations(cx, cy, paramX, paramY, cap);
      } else if (fractal.id === "burning") {
        iterations[index] = cursorC
          ? juliaFoldIterations(cx, cy, paramX, paramY, cap)
          : juliaFoldIterations(0, 0, cx, cy, cap);
      } else if (fractal.id === "newton") {
        const sample = bendX === 0 && bendY === 0
          ? newtonPlain(cx, cy, cap)
          : newton(cx, cy, cap, bendX, bendY);
        iterations[index] = sample.iteration;
        basins[index] = sample.basin;
      } else {
        iterations[index] = mandelbrotIterations(cx, cy, cap);
      }
    }
  }
  return { iterations, basins };
}

/** How the picture is produced: iterations, generations, a path, or the chaos game. */
export function constructionOrder(fractalId) {
  const fractal = fractalById(fractalId);
  if (fractal.kind === "escape") return "iterations";
  if (fractal.kind === "ifs") return "chaos";
  if (fractal.id === "koch" || fractal.id === "sierpinski") return "generations";
  return "path";
}

export function buildGeometry(fractalId, presetId, depth) {
  const fractal = fractalById(fractalId);
  const preset = presetById(fractalId, presetId);
  const level = Math.min(fractal.maxDepth, Math.max(fractal.minDepth, depth | 0));
  if (fractal.kind === "gasket") {
    return { mode: "triangles", vertices: gasketVertices(preset.mode, level) };
  }
  if (fractal.kind !== "curve") throw new Error(`${fractal.name} has no curve geometry.`);
  if (fractal.id === "koch") return { mode: "polyline", paths: [kochPoints(level, preset.mode)] };
  if (fractal.id === "dragon") return { mode: "polyline", paths: dragonPaths(level, preset.mode) };
  if (fractal.id === "hilbert") return { mode: "polyline", paths: [spacePath(level, preset.mode)] };
  throw new Error(`${fractal.name} has no curve geometry.`);
}

export function iterateIfs(fractalId, presetId, cursor, count) {
  const fractal = fractalById(fractalId);
  if (fractal.kind !== "ifs") throw new Error(`${fractal.name} is not an IFS fractal.`);
  const preset = presetById(fractalId, presetId);
  const total = Math.max(0, count | 0);
  const points = new Float64Array(total * 2);
  let x = cursor.x || 0;
  let y = cursor.y || 0;
  let seed = cursor.seed >>> 0;
  const burn = cursor.burn === undefined ? 16 : cursor.burn;
  for (let i = 0; i < burn; i += 1) {
    const step = applyMap(preset.maps, x, y, seed);
    x = step.x;
    y = step.y;
    seed = step.seed;
  }
  for (let i = 0; i < total; i += 1) {
    const step = applyMap(preset.maps, x, y, seed);
    x = step.x;
    y = step.y;
    seed = step.seed;
    points[i * 2] = x;
    points[i * 2 + 1] = y;
  }
  return { points, cursor: { x, y, seed, burn: 0 } };
}

function clampUnit(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampIter(maxIter) {
  const value = Number.isFinite(maxIter) ? Math.floor(maxIter) : 1;
  return Math.min(16384, Math.max(1, value));
}

function mandelbrot(cx, cy, maxIter) {
  return { iteration: mandelbrotIterations(cx, cy, maxIter), basin: -1 };
}

function mandelbrotIterations(cx, cy, maxIter) {
  let x = 0;
  let y = 0;
  let iter = 0;
  while (x * x + y * y <= 4 && iter < maxIter) {
    const next = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = next;
    iter += 1;
  }
  return iter;
}

function julia(zx, zy, cx, cy, maxIter) {
  return { iteration: juliaIterations(zx, zy, cx, cy, maxIter), basin: -1 };
}

function juliaIterations(zx, zy, cx, cy, maxIter) {
  let x = zx;
  let y = zy;
  let iter = 0;
  while (x * x + y * y <= 4 && iter < maxIter) {
    const next = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = next;
    iter += 1;
  }
  return iter;
}

function burning(cx, cy, maxIter) {
  return burningJulia(0, 0, cx, cy, maxIter);
}

function burningJulia(zx, zy, cx, cy, maxIter) {
  return { iteration: juliaFoldIterations(zx, zy, cx, cy, maxIter), basin: -1 };
}

function juliaFoldIterations(zx, zy, cx, cy, maxIter) {
  let x = zx;
  let y = zy;
  let iter = 0;
  while (x * x + y * y <= 4 && iter < maxIter) {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const next = ax * ax - ay * ay + cx;
    y = 2 * ax * ay + cy;
    x = next;
    iter += 1;
  }
  return iter;
}

function newton(zx, zy, maxIter, px = 0, py = 0) {
  if (px === 0 && py === 0) return newtonPlain(zx, zy, maxIter);
  let x = zx;
  let y = zy;
  for (let iter = 0; iter < maxIter; iter += 1) {
    const x2 = x * x - y * y;
    const y2 = 2 * x * y;
    const x3 = x2 * x - y2 * y;
    const y3 = x2 * y + y2 * x;
    const fx = x3 + (px * x - py * y) - 1;
    const fy = y3 + (px * y + py * x);
    const dx = 3 * x2 + px;
    const dy = 3 * y2 + py;
    const denom = dx * dx + dy * dy;
    if (denom < 1e-14) return { iteration: iter + 1, basin: nearestBasin(x, y) };
    const stepX = (fx * dx + fy * dy) / denom;
    const stepY = (fy * dx - fx * dy) / denom;
    x -= stepX;
    y -= stepY;
    if (stepX * stepX + stepY * stepY < 1e-12) {
      return { iteration: iter + 1, basin: nearestBasin(x, y) };
    }
  }
  return { iteration: maxIter, basin: nearestBasin(x, y) };
}

function newtonPlain(zx, zy, maxIter) {
  let x = zx;
  let y = zy;
  for (let iter = 0; iter < maxIter; iter += 1) {
    const basin = closeBasin(x, y, 1e-6);
    if (basin >= 0) return { iteration: iter + 1, basin };
    const x2 = x * x - y * y;
    const y2 = 2 * x * y;
    const x3 = x2 * x - y2 * y;
    const y3 = x2 * y + y2 * x;
    const fx = x3 - 1;
    const fy = y3;
    const dx = 3 * x2;
    const dy = 3 * y2;
    const denom = dx * dx + dy * dy;
    if (denom < 1e-14) return { iteration: iter + 1, basin: nearestBasin(x, y) };
    x -= (fx * dx + fy * dy) / denom;
    y -= (fy * dx - fx * dy) / denom;
  }
  return { iteration: maxIter, basin: nearestBasin(x, y) };
}

function closeBasin(x, y, limit) {
  for (let i = 0; i < NEWTON_ROOTS.length; i += 1) {
    const dx = x - NEWTON_ROOTS[i][0];
    const dy = y - NEWTON_ROOTS[i][1];
    if (dx * dx + dy * dy < limit) return i;
  }
  return -1;
}

function nearestBasin(x, y) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < NEWTON_ROOTS.length; i += 1) {
    const dx = x - NEWTON_ROOTS[i][0];
    const dy = y - NEWTON_ROOTS[i][1];
    const dist = dx * dx + dy * dy;
    if (dist < bestD) {
      bestD = dist;
      best = i;
    }
  }
  return best;
}

function kochPoints(depth, mode) {
  const height = Math.sqrt(3) / 2;
  let pts = mode === "curve" ? [[0, 0], [1, 0]] : [[0, 0], [1, 0], [0.5, height], [0, 0]];
  // Left of travel is +1. The snowflake is counterclockwise, so outward is −1.
  const sign = mode === "snowflake" ? -1 : 1;
  for (let level = 0; level < depth; level += 1) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const bump = (Math.sqrt(3) / 6) * len;
      const ux = -dy / len;
      const uy = dx / len;
      next.push(
        [x1 + dx / 3, y1 + dy / 3],
        [(x1 + x2) / 2 + sign * ux * bump, (y1 + y2) / 2 + sign * uy * bump],
        [x1 + (2 * dx) / 3, y1 + (2 * dy) / 3],
        [x2, y2],
      );
    }
    pts = next;
  }
  return flatten(pts);
}

function dragonPaths(depth, mode) {
  const turn = mode === "mirrored" ? -1 : 1;
  const main = dragonPath(depth, turn);
  if (mode !== "twin") return [main];
  const twin = new Float64Array(main.length);
  for (let i = 0; i < main.length; i += 2) {
    twin[i] = -main[i];
    twin[i + 1] = -main[i + 1];
  }
  return [main, twin];
}

function dragonPath(depth, turn) {
  let pts = [0, 0, 1, 0];
  for (let level = 0; level < depth; level += 1) {
    const endX = pts[pts.length - 2];
    const endY = pts[pts.length - 1];
    const extra = [];
    for (let i = pts.length - 4; i >= 0; i -= 2) {
      const dx = pts[i] - endX;
      const dy = pts[i + 1] - endY;
      // A positive turn is the Heighway fold: the new copy sits left of the path.
      if (turn >= 0) extra.push(endX + dy, endY - dx);
      else extra.push(endX - dy, endY + dx);
    }
    pts = pts.concat(extra);
  }
  return Float64Array.from(pts);
}

function gasketVertices(mode, depth) {
  const height = Math.sqrt(3) / 2;
  let ax = 0;
  let ay = 0;
  let bx = 1;
  let by = 0;
  let cx = 0.5;
  let cy = height;
  if (mode === "inverted") {
    ax = 0;
    ay = height;
    bx = 1;
    by = height;
    cx = 0.5;
    cy = 0;
  } else if (mode === "right") {
    ax = 0;
    ay = 0;
    bx = 1;
    by = 0;
    cx = 0;
    cy = 1;
  }
  const out = [];
  divideGasket(depth, ax, ay, bx, by, cx, cy, out);
  return Float64Array.from(out);
}

function divideGasket(depth, ax, ay, bx, by, cx, cy, out) {
  if (depth <= 0) {
    out.push(ax, ay, bx, by, cx, cy);
    return;
  }
  const abx = (ax + bx) / 2;
  const aby = (ay + by) / 2;
  const bcx = (bx + cx) / 2;
  const bcy = (by + cy) / 2;
  const cax = (cx + ax) / 2;
  const cay = (cy + ay) / 2;
  divideGasket(depth - 1, ax, ay, abx, aby, cax, cay, out);
  divideGasket(depth - 1, abx, aby, bx, by, bcx, bcy, out);
  divideGasket(depth - 1, cax, cay, bcx, bcy, cx, cy, out);
}

function spacePath(order, mode) {
  if (mode === "moore") return moorePath(order);
  const path = hilbertPath(order);
  if (mode === "transpose") {
    for (let i = 0; i < path.length; i += 2) {
      const x = path[i];
      path[i] = path[i + 1];
      path[i + 1] = x;
    }
  }
  return path;
}

function hilbertPath(order) {
  const n = 1 << order;
  const count = n * n;
  const path = new Float64Array(count * 2);
  for (let index = 0; index < count; index += 1) {
    const [x, y] = d2xy(n, index);
    path[index * 2] = x;
    path[index * 2 + 1] = y;
  }
  return path;
}

function rot(n, x, y, rx, ry) {
  if (ry === 0) {
    if (rx === 1) {
      x = n - 1 - x;
      y = n - 1 - y;
    }
    const swap = x;
    x = y;
    y = swap;
  }
  return [x, y];
}

function d2xy(n, d) {
  let x = 0;
  let y = 0;
  let t = d;
  for (let s = 1; s < n; s *= 2) {
    const rx = 1 & (t >> 1);
    const ry = 1 & (t ^ rx);
    [x, y] = rot(s, x, y, rx, ry);
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  return [x, y];
}

function moorePath(order) {
  let seq = "LFL+F+LFL";
  const rules = {
    L: "-RF+LFL+FR-",
    R: "+LF-RFR-FL+",
  };
  for (let i = 1; i < order; i += 1) {
    let next = "";
    for (const symbol of seq) next += rules[symbol] || symbol;
    seq = next;
  }
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const pts = [0, 0];
  let x = 0;
  let y = 0;
  let dir = 0;
  for (const symbol of seq) {
    if (symbol === "F") {
      x += dirs[dir][0];
      y += dirs[dir][1];
      pts.push(x, y);
    } else if (symbol === "+") dir = (dir + 1) & 3;
    else if (symbol === "-") dir = (dir + 3) & 3;
  }
  return Float64Array.from(pts);
}

function applyMap(maps, x, y, seed) {
  const roll = randomStep(seed);
  let chosen = maps[maps.length - 1];
  let threshold = 0;
  for (const map of maps) {
    threshold += map.p;
    if (roll.value <= threshold) {
      chosen = map;
      break;
    }
  }
  return {
    x: chosen.a * x + chosen.b * y + chosen.e,
    y: chosen.c * x + chosen.d * y + chosen.f,
    seed: roll.seed,
  };
}

function randomStep(seed) {
  const a = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { seed: a >>> 0, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

function flatten(points) {
  const flat = new Float64Array(points.length * 2);
  for (let i = 0; i < points.length; i += 1) {
    flat[i * 2] = points[i][0];
    flat[i * 2 + 1] = points[i][1];
  }
  return flat;
}
