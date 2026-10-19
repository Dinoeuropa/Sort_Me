/** Frames a full drawing should take. The fastest speed still lasts more than one paint. */
export function framesFor(speed) {
  const t = Math.min(1, Math.max(0, (Number(speed) - 1) / 99));
  return Math.max(36, Math.round(36 + 420 * (1 - t) ** 1.4));
}

/** How many rows, segments, triangles, or points to add on the next frame. */
export function unitsPerFrame(speed, total, step = false) {
  const count = Math.max(0, Math.floor(Number(total)));
  if (count === 0) return 0;
  const frames = step ? 72 : framesFor(speed);
  return Math.max(1, Math.min(count, Math.ceil(count / frames)));
}
