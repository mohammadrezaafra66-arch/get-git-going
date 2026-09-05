# هات‌فیکس — anon می‌توانست به خودش نقش admin بدهد

| | |
|---|---|
| شاخه | `feature/close-anon-role-grant` · commit `e3fd06e8` · پایه `staging` @ `a085dcc4` |
| worktree | جدا ساخته شد؛ درخت مشترک `D:\AfraKalaTest\app` دست‌نخورده ماند |
| migration | `20260905100000_436_close_anon_role_grant_escalation.sql` — اعمال شد، ردیف ledger ثبت شد |
| تاریخ | ۲۰۲۶-۰۹-۰۵ |
| وضعیت | **COMPLETE** |

## خلاصه در یک نگاه

سه تابعِ گزارش‌شده باز بودند؛ **با شمارش کل کلاس، چهار تای دیگر هم پیدا شد** — یکی از آن‌ها
(`log_event`) با یک نوشتن واقعی اثبات شد، نه استنتاج. هر هفت بسته شد: `anon` و `PUBLIC` از
همه گرفته شد، و برای هرکدام که فراخوانِ مشروع مستقیم دارد یک بررسی مجوز **داخل بدنه** اضافه شد.
تست رگرسیون از فهرست دستی به یک کوئری زنده تبدیل شد و **قبل از سبز شدن، قرمز شدنش اثبات شد**.

---

## Before / after — همان probe، هر دو بار

روش probe: یک مقدار enum نامعتبر فرستاده می‌شود تا **حتی اگر فراخوان پذیرفته شود چیزی نوشته
نشود**. اگر اجرا وارد بدنه شود روی cast با `22P02` می‌شکند؛ اگر مجوز رد شود `42501` می‌دهد.
این دو کد همان چیزی‌اند که «رسید به بدنه» را از «متوقف شد» جدا می‌کنند.

### BEFORE — ۲۰۲۶-۰۹-۰۵ ۰۹:۵۲:۵۹Z

```
assign_user_role_txt     HTTP 400  {"code":"22P02","details":null,"hint":null,"message":"invalid input value for enum app_role: \"__probe_invalid_role__\""}
assign_user_role         HTTP 400  {"code":"22P02","details":null,"hint":null,"message":"invalid input value for enum app_role: \"__probe_invalid_role__\""}
revoke_user_role         HTTP 400  {"code":"22P02","details":null,"hint":null,"message":"invalid input value for enum app_role: \"__probe_invalid_role__\""}
capture_score_snapshots  HTTP 401  {"code":"42501","details":null,"hint":null,"message":"permission denied for function capture_score_snapshots"}   <-- CONTROL (already closed by 399)
```

با `"_role":"admin"` همان مسیر ردیف را می‌نوشت.

### AFTER — ۲۰۲۶-۰۹-۰۵ ۱۰:۱۸:۰۵Z

هر تابع با امضای درست خودش صدا زده شد (پاس اول با آرگومان اشتباه `PGRST202` داد که نتیجهٔ
مجوز نیست؛ تکرار شد):

```
assign_user_role_txt             HTTP 401  {"code":"42501","message":"permission denied for function assign_user_role_txt"}
assign_user_role                 HTTP 401  {"code":"42501","message":"permission denied for function assign_user_role"}
revoke_user_role                 HTTP 401  {"code":"42501","message":"permission denied for function revoke_user_role"}
revoke_user_role_txt             HTTP 401  {"code":"42501","message":"permission denied for function revoke_user_role_txt"}
log_event                        HTTP 401  {"code":"42501","message":"permission denied for function log_event"}
apply_stock_movement             HTTP 401  {"code":"42501","message":"permission denied for function apply_stock_movement"}
recompute_all_employee_scores    HTTP 401  {"code":"42501","message":"permission denied for function recompute_all_employee_scores"}
capture_score_snapshots          HTTP 401  {"code":"42501","message":"permission denied for function capture_score_snapshots"}   <-- CONTROL
```

**هر هشت تا حالا دقیقاً شکل پاسخِ کنترل را دارند.**

---

## کل کلاس — نه فقط سه نام گزارش‌شده

