import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("../scripts/serve.mjs", import.meta.url), "utf8");

test("the page is a local document with selectable programs", () => {
  assert.match(page, /Content-Security-Policy/);
  assert.match(page, /script-src 'self'/);
  assert.doesNotMatch(page, /https?:\/\//);
  assert.match(page, /id="program"/);
  assert.match(page, /id="view"/);
  assert.match(page, /max="1000"/);
  assert.match(page, /src="\.\/src\/app\.js"/);
});

test("the server binds only to localhost", () => {
  assert.match(server, /127\.0\.0\.1/);
  assert.doesNotMatch(server, /0\.0\.0\.0/);
});
