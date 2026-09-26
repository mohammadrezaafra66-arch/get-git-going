/**
 * Host-side hook smoke (not C1). C1 must run inside afrakala-stt.
 * Prints no token.
 */
import fs from "node:fs";
import path from "node:path";

const envPath = [
  process.env.AFRAKALA_LAN_ENV,
  path.join(process.cwd(), "deploy/lan/.env.lan"),
].find((p) => p && fs.existsSync(p));
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const token = env.CALL_TRANSCRIPT_WORKER_TOKEN;
if (!token) {
  console.error("MISSING_TOKEN");
  process.exit(2);
}
const stamp = Date.now();
const body = {
  recording_filename: `exten-403-09000009100-20260926-120000-${stamp}.wav`,
  recording_uniqueid: String(stamp),
  kind: "committed",
  segment_seq: 0,
  text: "تست هوک از میزبان",
  extension: "403",
  prefix: "exten",
};
const res = await fetch("http://192.168.170.8:3100/api/public/hooks/call-transcript", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});
const text = await res.text();
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw_len: text.length };
}
console.log(
  JSON.stringify({
    status: res.status,
    ok: parsed.ok === true,
    has_session: Boolean(parsed.session_id),
    duplicate: parsed.duplicate === true,
  }),
);
if (res.status !== 200 || parsed.ok !== true) process.exit(1);
