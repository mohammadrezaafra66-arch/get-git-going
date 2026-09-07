# پژوهش — زمینه‌سازی پنج ساخت و دو تغییر معماری (سؤال C)

**READ-ONLY — هیچ چیز تغییر نکرد.** تنها فایل نوشته‌شده همین سند است. هیچ migration، هیچ کد،
هیچ نصب، هیچ commit، هیچ تغییر شاخه. همهٔ statementهای دیتابیس با
`PGOPTIONS="-c default_transaction_read_only=on"` اجرا شدند. **هیچ تابعی صدا زده نشد** — نه
`get_customer_dynamic_credit`، نه `recompute_dynamic_capital_setting`، نه هیچ چیز دیگر؛ تنها
استثنا `public.person_fk_registry_report()` است که یک گزارش `STABLE` فقط‌خواندنی است و در
`CLAUDE.md` قاعدهٔ ۹ خودش به‌عنوان دستور تشخیصی توصیه شده. `192.168.170.10` نه تماس گرفته شد،
نه resolve، نه ping. هیچ Playwright، هیچ e2e، هیچ اتوماسیون مرورگر.

| | |
|---|---|
| مخزن | `D:\AfraKalaTest\app` · شاخهٔ `staging` |
| SHA | `a4338604` (در ابتدا و انتهای کار یکسان) |
| دیتابیس | `afrakala` روی `afrakala-lan-db`، کاربر `postgres`، تراکنش read-only |
| تاریخ | ۲۰۲۶-۰۹-۰۶ |
| هم‌زمانی | Wave 5 (allocation workbench) روی همین دیتابیس در حال اجراست — بند «Numbers» |

---

## Verdict — یک پاراگراف

**از پنج ساخت، دو تا تقریباً کامل‌اند و فقط UI کم دارند، دو تا کاملاً خالی‌اند، و یکی —
`credit_requests` — یک سؤال کسب‌وکاری بی‌پاسخ دارد که هیچ کدی نمی‌تواند به‌جای مالک جواب دهد.**
`person_field_definitions` **[C-3]** جدولش، جدول مقادیرش (`person_field_values`، که بریف
به‌عنوان یک فرضیه پرسیده بود و **واقعاً وجود دارد**)، RLS، تریگر اعتبارسنجی، تریگر ممیزی، و کل
لایهٔ server-function (`getPerson`/`updatePerson`/`createPerson` + `person_create_full`) ساخته و
وصل است — و **هیچ کامپوننت UI در کل `src/` حتی یک بار نام `person_field` را نمی‌برد**؛ پس ادعای
«خواننده‌ها آماده‌اند» درست است ولی خوانندهٔ *دیده‌شدنی* صفر است. `employee_streaks` **[C-1]**
یک جدول با صفر ردیف، صفر نویسنده (نه در کد، نه در دیتابیس) و یک خوانندهٔ تنها است، و
پیش‌نیازش — «روز فعال = ورود» — **امروز اصلاً قابل کوئری نیست**: تنها تاریخچهٔ ورود در
`auth.audit_log_entries` است که PostgREST به آن دسترسی ندارد، `profiles.last_seen_at` تاریخچه
ندارد (یک ستون بازنویسی‌شونده است)، و `audit_logs` صفر ردیف با `action='login_success'` دارد
با وجود اینکه `AuthProvider` آن را می‌فرستد. `credit_requests` **[C-2]** جدول و RLS دارد و
**هیچ تابع، هیچ تریگر و هیچ خط کدی آن را نمی‌خواند یا نمی‌نویسد**؛ و پرسش «تأیید چه می‌کند»
یک پاسخ ساختاری دارد که خوش‌بینانه نیست: فرمول `recompute_dynamic_capital_setting` **یک ورودی
دستی از قبل دارد** (`customer_credit_profile.credit_limit`) ولی آن را به‌عنوان **سقف** به کار
می‌برد نه کف — `raw_allocation > credit_limit` را به `credit_limit` می‌بُرد — پس بالا بردن آن
هرگز نمی‌تواند سقف را از `raw_allocation` بالاتر ببرد، و گزینهٔ (b) بریف **به‌تنهایی جواب
نمی‌دهد**. برای دو تغییر معماری: **D-47 امروز بی‌خطر است** چون هر سه مدل «held» عدد صفر
می‌دهند و `capital_allocation_ledger` **هیچ FK به `persons` ندارد**، پس گیت مهاجرت ۳۲۸ اصلاً
درگیر نمی‌شود — ولی `recompute_dynamic_capital_setting` **این جدول را می‌خواند تا تصمیم بگیرد
بازمحاسبه را رد کند یا نه**، و آن خواننده در پژوهش قبلی شمرده نشده بود. **D-48 یک موج نیست، سه
موج است** — نه به‌خاطر ۸۶ فایل، بلکه چون «همیشه زنده بخوان» یعنی حذف یک fallback که امروز
روی **۱۶ ماژول** با جدول زنده اختلاف دارد و روی **۳ ترکیب نقش×ماژول** تنها منبع تصمیم است.

---

## آنچه از قبل وجود دارد — با اثبات

### مشترک — RLS و ابعاد هر پنج جدول

```
$ docker exec -u postgres -e PGOPTIONS="-c default_transaction_read_only=on" afrakala-lan-db \
  psql -d afrakala -Atc "select c.relname||' | rls='||c.relrowsecurity||' | forced='||c.relforcerowsecurity||' | policies='||(select count(*) from pg_policy p where p.polrelid=c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in ('employee_streaks','credit_requests','person_field_definitions','person_field_values','capital_allocation_ledger','customer_credit_ledger','gamification_kpis','customer_capital_allocations_dynamic') order by 1;"

capital_allocation_ledger | rls=true | forced=false | policies=3
credit_requests | rls=true | forced=false | policies=4
customer_capital_allocations_dynamic | rls=true | forced=false | policies=3
customer_credit_ledger | rls=true | forced=false | policies=2
employee_streaks | rls=true | forced=false | policies=1
gamification_kpis | rls=true | forced=false | policies=4
person_field_definitions | rls=true | forced=false | policies=3
person_field_values | rls=true | forced=false | policies=4
```

```
$ ... -Atc "select 'employee_streaks='||(select count(*) from employee_streaks)||' credit_requests='||(select count(*) from credit_requests)||' person_field_definitions='||(select count(*) from person_field_definitions)||' person_field_values='||(select count(*) from person_field_values)||' capital_allocation_ledger='||(select count(*) from capital_allocation_ledger)||' customer_credit_ledger='||(select count(*) from customer_credit_ledger)||' gamification_kpis='||(select count(*) from gamification_kpis)||' customer_capital_allocations_dynamic='||(select count(*) from customer_capital_allocations_dynamic);"

employee_streaks=0 credit_requests=0 person_field_definitions=0 person_field_values=0
capital_allocation_ledger=0 customer_credit_ledger=7 gamification_kpis=13
customer_capital_allocations_dynamic=35
```

---

### C-1 · `employee_streaks` — جدول هست، ثبت‌کنندهٔ «روز فعال» نیست

**Schema (زنده):**

```
employee_streaks | 1 | id | uuid | nullable=NO | default=gen_random_uuid()
employee_streaks | 2 | employee_id | uuid | nullable=NO | default=-
employee_streaks | 3 | streak_type | text | nullable=NO | default=-
employee_streaks | 4 | current_count | integer | nullable=NO | default=0
employee_streaks | 5 | best_count | integer | nullable=NO | default=0
employee_streaks | 6 | last_event_date | date | nullable=YES | default=-
employee_streaks | 7 | updated_at | timestamp with time zone | nullable=NO | default=now()
```

**قیدها:**

```
employee_streaks :: employee_streaks_employee_id_fkey :: f :: FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE
employee_streaks :: employee_streaks_employee_id_streak_type_key :: u :: UNIQUE (employee_id, streak_type)
employee_streaks :: employee_streaks_pkey :: p :: PRIMARY KEY (id)
```

> **توجه ساختاری:** `streak_type` **هیچ CHECK ندارد** — هر رشته‌ای مجاز است. و `UNIQUE
> (employee_id, streak_type)` یعنی مدل داده **یک ردیف در هر نوع زنجیره برای هر کارمند** است،
> نه یک تاریخچهٔ روزانه. `last_event_date` تنها حافظهٔ زمانی است.

**RLS — یک policy، فقط SELECT:**

```
employee_streaks :: emp_streaks_self_or_admin :: r :: roles=authenticated ::
  USING=((employee_id = auth.uid()) OR has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text))
  :: CHECK=-
```

**هیچ policy برای INSERT/UPDATE/DELETE نیست.** با `relforcerowsecurity=false` یک تابع
`SECURITY DEFINER` با مالک superuser می‌تواند بنویسد؛ یک نویسندهٔ کلاینتی نمی‌تواند.

**خواننده — دقیقاً یکی، در کد، و هیچ‌کدام در دیتابیس:**

```
$ ... -Atc "select n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in ('f','p') and p.prolang<>13 and pg_get_functiondef(p.oid) ~* 'employee_streaks' order by 1;"
(خالی — هیچ تابع دیتابیسی این جدول را نه می‌خواند نه می‌نویسد)

$ grep -rn "employee_streaks" src/ e2e/ automation/ | grep -v "integrations/supabase/types.ts"
src/lib/operations/gamification.ts:436:    .from("employee_streaks" as never)
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:161:  "employee_streaks",
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:357:  "employee_streaks",
```

`src/lib/operations/gamification.ts:432-440`:

```ts
export async function listEmployeeStreaks(employeeId: string): Promise<EmployeeStreak[]> {
  const { data, error } = await supabase
    .from("employee_streaks" as never)
    .select("streak_type, current_count, best_count, last_event_date")
    .eq("employee_id", employeeId);
```

**تأیید `[unwired:T13]`** (`docs/research/unwired-inventory-20260905.md:598`): «کد می‌خواند …
صفحهٔ `/gamification/achievements` سه نشان بر پایهٔ آن دارد … که هیچ‌وقت قابل کسب نیستند».
اثبات مکمل که آن سند نداشت — سه نشان واقعاً وجود دارند و **هیچ‌کدام قاعدهٔ خودکار ندارند**:

```
$ ... -Atc "select key||' | '||rule_type||' | rule_value='||coalesce(rule_value::text,'-')||' | xp='||xp_reward||' | enabled='||enabled from achievements order by display_order;"
first_steps | manual | rule_value=- | xp=50 | enabled=true
first_sale | manual | rule_value=- | xp=100 | enabled=true
streak_3 | manual | rule_value=- | xp=75 | enabled=true
streak_7 | manual | rule_value=- | xp=200 | enabled=true
streak_30 | manual | rule_value=- | xp=1000 | enabled=true
...
```

در حالی که `rule_type='streak'` **یک مقدار مجاز است**:

```
achievements :: achievements_rule_type_check :: CHECK ((rule_type = ANY (ARRAY['manual'::text, 'level'::text, 'streak'::text, 'score'::text, 'missions_completed'::text])))
```

یعنی مکانیزم نشانِ زنجیره‌ای **در schema پیش‌بینی شده و در داده استفاده نشده**.

#### «روز فعال = ورود» — کجا یک ورود واقعاً ثبت می‌شود؟

سه نامزد را جداگانه آزمودم. **هیچ‌کدام امروز «هر کاربر، هر روز» را از سمت برنامه قابل کوئری
نمی‌کند.**

**نامزد ۱ — `auth.audit_log_entries` (GoTrue). تنها جایی که تاریخچهٔ واقعی ورود هست:**

```
$ ... -Atc "select a||' | '||c from (select coalesce(payload->>'action','-') as a, count(*) as c from auth.audit_log_entries group by 1) t order by c desc limit 20;"
token_refreshed | 13754
token_revoked | 4030
login | 997
logout | 117
user_modified | 88
user_confirmation_requested | 27
user_signedup | 9
user_recovery_requested | 6
user_repeated_signup | 2

$ ... -Atc "select 'login_events='||count(*)||' distinct_actors='||count(distinct payload->>'actor_id')||' distinct_days='||count(distinct (created_at at time zone 'Asia/Tehran')::date)||' min='||min(created_at)::date||' max='||max(created_at)::date from auth.audit_log_entries where payload->>'action'='login';"
login_events=997 distinct_actors=27 distinct_days=64 min=2026-05-24 max=2026-09-06
```

داده کامل و دقیقاً به شکل موردنیاز است (کاربر × روز). ولی **در schema `auth` است، نه
`public`**، و هیچ پل عمومی به آن وجود ندارد:

```
$ ... -Atc "select n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and p.prolang<>13 and pg_get_functiondef(p.oid) ~* 'audit_log_entries' order by 1;"
(خالی)

$ ... -Atc "select schemaname||'.'||viewname from pg_views where definition ~* 'audit_log_entries|auth\.sessions' order by 1;"
(خالی)
```

**نامزد ۲ — `profiles.last_seen_at`. وجود دارد، ولی تاریخچه ندارد:**

```
profiles ... last_seen_at timestamp with time zone
$ ... -Atc "select 'presence_logs='||(select count(*) from presence_logs)||' profiles_with_last_seen='||(select count(*) from profiles where last_seen_at is not null)||' profiles='||(select count(*) from profiles);"
presence_logs=10 profiles_with_last_seen=41 profiles=41
```

`src/lib/auth/AuthProvider.tsx:60-72`:

```ts
  // Heartbeat: keep profiles.last_seen_at fresh for online-status indicators.
  useEffect(() => {
    const uid = state.user?.id;
    if (!uid) return;
    const ping = () => {
      void supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", uid);
    };
    ping();
    const id = setInterval(ping, 60_000);
```

