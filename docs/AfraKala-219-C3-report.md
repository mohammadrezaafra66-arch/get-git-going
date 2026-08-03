# Issue 219 — Phase C3 report

**«خرید انجام شد» now registers a real purchase document.**
Branch `feature/navigation-modernization` · LAN test server `192.168.170.8` ·
production `192.168.170.10` never touched · **no commit, no push**.

---

## A. What C3 changed, in one paragraph

Before C3, «خرید انجام شد» opened a dialog that asked for a final price and
flipped `purchase_requests.status` to `purchased`. Nothing was bought. A request
could read "purchased" forever while no purchase document existed anywhere in
the system, and the "final price" was whatever a human typed. C3 replaces that
with the real thing: the button opens the standard purchase form (the same
component `/purchases/create` uses) inside a Drawer, the submit goes through the
central `create_purchase` RPC built in C2, a fulfillment row records how much of
the request that document supplied, and the status is **derived** from the
supplied quantity — `partially_purchased` when some arrived, `purchased` when
all of it did. `final_price` is recomputed from the documents themselves.

## B. Migrations

| # | File | What it does |
|---|---|---|
| 252 | `20260802100000_252_create_purchase_request_link.sql` | Adds the request branch to `create_purchase`: permission (assignee, or admin/manager override), request lock, validations, allocation, fulfillment insert, derived status, `final_price` recomputation, one history row + one notification per real transition, audit row. |
| 253 | `20260802101000_253_get_purchase_requests_summary.sql` | Extends `get_purchase_requests` with 8 fulfillment columns and `purchase_summaries jsonb`. Financial keys are **omitted server-side** for roles that may not see them. `receipt_count` moved to a scalar subquery. |

