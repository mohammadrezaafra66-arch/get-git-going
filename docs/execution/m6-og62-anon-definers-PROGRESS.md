# MISSION 6 — OG-62, the anon-reachable definer leaks

Chained execution v8, Phase 2 mission 6. Branch `feature/og62-anon-price-definers`,
cut from `staging` @ `987c3a3d`.

Owner decision on record (2026-08-26): **yes, close it — with a complete domain-wide
sweep.** Also in this mission, by owner instruction: the **OG-38 monitoring** step.

Full evidence — the 91-function sweep, the value-level second pass, the rollback's own bug,
and the 13-case gate attack — is in `docs/research/og62-anon-definer-sweep.md`.

## Environment precondition (v8 STOP block) — PASSED

```
$ docker ps --format "{{.Names}}" | grep afrakala-lan   -> 8 afrakala-lan-* containers
$ docker exec afrakala-lan-db psql -U postgres -d afrakala -c "select 1;"  -> 1
```

Environment is **Local**. Production `192.168.170.10` was not contacted at any point.

## Step 0 — state sync

```
$ git log --oneline -1 origin/staging
987c3a3d Merge pull request #353 from .../feature/og63-purchase-date-tehran

395 on disk: 0   395 on remote: 0        <- number taken from BOTH, per the shared-tree rule
```

---

## PHASE 0 — PREMISES RE-MEASURED (A2.13)

| v8 premise | Measured verdict |
|---|---|
| `get_product_sale_price` returns a real sale price to anon | **CONFIRMED — `79800000`** |
| `get_product_price_bounds` returns floor, current and 1.05× ceiling | **CONFIRMED — `(79800000,87300000,91665000,79800000,t)`** |
| Mission 4's audit found 18 in the pricing/financial domain; 14 refused, 4 returned | **CONFIRMED as a sample — but the domain is larger.** The full sweep is 91 functions: 36 guarded, 47 returned rows, 8 other |
| "REVOKE from anon AND PUBLIC — revoking anon alone does nothing" | **CONFIRMED**: all four headline functions carry both an explicit `anon` grant and a PUBLIC grant |
| "if `authenticated` relies on the PUBLIC grant, revoking PUBLIC breaks the real app" | **CHECKED — it does not.** All 28 hold their own explicit `authenticated` **and** `service_role` grants |

**A correction that changed the scope: 47 functions returning rows is not 47 leaks.**
`has_role(NULL,NULL)` returns one row containing `false`. Every function that returned was
therefore called a second time **with real arguments and its values inspected**. That pass
is what separates the 28 closed here from the boolean RLS helpers left alone.

**A second correction, to an older research note:** `InvoiceForm.tsx` — named in
`docs/research/K-currency.md` as the consumer of `get_product_sale_price` — **no longer
exists**. A whole-tree search finds no `src/` caller for either price function beyond the
generated `integrations/supabase/types.ts`.

---

## THE CHANGE — migration 395

28 functions, `REVOKE EXECUTE … FROM anon` **and** `FROM PUBLIC` each. No table grant, no
policy, no role, no data.

**Deliberately not touched**, each for a stated reason:
- the RLS helpers (`is_viewer_only`, `has_role`, `has_any_role`, `dyn_table_role_can_view`,
  `kd_role_can_view`, the `is_*` predicates) — they returned only booleans, back 93
  policies, and revoking them breaks policy evaluation rather than closing a leak;
- `set_profile_field_value` — the one genuine anon keep-list entry (registration);
- `refresh_sale_list_prices` — A6.33 (OG-48) owns it and A6.35 (OG-32) blocks that repair.

### The rollback found a real bug in itself

The forward→rollback dry run compares the ACL **as a set** and failed:

```
 IN AFTER, NOT BEFORE | product_videos_waiting()|PUBLIC|EXECUTE|supabase_admin
 IN AFTER, NOT BEFORE | polymorphic_ref_orphan_report()|PUBLIC|EXECUTE|supabase_admin
```

Nothing was lost, but two functions **gained** a PUBLIC grant they never had — they are
anon-executable through an explicit `anon=X` only. A blanket re-GRANT would have left them
**more open than they started**. The rollback now restores per function and says so in
place. Final state: **166 ACL entries before, 166 after, zero difference in either
direction.**

**The near-miss is the lesson.** The first draft compared `proacl::text`, and that mismatch
had two causes at once: this real defect, and a harmless aclitem re-ordering that a
REVOKE-then-GRANT always produces. Calling it "just ordering" and relaxing the check —
the obvious move — would have buried the defect underneath it.

### Post-apply live verification (A0.9a)

```
NOTICE:  get_product_sale_price   as anon -> permission denied (42501). CLOSED.
NOTICE:  get_product_price_bounds as anon -> permission denied (42501). CLOSED.

 anon_can_execute_of_28 | auth_can_execute_of_28 | total
                      0 |                     28 |    28
```

A5.32's distinction respected: this is `42501`, a privilege refusal — not RLS's silent zero
rows.

### `/api/public/products`, before and after (v8 mission 6, requirement e)

