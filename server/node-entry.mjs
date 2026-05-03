// Minimal Node.js adapter that hosts the TanStack Start web `fetch` handler
// produced by `vite build` (dist/server/server.js). No Worker/Cloudflare runtime.
import { createServer } from "node:http";
import { Readable } from "node:stream";
import handler from "../dist/server/server.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const httpServer = createServer(async (req, res) => {
  try {
    const proto = (req.headers["x-forwarded-proto"] || "http").toString().split(",")[0];
    const host = req.headers.host || `${HOST}:${PORT}`;
    const url = `${proto}://${host}${req.url}`;
    const method = (req.method || "GET").toUpperCase();

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
});

const shutdown = (signal) => {
  console.log(`[afrakala] received ${signal}, closing...`);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));