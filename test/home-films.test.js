import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { FRAME_COUNT, FRAME_HEIGHT, FRAME_RATE, FRAME_WIDTH, SCENES, filmSrc } from "../src/home-show.js";

test("each zoom film is a 4K plate the page can play", () => {
  for (const scene of SCENES) {
    const file = new URL(`..${scene.src}`, import.meta.url);
    const poster = new URL(`..${scene.poster}`, import.meta.url);
    assert.equal(fs.existsSync(file), true, scene.src);
    assert.equal(fs.existsSync(poster), true, scene.poster);
    const videoSize = fs.statSync(file).size;
    const posterSize = fs.statSync(poster).size;
    assert.ok(videoSize > 100_000, `${scene.src} is ${videoSize} bytes`);
    assert.ok(videoSize < 96 * 1024 * 1024, `${scene.src} is ${videoSize} bytes`);
    assert.ok(posterSize > 10_000, scene.poster);

    const probe = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,avg_frame_rate,nb_frames,codec_name",
        "-of",
        "default=nw=1",
        file,
      ],
      { encoding: "utf8" },
    );
    assert.match(probe, /codec_name=(h264|av1)/);
    assert.match(probe, new RegExp(`width=${FRAME_WIDTH}`));
    assert.match(probe, new RegExp(`height=${FRAME_HEIGHT}`));
    assert.match(probe, new RegExp(`avg_frame_rate=${FRAME_RATE}/1`));
    assert.match(probe, new RegExp(`nb_frames=${FRAME_COUNT}`));
  }
});

function probeVideo(file) {
  return execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,avg_frame_rate,codec_name",
      "-of",
      "default=nw=1",
      file,
    ],
    { encoding: "utf8" },
  );
}

test("each zoom has a light copy a phone can start quickly", () => {
  for (const scene of SCENES.filter((item) => item.kind === "zoom")) {
    const src = filmSrc(scene, "lite");
    const file = new URL(`..${src}`, import.meta.url);
    assert.equal(fs.existsSync(file), true, src);
    const size = fs.statSync(file).size;
    assert.ok(size < 2 * 1024 * 1024, `${src} is ${size} bytes`);
    const probe = probeVideo(file);
    assert.match(probe, /codec_name=h264/);
    assert.match(probe, /width=960/);
    assert.match(probe, /height=540/);
    assert.match(probe, /avg_frame_rate=24\/1/);
  }
});

test("each zoom has a 1080p copy a wide screen can stream", () => {
  for (const scene of SCENES.filter((item) => item.kind === "zoom")) {
    const src = filmSrc(scene, "screen");
    const file = new URL(`..${src}`, import.meta.url);
    assert.equal(fs.existsSync(file), true, src);
    const size = fs.statSync(file).size;
    assert.ok(size < 8 * 1024 * 1024, `${src} is ${size} bytes`);
    const probe = probeVideo(file);
    assert.match(probe, /codec_name=h264/);
    assert.match(probe, /width=1920/);
    assert.match(probe, /height=1080/);
    assert.match(probe, /avg_frame_rate=24\/1/);
    assert.notEqual(src, scene.src);
  }
});
