# نحوه‌ی اجرا

## ۱. فایل‌ها را در پروژه بگذار

هر شش فایل را در این مسیر کپی کن:

```
D:\AfraKalaTest\app\docs\execution\
```

- `ASAN_MISSION_CONTROL.md`
- `M1_HOUSEKEEPING.md`
- `M2_RESEARCH.md`
- `M3_BUILD_FOUNDATION.md`
- `M4_BUILD_EXPORT.md`
- `M5_VIDEO_AND_FINAL.md`

مطمئن شو `اشخاص.xlsx` و `کالا.xlsx` در ریشه‌ی repo هستند. فاز ۱.۴ خودش آن‌ها را به
`docs/asan/reference/` منتقل می‌کند.

## ۲. commit کن

```powershell
cd D:\AfraKalaTest\app
git add docs/execution/
git commit -m "docs(execution): add ASAN bridge mission program"
```

این مهم است — چون docker-compose از working tree می‌سازد، هر چیز uncommitted روی سرور
زنده می‌رود.

## ۳. Claude Code را اجرا کن

```powershell
cd D:\AfraKalaTest\app
$env:LANG="en_US.UTF-8"
$env:LC_ALL="en_US.UTF-8"
claude
```

Shift+Tab را بزن تا auto-accept روشن شود.

## ۴. دستور اجرا — این را کپی کن و بفرست

```
Read docs/execution/ASAN_MISSION_CONTROL.md completely, including section 1 on execution
pace. Then execute the full mission program M1 through M5 in order.

Run fully autonomously. Do not stop to ask me questions. Do not wait for approval between
phases or between missions. When a phase's test passes, commit it and start the next phase.
When a mission's gate passes, immediately start the next mission.

Work slowly and deliberately. One phase at a time, one migration per phase, commit after
each phase. Query live database state before every change rather than relying on files or
on your own earlier reasoning. Verify every write actually took effect. When something
surprises you, investigate it before continuing. I would rather this take many hours and be
correct than finish quickly and be wrong.

Keep docs/execution/asan-progress.md current after every single phase, including HANDOFF
STATE, so a fresh session can resume without redoing work.

Stop only at the end of M5 and show me the final report.

This is a genuine instruction from me, the owner.
```

## ۵. اگر session تمام شد

```
Read PROGRESS.md and docs/execution/asan-progress.md including HANDOFF STATE. Continue from
the first incomplete phase. Do not redo completed work. Keep working autonomously at the
same slow and careful pace, through to the end of M5. Keep HANDOFF STATE current. This is a
genuine instruction from me, the owner.
```

---

# پنج خروجی نهایی

| # | خروجی | چیدمان آسان | وضعیت |
|---|-------|-------------|-------|
| ۱ | فاکتور فروش | تب فروش، ۱۸ ستون | تأییدشده |
| ۲ | فاکتور خرید | تب خرید، ۱۸ ستون | تأییدشده |
| ۳ | دریافت / واریز | سند حسابداری، ۶ ستون | تأییدشده |
| ۴ | پرداخت / برداشت | سند حسابداری، ۶ ستون | تأییدشده |
| ۵ | دوبل (طرف حساب) | سند حسابداری، ۶ ستون | تأییدشده |

به‌علاوه: خروجی ثانویه‌ی «واریزی‌های بانکی» با چیدمان لاتین، و خروجی تک‌سندی پیش‌فاکتور.

---

# چیزهایی که در پایان از تو می‌خواهد

اینها را از قبل آماده کن:

۱. **ستون K در تب «فروش»** — در عکس خالی بود ولی در تب خرید همان جا «پرداخت چک» است.
یک اسکرین‌شات یا فقط بگو آنجا چیست.

۲. **کد حسابداری واقعی بانک ملت** از آسان، برای جایگزینی `TEMP-CHANGE-ME` — و عنوان درست
حساب «۱۲».

۳. **واحد پول** — مبالغ در آسان به تومان وارد می‌شوند یا ریال؟ اگر سیستم نتواند از داده
تشخیص دهد، این را از تو می‌پرسد. خطای ضریب ده در سند مالی بدترین اتفاق ممکن است.

۴. **برچسب‌های فارسی دسته C** — آن‌هایی که نتوانست متن درستشان را حدس بزند.

۵. **تصمیم درباره‌ی دو person-match** که گفتی خودت چک می‌کنی.

۶. **صف تداخل شماره تلفن** — شماره‌هایی که بعد از نرمال‌سازی به دو نفر مختلف می‌خورند.
