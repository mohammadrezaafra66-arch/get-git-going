/**
 * CEL live call poller for Issabel (inbound queue ring + outbound dial).
 * Single-instance (lock file). Posts only mapped extensions.
 * Logs to deploy/lan/logs/issabel-cel-ring.log — no console UI required.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lanDir = path.resolve(__dirname, "..");
const envPath = path.join(lanDir, ".env.lan");
const logDir = path.join(lanDir, "logs");
const logFile = path.join(logDir, "issabel-cel-ring.log");
const stateFile = path.join(logDir, "issabel-cel-ring.state.json");
const lockFile = path.join(logDir, "issabel-cel-ring.lock");

const POLL_MS = 2000;
const MAP_TTL_MS = 60_000;
const CALLER_TTL_MS = 10 * 60 * 1000;

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, line + "\n");
  } catch {
    /* ignore */
  }
}

function acquireLock() {
  fs.mkdirSync(logDir, { recursive: true });
  try {
    if (fs.existsSync(lockFile)) {
      const prev = JSON.parse(fs.readFileSync(lockFile, "utf8"));
      try {
        process.kill(prev.pid, 0);
        // Another live instance — exit quietly.
        process.exit(0);
      } catch {
        // stale lock
      }
    }
    fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, at: Date.now() }));
  } catch (e) {
    log(`lock error: ${e.message}`);
  }
  const clear = () => {
    try {
      if (fs.existsSync(lockFile)) {
        const cur = JSON.parse(fs.readFileSync(lockFile, "utf8"));
        if (cur.pid === process.pid) fs.unlinkSync(lockFile);
      }
    } catch {
      /* ignore */
    }
  };
  process.on("exit", clear);
  process.on("SIGINT", () => {
    clear();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    clear();
    process.exit(0);
  });
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state));
}

async function postRing(env, payload) {
  const port = env.APP_PORT || "3100";
  const token = env.ISSABEL_IMPORT_WORKER_TOKEN;
  if (!token) throw new Error("ISSABEL_IMPORT_WORKER_TOKEN missing");
  const url = `http://127.0.0.1:${port}/api/public/hooks/issabel-ami-ring`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`hook HTTP ${res.status} ${text.slice(0, 200)}`);
  return text;
}

