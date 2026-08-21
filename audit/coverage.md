# Coverage (P8)

Honest percentages. Denominator = artifacts inventoried, not “all possible software.”

| Layer | Inventories | Inspected in depth | % | Never opened |
|---|---|---|---|---|
| File routes (`createFileRoute`) | 210 | All listed; ~40 files read; 7 flows traced | **~25% files read / 100% named** | Most academy, data-tables, bot playground, currency admin pages unread |
| NAV items | 124 | Compared to PRIMARY_MODULES (aligned) | **100% membership check** | Labels/icons not QA’d |
| HTTP `/api/*` | ~20 | Named in routes.txt; bot-api.ts skimmed | **~30%** | Hook auth tokens, MCP tools |
| RPC literals | 157 + 7 casts | Critical 15 verified on LAN `pg_proc` | **~10% live / 100% listed** | Majority of marketing/MI RPCs not opened |
| `.from()` tables | 184 | invoices/payments/ocr/price_lists/waybills live-checked | **~5% live** | Most tables existence not probed |
| types.ts Tables | 193 | Parsed keys; invoices drift confirmed | **100% named / 0% column audit** | Column-level drift except league_seasons |
| Migrations | 523 | 332, 335, 328, league trigger, expire_pending skimmed | **<2% files** | Older Lovable dumps |
| Components | hundreds | Sampled delivery receipts, quotes, InquiryBoard, Didar redirect | **low** | No knip graph |
| Hooks | 38 | dashboard, inquiries, delivery, penalties listed | **~20% read** | pricing board hooks unread |
| E2E | present | new-clusters-jwt.spec.ts read | **not executed** | |
| Tests unit | 1 script | not run | **0%** | |
| Deploy compose | present | not opened this pass | **0% files** | nginx rewrites UNKNOWN |
| Production host | — | forbidden | **0%** | |

## Routes traced end-to-end (P5)

7/7 required: auth, create quote, list products, update person, cancel quote, receipts/billing, RBAC.

## Endpoints matched

Of 157 listed RPCs, ~20 joined to UI+live. Unmatched FE→DB: invoices/payments/ocr_receipts (confirmed missing). Unmatched types→from: 34 (mixed dropped leftovers vs RPC-only tables).

## Components classified

Only those on the 7 traces + invoice leftovers + price-lists + rewards + Didar + automation dummy. **Not a full orphan sweep.** Status: UNKNOWN_AFTER_INVESTIGATION for unused-export claims.