Migrations 246–251 were **not touched**. No `supabase db push` / `db reset` /
`migration repair` / `db pull` was run. Both new migrations were applied by the
project's manual path (`docker cp` + `psql -f --single-transaction -v
ON_ERROR_STOP=1`).

### Three quantities, kept separate

- `purchased_quantity` — what the document says was bought.
- `allocated_quantity` — how much of that was assigned to this request.
- `effective_supplied` = `LEAST(total_allocated, requested_quantity)`.

Buying 10 against a request for 6 supplies 6 and leaves 4 as surplus stock; it
does not make the request "167% supplied". The excess is computed once, at line
level, in `v_purchase_item_allocation`.

### Legacy requests

A request flagged `legacy_no_fulfillment` has no reliable document history. Its
supplied quantity is **unknown**, not zero. The RPC refuses the request path for
it, the summary shows «خرید قدیمی — سند مرتبط ثبت نشده» with no numbers, and the
button keeps the old dialog. Exactly 1 row is flagged.

## C. Frontend

| File | Why |
|---|---|
| `src/components/purchase/PurchaseForRequestDrawer.tsx` *(new)* | Hosts the shared `PurchaseForm` in a `vaul` Drawer. Prefills only what the request genuinely holds: product, remaining quantity, notes. Supplier/price/currency/warehouse/date are **not** guessed. |
| `src/components/purchase/PurchaseFulfillmentSummary.tsx` *(new)* | Read-only summary in the card. Renders only what the server sent — masking is not a UI decision. |
| `src/components/purchase/PurchaseStatusActions.tsx` | `purchased` target opens the drawer; every other transition unchanged. |
| `src/components/purchase/PurchaseRequestCard.tsx` | Renders the summary; receipt upload extended to `partially_purchased`; card exposes `data-request-id` so tests can address one card. |
| `src/shared/components/PurchaseForm.tsx` | Optional props (`initialValues`, `lockedFields`, `requestContext`, `submitLabel`, `onSuccess`). With no props it behaves exactly as before. |
| `src/hooks/purchase/useCreatePurchase.ts` | `request_id` input, typed `request` result, 11 new Persian messages keyed on `HINT` machine codes. |
| `src/hooks/purchase/usePurchase.ts`, `src/lib/purchase/labels.ts`, `src/integrations/supabase/types.ts` | New columns, `partially_purchased` label/badge/transitions, regenerated RPC signature. |

No parallel purchase module was created. There is one form, one schema, one
submit path.

## D. Permissions

The RPC gates on `has_any_role(_uid, ARRAY['admin','manager'])` for standalone
purchases and on **assignee OR admin/manager** for the request path — mirroring
RLS rather than `role_permissions`, which would have let `sales` through.

`sales` never receives `purchase_price`, `currency`, `total_amount` or
`supplier_name`: the keys are absent from the JSON, not hidden by CSS. Verified
against a *pure* accountant account (several accountants also hold `admin`,
which would have made the assertion meaningless).

## E. Concurrency and idempotency

Locks are taken in a fixed order — idempotency row → `purchase_requests` FOR
UPDATE → `purchase_items` FOR UPDATE. A genuine two-session test showed the
second buyer is **refused**, not allowed to over-supply. The idempotency key
covers actor + payload hash; replaying it with a different payload conflicts.

## F. Test results

| Suite | Result |
|---|---|
| `docs/verification/252-request-link-tests.sql` | **38 / 0 / 38** |
| `docs/verification/253-summary-security-tests.sql` | **9 / 0 / 9** |
| `e2e/purchase/c3-request-purchase.spec.ts` | **12 / 12** |
| Full Playwright regression | **87 passed, 4 failed** — see §H |
| `npx tsc --noEmit` | **70 errors — exactly the baseline** |
| `npm run build` | passes |
| `npm run lint` (touched files) | 0 errors, 2 pre-existing `exhaustive-deps` warnings |
| unit tests | **there is no test script in this project** |

### Deploy verified

`APP_GIT_SHA=a43077b7-dirty` (working tree is intentionally uncommitted),
`APP_BUILD_TIME=2026-08-02T13:05:08Z`, and the new strings grep to
`PurchaseStatusActions` / `PurchaseForm` in `/app/.output`.

## G. Data state after the run

| Metric | Value |
|---|---|
| Fulfillments total / from e2e | 17 / 16 |
| Requests at `partially_purchased` | 4 |
| Legacy-flagged requests | 1 |
| Idempotency rows completed / stuck in `processing` | 43 / **0** |
| Purchases with no line | **0** |
| Lines allocated beyond what was purchased | **0** |
| Lines with unallocated surplus | 38 — all standalone purchases, allocated 0 |

E2E fixtures are **not deleted**. Deleting a purchase would orphan its stock
movement (`stock_movements` has no FK to `purchases`), corrupting inventory far
worse than leaving a tagged row behind. All fixtures carry the `E2E_C3_219`
prefix and a per-run token.

## H. The 4 regression failures are not C3's

| Spec | Failure | Cause |
|---|---|---|
| `212-quote-credit-guard` | `null value in column "person_id" of relation "customers"` | The spec's own fixture SQL inserts customers without `person_id`, which migrations 233/242 (unified persons) made `NOT NULL`. There is no backfill trigger on `customers`. |
| `213-dynamic-customer-credit-scoring` | `BLOCKED_UNSAFE: today_settings=1` | The spec's own safety precheck refuses to run while today's settings rows exist. Data state, not code. |
| `215-quote-inventory-finalization` | timeout finding the «پذیرش» button | Quote acceptance UI. |
| `persons/credit-uses-person` | credit page value mismatch | Credit page / persons phase. |

Every file C3 changed is imported **only** by the purchase components and the
three purchase routes (`/purchase`, `/admin/purchase`, `/purchases/create`).
None of the four failing specs visits those routes or touches `purchases`,
`purchase_items`, or `purchase_request_fulfillments`. The `purchase_*` strings
that do appear in them are pricing/credit column names
(`input_purchase_price`, `customer_purchase_3m`), unrelated to the purchase
document model.

**These four are pre-existing and belong to the unified-persons phases, not to
C3. They are not fixed here — fixing them is outside C3's scope, and I did not
want to hide them by touching specs I was not asked to change.**

## I. Remaining risks

1. **`update_purchase_status` still accepts `purchased` as a target.** The
   frontend no longer offers that path, but the RPC has no from→to transition
   table, so an API caller who is admin/manager/assignee can still set
   `status='purchased'` with a hand-typed `final_price` and no document. Closing
   it was **not** in C3's scope, and it cannot simply be blocked: the legacy
   path I deliberately kept for `legacy_no_fulfillment` requests depends on it.
   Recommend handling it explicitly in C4/C5.
2. **Migration drift** — 436 files on disk vs 289 tracked. A tooling hazard
   inherited from earlier phases, unchanged by C3.
3. **Nothing is committed.** All of C3 lives in the working tree; a `git
   checkout`/`reset` would destroy it.

## J. Manual steps only a human can do

- Sign in as a real `sales` user and confirm the card shows quantities but no
  prices. (Automated at the API level; not exercised through a `sales` browser
  session.)
- Confirm the drawer on a real phone, not an emulated viewport.
- Decide whether the four pre-existing regression failures (§H) get their own
  fix phase.
- Review and commit; the branch is currently `a43077b7` + uncommitted C1–C3.
