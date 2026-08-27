# PRODUCTION READINESS SHEET

**Prepared:** 2026-08-27 · **Prepared on:** the test computer (`192.168.170.8`) ·
**Production was never contacted — `192.168.170.10` was not reached at any point.**

This sheet exists so that OG-6 (production authorisation) is asked **with evidence in hand**
rather than on a general sense that things are going well. It is ordered by what should stop a
deploy, not by what was most work.

---

## أ‑0. OG-82 — HTTPS IS BROKEN ON THE TEST SERVER, AND IT BLOCKS PRODUCTION

**This is not only a test-harness problem, and that is why it sits above OG-75.**

HTTPS on the test server is dead. Every TLS handshake is refused — both hostnames, the bare IP,
loopback, TLS 1.2 and 1.3, from the host and from inside the Docker network — **while Caddy
reports itself healthy** (`server running`, `protocols=[h1 h2 h3]`) with certificates loaded for
`test.myafrakala.ir api.test.myafrakala.ir 192.168.170.8`. From inside the container the
handshake is refused with `tlsv1 alert internal error`.

**The certificate files were replaced on 24 August at 14:23, and the previous `.bak` copies
(11:09) are still present.** `test-cert.pem` changed size (1570 → 1602); `test-key.pem` did not
(1708 → 1708).

**Two obvious causes are ruled out, measured:** the current cert and key ARE a matching pair
(modulus md5 `db19a959…` on both), the backup pair also matches, and the certificate is valid
(`notBefore Aug 24 2026`, `notAfter Nov 24 2028`). So it is neither a mismatched pair nor an
expired certificate. The owner's decision was not to chase it further from inside this chain.

**Why it blocks production, and not just testing:** `getUserMedia` and `crypto.subtle` are
**Secure-Context only**. Without working HTTPS, **OCR capture and file upload cannot work on any
deployment** — the two features Phase 7 and M1 exist to deliver. A deployment reachable only over
HTTP is not a deployment of this product.

**A diagnostic error of mine is recorded with it,** because the reasoning matters more than the
fact: I first concluded this was a Docker/WSL port-forward fault, on one piece of evidence —
Caddy's log was empty for a dozen failed handshakes. That was wrong. **An empty log does not
prove the traffic never arrived**; Caddy does not log handshake failures at its default level.
Recorded as RULE 18.

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

- **Migrations 407–410** — the credit model, the reservation wiring and the ledger back-fill. No
  adversarial pass. They carry their own assertions and gates.
- **Migrations 411+ and anything after this sheet.**
- **The UI.** Every gate in this chain is API- or database-level.

**Reviewed independently — the GATES of migrations 399–406.** A second adversarial subagent, again
with no mission context, was given one instruction: break what each gate guards and see whether
the gate notices. **It found SIX vacuous gates — all written during this session, most within
hours of RULE 15 being recorded.** Every one is now repaired and disturbance-verified:

| gate | how it was defeated |
|---|---|
| 403 + the M1 spec | `pg_get_functiondef` text match — an INSERT demoted to a `/* */` comment satisfied it, and it was the **only** evidence for two of the three write paths |
| OG-23, three OPEN halves | wrote each column back to **its own value**; the trigger uses `IS DISTINCT FROM`, so a same-value write is never a change |
| OG-67 cash/cheque | counted **string occurrences** — the words left in a comment counted |
| OG-78 gap check | asserted the ACL row **exists**, never what it **grants** |
| 402 `ON DELETE CASCADE` | claimed in a header comment, asserted nowhere — `confdeltype` was never read |
| 404 `$verify$` | `RAISE NOTICE` instead of an assertion; "no negative amounts" satisfied by having no payment rows |

**The sharpest finding is a general one:** 403's migration assertion and its e2e assertion were
*the same query*, so they failed open together. **Two gates that share a mechanism are one gate.**
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

**RESOLVED 2026-08-27 by migration 410 — and nothing was re-run.**

