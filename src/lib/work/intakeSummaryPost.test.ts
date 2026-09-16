/**
 * Client intake-summary must not hang the wizard on a slow AI POST.
 * Run: npx --yes tsx --test src/lib/work/intakeSummaryPost.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INTAKE_SUMMARY_CLIENT_TIMEOUT_MS,
  postIntakeSummary,
} from "./intakeSummaryPost.ts";

/** Simulates a never-resolving network call that still honors AbortSignal (like fetch). */
function hangingFetchRespectingAbort(
  _input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", () => {
      reject(new DOMException("The operation was aborted.", "AbortError"));
    });
  });
}

describe("postIntakeSummary client timeout", () => {
  it("aborts a hanging fetch within ~5s when timeoutMs is set", async () => {
    assert.ok(
      INTAKE_SUMMARY_CLIENT_TIMEOUT_MS <= 5_000,
      "client timeout must stay under 5s so wizard UI never hangs",
    );

    const started = Date.now();
    const result = await postIntakeSummary(
      { answers: [{ questionId: "open_goal", value: "تست" }] },
      {
        fetchImpl: hangingFetchRespectingAbort as typeof fetch,
        getToken: async () => "test-token",
        timeoutMs: INTAKE_SUMMARY_CLIENT_TIMEOUT_MS,
      },
    );
    const elapsed = Date.now() - started;

    assert.equal(result, null);
    assert.ok(
      elapsed < 5_500,
      `expected abort under 5.5s, took ${elapsed}ms — wizard would hang`,
    );
  });

  it("defaults to a finite client timeout (never wait forever)", async () => {
    const started = Date.now();
    const resultPromise = postIntakeSummary(
      { answers: [] },
      {
        fetchImpl: hangingFetchRespectingAbort as typeof fetch,
        getToken: async () => "test-token",
      },
    );

    const raced = await Promise.race([
      resultPromise.then((r) => ({
        kind: "resolved" as const,
        r,
        ms: Date.now() - started,
      })),
      new Promise<{ kind: "deadline" }>((resolve) =>
        setTimeout(() => resolve({ kind: "deadline" }), 5_500),
      ),
    ]);

    assert.equal(
      raced.kind,
      "resolved",
      "default postIntakeSummary must abort hanging AI POST within 5.5s",
    );
    if (raced.kind === "resolved") {
      assert.equal(raced.r, null);
      assert.ok(raced.ms < 5_500);
    }
  });
});
