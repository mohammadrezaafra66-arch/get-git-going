# Test Case Registry

Every Phase 0 capability must have a numbered test case.

| ID | Area | Test case | Expected result | Status |
|---|---|---|---|---|
| TC-0-001 | Scope | Confirm task is labeled `PHASE-0` | Task is accepted only if Phase 0 safe | TODO |
| TC-0-002 | Secrets | Check no real secret is committed | No API key, token, cookie, password or service key exists | TODO |
| TC-0-003 | Job lifecycle | Dummy job moves through allowed states | Lifecycle follows `JOB_LIFECYCLE.md` | TODO |
| TC-0-004 | Heartbeat | Dummy worker sends heartbeat | Heartbeat is visible and timestamped | TODO |
| TC-0-005 | Checkpoint | Dummy worker saves checkpoint | Checkpoint can be read after interruption | TODO |
| TC-0-006 | Failure | Dummy job can fail safely | Failure is logged and status becomes `FAILED` | TODO |
| TC-0-007 | Retry | Retry-wait path is documented/testable | Job can enter `RETRY_WAITING` | TODO |
| TC-0-008 | E2E dummy | Dummy job completes end-to-end | Final status is readable | TODO |
| TC-0-009 | Forbidden work | Ensure no real bot exists in Phase 0 | No real external automation is present | TODO |

## Status values

- TODO
- READY
- PASS
- FAIL
- BLOCKED