**یک ستون است که هر ۶۰ ثانیه بازنویسی می‌شود.** «آیا کاربر X سه‌شنبهٔ گذشته وارد شد؟» از آن
قابل استخراج نیست.

**نامزد ۳ — `audit_logs` با `action='login_success'`. کد آن را می‌فرستد و دیتابیس آن را
ندارد:**

`src/lib/auth/AuthProvider.tsx:74-84`:

```ts
  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      void supabase.rpc("log_event", {
        _entity_type: "auth",
        _entity_id: data.user.id,
        _action: "login_success",
        _diff: { email },
      });
    }
```

```
$ ... -Atc "select 'login_success_rows='||count(*)||' distinct_users='||count(distinct entity_id)||' distinct_days='||count(distinct (created_at at time zone 'Asia/Tehran')::date)||' min='||coalesce(min(created_at)::text,'-')||' max='||coalesce(max(created_at)::text,'-') from audit_logs where action='login_success';"
login_success_rows=0 distinct_users=0 distinct_days=0 min=- max=-

$ ... -Atc "select 'auth_entity_rows='||count(*) from audit_logs where entity_type='auth';"
auth_entity_rows=0
```

و `log_event` **هیچ اعتبارسنجی نوع موجودیت ندارد** که بتواند این را توضیح دهد:

```sql
CREATE OR REPLACE FUNCTION public.log_event(_entity_type text, _entity_id text, _action text, _diff jsonb DEFAULT NULL::jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'forbidden: audit events may only be written by an authenticated caller'
      using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  values (auth.uid(), _entity_type, _entity_id, _action, _diff);
end;
$function$
```

و تنها تریگر روی `audit_logs` ربطی به این ندارد:

```
trg_audit_promotion_used_score :: CREATE TRIGGER ... WHEN ((new.action = 'promotion_suggestion_used'::text)) ...
```

**پس ۹۹۷ ورود واقعی در GoTrue ثبت شده و صفر تا در `audit_logs`.** چرا، `UNKNOWN` — تنها
انشعاب `RAISE` در `log_event` وقتی `auth.uid()` تهی باشد فعال می‌شود، که با یک فراخوان
fire-and-forget بلافاصله پس از `signInWithPassword` سازگار است، ولی من این را اندازه نگرفتم و
حدس نمی‌زنم. آنچه **اندازه‌گیری‌شده** است: **امروز صفر ردیف.** (بند «سؤال‌های باز» F-C1.3)

#### «جمعه زنجیره را نمی‌شکند» — چه ابزاری هست

- **جدول تقویم / تعطیلات: وجود ندارد.**
  ```
  $ ... -Atc "select table_name from information_schema.tables where table_schema='public' and table_name ~* 'holiday|calendar|jalali|working_day|workday' order by 1;"
  (خالی)
  ```
- **`tehran_today()` وجود دارد و منطق تقویمی ندارد:**
  ```sql
  CREATE OR REPLACE FUNCTION public.tehran_today()
   RETURNS date LANGUAGE sql STABLE SET search_path TO 'public'
  AS $function$
    SELECT (now() AT TIME ZONE 'Asia/Tehran')::date;
  $function$
  ```
- `jalali_year(_d date)` هم هست ولی فقط سال می‌دهد.

پس هر بیان «جمعه نمی‌شکند» امروز باید روی `EXTRACT(DOW FROM tehran_today())` بنشیند —
یعنی یک بررسی سخت‌کدشدهٔ روز هفته — چون **هیچ جدول تقویمی برای خواندن نیست**. (اثر:
تعطیلات رسمی ایران به‌جز جمعه پوشش داده نمی‌شوند.)

#### شکل یک «قاعدهٔ `gamification_kpis`» — نقل‌قول شده تا یک قاعدهٔ تازه بتواند تقلید کند

بریف خواسته بود یک ردیف/تعریف موجود نقل شود. **دو مکانیزم مجزا وجود دارد و نباید اشتباه
گرفته شوند.**

**۱) `gamification_kpis` — سنجه‌های وزن‌دار ماهانه (۱۳ ردیف). این XP نمی‌دهد؛ وزن می‌دهد:**

```
$ ... -Atc "select key||' | '||label_fa||' | weight='||weight||' | enabled='||enabled||' | team_scope='||team_scope||' | source='||source||' | unit='||coalesce(unit,'-')||' | direction='||direction||' | order='||display_order from gamification_kpis order by display_order, key;"
inbound_calls | تماس‌های ورودی | weight=1 | enabled=true | team_scope=all | source=call_logs | unit=count | direction=higher_better | order=10
outbound_calls | تماس‌های خروجی | weight=2 | enabled=true | team_scope=all | source=call_logs | unit=count | direction=higher_better | order=20
talk_minutes | مدت مکالمه | weight=0.5 | enabled=true | team_scope=all | source=call_logs | unit=minutes | direction=higher_better | order=30
total_sales | مجموع فروش (ماهانه) | weight=0.0001 | enabled=true | team_scope=all | source=invoices | unit=currency | direction=higher_better | order=40
...
promotions_completed | تبلیغ‌های انجام‌شده | weight=2 | enabled=true | team_scope=all | source=employee_score_events | unit=مورد | direction=higher_better | order=120
```

قیدهایش:

```
gamification_kpis :: gamification_kpis_direction_check :: CHECK ((direction = ANY (ARRAY['higher_better'::text, 'lower_better'::text])))
gamification_kpis :: gamification_kpis_key_key :: UNIQUE (key)
gamification_kpis :: gamification_kpis_team_scope_check :: CHECK ((team_scope = ANY (ARRAY['all'::text, 'sales'::text, 'support'::text, 'manager'::text])))
```

> ستون `source` **هیچ CHECK ندارد** — مقدارهای موجود `call_logs`, `invoices`, `profiles`,
> `derived`, `crm_deals`, `employee_score_events` هستند. **سه ردیف `source='invoices'`
> دارند و جدول `invoices` در migration ۳۳۲ حذف شده** — تناقض ثبت‌شده در بند Contradictions.

**۲) `gamification_kpi_rules` — قاعدهٔ XP به‌ازای رویداد (۹ ردیف مؤثر). این همان چیزی است که
D-44 توصیف می‌کند:**

```
$ ... -Atc "select column_name||' '||data_type||' default='||coalesce(column_default,'-') from information_schema.columns where table_schema='public' and table_name='gamification_kpi_rules' order by ordinal_position;"
id uuid default=gen_random_uuid()
title_fa text default=-
title_en text default=-
description text default=-
event_key text default=-
xp_amount numeric default=0
is_active boolean default=true
sort_order integer default=0
created_at / updated_at timestamptz default=now()
```

**یک ردیف کامل، verbatim، به‌عنوان الگو:**

```json
{"id":"0f23fe24-e34e-4f6e-8c34-56394e41426a","title_fa":"انجام تبلیغ / نامزدی محصول",
 "title_en":"Promotion completed",
 "description":"هر بار که مسئول مارکتینگ از یک پیشنهاد تبلیغ استفاده کند یا محصولی را برای تبلیغ نامزد کند.",
 "event_key":"promotion_completed","xp_amount":15,"is_active":true,"sort_order":120,
 "created_at":"2026-07-26T09:14:18.925735+00:00","updated_at":"2026-07-26T09:14:18.925735+00:00"}
```

**و نقطهٔ مصرفِ آن، که یک قاعدهٔ تازه باید از همان عبور کند:**

```sql
CREATE OR REPLACE FUNCTION public.get_kpi_xp(p_event_key text, p_default numeric)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT xp_amount FROM public.gamification_kpi_rules
      WHERE event_key = p_event_key AND is_active = true LIMIT 1),
    p_default
  );
$function$
```

```
$ ... -Atc "select ... where p.proname<>'get_kpi_xp' and pg_get_functiondef(p.oid) ~* 'get_kpi_xp' order by 1;"
public.auto_submit_penalty
public.award_inquiry_response_score
```

**پس شکل یک قاعدهٔ تازه دقیقاً این است:** یک ردیف `gamification_kpi_rules` با `event_key`
یکتا و `xp_amount`، به‌علاوهٔ **یک صداکنندهٔ تازهٔ `get_kpi_xp('<event_key>', <default>)`** —
چون خودِ ردیف هیچ چیزی را فعال نمی‌کند. صفحهٔ ادمین برای ویرایش این ردیف‌ها موجود است
(`src/routes/_app.gamification.settings.tsx`, و `src/lib/operations/gamification.ts:703-765`
هفت عملیات CRUD روی `gamification_kpi_rules`).

---

### C-2 · `credit_requests` — جدول کامل، مصرف‌کنندهٔ صفر

**Schema:**

```
credit_requests | 1 | id | uuid | nullable=NO | default=gen_random_uuid()
credit_requests | 2 | customer_id | uuid | nullable=NO
credit_requests | 3 | requested_by | uuid | nullable=YES
credit_requests | 4 | requested_amount | numeric | nullable=NO
credit_requests | 5 | status | text | nullable=NO | default='pending'::text
credit_requests | 6 | reviewed_by | uuid | nullable=YES
credit_requests | 7 | notes | text | nullable=YES
credit_requests | 8 | created_at | timestamptz | nullable=NO | default=now()
credit_requests | 9 | updated_at | timestamptz | nullable=NO | default=now()
credit_requests | 10 | customer_person_id | uuid | nullable=NO
```

```
credit_requests :: credit_requests_status_check :: CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
credit_requests :: credit_requests_requested_amount_check :: CHECK ((requested_amount > (0)::numeric))
credit_requests :: credit_requests_customer_person_id_fkey :: FOREIGN KEY (customer_person_id) REFERENCES persons(id) ON DELETE RESTRICT
credit_requests :: credit_requests_requested_by_fkey :: FOREIGN KEY (requested_by) REFERENCES profiles(id)
credit_requests :: credit_requests_reviewed_by_fkey :: FOREIGN KEY (reviewed_by) REFERENCES profiles(id)
```

**نکتهٔ مهم برای D-45: هیچ ستون `reviewed_at` وجود ندارد** و `notes` تنها یک متن است —
یعنی «چرا تأیید شد» و «کِی تأیید شد» جای ذخیره ندارند (به‌جز `updated_at`).

**RLS — و اینجا با D-45 اختلاف دارد:**

```
credit_requests :: cr_insert_sales :: a :: roles=authenticated :: CHECK=has_any_role(auth.uid(), ARRAY['admin','manager','sales','accountant'])
credit_requests :: cr_read_privileged :: r :: roles=PUBLIC :: USING=(has_any_role(auth.uid(), ARRAY['admin','manager','accountant']) OR (has_role(auth.uid(), 'sales') AND (requested_by = auth.uid())))
credit_requests :: cr_update_privileged :: w :: roles=authenticated :: USING=has_any_role(auth.uid(), ARRAY['admin','accountant']) :: CHECK=has_any_role(auth.uid(), ARRAY['admin','accountant'])
credit_requests :: viewer_restricted :: * :: roles=authenticated :: USING=(NOT is_viewer_only(auth.uid())) :: CHECK=(NOT is_viewer_only(auth.uid()))
```

> **D-45 می‌گوید `manager`/`admin` تأیید می‌کنند. policy موجود UPDATE را به
> `admin`/`accountant` می‌دهد — `manager` نمی‌تواند بنویسد، `accountant` می‌تواند.** این یک
> اختلاف واقعی بین تصمیم مالک و RLS زنده است. (F-C2.1)

**تریگرها — هیچ‌کدام گردش کار نیستند:**

```
$ ... -Atc "select tgname from pg_trigger where tgrelid='public.credit_requests'::regclass and not tgisinternal;"
trg_cr_updated
trg_credit_requests_derive_person
```

**هیچ تابع کسب‌وکاری آن را لمس نمی‌کند:**

```
$ ... -Atc "select n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in ('f','p') and p.prolang<>13 and pg_get_functiondef(p.oid) ~* 'credit_requests' order by 1;"
public.person_delete_blockers
public.person_fk_drift_report
public.person_merge
```

هر سه عمومی‌اند و به هستهٔ اشخاص مربوط‌اند، نه به اعتبار. **تأیید `[unwired:T9]`**
(`unwired-inventory-20260905.md:596`: «یک تابع می‌خواند … `UNCLEAR` — از ستون‌هایش نمی‌شود
گفت گردش تأیید کجا قرار بوده اجرا شود») — با تصحیح: **سه** تابع می‌خوانند، و هر سه عمومی‌اند.

**و هیچ خط کدی:**

```
$ grep -rn "credit_requests" src/ e2e/ automation/ | grep -v types.ts
e2e/persons/credit-uses-person.spec.ts:55:    "credit_requests",
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:120:  "credit_requests",
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:315:  "credit_requests",
```

**صفر مرجع در `src/`.** فقط سه ارجاع تست، هر سه صرفاً نام جدول در فهرست‌های امنیتی.

#### تأیید چه می‌کند — پاسخ از روی فرمول زنده

`recompute_dynamic_capital_setting` (خوانده‌شده با `pg_get_functiondef`، **هرگز صدا زده نشد**)
سقف را در دو مرحله می‌سازد. مرحلهٔ آخر، که سقف نهایی را تعیین می‌کند، **این است**:

```sql
  UPDATE _cust_alloc ca
     SET credit_limit = ccp.credit_limit,
         has_overdue = COALESCE(ccp.has_overdue, false),
         has_profile = true
    FROM public.customer_credit_profile ccp
   WHERE ccp.customer_id = ca.customer_id;

  UPDATE _cust_alloc
     SET final_limit = CASE
           WHEN has_overdue THEN 0
           WHEN credit_limit IS NOT NULL AND raw_allocation > credit_limit THEN credit_limit
           ELSE raw_allocation
         END,
         binding_constraint = CASE
           WHEN has_overdue THEN 'overdue'
           WHEN credit_limit IS NOT NULL AND raw_allocation > credit_limit THEN 'credit_limit'
           ELSE 'formula'
         END
   WHERE true;
```

