# OWNER-CHECK-CHROME — observe only on http://192.168.170.8:3100

Paste into Claude in Chrome. Do not change settings, do not submit a real Torob report, do not type passwords into chat.

You are observing the AfraKala test app at http://192.168.170.8:3100. The owner will sign in. You only look and report.

Walk this path and write what you actually see (headings, counts, empty states). If a lock screen titled «ورود به عملیات ترب» blocks a page, say so and stop that page.

1. Open `/torob-ops`. After unlock (owner types the module password himself), confirm the heading is «عملیات ترب», not «جزئیات».
2. Open `/torob-ops/settings`. Confirm «چشم ترب» and «کلید اضطراری» are visible. Do not toggle auto-report.
3. Open `/torob-ops/runs`. For the newest run, write products total, findings total, and any skip-reason text. A run with 0 findings must say why.
4. Open `/torob-ops/findings`. If a row exists, write seller name, our price, their price. Follow «تاریخچه قیمت» if present.
5. Open `/torob-ops/history`. If a chart renders, say so; if it says there is no snapshot yet, quote that sentence.
6. Open `/torob-ops/shops` and `/torob-ops/accounts`. Confirm page titles are the real names.
7. Look at the in-app notification bell. Is there a row titled «آزمایش چشم ترب» or «رقیب ارزان‌تر از ما»? Yes/no, do not open other users.

Return a short list: seen / not seen / blocked by lock, per step. No advice, no clicks that write data.
