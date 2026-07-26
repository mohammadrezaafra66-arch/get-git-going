# پکیج F — فیش واریزی، OCR، GPT، خروجی اکسل

**آیتم‌ها:** ۱۴۰(الف)، ۱۴۴، ۱۹۳

## خلاصهٔ پکیج

سه محور بررسی شد. **(۱۴۰-الف)** باگ خروجی اکسلِ فهرست فیش‌ها **قبلاً روی همین برنچ سرور رفع شده** (کامیت `67bb81de`): علت ریشه‌ای انتخابِ ستون ناموجودِ `name` روی `external_parties` بود که کل کوئری PostgREST را با خطای ۴۰۰ رد می‌کرد؛ با curl هم نسخهٔ خراب (۴۰۰) و هم نسخهٔ اصلاح‌شده (۲۰۰) بازتولید شد. **(۱۴۴)** آپلود عکس فیش + استخراج داده **داخل خودِ اپ** به‌طور کامل ساخته و سیم‌کشی شده (باکت خصوصی، جدول اسناد، سرور-فانکشن OCR، اعمال خودکار روی فیش)؛ اما سرویس مستقل `ocr-service/` **اصلاً وجود ندارد** و در هیچ compose تعریف نشده — قابلیت OCR به داخل اپ منتقل شده است. **(۱۹۳)** لایهٔ اتصال به LLM کامل است (جدول `ai_providers` با نوع `ollama`/`openai_compatible`، کلاینت مشترک `client.server.ts`، failover)؛ ارائه‌دهندهٔ سازگار با GPT ثبت و کلیددار است، ولی برای OCR رسید (قابلیت vision) **هنوز هیچ ارائه‌دهنده‌ای قابلیت vision را اعلام نکرده**، پس OCR تصویری فعلاً غیرفعال است.

---

### آیتم ۱۴۰ (الف) — باگ خروجی اکسلِ فهرست فیش‌های واریزی

**وضعیت:** ✅ کامل (باگ روی سرور رفع شده است)

**پاسخ کوتاه:** علت ریشه‌ایِ باگ، انتخاب ستون ناموجودِ `name` از جدول `external_parties` در `select` خروجی اکسل بود که باعث می‌شد PostgREST **کل کوئری** را با HTTP 400 (`column external_parties_1.name does not exist`) رد کند. این باگ در کامیت `67bb81de` با تغییر به `full_name` رفع شده و همان کامیت در HEAD سرور (`a9315e78`) حاضر است؛ اکنون کوئری ۲۰۰ برمی‌گرداند.

**شواهد:**

- **L1 (UI):** `src/routes/_app.accounting.receipts.tsx:299-311` — دکمهٔ «خروجی اکسل» (`onClick={handleExportExcel}`)؛ تابع در خطوط `105-240`.
- **L2 (front):** کوئری بازسازی‌شدهٔ PostgREST که فرانت می‌سازد (`handleExportExcel`، خطوط ۱۰۹–۱۲۱):
  - `from("payment_receipts")`
  - `select`: `id, amount, payment_date, payment_time, receipt_time, tracking_number, status, receipt_type, posting_status, posted_at, description, rejection_reason, bank_name, source_bank, destination_bank, payer_name, payer_phone, payer_accounting_code, receiver_name, receiver_phone, receiver_accounting_code, created_at, created_by,` به‌همراه سه embed:
    - `customer:customers(id, name, phone, accounting_code)`
    - `destination_bank_account:bank_accounts!payment_receipts_destination_bank_account_id_fkey(id, title)`
    - `receiver_party:external_parties!payment_receipts_receiver_party_id_fkey(id, full_name)`
  - `order(created_at desc)` و `limit(5000)` و فیلترهای اختیاری `status/customer_id/payment_date`.
- **L3 (DB) — صحت ستون‌ها و FKها:**
  - هر ۲۳ ستون پایهٔ `select` واقعاً روی `payment_receipts` وجود دارند (تأیید از `information_schema.columns`؛ جدول ۳۷ ستون دارد).
  - نام FKها دقیقاً معتبر است (از `pg_get_constraintdef`):
    - `payment_receipts_destination_bank_account_id_fkey` → `bank_accounts(id)` ✅
    - `payment_receipts_receiver_party_id_fkey` → `external_parties(id)` ✅
  - ستون‌های embed هم موجودند: `customers(name,phone,accounting_code)` ✅، `bank_accounts(title)` ✅، `external_parties(full_name)` ✅. اما `external_parties` **ستون `name` ندارد** (فقط `id, full_name`) — همین بود ریشهٔ باگ قبل از اصلاح.
  - کامیت رفع: `67bb81de fix: export receipt receiver party name` — دیفِ کلیدی: `external_parties!...(id, name)` → `external_parties!...(id, full_name)`؛ و `git merge-base --is-ancestor 67bb81de HEAD` = **ancestor** است (یعنی روی سرور هست).