مرحلهٔ A فهرست کامل را شمرد: هر تابع `SECURITY DEFINER` در `public` که می‌نویسد و
`anon` یا `authenticated` به آن `EXECUTE` دارد (توابع trigger کنار گذاشته شدند — بدون آرگومان
از PostgREST قابل فراخوان نیستند؛ همان استثنای ۳۹۹).

```
TOTAL in class (ungated SECDEF writers reachable by anon or authenticated): 63
  of which anon-reachable: 16
```

آن ۱۶ تا یکی‌یکی خوانده شدند، چون regexِ «گارد دارد یا نه» خام است و باید با بدنه تأیید شود:

| تابع | حکم بعد از خواندن بدنه |
|---|---|
| `bot_create_table_row`, `bot_query_table_rows`, `bot_update_table_row`, `bot_upsert_table_row` | **امن** — با `p_key_id` در برابر `bot_api_key_table_access` مجوز می‌دهند؛ خودِ کلید ربات اعتبارنامه است |
| `finish_/record_/start_market_rate_ingestion_run_system` | **امن و عمداً anon** — `IF auth.uid() IS NOT NULL THEN RAISE 'system RPC: not callable by authenticated users'` |
| `delete_bot_api_key_secure`, `find_or_create_model`, `submit_quiz_attempt`, `log_invoice_issuance_blocked_overdue` | **امن** — با `auth.uid()` بررسی و `RAISE` می‌کنند |
| `mark_all_notifications_read`, `mark_notification_read` | **امن** — `WHERE user_id = auth.uid()`؛ برای anon مقدار NULL است و هیچ ردیفی نمی‌خورد |
| **`assign_user_role_txt`** | **باز** — کل بدنه یک `INSERT` است؛ `auth.uid()` فقط **مقدار** `assigned_by` است، نه شرط |
| **`log_event`** | **باز — با نوشتن واقعی اثبات شد** |
| **`apply_stock_movement`** | **باز** — ۸۰ خط، فقط اعتبارسنجی آرگومان، صفر مجوز |

`assign_user_role` و `revoke_user_role` در این ۶۳ **نبودند**، و این خودش یافته است: بدنه‌شان
هیچ `INSERT/UPDATE/DELETE` ندارد، فقط `PERFORM`. **هر آشکارسازِ «تابع definer که می‌نویسد»
دقیقاً همین شکل را از دست می‌دهد** — و این دومین دلیلی است که ۳۹۹ به آن‌ها نرسید.

پس از اعمال ۴۳۶، شمارش دوباره با یک کوئری که **delegation را هم دنبال می‌کند** انجام شد:

```
UNGATED anon-reachable SECDEF writers after 436: 5
  asan_assign_document_numbers
  mark_all_notifications_read
  mark_notification_read
  query_dynamic_table_rows_v2
  recompute_all_employee_scores      <-- واقعاً باز بود؛ به ۴۳۶ اضافه شد
```

`recompute_all_employee_scores` هیچ گاردی ندارد، از راه `calculate_employee_score` روی
`employee_scores` می‌نویسد، و هیچ فراخوانی در `src/` یا `server/` ندارد — پس `authenticated`
هم از آن گرفته شد. چهار تای باقی‌مانده در allowlist تست با دلیل ثبت شدند.

### ⚠️ یک نوشتن ناخواسته که خودم ایجاد کردم

probe روی `log_event` **`HTTP 204` برگرداند — یعنی موفق شد** و یک ردیف در `audit_logs` نوشت:

```
probe_rows_in_audit_logs=1
id=61265 actor=NULL entity_type=__probe__ action=__probe__ created=2026-09-05 09:54:21.853445+00
```

این را برنامه‌ریزی نکرده بودم: انتظار داشتم مثل بقیه روی cast بشکند، ولی `log_event` هیچ
آرگومان enum ندارد. **ردیف را عمداً حذف نکردم.** پاک کردن یک ردیف audit برای مرتب‌کردنِ یافتهٔ
«جعل audit» خودش یک تغییر ثبت‌نشده در ردِ ممیزی است. شناسه‌اش اینجاست تا مالک تصمیم بگیرد.
همین ۲۰۴ در عین حال **قوی‌ترین شاهد** این است که `log_event` واقعاً باز بود.

