# Question C — ۶۳ تابعی که هر کاربر واردشده می‌تواند صدا بزند

| | |
|---|---|
| مأمور | Agent C — پژوهش read-only |
| مخزن | `D:\AfraKalaTest\app` · شاخه `staging` · SHA خوانده‌شده **`f1512219d15d43c82df76cb06edfed9171e5ac68`** |
| دیتابیس | `afrakala` روی `afrakala-lan-db` — فقط خواندن، `PGOPTIONS="-c default_transaction_read_only=on"` روی هر دستور |
| تاریخ | ۲۰۲۶-۰۹-۰۵ |
| **هیچ تابع کاربردی صدا زده نشد** | فقط خواندن کاتالوگ: `pg_proc.prosrc`، `pg_get_functiondef`، `pg_proc.proacl`، `pg_default_acl`، `information_schema` |
| وضعیت | **COMPLETE** |

> **PROBE RULE رعایت شد.** صفر فراخوان تابع. صفر `BEGIN`/`ROLLBACK` رفتاری (لازم نشد).
> صفر تماس با `192.168.170.10`. هیچ فایلی جز همین فایل نوشته نشد.

---

## Verdict

**عدد «۵۸» بازتولید نمی‌شود.** با همان آشکارسازی که هات‌فیکس ۴۳۶ عدد ۶۳ را با آن ساخت
(بازتولید دقیق شد — بند Numbers)، امروز **۶۳ تابع** `SECURITY DEFINER` در `public` وجود دارد
که می‌نویسند (مستقیم یا با delegation)، هیچ `has_role`/`has_any_role`/`_require_privileged`
در بدنه ندارند، و **`authenticated` روی آن‌ها `EXECUTE` دارد** — یعنی یک نشست `viewer` یا
`sales` می‌تواند مستقیماً از PostgREST صدایشان بزند. از این ۶۳، **۱۵ تا برای `anon` هم بازند**
(همان‌هایی که ۴۳۶ یکی‌یکی خواند و امن اعلامشان کرد) و **۴۸ تا فقط برای `authenticated`**.
ولی «بدون `has_role`» با «بدون هیچ مجوزی» یکی نیست: با خواندن هر ۶۳ بدنه، **۲۷ تا گاردِ
غیرنقشی دارند** — عضویت در گروه، `WHERE user_id = auth.uid()`، کلید ربات، یا «مالک ردیف» —
و **۳۶ تا هیچ‌چیز ندارند جز اعتبارسنجی آرگومان**.

**بزرگ‌ترین شکاف، پول است.** `hold_credit(p_customer_id, p_amount, p_invoice_id, p_user_id)`
و `release_credit(...)` — هر دو با همین امضا — روی `customer_credit_ledger` و
`customer_credit_balance` می‌نویسند، **هر چهار آرگومان از فراخواننده می‌آید از جمله
`p_user_id`** که در `audit_logs` به‌عنوان عاملِ کار ثبت می‌شود، و **هیچ‌کدام در `src/` یا
`server/` هیچ فراخوانی ندارند** — یعنی یک کاربر `viewer` می‌تواند سقف اعتبار هر مشتری را
جابه‌جا کند و ردِ ممیزی را به نام شخص دیگری بزند، بدون آنکه هیچ صفحه‌ای در برنامه چنین
کاری بکند. `increase_credit` هم دقیقاً همان شکل wrapperِ تک‌`PERFORM` است که هات‌فیکس
هشدارش را داد و هر آشکارساز ساده‌ای از دستش می‌دهد.

آنچه **نیست**: این یک حفرهٔ ناشناس نیست — `anon` به هیچ‌کدام از ۳۶ تای بی‌گارد نمی‌رسد جز
`asan_assign_document_numbers` و `query_dynamic_table_rows_v2` که هر دو در allowlist ثبت‌شدهٔ
og61 دلیل دارند. و این یک اثبات بهره‌برداری نیست: **هیچ تابعی صدا زده نشد**؛ هر حکم از روی
بدنه و `proacl` است.

---

## یافته‌ها

### [C1] کلاس دوباره مشتق شد — ۶۳، نه ۵۸ · **exists-works** · `[E]`

**تناقض با prior art، هر دو طرف نقل‌شده.**

سمت prior art — `docs/research/anon-role-grant-hotfix-20260905.md`، بند «NOT VERIFIED» ۳:

> «**۵۸ تابع دیگر از کلاس ۶۳تایی** که فقط برای `authenticated` باز و بدون گاردند، در این
> هات‌فیکس دست نخوردند.»

سمت اندازه‌گیری امروز — همان آشکارساز، اجراشده روی همان دیتابیس (کوئری کامل در Numbers):

```
V0 secdef writers, any reachability (anon OR authenticated), NO guard filter   | 155
V2 role-token filter ONLY (no RAISE, no auth.uid), anon OR authenticated       |  63   <-- 63 بازتولید شد
V2 restricted to has_function_privilege('authenticated', ...)                  |  63
V2-AUTH-ONLY: authenticated-reachable AND NOT anon-reachable                   |  48
```

**۵۸ از هیچ محاسبه‌ای بیرون نمی‌آید.** نزدیک‌ترین حسابِ ممکن `۶۳ − ۵ = ۵۸` است، که در آن ۵
همان «anon-reachable بعد از ۴۳۶» است — ولی این دو مجموعه یکی نیستند: کسر کردن
anon-reachable از کل کلاس، توابعی را که ۴۳۶ **گاردِ بدنه** داد (و بنابراین از کلاس بیرون
رفتند) هنوز داخل کلاس می‌شمارد. عدد درست برای «فقط `authenticated`» **۴۸** است و برای
«هر کاربر واردشده می‌رسد» (که شامل ۱۵ تای anon هم هست، چون `anon ⊂` دسترسیِ
`authenticated` در همهٔ ۱۵ مورد) **۶۳**.

**پیامد برای ساخت:** migrationِ بعدی باید روی ۳۶ رأس واقعی هدف‌گیری کند (بند C3)، نه روی ۵۸.

**رفتار `proacl IS NULL`** — به‌صراحت رسیدگی شد:

```
proacl IS NULL among all public secdef functions   | 0
proacl IS NULL among the derived writer class      | 0
```

هیچ تابعی در این کلاس `proacl` تهی ندارد، پس «grantهای پیش‌فرض» عملاً وارد نمی‌شود.
ولی مکانیزم واقعی است و در همین مخزن اندازه‌گیری شده —
`docs/research/og31-function-execute-audit.md`:

```
         probe          | anon_exec | auth_exec | acl
-------------------------+-----------+-----------+-----
 P5-MITIGATED extensions | t         | t         |          <- NULL acl = acldefault() = PUBLIC executes
```

پس در همه‌جای این کار `has_function_privilege(role, oid, 'EXECUTE')` استفاده شد نه بازرسی
دستیِ `proacl` — چون آن تابع هم ورودی صریح، هم `PUBLIC`، و هم `acldefault()` را با هم حساب
می‌کند. `proacl` فقط برای **گزارش** خوانده شد.

---

### [C2] ۲۷ تا از ۶۳ گاردِ غیرنقشی دارند — regex نقش کافی نیست · **exists-partial** · `[E]`

فیلترِ توکنِ `has_role|has_any_role|...` که ۶۳ را می‌سازد، فقط **گاردِ نقشی** را می‌بیند.
با خواندن هر ۶۳ بدنه، ۲۷ تا شکل دیگری از مجوز دارند:

| شکل گارد | توابع | نمونهٔ نقل‌شده از بدنهٔ زنده |
|---|---|---|
| عضویت در گروه پیام‌رسان | `create_inquiry`, `transfer_inquiry`, `update_inquiry_status`, `send_messenger_message`, `send_messenger_message_with_attachment`, `add_messenger_group_member`, `set_messenger_group_member_role` | `create_inquiry` L6: `IF NOT public.is_messenger_group_member(p_group_id, auth.uid()) THEN` / L7: `RAISE EXCEPTION 'شما عضو این گروه نیستید.'` |
| مالکِ ردیف (`= auth.uid()`) | `submit_appeal`, `vote_on_appeal`, `reply_inquiry`, `mark_notification_read`, `mark_all_notifications_read`, `cancel_promotion_nomination`, `delete_bot_api_key_secure` | `reply_inquiry` L15: `IF v_inquiry.assigned_to != auth.uid() THEN` … L23: `RAISE EXCEPTION 'فقط مسئول خرید مجاز به ثبت قیمت است.'` |
| کلید ربات به‌عنوان اعتبارنامه | `bot_create_table_row`, `bot_update_table_row`, `bot_upsert_table_row`, `bot_query_table_rows`, `bot_authenticate_key` | `bot_create_table_row` L17-21: `FROM public.bot_api_key_table_access a WHERE a.api_key_id = p_key_id AND a.table_id = p_table_id` … `IF _can_update IS NULL THEN RAISE EXCEPTION 'forbidden_table'; END IF;` |
| «هر کاربر واردشده» (گاردِ ضعیف ولی عمدی) | `log_event`, `log_invoice_issuance_blocked_overdue`, `submit_quiz_attempt`, `find_or_create_model`, `create_messenger_group` | `log_event` L3-4: `if auth.uid() is null then raise exception 'forbidden: audit events may only be written by an authenticated caller'` — این همان گاردی است که ۴۳۶ اضافه کرد `[P]` |
| **معکوس** — فقط برای `anon`، `authenticated` را رد می‌کند | `start_/finish_/record_..._market_rate_..._system` | `IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'system RPC: not callable by authenticated users';` |

