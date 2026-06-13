# AfraKala Phase 6 - API Contract Rules

Status: Active Governance Rule
Phase: 6
Scope: API contract ownership between Lovable, Cursor, backend, Worker, and UI
Source of truth: GitHub repository

---

## 1. Purpose

This document defines the official API contract rules for the AfraKala platform.

The purpose is to prevent:

- Lovable inventing API endpoints
- Cursor implementing backend endpoints without a contract
- UI and backend drifting apart
- Worker outputs being exposed without review
- database-changing APIs being created without migration review
- undocumented request and response shapes
- production behavior changing without review

The API contract is the shared language between UI, backend, Worker, and automation.

---

## 2. Source of Truth

GitHub is the source of truth for API contracts.

Approved API contract locations:

- `openapi/openapi.yaml`
- `automation/openapi/automation-v1.yaml`

If another OpenAPI file is added later, it must be documented here first.

Google Drive may mirror or explain API documents, but it is not the source of truth.

Lovable must not be treated as the source of truth for APIs.

Cursor must not silently create APIs outside the approved contract.

---

## 3. Required Order of Work

The required order is:

1. Define or update OpenAPI first.
2. Review the API contract.
3. Implement backend/API behavior in the correct Cursor branch.
4. Connect UI to the approved API.
5. Test on staging.
6. Release through the approved branch flow.

Forbidden order:

1. Build UI first.
2. Guess endpoint names.
3. Guess request payloads.
4. Guess response shapes.
5. Ask backend to match the guessed UI later.

That forbidden order creates hidden drift and must not be used.

---

## 4. Lovable API Rules

Lovable must:

- consume only approved API endpoints
- use only documented request shapes
- use only documented response shapes
- report missing API requirements instead of implementing them
- stop if a backend/API/database/Worker change is needed

Lovable must not:

- invent endpoint URLs
- invent request payloads
- invent response payloads
- create backend logic
- create database migrations
- change OpenAPI files
- change Worker logic
- change authentication/security behavior
- bypass OpenAPI by hardcoding assumptions

If Lovable needs an API that does not exist, it must report:

- page/component
- user action
- required endpoint
- required request data
- required response data
- why the UI cannot continue without backend/API support
- suggested owner: Cursor API branch

---

## 5. Cursor API Rules

Cursor may define and implement APIs only in the correct branch family.

Recommended branches:

- `cursor/api-*` for API and OpenAPI work
- `cursor/worker-*` for Worker-related API planning
- `cursor/db-*` for database-backed API changes
- `cursor/phase6-*` only for governance and contract skeleton work in this phase

Cursor must:

- update OpenAPI before changing API behavior
- document request and response payloads
- document error responses
- keep API changes small and reviewable
- avoid mixing unrelated UI/backend/database/Worker changes
- avoid production database usage in tests
- include staging test notes before release

Cursor must not:

- create endpoints outside OpenAPI
- silently change response shapes
- expose unsafe Worker execution
- create database-changing APIs without migration/RLS review
- commit secrets or real environment files

---

## 6. OpenAPI File Ownership

Primary platform API contract:

- `openapi/openapi.yaml`

Automation and Worker API contract:

- `automation/openapi/automation-v1.yaml`

Rules:

- UI-facing APIs should be represented in `openapi/openapi.yaml`.
- Worker/automation contracts should be represented in `automation/openapi/automation-v1.yaml`.
- If an endpoint belongs to both UI and Worker, the boundary must be documented.
- A PR that changes API behavior must update the relevant OpenAPI file.

---

## 7. API Change Classification

Every API PR must classify the change.

Types:

- new endpoint
- changed request payload
- changed response payload
- changed error response
- authentication change
- authorization/RBAC change
- database-backed behavior change
- Worker/automation behavior change
- deprecated endpoint
- removed endpoint

Any breaking change must be explicitly documented in the Pull Request.

---

## 8. Required OpenAPI Coverage

Each endpoint should document:

- path
- method
- summary
- operationId
- tags
- request body if applicable
- query parameters if applicable
- path parameters if applicable
- successful response
- error responses
- schema references
- authentication expectations if applicable

Minimum error responses:

- `400` invalid request
- `401` unauthenticated
- `403` forbidden
- `404` not found where applicable
- `409` conflict where applicable
- `500` server error

---

## 9. Database-Backed API Rule

If an API reads or writes database data:

- database tables must be known
- migration impact must be reviewed
- RLS/security implications must be reviewed
- staging database must be used for testing
- production database must not be used for development testing

Lovable must not create database-backed APIs.

Cursor must route database-backed API work through the correct branch and review process.

---

## 10. Worker API Rule

If an API interacts with Worker, jobs, drivers, bot execution, checkpoints, or outputs:

- Worker safety boundary must be documented
- real bot execution must not be enabled without explicit approval
- production scraping must not be enabled without explicit approval
- production messaging must not be enabled without explicit approval
- job status and output schemas must be documented
- unsafe UI trigger paths must be blocked

Lovable may display Worker status only if the approved API contract exists.

---

## 11. Staging Requirement

Before API changes are released to production:

- OpenAPI must be updated
- implementation must match OpenAPI
- staging must be tested
- UI must use the documented contract
- production risk must be reviewed
- rollback notes must exist for risky changes

---

## 12. Final Rule

If an API is not documented, it is not approved.

If Lovable needs an undocumented API, Lovable must stop and report the missing contract.

If Cursor needs a new API, Cursor must update OpenAPI first.

No API should enter production through guesswork.
