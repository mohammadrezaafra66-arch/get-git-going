# فاز ۴ — موتور محاسبه RPC: `calculate_dynamic_score`

## پاسخ به سه سؤال کلیدی

### ۱. پارامتر بدون امتیاز در آن ماه → **حذف از محاسبه و نرمال‌سازی مجدد** (نه صفر)

دلیل:
- صفر فرض کردن یعنی پارامترِ «ثبت‌نشده» را به جریمه واقعی تبدیل می‌کنیم — تفاوت معنایی بین «امتیازش صفر بود» و «هنوز ارزیابی نشده» از بین می‌رود.
- نرمال‌سازی پس از حذف، تضمین می‌کند مجموع وزن‌های مؤثر = ۱ بماند و خروجی همیشه در بازه ۰ تا ۱ بایستد.
- در breakdown، پارامترهای ثبت‌نشده با `raw_score = null` و `contribution = 0` نمایش داده می‌شوند تا UI آن‌ها را «ارزیابی‌نشده» نشان دهد.

اگر **هیچ پارامتری** ثبت نشده باشد: `weighted_score = null` (نه صفر) — تمایز صریح بین «امتیاز صفر» و «داده‌ای نیست».

### ۲. خروجی: `jsonb` کامل با breakdown

```json
{
  "entity_type": "customer",
  "entity_id": "…",
  "period_month": "2026-06-01",
  "weighted_score": 0.74,
  "total_weight_used": 1.000,
  "parameters_active": 5,
  "parameters_evaluated": 4,
  "breakdown": [
    {
      "parameter_code": "purchase_1y",
      "parameter_name": "خرید یک‌ساله",
      "raw_score": 0.8,
      "raw_weight": 0.200,
      "normalized_weight": 0.250,
      "contribution": 0.200,
      "has_score": true
    },
    {
      "parameter_code": "settlement_score",
      "raw_score": null,
      "raw_weight": 0.200,
      "normalized_weight": 0,
      "contribution": 0,
      "has_score": false
    }
  ]
}
```

دلیل jsonb: هم snapshot فاز ۵ و هم UI ادمین به breakdown نیاز دارند؛ یک RPC از تکرار منطق جلوگیری می‌کند.

### ۳. Read-only مطلق

- فقط `SELECT`، بدون نوشتن.
- `STABLE` (نه VOLATILE).
- ذخیره دائمی در فاز ۵ از طریق snapshot جداگانه‌ای که این RPC را صدا می‌زند.

## مشخصات تابع

| ویژگی | مقدار |
|---|---|
| نام | `public.calculate_dynamic_score` |
| پارامترها | `p_entity_type text`, `p_entity_id uuid`, `p_period_month date default null` |
| خروجی | `jsonb` |
| Language | `plpgsql` |
| Volatility | `STABLE` |
| Security | `SECURITY INVOKER` با `SET search_path = public` |
| دسترسی | `GRANT EXECUTE TO authenticated, service_role` |

چرا INVOKER نه DEFINER: RLS فعلی روی `dynamic_entity_scores` خواندن را به همه authenticated می‌دهد، پس DEFINER ارزش افزوده ندارد. INVOKER انتخاب امن‌تر است: اگر بعداً read را محدود کنیم، این تابع هم خودکار محدود می‌شود.

## منطق گام‌به‌گام

1. **Validation:** `p_entity_type` باید در `('customer','salesperson')` باشد وگرنه `RAISE EXCEPTION`. `p_period_month := date_trunc('month', coalesce(p_period_month, current_date))::date`.

2. **CTE `active_params`:** پارامترهای فعال آن entity_type از `dynamic_scoring_parameters`.

3. **CTE `weighted`:** JOIN با `dynamic_parameter_weights` روی `valid_from <= period AND (valid_to IS NULL OR valid_to >= period)`. exclusion constraint فاز ۱ تضمین می‌کند حداکثر یک ردیف معتبر برگردد.

4. **CTE `scored`:** LEFT JOIN با `dynamic_entity_scores` روی `(entity_type, entity_id, parameter_id, period_month)` تا پارامترهای بدون امتیاز هم بمانند.

5. **محاسبه `total_active_weight`:** sum وزن‌ها فقط روی ردیف‌های `raw_score IS NOT NULL`. اگر صفر شد → `weighted_score = null`.

6. **نرمال‌سازی:** `normalized_weight = raw_weight / total_active_weight` (فقط برای ردیف‌های دارای امتیاز؛ بقیه = 0).

7. **محاسبه:** `contribution = raw_score * normalized_weight`, `weighted_score = sum(contribution)`.

8. **ساخت jsonb** با `jsonb_build_object` + `jsonb_agg`.

## نکات لبه

- `total_active_weight = 0` → `weighted_score = null`، breakdown همه پارامترهای فعال با `has_score=false`.
- هیچ پارامتر فعالی نیست → `parameters_active = 0`, `weighted_score = null`, `breakdown = []`.

## تست پس از اجرا

1. فراخوانی برای entity بدون امتیاز → `weighted_score = null`, `parameters_evaluated = 0`.
2. ثبت یک امتیاز و فراخوانی مجدد → `weighted_score = raw_score` (نرمال‌سازی تک‌پارامتر = ۱).
3. ثبت دو امتیاز مختلف → بررسی صحت میانگین وزنی.

---

**منتظر تأیید شما هستم.** پس از تأیید: یک migration واحد شامل تابع + `GRANT EXECUTE` + COMMENT.