- **L4 (access):** گارد route: `requireAnyRole(["admin","manager","accountant"])` (خط ۵۷-۵۹). سیاست‌های RLS برای `SELECT` روی هر چهار جدول موجود و با همین نقش‌ها هم‌راستا هستند:
  - `payment_receipts.pr_select_privileged`: `has_any_role(uid(), ['admin','manager','accountant'])`
  - `bank_accounts.bank_accounts_select_finance` و `external_parties.external_parties_select_finance`: `admin OR manager OR accountant`
  - `customers.read customers by role` (SELECT، نقش `authenticated`).

**بازتولید با curl (از سرور، Kong روی `127.0.0.1:9000`):** کلید anon فقط داخل متغیر شل خوانده شد و **چاپ نشد**.
- کوئری خرابِ قدیمی (`...external_parties!...(id,name)`): **HTTP 400** →
  `{"code":"42703","details":null,"hint":null,"message":"column external_parties_1.name does not exist"}`
- کوئری اصلاح‌شدهٔ فعلی (`...(id,full_name)`): **HTTP 200** → `[]`
- (توجه: خطای ۴۲۷۰۳ در مرحلهٔ planning و پیش از فیلترِ RLS برمی‌گردد، لذا حتی با نقش anon هم همان خطای شِما را می‌دهد؛ این خطا مستقل از دسترسی است.)

**limit=5000 و تایم‌اوت/مموری:** عامل باگ نیست. جدول اکنون `count(*) = 0` ردیف دارد؛ حتی با داده هم PostgREST خطای فوق را در مرحلهٔ planning و پیش از خواندن ردیف می‌دهد، پس به سقف ۵۰۰۰ ربطی ندارد.

**شکاف نسبت به نیازمندی:** عملاً هیچ؛ باگ رفع شده. تنها نکته: چون `payment_receipts` فعلاً **صفر ردیف** دارد، دکمهٔ خروجی پیام «داده‌ای برای خروجی وجود ندارد» را نشان می‌دهد (خط ۱۳۰-۱۳۲) — این «نبودِ داده» است نه باگ.

**برنچ:** بله؛ کامیت رفع (`67bb81de`) جدِ HEAD سرور (`a9315e78`) است.

**وابستگی‌ها:** کتابخانهٔ `xlsx` (import پویا، خط ۱۰۸)؛ سیاست‌های RLS مالی؛ جدول‌های `customers/bank_accounts/external_parties/profiles`.

**برای رفع چه لازم است:** چیزی لازم نیست؛ باگ اصلی رفع شده. برای تست عملی، وجود حداقل یک ردیفِ فیش لازم است تا خروجی واقعی تولید شود.

**ریسک/پیچیدگی:** پایین — تغییر یک‌کلمه‌ای که قبلاً اعمال و روی سرور است.

---

### آیتم ۱۴۴ — آپلود عکس فیش و استخراج داده (داخل اپ)

**وضعیت:** ✅ کامل (داخل اپ، بدون سرویس مجزا)

**پاسخ کوتاه:** آپلود عکس/فایل فیش و استخراج داده به‌طور کامل داخل خودِ اپ ساخته و سیم‌کشی شده است: باکت خصوصی `payment-receipt-documents`، جدول `payment_receipt_documents` با ستون‌های استخراج، سرور-فانکشن OCR، و اعمال خودکار/دستیِ نتیجه روی فیش. سرویس مستقلِ `ocr-service/` وجود ندارد و کاری هم نمی‌کند (به آیتم بعدی مراجعه شود).

**شواهد:**

