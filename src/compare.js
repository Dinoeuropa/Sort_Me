import { createRun } from "./algorithms.js";

export const MAX_COMPARE = 4;

export function startComparison(ids, values) {
  if (!Array.isArray(ids)) throw new Error("Pick at least two sorting programs.");
  const unique = [...new Set(ids)];
  if (unique.length < 2) throw new Error("Pick at least two sorting programs.");
  if (unique.length > MAX_COMPARE) throw new Error("Compare at most four sorting programs.");
  return unique.map((id) => ({
    id,
    generator: createRun(id, values),
    frame: null,
    finished: false,
  }));
}

export function continueComparison(lanes, values) {
  if (!Array.isArray(lanes)) return null;
  return startComparison(
    lanes.map((lane) => lane.id),
    values,
  );
}

export function stepLanes(lanes, count) {
  const steps = Math.max(1, count);
  for (const lane of lanes) {
    if (lane.finished) continue;
    for (let i = 0; i < steps; i += 1) {
      const next = lane.generator.next();
      if (next.done) {
        lane.finished = true;
        break;
      }
      lane.frame = next.value;
    }
  }
  return lanes.every((lane) => lane.finished);
}
