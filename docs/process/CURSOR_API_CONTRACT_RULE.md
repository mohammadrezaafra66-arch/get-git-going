# Cursor API Contract Rule

Canonical contract file:

`automation/openapi/automation-v1.yaml`

Use this file as the source of truth for AfraKala API work.

Before API-related work:

1. Read the canonical contract.
2. Check the endpoint and schemas.
3. Update the contract first when the endpoint is missing.
4. Validate with Redocly.
5. Implement after review.

Validation command:

```bash
npx --yes @redocly/cli lint automation/openapi/automation-v1.yaml
```

The root `openapi/` path is deprecated for YAML contract files.

Order:

1. Contract
2. Implementation
3. UI
4. Production
