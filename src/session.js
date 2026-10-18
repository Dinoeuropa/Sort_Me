/** Pause is the only path to Resume. A fresh compare or a finished run stays on Sort. */
export function runControlLabel({ running = false, paused = false } = {}) {
  if (running) return "Pause";
  if (paused) return "Resume";
  return "Sort";
}
