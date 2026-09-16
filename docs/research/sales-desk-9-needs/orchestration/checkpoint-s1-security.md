# Checkpoint S1 — sales-desk RLS/RPC security review

| Field | Value |
|---|---|
| **Status** | COMPLETE |
| **Agent** | dev-security-critic (independent; did not author 545/546/547) |
| **Branch** | `feature/sales-desk` |
| **HEAD at start/end** | `b5ee0dc64a75335657936f45f8850ae1e78b1b5a` (docs-only commit may follow) |
| **Worktree** | `D:\AfraKalaTest\app` |
| **Scope** | Migrations 545 / 546 / 547 + live LAN db `afrakala` (read-only / `ROLLBACK` only) |
| **Deadline** | 2026-09-16T06:30:00+05:00 |
| **Written** | 2026-09-16 |
| **Verdict** | **REJECT** (original S1) → superseded by **RE-REVIEW APPROVE** below for C6 only |
| **RE-REVIEW** | 2026-09-16 — migration 548; see section at end |

Rule applied: **artifact-positive** — absence of a quoted permission check = unprotected.

Evidence appendix (this session): `_s1_catalog.{sql,out}`, `_s1_ids.{sql,out}`, `_s1_rls_probe.{sql,out}`, `_s1_notify_call.{sql,out}`.

RE-REVIEW evidence: `_s1_rereview_catalog.{sql,out}`, `_s1_rereview_steal.{sql,out}`, runner `_s1_rereview_run.cjs`.

---

## سطح حمله

| ورودی بیرونی | مسیر:خط (دیسک) | یادداشت |
|---|---|---|
| Table DML `sales_interactions` via PostgREST/`authenticated` | `…545…sql:403-496` + grants `501-504` | SELECT/INSERT/UPDATE under RLS; DELETE granted but no DELETE policy |
| RPC `sales_interaction_create` | `…546…sql:25-103` | SECURITY DEFINER; caller supplies `p_salesperson_id`, never `author_id` |
| RPC `sales_interaction_update_status` | `…546…sql:117-160` | SECURITY DEFINER; bypasses RLS; body authz |
| RPC `sales_interaction_set_follow_up` | `…546…sql:174-211` | SECURITY DEFINER; bypasses RLS; body authz |
| RPC `sales_my_month_stats` | `…546…sql:229-296` | SECURITY DEFINER reader of SDPM / `call_logs` / interactions |
| Trigger `notify_sales_interaction_assigned` | `…547…sql:50-117` | SECURITY DEFINER writer into `notification_queue` |
| Direct `notification_queue` INSERT | live grants + RLS (catalog) | Authenticated has INSERT grant; no INSERT policy |
| `service_role` / table owner | grants `504`; `relforcerowsecurity=f` | BYPASSRLS expected for service path — out of end-user threat model |

---

## جدول controlها

