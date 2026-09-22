/**
 * Critic probe: CallNoteForm draftKey switch without remount key=
 * simulates React effect order (reload then persist) with stale state.
 * Run: npx --yes tsx docs/missions/salesdesk-9-fixes/evidence/W2/critic-draft-switch-probe.mjs
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

const kind = "call";
const body = "BODY-A";
const title = "";
const followUpDate = null;
const followUpTime = "09:00";
const linkedDealId = null;
const draftKey = "lid:B";
const defaultKind = "call";

const d = loadCallDraft(draftKey);
assert.equal(d?.body, "BODY-B");

const hasContent =
  Boolean(body.trim()) ||
  Boolean(title.trim()) ||
  Boolean(followUpDate) ||
  Boolean(linkedDealId) ||
  kind !== defaultKind;
if (hasContent) {
  saveCallDraft(draftKey, {
    kind,
    body,
    title,
    followUpDate,
    followUpTime,
    dealId: linkedDealId,
  });
}

const after = loadCallDraft("lid:B");
console.log(
  JSON.stringify({
    afterB: after?.body,
    corrupted: after?.body === "BODY-A",
  }),
);
assert.equal(
  after?.body,
  "BODY-A",
  "stale persist overwrites B draft with A body",
);
console.log("PROBE_DRAFT_SWITCH_CORRUPT=CONFIRMED");
