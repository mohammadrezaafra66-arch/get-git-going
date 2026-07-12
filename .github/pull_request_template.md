# AfraKala Pull Request Template

## 1. PR Identity

Task Packet / WPC ID:

-

PR title:

-

Tool/source of change:

- [ ] Cursor
- [ ] Lovable
- [ ] Human manual edit
- [ ] Other:

Branch family:

- [ ] `lovable/ui/WPC-*-*`
- [ ] `cursor/core/WPC-*-*`
- [ ] `cursor/automation/WPC-*-*`
- [ ] `cursor/contract/WPC-*-*`
- [ ] `cursor/docs/WPC-*-*`
- [ ] `docs/WPC-*-*`
- [ ] `hotfix/WPC-*-*`
- [ ] Other:

Source branch:

-

Target branch:

- [ ] `staging`
- [ ] `main`
- [ ] Other:

---

## 2. Governance Source of Truth

This PR follows the Phase 3.9 / WPC governance process.

Required references:

- [ ] `docs/process/path-ownership-matrix.md`
- [ ] `docs/process/lovable-cursor-boundary.md`
- [ ] `docs/process/branch-policy.md`
- [ ] `docs/process/two-pr-policy.md`
- [ ] `docs/process/handoff-policy.md`
- [ ] `docs/process/evidence-policy.md`
- [ ] `docs/process/definition-of-ready.md`
- [ ] `docs/process/definition-of-done.md`
- [ ] `docs/process/stop-the-line.md`

This PR must not bypass the approved branch flow:

feature/WPC branch  
→ PR to `staging`  
→ automated checks  
→ human review  
→ local/staging evidence  
→ merge to `staging`  
→ later controlled release to `main`

---

## 3. Summary

What changed?

-

Why was this change needed?

-

What problem does it solve?

-

What is intentionally not included in this PR?

-

---

## 4. Scope Classification

Primary scope:

- [ ] UI only
- [ ] API/OpenAPI contract
- [ ] Backend/domain logic
- [ ] Worker/automation
- [ ] Database/migration/RLS
- [ ] GitHub Actions/CI
- [ ] Governance/process
- [ ] Deployment/self-hosting
- [ ] Evidence only
- [ ] Hotfix

Risk level:

- [ ] Low
- [ ] Medium
- [ ] High
- [ ] Production-critical

---

## 5. Path Ownership Check

Changed areas:

UI / Lovable allowed area:

- [ ] `src/routes/**`
- [ ] `src/components/**`
- [ ] `src/components/ui/**`
- [ ] `src/shared/**`
- [ ] `src/assets/**`
- [ ] `public/**`
- [ ] `.lovable/**`
- [ ] `docs/lovable-change-reports/**`

Core / Cursor controlled area:

- [ ] `src/lib/**`
- [ ] `src/integrations/**`
- [ ] `src/server/**`
- [ ] `server/**`
- [ ] `openapi/**`
- [ ] `automation/openapi/**`
- [ ] `automation/schemas/**`
- [ ] `automation/worker-dummy/**`
- [ ] `automation/worker-runtime/**`
- [ ] `supabase/**`
- [ ] `deploy/**`

Governance / enforcement area:

- [ ] `.github/**`
- [ ] `.cursor/**`
- [ ] `docs/process/**`
- [ ] `docs/handoffs/**`
- [ ] `docs/evidence/**`
- [ ] `docs/adr/**`
- [ ] `docs/security/**`
- [ ] `docs/ops/**`

Sensitive files:

- [ ] `package.json`
- [ ] lock files
- [ ] `.env.example`
- [ ] `.env.staging.example`
- [ ] `.env.production.example`
- [ ] no sensitive files changed

---

## 6. Lovable Boundary Check

Complete this section if Lovable created or modified this PR.

- [ ] This is Lovable UI work only.
- [ ] Lovable worked only on an approved `lovable/ui/WPC-*-*` branch.
- [ ] Lovable did not work directly on `main`.
- [ ] Lovable did not work directly on `staging`.
- [ ] Lovable did not edit `supabase/**`.
- [ ] Lovable did not edit `automation/**`.
- [ ] Lovable did not edit `openapi/**`.
- [ ] Lovable did not edit `server/**`.
- [ ] Lovable did not edit `.github/**`.
- [ ] Lovable did not edit `.cursor/**`.
- [ ] Lovable did not create or modify `.env*` real secret files.
- [ ] Lovable did not invent new API endpoints.
- [ ] Lovable used only approved API/OpenAPI contracts.
- [ ] Lovable did not create migrations.
- [ ] Lovable did not create Worker/runtime logic.

