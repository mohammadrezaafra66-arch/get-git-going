# E2E Browser Validation — Items 211 to 218

تاریخ اجرا: 2026-07-29  
محیط: LAN test only  
App URL: `http://192.168.170.8:3100`  
WhatsApp UI: `http://192.168.170.8:3002/reporting`  
WhatsApp API: `http://192.168.170.8:8002`  
Branch: `feature/navigation-modernization`  
HEAD: `0201160e9f411d1fd344e9ec68a15fdbbbb893a5`  
Runtime `APP_GIT_SHA`: `0201160e`  
Runtime `APP_BUILD_TIME`: `2026-07-29T16:24:29Z`  
Host: `VIRA-SERVICE`  
DB container: `afrakala-lan-db`  
DB name: `afrakala`  
Web container: `afrakala-lan-web`  

هیچ `Migration`، `Commit`، `Push`، `Merge`، `Reset`، `Clean` یا rebuild انجام نشد.

## Browser/Auth Result

مرورگر واقعی Codex باز شد و چند route در `http://192.168.170.8:3100` مشاهده شد.  
هیچ `stored browser session` یا `Playwright storageState` قابل استفاده پیدا نشد.  
صفحه‌های محافظت‌شده هنگام دسترسی مستقیم یا به `/login` رفتند یا با کاربر `بدون نقش` render شدند.  
اکانت‌های تست در دیتابیس وجود دارند، اما password/credential تستی قابل استفاده در مستندات یا محیط پیدا نشد و طبق دستور، هیچ secret/password چاپ یا تغییر داده نشد.

نتیجه: تست‌های نوشتنی واقعی که نیاز به نقش `sales`، `accountant`، `admin` یا `manager` داشتند، از نظر مرورگر `BLOCKED` شدند. برای جلوگیری از دور زدن UI و تولید نتیجه غیرواقعی، هیچ رکورد تستی مستقیم با SQL/API ساخته نشد.

## Evidence Files

Screenshots:

- `docs/audits/evidence/211-218-e2e/auth-state-messages-no-role.png`
- `docs/audits/evidence/211-218-e2e/214-source-reporting-page.png`
- `docs/audits/evidence/211-218-e2e/214-market-intelligence.png`
- `docs/audits/evidence/211-218-e2e/214-1-purchase-advisor.png`
- `docs/audits/evidence/211-218-e2e/217-visitors-route-no-role.png`
- `docs/audits/evidence/211-218-e2e/218-receipt-create-route-no-role.png`

## Environment Proof

| مورد | نتیجه |
|---|---|
| Hostname | `VIRA-SERVICE` |
| Branch | `feature/navigation-modernization` |
| HEAD | `0201160e9f411d1fd344e9ec68a15fdbbbb893a5` |
| `/api/version` | 200, commit `0201160e`, environment `lan` |
| Web container | `afrakala-lan-web`, healthy, port `3100->3000` |
| DB container | `afrakala-lan-db`, healthy |
| DB name | `afrakala` |
| WhatsApp env | `WHATSAPP_PLATFORM_BASE_URL=http://192.168.170.8:8002` |

## Database Before/After

| جدول | قبل | بعد | تغییر |
|---|---:|---:|---:|
| `sales_quotes` | 39 | 39 | 0 |
| `payment_receipts` | 3 | 3 | 0 |
| `visitors` | 1 | 1 | 0 |
| `notification_queue` | 0 | 0 | 0 |

Prefix audit rows after test:

| نوع | تعداد |
|---|---:|
| `E2E_AUDIT_20260729_` visitors | 0 |
| `E2E_AUDIT_20260729_` quotes | 0 |
| `E2E_AUDIT_20260729_` receipts | 0 |
| `E2E_AUDIT_20260729_` notifications | 0 |

No test rows were created, cleaned up, or left behind.

## Required Summary Table