**سه چیز که این ثابت می‌کند:**

1. **یک ورودی دستی از قبل هست و فرمول آن را می‌خواند** — `customer_credit_profile.credit_limit`.
   پس گزینهٔ (b) بریف («ورودی تنظیم دستی که فرمول می‌خواند») **از صفر ساخته نمی‌شود؛ وجود
   دارد.**
2. **ولی به‌عنوان سقف عمل می‌کند، نه کف.** `raw_allocation > credit_limit → credit_limit`.
   بالا بردن `credit_limit` هرگز `final_limit` را از `raw_allocation` بالاتر نمی‌برد؛ فقط یک
   بُرش را برمی‌دارد. **پس یک درخواست تأییدشده که «سقف را بالا ببرد» با این ستون به‌تنهایی
   قابل اجرا نیست.**
3. `binding_constraint` امروز تنها چهار مقدار می‌شناسد: `'formula'`, `'credit_limit'`,
   `'overdue'`, `'floor'` (چهارمی در شاخهٔ صفرکردن). **هیچ مقدار `'override'` یا `'manual'`
   وجود ندارد** — پس گزینهٔ (a) بریف (ستون override که فرمول محترم بشمارد) **یک ستون تازه و
   یک شاخهٔ تازه در همین `CASE` می‌خواهد**، که تعریفاً «مدل سقف دوم» نیست ولی تغییر فرمول است.

**و امروز هیچ‌کدام از این مسیرها فعال نیست، چون جدول ورودی خالی است:**

```
$ ... -Atc "select 'rows='||count(*)||' with_credit_limit='||count(credit_limit)||' with_overdue='||count(*) filter (where has_overdue) from customer_credit_profile;"
rows=0 with_credit_limit=0 with_overdue=0

$ ... -Atc "select b||' | '||c from (select binding_constraint b, count(*) c from customer_capital_allocations_dynamic group by 1) x order by b;"
formula | 35
```

**هر ۳۵ تخصیص `binding_constraint='formula'` است** — یعنی مسیر `credit_limit` تا امروز حتی
یک بار هم اجرا نشده.

**گزینهٔ (c) — «درخواست یک ورودیِ امتیاز را عوض کند»** — از نظر ساختاری ممکن است: فرمول
`weighted_score` را از `calculate_dynamic_score('customer', c.id, capital_date)` می‌گیرد و آن
از `dynamic_entity_scores` می‌خواند که **تنها نویسنده‌اش صفحهٔ ادمین است**
(`[unwired:1.2]`، `unwired-inventory-20260905.md:459-465`). ولی `share_ratio` است: بالا بردن
امتیاز یک مشتری **سهم بقیهٔ مشتریان همان فروشنده را پایین می‌آورد** (مجموع `allocated_capital`
ثابت است). **این هزینه در بریف نیامده و یک تصمیم کسب‌وکاری است، نه فنی.**

**حکم C-2 (پاسخ صریح به «کدام گزینه را کد موجود می‌تواند جذب کند»):**
> **هیچ‌کدام از سه گزینه به‌تنهایی.** (b) نزدیک‌ترین است و ورودی‌اش موجود است، ولی جهت اثر
> برعکس است — سقف است نه کف — پس بدون تغییر همان `CASE` کار نمی‌کند. (a) دقیقاً همان تغییر
> `CASE` را می‌خواهد به‌علاوهٔ یک ستون. (c) بدون تغییر فرمول کار می‌کند ولی سقف دیگران را
> پایین می‌آورد. **کمترین تغییر ساختاری: (a) و (b) در واقع یک چیزند** — افزودن یک شاخهٔ
> `WHEN manual_floor IS NOT NULL AND manual_floor > raw_allocation THEN manual_floor` به همان
> `CASE`، که «مدل سقف دوم» نمی‌سازد چون در همان تابع و همان ستون `final_limit` می‌نشیند.
> **این سند پیاده‌سازی پیشنهاد نمی‌کند؛ فقط می‌گوید کد موجود کجا جا دارد.**

---

### C-3 · `person_field_definitions` — لایهٔ داده و سرور کامل، لایهٔ UI صفر

**«جدول مقادیر» که بریف به‌عنوان یک فرضیه پرسیده بود، وجود دارد:**

```
person_field_values | 1 | id | uuid | nullable=NO | default=gen_random_uuid()
person_field_values | 2 | person_id | uuid | nullable=NO
person_field_values | 3 | field_definition_id | uuid | nullable=NO
person_field_values | 4 | value | jsonb | nullable=NO
person_field_values | 5 | updated_by | uuid | nullable=YES
person_field_values | 6 | updated_at | timestamptz | nullable=NO | default=now()
```

```
person_field_values :: person_field_values_person_id_field_definition_id_key :: UNIQUE (person_id, field_definition_id)
person_field_values :: person_field_values_person_id_fkey :: FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
person_field_values :: person_field_values_field_definition_id_fkey :: FOREIGN KEY (field_definition_id) REFERENCES person_field_definitions(id) ON DELETE RESTRICT
```

**Schema تعریف‌ها + CHECK نوع — پاسخ مستقیم به «پنج نوع»:**

```
person_field_definitions | 1..14 | id, name, label, field_type, options(jsonb), is_required,
  is_active, sort_order, help_text, validation_regex, applies_to_kind, created_by, created_at, updated_at
```

```
person_field_definitions :: person_field_definitions_field_type_chk :: CHECK ((field_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'bool'::text, 'select'::text, 'multiselect'::text, 'jsonb'::text])))
person_field_definitions :: person_field_definitions_applies_to_kind_chk :: CHECK ((applies_to_kind = ANY (ARRAY['individual'::text, 'organization'::text, 'both'::text])))
person_field_definitions :: person_field_definitions_name_key :: UNIQUE (name)
person_field_definitions :: person_field_definitions_label_not_blank :: CHECK ((length(btrim(label)) > 0))
person_field_definitions :: person_field_definitions_name_not_blank :: CHECK ((length(btrim(name)) > 0))
```

> **پاسخ به D-46:** بله، ستون `field_type` با CHECK وجود دارد. **هفت مقدار مجاز است، نه
> پنج.** پنج نوع خواسته‌شدهٔ مالک هر پنج پوشش داده می‌شوند — با یک تفاوت نام: مالک
> «boolean» گفته، schema `'bool'` دارد. دو نوع اضافه (`multiselect`, `jsonb`) در CHECK
> هستند و در D-46 نیامده‌اند. `options jsonb` و `validation_regex` هم از قبل هستند.

**RLS — و اینجا هم با D-46 اختلاف دارد:**

```
person_field_definitions :: pfd_insert_admin_manager :: a :: CHECK=has_any_role(auth.uid(), ARRAY['admin','manager'])
person_field_definitions :: pfd_update_admin_manager :: w :: USING/CHECK=has_any_role(auth.uid(), ARRAY['admin','manager'])
person_field_definitions :: pfd_select_active_all_authed :: r :: USING=((is_active = true) OR has_any_role(auth.uid(), ARRAY['admin','manager']))
```

> **D-46 می‌گوید «تعریف فقط ادمین». RLS زنده به `manager` هم اجازهٔ تعریف می‌دهد.** (F-C3.1)
> **و هیچ policy برای DELETE روی `person_field_definitions` وجود ندارد** (سه policy، هیچ‌کدام
> `d`) — در حالی که `person_field_values` policy حذف دارد.

**اعتبارسنجی — یک تریگر هست، ولی نوع را بررسی نمی‌کند:**

```
$ ... -Atc "select tgrelid::regclass::text||' :: '||tgname from pg_trigger where tgrelid in ('public.person_field_values'::regclass,'public.person_field_definitions'::regclass) and not tgisinternal;"
person_field_definitions :: trg_pfd_audit
person_field_definitions :: trg_pfd_updated_at
person_field_values :: trg_pfv_audit
person_field_values :: trg_pfv_updated_at
person_field_values :: trg_pfv_validate
```

بدنهٔ `validate_person_field_value` سه چیز را چک می‌کند و **نوع مقدار جزو آن‌ها نیست**:

```sql
  IF v_def_active = false THEN
    RAISE EXCEPTION 'person_field_values: field definition % is inactive', NEW.field_definition_id
  ...
  IF v_def_kind <> 'both' AND v_def_kind <> v_person_kind THEN
    RAISE EXCEPTION 'person_field_values: applies_to_kind (%) does not match person.kind (%)',
```

**هیچ بررسی‌ای که `value` با `field_type` بخواند، و هیچ اعمالی از `options` یا
`validation_regex`.** پس یک فیلد `number` می‌تواند مقدار `"سلام"` بگیرد. (F-C3.2)

**«کدام خواننده‌ها آماده‌اند» — پاسخ دقیق:**

```
$ grep -rln "person_field" src/ --include=*.tsx --include=*.ts | grep -v types.ts
src/lib/persons/functions.ts
src/lib/persons/schemas.ts
```

**دو فایل. هر دو کتابخانهٔ سرور. هیچ فایل `.tsx`، هیچ کامپوننت، هیچ route.**

```
$ ls src/components/persons/
ExistingPersonPrompt.tsx  PersonAliasesManager.tsx  PersonAuditSummary.tsx
PersonCollisionPanel.tsx  PersonContextLinksForm.tsx  PersonDeepLinks.tsx
PersonForm.tsx  PersonIdentifiersForm.tsx  PersonMergePanel.tsx
PersonModal.tsx  PersonRoleCrossLinks.tsx
```

هیچ‌کدام نام `person_field` را نمی‌برد.

**چیزی که *واقعاً* آماده است — و کم نیست:** `getPerson` **مقادیر را برمی‌گرداند** و صفحهٔ
پروفایل آن‌ها را دور می‌ریزد. `src/lib/persons/functions.ts` (تابع `getPerson`):

```ts
      const { data: fvRows, error: fvErr } = await supabase
        .from("person_field_values")
        .select("id, person_id, field_definition_id, value, updated_at")
        .eq("person_id", data.id);
      if (fvErr) throw mapPgError(fvErr.code, fvErr.message);

      return {
        ...(personRow as PersonDTO),
        field_values: (fvRows as PersonFieldValueDTO[]) ?? [],
      };
```

`updatePerson` هم upsert می‌کند:

```ts
      const upserted: PersonFieldValueDTO[] = [];
      if (input.field_values) {
        for (const fv of input.field_values) {
          const { data: row, error } = await supabase
            .from("person_field_values")
            .upsert(
              { person_id: person.id, field_definition_id: fv.field_definition_id, value: fv.value as never },
              { onConflict: "person_id,field_definition_id" },
            )
```

و `createPerson` از راه `person_create_full()` می‌نویسد، با اعتبارسنجی سمت دیتابیس.
**ولی صفحهٔ ساخت شخص همیشه آرایهٔ خالی می‌فرستد** — `src/routes/_app.persons_.create.tsx:63`:

```
            field_values: [],
```

و صفحه‌های پروفایل/ویرایش/فهرست هیچ ارجاعی به فیلد ندارند:

```
$ grep -n "field" src/routes/_app.persons_.\$personId.tsx src/routes/_app.persons_.\$personId_.edit.tsx src/routes/_app.persons_.create.tsx src/routes/_app.persons.tsx
src/routes/_app.persons_.$personId_.edit.tsx:180:          <fieldset disabled={!canManage} className="space-y-4">
src/routes/_app.persons_.$personId_.edit.tsx:194:          </fieldset>
src/routes/_app.persons_.create.tsx:63:            field_values: [],
```

(دو تای اول `<fieldset>` HTML هستند، نه فیلد سفارشی.)

**سه تابع دیتابیسی هم آماده‌اند** — تصحیح `[unwired:T16]` که «۲ تابع» گفته بود:

```
$ ... where pg_get_functiondef(p.oid) ~* 'person_field_definitions'
public.audit_person_field_definitions
public.person_create_full
public.validate_person_field_value

$ ... where pg_get_functiondef(p.oid) ~* 'person_field_values'
public.audit_person_field_values
public.person_create_full
public.person_merge
public.validate_person_field_value
```

`person_merge` هم مقادیر را در ادغام اشخاص جابه‌جا می‌کند، و `person_field_values.person_id`
در رجیستری FK ثبت است (زیر C-4).

---

### C-4 · دو دفتر held — و یک مدل سومی که بریف نامش را نبرده

**`capital_allocation_ledger` — صفر ردیف، صفر نویسنده، صفر FK:**

```
capital_allocation_ledger :: capital_allocation_ledger_pkey :: p :: PRIMARY KEY (id)
capital_allocation_ledger :: capital_allocation_ledger_allocation_kind_check :: c :: CHECK ((allocation_kind = ANY (ARRAY['customer'::text, 'salesperson'::text])))
capital_allocation_ledger :: capital_allocation_ledger_transaction_type_check :: c :: CHECK ((transaction_type = ANY (ARRAY['hold'::text, 'release'::text, 'consume'::text, 'refund'::text])))
```

**این تمام فهرست قیدهای آن است — هیچ FOREIGN KEY، به هیچ جدولی.** پس:

