# گزارش E2E ارتباطات همکاری — RUNID `20260921-2352`

## Go / No-Go for tomorrow

**NO-GO** (با workaround محدود برای کاربران لاگین‌شدهٔ غیر-viewer)

### Blocking items
1. **A6 FAIL P0** — بدون session، URLهای `/collaboration` (و احتمالاً سایر مسیرها) به `/login` ریدایرکت نمی‌شوند؛ صفحه روی همان مسیر می‌ماند. شواهد: دو اجرای متوالی، screenshot در `test-results/collab-e2e-artifacts/hub-A-—-Collaboration-hub--74cb8-ed-routes-redirect-to-login-chromium-collab/`.
2. **A3 FAIL P1 (viewer)** — کارت «پیام‌ها» در hub برای viewer نمایش داده می‌شود ولی کلیک به `/unauthorized` می‌رود (کارت نشان داده می‌شود ولی قابل استفاده نیست).
3. **D6 FAIL P1 (built but not wired for production)** — منطق SLA با فراخوانی دستی `tick_inquiries` درست کار می‌کند (۵→۸→۱۰→transfer_available)، اما `cron.job` وجود ندارد؛ بدون caller دوره‌ای در محیط واقعی، SLA جلو نمی‌رود. workaround: تا زمان wiring کرون/worker، استعلام‌ها را دستی پیگیری کنید.
4. **C11 FAIL P1** — دکمه «ثبت کار از این پیام» به `work_items` می‌نویسد نه `tasks`؛ جدول `tasks` برای این مسیر wired نیست.
5. **C6 PARTIAL / FAIL P2** — رد oversize با RPC تأیید شد؛ آپلود واقعی attachment روی storage در این محیط اغلب fail شد (جزئیات در annotation تست). تا تأیید آپلود روی HTTPS/storage، فقط متن را ارسال کنید.

غیرمسدودکننده ولی مهم: **MSG-N07 روی build فعلی mitigated** (`inquiry_price_cache` دیگر برای viewer با `SELECT true` باز نیست؛ policy محدود شده). Voice روی HTTP = **BLOCKED-ENV**.

---

## Environment

| Item | Value |
|------|-------|
| Branch | `test/collab-e2e-20260921-2352` |
| HEAD SHA | `c1ea61a1` |
| Deployed `APP_GIT_SHA` (:3100) | `f9c57d0e` |
| Match | **NO** — تست روی build مستقر |
| App | `http://192.168.170.8:3100` |
| PostgREST | `http://192.168.170.8:9000` |
| Prod IP touched | never |
| Accounts OK | admin, manager, sales, sales2, accountant, viewer (JWT mint) |
| `purchase_specialist` | **BLOCKED-DATA** (۰ ردیف) — purchaser با `test.manager` تست شد |
| Prefix | `E2E-COLLAB-20260921-2352` |
| HTML report | `test-results/collab-e2e-html/` |
| Run logs | `test-results/collab-e2e/run2.txt`, `run3.txt`, `run-sla.txt` |

### Phase 4 runs (non-slow)
| Run | Command | Result | Exit |
|-----|---------|--------|------|
| run2 | `npx playwright test --config=e2e/collaboration/playwright.config.ts --grep-invert "@slow"` | **49 passed, 1 failed (A6)** | 1 |
| run3 | same | **49 passed, 1 failed (A6)** | 1 |
| SLA | `… inquiry-sla.slow.spec.ts` | progressed then assertion crash on score column (fixed in suite; evidence recovered from DB) | 1 |

A6 در هر دو اجرا fail پایدار است (نه flaky).

### Phase 3 prove-can-fail
برای E1–E5 و D3/D4/C2: twin مثبت (عضو/authorized) قبل از denial اجرا شد؛ denial با count قبل/بعد اثبات شد. نمونه: عضو ≥۱ پیام می‌بیند، outsider ۰؛ `send` غیرعضو خطا + ۰ ردیف جدید.

