# AfraKala Phase 6 - Staging Human Test Checklist

Status: Active Governance Rule
Phase: 6
Scope: Human testing checklist before merging staging into main
Source of truth: GitHub repository

---

## 1. Purpose

This checklist defines the required human test process for the AfraKala staging environment.

No change should move from `staging` to `main` unless staging has been tested.

The goal is to prevent:

- broken UI reaching production
- staging using production database
- real company data being entered into staging
- Lovable UI changes breaking backend/API behavior
- Cursor backend/API/Worker changes breaking UI behavior
- unreviewed database or Worker behavior reaching production

---

## 2. Required Staging Identity Check

Before testing, confirm:

- [ ] Current branch is `staging`.
- [ ] The app URL is a staging/test URL.
- [ ] The app is not the production URL.
- [ ] The app shows a staging/test warning banner.
- [ ] The environment is not production.
- [ ] The database target is staging/test database.
- [ ] Production database credentials are not used.
- [ ] The test machine is not the production server laptop.

Expected warning text:

`TEST ENVIRONMENT - DATA IS NOT REAL`

Persian equivalent:

`⚠️ محیط تست افراکالا - اطلاعات این بخش واقعی نیست`

---

## 3. Login and Access Test

Confirm:

- [ ] Login page opens.
- [ ] Login works with a staging-safe test user.
- [ ] Logout works.
- [ ] Unauthorized pages do not expose protected data.
- [ ] Admin-only pages remain protected.
- [ ] Role-based access still behaves correctly.
- [ ] No real production staff account is required for testing.

---

## 4. UI Smoke Test

Confirm:

- [ ] Main app shell opens.
- [ ] Sidebar/menu opens.
- [ ] Mobile layout is not obviously broken.
- [ ] RTL layout is correct.
- [ ] Persian text is readable.
- [ ] Main dashboard opens.
- [ ] Key pages render without blank screen.
- [ ] Loading states do not get stuck.
- [ ] Empty states are understandable.
- [ ] Error states are user-friendly.

---

## 5. API Contract Test

Confirm:

- [ ] UI calls approved API endpoints only.
- [ ] API behavior matches the OpenAPI contract where applicable.
- [ ] No guessed endpoint is used.
- [ ] No hidden backend behavior is introduced by UI work.
- [ ] API errors are handled gracefully.
- [ ] Browser console has no critical API errors.
- [ ] Network errors do not break the whole app shell.

Relevant contract files:

- `openapi/openapi.yaml`
- `automation/openapi/automation-v1.yaml`
- `docs/governance/API_CONTRACT_RULES.md`

---

## 6. Product and Pricing Smoke Test

Confirm, using fake or staging-safe data only:

- [ ] Product list/search page opens.
- [ ] Product detail page opens if applicable.
- [ ] Pricing-related pages open.
- [ ] Price calculation UI does not crash.
- [ ] Sales list pages open.
- [ ] Public sales list page opens if applicable.
- [ ] No real production price list is accidentally modified.
- [ ] No real customer-facing output is sent.

---

## 7. Database Safety Test

Confirm:

- [ ] Database target is staging/test.
- [ ] No production database URL is used.
- [ ] No real customer data is entered.
- [ ] No real order/sale/invoice is created.
- [ ] No production data is imported into staging unless anonymized and approved.
- [ ] Any migration was reviewed before testing.
- [ ] RLS/security implications were reviewed if database policy changed.

---

## 8. Worker and Automation Safety Test

Confirm:

- [ ] Worker behavior is mock, read-only, or explicitly approved.
- [ ] No real bot execution is triggered.
- [ ] No real WhatsApp message is sent.
- [ ] No real customer message is sent.
- [ ] No production scraping is triggered.
- [ ] No production credential is used.
- [ ] Worker status UI does not expose unsafe execution controls.
- [ ] Worker output display uses approved API contracts.

---

## 9. Lovable Change Check

If Lovable was involved, confirm:

- [ ] Change is UI-only.
- [ ] Lovable worked on `lovable/ui-staging`.
- [ ] Lovable did not work directly on `main`.
- [ ] Lovable did not edit backend logic.
- [ ] Lovable did not edit Worker runtime.
- [ ] Lovable did not create migrations.
- [ ] Lovable did not change GitHub Actions.
- [ ] Lovable did not invent API endpoints.
- [ ] Lovable did not commit secrets or real `.env` files.

---

## 10. Cursor Change Check

If Cursor was involved, confirm:

- [ ] Cursor worked on the correct branch family.
- [ ] Cursor did not work directly on `main`.
- [ ] Cursor did not push directly to `staging` unless explicitly instructed.
- [ ] Cursor did not mix unrelated scopes.
- [ ] API behavior changes updated OpenAPI.
- [ ] Database changes included migrations/review.
- [ ] Worker changes included safety notes.
- [ ] UI changes by Cursor were justified.

---

## 11. Browser and Console Check

Confirm:

- [ ] Browser console has no critical errors.
- [ ] No auth loop occurs.
- [ ] No infinite loading occurs.
- [ ] No blank app shell occurs.
- [ ] No repeated failed network calls occur.
- [ ] No sensitive data is logged to console.
- [ ] No secret or token is visible in client logs.

---

## 12. Final Staging Decision

Final decision:

- [ ] PASS - safe to continue toward release review.
- [ ] FAIL - must fix before merge/release.
- [ ] BLOCKED - missing environment/API/data/review requirement.

Tester:

-

Date:

-

Staging URL:

-

Test notes:

-

Required follow-ups:

-
