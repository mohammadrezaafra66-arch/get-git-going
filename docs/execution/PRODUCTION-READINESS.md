# PRODUCTION READINESS SHEET

**Prepared:** 2026-08-27 · **Prepared on:** the test computer (`192.168.170.8`) ·
**Production was never contacted — `192.168.170.10` was not reached at any point.**

This sheet exists so that OG-6 (production authorisation) is asked **with evidence in hand**
rather than on a general sense that things are going well. It is ordered by what should stop a
deploy, not by what was most work.

---

## أ. OG-75 — THE PRIVILEGE-ESCALATION PATH IS OPEN ON PRODUCTION UNTIL 399 IS APPLIED

**This is the top item and it is not theoretical. It was demonstrated, on staging, with output.**

```
SET ROLE anon;
SELECT public.revoke_user_role_txt('<a real admin uuid>', 'admin');
-- admin role rows: 14 -> 13
```

An **unauthenticated** caller stripped the admin role from a real administrator. PostgREST
exposes every function in `public`, so this needs no credentials at all — only the ability to
reach the API. Repeated over `user_roles` it locks the company out of its own system. The probe
ran inside `BEGIN … ROLLBACK`; nothing was actually changed.

**Migration 399 closes it.** After it, the identical call returns `permission denied for function
revoke_user_role_txt` and the count stays at 14 — re-verified in a fresh session outside the
migration that made the change.

**Bearing on production, stated exactly:**

- **It did not arrive by deploy.** `origin/main` is `99f6bd58`, dated **2026-08-15**, and
  production tracks `main`. Migration 399 is dated 2026-08-26 and exists only on `staging`,
  which is far ahead of `main`. A deploy pulls the branch the checkout is on, so it could not
  have carried a file that is not on `main`.
- **Whether anyone applied it manually is `[U]`** and cannot be settled from this repository —
  see item د, which is worse than it sounds.
- **Therefore: assume production is exposed until proven otherwise.** The owner has said they
  will close it themselves, outside this chain.

**The read-only query that settles it**, to be run by someone authorised, on production:

```sql
SELECT has_function_privilege('anon','public.revoke_user_role_txt(uuid,text)','EXECUTE');
-- true  => EXPOSED
-- false => already closed
```

---

## ب. WHAT HAS BEEN INDEPENDENTLY REVIEWED, AND WHAT HAS NOT

**Reviewed independently — migrations 393, 394, 395.** One adversarial subagent, given only the
migration files, their rollback companions, the research docs and live database access, and
**deliberately not given the missions' reasoning**. It was told to break them, not to confirm
them. Five attack angles.

| attack | verdict |
|---|---|
| a schema missed in 393's containment | **BROKEN** — `graphql_public` (latent). Fixed by 406 |
| a second UTC date comparison in `create_purchase` | not broken |
| one of 395's 28 functions is a load-bearing helper | **BROKEN** — via a VIEW, not a policy. Fixed by 405 |
| bypass by group membership | not broken |
| `search_path`-sensitive predicate | not broken (one weak assertion noted) |

**It found a live outage that three migrations' own gates had missed** — see item ج below. That
is the argument for the review, and it is why the unreviewed list matters.

**NOT independently reviewed:**

- **Migrations 396–409** — everything from this session's later missions. They carry their own
  in-migration assertions and e2e gates, and several were caught by their own dry runs, but no
  adversarial pass has been made over them.
- **The e2e gates themselves.** Two were found vacuous *by disturbance* during this session — one
  had `set_config` in a scalar subquery so the role never applied, and it stayed green through a
  disturbance that had removed the very grant it checked. Both were fixed. **How many of the
  other gates would survive the same treatment is unknown**, and that is the single most useful
  thing a next reviewer could measure.
- **The UI.** Every gate in this chain is API- or database-level. Item 8.2's "through the UI" is
  explicitly split: the loop is verified at the RPC boundary, the UI by the pre-existing UI
  specs, and neither pretends to be the other.

---

## ج. OG-77 — A LIVE API WAS OFF, AND ITS GATE COULD NOT SEE IT

Recorded here because it is the clearest evidence of what the gates do and do not cover.

Migration 395 revoked `EXECUTE … FROM PUBLIC` on 28 functions. One of them,
`get_product_price_bounds`, was reachable by **`products_api_readonly`** only through that PUBLIC
grant. That role's entire purpose is to `SELECT` two views, and the primary one calls the
function in a `LATERAL` join — so **every request from its issued 10-year credential returned
`42501`** from 2026-08-26 until 405 repaired it.

Three things about it belong on a readiness sheet:

1. **A view does not shield its caller from a function grant.** For a non-`security_invoker`
   view, relation access is checked against the view's OWNER; function EXECUTE is checked against
   the CURRENT user. "Can read the view" and "can run what the view calls" are different facts.
2. **395's gate named `authenticated` and `service_role` by hand.** The broken role is NOINHERIT
   and reached by `SET ROLE` from a JWT claim, so no inheritance-based check could see it.
3. **This repository had recorded that exact blind spot two days earlier** (migration 385's
   repair of 384) and the next migration did not consult it. Same shape as the `persons` FK
   registry, shipped three times.

**Fixed by 405, and the class is now gated by a spec that derives its role set from the catalogue
instead of listing it.**

---

## د. THE MIGRATION LEDGER DOES NOT DESCRIBE REALITY — AND THIS IS A DEPLOY HAZARD

