/**
 * Offline replay: prove direct-inbound CEL path catches IVR→ext rings
 * that queue-only detection missed (e.g. 09122270261 → 412).
 *
 * Usage (from app/): node deploy/lan/scripts/issabel-cel-ring-replay-test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import {
  extensionFromQueueChannel,
  isQueueMemberStart,
  parseDirectInbound,
  parseOutbound,
  rememberTrunkCaller,
} from "./issabel-cel-ring-classify.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.lan");

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

function classifyBatch(rows, mapped) {
  const callers = new Map();
  const emitted = [];
  const posted = new Set();

  for (const row of rows) {
    rememberTrunkCaller(row, callers, Date.now());

    if (isQueueMemberStart(row)) {
      const extension =
        extensionFromQueueChannel(row.channame) || (row.exten || "").trim();
      if (!extension || !mapped.has(extension)) continue;
      const linkedid = row.linkedid || "";
      const key = `inbound|${linkedid}|${extension}`;
      if (posted.has(key)) continue;
      posted.add(key);
      emitted.push({
        path: "queue",
        direction: "inbound",
        extension,
        callerNumber: callers.get(linkedid)?.number || null,
        linkedid,
        cel_id: row.id,
      });
      continue;
    }

    const direct = parseDirectInbound(row, callers);
    if (direct && mapped.has(direct.extension)) {
      const key = `inbound|${row.linkedid || ""}|${direct.extension}`;
      if (posted.has(key)) continue;
      posted.add(key);
      emitted.push({
        path: "direct",
        direction: "inbound",
        extension: direct.extension,
        callerNumber: direct.callerNumber,
        linkedid: row.linkedid || "",
        cel_id: row.id,
      });
      continue;
    }

    const outbound = parseOutbound(row);
    if (outbound && mapped.has(outbound.extension)) {
      const key = `outbound|${row.linkedid || ""}|${outbound.extension}`;
      if (posted.has(key)) continue;
      posted.add(key);
      emitted.push({
        path: "outbound",
        direction: "outbound",
        extension: outbound.extension,
        callerNumber: outbound.destNumber,
        linkedid: row.linkedid || "",
        cel_id: row.id,
      });
    }
  }

  return emitted;
}

const env = loadEnv(envPath);
const mapped = new Set(["401", "402", "403", "404", "407", "408", "409", "412", "413", "445"]);

const conn = await mysql.createConnection({
  host: env.ISSABEL_CDR_HOST,
  user: env.ISSABEL_CDR_USER,
  password: env.ISSABEL_CDR_PASSWORD,
  database: env.ISSABEL_CDR_DB || "asteriskcdrdb",
});

// Replay one known direct call linkedid (09122270261 → 412 via IVR)
const targetLinked = "1789577603.1246818";
const [chain] = await conn.query(
  `SELECT id,eventtype,eventtime,cid_num,cid_ani,exten,context,channame,linkedid,uniqueid
   FROM cel WHERE linkedid = ? ORDER BY id ASC`,
  [targetLinked],
);

const emitted = classifyBatch(chain, mapped);
const directHits = emitted.filter(
  (e) =>
    e.path === "direct" &&
    e.extension === "412" &&
    String(e.callerNumber || "").includes("9122270261"),
);

console.log("chain_rows", chain.length);
console.log("emitted", JSON.stringify(emitted, null, 2));
console.log("direct_hits", directHits.length);

// Broader: last 6h all CEL for this mobile — how many direct inbound would fire
const [all] = await conn.query(
  `SELECT id,eventtype,eventtime,cid_num,cid_ani,exten,context,channame,linkedid,uniqueid
   FROM cel
   WHERE eventtime > DATE_SUB(NOW(), INTERVAL 6 HOUR)
     AND (
       linkedid IN (
         SELECT DISTINCT linkedid FROM cel
         WHERE eventtime > DATE_SUB(NOW(), INTERVAL 6 HOUR)
           AND (cid_num LIKE '%9122270261%' OR cid_ani LIKE '%9122270261%')
       )
     )
   ORDER BY id ASC
   LIMIT 2000`,
);
const broad = classifyBatch(all, mapped);
const broadDirect = broad.filter((e) => e.path === "direct");
const broadQueue = broad.filter((e) => e.path === "queue");
console.log("broad_rows", all.length);
console.log("broad_direct", broadDirect.length, JSON.stringify(broadDirect));
console.log("broad_queue", broadQueue.length);

await conn.end();

if (directHits.length < 1) {
  console.error("FAIL: expected at least one direct inbound ring for 9122270261→412");
  process.exit(1);
}
console.log("PASS: direct inbound path detects 9122270261 → 412");
