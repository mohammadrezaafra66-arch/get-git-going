# Plugin Manifest Standard

## Purpose

This document defines the standard metadata format every future Afra Automation plugin or driver must declare before implementation.

A plugin is not a separate project. A plugin is a controlled module that runs under the future Python Worker Runtime and reports through approved contracts.

## Scope

This standard applies to future plugin/driver specifications for:

- lead acquisition modules
- market/pricing modules
- messaging/channel modules
- reporting modules
- dummy worker module
- future external integration modules

## Non-Goals

This standard does not implement:

- real plugins
- real drivers
- real scraping
- real sending
- real browser sessions
- OCR/STT runtime
- AI runtime
- account/proxy automation
- production execution

## Decisions

1. Every future plugin must have a manifest before implementation.
2. Every manifest must declare a phase label.
3. Every manifest must declare capabilities and forbidden capabilities.
4. Every manifest must reference approved contracts.
5. Phase 0 allows only dummy worker planning.
6. Divar, WhatsApp, Instagram, Torob real execution, OCR/STT, and AI remain `FUTURE` unless a later ADR changes that.

## Requirements

A plugin manifest must include:

- `plugin_id`
- `name`
- `description`
- `phase_label`
- `module_family`
- `owner`
- `reviewer`
- `runtime`
- `entrypoint_reference`
- `capabilities`
- `forbidden_capabilities`
- `contracts`
- `data_classification`
- `requires_network`
- `requires_browser`
- `requires_external_service`
- `requires_sensitive_access`
- `manual_fallback`
- `acceptance_criteria`

### Allowed phase labels

- `BASELINE`
- `PHASE-0`
- `PHASE-1`
- `FUTURE`

### Allowed module families

- `dummy`
- `lead_acquisition`
- `market_pricing`
- `communication`
- `ai_analysis`
- `reporting`
- `operations`
- `integration`

### Phase 0 manifest rule

In Phase 0, a manifest may only describe dummy execution or future planning. It must not create permission to run real external automation.

### Capability rules

Capabilities must be explicit. A plugin with a capability not listed in its manifest must be rejected during review.

Examples of capability names:

- `heartbeat_report`
- `safe_log_report`
- `checkpoint_report`
- `artifact_report`
- `dummy_job_run`

Examples of forbidden Phase 0 capability names:

- `real_scraping`
- `real_sending`
- `browser_runtime`
- `ocr_runtime`
- `stt_runtime`
- `ai_runtime`
- `production_external_call`

## Forbidden Work

The manifest standard must not be used to bypass Phase 0 limits.

Forbidden in Phase 0:

- declaring a real module as executable
- adding runtime code
- adding migrations
- adding external service calls
- adding real credentials
- adding browser automation
- adding production scraping or sending
- adding a parallel Core/API/database

## Phase 0 Acceptance Criteria

This document is accepted when:

1. Manifest purpose is clear.
2. Phase labels are defined.
3. Module families are defined.
4. Required manifest fields are defined.
5. Forbidden Phase 0 capabilities are defined.
6. Manifest does not authorize real module execution.

## Owner / Review Responsibility

- Product owner: Mohammadreza Afra.
- Plugin reviewer: assigned technical reviewer.
- Security reviewer: Mohammadreza Afra for sensitive access boundaries.
- Module owner: assigned only when a module is approved for implementation.

## Related Files

- `docs/automation/00_master/PLATFORM_FLEET_PRINCIPLES.md`
- `docs/automation/03_architecture/HYBRID_WORKER_FLEET_ARCHITECTURE.md`
- `docs/automation/04_contracts/INTEGRATION_CENTER_CONTRACT.md`
- `schemas/automation/plugin-manifest.schema.json`
- `schemas/automation/integration.schema.json`
