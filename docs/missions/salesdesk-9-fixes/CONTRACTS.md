# CONTRACTS — salesdesk-9-fixes

Written in Wave 0 before product code. Later changes only by editing this file with a reason.
Live catalog and `FINDINGS.md` were checked for equivalents before inventing names.

## Naming rule

If an equivalent already exists, use it and record the mapping here. Do not create parallel columns/tables.

## Tables and columns

### `sales_interactions` extensions

| Name | Type | Notes | Existing equivalent? |
|------|------|-------|----------------------|
| `deal_id` | uuid NULL, FK → `sales_interactions.id` | Links call/note activity to a deal (request row). Self-FK. | None — CREATE |
| `won_at` | timestamptz NULL | Set/cleared by trigger on status → won / reopen | None — CREATE |
| `lost_at` | timestamptz NULL | Set/cleared by trigger on status → lost / reopen | None — CREATE |
| `lost_reason_id` | uuid NULL, FK → `deal_lost_reasons` | Required on transition to lost | None — CREATE |
| `lost_reason_note` | text NULL | Free-text explanation | None — CREATE |
| `lost_reason_other` | text NULL | Required when reason title is «سایر» | None — CREATE |
| `activity_type_id` | uuid NULL, FK → `sales_activity_types` | Wave 4 | None — CREATE |
| `due_at` | timestamptz NULL | Activity due | None — CREATE |
| `due_has_time` | boolean NOT NULL DEFAULT false | Whether `due_at` includes a clock time | None — CREATE |
| `original_due_at` | timestamptz NULL | Preserved on postpone | None — CREATE |
| `done_at` | timestamptz NULL | When activity marked done | None — CREATE |
| `result_note` | text NULL | Result text on completion | None — CREATE |

**Mappings (reuse, do not duplicate):**
- Deal «مسئول معامله» = existing `salesperson_id` (NULL no longer allowed for new `kind='request'`).
- Deal «ایجاد کننده معامله» = existing `author_id`.
- Activity owner «مسئول انجام این فعالیت» = `salesperson_id`.
- Activity creator = `author_id`.
- Status CHECK stays `open, won, lost, cancelled, done` — UI labels «جاری / موفق / ناموفق» map to open / won / lost only.
- `kind` values unchanged (`request` / `call` / `note`).

### `deal_lost_reasons` (BUILD)

| Column | Type |
|--------|------|
| `id` | uuid PK DEFAULT gen_random_uuid() |
| `title` | text NOT NULL |
| `is_active` | boolean NOT NULL DEFAULT true |
| `sort_order` | int NOT NULL DEFAULT 0 |
| `created_at` | timestamptz NOT NULL DEFAULT now() |

Deactivate never delete. Seed: «سایر» only.

### `sales_interaction_items` (BUILD)

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `interaction_id` | uuid NOT NULL FK → `sales_interactions.id` |
| `product_id` | uuid NOT NULL FK → `products` |
| `quantity` | numeric NOT NULL DEFAULT 1 |
| `note` | text NULL |
| `created_at` | timestamptz NOT NULL DEFAULT now() |

### `sales_quotes` extension

| Name | Type | Notes | Existing? |
|------|------|-------|-----------|
| `interaction_id` | uuid NULL FK → `sales_interactions.id` | Link quote ↔ deal | None — CREATE |

`salesperson_id` on quote = deal's responsible (existing column).

### `user_caller_id_settings` extensions

| Name | Type | Notes |
|------|------|-------|
| `display_seconds` | int NOT NULL DEFAULT 15 CHECK (5–120) | Replaces hardcoded 5 s card TTL |
| `only_my_extension` | bool NOT NULL DEFAULT false | «فقط تماس‌های داخلی خودم» |
| `only_my_customers` | bool NOT NULL DEFAULT false | «فقط تماس‌های مربوط به خودم» |

Existing: `enabled`, `show_inbound`, `show_outbound`, `show_others_outbound` — preserved.

### `work_items` / ticket history