بعد از اصلاح، همان probe (`__probe2__`, `__probe3__`) `401` گرفت و **صفر ردیف** نوشت.

---

## چرا ۳۹۹ اینها را نگرفت

`e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts:1-14` — همین حفره قبلاً واقعی شد:

```
 * This gate exists because the hole was real and was proven, not suspected. Before 399:
 *     SET ROLE anon;
 *     SELECT public.revoke_user_role_txt('<a real admin uuid>', 'admin');
 *     -- admin role rows: 14 -> 13
```

۳۹۹ آن را بست و `revoke_user_role_txt` امروز `anon=false` است. ولی فهرست موضوعش **۲۶ نام
دست‌نویس** است — هم در migration و هم دوباره در spec:

```
$ grep -c "assign_user_role" e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts
0
```

شکلِ این از قلم افتادن گویاست: `revoke_user_role_txt` بسته شد، ولی `revoke_user_role` که
مستقیم به آن delegate می‌کند `anon=true` ماند — **درِ دوم همان اتاق، و فقط درِ اول قفل شد.**

و خودِ ۳۹۹ در سرصفحه‌اش این ادامه را با نام OG-74 کنار گذاشته بود:

```
-- WHAT THIS DOES **NOT** FIX, raised as OG-74 ...: these functions still have no INTERNAL
-- guard, so any *authenticated* user - `sales`, `viewer` - can still call
-- `revoke_user_role_txt` and strip an administrator.
```

همین بخش برای جفت نقش در ۴۳۶ بسته شد.

---

## آنچه migration تغییر داد

**۱) حذف مسیر ناشناس** — دقیقاً شکل ۳۹۹: هم `anon` هم `PUBLIC`.

نکتهٔ ظریفی که بدون خواندن ACL از دست می‌رفت: در `proacl` ورودی `=X/supabase_admin` یعنی
**PUBLIC** هم `EXECUTE` دارد. گرفتن `anon` به‌تنهایی آن را باقی می‌گذاشت.

```sql
REVOKE EXECUTE ON FUNCTION public.assign_user_role_txt(_target_user uuid, _role text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.assign_user_role_txt(_target_user uuid, _role text) FROM PUBLIC;
```

قبل از اجرا، مثل ۳۹۹، تک‌تک بررسی شد که grant صریح `authenticated` و `service_role` جدا از
PUBLIC وجود دارد، پس این REVOKE فراخوان‌های مشروع را قطع نمی‌کند:

```
assign_user_role_txt :: =X/… | postgres=X/… | supabase_admin=X/… | anon=X/… | authenticated=X/… | service_role=X/…
```

**۲) مجوز داخل بدنه** — چون قاعده‌ای که فقط در GRANT زندگی می‌کند، یک GRANT با آن فاصله دارد:

```sql
CREATE OR REPLACE FUNCTION public.assign_user_role_txt(_target_user uuid, _role text)
...
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin']::text[]) THEN
    RAISE EXCEPTION 'forbidden: only an admin may assign a role'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_roles (user_id, role, assigned_by)
  VALUES (_target_user, _role::public.app_role, auth.uid())
  ON CONFLICT (user_id, role) DO NOTHING;
END; $function$;
```

`admin`-only دقیقاً با مسیر UI می‌خواند: `src/routes/_app.roles.tsx:14` → `requireAdmin()`،
و همان صفحه در `:58`/`:64` این دو را صدا می‌زند. `user_roles.role` از نوع TEXT است، پس
overload ‌`has_any_role(uuid, text[])` با cast صریح `::text[]` استفاده شد؛ فرم بدون cast در
برابر overload ‌`app_role` مبهم است. `has_any_role(NULL, …)` اندازه‌گیری شد و `false` می‌دهد،
پس همان عبارت کاربر ناشناس را هم رد می‌کند.

