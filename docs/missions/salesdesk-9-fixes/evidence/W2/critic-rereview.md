# W2 Critic re-review — B4 + B5 only

Worktree: `D:\AfraKalaTest\wt-salesdesk-9-fixes`  
Branch: `feature/salesdesk-9-fixes`  
HEAD (start=end): `e7446bb2e8f94664c6210e94e132e1f31f1b1fad`  
Product fix commit: `b1cc9a884b1265ead48483979c2f3a9a53827889`  
Date: 2026-09-22  
Role: `dev-code-critic` (did not author the fix; builder report not used as evidence)

## معیارهایی که از خواسته استخراج کردم (قبل از خواندن توضیح نویسنده)

| ID | Must hold after fix |
|----|---------------------|
| **B4** | Switching cards must not overwrite the other call’s draft; expect **remount `key`** and/or **persist gate** |
| **B5** | Soft-fail must apply **only** when `deal_id` column is missing; **FK errors must throw** (not soft-return) |

Out of scope this pass: B1–B3, B2 TOCTOU, full ACCEPTANCE UI, typecheck budget, live browser.

## بررسی هر معیار

| معیار | برآورده شد؟ | مسیر:خط / دلیل |
|-------|-------------|----------------|
| **B4 remount key** | بله | `CallerInboundPopup.tsx:635` — `<CallNoteForm key={active.callKey} …>` |
| **B4 persist gate** | بله | `CallNoteForm.tsx:122–139` sets `skipPersistOnceRef`; `:165–168` skips one persist tick after key switch; flush to previous key `:126–138` |
| **B4 no overwrite on A→B** | بله | Probe: `afterB=BODY-B`, `corrupted=false` (see E3) |
| **B5 soft-fail only missing column** | بله | Broad `/deal_id\|column/i` removed; `isMissingDealIdColumnError` at `interactions.ts:73–81`; used only at `:99` |
| **B5 FK must throw path** | بله | Non-missing errors `throw new Error(error.message)` at `interactions.ts:103`; FK messages return `soft=false` (probe + extra matrix) |

## تلاش‌های ابطال

| Attempt | Result |
|---------|--------|
| B4: A→B switch with both drafts populated (fix probe) | `corrupted=false`, `skipGateWorked=true` — previous REJECT scenario no longer reproduces |
| B4: confirm remount present (not only gate) | `key={active.callKey}` present at popup `:635` |
| B4: confirm gate present (not only remount) | `skipPersistOnceRef` flush+skip at form `:121–168` |
| B4: other CallNoteForm call sites without switcher | dossier uses form without `draftKey` / card switch — out of B4 card-switch path |
| B5: FK messages must not soft-match | `FK_ERROR_SOFT_HIDDEN=NO`; both FK strings `soft:false` |
| B5: extra constraint / “is not present” / not-null mentioning deal_id | all `soft:false` except real missing-column (`EXTRA_FALSIFY_OK`) |
| B5: still using old `/deal_id\|column/i`? | grep: gone from `interactions.ts`; only `isMissingDealIdColumnError` |
| B5: second soft-fail call site? | only `linkSalesInteractionDeal` `:97–104` |

**C-1 three “looks done but isn’t” checks**

1. Probe mirrors effect logic rather than React render → mitigated: remount `key` independently prevents same-instance stale persist; source matches probe order.  
2. Matcher unit-only while `linkSalesInteractionDeal` still broad → false: `:99` calls the narrow helper.  
3. Warm/cached UI → N/A (pure localStorage + pure string matcher).

## اجرای واقعی (E3)

### B4 probe
```
npx --yes tsx docs/missions/salesdesk-9-fixes/evidence/W2/fe-draft-switch-fix-probe.mjs
→ exit 0
{"afterA":"BODY-A","afterB":"BODY-B","inMemoryBody":"BODY-B","corrupted":false,"skipGateWorked":true}
PROBE_DRAFT_SWITCH_CORRUPT=FALSE
PROBE_B4_FIX=PASS
```
Artifact: `critic-rereview-b4-probe.txt`

### B5 probe
```
npx --yes tsx docs/missions/salesdesk-9-fixes/evidence/W2/fe-dealid-softfail-fix-probe.mjs
→ exit 0
FK_ERROR_SOFT_HIDDEN=NO
PROBE_B5_FIX=PASS
```
Artifact: `critic-rereview-b5-probe.txt`

### B5 unit
```
npx --yes tsx --test src/lib/sales-desk/interactions-deal-id.test.ts
→ exit 0; tests 2; pass 2; fail 0
```
Artifact: `critic-rereview-b5-unit.txt`

### B5 extra falsify matrix
```
FK / is-not-present / unique / not-null → soft:false
column deal_id does not exist → soft:true
EXTRA_FALSIFY_OK; exit 0
```
Artifact: `critic-rereview-b5-extra.txt`

## یافته‌ها

| شدت | مسیر:خط | چرا | شکست؟ |
|-----|---------|-----|--------|
| — | — | No acceptance blockers for B4/B5 under re-measured criteria | — |

## توصیه‌های سلیقه‌ای (مانع پذیرش نیست)

- B4 fix probe reimplements switch logic instead of driving React; remount + source parity make this acceptable for this gate, but a component-level test would harden further.
- `isMissingDealIdColumnError` still has a somewhat wide `/deal_id.*does not exist/i` arm; measured FK/constraint strings do not hit it.

## چه چیزی را نتوانستم بررسی کنم

- Live cold-browser card switch (no E2E/browser session this pass).
- Real PostgREST/Postgres error strings from a live DB (used documented FK + PostgREST schema-cache phrasings).
- Full B5 ACCEPTANCE path («افزودن معامله» → create → linked row) end-to-end — only the soft-fail gate that previously REJECT’d.

## حکم per row

| Row | Verdict |
|-----|---------|
| **B4** | **CONFIRM** |
| **B5** | **CONFIRM** |

## Overall (B4+B5 only): **CONFIRM**

Previous REJECT causes are closed under independent re-measurement: remount key + persist gate present; draft switch probe no longer corrupts; soft-fail narrowed so FK is not hidden.
