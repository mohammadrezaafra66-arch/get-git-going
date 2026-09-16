# sec-rls — Calm Mind work_* security glance

**Agent:** dev-security-critic (independent; no constructor reports used)  
**Scope:** `public.work_items`, `work_topics`, `work_merge_suggestions` + DEFINER RPCs + UI `/operations/work*`  
**Out of scope:** `public.tasks` (verified migration does not ALTER it)  
**Baseline HEAD at start:** `51f98fdf9ea0040ad8de661645d9b53e6a984e3f`  
**HEAD observed mid-run (concurrent commit, not by this agent):** `3791cdd835c3e67ee39495cf1d2e69e65eacc662` — [D-1] noted; product code not modified by this agent.  
**Live DB:** `afrakala-lan-db` / `afrakala` — catalog probes in transaction + `ROLLBACK` (E3).

## حکم: **FAIL**

Core row visibility for admin/manager vs creator/assignee is present and DEFINER RPCs re-check visibility. Fail driven by **RLS write/select policies that do not enforce the work role allowlist** (any `authenticated` identity can insert own rows), plus route↔DB/viewer and merge-status integrity gaps below.

---

## سطح حمله

| ورودی | مسیر:خط |
|--------|---------|
| PostgREST table CRUD `work_items` / `work_topics` / `work_merge_suggestions` | client: `src/lib/work/items.ts:11`, `topics.ts`, `merge.ts:5-6`; grants mig `…543….sql:381-391` |
| RPC `work_create_item` | mig `555-625`; client `items.ts:70-86` |
| RPC `work_morning_summary` | mig `396-479`; `summary.ts` |
| RPC `work_set_decision_bucket` | mig `487-547` |
| RPC `work_scan_merge_suggestions` | mig `635-754` |
| RPC `work_accept_merge` / `work_dismiss_merge` | mig `762-942` |
| UI routes `/operations/work*` | `_app.operations.work*.tsx` `requireAnyRole` |
| Chat → create work item | `CreateWorkFromMessageButton.tsx` → `createWorkItem`; mounted on messenger (`MessageList` / `MessageComposer` / `AiAssistantDrawer`); route `/messages` = `requirePermission("messages","view")` |

---

## جدول controlها

| Control | Artifact مثبت (E2) یا محافظت‌نشده |
|---------|-----------------------------------|
| RLS enabled on 3 tables | **برقرار** — mig `64`, `179`, `214` `ALTER TABLE … ENABLE ROW LEVEL SECURITY`; live: `rls=t` (`_sec-rls-probe.out.txt`) |
| `work_items` SELECT: admin/manager OR creator OR assignee | **برقرار** — mig `246-252`: `has_any_role(… admin, manager) OR creator_id = auth.uid() OR assignee_id = auth.uid()`; live `pg_policies` matches |
| `work_items` INSERT: creator only | **برقرار (هویت)** / **نقش: محافظت‌نشده** — mig `255-260`: فقط `auth.uid() IS NOT NULL AND creator_id = auth.uid()` — **بدون** `has_any_role` / `role_permissions` |
| `work_items` UPDATE: admin/manager OR creator OR assignee | **برقرار (مالکیت)** / **نقش: محافظت‌نشده** — mig `263-274` — بدون allowlist نقش work |
| `work_items` DELETE: admin/manager | **برقرار** — mig `277-281` |
| `work_topics` SELECT/INSERT/UPDATE/DELETE | **برقرار (مالکیت/لینک)** — mig `287-328`; INSERT فقط `owner_id = auth.uid()` — **بدون نقش work** |
| `work_merge_suggestions` SELECT via `work_can_see_item` | **برقرار** — mig `334-342` + helper `219-236` |
| Anon table privileges revoked | **برقرار** — mig `381-391`; live E3: `anon_sel/ins/upd/del = f` for all three; `relacl` has no `anon` |
| Anon EXECUTE on RPCs revoked | **برقرار** — mig REVOKE/GRANT blocks; live E3: `anon_exec=f`, `auth_exec=t` for all 7 work_* RPCs (`_sec-rls-probe2.out.txt`) |
| `role_permissions` module `work` seeded (no empty-row open door) | **برقرار** — mig `19-34`; live: 7 roles; `purchase_specialist`/`site` all false; viewer/sales/accountant view+create+update true |
| DEFINER `work_morning_summary` re-checks visibility | **برقرار** — mig `409-421` auth + `v_is_mgr OR creator OR assignee` CTE (no cross-tenant leak). **Role allowlist: محافظت‌نشده** (any authenticated gets zeros) |
| DEFINER `work_set_decision_bucket` re-checks visibility | **برقرار** — mig `502-525` `42501` if not admin/manager/creator/assignee |
| DEFINER `work_create_item` role gate | **برقرار (RPC)** — mig `586-592` `has_any_role(… admin, manager, sales, accountant, viewer)`. **Bypass: direct INSERT RLS** (بالا) |
| DEFINER `work_scan_merge_suggestions` visibility | **برقرار** — mig `657-660` `work_can_see_item`; loop `696-698` skips non-visible candidates |
| DEFINER `work_accept_merge` visibility + keep update | **برقرار** — mig `812-843` |
| DEFINER `work_dismiss_merge` visibility | **برقرار** — mig `920-929` |
| Merge accept must go through RPC (no direct status cheat) | **محافظت‌نشده** — RLS UPDATE `353-369` allows any seer of both items to `UPDATE` status without running merge body logic |
| UI route gate `/operations/work*` | **برقرار (کلاینت)** — e.g. `_app.operations.work.tsx:5-10` `WORK_ROLES = admin\|manager\|sales\|accountant` + `requireAnyRole` |
| UI ↔ DB role alignment (viewer) | **عدم تطابق** — UI/nav exclude viewer; DB seed + `work_create_item` **include** viewer |
| Chat create gated by work roles | **محافظت‌نشده در UI** — button has no role check; relies on RPC. Messenger allows `purchase_specialist` (`messages.can_view=t` live) → RPC deny; **viewer** can create |