| شماره | سناریو | مرورگر | Write test | Reload | DB verified | Permission | Screenshot | نتیجه |
|---|---|---|---|---|---|---|---|---|
| 211 | Reject quote reason and salesperson notification | Login-required route blocked | No | No | Read-only counts only | BLOCKED: no role session | No dedicated 211 screenshot | BLOCKED |
| 212-A | Credit sufficient/insufficient base guard | Login-required quote creation blocked | No | No | Read-only schema/counts | BLOCKED: no sales session | No dedicated 212 screenshot | BLOCKED |
| 212-B | Overdue commitment | Login-required quote creation blocked | No | No | Read-only schema/counts | BLOCKED: no sales session | No dedicated 212 screenshot | BLOCKED |
| 212-C | Credit shortfall commitment | Login-required quote creation blocked | No | No | Read-only schema/counts | BLOCKED: no sales session | No dedicated 212 screenshot | BLOCKED |
| 212.8 | Stock control on create/finalize | Login-required quote create/finalize blocked | No | No | Read-only schema/counts | BLOCKED: no sales/accountant session | No dedicated 212 screenshot | BLOCKED |
| 212.9 | Accounting approval path | Login-required quote creation blocked | No | No | Read-only schema/counts | BLOCKED: no sales/accountant session | No dedicated 212 screenshot | BLOCKED |
| 213 | Customer score/credit recompute | Login-required scoring/capital flow blocked | No | No | Read-only schema/counts | BLOCKED: no admin/accountant session | No dedicated 213 screenshot | BLOCKED |
| 214 | WhatsApp top-products mirror | Source and destination opened | No write needed | Browser refresh observed route only | External API verified | Destination serverFn requires allowed role | Yes | IMPLEMENTED — E2E NOT VERIFIED |
| 214.1 | Purchase Advisor with WhatsApp sellers | Page opened, AI submit blocked by auth/no role | No | No | Product/seller API verified read-only | BLOCKED: no valid app role | Yes | IMPLEMENTED — E2E NOT VERIFIED |
| 215 | No business requirement in prompt | N/A | N/A | N/A | N/A | N/A | N/A | REQUIREMENT CONFLICT |
| 216 | No business requirement in prompt | N/A | N/A | N/A | N/A | N/A | N/A | REQUIREMENT CONFLICT |
| 217 | Create/manage visitors | `/admin/visitors` opened but unauthorized | No | No | `visitors=1`, active=1 | BLOCKED: no admin/manager session | Yes | BLOCKED |
| 217.1 | Select visitor on quote | Quote creation blocked by login | No | No | `sales_quotes.visitor_id` exists | BLOCKED: no sales session | No dedicated 217.1 screenshot | BLOCKED |
| 218 | Mobile-bank screenshot receipt | Receipt form opened with no-role session | No | No | Column exists, current true rows=0 | BLOCKED: no accountant/admin session | Yes | IMPLEMENTED — E2E NOT VERIFIED |

## Route Observations

| URL | Browser result |
|---|---|
| `/sales/quotes/new` | Redirected to `/login`; write test blocked |
| `/sales/quotes` | Rendered with `بدون نقش`; no quote rows visible |
| `/my-rejected-quotes` | Rendered with `بدون نقش`; loading/empty state |
| `/notifications` | Rendered with `بدون نقش`; no notifications |
| `/accounting/dynamic-capital` | Rendered with `بدون نقش`; form visible, no write attempted |
| `/sales/customers` | Rendered with `بدون نقش`; empty list |
| `/pricing/market-intelligence` | Rendered; WhatsApp card title visible, but card showed temporary connection/access failure |
| `/operations/purchase-advisor` | Rendered with `بدون نقش`; form visible, AI submit not tested |
| `/admin/visitors` | Rendered unauthorized state |
| `/accounting/receipts/create` | Rendered form with `بدون نقش`; no submit attempted |