async function fetchMapped(env, cache) {
  const now = Date.now();
  if (cache.set && now - cache.at < MAP_TTL_MS) return cache.set;
  const port = env.APP_PORT || "3100";
  const token = env.ISSABEL_IMPORT_WORKER_TOKEN;
  const url = `http://127.0.0.1:${port}/api/public/hooks/issabel-ami-ring`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`map HTTP ${res.status}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("map non-json (web still starting?)");
  }
  const set = new Set((json.extensions || []).map(String));
  cache.set = set;
  cache.at = now;
  return set;
}

function isQueueMemberStart(row) {
  if (row.eventtype !== "CHAN_START") return false;
  if ((row.context || "") !== "from-queue") return false;
  return /^(?:Local)\/(\d{2,6})@from-queue-[^;]+;1$/.test(row.channame || "");
}

function extensionFromQueueChannel(channame) {
  const m = (channame || "").match(/^Local\/(\d{2,6})@from-queue-/);
  return m ? m[1] : null;
}

/** Outbound: SIP/412 dials an external number (exten length >= 5). */
function parseOutbound(row) {
  if (row.eventtype !== "CHAN_START") return null;
  if ((row.context || "") !== "from-internal") return null;
  const ch = row.channame || "";
  const m = ch.match(/^(?:SIP|PJSIP)\/(\d{2,6})-/);
  if (!m) return null;
  const dest = (row.exten || "").trim();
  if (!dest || dest.length < 5 || dest === "s" || dest === "h") return null;
  // Skip feature codes / short internals
  if (/^\d{2,4}$/.test(dest)) return null;
  return { extension: m[1], destNumber: dest };
}

async function main() {
  acquireLock();
  const env = loadEnv(envPath);
  const host = env.ISSABEL_CDR_HOST;
  const user = env.ISSABEL_CDR_USER;
  const password = env.ISSABEL_CDR_PASSWORD;
  const database = env.ISSABEL_CDR_DB || "asteriskcdrdb";
  if (!host || !user || !password) {
    log("ERROR: ISSABEL_CDR_* missing in .env.lan");
    process.exit(2);
  }

  const callers = new Map();
  const posted = new Map();
  const mappedCache = { set: null, at: 0 };
  let state = readState();

  const conn = await mysql.createConnection({
    host,
    user,
    password,
    database,
    connectTimeout: 10000,
  });

  if (!state.lastId) {
    const [[row]] = await conn.query("SELECT MAX(id) AS max_id FROM cel");
    state.lastId = Number(row.max_id) || 0;
    writeState(state);
    log(`boot watermark cel.id=${state.lastId}`);
  }

  log(`CEL poller started (hidden); poll=${POLL_MS}ms lastId=${state.lastId}`);

  async function emit(env, payload) {
    const linkedid = payload.linkedid || "";
    const dedupeKey = `${payload.direction}|${linkedid}|${payload.extension}`;
    if (posted.has(dedupeKey)) return;
    posted.set(dedupeKey, Date.now());
    try {
      const resp = await postRing(env, payload);
      log(
        `${payload.direction} ext=${payload.extension} num=${payload.callerNumber || "-"} -> ${resp.slice(0, 140)}`,
      );
    } catch (e) {
      posted.delete(dedupeKey);
      log(`ERROR post: ${e.message}`);
    }
  }

  async function tick() {
    const mapped = await fetchMapped(env, mappedCache);
    if (mapped.size === 0) return;

    const [rows] = await conn.query(
      `SELECT id, eventtype, eventtime, cid_num, cid_ani, exten, context, channame, linkedid, uniqueid
       FROM cel WHERE id > ? ORDER BY id ASC LIMIT 300`,
      [state.lastId],
    );
    if (!rows.length) return;

    const now = Date.now();
    for (const [k, v] of callers) {
      if (now - v.at > CALLER_TTL_MS) callers.delete(k);
    }
    for (const [k, at] of posted) {
      if (now - at > CALLER_TTL_MS) posted.delete(k);
    }

    for (const row of rows) {
      state.lastId = Number(row.id);

      if (row.eventtype === "CHAN_START" && (row.context || "") === "from-trunk") {
        const num = (row.cid_num || row.cid_ani || "").trim();
        if (row.linkedid && num && num.length >= 5) {
          callers.set(row.linkedid, { number: num, at: now });
        }
        continue;
      }

      if (isQueueMemberStart(row)) {
        const extension =
          extensionFromQueueChannel(row.channame) || (row.exten || "").trim();
        if (!extension || !mapped.has(extension)) continue;
        const linkedid = row.linkedid || "";
        await emit(env, {
          extension,
          callerNumber: (linkedid && callers.get(linkedid)?.number) || null,
          linkedid: linkedid || null,
          uniqueid: row.uniqueid || null,
          eventAt: new Date().toISOString(),
          source: "cel",
          direction: "inbound",
          raw: { cel_id: row.id, context: row.context, channame: row.channame },
        });
        continue;
      }

      const outbound = parseOutbound(row);
      if (outbound && mapped.has(outbound.extension)) {
        await emit(env, {
          extension: outbound.extension,
          callerNumber: outbound.destNumber,
          linkedid: row.linkedid || null,
          uniqueid: row.uniqueid || null,
          eventAt: new Date().toISOString(),
          source: "cel",
          direction: "outbound",
          raw: { cel_id: row.id, context: row.context, channame: row.channame },
        });
      }
    }

    writeState(state);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (e) {
      log(`ERROR tick: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  log(`FATAL ${e.message}`);
  process.exit(1);
});
