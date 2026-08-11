# AfraKala 49 Fixes — Group 3 Task Packets

Title: از 12.4 به 12.6 — علی طالبی‌زاده — انجام گروه ۳ بسته ۴۹ اصلاحاتی — 24 خرداد 1405

Status: Draft for Review
Group: 3
Group Title: هسته فروش، اعتبار، پیش‌فاکتور و گردش‌کار
Owner: Ali Talebizadeh
Reviewer: Mohammadreza
Source of Truth: GitHub
Target Branch: staging

---

## 1. Scope Lock

This file defines Task Packets for Group 3 only.

Allowed backlog items:

- 4
- 11
- 12
- 13
- 14
- 22
- 42
- 43

Group 3 covers:

- customer credit domain
- trusted customer visibility
- settlement speed
- overdue / lock behavior
- credit rules and weighting
- preinvoice as workflow start point
- seller / shipping / accounting task queues
- handoff from preinvoice to sending, waybill, receipt, and salesperson follow-up

Out of scope:

- Group 1 governance redesign
- Group 2 bug fixing
- Group 4 catalog/pricing/PDF/output work
- Group 5 personnel/gamification
- Group 6 integrations/bots/AI growth tools
- Group 7 accounting OCR/financial document extraction
- Laravel or any parallel backend
- parallel database, ORM, schema, or API
- migration without explicit approval
- UI implementation before approved Cursor handoff

---

## 2. Group 2 Conflict Rule

Group 2 is running in parallel by Mahdi Heydari.

Group 2 owns these conflict zones:

- customer/person creation
- customer relation
- preinvoice submit flow
- preinvoice customer relation
- dynamic permissions
- pricing fallback
- product/search/label

If a Group 3 task reaches one of these areas:

1. Stop.
2. Report the exact file/path and risk.
3. Do not fix the Group 2 issue.
4. Ask for explicit coordination/approval.
5. Continue only after approved Task Packet update.

---

## 3. Inventory Signals From Group 3 Step 3.1

Observed existing areas:

- sales customer routes exist
- sales credit customer routes exist
- credit rules route exists
- quote routes exist
- invoice routes exist
- send queue route exists
- accounting receipt routes exist
- waybill routes exist
- roles/RBAC libs exist
- workflow stages admin route exists
- customer_credit_profile, customer_credit_balance, customer_credit_ledger exist
- get_customer_credit RPC exists
- overdue-related RPC/signals exist
- invoices has customer_id
- sales_quotes still has customer_name/customer_phone text fields according to inventory docs
- waybills still has sender/receiver text fields according to inventory docs

Important risk:

Group 3 may describe workflow contracts around these areas, but must not repair Group 2 customer/person/preinvoice bugs inside this packet set.

---

# Task Packet AFK-G3-004

task_id: AFK-G3-004
title: Trusted Customer Visibility Contract
group: 3
backlog_item: 4
phase_label: 49_FIXES_GROUP_3
task_type: engineering_only
owner: Ali Talebizadeh
reviewer: Mohammadreza

business_goal:
  - Show whether a customer is trusted/credit-worthy in sales workflows without guessing from UI-only data.

current_problem:
  - The system has customer and credit-related tables, but the exact trusted customer indicator contract is not locked for Group 3 workflow use.

desired_outcome:
  - A reviewed contract/model describing how trusted customer status is read, calculated, displayed, and audited.

in_scope:
  - Inventory existing credit/customer indicators.
  - Define trusted customer output fields.
  - Define read-only contract for future UI.
  - Define evidence needed for trusted/untrusted examples.
  - Define Group 2 conflict boundaries.

out_of_scope:
  - Creating or editing customers.
  - Fixing customer/person creation.
  - Changing sales_quotes customer relation.
  - Creating migration.
  - Implementing UI.
  - Changing RBAC/RLS.

