/**
 * Offline recorder for the home-page sorting films.
 * The site only plays the files this writes. It does not import this script.
 *
 *   node scripts/record-sorts.mjs
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { FRAME_COUNT, FRAME_HEIGHT, FRAME_RATE, FRAME_WIDTH, SORTS, sortFrames } from "../src/home-show.js";
import { draw } from "../src/views.js";

const canvas = createCanvas(FRAME_WIDTH, FRAME_HEIGHT);
const context = canvas.getContext("2d");

function mediaPath(sort, extension) {
  return fileURLToPath(new URL(`../media/${sort.id}-sort.${extension}`, import.meta.url));
}

function plate(frame, viewId) {
  draw(viewId, context, frame, FRAME_WIDTH, FRAME_HEIGHT);
  const image = context.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  return Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
}

function encode(sort) {
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
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "16",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mediaPath(sort, "mp4"),
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
}

async function writeFrame(encoder, frame) {
  if (encoder.stdin.write(frame)) return;
  await once(encoder.stdin, "drain");
}

async function record(sort) {
  const frames = await sortFrames(sort.id);
  const encoder = encode(sort);
  const errors = [];
  encoder.stderr.on("data", (chunk) => errors.push(chunk));
  for (const frame of frames) {
    await writeFrame(encoder, plate(frame, sort.viewId));
  }
  encoder.stdin.end();
  const code = await new Promise((resolve) => encoder.once("close", resolve));
  if (code !== 0) {
    throw new Error(`${sort.id} encode failed\n${Buffer.concat(errors).toString().slice(-800)}`);
  }
  const still = spawn(
    "ffmpeg",
    ["-y", "-i", mediaPath(sort, "mp4"), "-frames:v", "1", "-q:v", "2", mediaPath(sort, "jpg")],
    { stdio: "ignore" },
  );
  const stillCode = await new Promise((resolve) => still.once("close", resolve));
  if (stillCode !== 0) throw new Error(`${sort.id} poster failed`);
  console.log(`${sort.id} ${FRAME_COUNT} frames`);
}

await mkdir(new URL("../media/", import.meta.url), { recursive: true });
for (const sort of SORTS) await record(sort);
