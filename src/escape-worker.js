import { escapeBand } from "./fractals.js";
import { paintEscape } from "./palettes.js";

/** One horizontal band of an escape picture, already colored. */
export function renderPart({ fractalId, preset, width, height, cap, y0, rows, paletteId }) {
  const band = escapeBand(fractalId, preset, width, height, cap, y0, rows);
  const pixels = paintEscape(
    paletteId,
    band.iterations,
    band.basins,
    width,
    rows,
    cap,
    rows,
    cap,
  );
  return {
    iterations: band.iterations,
    basins: band.basins,
    pixels,
    y0,
    rows,
    width,
  };
}

const workerScope = typeof WorkerGlobalScope === "undefined" ? null : globalThis;
if (workerScope) {
  const CHUNK_ROWS = 80;
  workerScope.onmessage = (event) => {
    const y0 = event.data.y0 | 0;
    const end = y0 + (event.data.rows | 0);
    for (let y = y0; y < end; y += CHUNK_ROWS) {
      const part = renderPart({ ...event.data, y0: y, rows: Math.min(CHUNK_ROWS, end - y) });
      workerScope.postMessage(
        {
          jobId: event.data.jobId,
          y0: part.y0,
          rows: part.rows,
          width: part.width,
          iterations: part.iterations,
          basins: part.basins,
          pixels: part.pixels,
        },
        [part.iterations.buffer, part.basins.buffer, part.pixels.buffer],
      );
    }
  };
}