**پیامد:** این ۲۷ تا ردیف جدول را دارند ولی پیشنهاد gateشان «بدون تغییر» یا «فقط REVOKE» است،
نه گاردِ نقشی. اضافه کردن `has_any_role` به این‌ها **قابلیت را می‌شکند، امن نمی‌کند** — همان
استدلالی که ۴۳۶ برای `apply_stock_movement` نوشت `[P]`.

---

### [C3] ۳۶ تابع هیچ مجوزی ندارند · **exists-broken** · `[E]`

بدنهٔ هر ۳۶ خوانده شد. تنها چیزی که پیش از نوشتن اجرا می‌شود، اعتبارسنجی آرگومان است.
سه نمونهٔ نقل‌شده از بدنهٔ زنده (کل بدنه، نه گزیده):

**`increase_credit(p_customer_id uuid, p_amount numeric, p_receipt_id uuid, p_user_id uuid)`** —
دقیقاً همان wrapperِ تک-`PERFORM` که هات‌فیکس گفت هر آشکارسازی از دستش می‌دهد `[P]`.
آشکارسازِ delegation-following این را گرفت:

```
BEGIN
  -- OG-17 option (ب): a receipt RELEASES ceiling. It does not mint money. ...
  PERFORM public.release_credit(p_customer_id, p_amount, p_receipt_id, p_user_id);
END
```

**`_ensure_credit_balance(p_customer_id uuid)`** — تنها `RAISE` آن «مشتری یافت نشد» است،
یعنی اعتبارسنجی نه مجوز:

```
  SELECT person_id INTO _person_id FROM public.customers WHERE id = p_customer_id;
  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا به شخصی متصل نیست.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.customer_credit_balance (customer_id, available_credit, held_credit)
  VALUES ( p_customer_id, COALESCE((SELECT credit_limit FROM public.customer_credit_profile ...), 0), 0 )
  ON CONFLICT (customer_id) DO NOTHING;
```

**`calculate_credit_score(_customer_id uuid)`** — `auth.uid()` **فقط مقدار است، نه شرط**؛
همان تلهٔ `assign_user_role_txt` `[P]`. تنها دو ظهورش در ۱۳۳۵۶ بایت بدنه:

```
  L303: VALUES (_customer_id, ROUND(v_score)::int, ROUND(v_final_limit,2), v_params, auth.uid());
  L306: VALUES (auth.uid(), 'credit_score_calculated', 'customer_credit_profile', _customer_id::text,
```

**پیامد برای ساخت:** این ۳۶ ورودیِ مستقیم migrationِ اصلاح‌اند. جدول رتبه‌بندی‌شده برای هرکدام
یک spec یک‌خطی دارد.

---

### [C4] فراخوان‌ها با هر چهار اصطلاح جست‌وجو شد — ۲۲ تا از ۳۶ هیچ فراخوانی ندارند · **exists-partial** · `[E]`

اصطلاح‌ها از `docs/research/frontend-backend-gaps-20260905.md:486` و جدول Numbers همان فایل
گرفته شد `[P]`: `.rpc("x")` · `rpc("x")` (wrapper با `bind`) · `)( "x")` (cast) · نام پویا از
اتحادیه/ternary. برای پوشش هر چهار، الگوی زیر روی `src` و `server` اجرا شد — که فرم چهارم را
هم می‌گیرد چون نام در همهٔ چهار حالت به‌صورت literal رشته‌ای در فایل ظاهر می‌شود:

```
$ grep -rnoE "(\.rpc\(\s*\"FN\"|[^.a-zA-Z0-9_]rpc\(\s*\"FN\"|\)\(\s*\"FN\"|\"FN\")" src server --include=*.ts --include=*.tsx
```

نتیجه برای ۳۶ تای بی‌گارد: **۱۴ تا فراخوان دارند، ۲۲ تا `NO-CALLER`.**
کل ۶۳ در جدول رتبه‌بندی‌شده آمده. نمونهٔ اثبات‌شده که فرم چهارم واقعاً کار می‌کند:

```
query_dynamic_table_rows_v2 :: src/routes/_app.data-tables.$tableId.tsx:214:"query_dynamic_table_rows_v2"
```

که در متن یک ternary است (`:213-214`)، نه `.rpc("...")` — دقیقاً موردی که `[gaps:F16]` نجاتش داد `[P]`.

**فراخوان داخلِ دیتابیس هم شمرده شد** (تابع دیگر یا trigger)، چون «بدون فراخوان در `src/`»
با «بی‌مصرف» یکی نیست:

```
apply_required_services_for_quote_item <= FN[trg_quote_item_required_services,update_sales_quote_status] TRG[trg_sales_quote_items_required_services@sales_quote_items]
asan_burn_document_number  <= TRG[trg_asan_burn_journal_entry_number@journal_entries, trg_asan_burn_purchase_number@purchases, trg_asan_burn_sales_quote_number@sales_quotes]
hold_credit                <= FN[hold_credit_for_quote] TRG[-]
hold_credit_for_quote      <= FN[update_sales_quote_status] TRG[-]
increase_credit            <= FN[create_receipt,post_receipt_accounting] TRG[-]
release_credit             <= FN[expire_stale_credit_holds,increase_credit] TRG[-]
next_sales_quote_number    <= FN[sales_quotes_assign_number] TRG[trg_sales_quotes_assign_number@sales_quotes]
capture_score_snapshots    <= FN[-] TRG[-]
```

این تفکیک همان چیزی است که تصمیمِ «REVOKE بزن» را از «گاردِ بدنه بگذار» جدا می‌کند: فراخوان
تودرتو از داخل یک `SECURITY DEFINER` با هویت definer اجرا می‌شود و به grant فراخوانندهٔ
بیرونی کار ندارد، پس گرفتنِ `authenticated` مسیرهای داخلی را نمی‌شکند `[P]` (استدلال ۴۳۶ برای
`apply_stock_movement`).

**یک شکافِ جانبی که سرِ راه دیده شد و اصلاح نشد** `[E]`: `refresh_sale_list_prices` از
`src/lib/public/get-public-sale-list.ts:50` با کلاینت مرورگر (`@/integrations/supabase/client`)
صدا زده می‌شود و آن ماژول از مسیر **عمومی** `src/routes/public.sale-lists.$listId.tsx:19`
می‌آید — ولی `proacl` این تابع `anon` ندارد
(`authenticated=X/supabase_admin | service_role=X/supabase_admin`). یعنی برای بازدیدکنندهٔ
ناشناس این فراخوان `42501` می‌گیرد. خارج از دامنهٔ این سؤال؛ ثبت شد و رد شدم.

---

### [C5] تلهٔ ۱ — `has_dynamic_permission` وقتی ردیفی نیست fail-open می‌شود · **exists-broken** · `[E]`

بدنهٔ زنده خوانده شد (`pg_get_functiondef`). ساختارش: اول admin shortcut، بعد یک `EXECUTE
format(...)` که **هم‌زمان** «آیا اصلاً ردیفی برای این ماژول هست؟» و «آیا اجازه دارد؟»
را برمی‌گرداند، بعد شاخهٔ بازگشتی. **شاخه‌ای که باز می‌شود دقیقاً این است:**

```sql
  IF _exists THEN
    RETURN _matched;
  END IF;

  -- Fallback: sensible defaults based on legacy static matrix
  IF _action IN ('view') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant','sales','viewer']::text[]);
  ELSIF _action IN ('create','update') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager']::text[]);
```

`_exists` وقتی `false` است که **هیچ ردیفی در `role_permissions` برای (نقش‌های این کاربر،
این ماژول) وجود نداشته باشد**. آن‌وقت به‌جای رد کردن، به «ماتریس ایستای قدیمی» می‌افتد و
برای `view` به **هر پنج نقش — از جمله `viewer`** — `true` می‌دهد. یعنی **افزودن یک ماژول
جدید بدون افزودن ردیف `role_permissions`، آن ماژول را برای همه باز می‌کند، نه بسته.**