| Name | Type | Notes | Existing? |
|------|------|-------|-----------|
| `closed_at` | — | **Do not create** — live equivalent is `completed_at` (Wave 0 probe) | Map «تاریخ بسته شدن» → `completed_at` |
| `work_item_events` | table | id, work_item_id, actor_id, event_at, field, old_value, new_value | None — CREATE |

Existing on `work_items` (reuse for A1): `creator_id`, `assignee_id`, `created_at` — display only, no rename.
UI «تاریخ بسته شدن» / close-reopen triggers maintain `completed_at` (set on close, cleared on reopen).

### `sales_activity_types` (BUILD)

| Column | Type |
|--------|------|
| `id` | uuid PK DEFAULT gen_random_uuid() |
| `title` | text NOT NULL |
| `sort_order` | int NOT NULL |
| `is_active` | boolean NOT NULL DEFAULT true |

Seed order per §6 (یادداشت ساده + Didar 1–17). Migration **572** (`20260922050000`).

### Purchases (no new tables)

- `purchases.supplier_id` stays nullable for legacy rows.
- Trigger enforces: INSERT requires non-null; UPDATE may not clear non-null → NULL.
- Error code `SUPPLIER_REQUIRED`.

## Business-rule error codes (ASCII) → UI

| Code | UI text |
|------|---------|
| `SUPPLIER_REQUIRED` | تأمین‌کننده الزامی است |
| `RESPONSIBLE_REQUIRED` | مسئول معامله الزامی است |
| `LOST_REASON_REQUIRED` | دلیل شکست را انتخاب کنید |

Raised by triggers so PostgREST PATCH cannot bypass.

## RLS

Every new table gets policies for SELECT/INSERT/UPDATE (and DELETE only if needed). Without a DELETE policy, API deletes silently remove nothing — tests must count rows.

## Routes / `role_permissions`

New routes needing rows (module without rows = open to all — avoid):
- Report «معاملات ثبت‌شده برای دیگران»
- Settings «دلایل شکست معامله»
- Page «فعالیت‌ها»
- Report «دلایل شکست»

Exact module keys (Wave 3 FE, migration 571):

| Module key | Route | Reason |
|------------|-------|--------|
| `sales-deals-for-others` | `/operations/sales-desk/deals-for-others` | C5 report — author≠salesperson |
| `deal-lost-reasons` | `/settings/deal-lost-reasons` | C8 settings catalog |
| `deal-lost-report` | `/sales/reports/deal-lost` | C8 lost-reasons report |

Wave 4 placeholder (D4 role_permissions; page not yet):

| Module key | Route | Reason |
|------------|-------|--------|
| `sales-activities` | `/operations/sales-desk/activities` (TBD) | D4 activities page — seed types live in mig 572 |

Also deal detail (no dedicated module; gated by sales role): `/operations/sales-desk/deals/$dealId`

## Migration numbering

- Directory: `supabase/migrations/`
- Convention: `YYYYMMDDHHMMSS_NNN_snake_name.sql`
- Next free NNN after highest on base: **574** (Wave 4 D1 used **573** `20260922050100_573_sales_interactions_activity_fields`; D2 used **572** `20260922050000_572_sales_activity_types`; Wave 3 used 565–571; Wave 2 applied 563–564 — including `deal_id` on `sales_interactions`; Wave 1 used 560–562; duplicates exist at 551, 554, 558)
- One migration per concern; each has `docs/missions/salesdesk-9-fixes/revert/<file>`

## Decisions recorded with contracts

- No parallel deal table — extend `sales_interactions`.
- Activities on `sales_interactions` (ADR-4); `tasks` untouched.
- Call card grouping is application-layer; `call_ring_events` storage unchanged (one row per extension).
- Wave 4 D1: `deal_id` already from 564 — do not recreate FK. Activity owner = `salesperson_id`, creator = `author_id` (no new columns). Backfill maps `kind` call/note → activity types without changing `kind`; `request` stays `activity_type_id` NULL. Legacy `next_follow_up_at` copied to `due_at` + `original_due_at` with `due_has_time=true` when `due_at` was null (call/note only) so D5/D7 have due data.