---

## Coverage table (§5)

| ID | Verdict | Severity | Expected vs actual | Evidence |
|----|---------|----------|--------------------|----------|
| A1 | PASS | — | سلام + تاریخ | hub.spec A1–A3 roles |
| A2 | PASS | — | ماتریس کارت‌ها مطابق کد | hub.spec per role |
| A3 | PASS* / FAIL viewer | P1 | مسیر درست؛ viewer→`/unauthorized` | annotation `A3-PRODUCT-FAIL` |
| A4 | PASS | — | badge وقتی unread>0 | hub A4 + SELECT |
| A5 | PASS (recorded) | — | badges vs DB counts recorded | hub A5 annotation |
| A6 | FAIL | P0 | redirect `/login`؛ ماندن روی `/collaboration` | hub A6 run2/run3 |
| purchase_specialist hub | BLOCKED-DATA | — | حساب نیست | hub A1 purchase_specialist |
| B1 | PASS | — | ۳ type + creator admin | groups B1 |
| B2 | PASS | — | member roles incl purchaser | groups B2 |
| B3 | PASS | — | NOT_GROUP_ADMIN + no row | groups B3 |
| B4 | PASS | — | بعد حذف، ۰ پیام/گروه | groups B4 |
| B5 | PASS | — | فقط system admin deactivate؛ creator نه | groups B5 (مستندات help درست، QA غلط) |
| B6 | PASS | — | `/messages` رندر می‌شود | groups B6 |
| C1 | PASS | — | send + read | messaging C1 |
| C2 | PASS | — | empty/4000/4001؛ خطا `INVALID_CONTENT` (نه متن فارسی کامل) | messaging C2 |
| C3 | PASS / gap | P3 | اگر گروه در UI لیست نباشد soft؛ Enter path | messaging C3 |
| C4 | PASS | — | 3/3 بدون reload (run2/3) | messaging C4 |
| C5 | PASS | — | reply_to؛ PATCH بیگانه ۰ تغییر | messaging C5 |
| C6 | FAIL/PARTIAL | P2 | oversize رد شد؛ upload اغلب fail | messaging C6 annotations |
| C7 | BLOCKED-ENV | — | `isSecureContext=false`, no getUserMedia | messaging C7 |
| C8 | PASS | — | receipt row | messaging C8 |
| C9 | PASS (structural) | — | dim=1536؛ embedding RPC | messaging C9 |
| C10 | PASS | — | SSE/API پاسخ غیرخالی | messaging C10 |
| C11 | FAIL | P1 | انتظار `tasks`؛ واقعیت `work_items` | messaging C11 + کد CreateWorkFromMessageButton |
| D1 | PASS | — | create + visible | inquiry D1 |
| D2 | PASS | — | reply → `completed_on_time` | inquiry D2 |
| D3 | PASS | — | غیرمسئول رد؛ count ثابت | inquiry D3 |
| D4 | PASS | — | غیرعضو رد | inquiry D4 |
| D5 | PASS | — | پیام «قیمت معتبر دارد…» جلوگیری از استعلام دوم | inquiry D5 + RPC text |
| D6 | FAIL (wiring) | P1 | بدون cron؛ با tick دستی OK (۵/۸/۱۰/transfer) | SLA timeline + `cron.job` absent |
| D7 | PASS | — | ۱ penalty برای inquiry SLA | `performance_penalties` count=1 |
| D8 | PASS (conditional) | — | بدون SLA ممکن است transfer رد شود؛ با status force ثبت شد | inquiry D8 |
| D9 | PASS | — | صفحه inquiries رندر/فیلتر | inquiry D9 |
| E1–E6 | PASS | — | RLS denial + twin | rls-api |
| E7 MSG-N07 | PASS (mitigated) | — | viewer ۰ ردیف؛ policy محدود | pg_policies + E7 |
| E8 | PASS (recorded) | — | viewer send/inquiry رد؛ create_group ممکن است مجاز باشد | E8 annotation |
| E9 | PASS | — | anon ۰/خطا | E9 |
| F1 | PASS | — | ۲ ستون؛ scroll≈viewport | mobile F1 |
| F2 | PASS | — | صفحه messages موبایل | mobile F2 |
| F3 | PASS / BLOCKED-DATA ps | — | nav per role؛ purchase_specialist ندارد | mobile F3 |