**پیامد برای ساخت:** هیچ specِ gate در این فایل `has_dynamic_permission` را به‌عنوان تنها
گارد پیشنهاد نمی‌دهد. الگوی مالک `[U]` — `has_any_role(auth.uid(), ARRAY[...])` — fail-closed
است و همان استفاده شد. جایی که `requirePermission` در مسیر UI هست (`sale-lists`,
`data-tables`)، در ستون «فراخوان مشروع» ثبت شده ولی **به‌عنوان گارد شمرده نشده**.

---

### [C6] تلهٔ ۲ — `user_roles.role` از نوع TEXT است و overload مبهم است · **exists-works** · `[E]`

```
$ psql -d afrakala -c "select table_name||'.'||column_name||' :: data_type='||data_type||' udt='||udt_name
                       from information_schema.columns where table_schema='public'
                       and ((table_name='user_roles' and column_name='role')
                         or (table_name='role_permissions' and column_name in ('role_name','module')));"

role_permissions.role_name :: data_type=text udt=text
role_permissions.module    :: data_type=text udt=text
user_roles.role            :: data_type=text udt=text
```

و هر دو helper **دو نسخه** دارند، پس آرایهٔ بدون cast مبهم است:

```
has_any_role(_user_id uuid, _roles app_role[]) -> boolean
has_any_role(_user_id uuid, _roles text[])     -> boolean
has_role(_user_id uuid, _role app_role)        -> boolean
has_role(_user_id uuid, _role text)            -> boolean
```

**پیامد:** هر spec در جدول زیر با `::text[]` صریح نوشته شده — همان شکلی که ۴۳۶ استفاده کرد
و دلیلش را ثبت کرد `[P]`. مقایسهٔ `role` با `app_role` بدون cast `operator does not exist`
می‌دهد؛ فرم بدون cast در برابر این چهار overload حل نمی‌شود.

---

### [C7] تلهٔ ۳ — بازسازی تابع، grantِ `authenticated` را بی‌صدا برمی‌گرداند · **exists-broken** · `[E]`

روی **این** دیتابیس، وضعیت زندهٔ پیش‌فرض‌ها اندازه‌گیری شد:

```
$ psql -d afrakala -c "select 'role='||pg_get_userbyid(d.defaclrole)||' nsp='||coalesce(n.nspname,'(GLOBAL)')
                       ||' acl='||array_to_string(d.defaclacl,',') from pg_default_acl d
                       left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclobjtype='f'::\"char\";"

role=supabase_admin nsp=public   acl=postgres=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin
role=supabase_admin nsp=(GLOBAL) acl=supabase_admin=X/supabase_admin
```

ردیف GLOBAL که migration ۳۹۳ گذاشت، `acldefault()` را جایگزین می‌کند و `PUBLIC` را
برمی‌دارد؛ ردیف `public` هم دیگر `anon=X` ندارد. **ولی `authenticated=X` هنوز آنجاست.**

نتیجهٔ دقیق برای این مأموریت: هر تابعی که در `public` **از نو ساخته شود** — `DROP` + `CREATE`،
یا `CREATE OR REPLACE` با امضای تغییرکرده (تغییر **نوع** آرگومان‌ها یک شیء تازه می‌سازد) —
با `{postgres=X, authenticated=X, service_role=X}` بیرون می‌آید. یعنی **`REVOKE ... FROM
authenticated` که در یک migration نوشته شده، در migrationِ بعدی که همان تابع را بازسازی کند
بی‌صدا از بین می‌رود.** (`anon`/`PUBLIC` برنمی‌گردد — آن نیمه را ۳۹۳ بسته است.)

سرِ خودِ ۳۹۳ همین مکانیزم را قبل از بسته‌شدن ثبت کرده —
`supabase/migrations/20260826140000_393_close_function_default_privilege_and_assert_viewer_guard.sql:17-33`:

```
-- `pg_default_acl` carries, for supabase_admin in schema `public`:
--    objtype 'f' | {postgres=X, anon=X, authenticated=X, service_role=X}
-- and there is no global (defaclnamespace = 0) row, so PostgreSQL's built-in
-- `acldefault()` also applies and hands every new function an implicit PUBLIC grant.
```

**پیامد برای ساخت — و این شرطِ پذیرشِ migrationِ بعدی است:** هر spec در جدول زیر که
«`authenticated` را بردار» می‌گوید، باید `REVOKE EXECUTE ON FUNCTION ... FROM authenticated`
را **بعد از هر `CREATE OR REPLACE` در همان فایل** تکرار کند، و ترجیحاً یک بلوک تأییدِ
درون‌تراکنشی مثل ۴۳۶ داشته باشد که با `has_function_privilege` نتیجه را بخواند `[P]`.

---

### [C8] گیتِ og61 فقط `anon` را می‌سنجد — و خودش می‌داند · **exists-partial** · `[P]` + `[E]`

`e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts` خوانده شد (اجرا **نشد**).
دو نیمه دارد: `TARGETS` (۲۶ نام دستی) و `DERIVED_SUBJECTS` (کوئری بازگشتی). خط تعیین‌کننده
در `DERIVED_SUBJECTS`:

```ts
    AND has_function_privilege('anon', f.oid, 'EXECUTE')
```

و `ANON_REACHABLE_ALLOWLIST` چهار ورودی دارد که هرکدام دلیل نوشته دارند.
هات‌فیکس محدودیت را صریح ثبت کرده `[P]`:

> «عمداً فقط `anon` سنجیده می‌شود؛ افزودن `authenticated` امروز ۵۸ شکست تولید می‌کرد و gate
> را بی‌فایده می‌کرد. این محدودیت در خود spec نوشته نشده.»

اندازه‌گیریِ امروز — و اینجا **دو عدد** هست، نه یکی، چون کوئریِ خودِ spec یک فیلترِ
اضافیِ `RAISE EXCEPTION` دارد که کلاسِ مشتق‌شدهٔ من ندارد (دلیلش در Numbers، نکتهٔ ۲):

```
og61-shape (WITH the [R]AISE EXCEPTION filter), authenticated: total=32  outside_anon_allowlist=28
my class    (NO   [R]AISE filter),              authenticated: total=63  outside_anon_allowlist=59
```

یعنی تعویض تک‌کلمه‌ایِ `'anon'` → `'authenticated'` در فایل موجود، **۲۸ شکست** می‌سازد نه ۵۸؛
و اگر فیلترِ `RAISE` هم برداشته شود تا ردهٔ پول دیده شود، **۵۹ شکست**. هیچ‌کدام «۵۸» نیست.
**۲۸ در برابر ۵۹ خودش تصمیم است:** فرم ۲۸تایی ارزان‌تر است ولی دقیقاً همان ۹ تابع پولِ
ردهٔ ۱ را نمی‌بیند، چون همه‌شان `RAISE EXCEPTION`ِ اعتبارسنجیِ آرگومان دارند. سه گزینه —
فقط توصیف، spec نوشته نشد (بند ۵ بریف):

| گزینه | شکل | چه می‌گیرد | چه نمی‌گیرد | هزینهٔ نگه‌داری |
|---|---|---|---|---|
| **الف) allowlist دومِ رده‌بندی‌شده** | همان کوئری با `'authenticated'`، به‌علاوهٔ `AUTHENTICATED_REACHABLE_ALLOWLIST` که ۶۳ ورودی دارد و هرکدام **دلیل و رده** (money/identity/catalogue/housekeeping) دارد | «تابع تازهٔ بازِ اضافه‌شده» — همان نیمه‌ای که ۴۳۶ ساخت، این بار برای `authenticated` | چیزی که همین امروز داخل allowlist نوشته شود، برای همیشه امن فرض می‌شود | بالا در روز اول (۶۳ دلیل)، صفر بعد از آن. `allowlist has not rotted` که همین فایل دارد، مانع تلنبار شدن نام‌های مرده است |
| **ب) rollout رده‌ای** | چهار تست جدا، هرکدام فقط یک رده را assert می‌کند؛ ردهٔ `money` اول سبز می‌شود، بقیه با `test.fixme` تا وقتی migrationشان برسد | اجازه می‌دهد ردهٔ پرخطر **همین حالا** قفل شود بدون آنکه ۵۹ شکستِ غیرقابل‌نگهداری بسازد | ردهٔ `fixme` هیچ محافظتی نمی‌دهد و ممکن است سال‌ها بماند | متوسط — ولی ردیف «چه چیزی هنوز باز است» را در خودِ suite قابل‌شمارش می‌کند |
| **ج) spec جدا با آستانهٔ نزولی** | یک فایل مستقل که فقط **عدد** را assert می‌کند: `expect(count).toBeLessThanOrEqual(N)` با `N` که هر migration کمش می‌کند | هرگز قرمزِ غیرقابل‌نگهداری نمی‌سازد؛ رگرسیون «یکی اضافه شد» را می‌گیرد | نمی‌گوید **کدام** تابع؛ جابه‌جایی (یکی بسته، یکی باز) را نمی‌بیند | پایین |

