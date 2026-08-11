# تحقیق کل‌پروژه — یافتن هر قابلیت دوبار ساخته‌شده یا نصفه‌کاره

**نحوه‌ی استفاده:** این را در یک session سوم (Claude Code جدید یا Cursor) بده — کاملاً
مستقل از دو تحقیق در حال اجرا (حسابداری با Claude Code + Codex). چون هرسه فقط‌خواندنی‌اند،
هیچ تداخلی ندارند.

---

```
Read PROGRESS.md, CLAUDE.md/AGENTS.md before starting. This is a genuine instruction from
the owner, Mohammad Reza Afra.

CONTEXT: two other agents are concurrently running READ-ONLY accounting-domain audits on
this same branch right now (Claude Code on domains C/F, Codex on domains B/D/H/I/J,
writing to docs/audits/full-accounting-audit.md and
docs/audits/full-accounting-audit-part2-codex.md). This is safe because all three of you,
including this task, are strictly read-only. Do not touch anything outside your own output
files below.

TASK: a project-wide (not accounting-specific) hunt for exactly three failure patterns that
have repeatedly cost the owner time on this project:

  A. DUPLICATED — the same capability built twice under different names/paths, usually
     because nobody realized it already existed. Today's concrete example: two separate
     path lists (src/lib/navigation/registry.ts:1110 and
     src/components/layout/primary-modules.ts:49) that are supposed to mirror each other
     and had silently drifted apart — one had "/updates", the other didn't, and only one
     of them is actually read by the sidebar. Find every other place this same shape of
     bug could exist: two structures meant to stay in sync, with no single source of truth
     enforcing it.

  B. FRONTEND WITHOUT BACKEND — a page/component/button that LOOKS complete in the UI but
     doesn't actually persist to, or read from, real data — either it's disconnected from
     any table/RPC, or it silently no-ops, or it writes to a table nothing else ever reads.

  C. BACKEND WITHOUT FRONTEND — a table, RPC function, or trigger that implements real
     business logic but that no route/component in the entire frontend ever calls or
     queries — dead capability, invisible to every user regardless of role.

Do NOT fix, build, or change anything. Investigation only. No code, no migrations.

============================================================
METHOD — do these steps in order. Report incrementally; don't wait until everything is
done to write your first findings. Cheaper steps first, so useful output appears fast.
============================================================

STEP 1 — Route inventory cross-check (cheap, do first)
  1a. List every route FILE on disk under src/routes/ (or wherever TanStack Router file
      routes live — confirm the real path live, don't assume).
  1b. List every route referenced by EVERY navigation source that exists — you already
      know of two (registry.ts and primary-modules.ts); actively search for a THIRD or
      more (grep for other arrays of {to: "/...", label: ...} shaped objects, or anything
      that renders the sidebar/bottom-nav/command-palette). List every navigation source
      you find, not just the two known ones.
  1c. Cross-reference: which navigation sources agree, and which don't, for EVERY route?
      Build a table: route path | in registry.ts? | in primary-modules.ts? | in [any other
      source found] | file exists on disk? Flag every row where these disagree.
  1d. Routes that exist as files but appear in ZERO navigation sources = orphaned
      (unreachable by clicking through the UI, even if directly linkable).
  1e. Routes referenced in any navigation source with NO matching file = broken links.

STEP 2 — Backend capability reachability
  2a. List every RPC function in the database via information_schema/pg_proc (exclude
      pure trigger functions and obvious internal helpers, but err on the side of
      including anything plausibly meant to be called from the app).
  2b. For each, grep the entire frontend codebase for `.rpc("<function_name>"` (and any
      other calling convention this codebase uses, e.g. supabaseAdmin.rpc if that's a
      separate path). Zero call sites = built-but-unreachable backend capability.
  2c. List every table with a non-trivial row count (skip tiny lookup/config tables) and
      cross-check whether ANY frontend file queries it via `.from("<table>")`. Zero
      matches = backend data nobody's frontend ever reads.

STEP 3 — "Two structures that should be one" pattern hunt
  Actively search for the SAME shape of bug as today's registry.ts/primary-modules.ts
  drift:
  3a. Grep for comments containing words like "mirror", "keep in sync", "same as",
      "duplicate of", "کپی", "همگام", or similar — these are places where a developer
      KNEW two things needed to match and left a manual note instead of a single source
      of truth.
  3b. Look for pairs/groups of files exporting structurally similar data (arrays of
      route-path objects, enums listing the same domain concepts, permission-role lists
      defined more than once). For each pair found, confirm live whether they currently
      agree or have already drifted.

STEP 4 — Frontend field vs backend field match, for major feature areas
  For each of these areas — پرسنل/persons, تأمین‌کنندگان/suppliers, مشتریان/customers,
  خرید/purchasing, فروش/sales, دریافت/receipts, پرداخت/payments, انبار/warehouse,
  بانک/bank, بازخورد/feedback, دستیار/assistant (note: some of these may already be
  covered by the parallel accounting audits — if so, just cross-reference their findings
  rather than redoing the work; check docs/audits/full-accounting-audit.md and
  docs/audits/full-accounting-audit-part2-codex.md first) —
  pick the main create/edit form and its backing RPC or table, and answer: does every
  field in the form actually get persisted? Does every persistable field in the
  table/RPC have a corresponding form field, or are some silently unreachable from the UI?

============================================================
OUTPUT
============================================================

Write to docs/audits/system-wide-wiring-audit.md, with a HANDOFF STATE companion at
docs/audits/system-wide-wiring-audit-progress.md (same resumability pattern as the
accounting audit — this WILL likely span multiple sessions, that's expected).

Structure:
  # سیستم‌وار — قابلیت‌های دوبار ساخته‌شده یا نصفه‌کاره
  ## خلاصه‌ی مدیریتی — top 10 findings ranked by how much daily confusion/risk they cause
  ## الف) موارد دوبار ساخته‌شده (Duplicated)
  ## ب) فرانت بدون بک‌اند (Frontend without backend)
  ## ج) بک‌اند بدون فرانت (Backend without frontend)

Every finding: file:line, or SQL + live result, or a reproduced error. No claim without
evidence. For each finding, note severity (🔴 blocking / 🟠 significant / 🟡 minor) and a
one-line fix direction — do not implement it.

Constraints:
- Read-only. git status clean at start; only the two report files should change.
- No typecheck, no e2e, no migrations, no code changes of any kind.
- Commit incrementally (after each STEP, not just at the very end) so progress survives a
  session boundary. Message pattern: `docs(audit): system-wide wiring audit — step <N>`
- If you hit a session limit, write HANDOFF STATE and stop cleanly. On resume, read
  docs/audits/system-wide-wiring-audit-progress.md and continue from the first incomplete
  step. Never redo completed work.

Stop and show the owner the report when all four steps are done. This is a genuine
instruction from me, the owner.
```