| Control | وضعیت | Artifact مثبت (E2) یا «محافظت‌نشده» |
|---|---|---|
| **C1 RLS SELECT — sales cannot read arbitrary others** | برقرار (با مسیر responsible) | `545:460-474` — `author_id = auth.uid() OR salesperson_id = auth.uid() OR customer_id IN (… responsible_id = auth.uid())`; admin/manager short-circuit. Live match: `_s1_catalog.out` policy `sales_interactions_select_staff`. Behavioral **E4**: `S1 cross_read_other_author count=0` (`_s1_rls_probe.out`). |
| **C2 RLS SELECT — admin/manager see all** | برقرار | `545:463` `has_any_role(auth.uid(), ARRAY['admin','manager'])`. |
| **C3 RLS INSERT — staff + `author_id = auth.uid()`** | برقرار | `545:479-482` `has_any_role(… sales/admin/manager/accountant) AND author_id = auth.uid()`. **E4**: forge other author → `S1 forge_author_insert_ok=false` RLS violation. |
| **C4 RLS INSERT — cannot spoof `author_id`** | برقرار | همان WITH CHECK `author_id = auth.uid()` (`545:481`). |
| **C5 RLS UPDATE — only author / salesperson / admin/manager** | برقرار (ورود به ردیف) | `545:487-496` USING+WITH CHECK. **Note:** no ongoing `has_any_role('sales'…)` on author/assignee branches. |
| **C6 RLS UPDATE — `author_id` immutable / non-escalatable** | **محافظت‌نشده** | No `WITH CHECK (author_id = OLD.author_id)` / trigger / column revoke. **E4**: `S1 assignee_can_steal_author=t` — assignee set `author_id` to self. |
| **C7 RLS UPDATE — `salesperson_id` escalation constrained** | **محافظت‌نشده** (by design for assign, but unbounded) | INSERT/UPDATE allow any `salesperson_id` FK to `profiles` if actor remains author or assignee after change. No role check that target is sales staff. Enables assign-notify spam. |
| **C8 DELETE denied to end users** | برقرار (via RLS absence, not REVOKE) | Live: `delete_policies=0`, `S1 delete_as_author row_count=0`. Grant still has DELETE (`545:503` + live catalog) — defense-in-depth gap, see findings. |
| **C9 anon closed on table** | برقرار | `545:501-502` REVOKE; assert `538-544`. Live **E3**: all `has_table_privilege('anon',…)=f`. |
| **C10 RPC DEFINER — `auth.uid` null check** | برقرار | create `546:49-51`; update_status `132-134`; set_follow_up `188-190`; stats `245-247`. |
| **C11 RPC DEFINER — role check on create/stats** | برقرار | create `546:53-56`; stats `249-252` `has_any_role(… sales/admin/manager/accountant)`. |
| **C12 RPC DEFINER — object authz on update/follow-up** | برقرار | update_status `546:145-151`; set_follow_up `197-203` — admin/manager OR author OR salesperson. |
| **C13 RPC create — `author_id` forced to actor** | برقرار | `546:89-97` inserts `_actor` not a caller author param. **E4**: `S1 rpc_create … match=t`. |
| **C14 RPC `search_path` pinned** | برقرار | Each RPC `SET search_path TO 'public'` (`546:40,125,184,234`). Live `proconfig={search_path=public}`. |
| **C15 RPC anon EXECUTE closed** | برقرار | REVOKE/GRANT `546:108-111` etc.; assert `321-332`. Live **E3**: `anon_exec=f` all four RPCs. |
| **C16 Notify trigger — DEFINER + search_path** | برقرار | `547:53-54` SECURITY DEFINER + `search_path=public`. |
| **C17 Notify — cannot forge via direct function call** | برقرار (runtime) | Direct call **E3**: `trigger functions can only be called as triggers` (`_s1_notify_call.out`). **Note:** live `proacl` still grants `authenticated=X` on notify fn (unnecessary). |
| **C18 Notify — cannot forge via direct `notification_queue` INSERT** | برقرار (RLS) | Live: NQ RLS on; no INSERT policy; **E4** `S1 direct_nq_insert_ok=false` / RLS violation. Authenticated still has table INSERT **grant** (defense-in-depth gap). |
| **C19 Notify — only fires on real assign path** | برقرار (trigger gate) | `547:62-74` null / unchanged / self-assign skips. **E4** `S1 assign_notify_delta=1` after salesperson change. |
| **C20 Any path bypassing `author_id=auth.uid()` on create** | برقرار for create | Table INSERT WITH CHECK + RPC forces `_actor`. **Bypass on UPDATE:** see C6 — post-create identity rebinding. |

---

## مسیرهای دور زدن

| مسیر بررسی‌شده | نتیجه |
|---|---|
| Sales JWT SELECT row authored by other sales (not assignee, not responsible) | Blocked — count=0 (**E4**) |
| INSERT with `author_id <> auth.uid()` | Blocked — RLS (**E4**) |
| RPC create with any salesperson; author spoof | Author always actor (**E4**); salesperson caller-chosen (intended) |
| SECURITY DEFINER update_status / set_follow_up without being author/assignee/admin | Body raises `42501` (`546:145-151`, `197-203`) — file evidence; not separately JWT-probed this session |
| Assignee UPDATE `author_id = self` | **Allowed** — identity escalation (**E4**) |
| Author UPDATE arbitrary `salesperson_id` → notification_queue row | **Allowed** — assign notify by design; spam vector |
| Direct EXECUTE notify trigger function | Fails — not a callable trigger context (**E3**) |
| Direct INSERT `notification_queue` as authenticated | Blocked by RLS (**E4**) |
| DELETE as author | 0 rows — no DELETE policy (**E4**) |
| anon table/RPC | Closed (**E3** catalog) |
| `service_role` / owner bypass RLS | Open by platform design — not end-user path |

---

## جست‌وجوی راز

| کار | نتیجه |
|---|---|
| Migrations 545/546/547 scanned (this review) | No passwords, API keys, or JWT secrets in SQL text (**E2** file read). |
| Live probe used `deploy/lan/.env.lan` `POSTGRES_PASSWORD` in shell env only | **Not** printed; **not** written into checkpoint or `*_s1_*.out`. |
| Probe NOTICE lines include live user UUIDs | Operational IDs only; no passwords. Treat as sensitive-ish in shared logs. |