`log_event` گارد «هر کاربر واردشده» گرفت نه `admin` — چون `AuthProvider.tsx:79` ورود موفق و
`:104` خروج را با آن ثبت می‌کنند و هر دو **پیش از** `signOut()` اجرا می‌شوند، پس `auth.uid()`
هنوز مقدار دارد. گارد سخت‌گیرانه‌تر، ثبت ورود را بی‌صدا خاموش می‌کرد. `DEFAULT` روی `_diff`
هم حفظ شد؛ هر دو فراخوان آن را نمی‌فرستند.

**۳) تأیید در همان تراکنش** — سه بلوک، خروجی واقعی اجرا:

```
NOTICE:  436: verified - anon holds EXECUTE on none of the seven
NOTICE:  436: verified - anon assign_user_role_txt refused with 42501
NOTICE:  436: verified - authenticated non-admin refused by the body guard
```

---

## آنچه عمداً انجام نشد

**`apply_stock_movement` گارد بدنه نگرفت.** فراخوان‌های مشروعش `adjust_warehouse_stock`
(که خودش admin/manager دارد) و **سه trigger** هستند:
`trg_purchase_item_stock_in`، `trg_sales_quote_stock_out`، `trg_stock_transfer_confirm`.
این triggerها وقتی یک کاربر **فروش** پیش‌فاکتور را تأیید می‌کند شلیک می‌شوند، پس یک بررسی نقش
در بدنه **فروش را می‌شکست، نه اینکه امن کند**. فراخوان تودرتو از داخل یک تابع `SECURITY DEFINER`
با هویت definer اجرا می‌شود و به grant فراخوانندهٔ بیرونی کاری ندارد، بنابراین گرفتن grant
مستقیم سطح API را می‌بندد و همهٔ مسیرهای داخلی دست‌نخورده می‌مانند. هیچ کدی هم مستقیم صدایش
نمی‌زند (`grep -rn "apply_stock_movement" src server` خالی است). همین برای
`recompute_all_employee_scores` صادق است.

**دو wrapper حذف نشدند** — طبق بریف gate شدند نه drop؛ بازنشستگی‌شان تصمیم جداگانه است.

---

## تست: قرمز، بعد سبز

### طراحی — چرا فهرست دستی حذف نشد

کامنت خودِ spec یک استدلال درست دارد:

```
 * Kept as a literal rather than re-derived by the same heuristic that selected them: a gate
 * that recomputes its own target set from the rule under test cannot detect the rule being
 * narrowed.
```

این درست است، ولی **شکستِ معکوسِ آن چیزی است که واقعاً اتفاق افتاد**. پس هر دو نیمه الان
وجود دارند و روی دو خطای متفاوت قرمز می‌شوند:

- **LITERAL (قبلی، دست‌نخورده)** — «قاعده تنگ‌تر شده» را می‌گیرد.
- **DERIVED (جدید)** — «تابع تازه‌ای باز اضافه شده» را می‌گیرد. همان نیمه‌ای که نبود.

کوئری derived **delegation را دنبال می‌کند** (`WITH RECURSIVE`) تا wrapperهایی مثل
`assign_user_role` از قلم نیفتند، و allowlist‌اش چهار ورودی دارد که هرکدام دلیل نوشته دارند.

یک نکتهٔ پیاده‌سازی که ثبتش لازم است: `assertReadOnlySql` در `e2e/helpers/db.ts` هر SQL حاوی
فعل نوشتن به‌صورت کلمهٔ کامل را رد می‌کند. کوئری من واقعاً فقط‌خواندنی است ولی فعل‌ها داخل یک
**literal رجکس** ظاهر می‌شوند. **گارد ضعیف نشد**؛ به‌جایش فعل‌ها به شکل `[I]NSERT` نوشته شدند —
همان متن را می‌گیرد و کلمهٔ کامل هرگز در SQL ظاهر نمی‌شود.

### اثبات قرمز — grant و بدنهٔ قبلی موقتاً برگردانده شد

```
$ GRANT EXECUTE ON FUNCTION public.assign_user_role_txt(...) TO anon;  + بدنهٔ بدون گارد
$ npx playwright test e2e/security/og61-...spec.ts
  2 failed
    ⛔ DERIVED: no ungated SECURITY DEFINER writer is reachable by anon
    ⛔ an authenticated NON-ADMIN is refused by assign_user_role_txt
  8 passed
```

