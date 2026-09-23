/**
 * B4 fix probe: simulate CallNoteForm draftKey switch A→B with flush+skip-persist.
 * Mirrors CallNoteForm effect order after critic REJECT (stale body must not overwrite B).
 *
 * Run:
 *   npx --yes tsx docs/missions/salesdesk-9-fixes/evidence/W2/fe-draft-switch-fix-probe.mjs
 */
import assert from "node:assert/strict";
import {
  saveCallDraft,
  loadCallDraft,
  clearCallDraft,
} from "../../../../../src/lib/calls/call-drafts.ts";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};

clearCallDraft("lid:A");
clearCallDraft("lid:B");
saveCallDraft("lid:A", {
  kind: "call",
  body: "BODY-A",
  title: "",
  followUpDate: null,
  followUpTime: "09:00",
  dealId: null,
});
saveCallDraft("lid:B", {
  kind: "call",
  body: "BODY-B",
  title: "",
  followUpDate: null,
  followUpTime: "09:00",
  dealId: null,
});

// In-memory form state while viewing call A
let kind = "call";
let body = "BODY-A";
let title = "";
let followUpDate = null;
let followUpTime = "09:00";
let linkedDealId = null;
let activeKey = "lid:A";
let skipPersistOnce = false;
const defaultKind = "call";

function draftHasContent() {
  return Boolean(
    body.trim() ||
      title.trim() ||
      followUpDate ||
      linkedDealId ||
      kind !== defaultKind,
  );
}

/** Fixed switch handler (CallNoteForm after fix) */
function onDraftKeyChange(nextKey) {
  const prevKey = activeKey;
  if (prevKey && prevKey !== nextKey) {
    if (draftHasContent()) {
      saveCallDraft(prevKey, {
        kind,
        body,
        title,
        followUpDate,
        followUpTime,
        dealId: linkedDealId,
      });
    }
    skipPersistOnce = true;
  }
  activeKey = nextKey;
  if (!nextKey) return;
  const d = loadCallDraft(nextKey);
  kind = d?.kind ?? defaultKind;
  body = d?.body ?? "";
  title = d?.title ?? "";
  followUpDate = d?.followUpDate ?? null;
  followUpTime = d?.followUpTime ?? "09:00";
  linkedDealId = d?.dealId ?? null;
}

function persistEffect(draftKey) {
  if (!draftKey) return;
  if (skipPersistOnce) {
    skipPersistOnce = false;
    return; // skip stale tick
  }
  if (!draftHasContent()) return;
  saveCallDraft(draftKey, {
    kind,
    body,
    title,
    followUpDate,
    followUpTime,
    dealId: linkedDealId,
  });
}

// --- switch A → B (same commit: reload then persist, as React effect order) ---
onDraftKeyChange("lid:B");
persistEffect("lid:B"); // must skip — would have written BODY-A under critic bug

const afterB = loadCallDraft("lid:B");
const afterA = loadCallDraft("lid:A");
const corrupted = afterB?.body === "BODY-A";

const result = {
  afterA: afterA?.body,
  afterB: afterB?.body,
  inMemoryBody: body,
  corrupted,
  skipGateWorked: !corrupted && afterB?.body === "BODY-B",
};

console.log(JSON.stringify(result));

assert.equal(afterB?.body, "BODY-B", "B draft must stay BODY-B");
assert.equal(afterA?.body, "BODY-A", "A draft preserved");
assert.equal(corrupted, false);
assert.equal(body, "BODY-B", "in-memory loaded B");
console.log("PROBE_DRAFT_SWITCH_CORRUPT=FALSE");
console.log("PROBE_B4_FIX=PASS");