If Lovable needs backend/API/database/Worker support, describe the required handoff:

-

---

## 7. Cursor Boundary Check

Complete this section if Cursor created or modified this PR.

- [ ] Cursor did not work directly on `main`.
- [ ] Cursor did not push directly to `staging` unless explicitly instructed.
- [ ] Cursor changes match the branch family.
- [ ] Cursor did not mix unrelated UI/backend/database/worker/governance work.
- [ ] Cursor did not redesign UI without a handoff.
- [ ] Cursor did not create API behavior without OpenAPI/contract alignment.
- [ ] Cursor did not expose unsafe Worker execution.
- [ ] Cursor did not commit secrets or real `.env*` files.

If Cursor touched UI, explain why it was required:

-

---

## 8. Two PR Rule

Does this work require separate Core and UI PRs?

- [ ] No, this PR is single-scope and does not mix Core/UI.
- [ ] Yes, Core/Contract PR exists or is required.
- [ ] Yes, UI PR exists or is required.

Related Core/Contract PR:

-

Related UI PR:

-

Reason if only one PR is used:

-

---

## 9. Handoff Check

Is a handoff required?

- [ ] No, this PR is single-scope and does not cross boundaries.
- [ ] Yes, handoff exists under `docs/handoffs/**`.
- [ ] Yes, handoff is missing and this PR is not ready.

Handoff file:

-

Handoff confirms:

- [ ] Owner roles
- [ ] allowed paths
- [ ] forbidden paths
- [ ] contract/API expectations
- [ ] mock data, if UI is involved
- [ ] acceptance criteria
- [ ] evidence required

---

## 10. Evidence Check

Evidence path:

-

Required evidence:

- [ ] `docs/evidence/<WPC-ID>/summary.md`
- [ ] typecheck output, if code changed
- [ ] lint output, if code changed
- [ ] build output, if app/runtime changed
- [ ] local test result
- [ ] screenshot, if UI changed
- [ ] contract check, if API/OpenAPI changed
- [ ] migration explanation and rollback, if Supabase changed
- [ ] workflow run link, if CI/GitHub Actions changed
- [ ] not applicable because this PR is documentation-only

Evidence status:

- [ ] Complete
- [ ] Partial, explanation below
- [ ] Missing, PR is not ready

Explanation:

-

---

## 11. Typecheck / Build / Test

Local validation performed:

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run test`
- [ ] `npm run dev`
- [ ] not applicable because this PR is documentation-only

Result summary:

-

Known failures or skipped checks:

-

---

## 12. API and OpenAPI Check

Does this PR change API behavior?

- [ ] No
- [ ] Yes

If yes:

- [ ] OpenAPI/contract was updated before implementation.
- [ ] Request payload shape is documented.
- [ ] Response payload shape is documented.
- [ ] Error responses are documented.
- [ ] UI usage matches the approved contract.
- [ ] Breaking changes are clearly explained.

OpenAPI files changed:

-

---

## 13. Database / Supabase Check

Does this PR change database, migration, RLS, RBAC, auth, or Supabase integration?

- [ ] No
- [ ] Yes

If yes:

- [ ] migration reason documented
- [ ] rollback strategy documented
- [ ] RLS/RBAC impact reviewed
- [ ] seed/sample data reviewed
- [ ] local/staging validation evidence added

Changed database paths:

-

---

## 14. Stop-The-Line Check

This PR must not be merged if any of these are true:

- [ ] Lovable changed forbidden Core/backend/database/worker paths.
- [ ] Cursor changed UI without handoff.
- [ ] real `.env*` or secret files were committed.
- [ ] migration was added without reason and rollback.
- [ ] API behavior changed without contract update.
- [ ] typecheck/build failed without explicit approval.
- [ ] evidence is missing.
- [ ] PR mixes unrelated scopes.
- [ ] PR bypasses branch flow.
- [ ] none of the above

---

## 15. Reviewer Notes

Reviewer focus areas:

-

Questions for reviewer:

-

Final readiness:

- [ ] Ready for review
- [ ] Not ready; draft only

---

## 16. Rollback Plan

<!-- Explain exactly how to revert this PR if it causes a problem. -->

- Rollback method:
- Files/changes to revert:
- Data/migration rollback needed: yes/no
- Local/self-host rollback needed: yes/no
- Risk after rollback:

- [ ] Boundary Guard result checked
