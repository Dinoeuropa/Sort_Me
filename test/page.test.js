import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import test from "node:test";

const page = fs.readFileSync(new URL("../sorting.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("../scripts/serve.mjs", import.meta.url), "utf8");
const vercel = fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8");

test("the site root is not an index file a host would serve ahead of the home rewrite", () => {
  assert.equal(fs.existsSync(new URL("../index.html", import.meta.url)), false);
  assert.match(vercel, /"source": "\/"/);
  assert.match(vercel, /"destination": "\/home.html"/);
  assert.match(vercel, /"source": "\/sorting"/);
  assert.match(vercel, /"destination": "\/sorting.html"/);
  assert.match(server, /"\/sorting", "\/sorting.html"/);
  assert.doesNotMatch(server, /"\/", "\/index.html"/);
  assert.doesNotMatch(server, /"\/sorting", "\/index.html"/);
});

test("the page is a self-contained document with selectable programs", () => {
  assert.match(page, /Content-Security-Policy/);
  assert.match(page, /script-src 'self'/);
  assert.doesNotMatch(page, /https?:\/\//);
  assert.match(page, /id="program"/);
  assert.match(page, /id="view"/);
  assert.match(page, /id="compare"/);
  assert.match(page, /id="sound"/);
  assert.match(page, /id="size" type="range" min="1" max="250"/);
  assert.doesNotMatch(page, /id="cap"/);
  assert.doesNotMatch(page, /id="custom"/);
  assert.doesNotMatch(page, /local-pill/);
  assert.match(page, /src="\/src\/app\.js"/);
  assert.match(page, /vendor\/katex\/katex\.min\.css/);
  assert.match(page, /font-src 'self'/);
});

test("mobile keeps the chart under the settings and offers a viz rail", () => {
  assert.doesNotMatch(page, /id="reset"/);
  assert.match(page, /id="viz-dock"/);
  assert.match(page, /id="dock-speed"/);
  assert.match(page, /id="dock-toggle"/);
  assert.doesNotMatch(css, /order:\s*-1/);
});

function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: urlPath, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          location: res.headers.location,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("public paths replace the html addresses", async () => {
  assert.match(server, /0\.0\.0\.0/);
  assert.doesNotMatch(server, /127\.0\.0\.1/);
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const address = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("server did not start")), 5000);
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        const match = output.match(/http:\/\/(\S+):(\d+)/);
        if (!match) return;
        clearTimeout(timer);
        resolve({ host: match[1], port: Number(match[2]) });
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`server exited ${code}`));
      });
    });
    assert.equal(address.host, "0.0.0.0");

    const home = await request(address.port, "/");
    assert.equal(home.status, 200);
    assert.match(home.body, /href="\/sorting"/);
    assert.match(home.body, /href="\/fractals"/);
    assert.match(home.body, /<h1>Sort Me<\/h1>/);
    assert.match(home.body, /id="home-canvas"/);
    assert.doesNotMatch(home.body, /id="program"/);
    assert.doesNotMatch(home.body, /\.html"/);

    const sorting = await request(address.port, "/sorting");
    assert.equal(sorting.status, 200);
    assert.match(sorting.body, /id="program"/);
    assert.match(sorting.body, /href="\/sorting" aria-current="page"/);
    assert.match(sorting.body, /href="\/fractals"/);

    const fractals = await request(address.port, "/fractals");
    assert.equal(fractals.status, 200);
    assert.match(fractals.body, /id="fractal"/);
    assert.match(fractals.body, /href="\/"/);

    const htmlEnding = await request(address.port, "/fractals.html");
    assert.equal(htmlEnding.status, 308);
    assert.equal(htmlEnding.location, "/fractals");

    const indexEnding = await request(address.port, "/index.html");
    assert.equal(indexEnding.status, 308);
    assert.equal(indexEnding.location, "/sorting");

    const sortingFile = await request(address.port, "/sorting.html");
    assert.equal(sortingFile.status, 308);
    assert.equal(sortingFile.location, "/sorting");

    const homeEnding = await request(address.port, "/home.html");
    assert.equal(homeEnding.status, 308);
    assert.equal(homeEnding.location, "/");
  } finally {
    child.kill();
  }
});