---

## یافته‌ها

| شدت | مسیر:خط | کلاس | اثر |
|---|---|---|---|
| **HIGH** | `545:484-496` UPDATE policy; confirmed `_s1_rls_probe.out` `assignee_can_steal_author=t` | Privilege escalation / identity rebinding | Assignee (or author) can set `author_id` to self (or, for author, rebind while remaining salesperson). Breaks INSERT invariant `author_id = auth.uid()` after first write; permanent ownership takeover; then reassignment rights follow author. |
| **MEDIUM** | `545:476-482`, `546:79-82,96`, `547:61-101` | Notification abuse / unbounded assign | Any staff author can set `salesperson_id` to any `profiles.id` repeatedly → DEFINER trigger enqueues `sales_interaction_assigned` for victims (delta=1 proven). No target-role check, no rate limit. |
| **LOW** | `545:503` GRANT DELETE; live grants include DELETE/REFERENCES/TRIGGER | Excess privilege (grant vs policy) | DELETE ineffective under RLS today (`row_count=0`), but grant is wider than policy set; future policy mistake becomes deleteable. |
| **LOW** | `547:110-111` REVOKE PUBLIC/anon only; live `proacl` has `authenticated=X` on notify fn | Excess EXECUTE on trigger fn | Not directly callable as trigger fn (**E3**), but grant is unnecessary surface. |
| **LOW** | `545:484-496` UPDATE USING without staff role on author/assignee arms | Authz drift | User who loses sales role but remains author/assignee can still UPDATE via RLS (and via DEFINER RPCs that omit role re-check). |
| **INFO** | `545:465-472` SELECT via `customers.responsible_id` | Matches brief | Sales/accountant see interactions for customers they own — not “others’ private notes” unless linked to that customer. |

### Brief alignment

| Brief want | Evidence |
|---|---|
| sales/admin/manager/accountant read own + responsible customers | C1/C2 — yes |
| admin/manager all | C2 — yes |
| insert `author_id=auth.uid()` | C3/C4/C13 — yes on create |
| update author/salesperson/admin/manager | C5 — yes for row entry; **fails integrity of author binding (C6)** |
| notify on assign | C16/C19 — yes |

---

## چه چیزی را نتوانستم بررسی کنم

| مورد | دلیل |
|---|---|
| JWT cold-browser UI paths ([A-10]) | Out of SQL scope this slot; no Playwright session |
| `sales_interaction_update_status` deny for pure responsible viewer | File authz present; no dedicated JWT fail probe |
| Production DB | Only LAN `afrakala` |
| Whether UI uses RPC-only vs direct table UPDATE | Frontend out of D1 migration scope; direct UPDATE is granted and RLS-open to author/assignee |
| Full [C-3] census of unrelated DEFINER functions | Scoped to sales-desk objects only |

---

## [C-1] سه راه که «درست به نظر برسد» ولی نباشد

1. **Insert WITH CHECK alone** — looks like author binding; UPDATE policy omits immutability → assignee steal (**tested red**).
2. **REVOKE anon on notify function** — looks closed; authenticated still has EXECUTE in live `proacl` (harmless only because trigger-fn call fails).
3. **GRANT DELETE + RLS enabled** — looks like delete allowed; zero DELETE policies → silent 0-row deletes (**tested**).

---

## حکم: **REJECT**

**REJECT** — create-path authz, anon closure, DEFINER `search_path`, RPC author forcing, cross-user SELECT isolation, and assign-notify mechanics are evidenced **E2/E3/E4** and largely match the brief, but **C6 is unprotected**: live rolled-back probe proved an assignee can rebind `author_id` to themselves. That is a positive control failure on the identity invariant the design advertises for insert.

### Minimum fix direction (not applied — critic is read-only)

- UPDATE `WITH CHECK` (and preferably BEFORE UPDATE trigger / RPC-only column gates): `author_id` immutable except admin/manager; optionally restrict `salesperson_id` changes to author/admin/manager.
- Tighten grants: revoke DELETE/REFERENCES/TRIGGER on `sales_interactions` from `authenticated` if unused; revoke EXECUTE on `notify_sales_interaction_assigned` from `authenticated`.
- Re-test with the same `_s1_rls_probe.sql` expecting `assignee_can_steal_author=f`.

---

## Git / probe hygiene [D-1][E-2]

