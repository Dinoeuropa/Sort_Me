/** Pause is the only path to Resume. A fresh or finished run stays on the idle label. */
export function runControlLabel({ running = false, paused = false, idle = "Sort" } = {}) {
  if (running) return "Pause";
  if (paused) return "Resume";
  return idle;
}
