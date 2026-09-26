import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseIssabelRecordingName,
  recordingBasename,
} from "./transcript-filename";

describe("recordingBasename", () => {
  it("strips Issabel monitor path", () => {
    assert.equal(
      recordingBasename("/var/spool/asterisk/monitor/2026/09/26/exten-403-x.wav"),
      "exten-403-x.wav",
    );
  });
  it("returns null for empty", () => {
    assert.equal(recordingBasename(""), null);
    assert.equal(recordingBasename(null), null);
  });
});

describe("parseIssabelRecordingName", () => {
  it("parses inbound exten file", () => {
    const p = parseIssabelRecordingName(
      "exten-403-09121234567-20260926-143022-1727351422.123.wav",
    );
    assert.ok(p);
    assert.equal(p.prefix, "exten");
    assert.equal(p.extension, "403");
    assert.equal(p.recordingUniqueid, "1727351422.123");
    assert.equal(p.queue, null);
  });
  it("parses outbound file", () => {
    const p = parseIssabelRecordingName(
      "out-09121234567-412-20260926-143022-1727351422.9.wav",
    );
    assert.ok(p);
    assert.equal(p.prefix, "out");
    assert.equal(p.extension, "412");
  });
  it("parses queue file without agent extension", () => {
    const p = parseIssabelRecordingName(
      "q-6001-09121234567-20260926-143022-1727351422.1.wav",
    );
    assert.ok(p);
    assert.equal(p.queue, "6001");
    assert.equal(p.extension, null);
  });
  it("skips gsm and internal", () => {
    assert.equal(parseIssabelRecordingName("q-6001-x-20260926-143022-1.gsm"), null);
    assert.equal(
      parseIssabelRecordingName("internal-403-404-20260926-143022-1.wav"),
      null,
    );
  });
});
