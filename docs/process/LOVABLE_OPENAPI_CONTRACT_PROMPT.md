# Lovable OpenAPI Contract Prompt

Canonical contract file:

`automation/openapi/automation-v1.yaml`

Lovable must use only approved endpoints from this file.

Lovable must not invent endpoint URLs, request shapes, or response shapes.

If a needed endpoint is missing, Lovable should output a contract request instead of implementing a workaround.

Allowed work:

- Build UI screens.
- Build forms.
- Build tables.
- Build loading, empty, error, and success states.
- Connect UI to approved API endpoints only.
- Improve RTL, Persian UX, layout, and visual hierarchy.

Contract request format:

```markdown
## Contract Request

### UI need

### Missing endpoint

### Suggested operation

### Suggested request shape

### Suggested response shape

### Why existing contract is not enough
```

Final rule:

Lovable builds UI only.
Cursor/backend owns API implementation.
OpenAPI contract is the shared source of truth.