---

## مسیرهای دور زدن

| مسیر | نتیجه |
|------|--------|
| Direct `from('work_items').insert` as `purchase_specialist` / `site` | **باز** — RLS INSERT ندارد نقش؛ فقط `creator_id = auth.uid()`. RPC مسیر بسته است؛ جدول باز است. |
| Direct UPDATE `work_merge_suggestions.status` | **باز** — می‌توان `accepted`/`dismissed` زد بدون `work_accept_merge` (ادغام واقعی انجام نمی‌شود) |
| Chat create بدون نقش work در UI | **نیمه‌باز** — UI نشان می‌دهد؛ DB برای non-allowlist نقش‌ها از RPC رد می‌کند؛ برای **viewer** قبول می‌کند |
| `work_scan` WHERE با `v_src.creator_id = v_uid` | کاندیداهای گسترده، سپس `work_can_see_item` — **نشت به کلاینت دیده نشد** |
| Anon / PUBLIC execute | **بسته** (live) |
| service_role / owner bypass RLS | **انتظار Supabase** — `force_rls=f` |

---

## جست‌وجوی راز

- Migration/checkpoint/probes: no committed service keys observed in this review path.
- Live probes used container env `POSTGRES_PASSWORD` inside docker only; **values not copied into this report** (E3 method only).
- Probe artifacts written (local, untracked unless committed separately):  
  `checkpoints/_sec-rls-probe{,2,3}.{sql,out.txt}`

---

## یافته‌ها

| شدت | مسیر:خط | کلاس | اثر |
|-----|---------|------|-----|
| **High** | `20260915233000_543_work_calm_mind.sql:254-260` (INSERT) و متقارن UPDATE/SELECT بدون نقش; مقایسه با seed `19-34` و RPC `586-592` | AuthZ gap — RLS vs role allowlist | هر نقش `authenticated` (از جمله `purchase_specialist` که `messages` دارد) می‌تواند مستقیماً `work_items`/`work_topics` بسازد و ردیف‌های خود را بخواند/عوض کند؛ `role_permissions.work` و گارد RPC دور زده می‌شود. |
| **Medium** | mig `353-369` UPDATE on `work_merge_suggestions` | Process/integrity bypass | کاربرِ مجازِ دیدن جفت می‌تواند `status` را بدون RPC ادغام عوض کند → وضعیت پیشنهاد دروغین. |
| **Medium** | Routes `_app.operations.work*.tsx:5` vs seed viewer + RPC `586-588` vs nav `registry.ts:1409-1411` | Route↔DB mismatch | UI board بدون viewer؛ API/chat برای viewer باز (هم‌راستا با RLS map intentional ولی با تصمیم UI در تضاد). |
| **Low** | `CreateWorkFromMessageButton` بدون `requireAnyRole`; `/messages` فقط `messages.view` | Missing UI control | تکیه کامل به RPC؛ UX خطا برای نقش‌های بدون work؛ برای viewer مسیر واقعی ایجاد. |
| **Low** | `work_morning_summary` فقط `auth.uid()` | Broad EXECUTE surface | نقش‌های بدون work خلاصهٔ خالی می‌گیرند — افشای دادهٔ دیگران نیست. |

---

## چه چیزی را نتوانستم بررسی کنم

- Behavioral RLS as non-owner JWT (no end-user session JWT in this glance; catalog + migration only for role simulation). [A-9] no live EXECUTE of DEFINER writers.
- Cold-browser [A-10] route denial for viewer / purchase_specialist.
- Whether app ever uses `service_role` against these tables from browser (assumed not; not proven).

---

## شواهد زنده (خلاصه E3)

```
docker exec afrakala-lan-db … psql -d afrakala  → EXIT=0 (probe2)
anon_* privileges on work_* tables: all false
anon_exec on work_* RPCs: all false; auth_exec: all true
role_permissions work: viewer can_*=t; purchase_specialist/site all f
messages.can_view: purchase_specialist=t, viewer=t
```

---

## حکم نهایی

**FAIL** — visibility helpers and DEFINER re-checks for the six RPCs are largely solid and anon is closed, but **table RLS does not enforce the work role allowlist on INSERT/UPDATE/SELECT**, so the intended role map is not the real write gate. Fix belongs in data layer (RLS `WITH CHECK`/`USING` + optionally revoke direct INSERT in favor of RPC-only), not UI.

**PASS criteria that did hold:** anon revoked; admin/manager elevation; creator/assignee visibility predicate; DEFINER visibility re-check on set_decision / scan / accept / dismiss / morning_summary scope; delete limited to admin/manager.