Console observation: repeated app diagnostic log `[auth-diagnostic][session.onAuthStateChange] INITIAL_SESSION Object` was captured as browser console error. No scenario-specific 400/403/500 payload was captured because write flows were not executed.

## Item Details

### 211 — Quote Rejection Reason

Actual browser click/write: not executed.  
Reason: no usable accountant/admin and salesperson browser sessions.  
DB read-only proof: `notification_queue=0`, `quote_rejected_notifications=0`; no existing rejected-notification fixture to verify persistence.  
Code/API proof remains from the prior audit: reject reason field and `notification_queue` path exist, but E2E popup/acknowledge flow was not proven.

Status: `BLOCKED`.

### 212-A — Credit Guard

Actual browser click/write: not executed.  
Reason: `/sales/quotes/new` redirected to `/login`; no sales credential/session.  
DB before/after unchanged.  
Backend RPC signature with credit/exception/visitor/warehouse fields exists and was read-only verified, but no controlled quote was created.

Status: `BLOCKED`.

### 212-B — Overdue Commitment

Actual browser click/write: not executed.  
Reason: same sales-login blocker.  
No `quote_exception_type` rows currently exist in DB.  
The existing implementation still appears to store snapshot/text only; deadline/fulfillment/payment-link workflow was not E2E verified.

Status: `BLOCKED`.

### 212-C — Credit Shortfall Commitment

Actual browser click/write: not executed.  
Reason: same sales-login blocker.  
No controlled record created.  
The previous functional finding remains: commitment snapshot exists, but real end-of-day tracking was not proven.

Status: `BLOCKED`.

### 212.8 — Stock Control

Actual browser click/write/finalize: not executed.  
Reason: requires sales and accountant/admin roles.  
DB read-only: `warehouse_stock=4`.  
No race/finalize/double-submit test was executed.

Status: `BLOCKED`.

### 212.9 — Accounting Approval

Actual browser click/write: not executed.  
Reason: requires sales session and later accounting verification.  
The prior audit finding remains important: available code path is self-attestation, not a real approval workflow by Mahroo/accounting.

Status: `BLOCKED` for E2E; business status remains `PARTIAL — NEEDS FIX`.

### 213 — Credit Score/Recompute

Actual browser score/capital write: not executed.  
Reason: requires admin/accountant/session and would create/update scoring/capital records.  
DB read-only: `dynamic_scoring_parameters=16`, `dynamic_parameter_weights=16`, `daily_capital_settings=13`, `dynamic_entity_scores=44`, `customer_capital_allocations_dynamic=1`.

Status: `BLOCKED`.

### 214 — WhatsApp Top Products Mirror

Browser source page:
- `http://192.168.170.8:3002/reporting` opened.
- Text included reporting navigation and `جدول محصولات پر تکرار`.
- Screenshot saved: `214-source-reporting-page.png`.

Browser destination page:
- `http://192.168.170.8:3100/pricing/market-intelligence` opened.
- Text included `محصولات پرتکرار در گفتگوهای واتساپ (مشتریان)` and `منبع: واتساپ`.
- Because the active browser user had no app role, the card showed `اتصال به داده‌های واتساپ موقتاً برقرار نیست.`
- Code shows the card server function requires `admin`, `manager`, or `accountant`, so this browser result is consistent with missing role, not proof that the API is down.

Network/API checks:
- Host request to `http://192.168.170.8:8002/api/v1/reporting/top-products?range=30&limit=10`: 200.
- Container request from `afrakala-lan-web` to the same API: 200.
- Env `WHATSAPP_PLATFORM_BASE_URL` is correct.

Observed API data:
- Rank 1 product exists with `product_id=efc12151-fd11-4e28-ae4b-6de08a95fe23`, `mention_count=466`, `group_count=30`, `sender_count=37`.
- Same product exists in AfraKala `products` table.

Result: external connection is healthy; browser E2E with allowed app role is not verified.

Status: `IMPLEMENTED — E2E NOT VERIFIED`.

