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
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const redirects = new Map([
  ["/index.html", "/sorting"],
  ["/sorting.html", "/sorting"],
  ["/home.html", "/"],
  ["/sorting/", "/sorting"],
  ["/fractals.html", "/fractals"],
  ["/fractals/", "/fractals"],
]);

const pages = new Map([
  ["/", "/home.html"],
  ["/sorting", "/sorting.html"],
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
    const type = types[path.extname(file)] || "application/octet-stream";
    const total = data.length;
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match && match[1] !== "" ? Number(match[1]) : 0;
      const end = match && match[2] !== "" ? Number(match[2]) : total - 1;
      if (!match || start > end || start >= total) {
        response.writeHead(416, { ...headers, "Content-Range": `bytes */${total}` });
        response.end();
        return;
      }
      const last = Math.min(end, total - 1);
      response.writeHead(206, {
        ...headers,
        "Content-Type": type,
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${last}/${total}`,
        "Content-Length": last - start + 1,
      });
      response.end(data.subarray(start, last + 1));
      return;
    }
    response.writeHead(200, {
      ...headers,
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Content-Length": total,
    });
    response.end(data);
  });
});

server.listen(port, host, () => {
  const actual = server.address();
  console.log(`Sort Me is at http://${actual.address}:${actual.port}`);
});