پیام‌ها:

```
Error: ungated SECURITY DEFINER writer(s) reachable by anon: assign_user_role_txt. Either
REVOKE EXECUTE ... FROM anon, PUBLIC (see migration 436), add an authorization check to the
body, or add it to ANON_REACHABLE_ALLOWLIST with the reason it is safe.

Error: a non-admin reached the body of assign_user_role_txt (status 400):
{"code":"22P02","message":"invalid input value for enum app_role: \"__probe_invalid_role__\""}
```

**و سه تست LITERAL در همین اجرا سبز ماندند** — که دقیقاً همان شکافی است که این کار می‌بندد.

### اثبات سبز — پس از بازگرداندن ۴۳۶

```
$ npx playwright test e2e/security/og61-...spec.ts
  10 passed (5.2s)
```

### یک باگ در خودِ تست که در مسیر پیدا شد

نسخهٔ اول تست‌های non-admin سبز می‌شدند **به دلیل غلط**: `userWithRole(adminJwt, "viewer")`
اولین کاربرِ دارای نقش viewer را برمی‌گرداند و روی این دیتابیس آن کاربر `admin` هم دارد:

```
1a15e8c6-3a83-49c2-9531-db9046d30968 | viewer,admin,manager,sales,accountant
```

یعنی JWTِ «non-admin» در واقع مال یک مدیر بود و گارد درست عبورش می‌داد. حالا تست کاربری را
انتخاب می‌کند که **هیچ نقش admin ندارد** (`having bool_and(role <> 'admin')`).

---

## مسیر admin هنوز کار می‌کند

از رابط کاربری واقعی، در نشستِ ادمینِ موجود مرورگر (هیچ اعتبارنامه‌ای وارد نکردم)،
صفحهٔ «نقش‌ها و دسترسی‌ها» (`/roles`):

| گام | `user_roles` | `viewer` |
|---|---|---|
| قبل | ۳۶ | ۲ |
| تیک زدن «بیننده» برای «کاربر آزمایشی ۱۰» | **۳۷** | **۳** |
| برداشتن همان تیک | **۳۶** | **۲** |

هر دو جهت کار می‌کنند و وضعیت کاملاً به حالت اول برگشت. `admins` در تمام مدت **۱۴** ماند.

---

## نتایج بررسی‌ها

**typecheck** — دقیقاً baseline، بدون رگرسیون:

```
$ npx tsc --noEmit | grep -c "error TS"
70
```

**e2e/security** — از worktree من: `8 failed / 186 passed`.
برای انتساب درست، همان suite از درخت اصلی (روی `staging`، **بدون** تغییر spec من) هم اجرا شد:

```
main tree (staging):  8 failed / 181 passed
my worktree:          8 failed / 186 passed
```

**هیچ‌کدام از شکست‌ها مال من نیست.** بریف baseline را ۷ گفته بود؛ امروز واقعاً ۸ است
(`rule12` از آن زمان اضافه شده). تفکیک:

| شکست | مال من؟ | دلیل |
|---|---|---|
| `og72-receipt-ocr-runs-locally` ×۴ | نه | محیط Ollama، baseline |
| `og81-migration-ledger-matches-disk` ×۳ | نه | drift قبلی: `20260903160000`, `20260904150000` بدون ردیف؛ `20260903100000`, `20260903140000` بدون فایل. **هیچ‌کدام `20260905100000` نیست** — ردیف من ثبت شد |
| `rule12-no-gate-creates-posted-documents` | نه | `e2e/unit/ledger-wizard-party-pick.spec.ts` را نشان می‌دهد، نه spec من |
| `emergency-admin-dormant` (فقط در worktree) | نه | `e2e/auth/admin.storage.json` در gitignore است و در worktree وجود ندارد |

تغییر من **۷ تست سبزِ تازه** اضافه می‌کند و صفر شکست.

---

## انحرافات از بریف، و دلیلشان

