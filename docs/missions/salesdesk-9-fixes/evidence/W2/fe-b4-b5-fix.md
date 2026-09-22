# W2-FE fix-up — B4/B5 critic REJECT

Date: 2026-09-22  
Baseline HEAD before fix: `8b64a42ef938c2cffc18a582ad67d64fb45ae3c4`

## B4 — draft overwrite on switch

**Fix:**
1. `CallerInboundPopup.tsx` — `key={active.callKey}` on `CallNoteForm` (remount).
2. `CallNoteForm.tsx` — on draftKey change: flush in-memory draft to *previous* key, set `skipPersistOnce`, then load target; persist effect skips one tick.

**Probe (E4):** `fe-draft-switch-fix-probe.mjs` → `{"afterB":"BODY-B","corrupted":false}` / `PROBE_DRAFT_SWITCH_CORRUPT=FALSE` (exit 0).  
Critic before: `afterB=BODY-A`, `corrupted:true`.

## B5 — deal_id soft-fail too broad

**Fix:** `isMissingDealIdColumnError()` — only missing-column patterns; FK messages return false → throw.

**Probe (E4):** `fe-dealid-softfail-fix-probe.mjs` → `FK_ERROR_SOFT_HIDDEN=NO` (exit 0).  
Unit: `interactions-deal-id.test.ts` pass.

## B2 claim TOCTOU

Left noted (optional, >cheap path): two tabs can both pass `shouldPresentCallCard` before BC claim arrives. Not changed this pass.

## Typecheck

`fe-fix-tsc.txt` — **error_count=74** EXIT=2 (≤74 held).
