/**
 * Create D:\afrakala-stt\.env from lan tokens. Prints no secret values.
 * node docs/missions/call-transcription/write-stt-env.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const lanPath = [
  process.env.AFRAKALA_LAN_ENV,
  path.join(process.cwd(), "deploy/lan/.env.lan"),
  "D:/AfraKalaTest/app/deploy/lan/.env.lan",
].find((p) => p && fs.existsSync(p));
if (!lanPath) {
  console.error("NO_ENV_LAN");
  process.exit(2);
}
const lan = Object.fromEntries(
  fs
    .readFileSync(lanPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const dest = "D:/afrakala-stt/.env";
const existing = fs.existsSync(dest)
  ? Object.fromEntries(
      fs
        .readFileSync(dest, "utf8")
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i), l.slice(i + 1)];
        }),
    )
  : {};

const worker = lan.CALL_TRANSCRIPT_WORKER_TOKEN || existing.CALL_TRANSCRIPT_WORKER_TOKEN || "";
if (!worker || worker.length < 16) {
  console.error("MISSING_CALL_TRANSCRIPT_WORKER_TOKEN");
  process.exit(2);
}
const ingest =
  existing.STT_INGEST_TOKEN && existing.STT_INGEST_TOKEN.length >= 16
    ? existing.STT_INGEST_TOKEN
    : crypto.randomBytes(32).toString("hex");

const body = [
  `STT_INGEST_TOKEN=${ingest}`,
  `CALL_TRANSCRIPT_WORKER_TOKEN=${worker}`,
  "STT_TARGETS=http://192.168.170.8:3100/api/public/hooks/call-transcript",
  "VOSK_MODEL_DIR=/models/vosk-model-fa-0.42",
  "WHISPER_MODEL_DIR=/models/farsi-faster-whisper-large-v3",
  "WHISPER_FALLBACK_DIR=/models/faster-whisper-small",
  "LIVE_ENGINE=vosk",
  "FINAL_ENGINE=whisper",
  "",
].join("\n");

fs.mkdirSync("D:/afrakala-stt", { recursive: true });
fs.writeFileSync(dest, body, { encoding: "utf8", mode: 0o600 });
console.log(
  JSON.stringify({
    ok: true,
    dest,
    worker_chars: worker.length,
    ingest_chars: ingest.length,
    reused_ingest: Boolean(existing.STT_INGEST_TOKEN),
  }),
);
