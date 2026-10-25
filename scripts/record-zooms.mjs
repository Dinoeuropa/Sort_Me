/**
 * Offline recorder for the home-page zoom films.
 * The site only plays the files this writes. It does not import this script.
 *
 *   node scripts/record-zooms.mjs
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import {
  FRAME_COUNT,
  FRAME_HEIGHT,
  FRAME_RATE,
  FRAME_WIDTH,
  ZOOMS,
  zoomCamera,
} from "../src/home-show.js";

const cores = Math.max(1, Math.min(availableParallelism(), 8));
const workers = Array.from(
  { length: cores },
  () => new Worker(new URL("./zoom-worker.mjs", import.meta.url)),
);

function renderFrame(camera) {
  const rows = Math.floor(FRAME_HEIGHT / workers.length);
  const frame = Buffer.allocUnsafe(FRAME_WIDTH * FRAME_HEIGHT * 4);
  return Promise.all(
    workers.map(
      (worker, index) =>
        new Promise((resolve, reject) => {
          const y0 = index * rows;
          const count = index === workers.length - 1 ? FRAME_HEIGHT - y0 : rows;
          const fail = (error) => reject(error);
          worker.once("message", (message) => {
            worker.off("error", fail);
            frame.set(message.bytes, message.y0 * FRAME_WIDTH * 4);
            resolve();
          });
          worker.once("error", fail);
          worker.postMessage({
            fractalId: camera.fractalId,
            paletteId: camera.paletteId,
            preset: camera.preset,
            width: FRAME_WIDTH,
            height: FRAME_HEIGHT,
            cap: camera.iterations,
            y0,
            rows: count,
          });
        }),
    ),
  ).then(() => frame);
}

function mediaPath(zoom, extension) {
  return fileURLToPath(new URL(`../media/${zoom.id}-zoom.${extension}`, import.meta.url));
}

/**
 * The burning ship is a field of sparks. x264 at a quality that keeps those sparks
 * exceeds the host file limit, so that film is AV1. The other two stay h264.
 */
const ENCODER = {
  mandelbrot: ["-c:v", "libx264", "-preset", "medium", "-crf", "16"],
  julia: ["-c:v", "libx264", "-preset", "medium", "-crf", "16"],
  burning: ["-c:v", "libsvtav1", "-preset", "8", "-crf", "40"],
};

function encode(zoom) {
  const output = mediaPath(zoom, "mp4");
  return spawn(
    "ffmpeg",
    [
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${FRAME_WIDTH}x${FRAME_HEIGHT}`,
      "-r",
      String(FRAME_RATE),
      "-i",
      "pipe:0",
      "-an",
      ...ENCODER[zoom.id],
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      output,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
}

async function writeFrame(encoder, frame) {
  if (encoder.stdin.write(frame)) return;
  await once(encoder.stdin, "drain");
}

async function record(zoom) {
  const encoder = encode(zoom);
  const errors = [];
  encoder.stderr.on("data", (chunk) => errors.push(chunk));
  const started = Date.now();
  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    const progress = FRAME_COUNT === 1 ? 1 : frame / (FRAME_COUNT - 1);
    const plate = await renderFrame(zoomCamera(zoom.id, progress));
    await writeFrame(encoder, plate);
    if (frame % 8 === 0 || frame === FRAME_COUNT - 1) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = (frame + 1) / elapsed;
      const left = (FRAME_COUNT - frame - 1) / rate;
      console.log(
        `${zoom.id} ${frame + 1}/${FRAME_COUNT} ${rate.toFixed(2)} fps, about ${left.toFixed(0)}s left`,
      );
    }
  }
  encoder.stdin.end();
  const code = await new Promise((resolve) => encoder.once("close", resolve));
  if (code !== 0) {
    throw new Error(`${zoom.id} encode failed\n${Buffer.concat(errors).toString().slice(-800)}`);
  }
  const still = spawn(
    "ffmpeg",
    ["-y", "-i", mediaPath(zoom, "mp4"), "-frames:v", "1", "-q:v", "2", mediaPath(zoom, "jpg")],
    { stdio: "ignore" },
  );
  const stillCode = await new Promise((resolve) => still.once("close", resolve));
  if (stillCode !== 0) throw new Error(`${zoom.id} poster failed`);
}

await mkdir(new URL("../media/", import.meta.url), { recursive: true });
const chosen = process.argv.slice(2);
const zooms = chosen.length === 0 ? ZOOMS : ZOOMS.filter((zoom) => chosen.includes(zoom.id));
if (chosen.length > 0 && zooms.length !== chosen.length) {
  throw new Error(`Unknown zoom: ${chosen.filter((id) => !zooms.some((zoom) => zoom.id === id)).join(", ")}`);
}
try {
  for (const zoom of zooms) await record(zoom);
} finally {
  for (const worker of workers) await worker.terminate();
}
