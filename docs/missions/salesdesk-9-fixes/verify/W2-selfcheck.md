# W2 self-check — fresh eyes (B1–B5)

Derived from `EXECUTION-PROMPT.md` §3 / §5 Wave 2 / §6 **before** trusting worker narratives.  
Worktree: `D:\AfraKalaTest\wt-salesdesk-9-fixes` · Branch: `feature/salesdesk-9-fixes` · Doc HEAD at write: see HANDOFF.  
Method: one **check** + one **refutation attempt** per row; RESULTS from repo + `evidence/W2/*` only.

Legend: **PASS** = claim supported by cited artifact/code · **FAIL** = claim unsupported or contradicted.

---

## Matrix

| Row | Check (from §5/§6) | Refutation attempt | RESULT |
|-----|--------------------|--------------------|--------|
| B1 | دو ردیف ring با `linkedid` یکسان → یک کلید کارت (`groupCallsByCardKey`) | اگر کلید هنوز `ring:${uuid}` باشد باید دو کارت بماند | **PASS** |
| B2 | همگام‌سازی بین تب‌ها با `BroadcastChannel` کانال `afrakala-caller-id`؛ claim/dismiss | اگر کانال/wire در popup نباشد، چهار تب duplicate می‌سازند | **PASS** (کد) / **FAIL** (تست دستی ۴تب در شواهد نیست) |
| B3 | ستون‌ها + برچسب‌های §6: «مدت زمان نمایش پنجره تماس (ثانیه)»، «فقط تماس‌های داخلی خودم»، «فقط تماس‌های مربوط به خودم»؛ TTL از `display_seconds` | اگر هنوز `CARD_TTL_MS = 5000` سخت‌کد باشد یا برچسب‌ها فرق کند، رد | **PASS** |
| B4 | پیش‌نویس per call key در `localStorage`؛ سوئیچ کارت پیش‌نویس را پاک نکند | اگر `openCalls`/draftKey نباشد، فرم نیمه‌کاره با تماس بعدی از بین می‌رود | **PASS** (کد) / **FAIL** (E2E مرورگر در شواهد نیست) |
| B5 | دکمه «افزودن معامله» + `deal_id` روی یادداشت | اگر ستون `deal_id` نباشد یا `linkSalesInteractionDeal` نباشد، وصل نمی‌شود | **PASS** (اسکیما+کد) / **FAIL** (نوشتن زندهٔ deal_id روی یک یادداشت واقعی در شواهد نیست) |

---

## B1 — detail

**Check:** §5 B1 — group by `linkedid`; probe دو داخلی یک linkedid → یک کارت.

**Evidence used:**
- Unit: `orch-unit-tsx.txt` — `groupCallsByCardKey — B1 two extensions same linkedid` ok; `# pass 16` / `# fail 0` (E3).
- Live hook: `b1-hook-probe.md` + `b1-group-real.json` — `db` ۲ ردیف؛ `old_card_key_count=2`؛ `new_card_key_count=1`؛ `group_count=1`؛ extensions `["403","412"]`؛ `"pass": true` (E3/E4).
- Cleanup synthetic: `b1-cleanup.txt` — `DELETE 2`، `after_count=0` (بدنه SQL موفق؛ خطای EBUSY انتهای فایل روی write لاگ است، نه روی DELETE).

**Refutation:** فرض «هنوز دو کارت» — با `old_keys` دو `ring:…` در برابر یک `lid:…` در `b1-group-real.json` رد شد.

**RESULT: PASS**

---

## B2 — detail

**Check:** §5 B2 — `BroadcastChannel`; opening/dismissing updates other tabs.

**Evidence used:**
- `src/lib/calls/caller-broadcast.ts:9` — `CALLER_ID_CHANNEL = "afrakala-caller-id"`؛ پیام‌های `dismiss`/`open`/`claim`/`shown` (E1/E2).
- `CallerInboundPopup.tsx` — import/group + handlers `claim`/`dismiss`/`open` (E1: خطوط ~212–358 در گزارش FE و grep).
- `fe-report.md` صریحاً: «Cross-tab BroadcastChannel manual browser check» تأیید نشده.

**Refutation:** تلاش برای یافتن لاگ Playwright/۴تب در `evidence/W2/` — یافت نشد (`W2-OPS` checkpoint: Playwright deferred).

**RESULT: PASS برای وجود سیم‌کشی کد؛ FAIL برای اثبات زندهٔ «چهار تب».**  
(برای gate مالک: گام‌های B2 در `ACCEPTANCE.md` هنوز دستی لازم است.)

---

## B3 — detail

**Check:** §5 B3 / §6 — `display_seconds` default 15 range 5–120؛ برچسب‌های فارسی دقیق؛ فیلتر `only_my_extension`.