Applied-ness was proven **from the database, not from the files**: each of the 45 carries its own
verification block, and those were re-run live inside rollbacks. **26 passed outright.** The rest
failed for a reason that had to be resolved one at a time — **supersession, not absence**. Six
assert "the FUNCTIONS default privilege for `anon` is untouched", and **393 removed exactly that
entry on purpose**; 391 asserts on a column **402 dropped**, while 391's own effects were checked
directly and are live. **Treating those ten as ten missing migrations would have been wrong in
every case.**

After 410: **disk 598, ledger 598, zero discrepancy in both directions.**

**The root cause is fixed, not just the symptom.** `CLAUDE.md` and `AGENTS.md` prescribed direct
`psql` application and never said the ledger row must be written too — only the Supabase CLI does
that. Rule 2b now makes it two steps and states explicitly: **if you find a migration applied but
unrecorded, record the ROW, never re-run the migration.** Gated by
`e2e/security/og81-migration-ledger-matches-disk.spec.ts`, both directions.

---

## ه. APP_GIT_SHA vs HEAD

**`APP_GIT_SHA = 66525dbf` and `HEAD = 66525dbf` — they match.**

**But the running image is a DELIBERATE, TEMPORARY DEVIATION and must not be shipped.** To get
the harness working around OG-82 it was rebuilt with a shell override,
`VITE_SUPABASE_URL=http://192.168.170.8:9000`, so the bundle talks to Kong over **HTTP**.
Verified both ways: the served assets contain `192.168.170.8:9000` and **no longer contain**
`api.test.myafrakala.ir`.

**`deploy/lan/.env.lan` was NOT edited**, so the next ordinary rebuild restores the HTTPS
configuration by itself. Nothing needs undoing; it needs *not repeating*.

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
| **OG-82** — HTTPS broken; `getUserMedia`/`crypto.subtle` are Secure-Context only | **YES — this is item أ‑0** |
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

Asked for honestly, so answered honestly, and reordered as the day changed what I know.

**1. Apply 399 to production, and not on the next scheduled deploy — now.** Everything else here
is a defect; that one is an open door needing no credentials. An unauthenticated caller can strip
an administrator's role, demonstrated with output. It is one migration and its effect is a revoke.

**2. Fix HTTPS (OG-82).** I would not let an accountant near this system without it, and not for
the reason the test harness cares about. `getUserMedia` and `crypto.subtle` are Secure-Context
only, so **the scan-a-slip feature and file upload cannot work at all** without it — the two
things Phase 7 and M1 were built to deliver. Shipping an HTTP-only deployment ships a product
missing its newest capability, silently.

**3. Close OG-74.** 399 shuts the unauthenticated half. Today any logged-in user — a `sales`
account, a `viewer` — can still call `revoke_user_role_txt` and remove an administrator. Smaller
blast radius, same ending.

**4. Get the gates independently reviewed again — the gates, not the code.** This is the one that
moved *up* today rather than down, and it is the item I would insist on. An adversarial pass over
migrations 399–406 found **six vacuous gates**, every one written in this session, most within
hours of the rule that says to disturb them. They all looked correct. Two of them were the *only*
evidence for a production write path. **The suite's green is worth exactly as much as the
disturbance discipline behind it**, and that discipline was applied thoroughly only from the
middle of this session onward — so the older gates are unmeasured. I do not know how many of them
measure anything, and that uncertainty is larger than any single open gate on this sheet.

**What I would NOT hold a deploy for:** the OCR persistence gap (OG-72), the payment/dual OCR
branches (OG-73), the UTC date class (OG-71), the three stuck documents (OG-76), or the
unscheduled credit sweep (OG-80). Those are real, recorded, and none of them loses money or
grants access.

**And one thing I would say plainly to whoever deploys this:** the migration ledger was wrong by
45 rows until today, and the deploy instructions that caused it had been followed correctly. The
procedure was the bug. That is worth remembering the next time something here looks like human
error.