- Critic made **no** migration or product code edits.
- Created gitignored? No — probe SQL/out under `docs/research/.../orchestration/` (tracked if committed).
- Password never written to repo files.
- No `git push`. Docs commit of this checkpoint (+ optional `_s1_*` evidence) only if performed after write.

---

## RE-REVIEW — migration 548 `author_id` UPDATE immutability (C6 only)

| Field | Value |
|---|---|
| **Agent** | `dev-security-critic` (independent; did **not** author 548) |
| **Branch** | `feature/sales-desk` |
| **HEAD at RE-REVIEW start** | `755466cf0a5e185bdb99d1c6d22e91006da7a7d0` |
| **Scope** | **Only** C6 / `author_id` UPDATE lock after `20260916033000_548_sales_interactions_lock_author_id.sql` on LAN db `afrakala` |
| **Prior REJECT cause** | C6 `assignee_can_steal_author=t` |
| **Deadline** | 2026-09-16T07:15:00+05:00 |
| **Verdict** | **APPROVE** (C6 closed; prior MEDIUM assign-spam still open, out of this re-verify) |

### Artifact مثبت — trigger from migration 548 (E2)

File `supabase/migrations/20260916033000_548_sales_interactions_lock_author_id.sql` lines 22–51:

```sql
CREATE OR REPLACE FUNCTION public.tg_sales_interactions_lock_author_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    IF current_user = 'authenticated'
       AND NOT public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    THEN
      RAISE EXCEPTION
        'sales_interactions.author_id is immutable for non-admin/manager (migration 548)'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sales_interactions_lock_author_id
  BEFORE UPDATE ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sales_interactions_lock_author_id();
```

Live catalog match (**E3**, `_s1_rereview_catalog.out`): ledger `20260916033000` present; trigger `trg_sales_interactions_lock_author_id` `tgenabled=O`; live `pg_get_functiondef` body matches the immutability gate + `42501` message; `authenticated_has_delete=f`.

### Behavioral probe [E4] — rolled-back assignee steal

| Phase | Result | Evidence |
|---|---|---|
| Before 548 (prior S1) | `assignee_can_steal_author=t` | `_s1_rls_probe.out` / `_s1_steal_before_548.out` |
| After 548 (this RE-REVIEW) | `assignee_can_steal_author=f` | `_s1_rereview_steal.out` |

Independent probe SQL: `_s1_rereview_steal.sql` (BEGIN → assignee JWT UPDATE `author_id` → nested EXCEPTION → SELECT result → ROLLBACK). Runner exit: `NODE_EXIT=0` / `PSQL … rc= 0` (**E3**, [G-3] via Node `execFileSync` status, no pipe truncation).

Quoted result row from `_s1_rereview_steal.out`:

```
 assignee_can_steal_author | author_after | author_expected | steal_err | authenticated_has_delete
 f                         | 00ebe9d3-…   | 00ebe9d3-…      | sales_interactions.author_id is immutable for non-admin/manager (migration 548) | f
ROLLBACK
```

(`author_after` = `author_expected`; steal blocked by trigger message naming migration 548.)

### Control C6 after 548

| Control | وضعیت | Artifact |
|---|---|---|
| **C6 `author_id` immutable for non-admin/manager on UPDATE** | **برقرار** | Trigger body above (E2) + live def (E3) + `assignee_can_steal_author=f` (E4) |

### Out of this RE-REVIEW (still open from original S1)

| شدت | یادداشت |
|---|---|
| **MEDIUM** | Prior salesperson / unbounded `salesperson_id` assign → notify spam — **still open**; not re-probed; not blocking this C6-only APPROVE. |
| **LOW** | Excess REFERENCES/TRIGGER grants; authz drift on lost sales role — unchanged, out of scope. |

### [C-1] ways this RE-REVIEW could look green but not be

1. **Exception swallowed without checking author unchanged** — countered: result row requires `author_after = author_expected` and raises if not.
2. **Probe as table owner / not `authenticated`** — countered: `SET LOCAL ROLE authenticated` + JWT `sub` = assignee before steal UPDATE; error text is the 548 gate (not RLS miss).
3. **548 applied only in files, not live** — countered: ledger version + live `pg_get_functiondef` + behavioral block on LAN `afrakala`.

### حکم RE-REVIEW: **APPROVE**

**APPROVE** for the scoped C6 / `author_id` UPDATE immutability fix after migration 548. Original S1 REJECT cause is closed with E2+E3+E4. Do not treat as blanket approval of all prior MEDIUM/LOW findings.