**ارزیابی `[E]`:** الف + ب با هم تنها ترکیبی است که هر دو شکستِ متقارنی را می‌گیرد که خودِ
spec دربارهٔ نیمهٔ literal/derived استدلال می‌کند — «قاعده تنگ‌تر شد» و «تابع تازه باز اضافه
شد». ج به‌تنهایی جابه‌جایی را نمی‌بیند و همان شکافی است که باعث شد `revoke_user_role` جا
بماند. **spec نوشته نشد؛ این فقط توصیف گزینه‌هاست، طبق بریف.**

---

## جدول رتبه‌بندی‌شده

**معیار رده‌بندی** (از روی جدول‌هایی که واقعاً نوشته می‌شوند، نه از روی نام تابع):
**money/credit** = `customer_credit_*`, `*_ledger`, `asan_export_numbers`, شمارندهٔ سند مالی ·
**identity/role** = `user_roles`, `profiles`, `persons`/`person_*`, عضویت و نقش گروه، اعتبارنامه ·
**catalogue/price** = `products`, `product_*`, `*_price*`, `*_suppliers`, `sale_list_*`, `dynamic_table_*` ·
**housekeeping** = `audit_logs`, `*_snapshots`, `notification_*`, صف‌ها، وضعیت استعلام، gamification.

ستون «نگه‌داشتن authenticated؟» — **پیشنهاد است، اعمال نشد.** `[U]` الگو: بدنه
`has_any_role(auth.uid(), ARRAY[...]::text[])` + `REVOKE ... FROM PUBLIC` (و طبق [C7]
`... FROM authenticated` هرجا که «خیر» آمده)، تکرارشده بعد از هر `CREATE OR REPLACE`.

### رده ۱ — پول و اعتبار (۱۲) — **همه بی‌گارد**

| تابع | چه می‌نویسد | فراخوان مشروع و نقش | gate پیشنهادی (یک خط) | نگه‌داشتن `authenticated`؟ |
|---|---|---|---|---|
| `hold_credit(p_customer_id, p_amount, p_invoice_id, p_user_id)` | `INSERT customer_credit_ledger` + `UPDATE customer_credit_balance` + `INSERT audit_logs` | فقط `hold_credit_for_quote` در DB · صفر فراخوان در `src`/`server` | هیچ گارد بدنه لازم نیست؛ **grant مستقیم برداشته شود** — مسیر داخلی با هویت definer اجرا می‌شود | **خیر** |
| `release_credit(p_customer_id, p_amount, p_invoice_id, p_user_id)` | `INSERT customer_credit_ledger` + `UPDATE customer_credit_balance` + `INSERT audit_logs` | `expire_stale_credit_holds`, `increase_credit` در DB · صفر در `src` | همان — grant مستقیم برداشته شود | **خیر** |
| `increase_credit(p_customer_id, p_amount, p_receipt_id, p_user_id)` | delegated → `release_credit` (بدنه فقط یک `PERFORM`) | `create_receipt`, `post_receipt_accounting` در DB · صفر در `src` | همان — grant مستقیم برداشته شود | **خیر** |
| `hold_credit_for_quote(p_quote_id, p_user_id)` | `UPDATE sales_quotes` (فیلدهای `quote_exception_*`) + `INSERT audit_logs` + delegated `hold_credit` | `update_sales_quote_status` در DB · صفر در `src` | همان — grant مستقیم برداشته شود | **خیر** |
| `_ensure_credit_balance(p_customer_id)` | `INSERT customer_credit_balance` | `get_customer_credit`, `get_customer_dynamic_credit`, `hold_credit`, `release_credit`, `reverse_document` در DB · صفر در `src` | تابع کمکیِ `_`-prefixed؛ grant مستقیم برداشته شود | **خیر** |
| `expire_stale_credit_holds(p_days=10, p_limit=50)` | `INSERT audit_logs` + delegated `release_credit` | `src/routes/_app.sales.quotes.new.tsx:204` — نقش‌های صفحه: `["admin","manager","sales"]` (`:61`, `:67`) | بدنه: `has_any_role(auth.uid(), ARRAY['admin','manager','sales']::text[])` | بله |
| `calculate_credit_score(_customer_id)` | `INSERT customer_credit_profile` + `INSERT credit_score_snapshots` + `INSERT audit_logs` | `recompute_customer_credit_scores` در DB · صفر در `src` | grant مستقیم برداشته شود؛ در غیر این صورت `['admin','manager','accountant']` | **خیر** |
| `recalculate_settlement_score(_customer_id)` | `INSERT customer_credit_profile ... ON CONFLICT DO UPDATE` | صفر در DB · صفر در `src` — **بدون فراخوان از هر دو طرف** | grant مستقیم برداشته شود (الگوی `recompute_all_employee_scores` در ۴۳۶ `[P]`) | **خیر** |
| `update_customer_overdue_status(_customer_id)` | `INSERT customer_credit_profile ... ON CONFLICT DO UPDATE` | صفر در DB · صفر در `src` — **بدون فراخوان از هر دو طرف** | همان | **خیر** |
| `asan_burn_document_number(_doc_type, _source_id, _reason)` | `UPDATE asan_export_numbers` | سه trigger: `trg_asan_burn_journal_entry_number@journal_entries`, `..._purchase_number@purchases`, `..._sales_quote_number@sales_quotes` · صفر در `src` | مسیر مشروع فقط trigger است → grant مستقیم برداشته شود (استدلال `apply_stock_movement` `[P]`) | **خیر** |
| `asan_assign_document_numbers(_doc_type, _ids[])` | delegated → `asan_assign_document_number` (که `has_any_role(_uid, ARRAY['admin','accountant'])` دارد `[P]`) | `src/lib/asan/export-single-quote.ts:52` و `src/routes/_app.admin.asan-export.tsx:237` — نقش صفحه `requireAnyRole(["admin","accountant"])` (`:106`) | بدنهٔ wrapper همان `['admin','accountant']::text[]` را صریح بگیرد تا قاعده در wrapper هم زندگی کند | بله |
| `next_sales_quote_number(_year)` | `INSERT sales_quote_counters` + `UPDATE ... SET` | `sales_quotes_assign_number` → `trg_sales_quotes_assign_number@sales_quotes` · صفر در `src` | مسیر مشروع فقط trigger است → grant مستقیم برداشته شود (صدا زدنش شمارهٔ سند را بی‌دلیل جلو می‌برد) | **خیر** |

### رده ۲ — هویت و نقش (۷)

| تابع | چه می‌نویسد | فراخوان مشروع و نقش | gate پیشنهادی | نگه‌داشتن `authenticated`؟ |
|---|---|---|---|---|
| `_person_merge_repoint(p_table, p_column, p_winner, p_loser)` | `UPDATE <p_table> SET <p_column>` — **نام جدول و ستون از آرگومان می‌آید** | `person_merge` در DB · صفر در `src` | **بی‌گارد.** grant مستقیم برداشته شود — تابع کمکیِ `_`-prefixed با جدولِ پویا | **خیر** |
| `detect_phone_collisions()` | `INSERT phone_collisions` | `src/routes/_app.admin.phone-collisions.tsx:101` — `requireAnyRole(["admin","manager"])` (`:63`) | بدنه: `has_any_role(auth.uid(), ARRAY['admin','manager']::text[])` | بله |
| `add_messenger_group_member(...)` | `INSERT messenger_group_members` | `src/components/messenger/GroupMembersDialog.tsx:133` | **گارد دارد** — `AUTH_REQUIRED` + `NOT_GROUP_ADMIN` (L7, L18). بدون تغییر | بله |
| `set_messenger_group_member_role(...)` | `UPDATE messenger_group_members` | `src/components/messenger/GroupMembersDialog.tsx:166` | **گارد دارد** — `NOT_GROUP_ADMIN` (L24). بدون تغییر | بله |
| `create_messenger_group(...)` | `INSERT messenger_groups` + `INSERT messenger_group_members` | `src/components/messenger/NewGroupDialog.tsx:28` | گاردِ ضعیف: فقط `AUTH_REQUIRED` (L7). **سؤال مالک:** آیا هر کاربر واردشده باید بتواند گروه بسازد؟ | بله (تا پاسخ مالک) |
| `delete_bot_api_key_secure(...)` | `INSERT bot_api_key_audit_log` + `UPDATE bot_api_keys` | `src/routes/_app.bot-api-keys.index.tsx:207` | **گارد دارد** — `UNAUTHORIZED` بر اساس مالکیت کلید (L24). بدون تغییر | بله |
| `bot_authenticate_key(...)` | `UPDATE bot_api_keys SET last_used_at` | `src/server/bot-api.ts:286` | **گارد دارد** — خودِ کلید اعتبارنامه است (`invalid_key`/`inactive_key`/`expired_key`) | بله |

