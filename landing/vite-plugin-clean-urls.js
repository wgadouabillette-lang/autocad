import { CLEAN_URL_SLUG_SET } from "./cleanUrls.config.js";

function splitUrl(raw) {
  const qIndex = raw.indexOf("?");
  const pathname = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const search = qIndex >= 0 ? raw.slice(qIndex) : "";
  return { pathname, search };
}

function cleanUrlsMiddleware(req, res, next) {
  const raw = req.url || "/";
  const { pathname, search } = splitUrl(raw);

  if (
    pathname.startsWith("/app") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/downloads") ||
    pathname.startsWith("/@") ||
    pathname.startsWith("/node_modules")
  ) {
    next();
    return;
  }

  if (pathname.endsWith(".html")) {
    const name = pathname.slice(1, -5);
    if (name === "index" || name === "") {
      res.writeHead(301, { Location: `/${search}` });
      res.end();
      return;
    }
    if (CLEAN_URL_SLUG_SET.has(name)) {
      res.writeHead(301, { Location: `/${name}${search}` });
      res.end();
      return;
    }
    next();
    return;
  }

  const segment = pathname.replace(/\/+$/, "").split("/").pop() || "";
  if (CLEAN_URL_SLUG_SET.has(segment)) {
    req.url = `/${segment}.html${search}`;
    next();
    return;
  }

  next();
}

export function cleanUrlsPlugin() {
  return {
    name: "hall-clean-urls",
    configureServer(server) {
      server.middlewares.use(cleanUrlsMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(cleanUrlsMiddleware);
    },
  };
}
