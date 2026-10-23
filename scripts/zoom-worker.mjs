import { parentPort } from "node:worker_threads";
import { escapeBand } from "../src/fractals.js";
import { paintEscape } from "../src/palettes.js";

parentPort.on("message", (job) => {
  const band = escapeBand(job.fractalId, job.preset, job.width, job.height, job.cap, job.y0, job.rows);
  const pixels = paintEscape(job.paletteId, band.iterations, band.basins, job.width, job.rows, job.cap);
  const copy = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  parentPort.postMessage({ y0: job.y0, bytes: copy }, [copy.buffer]);
});