> **پاسخ صریح به «آیا FK به `persons` دارد؟» — نه.** `allocation_id` یک `uuid` بدون FK است
> (چون polymorphic است و به دو جدول اشاره می‌کند)، `actor_id` هم FK ندارد.
> **و در رجیستری `person_merge` هم نیست:**
>
> ```
> $ ... -Atc "select * from public.person_fk_registry_report();"
> allocation_rows.beneficiary_person_id|t|t|ok
> ...
> credit_requests.customer_person_id|t|t|ok
> customer_capital_allocations_dynamic.customer_person_id|t|t|ok
> customer_credit_balance.customer_person_id|t|t|ok
> customer_credit_ledger.customer_person_id|t|t|ok
> customer_credit_profile.customer_person_id|t|t|ok
> ...
> person_field_values.person_id|t|t|ok
> ...
> (۳۱ ردیف، همه `ok`؛ `capital_allocation_ledger` در فهرست نیست)
> ```
>
> **بنابراین ترتیب migration که `CLAUDE.md` قاعدهٔ ۹ تحمیل می‌کند اینجا اعمال نمی‌شود** —
> گیت رویداد ۳۲۸ روی `DROP TABLE` این جدول فعال نمی‌شود، چون نه FK دارد و نه کلید رجیستری.
> **`DROP TABLE` از این نظر بی‌مانع است.** (ولی بند بعد یک مانع دیگر پیدا می‌کند.)

**هیچ FK از بیرون به آن اشاره نمی‌کند:**

```
$ ... -Atc "select conrelid::regclass::text||' :: '||conname from pg_constraint where confrelid='public.capital_allocation_ledger'::regclass;"
(خالی)
```

**خواننده‌ها — و اینجا پژوهش قبلی ناقص بود:**

```
$ ... -Atc "select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in ('f','p') and p.prolang<>13 and pg_get_functiondef(p.oid) ~* 'capital_allocation_ledger' order by 1;"
public._capital_alloc_used(p_kind text, p_alloc_id uuid, OUT held numeric, OUT consumed numeric)
public.is_valid_audit_entity_type(_entity_type text)
public.recompute_dynamic_capital_setting(p_setting_id uuid, p_reason text)

$ ... -Atc "select schemaname||'.'||viewname from pg_views where definition ~* 'capital_allocation_ledger';"
(خالی)
$ ... -Atc "select schemaname||'.'||matviewname from pg_matviews where definition ~* 'capital_allocation_ledger';"
(خالی)
```

**سه خواننده، نه یکی:**

1. `_capital_alloc_used` — همان که بریف می‌گوید:

   ```sql
   SELECT
     COALESCE(SUM(CASE WHEN transaction_type='hold' THEN amount
                       WHEN transaction_type='release' THEN -amount ELSE 0 END), 0),
     COALESCE(SUM(CASE WHEN transaction_type='consume' THEN amount
                       WHEN transaction_type='refund' THEN -amount ELSE 0 END), 0)
     INTO held, consumed
   FROM public.capital_allocation_ledger
   WHERE allocation_kind = p_kind AND allocation_id = p_alloc_id;
   ```

2. `is_valid_audit_entity_type` — فقط رشتهٔ `'capital_allocation_ledger'` در آرایهٔ انواع
   مجاز ممیزی است، نه یک خواندن واقعی از جدول. (بی‌اثر — `[unwired:F30]`.)

3. **`recompute_dynamic_capital_setting` — و این خواننده مهم است.** فرمول قبل از هر
   محاسبه‌ای این را اجرا می‌کند:

   ```sql
   SELECT count(*) INTO v_locked_ledger
     FROM public.capital_allocation_ledger l
    WHERE ( l.allocation_kind = 'customer' AND EXISTS (
             SELECT 1 FROM public.customer_capital_allocations_dynamic c
              WHERE c.id = l.allocation_id AND c.capital_setting_id = p_setting_id ) )
       OR ( l.allocation_kind = 'salesperson' AND EXISTS ( ... ) );

   IF v_locked_ledger > 0 THEN
     INSERT INTO public.audit_logs(...) VALUES (..., 'dynamic_capital_recompute_skipped', ...);
     RETURN jsonb_build_object('skipped', true, 'reason', 'ledger_exists', ...);
   END IF;
   ```

   **یعنی `capital_allocation_ledger` امروز نقش «قفل» را بازی می‌کند:** اگر ردیفی داشته باشد،
   بازمحاسبهٔ سقف‌ها **رد می‌شود** تا رزروهای انجام‌شده نابود نشوند. حذف جدول این محافظ را
   حذف می‌کند — و چون امروز صفر ردیف دارد، محافظ **هرگز فعال نشده**، ولی نیّتش در کد صریح
   است. **این را نمی‌شود «فقط تغییر منبع `held_amount`» نامید.** (F-C4.1)

**دو view، نه یکی، از `_capital_alloc_used` استفاده می‌کنند:**

```
$ ... -Atc "select schemaname||'.'||viewname from pg_views where definition ~* '_capital_alloc_used';"
public.v_dynamic_customer_capital_balances
public.v_dynamic_salesperson_capital_balances
```

`v_dynamic_customer_capital_balances` (بخش مربوطه):

```sql
   FROM customer_capital_allocations_dynamic c
     CROSS JOIN LATERAL _capital_alloc_used('customer'::text, c.id) u(held, consumed)
  ...
  WHERE auth.uid() IS NOT NULL AND NOT is_viewer_only(auth.uid());
```

> **D-47 فقط دربارهٔ مشتری حرف می‌زند. سمت فروشنده هم از همین جدول می‌خواند و
> `customer_credit_ledger` هیچ معادلی برای `allocation_kind='salesperson'` ندارد** —
> `customer_credit_ledger` ستون `customer_id` دارد، نه `salesperson_id`. پس D-47 برای
> `v_dynamic_salesperson_capital_balances` **هیچ جانشینی نمی‌گذارد**. (F-C4.2)

**خوانندهٔ کد — یکی، و در همان hook:**

```
$ grep -rn "customer_credit_ledger|_capital_alloc_used|v_dynamic_customer_capital_balances" src/ e2e/ | grep -v types.ts
src/hooks/capital/useDynamicCapital.ts:170:        .from("v_dynamic_customer_capital_balances")
e2e/persons/credit-unchanged.spec.ts:44:    "customer_credit_ledger",
e2e/persons/credit-uses-person.spec.ts:61:    "customer_credit_ledger",
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:128 / :324:  "customer_credit_ledger",
e2e/security/og77-view-callers-can-execute-what-views-call.spec.ts:36  (کامنت دربارهٔ _capital_alloc_used)
e2e/security/viewer-restrictions.spec.ts:41 / :59
```

`src/hooks/capital/useDynamicCapital.ts:43` — کامنت خودِ کد:

```
  /** Item 141.3 — folded from capital_allocation_ledger. */
  held_amount: number;
```

**یک تست e2e هم مستقیماً SQL می‌زند** —
`e2e/business-flows/213-dynamic-customer-credit-scoring.spec.ts:399`:

```
      'ledger_rows', (
        SELECT count(*) FROM public.capital_allocation_ledger l
         WHERE EXISTS ( ... )
```

**پس حذف جدول این تست را می‌شکند.** (شمارش کامل خواننده‌ها در بخش Numbers.)

#### آیا `customer_credit_ledger` جای آن را می‌گیرد؟

**CHECK آن پنج نوع تراکنش دارد، و `hold`/`release` جزو آن‌هاست:**

```
customer_credit_ledger :: customer_credit_ledger_transaction_type_check :: c :: CHECK ((transaction_type = ANY (ARRAY['hold'::text, 'release'::text, 'charge'::text, 'payment'::text, 'adjustment'::text])))
```

**و `hold_credit`/`release_credit` واقعاً همان دو نوع را می‌نویسند** (از بدنهٔ زنده):

```sql
  INSERT INTO public.customer_credit_ledger
    (customer_id, customer_person_id, transaction_type, amount,
     balance_before, balance_after, reference_type, reference_id, created_by)
  VALUES (p_customer_id, _person, 'hold', p_amount,
          COALESCE(_held, 0), _new_held, 'sales_quote', p_invoice_id, _actor);
```

```sql
  VALUES (p_customer_id, _person, 'release', _release,
          COALESCE(_held, 0), _new_held, 'payment_receipt', p_invoice_id, _actor);
```

**پس بله — یک جمع `hold` منهای `release` وجود دارد که با شکل `_capital_alloc_used`
هم‌ریخت است.** ولی امروز صفر است:

```
$ ... -Atc "select t||' | '||c||' | sum='||s from (select transaction_type t, count(*) c, sum(amount) s from customer_credit_ledger group by 1) x order by t;"
adjustment | 2 | sum=11000.00
payment | 5 | sum=10225011000.00
```

**هفت ردیف، و هیچ‌کدام `hold` یا `release` نیست.** یعنی امروز `held_amount` چه از دفتر
قدیم بخواند چه از جدید، **صفر می‌شود** — تغییر D-47 امروز رفتار را عوض نمی‌کند.

**و یک تفاوت کلیدی که باید ثبت شود: کلید پیوند فرق می‌کند.**
`capital_allocation_ledger` روی `allocation_id` (یک ردیف از `customer_capital_allocations_dynamic`)
جمع می‌زند؛ `customer_credit_ledger` روی `customer_id` جمع می‌زند. **یک مشتری در چند snapshot
سرمایه چند `allocation_id` دارد** — پس جمع روی `customer_id` **همهٔ رزروهای همهٔ روزها** را
به هر ردیف view می‌چسباند، در حالی که جمع فعلی مخصوص یک snapshot است. (F-C4.3)

#### مدل سومی که بریف نامش را نبرده — و همان است که واقعاً کار می‌کند

`get_customer_dynamic_credit` (خوانده‌شده، **صدا زده نشد**) — مسیر زندهٔ اعتبار:

```sql
  SELECT COALESCE(b.held_credit, 0) INTO v_held
  FROM public.customer_credit_balance b
  WHERE b.customer_person_id = _person_id;
  ...
  RETURN QUERY SELECT
    GREATEST(v_final_limit - COALESCE(v_outstanding, 0) - COALESCE(v_held, 0), 0)::numeric AS available_credit,
```

```
$ ... -Atc "select 'rows='||count(*)||' sum_held='||coalesce(sum(held_credit)::text,'-')||' nonzero_held='||count(*) filter (where held_credit<>0) from customer_credit_balance;"
rows=25 sum_held=0.00 nonzero_held=0
```

**پس امروز سه مدل «held» موازی وجود دارد:**

| # | منبع | خواننده | مقدار امروز |
|---|---|---|---|
| ۱ | `customer_credit_balance.held_credit` (ستون) | `get_customer_dynamic_credit` → کل UI اعتبار و `hold_credit` | ۰ (۲۵ ردیف، همه صفر) |
| ۲ | `capital_allocation_ledger` (جمع hold−release) | `_capital_alloc_used` → دو view | ۰ (۰ ردیف) |
| ۳ | `customer_credit_ledger` (جمع hold−release) | **هیچ‌کس** — فقط نوشته می‌شود | ۰ (۰ ردیف hold) |

`hold_credit` **هم‌زمان ۱ و ۳ را می‌نویسد** (`UPDATE customer_credit_balance … held_credit` و
سپس `INSERT … customer_credit_ledger`). **پس D-47 «۲ را به ۳ ببر» می‌گوید، در حالی که ۱
پاسخِ همان سؤال است و از قبل خوانده می‌شود.** خواندن مستقیم `customer_credit_balance.held_credit`
سه مدل را به دو مدل می‌رساند؛ D-47 آن‌طور که نوشته شده سه را به سه نگه می‌دارد و فقط مصرف‌کننده
را عوض می‌کند. **این یک مشاهده است، نه پیشنهاد پیاده‌سازی.** (F-C4.4)

---

### C-5 · جدول ایستای دسترسی — سازوکار امروز

`src/lib/rbac/roles.ts` — ۳۳۹ خط، خوانده‌شده به‌طور کامل. ساختارش:

- `AppRole` (۷ نقش، خطوط ۱۶-۲۳) و `ALL_ROLES` (۵ نقش، خط ۳۳)
- `ModuleKey` — **۲۷ ماژول** (خطوط ۶۴-۹۱)
- `PERMISSIONS: Record<ModuleKey, Record<Action, AppRole[]>>` — **خط ۹۸ تا ۲۷۸**، ماتریس ایستا
- `hasPermission(roles, module, action)` — خط ۲۸۰-۲۸۲، **فقط ایستا، بدون هیچ خواندنی از دیتابیس**
- `hasPermissionEx(roles, module, action)` — خط ۲۹۹-۳۳۴، **جدول زنده اول، ایستا به‌عنوان fallback**

**نقطهٔ دقیقی که «همیشه زنده بخوان» باید تغییرش دهد — `roles.ts:305-322`:**

```ts
  const rows = getCachedRolePermissions();
  const matched = rows.filter(
    (r) => (roles as string[]).includes(r.role_name) && r.module === module,
  );
  if (matched.length > 0) {
    ...
    return matched.some((r) => Boolean((r as any)[col]));
  }
  // Fallback to static
  if (action === "view" || action === "create" || action === "update" || action === "delete") {
    return (
      PERMISSIONS[module as ModuleKey]?.[action]?.some((r) => (roles as string[]).includes(r)) ??
      false
    );
  }
```

**fallback فقط وقتی فعال می‌شود که `matched.length === 0`** — یعنی جدول زنده هیچ ردیفی برای
آن (نقش، ماژول) نداشته باشد، یا cache خالی باشد.

**cache از قبل TTL دارد** — `src/lib/rbac/dynamic-permissions.ts:21-24`:

```ts
const CACHE_TTL_MS = 5 * 60 * 1000;
const PERMISSIONS_TIMEOUT_MS = 10_000;
let cache: { rows: RolePermissionRow[]; ts: number } | null = null;
let inflight: Promise<RolePermissionRow[]> | null = null;
```

