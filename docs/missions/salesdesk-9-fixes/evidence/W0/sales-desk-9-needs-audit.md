# Audit — `sales-desk-9-needs` vs `salesdesk-9-fixes/FINDINGS.md`

**Date:** 2026-09-21  
**Worktree:** `D:\AfraKalaTest\wt-salesdesk-9-fixes`  
**Sources read:**

| Source | Path |
|--------|------|
| Needs README / HANDOFF | `docs/research/sales-desk-9-needs/README.md`, `HANDOFF.md` |
| Orchestration checkpoints | `docs/research/sales-desk-9-needs/orchestration/checkpoint-{b1,d1,d1b-548,f1,t1,s1-security,docs}.md` (+ SQL/out artifacts listed in checkpoints; not re-run) |
| Forensic findings | `docs/research/salesdesk-9-fixes/FINDINGS.md` (STATUS: COMPLETE, session 2026-09-21) |
| Extra (app only) | `D:\AfraKalaTest\app\docs\research\sales-desk-9-needs\RESEARCH-PROMPT.md` — defines the **31-node** audit; not part of the 2026-09-16 “9 needs delivery” doc set |

**Framing note:** `sales-desk-9-needs` documents a **2026-09-16 implementation** of nine sales-team needs on `feature/sales-desk` (migrations 545–548, routes, E2E). `FINDINGS.md` is a **2026-09-21 read-only forensic audit** of owner/sales pain points **N1–N31** (calls, deals/ interactions, activities, tickets, purchases, pricing). Overlap is mainly **W1 calls + W2 `sales_interactions` / میز فروش**; FINDINGS does not re-label “Need 1–9” but maps to nodes.

Legend: **Holds** · **Partial** · **Contradicted** · **Missing in FINDINGS** · **Superseded / stale**

---

## 1. Cross-cutting infrastructure claims

| Claim (9-needs) | Verdict vs FINDINGS | Notes |
|-----------------|---------------------|-------|
| Branch `feature/sales-desk` | **Holds** | FINDINGS §0: same branch. |
| Migrations **545–548** exist on disk | **Holds** | FINDINGS W2 cites `545–548`; live `sales_interactions` count **6** rows (§1). |
| 545–547 applied to LAN `afrakala` + ledger | **Partial** | FINDINGS confirms **live table + policies + 1× `sales_interaction_assigned` notification** — consistent with apply, but FINDINGS did **not** re-query migration ledger (same gap HANDOFF admits). |
| **548** C6 fix (`author_id` immutability) + S1 RE-REVIEW APPROVE | **Partial** | FINDINGS references migrations 545–548 and X2 RLS on interactions; **does not replay** `assignee_can_steal_author` probe. No contradiction with D1b/S1; simply **not re-verified** in FINDINGS session. |
| MEDIUM **assign-spam** on repeated `salesperson_id` changes | **Holds** | FINDINGS N9 / X1: assign notify exists; spam vector not closed (aligns with S1). |
| Migrations **not on production** | **Missing in FINDINGS** | FINDINGS forbids prod; neither confirms nor denies prod state. Treat as **still plausible** from 9-needs. |
| **Merge to staging / push** not done by docs agent | **Holds** | FINDINGS §0: `origin/staging` at `22717afb` ≠ HEAD `f9c57d0e`. |
| HEAD at doc time `3bec3749` (HANDOFF/checkpoint-docs) | **Superseded** | FINDINGS HEAD **`f9c57d0e`** (2026-09-19). Doc SHAs are historical, not a code contradiction. |
| `AUDIT-20260916.md` linked from README | **Broken in worktree** | File **not present** under `sales-desk-9-needs/` (README still links it). |
| `GROUND_TRUTH.md` outdated (HANDOFF § unverified) | **Missing in FINDINGS** | FINDINGS does not mention `GROUND_TRUTH.md`; HANDOFF warning still valid for readers of old audits. |

---

## 2. Routes, navigation, deployment

