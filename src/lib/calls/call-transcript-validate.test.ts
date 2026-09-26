import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CALL_TRANSCRIPT_MAX_BODY_BYTES,
  checkDedicatedWorkerToken,
  validateCallTranscriptBody,
} from "./call-transcript-validate";

describe("validateCallTranscriptBody", () => {
  const good = {
    recording_filename: "exten-403-x-20260926-143022-1.1.wav",
    recording_uniqueid: "1.1",
    kind: "committed",
    segment_seq: 0,
    text: "سلام",
  };

  it("accepts a well-shaped body", () => {
    const r = validateCallTranscriptBody(good, 80);
    assert.equal(r.ok, true);
  });

  it("rejects oversize bodies", () => {
    const r = validateCallTranscriptBody(good, CALL_TRANSCRIPT_MAX_BODY_BYTES + 1);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 413);
  });

  it("rejects missing token fields and bad kind", () => {
    assert.equal(validateCallTranscriptBody({}, 2).ok, false);
    assert.equal(
      validateCallTranscriptBody({ ...good, kind: "nope" }, 80).ok,
      false,
    );
  });
});

describe("checkDedicatedWorkerToken", () => {
  it("returns 500 when env is empty", () => {
    const r = checkDedicatedWorkerToken(new Request("http://x"), undefined);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 500);
  });
  it("returns 401 on missing or wrong bearer", () => {
    const expected = "test-token-not-a-secret-name-only";
    const missing = checkDedicatedWorkerToken(new Request("http://x"), expected);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.status, 401);
    const wrong = checkDedicatedWorkerToken(
      new Request("http://x", { headers: { authorization: "Bearer other" } }),
      expected,
    );
    assert.equal(wrong.ok, false);
    const ok = checkDedicatedWorkerToken(
      new Request("http://x", { headers: { authorization: `Bearer ${expected}` } }),
      expected,
    );
    assert.equal(ok.ok, true);
  });
});