allowed_paths:
  - docs/process/**
  - docs/evidence/**
  - contracts/**
  - src/lib/sales/**
  - src/lib/customers/**
  - src/integrations/supabase/types.ts

forbidden_paths:
  - supabase/migrations/**
  - src/routes/**
  - src/components/**
  - .github/**
  - deploy/**
  - automation/**
  - any Laravel path
  - any parallel backend/database/API path

data_impact: read_only
api_contract_impact: uses_existing_contract
ui_impact: none
migration_impact: forbidden

dependencies:
  - docs/process/TASK_PACKET_TEMPLATE_49_FIXES.md
  - docs/process/GROUP1_CLOSURE_REPORT_49_FIXES.md
  - docs/process/GROUP2_REPRO_MATRIX_49_FIXES.md
  - docs/PERSONS_INVENTORY.md
  - docs/REPO_STATE_INVENTORY.md

acceptance_criteria:
  - Trusted customer data source is identified.
  - Trusted customer output fields are listed.
  - Unknowns are explicitly marked.
  - Group 2 conflicts are documented.
  - No code or migration is changed in planning phase.

test_evidence:
  - grep/file inventory evidence
  - example read contract
  - current behavior summary
  - no-diff status evidence

risk_level: high

rollback_plan:
  - Revert the documentation/contract-only change.
  - No database rollback required if no migration is made.

stop_conditions:
  - Customer creation/change is needed.
  - sales_quotes customer relation must be changed.
  - migration is required.
  - RLS/RBAC change is required.
  - UI implementation is requested before contract approval.

related_docs:
  - docs/PERSONS_INVENTORY.md
  - docs/REPO_STATE_INVENTORY.md

pr_target: staging
branch_name: docs/AFK-G3-001-task-packets

group2_conflict_check:
  - customer/person creation: stop
  - customer relation: stop
  - preinvoice submit flow: stop
  - dynamic permissions: report only

---

# Task Packet AFK-G3-011

task_id: AFK-G3-011
title: Customer Settlement Speed Contract
group: 3
backlog_item: 11
phase_label: 49_FIXES_GROUP_3
task_type: engineering_only
owner: Ali Talebizadeh
reviewer: Mohammadreza

business_goal:
  - Make settlement speed visible and usable in credit decisions.

current_problem:
  - Settlement behavior exists indirectly through invoices, receipts, receivables/payables, and credit data, but the Group 3 settlement speed definition is not locked.

desired_outcome:
  - A deterministic settlement speed model and contract, without implementation until approved.

in_scope:
  - Identify current fields/RPCs that can support settlement speed.
  - Define settlement speed factors.
  - Define calculation examples.
  - Define unknowns and required business confirmations.

out_of_scope:
  - Changing accounting receipt logic.
  - Changing payment receipt OCR.
  - Fixing customer creation.
  - Creating new migration.
  - UI work.

allowed_paths:
  - docs/process/**
  - docs/evidence/**
  - contracts/**
  - src/lib/sales/**
  - src/lib/customers/**
  - src/lib/accounting/**
  - src/integrations/supabase/types.ts

forbidden_paths:
  - supabase/migrations/**
  - src/routes/**
  - src/components/**
  - deploy/**
  - automation/**
  - any Laravel path
  - any parallel backend/database/API path

data_impact: read_only
api_contract_impact: uses_existing_contract
ui_impact: none
migration_impact: forbidden

dependencies:
  - AFK-G3-004
  - existing invoices/receipts/credit inventory

acceptance_criteria:
  - Settlement speed definition is documented.
  - Required input fields are listed.
  - Output bands/score examples are proposed.
  - No Group 2 bugs are fixed.
  - No schema change is made.

test_evidence:
  - file inventory
  - sample calculation table
  - no-diff status evidence

risk_level: high

rollback_plan:
  - Revert documentation/contract update only.

stop_conditions:
  - Need to alter payment_receipts/invoices schema.
  - Need to change customer/person relation.
  - Need to change receipt OCR or accounting workflow.
  - Need to change dynamic permissions.

related_docs:
  - docs/PERSONS_INVENTORY.md
  - docs/REPO_STATE_INVENTORY.md
  - docs/MIGRATION_SAFETY_POLICY.md

pr_target: staging
branch_name: docs/AFK-G3-001-task-packets

group2_conflict_check:
  - customer relation: stop
  - customer direct write path: report only
  - preinvoice submit flow: stop

---

# Task Packet AFK-G3-012

task_id: AFK-G3-012
title: Overdue State and Credit Lock Contract
group: 3
backlog_item: 12
phase_label: 49_FIXES_GROUP_3
task_type: engineering_only
owner: Ali Talebizadeh
reviewer: Mohammadreza

business_goal:
  - Prevent unsafe sales/credit actions when a customer has overdue obligations.

current_problem:
  - Overdue signals exist in accounting and invoice-related code, but the exact lock behavior for Group 3 is not fully defined.

desired_outcome:
  - A reviewed overdue/lock state model with enforce/read/display boundaries.

in_scope:
  - Inventory existing overdue fields and RPCs.
  - Define overdue state outputs.
  - Define lock trigger conditions.
  - Define audit/evidence requirements.
  - Define whether lock is read-only, warning-only, or hard-block in future implementation.

out_of_scope:
  - Implementing hard lock.
  - Changing invoice submit bug.
  - Changing customer/person logic.
  - Migration.
  - UI.

allowed_paths:
  - docs/process/**
  - docs/evidence/**
  - contracts/**
  - src/lib/sales/**
  - src/lib/accounting/**
  - src/integrations/supabase/types.ts

forbidden_paths:
  - supabase/migrations/**
  - src/routes/**
  - src/components/**
  - src/shared/components/InvoiceForm.tsx
  - src/shared/components/PaymentReceiptForm.tsx
  - deploy/**
  - automation/**

data_impact: read_only
api_contract_impact: uses_existing_contract
ui_impact: none
migration_impact: forbidden

dependencies:
  - AFK-G3-004
  - AFK-G3-011

acceptance_criteria:
  - Overdue sources are identified.
  - Lock levels are defined.
  - Enforcement layer recommendation is documented.
  - Stop conditions for invoice/preinvoice conflicts are documented.

test_evidence:
  - current file/RPC evidence
  - lock state examples
  - no-diff status evidence

risk_level: high

rollback_plan:
  - Revert documentation/contract update only.

stop_conditions:
  - InvoiceForm change is needed.
  - payment receipt change is needed.
  - migration is needed.
  - customer/person relation needs fix.

related_docs:
  - docs/REPO_STATE_INVENTORY.md
  - docs/MIGRATION_SAFETY_POLICY.md

pr_target: staging
branch_name: docs/AFK-G3-001-task-packets

group2_conflict_check:
  - preinvoice submit flow: stop
  - customer relation: stop
  - dynamic permissions: report only

---

# Task Packet AFK-G3-013

task_id: AFK-G3-013
title: Preinvoice Workflow Start Contract
group: 3
backlog_item: 13
phase_label: 49_FIXES_GROUP_3
task_type: engineering_only
owner: Ali Talebizadeh
reviewer: Mohammadreza

business_goal:
  - Treat preinvoice/quote as the start of a controlled sales workflow, not just a document.

current_problem:
  - Quote/preinvoice routes and send queue exist, but the workflow state model is not locked for Group 3.

desired_outcome:
  - A preinvoice workflow state contract that defines events, states, ownership, handoff points, and evidence.

in_scope:
  - Inventory quote/preinvoice routes/libs.
  - Define workflow states.
  - Define transition events.
  - Define seller/accounting/shipping handoff points.
  - Define conflict boundaries with Group 2.

out_of_scope:
  - Fixing preinvoice submit bug.
  - Changing sales_quotes customer relation.
  - Creating migration.
  - Building UI.
  - Changing send queue implementation.

allowed_paths:
  - docs/process/**
  - docs/evidence/**
  - contracts/**
  - src/lib/sales/**
  - src/integrations/supabase/types.ts

forbidden_paths:
  - supabase/migrations/**
  - src/routes/_app.sales.quotes*
  - src/routes/_app.sales_.invoices*
  - src/components/**
  - src/shared/components/InvoiceForm.tsx
  - deploy/**
  - automation/**

data_impact: read_only
api_contract_impact: new_contract_required
ui_impact: none
migration_impact: forbidden

dependencies:
  - Group 3 Step 3.1 inventory
  - Group 2 preinvoice conflict status

acceptance_criteria:
  - Preinvoice workflow states are documented.
  - State transition examples are included.
  - Group 2 conflicts are marked.
  - No implementation is done.

test_evidence:
  - route/lib inventory
  - state transition table
  - no-diff status evidence

risk_level: high

rollback_plan:
  - Revert documentation/contract update only.

stop_conditions:
  - Need to fix quote submit.
  - Need to add customer_id/customer_person_id to sales_quotes.
  - Need to alter sales quote migration.
  - Need to change UI route behavior.

related_docs:
  - docs/PERSONS_INVENTORY.md
  - docs/REPO_STATE_INVENTORY.md
  - docs/process/GROUP2_REPRO_MATRIX_49_FIXES.md

pr_target: staging
branch_name: docs/AFK-G3-001-task-packets

group2_conflict_check:
  - preinvoice submit flow: stop
  - preinvoice customer relation: stop
  - customer/person creation: stop

---

# Task Packet AFK-G3-014

task_id: AFK-G3-014
title: Sales / Shipping / Accounting Task Queue Contract
group: 3
backlog_item: 14
phase_label: 49_FIXES_GROUP_3
task_type: engineering_only
owner: Ali Talebizadeh
reviewer: Mohammadreza

business_goal:
  - Convert sales workflow outputs into clear task queues for seller, shipping, and accounting.

current_problem:
  - Operations task route, sales send queue, and workflow stages exist, but the relationship between preinvoice and operational queues is not locked.

desired_outcome:
  - A contract for task creation/read/status around seller, send/shipping, and accounting handoff.

in_scope:
  - Inventory task/queue/workflow stage routes.
  - Define task types.
  - Define owners and states.
  - Define handoff events from preinvoice.
  - Define evidence requirements.

out_of_scope:
  - Implementing queue.
  - Changing task queue logic.
  - Changing UI.
  - Changing dynamic permissions.
  - Migration without approval.

allowed_paths:
  - docs/process/**
  - docs/evidence/**
  - contracts/**
  - src/lib/sales/**
  - src/lib/operations/**
  - src/integrations/supabase/types.ts

forbidden_paths:
  - supabase/migrations/**
  - src/routes/**
  - src/components/**
  - src/lib/rbac/**
  - .github/**
  - deploy/**
  - automation/**

data_impact: read_only
api_contract_impact: new_contract_required
ui_impact: none
migration_impact: forbidden

dependencies:
  - AFK-G3-013
  - existing operations/tasks inventory

acceptance_criteria:
  - Queue domains are identified.
  - Task states are documented.
  - Handoff from preinvoice is specified.
  - RBAC needs are documented without implementing dynamic permissions.

test_evidence:
  - current file inventory
  - task state examples
  - no-diff status evidence

risk_level: medium

rollback_plan:
  - Revert documentation/contract update only.

stop_conditions:
  - Dynamic permissions change is needed.
  - New DB table/migration is needed.
  - UI implementation is requested before contract approval.

related_docs:
  - docs/REPO_STATE_INVENTORY.md
  - docs/process/GROUP2_REPRO_MATRIX_49_FIXES.md

pr_target: staging
branch_name: docs/AFK-G3-001-task-packets

group2_conflict_check:
  - dynamic permissions: report only
  - preinvoice submit flow: stop

---

# Task Packet AFK-G3-022

task_id: AFK-G3-022
title: Preinvoice Follow-up and Document Handoff Contract
group: 3
backlog_item: 22
phase_label: 49_FIXES_GROUP_3
task_type: engineering_only
owner: Ali Talebizadeh
reviewer: Mohammadreza

business_goal:
  - Connect preinvoice workflow to next actions such as sending, waybill, receipt, and salesperson follow-up.

current_problem:
  - Receipt, waybill, send queue, and quote routes exist, but the end-to-end handoff from preinvoice is not formally modeled.

desired_outcome:
  - A handoff contract from preinvoice to seller/shipping/accounting follow-up states.

in_scope:
  - Define follow-up states.
  - Define receipt/waybill references as workflow handoff points.
  - Define seller follow-up states.
  - Define accounting confirmation boundary.
  - Define what Group 7 owns and what Group 3 owns.

out_of_scope:
  - OCR implementation.
  - Accounting receipt extraction.
  - Waybill person linkage.
  - Fixing customer/person bugs.
  - Migration.
  - UI.

allowed_paths:
  - docs/process/**
  - docs/evidence/**
  - contracts/**
  - src/lib/sales/**
  - src/lib/accounting/**
  - src/integrations/supabase/types.ts

forbidden_paths:
  - supabase/migrations/**
  - src/routes/**
  - src/components/**
  - src/shared/components/PaymentReceiptForm.tsx
  - src/shared/components/InvoiceForm.tsx
  - automation/**
  - deploy/**

data_impact: read_only
api_contract_impact: new_contract_required
ui_impact: none
migration_impact: forbidden

dependencies:
  - AFK-G3-013
  - AFK-G3-014

acceptance_criteria:
  - Follow-up states are documented.
  - Receipt/waybill handoff boundary is clear.
  - Group 7 OCR boundary is clear.
  - No accounting or OCR logic is changed.

test_evidence:
  - current file inventory
  - handoff state table
  - no-diff status evidence

risk_level: high

rollback_plan:
  - Revert documentation/contract update only.

stop_conditions:
  - Need to change OCR/receipt extraction.
  - Need to change waybill person fields.
  - Need to change PaymentReceiptForm.
  - Need to change invoice submit flow.

related_docs:
  - docs/REPO_STATE_INVENTORY.md
  - docs/PERSONS_INVENTORY.md
  - docs/MIGRATION_SAFETY_POLICY.md

pr_target: staging
branch_name: docs/AFK-G3-001-task-packets

group2_conflict_check:
  - waybill person linkage: stop/report
  - sales_quotes customer relation: stop
  - customer/person creation: stop

---

# Task Packet AFK-G3-042

task_id: AFK-G3-042
title: Editable Credit Rules Contract
group: 3
backlog_item: 42
phase_label: 49_FIXES_GROUP_3
task_type: engineering_only
owner: Ali Talebizadeh
reviewer: Mohammadreza

business_goal:
  - Make customer credit rules editable in a controlled, auditable, and deterministic way.

current_problem:
  - Credit rule route exists, but the safe contract for editable rules, ownership, audit, and calculation boundaries is not locked.

desired_outcome:
  - A reviewed credit rules contract defining editable fields, non-editable fields, audit behavior, and calculation boundaries.

in_scope:
  - Inventory existing credit rules route/code.
  - Define editable rule fields.
  - Define audit requirements.
  - Define approval/owner boundaries.
  - Define no-Lovable-business-logic rule.

out_of_scope:
  - Implementing rule editor.
  - Changing scoring logic.
  - Creating migration.
  - UI implementation.
  - RBAC/RLS change.

allowed_paths:
  - docs/process/**
  - docs/evidence/**
  - contracts/**
  - src/lib/sales/**
  - src/lib/customers/**
  - src/integrations/supabase/types.ts

forbidden_paths:
  - supabase/migrations/**
  - src/routes/_app.sales.credit-rules.tsx
  - src/components/**
  - src/lib/rbac/**
  - deploy/**
  - automation/**

data_impact: read_only
api_contract_impact: contract_change_required
ui_impact: none
migration_impact: forbidden

dependencies:
  - AFK-G3-004
  - AFK-G3-011
  - AFK-G3-012

acceptance_criteria:
  - Editable/non-editable fields are listed.
  - Audit requirements are documented.
  - Calculation ownership is defined.
  - UI handoff is blocked until contract approval.

test_evidence:
  - current file/RPC evidence
  - rule example matrix
  - no-diff status evidence

risk_level: high

rollback_plan:
  - Revert documentation/contract update only.

stop_conditions:
  - Migration required.
  - RLS/RBAC required.
  - Lovable attempts to implement credit logic.
  - Scoring logic is changed without approved contract.

related_docs:
  - docs/MIGRATION_SAFETY_POLICY.md
  - docs/process/PROMPT_LIBRARY_49_FIXES.md

pr_target: staging
branch_name: docs/AFK-G3-001-task-packets

group2_conflict_check:
  - dynamic permissions: report only
  - customer relation: stop

---

# Task Packet AFK-G3-043

task_id: AFK-G3-043
title: Credit Rule Weights and Manual Override Contract
group: 3
backlog_item: 43
phase_label: 49_FIXES_GROUP_3
task_type: engineering_only
owner: Ali Talebizadeh
reviewer: Mohammadreza

business_goal:
  - Allow credit scoring rules to have controlled weights and manual override without hidden or inconsistent credit decisions.

current_problem:
  - Credit score signals exist, but the approved model for rule weights, manual override, override reason, and audit trail is not locked.

desired_outcome:
  - A deterministic contract for credit weights and manual override, including evidence and audit requirements.

in_scope:
  - Define weight model.
  - Define manual override model.
  - Define override reason requirements.
  - Define audit trail requirements.
  - Define sample calculations.

out_of_scope:
  - Implementing scoring engine.
  - Implementing UI.
  - Changing database schema without approval.
  - Changing RLS/RBAC.
  - Changing customer/person relation.

allowed_paths:
  - docs/process/**
  - docs/evidence/**
  - contracts/**
  - src/lib/sales/**
  - src/lib/customers/**
  - src/integrations/supabase/types.ts

forbidden_paths:
  - supabase/migrations/**
  - src/routes/**
  - src/components/**
  - src/lib/rbac/**
  - deploy/**
  - automation/**

data_impact: read_only
api_contract_impact: contract_change_required
ui_impact: none
migration_impact: forbidden

dependencies:
  - AFK-G3-042
  - AFK-G3-004
  - AFK-G3-011
  - AFK-G3-012

acceptance_criteria:
  - Weight fields are defined.
  - Manual override states are defined.
  - Audit requirements are explicit.
  - At least three calculation examples are required before implementation.
  - No implementation is done in planning packet.

test_evidence:
  - sample scoring examples
  - override scenario table
  - no-diff status evidence

risk_level: high

rollback_plan:
  - Revert documentation/contract update only.

stop_conditions:
  - Migration required.
  - RLS/RBAC required.
  - Lovable attempts credit logic.
  - Customer/person flow change is needed.

related_docs:
  - docs/MIGRATION_SAFETY_POLICY.md
  - docs/process/PROMPT_LIBRARY_49_FIXES.md
  - docs/REPO_STATE_INVENTORY.md

pr_target: staging
branch_name: docs/AFK-G3-001-task-packets

group2_conflict_check:
  - dynamic permissions: report only
  - customer/person creation: stop
  - customer relation: stop

---

## 4. Execution Order After Approval

Recommended execution sequence:

1. AFK-G3-004
2. AFK-G3-011
3. AFK-G3-012
4. AFK-G3-042
5. AFK-G3-043
6. AFK-G3-013
7. AFK-G3-014
8. AFK-G3-022

Reason:

Credit domain must be locked before workflow UI/queue handoff. Preinvoice workflow must not be implemented until Group 2 conflict zones are either resolved or explicitly coordinated.

---

## 5. Group 3 Stop Conditions

Stop immediately if:

- implementation starts before Task Packet approval
- migration is required
- RLS/RBAC is required
- API contract is required but not drafted
- Lovable tries to create business logic
- Cursor tries to rewrite broad UI
- customer/person creation is touched
- sales_quotes customer relation is touched
- preinvoice submit bug is touched
- dynamic permissions are touched
- pricing fallback is touched
- product/search/label is touched
- payment OCR/accounting extraction is touched
- evidence is missing
- rollback plan is missing

---

## 6. Closure Requirement

Group 3 is not closed until:

- all allowed backlog items are mapped to Task Packets
- each implementation batch has separate PR evidence
- conflicts with Group 2 are documented
- migration/API/RBAC impacts are explicitly reviewed
- UI handoff to Lovable is limited to approved contracts only
- Group 3 Closure Report is created