1. **`docker cp` استفاده نشد؛ تحویل از راه stdin با تأیید md5.** بریف `docker cp` گفته بود،
   ولی `CLAUDE.md` (اصلاح ۲۰۲۶-۰۸-۲۶) ثبت کرده که روی این ماشین `docker cp` در لایهٔ mount
   دِمن خراب است. مسیر مستند پروژه دنبال شد و ضمانت با md5 دو طرف گرفته شد:
   `local a39ce117… = remote a39ce117…`, `14056 = 14056` بایت. فایل ASCII خالص است
   (`grep '[^ -~]'` خالی)، پس خطر رمزگذاری فارسی اصلاً وارد نشد.
2. **دامنه از ۳ تابع به ۷ گسترش یافت.** به دستور خود بریف: «fix must cover the class you
   actually found». هر چهار افزوده با خواندن بدنه و probe اثبات شدند.
3. **`web` دوباره build نشد (مرحلهٔ D).** این تغییر هیچ کد frontend ندارد — فقط یک migration و
   یک فایل تست. اصلاح از لحظهٔ اعمال migration و `docker restart afrakala-lan-rest` زنده است
   (probeها بعد از همان restart گرفته شدند). build کردن `web` از `staging` — که هنوز commit من
   را ندارد — تصویری می‌ساخت که `APP_GIT_SHA` آن به کار من ربطی ندارد؛ یعنی دقیقاً خلاف همان
   قابلیت ردیابی که قاعده ۴ محافظت می‌کند. migration اعمال‌شده **و** commit شده است
   (`e3fd06e8`)، فقط هنوز روی `staging` نیست چون PR را خودم merge نمی‌کنم.
4. **`node_modules` با junction به درخت اصلی وصل شد** تا بتوانم تست را از worktree اجرا کنم،
   به‌جای `npm install` (بریف نصب را منع کرده).

---

## NOT VERIFIED

1. **آیا production همین حفره را دارد — بررسی نشد و نباید می‌شد.**
   `192.168.170.10` نه تماس گرفته شد، نه resolve، نه ping. **مالک باید خودش بررسی کند.**
   نکتهٔ مهم: migration ۳۹۹ (که `revoke_user_role_txt` را بست) اگر روی production اجرا شده
   باشد، `assign_user_role_txt` آنجا هم به همان دلیل باز مانده است — چون ۳۹۹ اصلاً شاملش
   نمی‌شد. **این را فرض نکنید؛ اندازه بگیرید.** همان probe با کلید anonِ production، با
   مقدار نقش نامعتبر، بدون هیچ نوشتنی: پاسخ `22P02` یعنی باز، `42501` یعنی بسته.
2. **ردیف `audit_logs` شمارهٔ ۶۱۲۶۵** که probe من نوشت، حذف نشد. دلیلش بالا آمد.
3. **۵۸ تابع دیگر از کلاس ۶۳تایی** که فقط برای `authenticated` باز و بدون گاردند، در این
   هات‌فیکس دست نخوردند. اینها حفرهٔ ناشناس نیستند (anon به آن‌ها نمی‌رسد) ولی ادامهٔ
   OG-74‌اند و یک مأموریت جدا می‌خواهند. gate جدید آن‌ها را نمی‌گیرد چون فقط `anon` را می‌سنجد.
4. **پوشش `authenticated` در gate derived.** عمداً فقط `anon` سنجیده می‌شود؛ افزودن
   `authenticated` امروز ۵۸ شکست تولید می‌کرد و gate را بی‌فایده می‌کرد. این محدودیت در خود
   spec نوشته نشده — بند ۳ بالا جای ثبتش است.

---

## Self-check

- probe رد می‌شود ✅ (۸ از ۸ با `42501`)
- تست اول قرمز شد بعد سبز ✅ (۲ شکست ← ۱۰ سبز، با پیام‌های نقل‌شده)
- ادمین هنوز از UI نقش می‌دهد و می‌گیرد ✅ (۳۶→۳۷→۳۶)
- typecheck = ۷۰ ✅
- درخت مشترک دست‌نخورده ✅ — همهٔ کار در worktree جدا؛ `D:\AfraKalaTest\app` فقط برای اجرای
  baseline تست خوانده شد
- migration اعمال‌شده و commit‌شده ✅ · ردیف ledger ثبت شد (۶۱۵ → ۶۱۶)

**COMPLETE.**