Measured on the test database, 2026-08-27:

| | |
|---|---|
| migration files on disk | **597** |
| rows in `supabase_migrations.schema_migrations` | **552** |
| on disk, **absent from the ledger** | **45** (earliest `20260818181000`, latest `20260827110000`) |
| in the ledger, absent from disk | **0** |

**The ledger stopped recording on 2026-08-22.** Everything since — including every migration in
this chain — was applied by direct `psql`, which is exactly what `CLAUDE.md` instructs, and none
of it was written back to the ledger.

**Why this is a hazard rather than untidiness:** anyone deploying to production and using the
ledger to decide what to run would conclude that 45 migrations are outstanding and re-run them.
Several are **not idempotent** — 402 drops columns, 404 drops and recreates a function, 409 drops
a signature. Re-running them against a database that already has them would fail partway, or
succeed destructively.

**The 0 in the last row is the good news:** no migration file has been deleted after being
applied, so the disk is a complete record even though the ledger is not.

**Recommendation:** before any production migration work, decide explicitly whether the ledger is
being adopted (in which case it must be back-filled) or abandoned (in which case the deploy
procedure must say so, and stop implying a ledger exists). **Do not leave it half-true.**

---

## ه. APP_GIT_SHA vs HEAD

*(filled in after the final rebuild — see the closing section)*

**A caution that belongs here permanently.** This check is CLAUDE.md's only proof that the
deployed code is the intended code, and on 2026-08-26 it was found to be **lying**: the documented
deploy command never set `GIT_SHA`, so compose took a stale value pinned in `.env.lan` and stamped
`APP_GIT_SHA=1ca72316` onto a correct build of entirely different code. Both `CLAUDE.md` and
`AGENTS.md` were amended to export `GIT_SHA` first, and verified byte-identical.

**When the label and HEAD disagree, do not assume the label is right.** Confirm by looking for a
string only the new code contains:

```bash
docker exec afrakala-lan-web sh -c "grep -rl '<a symbol only the new code has>' /app/.output"
```

---

## و. OPEN GATES, AND WHETHER EACH BLOCKS PRODUCTION

29 gate rows are open. Only the first genuinely blocks.

| gate | blocks production? |
|---|---|
| **OG-75** — is 399 applied to production? | **YES — this is item أ** |
| **OG-6** — production authorisation itself | **YES, by definition** |
| OG-74 — the 26 definer writers have no INTERNAL guard, so any *authenticated* user can strip an admin | **Serious, not blocking.** 399 closed the unauthenticated path; this is the remaining half and needs 26 business decisions about which role each function should require |
| OG-71 — four functions write a UTC date into a record that cannot be corrected | **No**, but it silently mis-dates records for 3.5 hours a day |
| OG-72 / OG-73 — OCR persistence and the payment/dual branches | No — feature completeness |
| OG-76 — three stuck posted documents | No — they are reversed and ledger-neutral; see the note below |
| OG-80 — the sweep's window is set (10 days) but nothing calls it on a schedule | No — it is called from the new-quote page |
| OG-5, OG-27, OG-30, OG-32, OG-35, OG-37, OG-39–OG-43, OG-47, OG-48, OG-51, OG-53, OG-66, OG-69 | No — recorded, none newly discovered here |

**OG-76 in full, because it is the kind of thing that looks alarming in a table.** Three posted
documents exist that cannot be deleted: two journal entries from an early harness (OG-56) and one
receipt plus its two entries created by a gate of mine that was written to *prevent* orphans and
walked into the same trap. The receipt was corrected the way the system prescribes —
`reverse_document`, producing a compensating entry — so it is **ledger-neutral**, not wrong money.
They cannot be removed because the immutability trigger refuses deletion even for a superuser,
which is the guarantee working as designed. **A spec now pins the known set by id, so a fourth is
caught the run it appears.**

---

## ز. WHAT I WOULD FIX BEFORE A REAL ACCOUNTANT MOVES REAL MONEY THROUGH THIS

Asked for honestly, so answered honestly.

**I would apply 399 to production before anything else, and I would not wait for a scheduled
deploy to do it.** Everything else on this list is a defect; that one is an open door that needs
no credentials. It is one migration and its effect is a revoke.

**Then I would close OG-74**, because 399 only shut the unauthenticated half. Today any logged-in
user — a `sales` account, a `viewer` account — can still call `revoke_user_role_txt` and remove an
administrator. That is a smaller blast radius than `anon` and the same ending.

**Then I would settle the migration ledger (item د)**, because it is the item most likely to cause
a *new* disaster rather than reflect an old one. A stale ledger plus a non-idempotent migration
plus someone in a hurry is how a production database gets damaged by a procedure everyone
believed was safe.

**And I would want one more adversarial review — of the gates, not the code.** Two gates were
found vacuous this session, both by disturbing them rather than by reading them, and both had
looked correct. The suite's green is currently worth exactly as much as the disturbance
discipline behind it, and that discipline was applied thoroughly only from the middle of this
session onward. **I do not know how many of the older gates measure what they claim**, and that
uncertainty is larger than any single open gate on this sheet.

**What I would NOT hold a deploy for:** the OCR persistence gap, the payment/dual OCR branches,
the UTC date class in OG-71, or the three stuck documents. Those are real and they are recorded,
but none of them loses money or grants access.

---

## Final verification

*(this section is completed once the final e2e run and rebuild finish)*
