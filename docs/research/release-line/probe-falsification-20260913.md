# اثباتِ اینکه probe بی‌ارزش نیست — ۷.۴

یک probe که هرگز قرمز نمی‌شود، ارزشی ندارد. این سند نشان می‌دهد probeِ D6 روی
**همان image حادثه** قرمز می‌شود.

## روش

همان منطقِ D6(i) و D6(ii)، بدون تغییر، روی دو image اجرا شد. هیچ literalی کاشته
نشد: image حادثه واقعاً موجود است (`296eb4b4899f`، ساخته‌شده از `3bc526c4`)، پس
بازتولیدِ مصنوعی لازم نبود.

## نتیجه — `compared`

```
--- D6(i)+(ii) against THE ACTUAL INCIDENT IMAGE (3bc526c4) (296eb4b4899f) ---
  FAIL D6(i): host literal(s) baked into the client bundle:
      http://192.168.170.8:9000
  FAIL D6(ii): __APP_RUNTIME_CONFIG__ absent from client bundle
  block verdict: FAIL

--- D6(i)+(ii) against the fixed image (afrakala-app:rc-banner) ---
  OK D6(i): no baked host literal in the client bundle
  OK D6(ii): runtime config mechanism present
  block verdict: PASS
```

## چرا این مهم است

`http://192.168.170.8:9000` دقیقاً همان رشته‌ای است که در ۲۰۲۶-۰۹-۱۳ مرورگر
کارمندان را به دیتابیس تست برد. probe آن را **نام می‌برد**، نه اینکه فقط بگوید
«چیزی اشتباه است».

و دو بند با هم لازم‌اند: image حادثه هر دو را رد می‌کند، ولی یک image خرابِ دیگر
می‌تواند D6(i) را پاس کند (هیچ literal ندارد) و D6(ii) را رد کند (هیچ مکانیزمی
هم ندارد) — یعنی کلاینتی که اصلاً آدرس ندارد. هیچ‌کدام به‌تنهایی کافی نیست.

## آنچه این سند ثابت نمی‌کند

اینکه probe **هر** شکل از پیکربندی اشتباه را می‌گیرد. فقط این کلاس را می‌گیرد:
آدرسِ میزبان که در bundle کلاینت پخته شده باشد. یک مقدار اشتباه که در زمان اجرا
از محیط بیاید (مثلاً `.env.lan` غلط روی خودِ مقصد) از این probe رد می‌شود و
بند (iii) برای همان است.