### رده ۳ — کاتالوگ و قیمت (۱۷)

| تابع | چه می‌نویسد | فراخوان مشروع و نقش | gate پیشنهادی | نگه‌داشتن `authenticated`؟ |
|---|---|---|---|---|
| `refresh_sale_list_prices(p_list_id)` | `UPDATE sale_list_items` | `src/routes/_app.pricing.sale-lists_.$listId.tsx:224,399` — `requirePermission("pricing","view")` (`:114`) · و `src/lib/public/get-public-sale-list.ts:50` از مسیر **عمومی** | بدنه: `has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[])`. **توجه:** `requirePermission` گارد شمرده نشد ([C5]) | بله |
| `refresh_all_sale_list_prices()` | `UPDATE sale_list_items` (همهٔ فهرست‌ها) | صفر در DB · صفر در `src` — **بدون فراخوان** | grant مستقیم برداشته شود | **خیر** |
| `sync_product_stock_status(_product_id)` | `UPDATE products` | `apply_stock_movement` در DB · صفر در `src` | grant مستقیم برداشته شود (همان استدلال ۴۳۶ `[P]`) | **خیر** |
| `sync_product_price_observatory_rows()` | `INSERT dynamic_table_rows` + `INSERT dynamic_table_cells` | صفر در DB · صفر در `src` — **بدون فراخوان** | grant مستقیم برداشته شود | **خیر** |
| `cleanup_stale_auto_suppliers()` | `DELETE FROM product_suppliers` | صفر در DB · صفر در `src` — **بدون فراخوان؛ یک DELETE بدون قید** | grant مستقیم برداشته شود — بالاترین اولویت این رده | **خیر** |
| `enqueue_pricing_recompute(_product_ids[], _reason, ...)` | `INSERT pricing_recompute_queue` | چهار trigger (`trg_prq_currency_rates@currency_rates`, `..._pricing_rules`, `..._purchase_prices`, `..._shipping_rules`) · صفر در `src` | مسیر مشروع فقط trigger → grant مستقیم برداشته شود (صف را می‌شود از بیرون پر کرد) | **خیر** |
| `claim_pricing_recompute_jobs(_batch_size=25, _max_attempts=3)` | `UPDATE pricing_recompute_queue` (`FOR UPDATE SKIP LOCKED`) | `src/lib/pricing/process-recompute-queue.server.ts:59` — با **`supabaseAdmin`** یعنی `service_role` (`:1`) | فراخوان مشروع service_role است → grant `authenticated` برداشته شود | **خیر** |
| `check_price_alerts_for_product(...)` | `INSERT notification_events` + `INSERT price_alert_notifications` + `UPDATE price_alert_rules` | `_par_after_price_history_insert` → `trg_par_after_price_history@product_sale_price_history` · صفر در `src` | مسیر مشروع فقط trigger → grant مستقیم برداشته شود | **خیر** |
| `apply_required_services_for_quote_item(p_item_id)` | `INSERT sales_quote_item_services` | `trg_sales_quote_items_required_services@sales_quote_items` + `update_sales_quote_status` · صفر در `src` | مسیر مشروع فقط trigger/تابع → grant مستقیم برداشته شود | **خیر** |
| `next_product_sku(_year)` | `INSERT product_sku_counters` + `UPDATE ... SET` | `products_assign_sku` → `trg_products_assign_sku@products` · صفر در `src` | مسیر مشروع فقط trigger → grant مستقیم برداشته شود | **خیر** |
| `upsert_market_product_match_candidate(...)` | `INSERT`/`UPDATE market_product_matches` | `src/routes/api.public.bot.market-matches.candidates.upsert.ts:221` با **`supabaseAdmin`** = `service_role` | فراخوان مشروع service_role است → grant `authenticated` برداشته شود | **خیر** |
| `find_or_create_model(p_name, p_category_id)` | `INSERT product_attributes` | `src/components/products/ProductForm.tsx:310` | گاردِ ضعیف: `IF auth.uid() IS NULL THEN RAISE 'not_authenticated'` (L15-16) و کامنت L14 خودش می‌گوید «only … with products.create» ولی چنین بررسی‌ای **نیست**. spec: `['admin','manager','sales']::text[]` | بله |
| `query_dynamic_table_rows_v2(...)` | delegated → `_dyn_/_obs_compute_row_values` (memoize) | `src/routes/_app.data-tables.$tableId.tsx:214` (ternary، `[gaps:F16]`) — `requirePermission("data-tables","view")` (`:86`) | مسیر خواندن؛ در allowlist og61 با دلیل ثبت است `[P]`. بدون تغییر | بله |
| `bot_create_table_row(p_key_id, ...)` | `INSERT dynamic_table_rows/cells/row_counters` + `audit_logs` | `src/routes/api.public.bot.dynamic-tables.$tableId.rows.ts:282` | **گارد دارد** — `bot_api_key_table_access` (L17-21). بدون تغییر | بله |
| `bot_update_table_row(p_key_id, ...)` | `UPDATE dynamic_table_rows` + `INSERT dynamic_table_cells/audit_logs` | `...rows.$rowId.ts:157` | **گارد دارد** (L15-19). بدون تغییر | بله |
| `bot_upsert_table_row(p_key_id, ...)` | delegated → `bot_update_table_row`/`bot_create_table_row` | `...rows.upsert.ts:336` | **گارد دارد** (L25-29). بدون تغییر | بله |
| `bot_query_table_rows(p_key_id, ...)` | فقط `_bot_q_rows` — **جدول TEMP**، نه داده‌ی ماندگار | `...rows.ts:82` | **گارد دارد** (L12-16) و مقصد نوشتن TEMP است. بدون تغییر | بله |

### رده ۴ — نگه‌داری (۲۷)