| Claim | Verdict | Notes |
|-------|---------|-------|
| Routes `/operations/sales-desk`, dossier, `/operations/call-activity` | **Holds** | FINDINGS inventory: `registry` «میز فروش», W2 routes, call-activity in orchestration scope. |
| Sidebar «میز فروش» → sales-desk (registry) | **Holds** | Consistent with F1/HANDOFF; FINDINGS Persian hits on registry. |
| Roles admin / manager / sales (README table) | **Missing in FINDINGS** | FINDINGS X4 discusses module permissions broadly, not this exact route×role matrix. |
| **LAN `:3100` 404** until web redeploy (T1, README) | **Superseded / partial** | FINDINGS §0: **`APP_GIT_SHA` = HEAD `f9c57d0e`** on `afrakala-lan-web` — implies **current LAN image includes sales-desk branch tip**. FINDINGS did **not** HTTP-probe `/operations/sales-desk` on `:3100`. T1 404 claim is **2026-09-16**; may be fixed at SHA level while UX/deploy gaps remain unprobed. |
| Owner ground truth (RESEARCH-PROMPT §1): popup + میز فروش on **3000 and 3100** | **Partial** | Aligns with deployed SHA; FINDINGS focuses on **broken call popup behavior** (N1), not route absence. |
| E2E **7 passed** on Vite `:8080` | **Missing in FINDINGS** | Not re-run in FINDINGS session; **not contradicted**. Person-picker workaround (T1) still a UX gap FINDINGS does not discuss. |

---

## 3. Nine needs — claim-by-claim

| # | Need (9-needs summary) | Verdict vs FINDINGS | Detail |
|---|------------------------|---------------------|--------|
| **1** | Caller ID popup + link to dossier + quick anonymous register | **Partial / contradicted on quality** | **Exists:** `CallerInboundPopup`, listener in AppShell (FINDINGS N1–N6). **Contradicted as “works”:** N1 **EXISTS-BROKEN** (multi-extension events, no `linkedid` dedupe, `MAX_CARDS=4`, multi-tab). N3 **PARTIAL** (settings exist; **5s TTL hardcoded**, no per-user duration). N6 **PARTIAL** (QuickRequestForm prefilled; no «افزودن معامله» label). |
| **2** | Quick request on desk (`kind=request`) | **Holds** | QuickRequestForm → `createSalesInteraction` / RPC (FINDINGS W2 integration map). |
| **3** | After Issabel import → `derive_staff_call_metrics`; monthly stats card | **Partial** | **Code holds:** `import-issabel-calls.server.ts` calls RPC (checkpoint B1; still in worktree). **Missing in FINDINGS:** no verdict on post-import metrics or desk “آمار ماه من” card wiring. **Not live-proven** in either doc for a full Issabel import on 2026-09-21. |
| **4** | Search/register person + assign `salesperson_id`; customer `responsible_id` | **Partial** | Person picker + optional «کارشناس فروش (اختیاری)» (N7 **PARTIAL**). FINDINGS N11 **NOT-CONNECTED** (no product search in request form). T1/HANDOFF: **`searchPersons` empty on Vite** — still a gap FINDINGS omits. |
| **5** | Call summary + history on dossier / timeline | **Partial** | Dossier route + `sales_interactions` / CallNoteForm path (N16 **PARTIAL**). Didar-grade activity model (N17–N21) largely **ABSENT**. No FINDINGS contradiction on basic note/timeline. |
| **6** | Outcome won/lost + “my month” stats | **Partial** | Outcome buttons **partial** (N13: only open/won in test data; lost-reason not wired — N14). RPC `sales_my_month_stats` from 546 **not explicitly assessed** in FINDINGS summary table but implied by migration inventory. |
| **7** | Follow-up tomorrow + alerts | **Partial** | `next_follow_up_at` + RPC set_follow_up (9-needs / D1). FINDINGS: no Didar-style activities page, badges, snooze (N18–N20 **ABSENT**). Assign notification covers **part** of “alert” (Need 9 overlap). |
| **8** | Customer 360 dossier | **Holds** | Route and W2 files present; FINDINGS lists dossier-related components. |
| **9** | `sales_interaction_assigned` + trigger on `salesperson_id` (547) | **Holds** | FINDINGS: migration 547 cited; **`notification_queue` type count = 1** for `sales_interaction_assigned`. MEDIUM spam risk **holds** in both. |