### 214.1 — Purchase Advisor Uses WhatsApp Sellers

Browser:
- `http://192.168.170.8:3100/operations/purchase-advisor` opened.
- Product/quantity/urgency form visible.
- AI submit not executed because app user had `بدون نقش`.

API/source data:
- Top WhatsApp product `efc12151-fd11-4e28-ae4b-6de08a95fe23` maps to AfraKala product `یخچال ساید بای ساید ال جی مدل X267 رنگ سیلور`.
- Seller endpoint returned sellers/mentioners for that product.

Code proof:
- `purchase-advisor.functions.ts` calls `getWhatsappTopProductsSnapshot` and `getWhatsappProductSellersSnapshot`.
- Prompt includes WhatsApp demand and seller/mentioner lines.

Risk:
- Since AI response was not executed in authenticated browser, no hallucination comparison was possible.

Status: `IMPLEMENTED — E2E NOT VERIFIED`.

### 215

No business requirement was provided in the mission file.  
Status: `REQUIREMENT CONFLICT`.

### 216

No business requirement was provided in the mission file.  
Status: `REQUIREMENT CONFLICT`.

### 217 — Visitors

Browser:
- `/admin/visitors` opened.
- Page showed unauthorized state for `بدون نقش`.

DB:
- `visitors=1`
- `active_visitors=1`
- No `E2E_AUDIT_20260729_VISITOR_217` row existed before or after.

Write/create/edit/toggle not executed because it requires `admin` or `manager`.

Status: `BLOCKED`.

### 217.1 — Visitor Selection in Quote

Browser:
- `/sales/quotes/new` redirected to `/login`.

DB/schema:
- `sales_quotes.visitor_id` exists.
- Active visitor exists.
- RPC argument `p_visitor_id uuid` exists.

No quote was created, no PDF checked, and inactive visitor filtering was not E2E tested.

Status: `BLOCKED`.

### 218 — Mobile Bank Screenshot Receipt

Browser:
- `/accounting/receipts/create` opened with `بدون نقش`.
- Form text contained receipt type choices and the receipt form.
- No submit/upload executed because accounting/admin role is required.

DB/schema:
- `payment_receipts.is_mobile_bank_screenshot` exists.
- Current rows with `is_mobile_bank_screenshot=true`: 0.

Code proof:
- Form state/payload includes `is_mobile_bank_screenshot`.
- Detail page and Excel export select/map the field.

Status: `IMPLEMENTED — E2E NOT VERIFIED`.

## Final Short Status

| شماره | نتیجه |
|---|---|
| 211 | BLOCKED |
| 212-A | BLOCKED |
| 212-B | BLOCKED |
| 212-C | BLOCKED |
| 212.8 | BLOCKED |
| 212.9 | BLOCKED |
| 213 | BLOCKED |
| 214 | IMPLEMENTED — E2E NOT VERIFIED |
| 214.1 | IMPLEMENTED — E2E NOT VERIFIED |
| 215 | REQUIREMENT CONFLICT |
| 216 | REQUIREMENT CONFLICT |
| 217 | BLOCKED |
| 217.1 | BLOCKED |
| 218 | IMPLEMENTED — E2E NOT VERIFIED |

## Final Notes

E2E confirmed:
- LAN environment and runtime version.
- Browser can open the app.
- WhatsApp source UI is reachable.
- WhatsApp API is reachable from host and from the web container.
- DB was unchanged before/after.

Incomplete/blocked:
- All write flows that require real app roles are blocked by lack of usable login credentials/session.
- No permission matrix test with multiple users was possible.
- No reload-after-write or logout/login persistence test was possible.

Records:
- Created: none.
- Cleaned up: none.
- Left behind: none.

Output paths:
- Screenshots: `docs/audits/evidence/211-218-e2e/`
- E2E report: `docs/audits/211-218-e2e-browser-validation.md`