- **L1 (UI):**
  - انتخاب/آپلود فایل: `src/components/accounting/PaymentReceiptDocuments.tsx` — `ReceiptDocumentPicker` (خط ۳۷۱) و لیست مدیریتی `ReceiptDocumentsList` (خط ۴۷۵)؛ دکمهٔ «آپلود تصویر یا فایل» (خط ۴۲۰) و «استخراج اطلاعات از فیش» (خط ۱۰۵۸) و «اعمال اطلاعات استخراج‌شده روی فیش» (خط ۱۰۷۳).
  - **mount واقعی:** این کامپوننت‌ها در `src/shared/components/PaymentReceiptForm.tsx` و `src/routes/_app.accounting.receipts.$receiptId.tsx` استفاده می‌شوند (تأیید با grep).
  - انواع مجاز: تصویر/PDF/متن/Office/آرشیو، سقف ۲۰MB و تا ۱۰ فایل (خطوط ۶۲–۱۱۲).
- **L2 (front):** آپلود `uploadReceiptDocuments` (خط ۳۰۷) → `supabase.storage.from("payment-receipt-documents").upload(...)` + insert در `payment_receipt_documents` + audit log. استخراج `extractMutation` (خط ۵۹۰) سرور-فانکشن `extractReceiptDocumentOcr` را صدا می‌زند (`src/lib/receipt-ocr.functions.ts`)، سپس با `parseReceiptText/scoreExtraction/decideStatus` امتیازدهی و به‌طور خودکار `amount` و `tracking_number` را روی فیش اعمال می‌کند (خطوط ۶۹۴–۷۵۲). auto-extract پس از آپلود هم فعال است (خط ۸۳۶-۸۴۵).
- **L3 (DB):**
  - فیلد فایل روی خودِ `payment_receipts`: ستون legacy `receipt_image_url` وجود دارد، اما مدل اصلی جدول جداگانهٔ **`payment_receipt_documents`** است با ستون‌های: `receipt_id, storage_path, file_name, file_type, file_size, uploaded_by, extraction_status, extracted_data(jsonb), extraction_confidence(numeric), extraction_notes` (تأیید از `information_schema.columns`).
  - **باکت storage:** `SELECT id,name,public FROM storage.buckets` → ردیف `payment-receipt-documents` با `public=f` (خصوصی) موجود است (به‌همراه ۶ باکت دیگر). دسترسی از طریق signed URL کوتاه‌مدت انجام می‌شود (خط ۵۳۵-۵۳۸).
- **L4 (access):** RLS جدول `payment_receipt_documents`:
  - `prd_select_privileged` (SELECT): `admin OR manager OR accountant`
  - `prd_insert_admin_accountant` (INSERT) و `prd_delete_admin_accountant` (DELETE): `admin OR accountant`
  - در فرانت هم `canManage = hasAnyRole(roles, ["admin","accountant"])` (خط ۴۸۴) عملیات مدیریتی را محدود می‌کند.

**شکاف نسبت به نیازمندی:** استخراج **متنی** (text/PDF متن‌دار) کامل کار می‌کند؛ اما استخراج از **تصویر** به وجود یک ارائه‌دهندهٔ vision وابسته است که فعلاً پیکربندی نشده (آیتم ۱۹۳). یعنی آپلود عکس کار می‌کند ولی OCR تصویری تا فعال‌شدن provider، وضعیت «unsupported/نیازمند بازبینی» می‌دهد.

**برنچ:** بله؛ همهٔ فایل‌ها/جدول‌ها/باکت روی درخت‌کاریِ سرور موجودند.

**وابستگی‌ها:** باکت `payment-receipt-documents`، جدول `payment_receipt_documents`، سرور-فانکشن OCR، رجیستری `ai_providers` برای OCR تصویری، کتابخانهٔ `unpdf` برای متنِ PDF.

**برای رفع چه لازم است:** برای فعال‌شدن OCR تصویری، ثبت یک ارائه‌دهندهٔ vision در `ai_providers` لازم است (بخش ۱۹۳)؛ خودِ آپلود/استخراج متنی نیازی به کار ندارد.

**ریسک/پیچیدگی:** پایین برای آپلود/متن؛ متوسط برای OCR تصویری (وابسته به پیکربندی provider و کیفیت مدل).

---

### آیتم ۱۴۴ (بخش سرویس) — دایرکتوری `ocr-service/`

**وضعیت:** ❌ وجود ندارد (به‌عنوان سرویس مجزا) — جایگزین شده با پیاده‌سازی داخل اپ