---

## 4. “Works without Issabel”

| Claim | Verdict | Notes |
|-------|---------|-------|
| Manual desk + `createSalesInteraction` (`source` default manual) | **Holds** | FINDINGS W2; popup idle without inbound data (F1/README). |
| Popup harmless when no Issabel data | **Partial** | True for idle state; when Issabel **is** connected, FINDINGS documents **serious popup defects** (N1, N4). |

---

## 5. Security / data (orchestration vs FINDINGS)

| Claim (S1 / D1 / HANDOFF) | Verdict | Notes |
|---------------------------|---------|-------|
| RLS + RPC create forces `author_id = actor` | **Holds** | FINDINGS N8, X2. |
| C6 steal before 548 / fixed after 548 | **Partial in FINDINGS** | Documented in 9-needs orchestration only; FINDINGS assumes 548 in migration set, no steal replay. |
| DELETE revoked on `sales_interactions` for authenticated (548) | **Missing in FINDINGS** | Stated in D1b; not quoted in FINDINGS. |
| Notify trigger SECURITY DEFINER → queue | **Holds** | FINDINGS N9, X1. |

---

## 6. What FINDINGS adds that 9-needs understate or omit

These are **not contradictions** but **scope gaps** in the 9-needs “delivery complete” narrative:

- **Call stack (W1):** duplicate popups (N1), form loss on next ring (N4), no per-call draft (N5), phone normalization / multi-format storage, polling not Realtime.
- **Deal/interaction parity (W2):** no `sales_quotes` ↔ interaction link (N15), no structured line items (N12), creator not shown in UI (N8), lost reason not on interactions (N14), «میز کار» phrase absent (N9 UX question in FINDINGS §10).
- **Parallel systems:** `tasks` vs `sales_interactions` (N16 consolidation).
- **Unrelated to 9-needs but in same FINDINGS mission:** tickets N22–N24, purchases N25–N27, pricing/Google N28–N31, gates G1–G4.

---

## 7. Contradictions summary

| Topic | 9-needs says | FINDINGS says |
|-------|--------------|---------------|
| Incoming call UX | Need 1 mapped as delivered feature | N1 **BROKEN**, N4 **BROKEN**, N3 **PARTIAL** |
| LAN availability | 404 on `:3100` without redeploy (2026-09-16) | Running web SHA **matches** feature branch HEAD (2026-09-21); HTTP not re-checked |
| Completeness vs Didar | 9 needs “implemented” on branch | Many interaction/activity targets **ABSENT** or **NOT-CONNECTED** (N10–N12, N17–N21, N15) |
| Optional salesperson | Documented as feature behavior | N7: label still «کارشناس فروش (اختیاری)»; target is mandatory «مسئول معامله» |

---

## 8. Recommended follow-ups (for mission W0+)

1. Reconcile **LAN HTTP 200** for sales-desk routes vs T1 404 (single probe on `:3100` with auth).
2. Confirm **migration ledger** 545–548 still on `afrakala` (FINDINGS used table counts, not ledger).
3. Add FINDINGS-stage verdict for **Need 3** (import → `derive_staff_call_metrics` → UI stats card).
4. Fix or restore **`AUDIT-20260916.md`** link in README.
5. Treat 9-needs as **implementation log**; treat FINDINGS as **current gap analysis** for build planning.

---

## 9. Files in `sales-desk-9-needs` not individually re-audited

Orchestration `_*.{sql,out,cjs}` and `*-down.sql` files are **evidence attachments** for checkpoints D1/D1b/S1/T1/B1. This audit relied on checkpoint narratives + FINDINGS live DB excerpts, not re-execution of probes.
