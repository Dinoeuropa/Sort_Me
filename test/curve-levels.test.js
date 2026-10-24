import assert from "node:assert/strict";
import test from "node:test";
import { FRACTALS, buildGeometry, levelFrame } from "../src/fractals.js";
import { levelBlend, levelRatio, placeLevel, recursionLevel } from "../src/fractal-view.js";

const CURVES = FRACTALS.filter((fractal) => fractal.kind === "curve");

/** A few levels deep enough to show drift, small enough to run quickly. */
function levelsOf(fractal, preset) {
  const start = Math.max(1, fractal.minDepth);
  const out = [];
  for (let level = start; level < fractal.maxDepth && out.length < 4; level += 1) {
    const paths = buildGeometry(fractal.id, preset.id, level + 2).paths;
    if (paths.reduce((sum, path) => sum + path.length, 0) > 400000) break;
    out.push(level);
  }
  return out;
}

function placed(fractal, preset, level, base) {
  const geometry = buildGeometry(fractal.id, preset.id, level);
  const home = levelFrame(fractal.id, preset.id, buildGeometry(fractal.id, preset.id, base));
  return placeLevel(geometry, levelFrame(fractal.id, preset.id, geometry), home).paths;
}

function medianStep(path) {
  const steps = [];
  for (let i = 2; i < path.length; i += 2) steps.push(Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]));
  steps.sort((a, b) => a - b);
  return steps[steps.length >> 1];
}

/** The point a fraction of the way along one path against the same fraction along a finer one, in coarse steps. */
function orderedStray(coarse, fine) {
  const a = coarse.length / 2 - 1;
  const b = fine.length / 2 - 1;
  const unit = medianStep(coarse);
  let worst = 0;
  for (let i = 0; i <= a; i += 1) {
    const j = Math.round((i * b) / a);
    worst = Math.max(worst, Math.hypot(coarse[2 * i] - fine[2 * j], coarse[2 * i + 1] - fine[2 * j + 1]) / unit);
  }
  return worst;
}

test("each curve level, placed in the frame of the level the zoom started from, lies on the level before it", () => {
  for (const fractal of CURVES) {
    if (fractal.id === "tree") continue;
    for (const preset of fractal.presets) {
      for (const base of levelsOf(fractal, preset)) {
        const here = placed(fractal, preset, base, base);
        const next = placed(fractal, preset, base + 1, base);
        const after = placed(fractal, preset, base + 2, base);
        for (let p = 0; p < here.length; p += 1) {
          const label = `${fractal.id}:${preset.id} level ${base}`;
          assert.ok(orderedStray(here[p], next[p]) <= 1, `${label} -> ${base + 1}: ${orderedStray(here[p], next[p])}`);
          assert.ok(orderedStray(here[p], after[p]) <= 1.5, `${label} -> ${base + 2}: ${orderedStray(here[p], after[p])}`);
        }
      }
    }
  }
});

test("the level a zoom started from is drawn exactly as built", () => {
  for (const fractal of CURVES) {
    for (const preset of fractal.presets) {
      const geometry = buildGeometry(fractal.id, preset.id, fractal.defaultDepth);
      const frame = levelFrame(fractal.id, preset.id, geometry);
      assert.equal(placeLevel(geometry, frame, frame), geometry, `${fractal.id}:${preset.id}`);
    }
  }
});

test("every branch of a tree keeps its place when the tips split again", () => {
  const tree = FRACTALS.find((fractal) => fractal.id === "tree");
  for (const preset of tree.presets) {
    const key = (path) => Array.from(path, (value) => value.toFixed(9)).join(",");
    const here = placed(tree, preset, 4, 4).map(key);
    const next = new Set(placed(tree, preset, 5, 4).map(key));
    for (const branch of here) assert.equal(next.has(branch), true, `${preset.id}`);
  }
});

test("dragons turn and grow with each fold but zoom into the same dragon", () => {
  for (const preset of ["heighway", "mirrored", "twin", "terdragon"]) {
    const fractal = FRACTALS.find((item) => item.id === "dragon");
    const base = 10;
    const here = placed(fractal, { id: preset }, base, base)[0];
    const deeper = placed(fractal, { id: preset }, base + 1, base)[0];
    const per = preset === "terdragon" ? 3 : 2;
    for (let i = 0; i < here.length / 2; i += 1) {
      assert.ok(Math.abs(here[2 * i] - deeper[2 * per * i]) < 1e-6, `${preset} x ${i}`);
      assert.ok(Math.abs(here[2 * i + 1] - deeper[2 * per * i + 1]) < 1e-6, `${preset} y ${i}`);
    }
  }
});

test("every arrowhead level is the same triangle, and each lies on the one before", () => {
  for (let level = 1; level <= 6; level += 1) {
    const here = buildGeometry("sierpinski", "arrowhead", level).paths[0];
    const next = buildGeometry("sierpinski", "arrowhead", level + 1).paths[0];
    assert.ok(Math.hypot(here[0], here[1]) < 1e-9, `start ${level}`);
    assert.ok(Math.hypot(here.at(-2) - 0.5, here.at(-1) - Math.sqrt(3) / 2) < 1e-9, `end ${level}`);
    assert.ok(orderedStray(here, next) <= 1, `arrowhead ${level}: ${orderedStray(here, next)}`);
  }
});

test("the gosper island is a closed loop whose sides break into three", () => {
  for (let level = 0; level <= 3; level += 1) {
    const path = buildGeometry("gosper", "island", level).paths[0];
    assert.equal(path.length / 2 - 1, 6 * 3 ** level);
    assert.ok(Math.hypot(path[0] - path.at(-2), path[1] - path.at(-1)) < 1e-9);
  }
});

test("a zoom adds a level each time the picture grows by the factor its segments shrink by", () => {
  for (const fractal of CURVES) {
    if (fractal.id === "tree") continue;
    for (const preset of fractal.presets) {
      const base = levelsOf(fractal, preset).at(-1);
      const here = placed(fractal, preset, base, base);
      const next = placed(fractal, preset, base + 1, base);
      const shrink = medianStep(here[0]) / medianStep(next[0]);
      const ratio = levelRatio(fractal.id, preset.id);
      assert.ok(Math.abs(ratio / shrink - 1) < 0.02, `${fractal.id}:${preset.id} ratio ${ratio} vs ${shrink}`);
    }
  }
});

test("the level ratio follows the preset", () => {
  assert.ok(Math.abs(levelRatio("hilbert", "peano") - 3) < 1e-9);
  assert.ok(Math.abs(levelRatio("hilbert", "hilbert") - 2) < 1e-9);
  assert.ok(Math.abs(levelRatio("dragon", "terdragon") - Math.sqrt(3)) < 1e-9);
  assert.ok(Math.abs(levelRatio("koch", "minkowski") - 4) < 1e-9);
  assert.ok(Math.abs(levelRatio("gosper", "island") - Math.sqrt(7)) < 1e-9);
  assert.equal(levelBlend("hilbert", 3, "peano").extra, 1);
  assert.equal(levelBlend("hilbert", 2.9, "peano").extra, 0);
  assert.equal(levelBlend("hilbert", 2, "hilbert").extra, 1);
  assert.equal(recursionLevel("hilbert", 4, 3, 1, 7, "peano"), 5);
  assert.equal(recursionLevel("hilbert", 4, 2.5, 1, 7, "peano"), 4);
  assert.equal(recursionLevel("dragon", 8, Math.sqrt(3), 0, 14, "terdragon"), 9);
});