و در خطا **قدیمی را نگه می‌دارد، خالی نمی‌کند**:

```ts
      if (error) {
        inflight = null;
        return cache?.rows ?? [];
      }
```

**و `requirePermission` از قبل منتظر بارگذاری می‌ماند** —
`src/lib/rbac/route-guards.ts` (داخل `requirePermission`):

```ts
  const roles = auth.roles as AppRole[];
  // Ensure dynamic permissions cache is populated before checking.
  await loadRolePermissions();

  if (!hasPermissionEx(roles, module, action)) {
```

**و AuthProvider هم پیش‌بارگذاری می‌کند** — `src/lib/auth/AuthProvider.tsx:56-59`:

```ts
    if (state.user && !state.rolesLoading) {
      void loadRolePermissions();
    }
```

**و `RouteRoleGate` از قبل حالت بارگذاری دارد** —
`src/components/layout/RouteRoleGate.tsx` (سه شاخهٔ صریح):

```tsx
  // 1. The answer is not known yet. Hold. Never render the page, and never call this a denial.
  if (rolesLoading || profileLoading || loading) {
    return (
      <div className="p-6 text-muted-foreground" data-testid="route-gate-checking">
        در حال بررسی دسترسی…
      </div>
    );
  }
  ...
  if (rolesError) { ... data-testid="route-gate-roles-error" ... }
  ...
  const failed = gates.find((g) => !passes(g, roles as AppRole[]));
  if (failed) { ... data-testid="route-gate-denied" ... }
```

**پس پاسخ به «چه چیزی حین پنجرهٔ بارگذاری می‌شکند»:**
- در `beforeLoad` (مسیرهای `requirePermission`): **هیچ چیز** — `settleRoles()` منتظر می‌ماند و
  مسیر در حالت pending می‌ماند. کامنت بلند `route-guards.ts` این را توضیح می‌دهد و
  `RouteRoleGate.tsx` هم آن را «CORRECTION, wave 2» ثبت کرده.
- در `RouteRoleGate` (۶۴ مسیر دارای `gate:`): **یک spinner متنی** — «در حال بررسی دسترسی…»
  با `data-testid="route-gate-checking"`. نه فلش صفحه، نه فلش رد.
- **در منو و کامپوننت‌ها: فلش هست.** `AppSidebar`, `MobileBottomNav`,
  `NavigationCommandPalette` و `FinanceHub` همگی از `isNavigationEntry*` استفاده می‌کنند که
  `hasPermissionEx` را **بدون await** صدا می‌زند (یک render نمی‌تواند await کند). امروز
  fallback ایستا آن پنجره را پر می‌کند. **حذف آن، پنجره را به «منوی خالی سپس پرشدن» تبدیل
  می‌کند** — یعنی فلش، در جهت محافظه‌کارانه.
- `RouteRoleGate.tsx` خودش این را از قبل به‌عنوان دلیل *نداشتن* `kind: "permission"` نوشته:
  > *«`requirePermission` does `await loadRolePermissions()` FIRST, while a React render cannot
  > await, so an unpopulated dynamic cache makes `hasPermissionEx` fall through to the STATIC
  > permission table (`roles.ts` — "Fallback to static").»*

**۱۳ ماژول واگرا — و اندازه‌گیری من ۱۶ می‌دهد.** بند Contradictions.

---

## آنچه باید ساخته شود — با جست‌وجویی که چیزی نیافت

هر ردیف زیر یک ادعای «وجود ندارد» است، با دستوری که خالی برگشت.

### C-1

| باید ساخته شود | جست‌وجویی که چیزی نیافت |
|---|---|
| **نویسندهٔ `employee_streaks`** (هر شکلی) | `select … from pg_proc … where pg_get_functiondef(p.oid) ~* 'employee_streaks'` → **خالی**؛ `grep -rn "employee_streaks" src/ automation/` → تنها `gamification.ts:436` که `.select()` است |
| **policy نوشتن روی `employee_streaks`** | `pg_policy` روی این جدول → **۱ policy، `polcmd='r'`**؛ هیچ `a`/`w`/`d` |
| **منبع «روز فعال» قابل کوئری از `public`** | `select … from pg_proc … ~* 'audit_log_entries'` → **خالی**؛ `select … from pg_views where definition ~* 'audit_log_entries\|auth\.sessions'` → **خالی**؛ `select count(*) from audit_logs where action='login_success'` → **۰**؛ `select count(*) from audit_logs where entity_type='auth'` → **۰** |
| **تاریخچهٔ روزانهٔ حضور** | `information_schema.tables where table_name ~* 'session\|presence\|login\|last_seen\|activity\|attendance'` → تنها `auth.sessions`, `public.presence_logs` (۱۰ ردیف، clock-in/out دستی), `public.pricing_board_viewer_sessions` |
| **جدول تعطیلات/تقویم برای D-43** | `information_schema.tables where table_name ~* 'holiday\|calendar\|jalali\|working_day\|workday'` → **خالی** |
| **تابع روز-هفته یا تعطیلات** | `pg_proc where proname ~* 'tehran\|jalali\|persian_date\|friday\|weekday'` → تنها `jalali_year(date)` و `tehran_today()`، هیچ‌کدام منطق تعطیلات ندارند |
| **صداکنندهٔ `get_kpi_xp` برای یک event زنجیره‌ای** | صداکننده‌های موجود: `auto_submit_penalty`، `award_inquiry_response_score` — هیچ‌کدام دربارهٔ زنجیره نیست؛ و در `gamification_kpi_rules` هیچ `event_key` شبیه `streak`/`login`/`active_day` نیست (فهرست کامل ۱۱ ردیف بالا) |
| **قاعدهٔ خودکار برای نشان‌های زنجیره** | هر ۱۰ ردیف `achievements` دارای `rule_type='manual'` و `rule_value=NULL` — با اینکه CHECK مقدار `'streak'` را می‌پذیرد |

### C-2

| باید ساخته شود | جست‌وجویی که چیزی نیافت |
|---|---|
| **هر مصرف‌کنندهٔ `credit_requests` در برنامه** | `grep -rn "credit_requests" src/` → **صفر**؛ فقط ۳ ارجاع در `e2e/` که نام جدول در فهرست امنیتی است |
| **تابع/گردش تأیید** | `pg_proc … ~* 'credit_requests'` → `person_delete_blockers`, `person_fk_drift_report`, `person_merge` — هر سه عمومی هستهٔ اشخاص |
| **تریگر گردش کار** | `pg_trigger` روی `credit_requests` → `trg_cr_updated`, `trg_credit_requests_derive_person` (به‌ترتیب `updated_at` و اشتقاق `person_id`) |
| **ستون override در سقف** | ستون‌های `customer_capital_allocations_dynamic`: `capital_setting_id, customer_id, salesperson_id, weighted_score, share_ratio, raw_allocation, final_limit, binding_constraint, created_at, customer_person_id` — **هیچ ستون override/manual/approved** |
| **مقدار `binding_constraint` برای override** | تنها مقادیر تولیدشده در بدنهٔ `recompute_dynamic_capital_setting`: `'formula'`, `'credit_limit'`, `'overdue'`, `'floor'` |
| **هر مفهوم override در لایهٔ اعتبار** | `grep -rin "override" src/lib/rbac/ src/hooks/capital/ src/hooks/credit/` → **خالی** |
| **`reviewed_at` روی درخواست** | فهرست کامل ۱۰ ستون `credit_requests` بالا — نیست |

### C-3

| باید ساخته شود | جست‌وجویی که چیزی نیافت |
|---|---|
| **هر UI برای فیلد سفارشی** (تعریف یا نمایش یا فیلتر) | `grep -rln "person_field" src/ --include=*.tsx --include=*.ts \| grep -v types.ts` → **تنها `src/lib/persons/functions.ts` و `src/lib/persons/schemas.ts`**؛ هیچ `.tsx` |
| **رندر فیلد در پروفایل شخص** | `grep -n "field" src/routes/_app.persons_.$personId.tsx` → **خالی** |
| **فیلتر فهرست بر فیلد سفارشی** | `grep -n "field" src/routes/_app.persons.tsx` → **خالی** |
| **ارسال مقدار از صفحهٔ ساخت** | `src/routes/_app.persons_.create.tsx:63` → `field_values: []` — همیشه خالی |
| **اعتبارسنجی نوعِ مقدار** | بدنهٔ `validate_person_field_value` (کامل، بالا نقل شد) — سه چک: تعریف موجود، تعریف فعال، تطابق `applies_to_kind`. **هیچ مقایسه‌ای با `field_type`، `options` یا `validation_regex`** |
| **policy حذف تعریف** | سه policy روی `person_field_definitions`، `polcmd` ∈ {`a`,`w`,`r`} — **هیچ `d`** |

### C-4

| باید ساخته شود | جست‌وجویی که چیزی نیافت |
|---|---|
| **جانشین ledger برای سمت فروشنده** | `customer_credit_ledger` ستون‌ها: `customer_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by, created_at, customer_person_id` — **هیچ `salesperson_id`، هیچ `allocation_kind`**؛ و `v_dynamic_salesperson_capital_balances` از `_capital_alloc_used('salesperson', …)` می‌خواند |
| **جانشین برای «قفل بازمحاسبه»** | متن `v_locked_ledger` تنها در `recompute_dynamic_capital_setting` است؛ هیچ ستون یا جدول دیگری وضعیت «قفل» را نگه نمی‌دارد |
| **کلید `allocation_id` در دفتر جانشین** | `customer_credit_ledger.reference_type` مقادیرش از بدنهٔ `hold_credit`/`release_credit` `'sales_quote'` و `'payment_receipt'` است — **نه `'capital_allocation'`** |

### C-5

| باید ساخته شود | جست‌وجویی که چیزی نیافت |
|---|---|
| **مسیر همگام (sync) برای خواندن زنده در render** | `getCachedRolePermissions()` تنها API همگام است و از یک متغیر ماژول می‌خواند (`permissions-cache.ts`، ۲۲ خط، بدون I/O) — هیچ SSR preload، هیچ router loader که `role_permissions` را بیاورد |
| **ردیف برای ۳ ترکیب نقش×ماژول** | خروجی دتکتور: `purchase_specialist\|persons`, `site\|persons`, `site\|warehouse` — این سه دقیقاً جایی هستند که امروز **fallback ایستا تنها منبع تصمیم است** |
| **ماژول `ledger-documents` در `ModuleKey`** | جدول زنده ۲۸ ماژول دارد، `ModuleKey` ۲۷ تا. خروجی دتکتور: `LIVE MODULE NOT IN STATIC ModuleKey: ledger-documents` |

---

## نقاط اتصال (hook points) — file:line

| # | نقطه | file:line | چه چیزی آنجاست |
|---|---|---|---|
| H1 | خوانندهٔ زنجیره | `src/lib/operations/gamification.ts:432-440` | `listEmployeeStreaks()` — تنها مصرف‌کنندهٔ `employee_streaks` |
| H2 | ارسال رویداد ورود | `src/lib/auth/AuthProvider.tsx:74-84` | `signIn` → `supabase.rpc("log_event", {_action:"login_success"})` — که امروز صفر ردیف می‌سازد |
| H3 | ضربان حضور | `src/lib/auth/AuthProvider.tsx:60-72` | `profiles.last_seen_at` هر ۶۰ ثانیه |
| H4 | نقطهٔ مصرف XP | `public.get_kpi_xp(p_event_key, p_default)` (تابع دیتابیس) | هر قاعدهٔ تازه از این عبور می‌کند |
| H5 | CRUD قواعد XP | `src/lib/operations/gamification.ts:703-765` | هفت عملیات روی `gamification_kpi_rules` |
| H6 | صفحهٔ تنظیمات gamification | `src/routes/_app.gamification.settings.tsx:163` | ویرایشگر همان ردیف‌های `gamification_kpis` |
| H7 | فرمول سقف — شاخهٔ تصمیم | بدنهٔ `public.recompute_dynamic_capital_setting`، بلوک `UPDATE _cust_alloc SET final_limit = CASE …` | تنها جایی که `final_limit` تعیین می‌شود |
| H8 | فرمول سقف — قفل ledger | بدنهٔ همان تابع، بلوک `SELECT count(*) INTO v_locked_ledger … IF v_locked_ledger > 0 THEN … RETURN … 'skipped'` | خوانندهٔ سوم `capital_allocation_ledger` |
| H9 | مسیر زندهٔ اعتبار | بدنهٔ `public.get_customer_dynamic_credit` | `available_credit = GREATEST(final_limit − outstanding − held_credit, 0)` |
| H10 | نویسندهٔ held | بدنهٔ `public.hold_credit` / `public.release_credit` | هم `customer_credit_balance.held_credit` و هم `customer_credit_ledger` |
| H11 | جمع held قدیمی | بدنهٔ `public._capital_alloc_used` | `SUM(hold) − SUM(release)` روی `capital_allocation_ledger` |
| H12 | view مشتری | `public.v_dynamic_customer_capital_balances` | `CROSS JOIN LATERAL _capital_alloc_used('customer', c.id)` |
| H13 | view فروشنده | `public.v_dynamic_salesperson_capital_balances` | همان، با `'salesperson'` — بدون جانشین در D-47 |
| H14 | مصرف‌کنندهٔ view | `src/hooks/capital/useDynamicCapital.ts:170` و کامنت `:43` | `.from("v_dynamic_customer_capital_balances")` |
| H15 | تست وابسته به ledger | `e2e/business-flows/213-dynamic-customer-credit-scoring.spec.ts:399` | `SELECT count(*) FROM public.capital_allocation_ledger l` |
| H16 | لایهٔ سرور فیلد سفارشی | `src/lib/persons/functions.ts` — `getPerson` / `updatePerson` / `createPerson` / `validateRequiredPersonFields:150-193` | خواندن، upsert، اعتبارسنجی الزامی‌بودن |
| H17 | schema فیلد سفارشی در TS | `src/lib/persons/schemas.ts:34` | `/** jsonb value stored in person_field_values.value */` |
| H18 | جایی که مقدار خالی می‌رود | `src/routes/_app.persons_.create.tsx:63` | `field_values: []` |
| H19 | ماتریس ایستا | `src/lib/rbac/roles.ts:98-278` | `PERMISSIONS` |
| H20 | fallback ایستا (۱) | `src/lib/rbac/roles.ts:320-326` | «Fallback to static» داخل `hasPermissionEx` |
| H21 | fallback ایستا (۲) | `src/lib/rbac/dynamic-permissions.ts` — انتهای `hasPermissionDynamic` | `return hasPermissionStatic(...)` |
| H22 | تصمیم‌گیر ایستای محض | `src/lib/rbac/roles.ts:280-282` | `hasPermission()` — هیچ‌وقت دیتابیس نمی‌خواند |
| H23 | cache و TTL | `src/lib/rbac/dynamic-permissions.ts:21-24, 40-64` | `CACHE_TTL_MS = 5*60*1000`، `PERMISSIONS_TIMEOUT_MS = 10_000` |
| H24 | cache همگام | `src/lib/rbac/permissions-cache.ts` (کل فایل، ۲۲ خط) | `getCachedRolePermissions()` |
| H25 | نقطهٔ await در route guard | `src/lib/rbac/route-guards.ts` — داخل `requirePermission`، `await loadRolePermissions();` | تنها جای await قبل از تصمیم |
| H26 | پیش‌بارگذاری | `src/lib/auth/AuthProvider.tsx:56-59` | `void loadRolePermissions()` |
| H27 | حالت بارگذاری gate | `src/components/layout/RouteRoleGate.tsx` — `data-testid="route-gate-checking"` | «در حال بررسی دسترسی…» |
| H28 | تولید مجوز منو | `src/lib/navigation/registry.ts:1408` | `permission: { module: seed.module, action: ACTION_BY_ROUTE[seed.to] ?? "view" }` — برای هر ۱۳۰ ورودی |
| H29 | تصمیم دیده‌شدن منو | `src/lib/navigation/selectors.ts:44` | `return hasPermissionEx(roles, entry.permission.module, entry.permission.action);` |