**پاسخ کوتاه:** هیچ دایرکتوری `ocr-service/` در `D:\AfraKalaTest\` یا `D:\AfraKalaTest\app\` وجود ندارد، هیچ فایل `.py`/`setup_db.py` در مخزن نیست، و در هیچ docker-compose تعریف نشده. قابلیت OCR به‌جای سرویس جدا، مستقیماً داخل اپ (سرور-فانکشن + رجیستری AI) پیاده شده است.

**شواهد (روش جست‌وجو):**

- `find /d/AfraKalaTest -maxdepth 2 -iname "*ocr*"` → هیچ دایرکتوری‌ای برنگرداند؛ `ls ocr-service/` در ریشه و در `app/` → موجود نیست.
- `find ... -name "setup_db.py"` و `find ... -name "*.py"` → **هیچ فایل پایتونی** در مخزن نیست. پس «آیا setup_db.py اجرا شده؟» موضوعیت ندارد (اسکریپت و جدول‌های مختصِ آن سرویس وجود ندارند).
- تنها ارجاع متنی به `ocr-service` در فایل `AfraKala-research-brief-140-193.md:345` (خودِ سند پژوهش) است، نه در کد/کانفیگ.
- docker-compose: فقط `docker-compose.yml.bak` در ریشه هست؛ compose فعالِ نسخه‌دار در مخزن اپ نیست و سرویسی به‌نام ocr در آن تعریف نشده.
- فراخوانی از فرانت: grep روی `ocr-service`/`ocr_service` در `src` هیچ نتیجه‌ای نداشت؛ کل مسیر OCR از طریق `src/lib/receipt-ocr.functions.ts` و کلاینت مشترک AI است.

**وضعیت `SUPABASE_SERVICE_KEY` در `.env` سرویس:** قابل‌ارزیابی نیست چون نه دایرکتوری سرویس و نه `.env` آن وجود دارد. (نکته: اپ خودش برای دسترسی سرور از `SUPABASE_SERVICE_ROLE`/service client داخلی استفاده می‌کند، مستقل از این سرویسِ ناموجود.)

**شکاف نسبت به نیازمندی:** اگر نیازمندی «یک میکروسرویس OCR جدا» بوده، آن وجود ندارد؛ اما معادلِ کارکردی‌اش داخل اپ پیاده شده. بنابراین از منظر قابلیت، شکاف واقعی نیست؛ از منظر معماریِ درخواستی، سرویس مجزا حذف شده.

**برنچ:** روی سرور هم همین است (سرویس مجزا وجود ندارد).

**وابستگی‌ها:** ندارد.

**برای رفع چه لازم است:** اگر معماریِ سرویس‌محور واقعاً لازم است، باید از صفر ساخته و به compose افزوده شود؛ در غیر این صورت مسیر داخل‌اپ کفایت می‌کند و کاری لازم نیست.

**ریسک/پیچیدگی:** پایین (تصمیم معماری، نه باگ).

---

### آیتم ۱۹۳ — اتصال LLM / سیستم مدیریت کلید API و پشتیبانی از GPT

**وضعیت:** 🔶 جزئی — زیرساخت LLM کامل و کلیددار است، اما برای OCR رسید (vision) هنوز پیکربندی نشده

**پاسخ کوتاه:** اتصال LLM در پروژه وجود دارد و پخته است: جدول `ai_providers` (با نوع `ollama` و `openai_compatible`)، توابع `admin_upsert_ai_provider`/`ai_get_provider_key`، و کلاینت مشترک سروری با failover بر اساس `priority`. کلیدِ نوعِ «GPT» از طریق `kind='openai_compatible'` پشتیبانی می‌شود و یک ارائه‌دهندهٔ کلیددار هم ثبت است؛ اما هیچ ارائه‌دهنده‌ای فعلاً قابلیت `vision` را اعلام نکرده، پس برای OCR رسید هنوز قابل‌استفاده نیست.

**شواهد:**

- **جدول کلیدها = `ai_providers`** (نه `bot_api_keys`). ستون‌های کلیدی (از `information_schema` و `pg_constraint`):
  - `kind text` با CHECK: `kind = ANY (ARRAY['ollama','openai_compatible'])` → مقدار «GPT» به‌صورت `openai_compatible` پشتیبانی می‌شود.
  - `capabilities text[]` با CHECK: `capabilities <@ ARRAY['chat','embeddings','vision']`.
  - `base_url, chat_model, embed_model, vision_model, priority, is_active, secret_id, key_prefix`. کلید در `secret_id` (vault) ذخیره می‌شود؛ `ai_get_provider_key(p_provider_id uuid)` آن را برمی‌گرداند (کلید هرگز در فرانت خوانده نمی‌شود).
- **تابع نگه‌داری:** `admin_upsert_ai_provider(p_id, p_name, p_label, p_kind, p_base_url, p_is_active, p_priority, p_chat_model, p_embed_model, p_vision_model, p_capabilities text[], p_api_key, p_notes)` — پارامتر `p_api_key` برای ثبت/به‌روزرسانی کلید GPT.
- **ارائه‌دهنده‌های ثبت‌شده (بدون افشای کلید):**

  | kind | is_active | has_key | capabilities | chat_model | vision_model | priority | base_url |
  |---|---|---|---|---|---|---|---|
  | ollama | t | **خیر** | `{chat,embeddings}` | qwen2.5:7b | qwen3.6:latest | 10 | `http://192.168.170.8:11434` |
  | openai_compatible | t | **بله** | `{chat}` | — | — | 8 | `https://platform.openai.com/` |

