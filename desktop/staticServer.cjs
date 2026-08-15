/**
 * Serves the packaged frontend from disk and proxies /api to the Python backend.
 * The UI stays up even if uvicorn crashes after the health check.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function safeFile(root, requestPath) {
  const decoded = decodeURIComponent((requestPath || "/").split("?")[0]);
  const rel = decoded.replace(/^\/+/, "").replace(/^app\/?/, "");
  const resolved = path.resolve(root, rel);
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    return null;
  }
  return resolved;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=31536000, immutable",
  });
  fs.createReadStream(filePath).pipe(res);
}

function createUiServer({ distDir, apiHost, apiPort, listenHost, listenPort }) {
  const indexHtml = path.join(distDir, "index.html");
  const server = http.createServer((req, res) => {
    const host = req.headers.host || `${listenHost}:${listenPort}`;
    let url;
    try {
      url = new URL(req.url || "/", `http://${host}`);
    } catch {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      const proxy = http.request(
        {
          hostname: apiHost,
          port: apiPort,
          path: `${url.pathname}${url.search}`,
          method: req.method,
          headers: { ...req.headers, host: `${apiHost}:${apiPort}` },
        },
        (pres) => {
          res.writeHead(pres.statusCode || 502, pres.headers);
          pres.pipe(res);
        },
      );
      proxy.on("error", () => {
        if (!res.headersSent) {
          res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
        }
        res.end(JSON.stringify({ detail: "Hall backend unavailable" }));
      });
      req.pipe(proxy);
      return;
    }

    let filePath = safeFile(distDir, url.pathname);
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      sendFile(res, filePath);
      return;
    }
    if (fs.existsSync(indexHtml)) {
      sendFile(res, indexHtml);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Frontend introuvable");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, listenHost, () => resolve(server));
  });
}

module.exports = { createUiServer };