---

## Permission matrix (خلاصه)

| Role | Hub cards | Create group | Send (member) | Send (non-member) | Create inquiry | Reply inquiry | Read outsider msgs |
|------|-----------|--------------|---------------|-------------------|----------------|---------------|--------------------|
| admin | all 6 | OK | OK | deny | OK | if purchaser | deny |
| manager | all 6 | OK | OK | deny | OK | as purchaser OK | deny |
| sales | 5 (no docs) | OK | OK | deny | OK | deny unless purchaser | deny |
| accountant | 4 | — | — | deny | deny outsider | — | deny |
| viewer | 2 cards | recorded | deny outsider | deny | deny outsider | deny | deny |
| anon | — | — | — | — | — | — | 0 rows |

---

## Built but not wired
- `tick_inquiries` — تابع هست؛ `cron.job` نیست → SLA خودکار نیست.
- `tasks` برای «ثبت کار از این پیام» — UI به `work_items` می‌رود.
- Semantic search وابسته به embedding 1536؛ مدل bge-m3=1024 در مستندات قبلی — ریسک ساختاری.
- Voice recording — API فقط در secure context.

---

## User instructions for tomorrow (فارسی ساده)

1. با نقش **viewer** وارد «پیام‌ها» از کارت hub نشوید؛ به `/unauthorized` می‌خورید — از منوی دیگر یا نقش بالاتر استفاده کنید.
2. **پیام صوتی** روی آدرس HTTP فعلی کار نمی‌کند؛ فقط متن بفرستید.
3. اگر استعلام روی محصولی که تازه قیمت خورده گیر کرد، پیام «این محصول قیمت معتبر دارد…» طبیعی است (کش قیمت).
4. SLA استعلام بدون اسکریپت/کرون جلو نمی‌رود؛ منتظر تغییر خودکار رنگ/وضعیت نباشید مگر اینکه ops `tick_inquiries` را زمان‌بندی کند.
5. برای پیوست فایل اگر آپلود خطا داد، متن را بفرستید و به پشتیبانی گزارش دهید.
6. غیرفعال کردن گروه فقط با **مدیر سیستم** ممکن است (نه سازنده گروه).

---

## Not verified
- UI کامل فیلترهای D9 (باز/همه/مال من) به‌صورت تک‌تک کلیک — صفحه لود شد.
- Realtime latency دقیق هر trial در HTML annotations (اجرا سبز بود).
- آپلود همه انواع فایل زیر ۵۰MB روی UI واقعی.
- `purchase_specialist` app-role end-to-end.

## Unresolved
- A6 cold-session redirect (P0) — باید قبل از استفاده عمومی fix شود.
- Viewer hub card → unauthorized (P1).
- Auto-tick SLA wiring (P1).
- C11 tasks vs work_items mismatch (P1).
- C6 reliable attachment upload (P2).

⇒ چون Unresolved خالی نیست: **STATUS: PARTIAL** (suite اجرا شده با شواهد؛ go=NO-GO).

---

## How to re-run
```
cd D:\AfraKalaTest\app
$env:PLAYWRIGHT_BROWSERS_PATH = "$env:LOCALAPPDATA\ms-playwright"
npx playwright test --config=e2e/collaboration/playwright.config.ts --grep-invert "@slow"
npx playwright test --config=e2e/collaboration/playwright.config.ts e2e/collaboration/inquiry-sla.slow.spec.ts
```

Cleanup SQL (اجرا نشده): `docs/qa/collab-e2e-cleanup-20260921-2352.sql`
