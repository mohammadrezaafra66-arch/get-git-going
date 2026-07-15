## ریشه مشکل تغییر نقش
جدول `messenger_group_members` هیچ **UPDATE policy** ندارد (فقط SELECT/INSERT/DELETE). به همین علت `UPDATE ... .select()` صفر ردیف برمی‌گرداند و کد ما toast خطای «شما دسترسی تغییر نقش را ندارید…» نشان می‌دهد. ادمین‌های گروه هم عملاً قادر به تغییر نقش نیستند.

## اصلاح پیشنهادی (فقط یک migration کوچک)

افزودن UPDATE policy روی `public.messenger_group_members` که فقط سازنده گروه (`messenger_groups.created_by = auth.uid()`) اجازه تغییر داشته باشد — همان الگویی که policyهای DELETE/INSERT از آن استفاده می‌کنند. بدون تغییر schema، بدون تغییر GRANTها، بدون افزودن ستون یا تابع جدید.

```sql
CREATE POLICY messenger_members_update_creator
  ON public.messenger_group_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.messenger_groups g
            WHERE g.id = messenger_group_members.group_id
              AND g.created_by = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.messenger_groups g
            WHERE g.id = messenger_group_members.group_id
              AND g.created_by = auth.uid())
  );
```

هیچ تغییر کد frontend لازم نیست؛ همان mutation فعلی حالا ردیف را واقعا آپدیت می‌کند و toast «نقش به‌روزرسانی شد» درست کار می‌کند.

## در مورد ارور دستیار AI

متن ارور «شما دسترسی تغییر نقش را ندارید یا عضو یافت نشد» فقط از فایل `GroupMembersDialog.tsx` می‌آید و هیچ code path دیگری این متن را toast نمی‌کند. یعنی توست‌های واقعی دستیار AI که در `AiAssistantDrawer.tsx` صادر می‌شوند متن‌های متفاوتی دارند:
- «ارتباط با دستیار برقرار نشد (کد X)»
- «پاسخ دستیار طول کشید…»
- «دسترسی به سرویس دستیار محلی برقرار نشد…»
- «خطا در دستیار: <reason>»
- بنر «دستیار هوشمند هنوز فعال نیست»

بنابراین برای تشخیص واقعی خطای AI، در پیام بعدی لطفاً متن **دقیقاً همان طور که در toast دستیار AI ظاهر می‌شود** (screenshot یا copy مستقیم از drawer دستیار، نه از تغییر نقش) ارسال کنید. اگر جواب `disabled` بود یعنی روی این محیط `OLLAMA_API_URL` ست نشده و خود دستیار غیرفعال است؛ اگر `کد 401` یا `500` بود مشکل احراز/سرور است.

## دامنه تغییر
- یک migration جدید (افزودن policy)
- بدون تغییر هیچ فایلی در `src/`
- بدون افزودن dependency
- بدون تأثیر روی امنیت (policy محدود به سازنده گروه)

## قدم بعد
- اجرای migration
- تست دستی: در `/messages`، به عنوان سازنده گروه، نقش یک عضو غیر-خود را تغییر بده — باید «نقش به‌روزرسانی شد» بیاید و مقدار دراپ‌داون بماند.
- سپس متن دقیق toast دستیار AI را دریافت کنم و اگر واقعا باگ مستقلی است در همان دور رفع می‌کنم.