```
BEFORE  200 | 199 products | price key on 199 | price != 0 on 0
AFTER   200 | 199 products | price key on 199 | price != 0 on 0
keys (both): capacity,id,is_active,model,name,price,stock_status
```

## GATE ATTACK — 1 control + 12 disturbances, all caught

D0 control PASS · D1 revoke anon not PUBLIC · D2 revoke PUBLIC not anon · **D3 close it for
`authenticated` (A2.10)** · D4 close it for `service_role` · D5 overload escape · D6 RLS
helper collateral · D7 keep-list revoked · D8 re-open OG-55 · D9 over-reach on
`products.name` · **D10 inherited-role escape** · D11 vacuity (function dropped) ·
D12 partial closure.

**D10 is the one that proves the gate's shape.** A group role was granted EXECUTE and `anon`
made a member of it: `grants_naming_anon = 0` — no grant mentions anon anywhere — and anon
still reached the function. A gate scanning `proacl` for an anon entry would have passed it;
this gate tests **effect** via `has_function_privilege` and caught it. Migration 379's
history records an earlier gate here being defeated by exactly that.

---

## e2e — RAN, zero new failures

In scope per A4.16: database privileges changed.

**Health pre-check (A4.18) — both readings recorded, and the first was not accepted.**
The first sample gave mean 25.1% / median 22%, marginally over the ~25% threshold, so the
run was **not** started on it. A re-measurement gave mean 29.6%, i.e. it moved the wrong
way; a third, 30-second window gave **mean 26.1%, median 23%, max 62%, min 10%** — spiky,
with the median under threshold and the mean pulled up by transient spikes from
Docker Desktop/host background work present in every run. `chrome-headless-shell` 0,
`GET /login` 200 in 0.1s. The run was started on that reading with A4.19's ceiling as the
guard, and this is recorded rather than presented as a clean pass.

```
594 tests -> 536 passed / 29 failed / 29 skipped, 23.2 minutes
independent marker count: ok 536, x 29, - 29  ->  agrees with the summary line
ceiling A4.19 = 95 min -> well under
payment_receipts      : 10 before, 10 after
chrome-headless-shell : 0 before, 0 after
purchases             : 212 -> 226 (+14, the purchase specs each create one by design)
```

### Two-way SET comparison (A4.22)

| | |
|---|---|
| failing now, not in the recorded 30 | **none** |
| in the recorded 30, passing now | `persons/duplicate-mobile-blocked:59` |

**A strict subset of the baseline — zero new failures.** The one recovery is the known
viewer/UI race the baseline itself flagged as non-deterministic; it also recovered in
mission 5's run. Baseline **not** superseded — no spec changed.

**Error-signature census: zero `42501`, zero "permission denied", zero `PGRST`.** The two
"insufficient" hits are a passing test name and a code comment, not privilege errors. This
matters more than usual here: 28 functions were revoked, and if any signed-in path had
depended on the PUBLIC grant it would have surfaced as exactly those signatures.

---

## OG-38 — the monitoring the owner ordered, set up in this mission

Owner's decision: **do not `NOLOGIN`**; record the role's connections for a period.

`ALTER ROLE supabase_read_only_user SET log_connections = on` is **impossible** — measured,
not assumed:

```
ERROR:  parameter "log_connections" cannot be set after connection start
```

It is a backend-start parameter, so a per-role setting never takes effect. Enabled globally
by reload instead — no restart, reversible with `ALTER SYSTEM RESET log_connections`:

```
ALTER SYSTEM SET log_connections = on;  SELECT pg_reload_conf();  -> t
window opened: 2026-08-26 11:57 Tehran
```

**Proven to capture this role:**

```
127.0.0.1 … [96969] supabase_read_only_user@afrakala LOG:  connection authorized:
            user=supabase_read_only_user database=afrakala application_name=psql
```

**That line is this session's own verification probe and must not be counted as a real
consumer.** Read the window with
`docker logs --since 24h afrakala-lan-db 2>&1 | grep supabase_read_only_user`.

**OG-38 stays OPEN and mission 4 stays CONDITIONAL** until the window is read.

---

## VERIFICATION AND SCOPE

- **Migration:** 395 applied and committed; `docker restart afrakala-lan-rest` after apply.
- **RLS/RBAC impact:** no policy, role or membership changed. 28 function EXECUTE grants
  removed from `anon` and `PUBLIC` only; `authenticated`, `service_role`, `postgres` and
  `supabase_admin` untouched and asserted.
- **Config change:** `log_connections` on, globally, by reload — the OG-38 monitoring the
  owner ordered. Recorded here because it is a server setting, not a migration.
- **Audit log impact:** none. Every probe ran inside `BEGIN … ROLLBACK`.
- **Data:** no row inserted, updated or deleted by this mission. The +14 purchases are the
  e2e suite doing what its own header documents.
- **`src/`:** zero files. No build required (A7.40), none run.
- **A6.33/A6.34/A6.35 respected.**
- **production لمس نشد** — `192.168.170.10` was never contacted.