---

## سؤال‌های مالک که هنوز باز است — به زبان کسب‌وکار

**Q1 (C-1، مسدودکننده).** «روز فعال» را چه چیزی ثابت می‌کند؟ سیستم امروز **ورودهای واقعی را
فقط در دفترچهٔ داخلی سرویس احراز هویت** نگه می‌دارد که برنامه به آن دسترسی ندارد، و آنچه
خودِ برنامه قرار بوده ثبت کند **هیچ‌وقت ثبت نشده (صفر ردیف)**. سه راه هست و هر سه معنی
متفاوتی دارند: (الف) ورود به سیستم، (ب) «کارِ انجام‌شده» در آن روز — مثل ثبت یک فاکتور یا یک
تماس، (ج) ثبت ورود/خروج دستی که امروز صفحهٔ حضور دارد ولی فقط ۱۰ بار استفاده شده.
**اگر (الف) است، اول باید ثبت ورود درست شود.**

**Q2 (C-1).** جمعه زنجیره را نمی‌شکند — ولی **تعطیلات رسمی چطور؟** سیستم هیچ تقویم تعطیلات
ندارد. اگر فقط جمعه، یک قاعدهٔ ثابت است. اگر تعطیلات هم، یک تقویم لازم است که کسی باید هر سال
پرش کند.

**Q3 (C-1).** زنجیره وقتی می‌شکند، از صفر شروع می‌شود یا رکورد بهترین زنجیره می‌ماند؟ جدول
هر دو ستون را دارد (`current_count` و `best_count`) پس هر دو ممکن است — ولی کسی باید بگوید.

**Q4 (C-2، مسدودکننده — مهم‌ترین سؤال این سند).** وقتی مدیر یک درخواست اعتبار را تأیید می‌کند،
**پول از کجا می‌آید؟** سقف هر مشتری امروز سهمی از سرمایهٔ آن روز است که بین فروشنده‌ها و بعد
بین مشتری‌های هر فروشنده تقسیم می‌شود، و **مجموع ثابت است**. بالا بردن سقف یک مشتری یعنی یکی
از این سه: (الف) سقف بقیهٔ مشتریان همان فروشنده پایین بیاید، (ب) مجموع تخصیص‌شده از سرمایهٔ
روز بیشتر شود — یعنی تعهدی بیش از پول موجود، (ج) تأیید فقط تا سقفی که فرمول از قبل داده
معتبر باشد و در واقع «برداشتن یک محدودیت» باشد نه «اضافه کردن پول». **بدون این تصمیم هیچ
پیاده‌سازی درستی ممکن نیست.**

**Q5 (C-2).** تأیید تا کِی معتبر است؟ فرمول هر بار که سرمایهٔ روز یا امتیازها عوض شود دوباره
اجرا می‌شود. آیا یک تأیید فقط برای همان روز است، تا تاریخ مشخصی، یا تا وقتی کسی لغوش کند؟

**Q6 (C-2).** `D-45` می‌گوید مدیر تأیید می‌کند، ولی قانون فعلی دیتابیس **به مدیر اجازهٔ
تغییر درخواست نمی‌دهد و به حسابدار می‌دهد**. کدام درست است؟

**Q7 (C-3).** `D-46` می‌گوید تعریف فیلد فقط برای ادمین، ولی قانون فعلی دیتابیس **مدیر بخش را
هم مجاز می‌داند**. باید محدود شود یا تصمیم عوض شود؟

**Q8 (C-3).** «قابل فیلتر» یعنی چه؟ روی همهٔ انواع، یا فقط انتخابی و بولی؟ فیلتر روی متن آزاد
روی صدها شخص کند می‌شود و ایندکس جداگانه می‌خواهد.

**Q9 (C-3).** دو نوع اضافه در دیتابیس هست که در تصمیم شما نیامده: «چندانتخابی» و «داده خام».
باقی بمانند و در UI نشان داده نشوند، یا کنار گذاشته شوند؟

**Q10 (C-4).** دفتر قدیمی امروز نقش یک **قفل ایمنی** دارد: تا وقتی رزروی روی سقف‌های یک روز
ثبت باشد، بازمحاسبهٔ سقف‌ها **رد می‌شود** تا رزروها از بین نروند. اگر دفتر بازنشسته شود، این
محافظ هم می‌رود. **آیا این محافظ را می‌خواهید یا نه؟** (تا امروز هرگز فعال نشده چون دفتر
خالی است.)

**Q11 (C-4).** سمت **فروشنده** هم همان عدد را از همان دفتر قدیمی می‌خواند، و دفتر جانشین
اصلاً ستون فروشنده ندارد. سقف فروشنده‌ها هم باید مهاجرت کند، یا فعلاً همان‌طور بماند؟

**Q12 (C-5).** «همیشه زنده بخوان» — وقتی جدول زنده برای یک نقش هیچ ردیفی ندارد، پاسخ چه باشد؟
«اجازه نده» امن‌ترین است ولی امروز **سه ترکیب** دقیقاً در همین وضعیت‌اند و اگر امروز عوض شود،
دسترسی‌شان قطع می‌شود.

**Q13 (C-5).** وقتی سرور جدول دسترسی‌ها را نمی‌دهد (خطای شبکه، تایم‌اوت)، کاربر باید صفحهٔ
خطا ببیند یا با آخرین دسترسی‌های شناخته‌شده کار کند؟ امروز گزینهٔ دوم است.

---

## آنچه مالک باید فراهم کند — دسترسی، فهرست، اعتبارنامه

| # | چه چیزی | چرا | چه کسی می‌تواند |
|---|---|---|---|
| P1 | **تصمیم Q4** — منبع پول برای سقف تأییدشده | بدون آن C-2 قابل ساخت نیست، در هیچ شکلی | فقط مالک |
| P2 | **تصمیم Q1** — تعریف «روز فعال» | C-1 بدون آن یک جدول خالی باقی می‌ماند | مالک |
| P3 | **فهرست فیلدهای سفارشی واقعی** که می‌خواهید تعریف شود، با نوع هرکدام | برای اینکه معلوم شود پنج نوع کافی است یا نه، و کدام‌ها باید فیلترپذیر باشند | مالک / مسئول فروش |
| P4 | **تأیید تغییر سقف‌ها** پیش از هر اجرای بازمحاسبه | `CLAUDE.md` قاعدهٔ ۱۰: بازمحاسبه سقف اعتبار مشتریان واقعی را بازمی‌نویسد و برای هرکدام یک ردیف `audit_logs` می‌سازد | مالک |
| P5 | **تصمیم Q6 و Q7** — تعارض نقش‌ها بین تصمیم و RLS زنده | دو تصمیم متناقض ثبت‌شده | مالک |
| P6 | **دسترسی خواندن به `auth.audit_log_entries` از برنامه** — یا تأیید ساخت یک پل | تنها منبع واقعی ورود، و امروز خارج از دسترس PostgREST | مالک + admin دیتابیس |
| P7 | **تصمیم Q12** — رفتار پیش‌فرض وقتی ردیف دسترسی وجود ندارد | تعیین می‌کند D-48 یک تغییر امن است یا یک قطع دسترسی | مالک |
| P8 | **جلسهٔ آزمون مرورگر با نقش‌های `sales` و `viewer`** | هیچ ادعای این سند دربارهٔ آنچه یک نقش غیرادمین **می‌بیند** آزمایش نشده — این پژوهش هیچ مرورگری اجرا نکرد (قاعدهٔ ۲ بریف) | مالک یا یک انسان با آن حساب‌ها |
| P9 | **تأیید اینکه ۳۵ ردیف `customer_capital_allocations_dynamic` و ۱۹۳ ردیف `role_permissions` حین Wave 5 ثابت مانده‌اند** | Wave 5 روی همین دیتابیس در حال اجراست؛ اعداد این سند عکسِ لحظه‌اند | مالک / هماهنگ‌کنندهٔ موج |

---

## C-5 Blast-radius table

**قاعدهٔ شمول:** هر route یا کامپوننتی که تصمیم دسترسی‌اش امروز می‌تواند از
`PERMISSIONS` (`roles.ts:98-278`) بیرون بیاید. سه مسیر ورود به آن ماتریس وجود دارد:
`hasPermission()` (همیشه ایستا)، `hasPermissionEx()` (fallback)، `hasPermissionDynamic()`
(fallback). مسیرهایی که فقط `requireAnyRole`/`requireAdmin` دارند **شامل نیستند** — آن‌ها
هیچ‌وقت ماتریس را نمی‌خوانند.

**«رفتار پس از حذف» فرض می‌کند fallback حذف شود و پاسخِ نبودِ ردیف «رد» باشد** — یعنی
سخت‌گیرانه‌ترین تفسیر D-48. اگر مالک Q12 را طور دیگری جواب دهد، ستون ریسک عوض می‌شود.

