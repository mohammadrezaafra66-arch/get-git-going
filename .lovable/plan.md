## Plan: Toggle between all-in-one-page and paginated (25-row) view in Workbench

### File
`src/routes/_app.pricing.my-workbench.tsx`

### Changes
1. **State**: Add `showAllInOnePage` boolean state (default `false`) and derive `effectivePageSize` (`10_000` vs `25`).
2. **Query wiring**: Include `effectivePageSize` in the React Query key so cache stays correct. Pass it to `fetchWorkbenchRowsV2` instead of the hard-coded `PAGE_SIZE`.
3. **Reset on toggle**: Reset `page` to `0` whenever `showAllInOnePage` changes.
4. **Pagination visibility**: Show pagination controls only when `total > effectivePageSize`.
5. **UI control**: Add a `Switch` + `Label` ("نمایش همه در یک صفحه") inside the existing controls card, available to all users.

### No changes to
- Database / migrations
- RLS / RBAC
- Server functions / endpoints
- Any other files

### Risk
LOW — pure UI/frontend change using existing query patterns.