## Final verification — the run of 2026-08-27

**Environment, locked before the run.** CPU **mean 18.67% / median 21%** over 12 samples (RULE 4:
distributional, never one reading); 76 GB RAM free; **zero `chrome-headless-shell` processes**, so
no orphans to kill; `/login` 200 in 0.014s; **`APP_GIT_SHA = 66525dbf` = `HEAD`**.

**Arithmetic reconciled BEFORE any comparison** (the OG-54 discipline):

| | |
|---|---|
| tests playwright defines | **664** |
| passed / failed / skipped | **604 / 31 / 29** |
| independent marker count | 604 + 31 + 29 = **664** |
| **reconciles?** | **yes — every defined test reported** |
| duration | **20.8 minutes** |

The expected total moved 657 → 664 during the day: the M1 spec gained 3 tests and OG-81 added 4.
Stating that rather than quietly comparing against a stale number is the point of reconciling
first.

**The auth-expiry risk did not materialise.** The regenerated admin token was valid for 1.0 hours
and the run took 20.8 minutes, so no late failure can be attributed to it.

### Two-way SET comparison against the recorded 30

**Recovered — 3:**

| test | why |
|---|---|
| `asan/export-journal:162` | **OG-56, fixed this session** — the assertion now selects the corrupted entry by its property, not by position |
| `asan/final-verification:267` | **OG-56, fixed this session** — the two stuck rows are excluded by id |
| `persons/duplicate-mobile-blocked:59` | the known UI race the baseline itself flagged as new and non-deterministic |

**Line shifts, not changes — 2:** `export-bank-deposits:108 → :133` (mission 10's edits) and
`final-verification:325 → :333` (a comment I inserted). Normalising these before comparing is
what stops a moved line reading as one recovery plus one regression.

**New — 4, and they are two different things:**

| test | cause | mine? |
|---|---|---|
| `export-bank-deposits:159` (and `:133`'s reason changed) | **A REAL REGRESSION FROM MY OG-67 CHANGE.** The export now returns `receipt = 3, payment = 1`; the spec was written when it was receipts-only, so it looked the amount up in `payment_receipts` by a **voucher** id, got nothing, and failed `Expected: 0, Received: -360000000` — reading as a broken amount while the export behaved exactly as designed. **Fixed:** the spec now mirrors the RPC's two branches, looks the amount up in the right table by direction, expects the negation for payments, and reads the SOURCE bank account for a payment rather than the destination. **`export-bank-deposits` is now 12/12.** | **yes** |
| `requirements/214:9`, `214:24`, `214-1:20` | `apiRequestContext.get: socket hang up`. These target **`192.168.170.8:3002` and `:8002`** — the `claudegreenapi-*` containers, a DIFFERENT project. They are `Up` but not serving. **Nothing to do with AfraKala, this session's changes, or HTTP-vs-HTTPS**, and they are on the owner's do-not-touch list. | no |

### Did running on HTTP change anything?

**No difference is attributable to HTTP.** The three `requirements/214*` failures reach other
projects' services on their own ports and would fail identically over HTTPS. Everything else in
the failing set is either the recorded baseline, a normalised line shift, or the OG-67 regression
above — none of which involves the scheme.

What HTTP *did* change is that the suite could run at all: the previous attempt produced 189
failures because the sessions had expired 51 hours earlier and **could not be regenerated while
OG-82 blocked login**. That run is recorded as **OG-83 — INVALID**, in the OG-43 sense, so nobody
later reads it as a regression.

### Residual

`payment_receipts` moved **10 → 11** during the session. Fully accounted for: `2e08a5ab-…`,
`E2E_M1_ATTACH gate`, created 2026-08-26 16:56, **reversed** — OG-76, the receipt my own M1 gate
draft created before RULE 12 existed. It is ledger-neutral and pinned by id in
`rule12-no-gate-creates-posted-documents.spec.ts` so a fourth is caught the run it appears.
