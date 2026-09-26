/**
 * C1: POST hook URL from inside afrakala-stt to 192.168.170.8:3100 (not 127.0.0.1).
 * Prints no tokens.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const py = `
import json, os, time
import httpx
url = os.environ.get("STT_TARGETS", "").split(",")[0].strip()
token = os.environ.get("CALL_TRANSCRIPT_WORKER_TOKEN", "")
assert url.startswith("http://192.168.170.8:3100"), url
assert "127.0.0.1" not in url
stamp = str(int(time.time()))
payload = {
  "recording_filename": f"exten-403-09000009101-20260926-120000-{stamp}.1.wav",
  "recording_uniqueid": f"{stamp}.1",
  "kind": "committed",
  "segment_seq": 0,
  "text": "سلام این یک تست تحویل از داخل کانتینر است",
  "extension": "403",
  "prefix": "exten",
}
r = httpx.post(url, json=payload, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, timeout=20.0)
print(json.dumps({"url_host": "192.168.170.8:3100", "status": r.status_code, "ok": r.is_success, "bytes": len(r.content)}))
`;

const local = path.join(process.cwd(), "docs/missions/call-transcription/_c1_inside.py");
fs.writeFileSync(local, py, "utf8");
execFileSync("docker", ["cp", local, "afrakala-stt:/tmp/_c1_inside.py"]);
const out = execFileSync(
  "docker",
  ["exec", "afrakala-stt", "python", "/tmp/_c1_inside.py"],
  { encoding: "utf8" },
);
fs.unlinkSync(local);
process.stdout.write(out);
if (!out.includes('"ok": true') && !out.includes('"ok":true')) {
  process.exit(1);
}
