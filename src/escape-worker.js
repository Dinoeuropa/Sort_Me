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

/**
 * Colored bands become one bitmap here, so the page never allocates or copies a whole plate.
 * An OffscreenCanvas is used when there is one, so the bitmap is already on the graphics card
 * when the page first draws it. Resolves null where bitmaps cannot be made.
 */
export function composeBitmap({ width, height, parts }) {
  if (typeof ImageData === "undefined") return Promise.resolve(null);
  if (typeof OffscreenCanvas === "function") {
    try {
      const sheet = new OffscreenCanvas(width, height);
      const context = sheet.getContext("2d");
      if (context) {
        for (const part of parts) {
          if (part.pixels && part.rows > 0) context.putImageData(new ImageData(part.pixels, width, part.rows), 0, part.y0);
        }
        return Promise.resolve(sheet.transferToImageBitmap());
      }
    } catch {
      // Fall through to a plain bitmap.
    }
  }
  if (typeof createImageBitmap !== "function") return Promise.resolve(null);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (const part of parts) {
    if (part.pixels && part.rows > 0) pixels.set(part.pixels, part.y0 * width * 4);
  }
  return createImageBitmap(new ImageData(pixels, width, height));
}

const workerScope = typeof WorkerGlobalScope === "undefined" ? null : globalThis;
if (workerScope) {
  const CHUNK_ROWS = 80;
  workerScope.onmessage = (event) => {
    if (event.data.kind === "compose") {
      composeBitmap(event.data).then(
        (bitmap) => workerScope.postMessage({ kind: "bitmap", id: event.data.id, bitmap }, bitmap ? [bitmap] : []),
        () => workerScope.postMessage({ kind: "bitmap", id: event.data.id, bitmap: null }),
      );
      return;
    }
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