- **کلاینت مشترک AI:** `src/lib/ai/client.server.ts` — توابع `aiChat` (خط ۳۱۶)، `aiEmbed` (۳۶۸)، `aiVision` (۴۲۵)؛ انتخاب provider بر اساس `capabilities` و ترتیب `priority` صعودی با failover؛ فقط server-only (کلید را می‌خواند، خط ۹). مسیر SSE چت: `src/routes/api/messenger/ai-chat.ts` (موجود، ~۱۲KB) و درنِر `src/components/messenger/AiAssistantDrawer.tsx` (اشاره به `OLLAMA_API_URL` در پیام خطا).
- **مصرف در OCR رسید:** `src/lib/receipt-ocr.functions.ts:204` تابع `aiVision(...)` را برای عکس فیش صدا می‌زند. اما چون هیچ provider قابلیت `vision` را اعلام نکرده، `listProvidersFor("vision")` آرایهٔ خالی برمی‌گرداند → `reason: "no_provider"` → تابع OCR وضعیت `disabled/unsupported` («موتور OCR تصویری در این محیط فعال نیست») می‌دهد. کامنت خودِ کد (خطوط ۱۹۹–۲۰۳) تأکید می‌کند Ollama عمداً vision را اعلام نمی‌کند چون در پروبِ ۲۰۲۶-۰۷-۲۴ ارقام فارسی را اشتباه خوانده (۴۵٬۰۰۰٬۰۰۰ را ۲۵٬۰۰۰٬۰۰۰).

**قابل‌استفاده برای رسید؟** زیرساخت بله، پیکربندی خیر. برای OCR رسید باید یک ارائه‌دهندهٔ vision فعال شود — یا ارائه‌دهندهٔ `openai_compatible` موجود را با افزودن `vision` به `capabilities` و مقداردهی `vision_model` (مدل GPT دیدی) ارتقا داد (کلید از قبل ثبت است، `has_key=t`)، یا یک provider جدید ثبت کرد.

**شکاف نسبت به نیازمندی:** «اتصال GPT» به‌عنوان kind و کلید موجود و کلاینت آماده است؛ اما هیچ‌کدام از دو ارائه‌دهندهٔ فعال، قابلیت `vision` یا `vision_model` ندارند، لذا زنجیرهٔ OCR رسید تا زمان افزودن یک provider دیدی، عملاً غیرفعال است. ارائه‌دهندهٔ چتِ GPT هم فعلاً `chat_model` خالی دارد (برای چت هم باید مدل ست شود).

**برنچ:** بله؛ جدول‌ها/توابع/کلاینت روی درخت‌کاریِ سرور موجودند.

**وابستگی‌ها:** جدول `ai_providers` + `ai_provider_health`، توابع `admin_upsert_ai_provider`/`ai_get_provider_key`/`ai_record_provider_health`، Supabase Vault برای کلید، اتصال شبکه به Ollama LAN یا Endpoint سازگار با OpenAI.

**برای رفع چه لازم است:** از طریق پنل ادمین (تابع `admin_upsert_ai_provider`) یک ارائه‌دهندهٔ `openai_compatible` با `capabilities` شامل `vision`، `vision_model` معتبر و کلید معتبر ثبت/ارتقا شود؛ سپس با `testProviderCapability(..., "vision")` صحت اتصال آزموده شود. برای چت GPT هم `chat_model` مقداردهی شود.

**ریسک/پیچیدگی:** متوسط — بدون تغییر کد و صرفاً پیکربندی، ولی نیازمند کلید معتبر، دسترسی شبکه و بررسی هزینه/کیفیت خواندن ارقام فارسی.
