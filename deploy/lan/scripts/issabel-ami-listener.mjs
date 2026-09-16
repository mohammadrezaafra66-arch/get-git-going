/**
 * Issabel AMI live-ring listener.
 *
 * Requires ISSABEL_AMI_USER + ISSABEL_AMI_SECRET in deploy/lan/.env.lan
 * (see docs/ops/issabel-ami-listener-setup.md). Until those exist, use
 * issabel-cel-ring-poller.mjs which works with the CDR MySQL user.
 *
 * Posts the same payload shape to /api/public/hooks/issabel-ami-ring.
 */
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lanDir = path.resolve(__dirname, "..");
const envPath = path.join(lanDir, ".env.lan");
const logDir = path.join(lanDir, "logs");
const logFile = path.join(logDir, "issabel-ami-listener.log");

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
  console.log(line);
}

function parseAmiBlocks(buffer) {
  const parts = buffer.split("\r\n\r\n");
  const rest = parts.pop() ?? "";
  const events = [];
  for (const part of parts) {
    if (!part.trim()) continue;
    const obj = {};
    for (const line of part.split(/\r\n/)) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      obj[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    events.push(obj);
  }
  return { events, rest };
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

function extractRing(ev) {
  const event = (ev.Event || "").toLowerCase();
  // DialBegin: DestCallerIDNum / CallerIDNum
  if (event === "dialbegin") {
    const dest = (ev.DestCallerIDNum || ev.DestExten || "").trim();
    const caller = (ev.CallerIDNum || ev.ConnectedLineNum || "").trim();
    const channel = ev.DestChannel || ev.Channel || "";
    const extMatch = channel.match(/(?:Local|SIP|PJSIP)\/(\d{2,6})/);
    const extension = /^\d{2,6}$/.test(dest) ? dest : extMatch?.[1];
    if (!extension) return null;
    if (caller && caller.length < 5 && /^\d{2,6}$/.test(caller)) return null; // internal
    return {
      extension,
      callerNumber: caller || null,
      linkedid: ev.Linkedid || ev.LinkedID || null,
      uniqueid: ev.DestUniqueid || ev.Uniqueid || null,
    };
  }
  if (event === "agentcalled" || event === "agentringnoanswer") {
    const extension = (ev.Extension || ev.MemberName || ev.Interface || "")
      .replace(/^Local\//, "")
      .replace(/@.*$/, "")
      .trim();
    if (!/^\d{2,6}$/.test(extension)) return null;
    return {
      extension,
      callerNumber: (ev.CallerIDNum || ev.CallerID || "").trim() || null,
      linkedid: ev.Linkedid || null,
      uniqueid: ev.Uniqueid || null,
    };
  }
  if (event === "newstate" && (ev.ChannelStateDesc || "") === "Ringing") {
    const channel = ev.Channel || "";
    const m = channel.match(/^(?:Local|SIP|PJSIP)\/(\d{2,6})/);
    if (!m) return null;
    const caller = (ev.CallerIDNum || ev.ConnectedLineNum || "").trim();
    if (caller && caller.length < 5 && /^\d{2,6}$/.test(caller)) return null;
    return {
      extension: m[1],
      callerNumber: caller || null,
      linkedid: ev.Linkedid || null,
      uniqueid: ev.Uniqueid || null,
    };
  }
  return null;
}

function connectOnce(env) {
  return new Promise((resolve) => {
    const host = env.ISSABEL_AMI_HOST || env.ISSABEL_CDR_HOST || "192.168.170.252";
    const port = Number(env.ISSABEL_AMI_PORT || 5038);
    const user = env.ISSABEL_AMI_USER;
    const secret = env.ISSABEL_AMI_SECRET;
    if (!user || !secret) {
      log("ERROR: ISSABEL_AMI_USER / ISSABEL_AMI_SECRET missing — see docs/ops/issabel-ami-listener-setup.md");
      process.exit(2);
    }

    const posted = new Map();
    let buf = "";
    const socket = net.connect({ host, port }, () => {
      log(`AMI connected ${host}:${port}`);
      socket.write(
        `Action: Login\r\nUsername: ${user}\r\nSecret: ${secret}\r\nEvents: on\r\n\r\n`,
      );
    });

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buf += chunk;
      const parsed = parseAmiBlocks(buf);
      buf = parsed.rest;
      for (const ev of parsed.events) {
        if (ev.Response === "Error") {
          log(`AMI error: ${ev.Message || JSON.stringify(ev)}`);
          continue;
        }
        if (ev.Response === "Success" && (ev.Message || "").includes("Authentication")) {
          log("AMI login OK");
          continue;
        }
        const ring = extractRing(ev);
        if (!ring) continue;
        const key = `${ring.linkedid || ""}|${ring.extension}`;
        const now = Date.now();
        if (posted.has(key) && now - posted.get(key) < 60_000) continue;
        posted.set(key, now);
        postRing(env, {
          ...ring,
          eventAt: new Date().toISOString(),
          source: "ami",
          raw: ev,
        })
          .then((t) => log(`ring ext=${ring.extension} -> ${t.slice(0, 120)}`))
          .catch((e) => {
            posted.delete(key);
            log(`ERROR post: ${e.message}`);
          });
      }
    });

    socket.on("error", (e) => {
      log(`AMI socket error: ${e.message}`);
    });
    socket.on("close", () => {
      log("AMI disconnected");
      resolve();
    });
  });
}

async function main() {
  const env = loadEnv(envPath);
  let delay = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await connectOnce(env);
    log(`reconnect in ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 30_000);
  }
}

main().catch((e) => {
  log(`FATAL ${e.message}`);
  process.exit(1);
});