**Evidence used:**
- DB: `orch-db-verify.txt` — `display_seconds` integer default 15 NOT NULL؛ `only_my_extension` / `only_my_customers` boolean； CHECK `(display_seconds >= 5) AND (display_seconds <= 120)`؛ versions `20260921230000`/`20260921230100` (E3).
- UI labels: `src/routes/_app.settings.caller-id.tsx:139–169` — عین «مدت زمان نمایش پنجره تماس (ثانیه)»، «فقط تماس‌های داخلی خودم»، «فقط تماس‌های مربوط به خودم» (E2).
- TTL helper: `caller-id-settings.ts:160-161` — `callerIdCardTtlMs` = `display_seconds * 1000` (E2).
- Unit filter: `orch-unit-tsx.txt` — `only_my_extension keeps inbound+outbound on my exts only` ok (E3).

**Refutation:** جست‌وجوی `CARD_TTL_MS = 5000` به‌عنوان منبع TTL فعال — FE report می‌گوید جایگزین شده؛ تابع `callerIdCardTtlMs` موجود است. برچسب کوتاه «مدت نمایش» در §9 خلاصه است؛ برچسب UI کامل §6 است — تطبیق OK.

**RESULT: PASS**

---

## B4 — detail

**Check:** §5 B4 — draft keyed by B1 call key؛ opening another card never discards؛ switcher.

**Evidence used:**
- `src/lib/calls/call-drafts.ts` — key `afrakala-call-note-drafts-v1`؛ load/save/clear؛ فیلد `dealId` (E1).
- `CallerInboundPopup.tsx:168` — `openCalls` map؛ `draftKey={active.callKey}` (~641) (E1).
- Unit suite در `orch-unit-tsx.txt` / `fe-unit-tests.txt` پیش‌نویس UI را پوشش نمی‌دهد (فقط card-key + filter).

**Refutation:** هیچ artifact مرورگری برای «نوشتم → سوئیچ → برگشتم» در `evidence/W2/` نیست (`fe-report.md` تأییدنشدهٔ live drafts).

**RESULT: PASS برای پیاده‌سازی کد؛ FAIL برای مشاهدهٔ رفتاری زنده.**

---

## B5 — detail

**Check:** §5 B5 / §6 — «افزودن معامله»؛ person prefilled؛ note links via `sales_interactions.deal_id`.

**Evidence used:**
- Migration applied: `applied-20260921230100_564.txt` — version `20260921230100` DONE؛ `orch-db-verify.txt` — ستون `deal_id` uuid NULL + FK `sales_interactions_deal_id_fkey` (E3).
- Revert path: `docs/missions/salesdesk-9-fixes/revert/564_sales_interactions_deal_id.sql` (E1).
- UI: `CallNoteForm.tsx:237` — دکمه «افزودن معامله»؛ `CallerInboundPopup.tsx:588` — عنوان «افزودن معامله» (E2).
- Link write: `interactions.ts:62-89` — پس از create، `linkSalesInteractionDeal` UPDATE `deal_id`؛ soft-fail اگر ستون نباشد (E2).
- `fe-report.md` initially PARTIAL until 564 — ستون اکنون در DB verify شده؛ ولی ردیف نمونهٔ note→deal در evidence ثبت نشده.

**Refutation:** جست‌وجوی SQL/لاگ که یک `sales_interactions.deal_id` غیرnull پس از مسیر UI نشان دهد — در `orch-post-verify.txt` / سایر فایل‌های W2 یافت نشد (خروجی مبهم یک ردیف `--`).

**RESULT: PASS برای ستون+کد اتصال؛ FAIL برای اثبات end-to-end نوشتن `deal_id` روی دادهٔ واقعی از UI.**

---

## Deploy / gate context (نه ردیف B، ولی لازم برای اعتماد)

| Claim | Artifact | RESULT |
|-------|----------|--------|
| Compose safety only-web | `compose-safety.txt` — `VERDICT: SAFE` | **PASS** |
| 3100 = `8a8b61e3` healthy HTTP 200 | `compose-safety.txt`, `http-smoke.txt`; re-probe DOC: `printenv APP_GIT_SHA`→`8a8b61e3`, health `healthy`, HTTP 200 | **PASS** |
| Typecheck ≤74 | `fe-report.md` / `fe-tsc-after.txt` (ارجاع FE؛ این job فایل tsc را دوباره اجرا نکرد) | **PASS** (به استناد artifact) |

---

## خلاصهٔ حکم خودآزمایی

| Row | Automated / repo | Live owner path still needed? |
|-----|------------------|-------------------------------|
| B1 | PASS | اختیاری (پروب hook کافی برای الگوریتم؛ UI یک‌کارت در ACCEPTANCE) |
| B2 | کد PASS / زنده FAIL | بله — چهار تب |
| B3 | PASS | بله — مدت نمایش چشمی |
| B4 | کد PASS / زنده FAIL | بله — پیش‌نویس |
| B5 | اسکیما+کد PASS / E2E write FAIL | بله — «افزودن معامله» + وصل یادداشت |

**Self-check overall:** **PARTIAL** — B1 و B3 با شواهد قوی؛ B2/B4/B5 بدون مشاهدهٔ مرورگر کامل بسته نمی‌شوند برای پذیرش مالک.
