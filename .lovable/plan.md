## مشکل
هنگام «پاسخ به استعلام»، تریگر `award_inquiry_response_score` روی جدول `inquiries` اجرا می‌شود و در `employee_score_events` این INSERT را می‌زند:

```
ON CONFLICT (source_table, source_id, event_type) DO NOTHING
```

روی این جدول یک **unique index جزئی (partial)** وجود دارد:

```
CREATE UNIQUE INDEX uniq_score_events_source
  ON employee_score_events (source_table, source_id, event_type)
  WHERE source_table IS NOT NULL AND source_id IS NOT NULL;
```

PostgreSQL برای تطبیق `ON CONFLICT` با یک partial index، **باید همان predicate به عبارت ON CONFLICT اضافه شود**. چون این کار نشده، خطای `there is no unique or exclusion constraint matching the ON CONFLICT specification` بلند می‌شود و کل تراکنش reply_inquiry rollback می‌گیرد.

## راه‌حل (کم‌ریسک، فقط یک تابع تریگر)
یک migration کوچک که فقط بدنه‌ی `public.award_inquiry_response_score()` را با `CREATE OR REPLACE FUNCTION` بازتعریف کند و در دستور `ON CONFLICT` این predicate را اضافه کند:

```sql
ON CONFLICT (source_table, source_id, event_type)
  WHERE source_table IS NOT NULL AND source_id IS NOT NULL
  DO NOTHING;
```

بقیه‌ی منطق تابع، تریگر، ایندکس، RPCها و جداول دست‌نخورده باقی می‌مانند.

## چرا این گزینه
- ایندکس همچنان partial می‌ماند (backward-compatible با داده‌های احتمالی NULL و رفتار کنونی صف امتیازها).
- هیچ تغییری در schema، RLS، grant، RPC، یا کد فرانت لازم نیست.
- ریسک روی سایر بخش‌های گیمیفیکیشن صفر است چون فقط predicate ON CONFLICT اصلاح می‌شود.

## تست پس از اجرا
1. `/messages` → یک استعلام باز → «پاسخ» با قیمت صحیح → باید بدون خطا ثبت شود و وضعیت به `completed_on_time` یا `completed_late` برود.
2. اطمینان: در `employee_score_events` یک ردیف با `source_table='inquiries'` و همان `source_id` ثبت شود؛ پاسخ دوباره روی همان استعلام رکورد تکراری نسازد.
3. سناریوهای قبلی (ثبت استعلام، ارجاع، برد، تاریخچه) دست‌نخورده کار کنند.

## خارج از این پلن
- خطای Ollama و مرحله‌ی ارجاع/برد قبلاً بررسی و OK اعلام شدند؛ این پلن فقط باگ ON CONFLICT در پاسخ استعلام را رفع می‌کند.