| route/component | current behaviour | behaviour after removal | risk |
|---|---|---|---|
| **۷۶ فایل با `requirePermission(...)`** (۱۰۰ فراخوان) — کل مسیرهای `/pricing/*`، `/sales/*`، `/products/*`، `/persons/*`، `/bot-api-keys*`، `/academy*`، `/messages*`، `/suppliers*`، `/reports*`، `/purchases*`، `/market-rates*`، `/knowledge*`، `/feedback*`، `/data-tables*`، `/dashboard`، `/platform-releases*` | `await loadRolePermissions()` سپس `hasPermissionEx` → جدول زنده، و اگر ردیف نبود ماتریس ایستا | همان، منهای شاخهٔ ایستا. برای هر (نقش، ماژول) که ردیف دارد **بدون تغییر** | **کم برای ۲۵ ماژول از ۲۷** — ردیف هست. **بالا برای `persons`**: ۸ فراخوان view + ۲ update + ۲ create، و `purchase_specialist` و `site` **هیچ ردیفی ندارند** ⇒ از «مجاز» به «رد» می‌روند |
| **`_app.persons.tsx`, `_app.persons_.$personId.tsx`, `_app.persons_.$personId_.edit.tsx`, `_app.persons_.create.tsx`, `_app.persons_.merge.tsx`** (۵ مسیر، ماژول `persons`) | `purchase_specialist` و `site` از راه fallback ایستا (`persons.view: ALL_ROLES`) — یعنی `site` **نه**، `purchase_specialist` **نه** (هیچ‌کدام در `ALL_ROLES` نیستند) → عملاً امروز هم رد می‌شوند | بدون fallback: صریحاً رد | **کم** — نتیجه یکی است؛ فقط مسیر رسیدن عوض می‌شود. **ولی این تنها نقطه‌ای است که «نبود ردیف» با «نبود در آرایه» هم‌جهت است؛ باید قبل از حذف با یک نگاه به جدول زنده تأیید شود** |
| **`_app.warehouse*` (ماژول `warehouse`)** | `site` هیچ ردیف زنده ندارد → fallback ایستا: `warehouse.view` شامل `site` **نیست** → رد | رد | **کم** — بدون تغییر |
| **`src/components/products/ProductPublishPricesCard.tsx:21`** | `hasPermission(roles,"pricing","update") \|\| hasPermission(roles,"pricing","create")` — **همیشه ایستا، هرگز جدول زنده** | باید به `hasPermissionEx` تبدیل شود | **بالا** — جدول زنده `pricing.update` را به `sales` و `purchase_specialist` هم می‌دهد، ماتریس ایستا نمی‌دهد. **امروز دکمهٔ انتشار قیمت برای فروشنده پنهان است در حالی که backend اجازه می‌دهد.** حذف ایستا این را *باز* می‌کند |
| **`src/routes/_app.sales.search.tsx:159`** | همان الگو، همان دو فراخوان ایستا روی `pricing` | همان | **بالا** — همان دلیل، در پرکاربردترین صفحهٔ فروش |
| **`src/routes/_app.products.$id.tsx:73-74`** | `hasPermission(roles,"products","update")` و `("products","delete")` — ایستا | تبدیل به زنده | **متوسط** — جدول زنده `products.update` را به `accountant` هم می‌دهد (ایستا نمی‌دهد) ⇒ دکمه‌های ویرایش برای حسابدار ظاهر می‌شوند |
| **`src/routes/_app.products.index.tsx:115-116`** | `("products","create")` و `("products","update")` — ایستا | تبدیل به زنده | **متوسط** — همان |
| **`src/routes/_app.products.attributes.tsx:81`** | `("products","update")` — ایستا | تبدیل به زنده | **متوسط** — همان |
| **`src/routes/_app.products.labels.tsx:80`** | `("products","update")` — ایستا | تبدیل به زنده | **متوسط** — همان |
| **`src/components/layout/AppSidebar.tsx:95` + کل منوی کناری** | `getVisibleNavigationEntries(roles)` → `selectors.ts:44` → `hasPermissionEx` **بدون await**؛ در render سرد cache خالی است و ماتریس ایستا منو را می‌سازد | بدون fallback: در render سرد **منوی خالی**، سپس پرشدن پس از بارگذاری cache | **بالا** — فلش دیداری در هر بارگذاری سرد، برای **۱۳۰ ورودی منو** (`registry.ts:1408` به هر seed یک `permission` می‌دهد) |
| **`src/components/layout/MobileBottomNav.tsx:6`** | `isNavigationEntryVisible` → همان مسیر | همان | **بالا** — نوار پایین موبایل در بارگذاری سرد خالی می‌شود |
| **`src/components/layout/NavigationCommandPalette.tsx:14`** | `getVisibleNavigationEntries` | همان | **متوسط** — جست‌وجوی فرمان تا بارگذاری cache نتیجه نمی‌دهد |
| **`src/components/finance/FinanceHub.tsx:5`** | `isNavigationEntryPermitted` | همان | **متوسط** — کارت‌های هاب مالی در بارگذاری سرد خالی |
| **`src/routes/_app.suppliers.tsx`, `_app.suppliers_.$supplierId.tsx`** | `hasPermissionEx(... "suppliers" ...)` | همان منهای fallback | **بالا** — جدول زنده `suppliers` را به `sales` و `purchase_specialist` می‌دهد و ایستا نمی‌دهد ⇒ **رفتار امروز از جدول زنده می‌آید و تغییری نمی‌کند**، مگر در پنجرهٔ بارگذاری سرد که امروز ایستا (سخت‌گیرتر) پاسخ می‌دهد |
| **`src/shared/components/SupplierForm.tsx`, `ProductSupplierManager.tsx`, `ProductPriceCard.tsx`** | `hasPermissionEx` در render | همان | **متوسط** — کنترل‌ها در پنجرهٔ سرد پنهان می‌شوند به‌جای اینکه با پاسخ ایستا ظاهر شوند |
| **`src/hooks/pricing/usePricingBoardAccess.ts`** + `src/components/pricing/board/BoardSettingsSelector.tsx` | `hasPermissionEx(... "pricing" ...)` | همان | **بالا** — `pricing` بزرگ‌ترین واگرایی است: زنده به ۵ نقش می‌دهد، ایستا به ۳ |
| **`src/routes/_app.pricing.live-price-list.tsx`, `_app.pricing.my-workbench.tsx`** | `hasPermissionEx` در render | همان | **بالا** — همان دلیل |
| **`src/routes/_app.operations.daily-mood.admin.tsx`** | `hasPermissionEx` | همان | **کم** |
| **`src/routes/_app.persons_.$personId.tsx`, `_app.persons_.$personId_.edit.tsx`** (استفادهٔ render، جدا از guard) | `hasPermissionEx(... "persons" ...)` | همان | **متوسط** — `persons` تنها ماژولی است که ردیف زنده ناقص دارد |
| **`src/lib/rbac/route-guards.ts`** (خودِ guard) | `hasPermissionEx` پس از `await loadRolePermissions()` | حذف شاخهٔ ایستا | **کم** — چون await از قبل هست |
| **`src/components/layout/RouteRoleGate.tsx`** (۶۴ مسیر دارای `gate:`) | **ماتریس ایستا را اصلاً نمی‌خواند** — فقط `RouteGate.allowed` که دستی از جدول زنده کپی شده | بدون تغییر | **صفر** — ولی توجه: کامنت خودش می‌گوید `kind:"permission"` عمداً ساخته نشده چون render نمی‌تواند await کند. **D-48 دقیقاً همان مانع را دوباره می‌آورد** |
| **`e2e/navigation/wave1c-wired-components.spec.ts:49`** و بقیهٔ تست‌های ناوبری | فرض می‌کنند منو در render اول پر است | ممکن است قرمز شوند | **متوسط** — تست‌ها باید منتظر بارگذاری cache شوند |

**جمع سطرها: ۲۲ ردیف.**
**جمع واحدهای متمایز تحت تأثیر:**

```
۷۶ فایل با requirePermission  (۱۰۰ فراخوان)
+  ۶ فایل با hasPermission ایستای محض  (۸ فراخوان)
+ ۱۸ فایل با hasPermissionEx  (۲۰ فراخوان)  ← ۳ تای آن‌ها با گروه اول هم‌پوشانی دارد
+ ۱۳۰ ورودی منو از یک نقطه (registry.ts:1408)
────────────────────────────────────────────
۹۷ فایل متمایز در src/  +  ۱۳۰ ورودی منو
```

دستور شمارش:

```
$ grep -rl "requirePermission(" src/ | grep -v "route-guards.ts" | wc -l      -> 76
$ grep -rl "\bhasPermission(" src/ | grep -v "rbac/" | wc -l                  -> 6
$ grep -rl "hasPermissionEx(" src/ | grep -v "rbac/roles.ts" | wc -l          -> 18
$ grep -c "to: \"/" src/lib/navigation/registry.ts                            -> 130
$ grep -rln "rbac/roles" src/ | wc -l                                         -> 86  (کل واردکننده‌ها)
```

### حکم C-5: **سه موج، نه یک موج**

نه به‌خاطر تعداد فایل — به‌خاطر اینکه **سه تغییر مستقل با سه ریسک متفاوت** زیر یک نام
جمع شده‌اند:

1. **موج اول — پر کردن شکاف داده.** سه ترکیب `purchase_specialist|persons`, `site|persons`,
   `site|warehouse` ردیف ندارند. تا وقتی ردیف ندارند، «همیشه زنده بخوان» یعنی «این سه را قطع
   کن». این موج **هیچ کدی عوض نمی‌کند** و فقط سه ردیف داده می‌خواهد (که یک migration است و
   تصمیم مالک Q12 را می‌طلبد). بدون آن، موج‌های بعدی یک قطع دسترسی پنهان می‌سازند.

2. **موج دوم — ۸ فراخوان `hasPermission()` ایستای محض در ۶ فایل.** این‌ها **امروز هم غلط‌اند**
   و ربطی به fallback ندارند: هرگز جدول زنده را نمی‌خوانند. ماژول `pricing` زنده به ۵ نقش
   می‌دهد و ایستا به ۳ — پس امروز دکمهٔ انتشار قیمت و ویرایش محصول برای نقش‌هایی پنهان است که
   backend می‌پذیرد. **این موج کوچک، مستقل، و بیشترین اصلاح واقعی را دارد.**

3. **موج سوم — حذف خودِ fallback و حل مسئلهٔ render.** این سنگین‌ترین است چون
   `hasPermissionEx` در **render** صدا زده می‌شود (منو، نوار موبایل، پالت فرمان، هاب مالی،
   ۹ کامپوننت دیگر) و **یک render نمی‌تواند await کند**. یا باید یک `loading` واقعی وارد
   منو شود، یا `role_permissions` قبل از اولین render آماده باشد. `RouteRoleGate.tsx` این
   مانع را از قبل کشف و مستند کرده و به‌همین‌دلیل `kind:"permission"` را نساخته.

**ادغام این سه در یک موج یعنی سه شکست ممکن هم‌زمان که از هم قابل تفکیک نیستند** — و
`PROGRESS.md`/`CLAUDE.md` قاعدهٔ ۱۶ («هر تغییر کوچک، افزایشی، کم‌ریسک و آزمون‌پذیر») دقیقاً
همین را ممنوع می‌کند.

---

## Numbers · Contradictions · Coverage · UNVERIFIED

### Numbers — همهٔ اعداد این سند با دستور تولیدشان

قالب دستور (برای اختصار، در ادامه فقط `-Atc "…"` نوشته می‌شود):

```
docker exec -u postgres -e PGOPTIONS="-c default_transaction_read_only=on" \
  afrakala-lan-db psql -d afrakala -Atc "<SQL>"
```

| عدد | مقدار | دستور |
|---|---|---|
| ردیف‌های ۸ جدول هدف | بالا | `select 'employee_streaks='\|\|(select count(*) from employee_streaks)\|\|…` |
| policy هر جدول | بالا | کوئری `pg_class`/`pg_policy` بالا |
| `auth` login events | ۹۹۷ / ۲۷ کاربر / ۶۴ روز | `select … from auth.audit_log_entries where payload->>'action'='login'` |
| `audit_logs` login_success | **۰** | `select count(*) from audit_logs where action='login_success'` |
| `gamification_kpis` | ۱۳ | `select count(*) from gamification_kpis` |
| `gamification_kpi_rules` | ۱۱ ردیف (۹ کسب‌وکاری + `test11` + یکی با xp=0) | `select row_to_json(t) from gamification_kpi_rules t` |
| `achievements` | ۱۰، همه `rule_type='manual'` | `select key\|\|' \| '\|\|rule_type\|\|… from achievements` |
| `binding_constraint` | `formula \| 35` — تنها مقدار | `select b\|\|' \| '\|\|c from (select binding_constraint b, count(*) c from customer_capital_allocations_dynamic group by 1) x order by b` |
| `customer_credit_profile` | **۰ ردیف** | `select 'rows='\|\|count(*)\|\|' with_credit_limit='\|\|count(credit_limit)\|\|' with_overdue='\|\|count(*) filter (where has_overdue) from customer_credit_profile` |
| `customer_credit_balance` | ۲۵ ردیف، `sum_held=0.00`، ۰ ردیف ناصفر | `select 'rows='\|\|count(*)\|\|' sum_held='\|\|coalesce(sum(held_credit)::text,'-')\|\|' nonzero_held='\|\|count(*) filter (where held_credit<>0) from customer_credit_balance` |
| `role_permissions` | ۱۹۳ ردیف، ۲۸ ماژول، ۷ نقش | `select 'rows='\|\|count(*)\|\|' modules='\|\|count(distinct module)\|\|' roles='\|\|count(distinct role_name) from role_permissions` |
| ماژول‌های واگرا | **۱۶** (اقدام‌های پایه) | اسکریپت مقایسه، پایین |
| ترکیب‌های بدون ردیف | **۳** | همان اسکریپت |
| `ModuleKey` | ۲۷ | `roles.ts:64-91` |
| `NAVIGATION_REGISTRY` | ۱۳۰ | `grep -c "to: \"/" src/lib/navigation/registry.ts` |
| فایل‌های `requirePermission` | ۷۶ | `grep -rl "requirePermission(" src/ \| grep -v "route-guards.ts" \| wc -l` |
| مسیرهای دارای `gate:` | ۶۴ | `grep -rln "gate:" src/routes/ \| wc -l` |
| واردکنندگان `rbac/roles` | ۸۶ | `grep -rln "rbac/roles\|from \"./roles\"\|from \"@/lib/rbac\"" src/ \| wc -l` |

### دستورهای شمارش C-4 — تا هماهنگ‌کننده بتواند یکی را دوباره اجرا کند

