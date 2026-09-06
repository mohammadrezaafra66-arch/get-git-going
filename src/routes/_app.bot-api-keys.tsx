import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";

export const Route = createFileRoute("/_app/bot-api-keys")({
  // M6/OG-24 — `requirePermission` returns WITHOUT throwing during SSR and while roles load,
  // and on a cold load `beforeLoad` runs only on the server, so it never enforced in the
  // browser at all. Measured 2026-09-06 with cold `viewer` and `sales` sessions: both saw the
  // full Bot API Keys management page, including the «کلید جدید» button. `RouteRoleGate` in
  // `_app` makes the check the guard could not, and it reads this `staticData`.
  //
  // WHY `anyRole` AND NOT A `permission` KIND. `RouteRoleGate` has no `permission` kind on
  // purpose, and the reason is written out in that file: `requirePermission` does
  // `await loadRolePermissions()` FIRST, but a React render cannot await, so an unpopulated
  // dynamic cache silently falls through to the STATIC table in `roles.ts` and the two
  // disagree. Adding the kind would reintroduce exactly the untested, silently-wrong branch a
  // reviewer already caught. This route uses the existing, tested kind instead.
  //
  // WHY THESE THREE ROLES. The list mirrors what `requirePermission("bot-api-keys","view")`
  // actually resolves to once the dynamic cache is loaded — the LIVE `role_permissions` rows,
  // read 2026-09-06:
  //
  //     role_name           | can_view
  //     admin               | t
  //     manager             | t
  //     site                | t
  //     accountant          | f
  //     purchase_specialist | f
  //     sales               | f
  //     viewer              | f
  //
  // NOTE the divergence, which is the reason this list is not copied from `roles.ts`: the
  // STATIC table there says `view: ["admin", "manager"]` and omits `site`. Mirroring the static
  // table would make this gate deny a `site` user that the server guard admits — a false denial,
  // and the two layers would disagree. No user holds `site` today, so this is forward-looking;
  // if the two tables are ever reconciled, reconcile this line with them.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "site"] } },
  beforeLoad: async () => {
    await requirePermission("bot-api-keys", "view");
  },
  component: BotApiKeysLayout,
});

function BotApiKeysLayout() {
  return <Outlet />;
}
