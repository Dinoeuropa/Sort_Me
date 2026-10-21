import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const redirects = new Map([
  ["/index.html", "/"],
  ["/fractals.html", "/fractals"],
  ["/fractals/", "/fractals"],
]);

const pages = new Map([
  ["/", "/index.html"],
  ["/fractals", "/fractals.html"],
  ["/favicon.ico", "/favicon.svg"],
]);

const headers = {
  "Content-Security-Policy":
    "default-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; img-src 'self' data:",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}`);
  const pathname = decodeURIComponent(url.pathname);
  const redirect = redirects.get(pathname);
  if (redirect) {
    response.writeHead(308, { Location: redirect, "Cache-Control": "no-store" });
    response.end();
    return;
  }

  const mapped = pages.get(pathname) ?? pathname;
  const file = path.resolve(root, `.${mapped}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403, headers);
    response.end("Forbidden");
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404, headers);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      ...headers,
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
    });
    response.end(data);
  });
});

server.listen(port, host, () => {
  const actual = server.address();
  console.log(`Sort Me is at http://${actual.address}:${actual.port}`);
});
