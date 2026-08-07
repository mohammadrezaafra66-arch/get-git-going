// Minimal Node.js adapter that hosts the TanStack Start web `fetch` handler
// produced by `vite build` (dist/server/server.js). No Worker/Cloudflare runtime.
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { existsSync, createReadStream, readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as pathResolve, sep as pathSep, extname } from "node:path";
import { publishReleaseOnBoot } from "./publish-release.mjs";

// vite build (with cloudflare plugin disabled via SELF_HOST_NODE=1) emits the
// SSR bundle as dist/server/server.js. Older builds wrote dist/server/index.js.
// Try the current path first, then fall back, so the Node host works against
// either layout without manual changes.
const __dirname = dirname(fileURLToPath(import.meta.url));
const candidates = ["../dist/server/server.js", "../dist/server/index.js"];
let ssrEntryAbs;
for (const rel of candidates) {
  const abs = pathResolve(__dirname, rel);
  if (existsSync(abs)) {
    ssrEntryAbs = abs;
    break;
  }
}
if (!ssrEntryAbs) {
  throw new Error(
    `[afrakala] SSR bundle not found. Looked for: ${candidates.join(", ")}. ` +
      `Run \`vite build\` (with SELF_HOST_NODE=1) before starting the Node host.`,
  );
}
const mod = await import(pathToFileURL(ssrEntryAbs).href);
const handler = mod.default ?? mod;

// ---------------------------------------------------------------------------
// Static file layer for self-host (Node + Docker).
// The Cloudflare/Workers SSR bundle does NOT serve dist/client/** itself — on
// Cloudflare that is the `assets` binding's job. In a Node host we have to do
// it ourselves, before delegating unknown paths to the SSR handler.
// ---------------------------------------------------------------------------
const clientDir = pathResolve(__dirname, "../dist/client");
const assetsDir = pathResolve(clientDir, "assets");
const fontsDir = pathResolve(clientDir, "fonts");

function countByExt(dir, exts) {
  try {
    const files = readdirSync(dir);
    const out = Object.fromEntries(exts.map((e) => [e, 0]));
    for (const f of files) {
      const e = extname(f).toLowerCase();
      if (e in out) out[e] += 1;
    }
    return out;
  } catch {
    return Object.fromEntries(exts.map((e) => [e, 0]));
  }
}

const clientExists = existsSync(clientDir);
const assetsExists = existsSync(assetsDir);
const fontsExists = existsSync(fontsDir);
const assetCounts = assetsExists ? countByExt(assetsDir, [".js", ".css"]) : { ".js": 0, ".css": 0 };

console.log("[afrakala] static layer config:");
console.log("  cwd          :", process.cwd());
console.log("  server dir   :", __dirname);
console.log("  client dir   :", clientDir, clientExists ? "(exists)" : "(MISSING)");
console.log("  assets dir   :", assetsDir, assetsExists ? "(exists)" : "(MISSING)");
console.log("  fonts dir    :", fontsDir, fontsExists ? "(exists)" : "(MISSING)");
console.log(`  asset files  : js=${assetCounts[".js"]} css=${assetCounts[".css"]}`);

if (!clientExists) {
  console.error(
    "[afrakala] FATAL: dist/client is missing. The Node host cannot serve the SPA. " +
      "Rebuild the image with `vite build` (SELF_HOST_NODE=1) so dist/client is populated.",
  );
  process.exit(1);
}
if (!assetsExists) {
  console.error(
    "[afrakala] ERROR: dist/client/assets is missing. /assets/* requests will 404. " +
      "Static layer will still run for other paths, but the app will not boot in the browser.",
  );
} else if (assetCounts[".js"] === 0) {
  console.error(
    "[afrakala] ERROR: no .js files in dist/client/assets. The browser will not be able to bootstrap.",
  );
}

const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
};

function pickCacheControl(pathname) {
  if (pathname.startsWith("/assets/") || pathname.startsWith("/fonts/")) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600";
}

/**
 * Try to serve `pathname` from dist/client. Returns true if the response was
 * sent (or is in the process of streaming) and the SSR handler must NOT run.
 */
function tryServeStatic(req, res, pathname) {
  if (!clientExists) return false;
  if (pathname === "/" || pathname === "") return false; // let SSR render the shell

  // Decode + normalize the URL path against the client root, and guard against
  // path traversal (e.g. /../etc/passwd, encoded variants).
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (decoded.includes("\0")) return false;

  const candidate = pathResolve(clientDir, "." + decoded);
  if (candidate !== clientDir && !candidate.startsWith(clientDir + pathSep)) {
    return false;
  }

  let st;
  try {
    st = statSync(candidate);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;

  const ext = extname(candidate).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("content-type", type);
  res.setHeader("content-length", String(st.size));
  res.setHeader("cache-control", pickCacheControl(decoded));
  res.setHeader("x-static-handler", "node-entry");

  if ((req.method || "GET").toUpperCase() === "HEAD") {
    res.end();
    return true;
  }

  const stream = createReadStream(candidate);
  stream.on("error", (err) => {
    console.error("[afrakala] static stream error:", candidate, err);
    if (!res.headersSent) {
      res.statusCode = 500;
    }
    res.destroy(err);
  });
  stream.pipe(res);
  return true;
}

// Allow CLI overrides: `node server/node-entry.mjs --host 127.0.0.1 --port 8080`
// (used by `npm run preview -- --host ... --port ...`).
function getArg(name) {
  const argv = process.argv.slice(2);
  const idx = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return undefined;
  const a = argv[idx];
  if (a.includes("=")) return a.split("=")[1];
  return argv[idx + 1];
}

const PORT = Number(getArg("port") ?? process.env.PORT ?? 3000);
const HOST = getArg("host") ?? process.env.HOST ?? "0.0.0.0";

const httpServer = createServer(async (req, res) => {
  try {
    const proto = (req.headers["x-forwarded-proto"] || "http").toString().split(",")[0];
    const host = req.headers.host || `${HOST}:${PORT}`;
    const url = `${proto}://${host}${req.url}`;
    const method = (req.method || "GET").toUpperCase();

    // Serve dist/client/** BEFORE the SSR catch-all. Only GET/HEAD; everything
    // else (POST/PUT/PATCH/DELETE) goes straight to the SSR / server-fn router.
    if (method === "GET" || method === "HEAD") {
      let pathname = "/";
      try {
        pathname = new URL(url).pathname;
      } catch {
        pathname = req.url || "/";
      }
      if (tryServeStatic(req, res, pathname)) {
        return;
      }
    }

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) headers.append(k, String(item));
      } else {
        headers.set(k, String(v));
      }
    }

    const hasBody = method !== "GET" && method !== "HEAD";
    const init = { method, headers };
    if (hasBody) {
      init.body = Readable.toWeb(req);
      init.duplex = "half";
    }

    const response = await handler.fetch(new Request(url, init));

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error("[ssr] request failed:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
    }
    res.end("Internal Server Error");
  }
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[afrakala] SSR listening on http://${HOST}:${PORT}`);

  // Publish this build's release notes, once per process. Deliberately started
  // AFTER listen and never awaited: the app must serve traffic whether or not
  // the update page gets its new entry. publishReleaseOnBoot swallows its own
  // errors, and .catch() here is belt-and-braces against an unexpected throw.
  publishReleaseOnBoot({ searchDirs: [clientDir, pathResolve(__dirname, "../public")] }).catch(
    (err) => console.error("[release-publish] unexpected:", err),
  );
});

const shutdown = (signal) => {
  console.log(`[afrakala] received ${signal}, closing...`);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
