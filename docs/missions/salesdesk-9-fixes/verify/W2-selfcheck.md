# W2 self-check — fresh eyes (B1–B5)

Derived from `EXECUTION-PROMPT.md` §3 / §5 Wave 2 / §6.  
Worktree: `D:\AfraKalaTest\wt-salesdesk-9-fixes` · Branch: `feature/salesdesk-9-fixes`  
Updated: 2026-09-21T22:34:59Z after product fix `b1cc9a88` + critic re-review CONFIRM.  
Method: one **check** + one **refutation attempt** per row; RESULTS from repo + `evidence/W2/*`.

Legend: **PASS** = claim supported by cited artifact/code · **FAIL** = claim unsupported or contradicted.

---

## Matrix

| Row | Check (from §5/§6) | Refutation attempt | RESULT |
|-----|--------------------|--------------------|--------|
| B1 | دو ردیف ring با `linkedid` یکسان → یک کلید کارت | اگر کلید هنوز `ring:${uuid}` باشد دو کارت می‌ماند | **PASS** |
| B2 | `BroadcastChannel` کانال `afrakala-caller-id`؛ claim/dismiss | race دو تب قبل از mark → هر دو present | **PASS** (CONFIRM؛ medium TOCTOU ثبت‌شده) |
| B3 | ستون‌ها + برچسب‌های §6؛ TTL از `display_seconds` | اگر `CARD_TTL_MS=5000` یا برچسب غلط باشد رد | **PASS** |
| B4 | سوئیچ کارت پیش‌نویس دیگری را overwrite نکند | پروب A→B پس از fix باید `corrupted=true` بماند اگر رفع نشده | **PASS** |
| B5 | soft-fail فقط ستون غایب؛ FK پرتاب شود | اگر FK هنوز soft شود `FK_ERROR_SOFT_HIDDEN=YES` | **PASS** |

---

## B1 — detail

**Check:** §5 B1 — group by `linkedid`; probe دو داخلی یک linkedid → یک کارت.

**Evidence:** `orch-unit-tsx.txt` 16 pass; `b1-hook-probe.md` + `b1-group-real.json` — 2 rows → 1 group, `"pass": true` (E3/E4). Critic: **CONFIRM** — `critic.md`.

**Refutation:** old `ring:` keys دو کارت — رد شد با `old_card_key_count=2` vs `new_card_key_count=1`.

**RESULT: PASS**

---

## B2 — detail

**Check:** §5 B2 — cross-tab BroadcastChannel.

**Evidence:** `caller-broadcast.ts` کانال `afrakala-caller-id`; critic **CONFIRM** (with medium finding) — `critic.md`. Race probe: `bothClaimBeforeMark:true` — `critic-bc-race-probe.txt` (E3).

**Refutation:** TOCTOU می‌تواند دو تب را همزمان primary کند — **مشاهده شد** ولی orchestrator ردیف را DONE با note medium می‌بندد؛ duplicate sound N/A (no Audio in popup per critic).

**RESULT: PASS** (CONFIRM؛ medium TOCTOU noted — not FAIL for wave close)

---

## B3 — detail

**Check:** §5 B3 / §6 labels + `display_seconds` 5–120 default 15.

**Evidence:** `orch-db-verify.txt`; UI `_app.settings.caller-id.tsx:139–169`; critic **CONFIRM** — `critic.md`; filter unit in `orch-unit-tsx.txt`.

**Refutation:** hardcoded 5s TTL — replaced by `callerIdCardTtlMs` (`caller-id-settings.ts:160-161`).

**RESULT: PASS**

---

## B4 — detail

**Check:** §5 B4 — switching cards never overwrites the other draft.

**Evidence (after fix `b1cc9a88`):**
- Remount: `CallerInboundPopup.tsx:635` `key={active.callKey}` — cited in `critic-rereview.md` (E1).
- Persist gate: `skipPersistOnceRef` — `critic-rereview.md` (E1).
- Probe: `{"afterB":"BODY-B","corrupted":false,"skipGateWorked":true}` · `PROBE_B4_FIX=PASS` · exit 0 — `critic-rereview-b4-probe.txt`, `orch-b4-reprobe.txt` (E3/E4 vs prior `corrupted:true` in `critic-draft-switch-probe.txt`).
- Critic re-review: **CONFIRM** — `critic-rereview.md`.

**Refutation:** re-run overwrite scenario — no longer reproduces (`PROBE_DRAFT_SWITCH_CORRUPT=FALSE`).

**RESULT: PASS**

---

## B5 — detail

**Check:** §5 B5 — «افزودن معامله» + `deal_id` link; soft-fail only if column missing.

**Evidence (after fix `b1cc9a88`):**
- Schema: migration 564 applied — `orch-db-verify.txt`, `applied-20260921230100_564.txt` (E3).
- Soft-fail narrowed: `FK_ERROR_SOFT_HIDDEN=NO`; FK rows `soft:false`; missing-column `soft:true` — `critic-rereview-b5-probe.txt`, `orch-b5-reprobe.txt` (E3).
- Unit: `interactions-deal-id.test.ts` 2 pass — `critic-rereview-b5-unit.txt` (E3).
- Critic re-review: **CONFIRM** — `critic-rereview.md`.

**Refutation:** FK must not soft-match — matrix shows FK soft:false; previous REJECT (`FK_ERROR_SOFT_HIDDEN=YES` in `critic-dealid-softfail-probe.txt`) closed.

**RESULT: PASS**

---

## Deploy / gate context

| Claim | Artifact | RESULT |
|-------|----------|--------|
| Compose safety only-web | `compose-safety.txt` SAFE | **PASS** |
| 3100 = `e7446bb2` healthy | DOC `docker exec printenv APP_GIT_SHA` → `e7446bb2`; health `healthy` | **PASS** |
| Typecheck ≤74 | `critic-tsc.txt` ERROR_LINES=74 | **PASS** |
| Product fix landed | `git log` `b1cc9a88` | **PASS** |

---

## خلاصهٔ حکم خودآزمایی

| Row | RESULT | Notes |
|-----|--------|-------|
| B1 | PASS | Hook E4 + critic CONFIRM |
| B2 | PASS | CONFIRM; medium TOCTOU residual |
| B3 | PASS | critic CONFIRM |
| B4 | PASS | after fix; critic CONFIRM |
| B5 | PASS | after fix; critic CONFIRM |

**Self-check overall:** **PASS** for B1–B5 automated/critic gates. Owner still runs `evidence/W2/ACCEPTANCE.md` on 3100 for cold-browser sign-off.
