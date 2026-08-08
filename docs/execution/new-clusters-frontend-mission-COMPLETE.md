# مأموریت new-clusters-frontend — تکمیل (با توقف schema)

**تاریخ:** ۲۰۲۶-۰۸-۰۸  
**ابزار:** Cursor (Agent 4)  
**برنچ:** `feature/navigation-modernization`  
**وضعیت:** فرانت سه خوشه ساخته و به ناوبری وصل شد · **دو توقف schema** روی RPCهای یتیم ثبت شد

---

## خلاصه

سه خوشهٔ بک‌اند بدون فراخوان کلاینت (نامزدی ارتقا، استعلام، لیگ) رابط کاربری گرفتند و به
منوی واقعی وصل شدند. دادهٔ جعلی ساخته نشد؛ همهٔ مسیرها به RPC/جدول زنده وصل‌اند.

| خوشه | صفحه | RPCهای وصل‌شده | تست JWT |
|---|---|---|---|
| نامزدی ارتقا | `/sales/promotion-nominations` | `nominate` / `cancel` / `quota` | ✅ nominate→cancel |
| استعلام‌ها | `/messages/inquiries` + tick در `InquiryBoard` | `update_inquiry_status` · `tick_inquiries` | ✅ status wired · tick reachable |
| لیگ | `/gamification/league` + تب RPC در admin leagues | `get_current_league` / `get_league_leaderboard` / `start` / `settle` | ✅ get_current · start blocked (documented) |

`e2e/clusters/new-clusters-jwt.spec.ts` → **۵/۵ سبز**.

---

## توقف‌های صریح مأموریت (شرط الف — نیاز به schema)

### ۱) `start_league_season` / `settle_league_season`
- RPC قدیمی فقط `season_name` / `start_date` / `end_date` / `is_active` می‌نویسد.
- تریگر `validate_league_season` حالا `title_fa` / `starts_at` / `ends_at` را اجباری کرده.
- نتیجهٔ زنده: `HTTP 400` با «عنوان فارسی الزامی است».
- **رفع لازم:** مهاجرت که RPCها ستون‌های جدید را پر کنند (یا تریگر insertهای legacy را بپذیرد).
- تا آن موقع تب «فصل‌ها» (CRUD با `title_fa`) مسیر کاری است؛ تب «موتور فصل (RPC)» خطا را نشان می‌دهد.

### ۲) `tick_inquiries`
- خودِ حلقه‌های SLA سالم‌اند، ولی انتهای تابع `expire_pending_documents()` را صدا می‌زند و با
  `42P10` (ON CONFLICT بدون constraint) می‌افتد.
- UI tick را best-effort صدا می‌زند (خطا بلعیده می‌شود)؛ صفحه و `update_inquiry_status` کار می‌کنند.
- **رفع لازم:** اصلاح `expire_pending_documents` (خارج از دامنهٔ فرانت‌فقط).

هیچ مهاجرتی در این مأموریت نوشته نشد (طبق دستور توقف).

---

## فایل‌های اصلی

**جدید**
- `src/routes/_app.sales.promotion-nominations.tsx`
- `src/routes/_app.messages.inquiries.tsx`
- `src/routes/_app.gamification.league.tsx`
- `src/lib/sales/promotion-nominations.ts`
- `src/lib/messenger/inquiry-status.ts`
- `src/hooks/messenger/useAllInquiries.ts`
- `e2e/clusters/new-clusters-jwt.spec.ts`

**تغییر**
- `src/lib/operations/gamification-leagues.ts` — helpers برای RPCهای لیگ
- `src/routes/_app.gamification.admin.leagues.tsx` — تب موتور فصل
- `src/components/messenger/InquiryBoard.tsx` — tick دوره‌ای
- `src/lib/navigation/registry.ts` + `primary-modules.ts` — ناوبری
- `src/routeTree.gen.ts` · `playwright.config.ts`

**تأثیر مهاجرت / RLS / audit:** هیچ تغییر schema. RPCهای موجود SECURITY DEFINER؛ audit داخل
`cancel`/`nominate` و `logAudit` لیگ.

**Build:** Docker (طبق قانون پروژه). typecheck baseline ۷۰ هدف است. eslint فایل‌های لمس‌شده بعد از
`--fix` بدون error.

---

## مسیر تست دستی

1. فروشنده → `/sales/promotion-nominations` و از `/sales/search` نامزدی بسازد، بعد لغو کند.
2. عضو پیام‌رسان → `/messages/inquiries` · لغو استعلام باز.
3. هر نقش مجاز → `/gamification/league` (لیگ من + جدول).
4. admin/manager → `/gamification/admin/leagues` تب «موتور فصل» (انتظار خطای فارسی تا رفع schema).
