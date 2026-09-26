import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectRecordingMeta } from "./transcript-filename";

const here = dirname(fileURLToPath(import.meta.url));

describe("collectRecordingMeta", () => {
  it("collects unique basenames and per-leg uniqueids from CDR fixtures", () => {
    const meta = collectRecordingMeta([
      {
        uniqueid: "1727351422.10",
        recordingfile:
          "/var/spool/asterisk/monitor/2026/09/26/exten-403-09121234567-20260926-143022-1727351422.10.wav",
      },
      {
        uniqueid: "1727351422.11",
        recordingfile: "exten-403-09121234567-20260926-143022-1727351422.10.wav",
      },
    ]);
    assert.deepEqual(meta.legUniqueids, ["1727351422.10", "1727351422.11"]);
    assert.deepEqual(meta.recordingFiles, [
      "exten-403-09121234567-20260926-143022-1727351422.10.wav",
    ]);
  });

  it("keeps empty recording lists when CDR has no file", () => {
    const meta = collectRecordingMeta([{ uniqueid: "1.1", recordingfile: "" }]);
    assert.deepEqual(meta.recordingFiles, []);
    assert.deepEqual(meta.legUniqueids, ["1.1"]);
  });
});

describe("CDR import wire (static)", () => {
  it("selects recordingfile and writes metadata arrays", () => {
    const cdr = readFileSync(join(here, "issabel-cdr.server.ts"), "utf8");
    const imp = readFileSync(join(here, "import-issabel-calls.server.ts"), "utf8");
    assert.match(cdr, /recordingfile/);
    assert.match(imp, /recording_files/);
    assert.match(imp, /leg_uniqueids/);
    assert.match(imp, /link_pending_transcript_sessions/);
  });
});