```bash
# (۱) ردیف‌های دو دفتر
docker exec -u postgres -e PGOPTIONS="-c default_transaction_read_only=on" afrakala-lan-db \
 psql -d afrakala -Atc "select 'capital_allocation_ledger='||(select count(*) from capital_allocation_ledger)||' customer_credit_ledger='||(select count(*) from customer_credit_ledger)||' customer_credit_balance='||(select count(*) from customer_credit_balance);"
# انتظار: capital_allocation_ledger=0 customer_credit_ledger=7 customer_credit_balance=25

# (۲) تفکیک نوع تراکنش در دفتر جانشین — «آیا جمع hold وجود دارد؟»
docker exec -u postgres -e PGOPTIONS="-c default_transaction_read_only=on" afrakala-lan-db \
 psql -d afrakala -Atc "select t||' | '||c||' | sum='||s from (select transaction_type t, count(*) c, sum(amount) s from customer_credit_ledger group by 1) x order by t;"
# انتظار: adjustment | 2 | sum=11000.00   /   payment | 5 | sum=10225011000.00   (هیچ hold، هیچ release)

# (۳) خواننده‌های دیتابیسی دفتر قدیمی — شمارش
docker exec -u postgres -e PGOPTIONS="-c default_transaction_read_only=on" afrakala-lan-db \
 psql -d afrakala -Atc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in ('f','p') and p.prolang<>13 and pg_get_functiondef(p.oid) ~* 'capital_allocation_ledger';"
# انتظار: 3   (_capital_alloc_used, is_valid_audit_entity_type, recompute_dynamic_capital_setting)

# (۴) view/matview/FK به دفتر قدیمی — هر سه باید خالی باشند
docker exec -u postgres -e PGOPTIONS="-c default_transaction_read_only=on" afrakala-lan-db \
 psql -d afrakala -Atc "select 'views='||(select count(*) from pg_views where definition ~* 'capital_allocation_ledger')||' matviews='||(select count(*) from pg_matviews where definition ~* 'capital_allocation_ledger')||' inbound_fks='||(select count(*) from pg_constraint where confrelid='public.capital_allocation_ledger'::regclass)||' own_fks='||(select count(*) from pg_constraint where conrelid='public.capital_allocation_ledger'::regclass and contype='f');"
# انتظار: views=0 matviews=0 inbound_fks=0 own_fks=0

# (۵) آیا در رجیستری person_merge هست؟ — باید هیچ سطری برنگرداند
docker exec -u postgres -e PGOPTIONS="-c default_transaction_read_only=on" afrakala-lan-db \
 psql -d afrakala -Atc "select * from public.person_fk_registry_report();" | grep capital_allocation_ledger
# انتظار: هیچ خروجی (exit 1 از grep)

# (۶) خواننده‌های کد — شمارش
cd D:/AfraKalaTest/app && grep -rn "capital_allocation_ledger" src/ e2e/ automation/ | grep -v types.ts | wc -l
# انتظار: 4   (useDynamicCapital.ts:43 کامنت، og103 دو بار، 213-spec:399)
```

### اسکریپت مقایسهٔ C-5 (قابل بازاجرا)

```bash
docker exec -u postgres -e PGOPTIONS="-c default_transaction_read_only=on" afrakala-lan-db \
 psql -d afrakala -Atc "select role_name||','||module||','||can_view||','||can_create||','||can_update||','||can_delete from role_permissions order by module, role_name;" > live_perms.csv
# 193 خط. سپس ماتریس roles.ts:98-278 به شکل JS بازنویسی و سطر به سطر مقایسه شد.
# ⚠️ یک باگ در دتکتور خودم را قبل از اعتماد به عدد پیدا و تصحیح کردم: psql با `||`
#    بولین را 'true'/'false' می‌دهد نه 't'/'f'. اجرای اول با 't' مقایسه می‌کرد و
#    ۲۴ ماژول واگرا گزارش داد که همه‌شان static=true/live=false بودند — یعنی همه‌چیز
#    غلط. پس از تصحیح: ۱۶ ماژول، در هر دو جهت.
```

### Contradictions

**۱) «۱۳ ماژول واگرا» در برابر «۱۶» من.**
`docs/research/security2-build-20260906.md:238`:

> `| **Static permission table divergence** | 13 modules | src/lib/rbac/roles.ts:98-278 vs live. **NOT repaired, by owner decision.** pricing is the footgun: live grants 5 roles, static claims 3, ~15 routes |`

اندازه‌گیری من: **۱۶** — `academy, audit-logs, bot-api-keys, data-tables, feedback, invoices,
knowledge, platform-releases, price-lists, pricing, products, purchases, reports, roles, sales,
suppliers`. روش من: هر ۷ نقش × ۲۷ ماژول ایستا × ۴ اقدام پایه، با short-circuit `admin`
(چون `hasPermissionEx` برای admin بی‌قید `true` می‌دهد و مقایسهٔ ردیف admin بی‌معناست).
**من عدد آن سند را غلط نمی‌دانم — روش‌ها را نمی‌دانم.** دو توضیح ممکن است: (الف) آن سند
`view` را تنها اقدام شمرده، (ب) جدول زنده از ۲۰۲۶-۰۹-۰۶ تا امروز عوض شده — **که در روزی که
موج ۲ امنیت روی همین شاخه commit کرده و Wave 5 در حال اجراست، محتمل است**. دستور بازاجرا
بالا آمده. **در نقطهٔ کلیدی هر دو موافق‌اند:** `pricing` زنده ۵ نقش و ایستا ۳ نقش —
اندازه‌گیری من دقیقاً `sales.view/create/update` و `purchase_specialist.view/create/update`
را به‌عنوان اضافه‌های زنده می‌دهد.

**۲) «خواننده‌ها آماده‌اند» برای `person_field_definitions`.**
`unwired-inventory-20260905.md:951`: «CONNECT-SMALL … صفحهٔ تعریف فیلد (خواننده‌ها آماده‌اند)».
**درست است در لایهٔ server-function و غلط است در لایهٔ UI.** هیچ `.tsx` در `src/` نام
`person_field` را نمی‌برد. هر دو طرف نقل شد؛ من ادعای آن سند را رد نمی‌کنم، محدودش می‌کنم.
همان سند در `:601` می‌گوید «کد + ۲ تابع می‌خوانند» — اندازه‌گیری من **۳ تابع** برای
`person_field_definitions` و **۴** برای `person_field_values` می‌دهد.

**۳) «یک تابع می‌خواند `credit_requests`».**
`unwired-inventory-20260905.md:596` می‌گوید یک تابع؛ اندازه‌گیری من **سه** می‌دهد
(`person_delete_blockers`, `person_fk_drift_report`, `person_merge`). هر سه عمومی هستهٔ
اشخاص‌اند، پس **نتیجهٔ کیفی هر دو یکی است**: هیچ‌کدام گردش تأیید نیستند.

**۴) `capital_allocation_ledger` «فقط `_capital_alloc_used` می‌خواندش».**
`unwired-inventory-20260905.md:481-484`:

> «**و `capital_allocation_ledger` صفر ردیف دارد و هیچ نویسنده‌ای ندارد.** [E] اثبات:
> `where n.nspname='public' and p.prosrc ~* 'capital_allocation_ledger';`»

آن کوئری از `p.prosrc` استفاده می‌کند؛ من از `pg_get_functiondef` استفاده کردم. **هر دو
`recompute_dynamic_capital_setting` را باید پیدا کنند** و آن سند در فهرست خواننده‌هایش
نیاورده. **بریف من هم فقط `_capital_alloc_used` را نام می‌برد.** خوانندهٔ سوم — قفلِ
بازمحاسبه — در هیچ‌کدام نیست و **مهم‌ترین یافتهٔ C-4 است**.
دربارهٔ «صفر نویسنده» هر دو موافقیم: هیچ تابع، هیچ کد، هیچ تریگر نمی‌نویسد.

**۵) `gamification_kpis.source='invoices'` در برابر حذف جدول `invoices`.**
سه ردیف (`total_sales`, `total_profit`, `cumulative_sales`) `source='invoices'` دارند، و
`invoices` در migration ۳۳۲ حذف شده (`unwired-inventory-20260905.md:483`: «does invoices exist
in ANY schema? (NONE)»). ستون `source` هیچ CHECK ندارد پس این خطا نمی‌دهد؛ صرفاً به هیچ اشاره
می‌کند. **این بر D-44 اثر مستقیم دارد:** یک قاعدهٔ تازه نباید از این الگو تقلید کند.

**۶) `D-45` در برابر RLS زنده، و `D-46` در برابر RLS زنده.** بالا نقل شد (F-C2.1، F-C3.1).
این تناقض بین تصمیم مالک و کد است، نه بین دو سند.

### Coverage

| زیرمورد | حکم | چه چیزی قطعی است |
|---|---|---|
| **C-1** | **VERDICT (با یک UNKNOWN تودرتو)** | Schema/RLS/خواننده کامل اندازه‌گیری شد؛ منبع ورود شناسایی شد (`auth.audit_log_entries`) و **اثبات شد از `public` قابل دسترس نیست**؛ نبود تقویم اثبات شد؛ شکل قاعدهٔ XP با ردیف verbatim نقل شد. **UNKNOWN تودرتو:** *چرا* `log_event('auth','login_success')` صفر ردیف دارد — اندازه‌گیری نشد، حدس نمی‌زنم |
| **C-2** | **VERDICT — «هیچ‌کدام به‌تنهایی»** | فرمول کامل خوانده شد (نه صدا زده)؛ ورودی دستی موجود اثبات شد و **جهتش (سقف نه کف)** از خود `CASE` نقل شد؛ نبود ستون override و نبود مقدار `binding_constraint` متناظر اثبات شد؛ نبود هر مصرف‌کننده اثبات شد |
| **C-3** | **VERDICT** | `person_field_values` **وجود دارد** (پاسخ صریح به سؤال بریف)؛ CHECK نوع با ۷ مقدار نقل شد؛ لایهٔ سرور کامل با نقل‌قول؛ **نبود هر UI با grep که هیچ `.tsx` نیافت** |
| **C-4** | **VERDICT** | ۰ ردیف، ۰ نویسنده، ۰ FK (ورودی و خروجی)، **۳ خواننده نه ۱**، عدم حضور در رجیستری `person_merge` با خروجی `person_fk_registry_report()`؛ شکل جمع `hold`/`release` در دفتر جانشین اثبات شد؛ **مدل سوم (`customer_credit_balance.held_credit`) که بریف نامش را نبرده** با بدنهٔ `get_customer_dynamic_credit` اثبات شد؛ اختلاف کلید پیوند (`allocation_id` در برابر `customer_id`) اثبات شد |
| **C-5** | **VERDICT — سه موج** | `roles.ts` کامل خوانده شد؛ همهٔ مصرف‌کننده‌ها شمرده شدند با دستور؛ ۱۶ ماژول واگرا با اسکریپت قابل بازاجرا (و باگ خودم تصحیح‌شده و ثبت‌شده)؛ ۳ ترکیب بدون ردیف؛ پاسخ «چه می‌شکند» از سه کامپوننت زنده با `data-testid` نقل شد |

### UNVERIFIED — آنچه ادعا نمی‌کنم

| # | مورد | چرا |
|---|---|---|
| U1 | **چرا `login_success` صفر ردیف دارد** | `void supabase.rpc(...)` بلافاصله پس از `signInWithPassword` است و `log_event` وقتی `auth.uid()` تهی باشد `RAISE` می‌کند؛ این با «سشن هنوز به کلاینت وصل نشده» سازگار است ولی **اندازه نگرفتم** و بریف اجازهٔ مرورگر نمی‌دهد |
| U2 | **آنچه نقش‌های `sales`/`viewer` واقعاً در منو می‌بینند** | هیچ مرورگری اجرا نشد (قاعدهٔ ۲ بریف). هر ادعای C-5 دربارهٔ «فلش» از خواندن کد است، نه از مشاهده |
| U3 | **رفتار `hasPermissionEx` در SSR** | `permissions-cache.ts` یک متغیر ماژول است؛ رفتارش در پاس سرور اجرا و اندازه‌گیری نشد |
| U4 | **آیا `role_permissions` حین این ممیزی ثابت ماند** | Wave 5 هم‌زمان اجرا می‌شود. عدد ۱۹۳ یک عکسِ لحظه‌ای در ۲۰۲۶-۰۹-۰۶ است. برای همین اسکریپت بازاجرا آمده |
| U5 | **آیا `customer_capital_allocations_dynamic` = ۳۵ ثابت ماند** | همان دلیل. `[unwired]` هم ۳۵ دیده بود، پس دست‌کم بین دو ممیزی تغییر نکرده |
| U6 | **اثر عملکردی (performance) حذف fallback** | اندازه‌گیری نشد |
| U7 | **اینکه ۱۳ در برابر ۱۶ اختلاف روش است یا اختلاف زمان** | روش سند دیگر در دسترس من نبود؛ هر دو عدد با روششان ثبت شد |
| U8 | **`build` / `typecheck` / `lint`** | **اجرا نشدند و اجرا نمی‌شوند** — این ممیزی هیچ کدی تغییر نداد. طبق `CLAUDE.md`: «If a script does not exist, report that explicitly. Do not claim it passed.» — اینجا اجرا **نشد**، نه اینکه رد شد. **و در این پروژه هیچ `test` script وجود ندارد** |
| U9 | **هر ادعایی دربارهٔ تولید (`192.168.170.10`)** | تماس گرفته نشد، resolve نشد، ping نشد |

---

## Self-Host Acceptance Check

هیچ وابستگی تازه‌ای اضافه نشد، هیچ CDN، هیچ فونت آنلاین، هیچ API بیرونی. تنها خروجی این
مأموریت همین فایل Markdown است که در مخزن می‌ماند و کاملاً self-hosted است.

## Migration / RLS / Audit impact

**هیچ.** هیچ migration نوشته یا اجرا نشد، هیچ policy تغییر نکرد، هیچ ردیف `audit_logs` توسط
این ممیزی ساخته نشد (همهٔ statementها `default_transaction_read_only=on` بودند و هیچ تابع
نویسنده‌ای صدا زده نشد).

## Remaining risks

1. اعداد داده‌ای (۳۵ تخصیص، ۱۹۳ ردیف دسترسی، ۲۵ موجودی اعتبار) عکسِ لحظه‌اند و Wave 5
   روی همین دیتابیس کار می‌کند.
2. اختلاف ۱۳ در برابر ۱۶ ماژول واگرا تا وقتی روش سند دیگر بازتولید نشود باز می‌ماند.
3. علت صفر بودن `login_success` بی‌پاسخ است و دقیقاً همان چیزی است که C-1 به آن وابسته است.
4. هیچ آزمون مرورگری انجام نشد؛ همهٔ احکام UI از خواندن کد است.
