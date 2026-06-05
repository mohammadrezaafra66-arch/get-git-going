# Review Baseline Checklist

**Phase Label:** PHASE-0  
**Status:** Active  
**Owner:** محمدرضا افرا  
**Trigger:** Before any new development Task Packet or Phase-1 work

مرجع تصمیم اجرایی: [`EXECUTION_DECISION_FINAL.md`](./EXECUTION_DECISION_FINAL.md) — بند ۴

---

## Prerequisites

- [ ] On intended base branch (`main` or approved phase branch)
- [ ] `git fetch origin` completed
- [ ] Baseline tag / manifest identified (`docs/baseline/BASELINE_POINTER.md`)

---

## 1. Build

```bash
npm run build
```

| Result | Action |
|--------|--------|
| PASS | Continue |
| FAIL | **STOP** — fix or document blocker before new work |
| NOT RUN | Record reason (e.g. missing `node_modules`) — not acceptable for Phase 0 acceptance |

---

## 2. Typecheck

```bash
npm run typecheck
```

| Result | Action |
|--------|--------|
| PASS | Continue |
| Script missing | Report explicitly; use `tsc --noEmit` only if project convention allows |
| FAIL | **STOP** |

---

## 3. Lint

```bash
npm run lint
```

| Result | Action |
|--------|--------|
| PASS | Continue |
| FAIL | **STOP** or waive with documented owner approval |

---

## 4. Core documents review

| Document | Present | Current |
|----------|---------|---------|
| `docs/baseline/BASELINE_MANIFEST.md` | [ ] | |
| `docs/process/SOURCE_OF_TRUTH.md` | [ ] | |
| `docs/process/PHASE_LABEL_POLICY.md` | [ ] | |
| `docs/process/PHASE0_OPEN_QUESTIONS_G01_G08.md` | [ ] | |
| `docs/adr/ADR-0001` … `ADR-0008` | [ ] | |
| `docs/automation/EXECUTION_DECISION_FINAL.md` | [ ] | |
| `automation/openapi/automation-v1.yaml` (canonical) | [ ] | |
| `openapi/automation-v1.yaml` is deprecated stub only | [ ] | |

---

## 5. Migrations review

| Check | Pass |
|-------|------|
| List `supabase/migrations/` delta since baseline tag | [ ] |
| No unreviewed production migration for sensitive modules (pricing, persons, bot) | [ ] |
| Automation migrations (if any) match approved Task Packet | [ ] |
| RLS impact noted in migration header or companion doc | [ ] |
| Rollback note present per `docs/process/DOD.md` | [ ] |

---

## 6. Dependencies review

| Check | Pass |
|-------|------|
| `package.json` / lockfile changes reviewed since baseline | [ ] |
| No new critical CDN or non-self-hostable dependency | [ ] |
| No `VITE_` secrets or service role in frontend diff | [ ] |
| Aligns with `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md` | [ ] |

---

## Sign-off template

```markdown
## Review Baseline — YYYY-MM-DD

- Commit / tag: ___
- build: PASS / FAIL / NOT RUN
- typecheck: PASS / FAIL / NOT RUN
- lint: PASS / FAIL / NOT RUN
- docs: PASS / FAIL
- migrations: PASS / FAIL / N/A
- dependencies: PASS / FAIL
- Reviewer: ___
- Authorized to start Task Packet: ___ / NONE
```

---

## Stop rule

If any required section is **FAIL** without owner waiver, **do not start** the next Task Packet.
