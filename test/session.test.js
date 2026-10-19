import assert from "node:assert/strict";
import test from "node:test";
import { runControlLabel } from "../src/session.js";

test("resume is only offered after pause", () => {
  assert.equal(runControlLabel({ running: false, paused: false }), "Sort");
  assert.equal(runControlLabel({ running: true, paused: false }), "Pause");
  assert.equal(runControlLabel({ running: false, paused: true }), "Resume");
  assert.equal(runControlLabel({ running: true, paused: true }), "Pause");
});

test("the idle label can name another page's run button", () => {
  assert.equal(runControlLabel({ running: false, paused: false, idle: "Draw" }), "Draw");
  assert.equal(runControlLabel({ running: false, paused: true, idle: "Draw" }), "Resume");
});