| تابع | چه می‌نویسد | فراخوان مشروع و نقش | gate پیشنهادی | نگه‌داشتن `authenticated`؟ |
|---|---|---|---|---|
| `capture_score_snapshots()` | `DELETE score_snapshots` + `INSERT score_snapshots` | صفر در DB · صفر در `src` — **بدون فراخوان** | grant مستقیم برداشته شود. **توجه:** این تابعِ کنترلِ probe در ۴۳۶ بود و `anon` از آن گرفته شده `[P]`؛ `authenticated` هنوز دارد | **خیر** |
| `calculate_employee_score(_employee_id)` | `INSERT employee_scores ... ON CONFLICT DO UPDATE` | `src/lib/operations/gamification.ts:112` (کلاینت مرورگر) و `src/lib/gamification/manual-score.functions.ts:126` (**`supabaseAdmin`**، `:74`) · و ۵ trigger در DB | بدنه: `has_any_role(auth.uid(), ARRAY['admin','manager']::text[])` — ولی triggerها با هویت definer اجرا می‌شوند و نمی‌شکنند | بله |
| `award_xp_from_score(_employee_id)` | `INSERT/UPDATE employee_progress` | `trg_employee_scores_award_xp@employee_scores` · صفر در `src` | مسیر مشروع فقط trigger → grant مستقیم برداشته شود | **خیر** |
| `check_and_unlock_achievements_for_employee(_employee_id, _event_type)` | `INSERT employee_achievements` + `employee_score_events` + `audit_logs` | `trg_check_achievements_after_score@employee_score_events` · صفر در `src` | همان → grant مستقیم برداشته شود | **خیر** |
| `check_and_update_mission_progress_for_employee(_employee_id, _event_type)` | `INSERT/UPDATE employee_mission_progress` + `employee_score_events` + `audit_logs` | `trg_check_missions_after_score@employee_score_events` · صفر در `src` | همان → grant مستقیم برداشته شود | **خیر** |
| `settle_league_season()` | `INSERT/UPDATE league_seasons` + `employee_leagues` | `src/lib/operations/gamification-leagues.ts:255` ← `src/routes/_app.gamification.admin.leagues.tsx:616` (صفحهٔ admin) | بدنه: `has_any_role(auth.uid(), ARRAY['admin','manager']::text[])` — بستن فصل لیگ یک عمل یک‌طرفه است | بله |
| `ai_record_provider_health(...)` | `INSERT ai_provider_health ... ON CONFLICT DO UPDATE` | `src/lib/ai/client.server.ts:206` با **`supabaseAdmin`** (`:27`) = `service_role` | فراخوان مشروع service_role است → grant `authenticated` برداشته شود | **خیر** |
| `expire_pending_documents()` | `UPDATE documents` + `INSERT document_status_history` + `notification_events` | `tick_inquiries` در DB · صفر مستقیم در `src` | با `tick_inquiries` یکی است؛ grant مستقیم برداشته شود و مسیر را از `tick_inquiries` نگه دار | **خیر** |
| `expire_pending_delivery_receipts()` | `UPDATE delivery_receipts` + `INSERT delivery_receipt_status_history` + `notification_events` | `tick_inquiries` در DB · صفر مستقیم در `src` | همان | **خیر** |
| `tick_inquiries()` | `UPDATE inquiries` + `INSERT inquiry_status_history` + delegated دو تابع بالا | `src/lib/messenger/inquiry-status.ts:22` ← `InquiryBoard.tsx:209`, `useAllInquiries.ts:53` | فراخوان از هر کاربرِ صفحهٔ استعلام است و کار زمان‌محور می‌کند؛ **بدون گارد نقشی بماند** ولی مالک باید بداند ([سؤال ۳]) | بله |
| `log_event(...)` | `insert into audit_logs` | `src/lib/auth/AuthProvider.tsx:79,104` | **گارد دارد** — ۴۳۶ گاردِ «هر کاربر واردشده» را گذاشت `[P]`. بدون تغییر | بله |
| `log_invoice_issuance_blocked_overdue(...)` | `INSERT audit_logs` | صفر در `src` — **بدون فراخوان** | **گارد دارد** (`authentication required`, L7). می‌شود grant مستقیم را هم برداشت | **خیر** (اختیاری) |
| `mark_notification_read(p_notification_id)` | `UPDATE notification_queue WHERE id = ... AND user_id = auth.uid()` | `_app.notifications.tsx:78`, `NotificationBell.tsx:63`, `QuoteRejectionNoticeDialog.tsx:54` | **گارد دارد** — خودمحدود. در allowlist og61 با دلیل `[P]`. بدون تغییر | بله |
| `mark_all_notifications_read()` | `UPDATE notification_queue WHERE user_id = auth.uid()` | `_app.notifications.tsx:88`, `NotificationBell.tsx:77` | همان. بدون تغییر | بله |
| `start_market_rate_ingestion_run_system(...)` | `INSERT market_rate_ingestion_runs` | `src/routes/api/public/hooks/ingest-market-rates.ts:97` | **گاردِ معکوس** — `IF auth.uid() IS NOT NULL THEN RAISE 'system RPC: not callable by authenticated users'`. بدون تغییر | بله (بی‌اثر) |
| `finish_market_rate_ingestion_run_system(...)` | `UPDATE market_rate_ingestion_runs` | همان فایل `:125,147,204` | همان | بله (بی‌اثر) |
| `record_external_market_rate_tick_system(...)` | `INSERT market_rate_ticks` + `audit_logs` | همان فایل `:182` | همان | بله (بی‌اثر) |
| `create_inquiry(...)` | `INSERT inquiries` + `inquiry_status_history` + `messenger_messages` | `src/lib/messenger/inquiries.functions.ts:38` | **گارد دارد** — `is_messenger_group_member(p_group_id, auth.uid())` (L6). بدون تغییر | بله |
| `reply_inquiry(...)` | `INSERT inquiry_replies` + `inquiry_price_cache` + `inquiry_status_history` + `UPDATE inquiries` | `inquiries.functions.ts:57` | **گارد دارد** — `assigned_to != auth.uid()` (L15). بدون تغییر | بله |
| `transfer_inquiry(...)` | `INSERT inquiry_transfers` + `inquiry_status_history` + `UPDATE inquiries` | `inquiries.functions.ts:75` | **گارد دارد** — عضویت گروه (L11). بدون تغییر | بله |
| `update_inquiry_status(...)` | `INSERT inquiry_status_history` + `UPDATE inquiries` | `src/lib/messenger/inquiry-status.ts:9` | **گارد دارد** — عضویت گروه (L8). بدون تغییر | بله |
| `send_messenger_message(...)` | `INSERT messenger_messages` + `messenger_read_receipts` | `src/components/messenger/MessageComposer.tsx:44` | **گارد دارد** — `NOT_GROUP_MEMBER` (L11). بدون تغییر | بله |
| `send_messenger_message_with_attachment(...)` | `INSERT messenger_attachments/messages/read_receipts` | `MessageComposer.tsx:103` | **گارد دارد** — `NOT_GROUP_MEMBER` (L11) + `INVALID_FILE_PATH_OWNER` (L31). بدون تغییر | بله |
| `submit_appeal(...)` | `INSERT penalty_appeals` + `appeal_reviewers` + `notification_events` + `audit_logs` | `src/hooks/penalties/usePenalties.ts:301` | **گارد دارد** — `WHERE id = p_penalty_id AND user_id = auth.uid()` (L11). بدون تغییر | بله |
| `vote_on_appeal(...)` | `UPDATE penalty_appeals` + `appeal_reviewers` + `performance_penalties` + `notification_events` + `audit_logs` | `usePenalties.ts:320` | **گارد دارد** — `reviewer_id = auth.uid() AND vote IS NULL` (L11-12). بدون تغییر | بله |
| `cancel_promotion_nomination(...)` | `UPDATE promotion_nominations` + `INSERT audit_logs` | `src/lib/sales/promotion-nominations.ts:96` | **گارد دارد** — `unauthenticated` + `forbidden` (L10, L17). بدون تغییر | بله |
| `submit_quiz_attempt(...)` | `INSERT academy_quiz_attempts` + `audit_logs` | `src/routes/_app.academy_.$courseId_.$lessonId_.quiz.tsx:55` | **گارد دارد** — `unauthenticated` (L14). بدون تغییر | بله |

**جمع ردیف‌ها: ۱۲ + ۷ + ۱۷ + ۲۷ = ۶۳ ✓** — هیچ تابعی از کلاس مشتق‌شده حذف نشد.
هیچ ردیف `UNKNOWN` لازم نشد: هر ۶۳ بدنه خوانده شد و هر ۶۳ نام با هر چهار اصطلاح grep شد.

**جمع «`authenticated` را بردار»: ۲۳ تابع** — ۹ در پول، ۱ در هویت، ۸ در کاتالوگ، ۵ در نگه‌داری
(به‌علاوهٔ `log_invoice_issuance_blocked_overdue` که اختیاری علامت خورد).

---

## آنچه از قبل وجود دارد و می‌شود دوباره استفاده کرد

- **`e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts`** — کوئری
  `DERIVED_SUBJECTS` (بازگشتی، delegation-following) و شکل `ANON_REACHABLE_ALLOWLIST`
  با «هر ورودی دلیل دارد». نسخهٔ `authenticated` فقط یک کلمه تفاوت دارد.
- **`e2e/helpers/db.ts`** — `assertReadOnlySql`؛ و ترفند نوشتن فعل‌ها به شکل `[I]NSERT`
  که هات‌فیکس ثبت کرد `[P]`، تا گارد ضعیف نشود.
- **`supabase/migrations/20260905100000_436_close_anon_role_grant_escalation.sql`** —
  الگوی مالک `[U]`: `REVOKE ... FROM anon` **و** `FROM PUBLIC`، گاردِ بدنه با
  `has_any_role(auth.uid(), ARRAY[...]::text[])`، و **بلوک تأیید در همان تراکنش** با
  `NOTICE`. سه‌تایی که باید عیناً تکرار شود.
- **`supabase/migrations/20260827010000_399_og61_close_unauthenticated_definer_writers.sql`** —
  همان الگو، نسخهٔ قبلی؛ و استثنای «توابع trigger کنار گذاشته می‌شوند».
- **`supabase/migrations/20260826140000_393_...`** — تنها جایی که مکانیزم `pg_default_acl`
  مستند و اندازه‌گیری شده. برای [C7] لازم است.
- **`docs/research/og31-function-execute-audit.md`** — شش probe که `NULL acl = PUBLIC
  executes` را اثبات می‌کنند.
- **`docs/research/frontend-backend-gaps-20260905.md:486` و جدول Numbers** — تعریف چهار
  اصطلاح فراخوان. بدون آن، ۱۰ تابع اشتباهاً «یتیم» شمرده می‌شدند `[P]`.
- **`src/lib/rbac/route-guards.ts`** — `requireAnyRole` / `requirePermission`؛ برای پر کردن
  ستون «نقش صفحه» استفاده شد. **گارد backend نیست** و به‌عنوان گارد شمرده نشد.

---

## سؤال‌های مالک

1. **آیا کسی جز حسابداری باید بتواند سقف اعتبار یک مشتری را جابه‌جا کند؟**
   امروز هر کاربر واردشده — از جمله «بیننده» — می‌تواند مبلغ رزرو یا آزادسازی اعتبار هر
   مشتری را تعیین کند، **و نام شخصِ انجام‌دهنده را هم خودش بفرستد**؛ آن نام همان چیزی است
   که در دفتر ممیزی ثبت می‌شود. هیچ صفحه‌ای در برنامه این کار را نمی‌کند.
   (`hold_credit`, `release_credit`, `increase_credit`, `hold_credit_for_quote`)

