#!/usr/bin/env node
/**
 * Visual regression for a release: the rendering layer next to git diff (code) and
 * scripts/schema-snapshot.sh (database).
 *
 * Starts BOTH images as disposable containers (--rm, 127.0.0.1, free high port) with the
 * SAME runtime environment and the SAME database, captures the same pages from each with
 * Playwright toHaveScreenshot(), and writes before/ after/ diff/ plus SUMMARY.txt.
 *
 *   node scripts/visual-regression/compare.mjs \
 *     --before <image> --after <image> \
 *     --session <minted session file, see mint-session.mjs> \
 *     --out <dir outside any git repo>
 *     [--supabase-url http://192.168.170.8:9000] [--app-env production]
 *
 * Exit: 0 no page differs · 1 at least one page differs · 2 the tool itself failed.
 * Full guide: docs/runbooks/visual-regression/README.md
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const DB_CONTAINER = "afrakala-lan-db";
const DB_NAME = "afrakala";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  console.error(`compare: missing --${name}`);
  process.exit(2);
}

const before = arg("before");
const after = arg("after");
const sessionFile = path.resolve(arg("session"));
const out = path.resolve(arg("out"));
const supabaseUrl = arg("supabase-url", "http://192.168.170.8:9000");
const appEnv = arg("app-env", "production");

const started = Date.now();
const containers = [];

function stopContainers() {
  for (const name of containers.splice(0)) {
    spawnSync("docker", ["stop", "-t", "5", name], { stdio: "ignore" });
  }
}
process.on("SIGINT", () => {
  stopContainers();
  process.exit(2);
});

function insideGitWorkTree(dir) {
  return (
    spawnSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], { stdio: "pipe" })
      .status === 0
  );
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() =>
        port === 3000 || port === 3100 ? freePort().then(resolve, reject) : resolve(port),
      );
    });
    server.on("error", reject);
  });
}

async function waitHealthy(url, seconds = 120) {
  // Docker Desktop's port proxy accepts the TCP connection before the app listens, and a
  // pending fetch does not keep Node's event loop alive — without this explicit (ref'd)
  // timeout the process silently exited 0 mid-wait.
  for (let i = 0; i < seconds; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      if ((await fetch(url, { signal: controller.signal })).ok) return;
    } catch {
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`not healthy after ${seconds}s: ${url}`);
}

function imageId(image) {
  return execFileSync("docker", ["image", "inspect", image, "--format", "{{.Id}}"], {
    encoding: "utf8",
  })
    .trim()
    .replace("sha256:", "")
    .slice(0, 12);
}

async function startContainer(side, image, anonKey) {
  const port = await freePort();
  const name = `visreg-${side}-${process.pid}`;
  // Identical for both sides. No service-role key: the server side cannot act with elevated rights.
  // The anon key is passed by NAME only (-e KEY) so its value never appears in the process list.
  const env = {
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: "3000",
    SUPABASE_URL: supabaseUrl,
    APP_SUPABASE_PUBLIC_URL: supabaseUrl,
    APP_PUBLIC_ENV: appEnv,
    APP_TRUSTED_HOSTS: "127.0.0.1,localhost",
  };
  const envArgs = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-d",
      "--label",
      "visreg=1",
      "--name",
      name,
      "-p",
      `127.0.0.1:${port}:3000`,
      ...envArgs,
      "-e",
      "SUPABASE_PUBLISHABLE_KEY",
      image,
    ],
    {
      stdio: ["ignore", "ignore", "inherit"],
      env: { ...process.env, SUPABASE_PUBLISHABLE_KEY: anonKey },
    },
  );
  containers.push(name);
  const url = `http://127.0.0.1:${port}`;
  await waitHealthy(`${url}/api/healthz`);
  return url;
}

function readOnlyRpcs() {
  // Function names whose every overload is STABLE or IMMUTABLE. Read-only transaction on the server side too.
  const sql =
    "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
    "where n.nspname = 'public' group by p.proname having bool_and(p.provolatile in ('s','i'))";
  return execFileSync(
    "docker",
    [
      "exec",
      "-e",
      "PGOPTIONS=-c default_transaction_read_only=on",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      DB_NAME,
      "-A",
      "-t",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  )
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function runPlaywright(side, baseUrl, frozenTime) {
  const cli = path.join(REPO, "node_modules", "@playwright", "test", "cli.js");
  const args = [cli, "test", "--config", path.join(HERE, "playwright.config.ts")];
  if (side === "before") args.push("--update-snapshots=all");
  spawnSync(process.execPath, args, {
    cwd: REPO,
    stdio: "inherit",
    env: {
      ...process.env,
      VISREG_OUT: out,
      VISREG_SIDE: side,
      VISREG_BASE_URL: baseUrl,
      VISREG_SESSION: sessionFile,
      VISREG_FROZEN_TIME: String(frozenTime),
    },
  });
}

function collectResults() {
  const report = JSON.parse(fs.readFileSync(path.join(out, "report-after.json"), "utf8"));
  const beforeReport = JSON.parse(fs.readFileSync(path.join(out, "report-before.json"), "utf8"));
  const specs = (r) =>
    r.suites.flatMap(function walk(s) {
      return [...(s.specs ?? []), ...(s.suites ?? []).flatMap(walk)];
    });
  const beforeOk = new Map(specs(beforeReport).map((s) => [s.title, s.ok]));
  return specs(report).map((s) => {
    const result = s.tests[0].results.at(-1);
    const message = (result.errors ?? [])
      .map((e) => e.message ?? "")
      .join("\n")
      .replace(/\x1b\[[0-9;]*m/g, "");
    const pixels = message.match(/(\d+) pixels \(ratio ([\d.]+) of all image pixels\)/);
    const size = message.match(/Expected an image (\d+px by \d+px), received (\d+px by \d+px)/);
    let status = "same";
    if (!beforeOk.get(s.title)) status = "ERROR (before capture failed)";
    else if (pixels || size) status = "DIFF";
    else if (result.status !== "passed") status = "ERROR";
    const diffPng = walkFiles(path.join(out, "test-results-after")).find((f) =>
      f.endsWith(`${s.title}-diff.png`),
    );
    if (diffPng) fs.copyFileSync(diffPng, path.join(out, "diff", `${s.title}.png`));
    return {
      page: s.title,
      status,
      pixels: pixels ? Number(pixels[1]) : 0,
      ratio: pixels ? Number(pixels[2]) : 0,
      size: size ? `${size[1]} -> ${size[2]}` : "",
      error: status.startsWith("ERROR") ? message.split("\n").slice(0, 3).join(" ") : "",
    };
  });
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walkFiles(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
}

function network(side, page) {
  const f = path.join(out, "network", `${side}-${page}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : { hosts: [], blocked: [] };
}

function writeSummary(rows, ids) {
  const differ = rows.filter((r) => r.status === "DIFF");
  const errors = rows.filter((r) => r.status.startsWith("ERROR"));
  const seconds = Math.round((Date.now() - started) / 1000);
  const lines = [
    `VISUAL REGRESSION  ${new Date().toISOString()}  (${seconds}s)`,
    `before: ${before} (${ids.before})    after: ${after} (${ids.after})`,
    `same runtime env, same database: ${supabaseUrl}  app-env=${appEnv}`,
    "",
    `RESULT: ${differ.length} of ${rows.length} pages differ` +
      (errors.length ? `, ${errors.length} could not be compared` : ""),
    "",
    ...rows.map((r) => {
      const pct =
        r.status === "DIFF"
          ? `${r.pixels.toLocaleString("en")} px (${(r.ratio * 100).toFixed(2)}%)`
          : "";
      const extra = r.size ? `  size ${r.size}` : r.error ? `  ${r.error}` : "";
      return `  ${r.status.padEnd(6)} ${r.page.padEnd(10)} ${pct.padEnd(22)}${r.status === "DIFF" ? `diff/${r.page}.png` : ""}${extra}`;
    }),
    "",
  ];
  const hostDiffs = rows.filter(
    (r) => network("before", r.page).hosts.join() !== network("after", r.page).hosts.join(),
  );
  lines.push(
    hostDiffs.length === 0
      ? "hosts contacted: identical on every page"
      : `hosts contacted: DIFFER on ${hostDiffs.length} page(s) — a same-looking page may be reading from another server`,
    ...hostDiffs.map(
      (r) =>
        `  ${r.page}: before [${network("before", r.page).hosts.join(", ")}]  after [${network("after", r.page).hosts.join(", ")}]`,
    ),
  );
  const blocked = (side) => [...new Set(rows.flatMap((r) => network(side, r.page).blocked))].sort();
  lines.push(
    `writes blocked by read-only guard: before ${blocked("before").length}, after ${blocked("after").length}` +
      ` (same set: ${blocked("before").join() === blocked("after").join() ? "yes" : "NO"}) — see network/`,
  );
  const text = lines.join("\n") + "\n";
  fs.writeFileSync(path.join(out, "SUMMARY.txt"), text);
  console.log("\n" + text);
  return errors.length ? 2 : differ.length ? 1 : 0;
}

async function main() {
  const session = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
  const minutesLeft = (session.expiresAt * 1000 - Date.now()) / 60000;
  if (minutesLeft < 15) {
    throw new Error(
      `session expires in ${Math.floor(minutesLeft)} min — mint a fresh one (mint-session.mjs)`,
    );
  }
  if (fs.existsSync(out) && fs.readdirSync(out).length)
    throw new Error(`--out must be empty: ${out}`);
  fs.mkdirSync(out, { recursive: true });
  if (insideGitWorkTree(out))
    throw new Error(`--out must be outside any git work tree (screenshots show real data): ${out}`);
  for (const d of ["before", "after", "diff"]) fs.mkdirSync(path.join(out, d), { recursive: true });

  const ids = { before: imageId(before), after: imageId(after) };
  fs.writeFileSync(path.join(out, "readonly-rpcs.json"), JSON.stringify(readOnlyRpcs()));
  const frozenTime = Date.now();

  try {
    const [beforeUrl, afterUrl] = await Promise.all([
      startContainer("before", before, session.anonKey),
      startContainer("after", after, session.anonKey),
    ]);
    runPlaywright("before", beforeUrl, frozenTime);
    runPlaywright("after", afterUrl, frozenTime);
  } finally {
    stopContainers();
  }
  return writeSummary(collectResults(), ids);
}

main().then(
  (code) => process.exit(code),
  (err) => {
    stopContainers();
    console.error(`compare: ${err.message}`);
    process.exit(2);
  },
);