2. **وقتی یک ماژول تازه به سیستم اضافه می‌شود و هنوز جدول دسترسی‌هایش پر نشده، آن ماژول
   باید برای همه باز باشد یا برای همه بسته؟** امروز **باز** است: «مشاهده» به هر پنج نقش
   داده می‌شود تا وقتی کسی دسترسی‌ها را تعریف کند. این عمدی بوده یا میراث؟ ([C5])

3. **«تازه‌سازی وضعیت استعلام‌ها» و «انقضای اسناد معلق» باید کارِ زمان‌بندی‌شده باشد یا هر
   بار که کاربری صفحه را باز می‌کند اجرا شود؟** امروز دومی است: باز کردن تابلوی استعلام‌ها
   وضعیت اسناد و رسیدهای تحویل کل شرکت را جلو می‌برد. (`tick_inquiries`)

4. **آیا «ساختن گروه گفت‌وگو» باید برای همه آزاد باشد؟** امروز هر کاربر واردشده می‌تواند
   گروه بسازد و خودش مدیر آن شود. (`create_messenger_group`)

5. **چند تابع در این فهرست هیچ صفحه‌ای صدایشان نمی‌زند و هیچ trigger هم به آن‌ها وصل نیست —
   آیا اینها قابلیت‌های نیمه‌کاره‌اند یا باید بازنشسته شوند؟**
   `recalculate_settlement_score`, `update_customer_overdue_status`, `capture_score_snapshots`,
   `refresh_all_sale_list_prices`, `sync_product_price_observatory_rows`,
   `cleanup_stale_auto_suppliers`. (بستنِ grant تصمیم امنیتی است؛ حذفشان تصمیم محصول.)

6. **آیا production همین وضع را دارد؟ کسی باید اندازه بگیرد — من نگرفتم و نباید می‌گرفتم.**
   ۱۹۲.۱۶۸.۱۷۰.۱۰ نه صدا زده شد، نه resolve، نه ping.

---

## Numbers

| کمیت | مقدار | دستور/کوئری |
|---|---:|---|
| `SECURITY DEFINER` در `public` (baseline ارکستریتور) | **۴۱۶** | `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef;` — قبل و بعد یکسان |
| کل توابع secdef که می‌نویسند و به anon **یا** authenticated می‌رسند، **بدون** فیلتر گارد | ۱۵۵ | کوئری پایه زیر، بدون بند `def !~*` |
| **کلاس ۶۳ هات‌فیکس، بازتولیدشده** | **۶۳** | کوئری کامل زیر با `has_function_privilege('anon',…) OR has_function_privilege('authenticated',…)` |
| **کلاس مشتق‌شدهٔ من — reachable by `authenticated`** | **۶۳** | کوئری کامل زیر (نسخهٔ نهایی) |
| ↳ که `anon` هم به آن‌ها می‌رسد | ۱۵ | همان + `has_function_privilege('anon', oid,'EXECUTE')` |
| ↳ **فقط `authenticated`** | **۴۸** | همان + `NOT has_function_privilege('anon', …)` |
| ↳ **بی‌گارد پس از خواندن ۶۳ بدنه** | **۳۶** | دستی، هر ۶۳ بدنه خوانده شد |
| ↳ گاردِ غیرنقشی دارند | ۲۷ | همان |
| ادعای prior art | ۵۸ | `docs/research/anon-role-grant-hotfix-20260905.md`، NOT VERIFIED بند ۳ — **بازتولید نشد** |
| رده money/credit | ۱۲ | جدول رتبه‌بندی‌شده |
| رده identity/role | ۷ | همان |
| رده catalogue/price | ۱۷ | همان |
| رده housekeeping | ۲۷ | همان |
| «`authenticated` را بردار» پیشنهادشده | ۲۳ | همان |
| بدون هیچ فراخوان (نه `src`، نه DB، نه trigger) | ۶ | جدول + کوئری callers |
| `proacl IS NULL` در کلاس | ۰ | `select count(*) … where prosecdef and proacl is null` |
| `proacl IS NULL` در کل secdefهای `public` | ۰ | همان |
| توابع `public` با ورودی صریح `=X` (PUBLIC) | ۶۴۱ | `select count(*) … where proacl is null or exists (select 1 from unnest(proacl) a where a::text like '=%')` |
| ↳ در کلاس مشتق‌شدهٔ من | ۱ | `query_dynamic_table_rows_v2` (در allowlist og61 `[P]`) |
| DDLِ ماندگار در بدنهٔ هر تابع `public` | **۰** | کوئری DDL زیر — هر ۸ برخورد یا `TEMP TABLE` است یا داخل یک کامنت فارسی |
| اگر og61 امروز به `authenticated` گسترش یابد — **شکل خودِ spec** (با فیلتر `RAISE`) | ۳۲ نام، ۲۸ خارج از allowlist | همان کوئری فایل spec، `'anon'`→`'authenticated'` |
| ↳ **بدون فیلتر `RAISE`** (تا ردهٔ پول دیده شود) | ۶۳ نام، ۵۹ خارج از allowlist | کوئری کلاس زیر |

### کوئری‌ای که کلاس را ساخت — بازاجراپذیر

```sql
WITH RECURSIVE fn AS (
  SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def,
         pg_get_function_result(p.oid) AS res, p.prosecdef, p.proacl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
),
direct AS (
  SELECT proname FROM fn
  WHERE def ~* '([I]NSERT\s+INTO|[U]PDATE\s+(public\.)?[a-z_]|[D]ELETE\s+FROM|[M]ERGE\s+INTO)'
),
writer AS (                                   -- delegation را دنبال می‌کند: wrapperِ تک-PERFORM
  SELECT proname FROM direct
  UNION
  SELECT f.proname FROM fn f JOIN writer w ON f.proname <> w.proname
   AND f.def ~ ('(^|[^a-zA-Z0-9_])(public\.)?' || w.proname || '\s*\(')
)
SELECT f.proname,
       CASE WHEN f.proname IN (SELECT proname FROM direct) THEN 'direct' ELSE 'delegated' END AS how,
       has_function_privilege('anon', f.oid, 'EXECUTE') AS anon_x,
       (f.proacl IS NULL) AS acl_null
FROM fn f
WHERE f.prosecdef
  AND f.res <> 'trigger'                      -- استثنای ۳۹۹: بدون آرگومان، از PostgREST فراخوان‌ناپذیر
  AND f.proname IN (SELECT proname FROM writer)
  AND has_function_privilege('authenticated', f.oid, 'EXECUTE')
  AND f.def !~* '(has_role|has_any_role|_require_privileged|gamification_assert_manager|is_active_actor)'
ORDER BY 1;
-- 63 rows
```

**سه نکتهٔ روش که عدد به آن‌ها حساس است:**
1. `has_function_privilege` استفاده شد نه بازرسی `proacl` — چون ورودی صریح، `PUBLIC`، و
   `acldefault()` را با هم حساب می‌کند؛ `proacl IS NULL` را هم درست مدیریت می‌کند ([C1]).
2. **`RAISE EXCEPTION` به فیلتر اضافه نشد.** og61 آن را دارد و عدد را به ۳۲ می‌رساند —
   ولی اکثر `RAISE`ها اعتبارسنجی آرگومان‌اند نه مجوز (`_ensure_credit_balance`, `hold_credit`).
   فیلتر کردن با آن، دقیقاً همان ۹ تابع پولِ ردهٔ ۱ را پنهان می‌کرد.
3. **`auth.uid()` هم به فیلتر اضافه نشد** (اگرچه بریف نامش را برد؛ آن نسخه ۴۰ می‌دهد) —
   چون در `calculate_credit_score` `auth.uid()` فقط یک **مقدار** است، عیناً همان تله‌ای که
   `assign_user_role_txt` را از دید ۳۹۹ پنهان کرد `[P]`. به‌جای regex، هر ۶۳ بدنه خوانده شد.

### کوئری DDL

```sql
SELECT p.proname, p.prosecdef, has_function_privilege('authenticated', p.oid,'EXECUTE')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f'
  AND p.prosrc ~* '([C]REATE\s+(TABLE|INDEX|VIEW|SEQUENCE|POLICY)|[A]LTER\s+(TABLE|SEQUENCE)
                   |[D]ROP\s+(TABLE|INDEX|VIEW|COLUMN|POLICY)|[T]RUNCATE\s|[G]RANT\s+[A-Z]|[R]EVOKE\s+[A-Z])';
-- 8 rows: asan_commit_person_batch, assert_person_fk_registry, bot_query_table_rows,
--         export_dynamic_table_rows, query_dynamic_table_rows, recompute_dynamic_capital_setting,
--         revoke_user_role_txt, run_daily_capital_allocation
```

**مهم:** `prosrc` استفاده شد نه `pg_get_functiondef`. خروجی `pg_get_functiondef` **همیشه** با
`CREATE OR REPLACE FUNCTION` شروع می‌شود، پس هر regexِ DDL روی آن به همهٔ ۸۰۰+ تابع برخورد
می‌کند (اولین تلاش من ۱۲۳ ردیف داد؛ کاذب بود). هر ۸ برخورد بازرسی شد: `_bot_q_rows`, `_x_rows`,
`_q_rows`, `_sp_cust`, `_sp_alloc` همه **TEMP** هستند، و برخورد `assert_person_fk_registry`
داخل یک **کامنت فارسی** است. **صفر DDLِ ماندگار.** پس افزودن DDL به آشکارساز عدد را عوض نمی‌کند.

---

## Coverage

**بررسی‌شده:**
- هر ۶۳ تابع کلاس: بدنه (`prosrc`) خوانده شد، `proacl` خوانده شد، هر چهار اصطلاح فراخوان
  در `src/` و `server/` grep شد، فراخوان‌های درون‌دیتابیسی (تابع + trigger) کوئری شد.
- هر سه تله با اندازه‌گیری زنده تأیید شد ([C5], [C6], [C7]).
- `e2e/security/og61-...spec.ts` کامل خوانده شد؛ **اجرا نشد**.
- prior art: هر چهار سندی که بریف نام برد خوانده شد؛ به‌علاوه `og31-function-execute-audit.md`
  و سرصفحهٔ migration ۳۹۳ برای [C7].
- `pg_default_acl` برای همهٔ ۹ ردیف `objtype='f'`.

**بررسی‌نشده، با دلیل:**
- **۹۲ تابعی که فیلترِ توکنِ گارد کنارشان گذاشت** (۱۵۵ − ۶۳). طبق تعریفِ کلاس در بریف بیرون‌اند.
  **ولی یک برخورد توکن اثبات نمی‌کند که گارد روی مسیر نوشتن است** — ممکن است در یک شاخهٔ
  دیگر یا فقط در یک `RETURN` باشد. این یک کلاسِ باقی‌مانده است، نه یک مورد بسته. ([UNVERIFIED ۱])
- **توابعی که `res = 'trigger'` دارند** — طبق استثنای ۳۹۹ کنار گذاشته شدند (بدون آرگومان،
  از PostgREST فراخوان‌ناپذیر). این استثنا دوباره اندازه‌گیری **نشد**. ([UNVERIFIED ۲])
- **RLS روی جدول‌های مقصد** — `pg_policies` برای هیچ‌کدام از جدول‌های نوشته‌شده خوانده نشد.
  بی‌ربط است چون `SECURITY DEFINER` از RLS رد می‌شود، ولی اگر مالک تصمیم بگیرد تابعی را به
  `SECURITY INVOKER` تبدیل کند، آن تحلیل لازم می‌شود. خارج از دامنه.
- **رفتار زمان اجرا** — هیچ فراخوانی انجام نشد (PROBE RULE). هیچ ادعایی در این سند از روی
  اجرا نیست؛ همه از روی کاتالوگ و منبع است.
- **`schema_full_export.sql`** — طبق قاعدهٔ ۲ اصلاً باز نشد. همه‌چیز زنده خوانده شد.
- **production** — تماس گرفته نشد.
- **مسیرهای Kong/PostgREST** — بررسی نشد که آیا مسیر دیگری جز `/rpc/<name>` وجود دارد.

---

## UNVERIFIED / UNKNOWN

1. **آیا آن ۹۲ تابعی که توکنِ `has_role` دارند واقعاً گارد شده‌اند؟** `UNVERIFIED`. برخورد
   regex اثبات نمی‌کند که بررسی روی مسیر نوشتن است. برای پاسخ باید ۹۲ بدنه خوانده شود؛
   در دامنهٔ این سؤال نبود. **این محتمل‌ترین جایی است که یک حفرهٔ دیگر مانده باشد** —
   دقیقاً همان‌طور که ۶۳ تاییِ ۴۳۶ دو wrapper را از دست داد.
2. **استثنای «تابع trigger از PostgREST فراخوان‌ناپذیر است»** — از ۳۹۹ به ارث رسید،
   دوباره اندازه‌گیری نشد. `UNVERIFIED`.
3. **آیا `p_user_id` در `hold_credit`/`release_credit` جایی اعتبارسنجی می‌شود؟** خیر، در
   بدنه نه. ولی اینکه آیا مصرف‌کنندهٔ `audit_logs` این ستون را باور می‌کند یا با `auth.uid()`
   تطبیق می‌دهد، بررسی نشد. `UNKNOWN`.
4. **رفتار واقعی `has_dynamic_permission` روی داده‌ی امروز** — شاخهٔ fail-open از بدنه اثبات
   شد ([C5])، ولی اینکه امروز چند ماژول ردیف `role_permissions` ندارند **شمرده نشد**
   (نیازمند خواندن داده‌ی کاربردی؛ بیرون از «فقط نام ستون و شمارش»). `UNKNOWN`.
5. **`refresh_sale_list_prices` از مسیر عمومی `public.sale-lists.$listId`** — `proacl` آن
   `anon` ندارد، پس برای بازدیدکنندهٔ ناشناس باید `42501` بدهد. **اندازه‌گیری نشد** (نیازمند
   فراخوان بود؛ PROBE RULE). یک شکاف جداست، نه پاسخ این سؤال. `UNVERIFIED`.
6. **آیا هیچ‌کدام از ۲۳ پیشنهادِ «`authenticated` را بردار» یک فراخوانندهٔ مشروعی دارد که
   من ندیدم؟** grep چهار اصطلاح را پوشش می‌دهد و فراخوانِ درون‌DB را هم کوئری کردم، ولی یک
   فراخوان از یک سرویس بیرونی با JWT کاربر (نه `service_role`) در هیچ‌کدام دیده نمی‌شود.
   `UNVERIFIED` — قبل از اعمال، هر REVOKE باید مثل ۴۳۶ با بلوک تأیید در همان تراکنش همراه شود.
7. **عدد ۵۸ از کجا آمد؟** بازتولید نشد و منشأ حسابیِ قطعی‌اش معلوم نیست؛ `۶۳ − ۵` محتمل‌ترین
   حدس است ولی حدس است. `UNKNOWN`.

---

## Preflight / Postflight

```
PREFLIGHT   git rev-parse HEAD  -> f1512219d15d43c82df76cb06edfed9171e5ac68   (staging)
            git status --porcelain -> ?? docs/missions/
                                      ?? docs/research/scoring-engine-zero-parameters-20260905.md
            secdef count -> 416
            git worktree list -> 18 worktree (درخت اصلی + ۱۷ تای دیگر) — هیچ‌کدام لمس نشد

POSTFLIGHT  git rev-parse HEAD  -> f1512219d15d43c82df76cb06edfed9171e5ac68   (staging)
            git status --porcelain -> ?? docs/missions/
                                      ?? docs/research/authenticated-open-functions-20260905.md   <-- همین فایل
                                      ?? docs/research/ocr-gap-20260905.md                        <-- مالِ من نیست
                                      ?? docs/research/phone-gap-20260905.md                      <-- مالِ من نیست
                                      ?? docs/research/scoring-engine-zero-parameters-20260905.md
            secdef count -> 416   (بدون تغییر)
            git worktree list -> 18 ردیف (بدون تغییر)
```

**SHA، شاخه، و شمارش `SECURITY DEFINER` هیچ‌کدام تکان نخوردند.**

**drift دیده شد و مالِ من نیست، صادقانه ثبت می‌شود:** دو فایل untracked تازه در
`docs/research/` ظاهر شدند که در preflight نبودند — `ocr-gap-20260905.md` و
`phone-gap-20260905.md`. من ننوشتمشان؛ تنها فایلی که نوشتم همین است. بریف گفته بود سه
مأمور دیگر هم‌زمان روی همین ماشین کار می‌کنند، و شکلِ این دو نام با آن می‌خواند.
**دست نزدم، باز نکردم، حذف نکردم.**

هم‌چنین، برای اینکه هیچ ابهامی دربارهٔ نوشتنِ ناخواسته نماند (سابقهٔ ردیف `audit_logs`
شمارهٔ ۶۱۲۶۵ در ۴۳۶ `[P]`)، ردیف‌های دو ساعت اخیرِ `audit_logs` رده‌بندی شد:

```
person | person.create                          | 36
person_identifier | person.identifier.add       | 26
customer | customer_created                     | 16
person_context_link | person.context_link.add   | 16
...   (۱۳۱ ردیف، همه فعالیت عادی برنامه)
```

**هیچ ردیفی با شکل `__probe__` وجود ندارد.** همه کارِ مأموران دیگرند. هیچ شاخه‌ای عوض نشد،
هیچ `stash`ی زده نشد، هیچ تابعی صدا زده نشد، هیچ تراکنشی باز نشد، هیچ ردیفی نوشته نشد.

**COMPLETE.**
