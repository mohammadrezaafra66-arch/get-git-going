import { useMatches } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useAuth } from "@/lib/auth/AuthProvider";
import type { AppRole } from "@/lib/rbac/roles";

/**
 * M6 / OG-24 — enforce, on the client, the check `beforeLoad` could not make.
 *
 * ## What is broken
 *
 * `requireAnyRole` / `requirePermission` / `requireAdmin` each returned WITHOUT throwing in two
 * situations, and both were fail-open:
 *
 *   1. `typeof window === "undefined"` — the SSR pass. `ensureAuthReady` reads the session out
 *      of browser storage, so the server genuinely cannot know who the caller is.
 *   2. `rolesLoading || profileLoading || loading` — the answer is not known yet.
 *
 * Measured 2026-08-24 with the project's stored `sales` session: twelve of the thirteen
 * accounting routes rendered in full on a cold page load, and three of four rendered while
 * roles were still in flight. Client-side navigation was correct on all thirteen. That
 * asymmetry is the defect.
 *
 * **CORRECTION, wave 2 (2026-09-06): case 2 is FIXED and this header described it as live.**
 * `settleRoles()` (src/lib/rbac/route-guards.ts:79-109) now awaits the role load instead of
 * returning while it is in flight, and all three guards refuse an unsettled snapshot with
 * `redirect({ to: "/unauthorized" })` at `:126`, `:160` and `:194`. There is no roles-loading
 * race left to describe; a reader who takes the paragraph above at face value will believe
 * client-side navigation is unsafe, and it is not.
 *
 * **Case 1 — the SSR fail-open — is what remains, and it is deliberate.** `resolveAuthWithRetry()`
 * returns null on the server (`route-guards.ts:15`) and each guard then returns
 * `{ user: null, roles: [] }` (`:114`, `:151`, `:185`). Because a cold direct navigation runs
 * `beforeLoad` ONLY on the server, the exposure is permanent for that page view rather than a
 * window that closes — which is precisely why this component, and not a fix in the guards, is the
 * enforcement point.
 *
 * ## Why this is not fixed on the server
 *
 * Denying during SSR would send every legitimate user to `/login` on their first page load.
 * That is not hypothetical here: phase 6.7 had to undo exactly that regression in three routes
 * that had open-coded an `ensureAuthReady()` check. The guard's SSR return is deliberate and
 * stays.
 *
 * ## Why the requirement travels as `staticData` and not as router context
 *
 * The obvious mechanism — have the guard return its requirement from `beforeLoad`, which is
 * merged into route context — was built and MEASURED, and it does not work in this stack. On
 * the client every match's context is empty:
 *
 *   [{"id":"__root__","ctxKeys":[]},{"id":"/_app","ctxKeys":[]},
 *    {"id":"/_app/accounting/treasury","ctxKeys":[]}]
 *
 * A gate reading that would silently never fire — a dead check that looks like a live one,
 * which is worse than no check at all — so the code was removed rather than left in place.
 *
 * **The measurement is solid; the earlier explanation of it was not, and a reviewer was right to
 * say so.** This app creates its router with an empty root context (`src/router.tsx`: `context:
 * {}`) and no route in the repository returns anything from `beforeLoad`, so `ctxKeys: []` on
 * all three matches — `__root__` included — is equally explained by "this app configures no
 * context at all". What is established is narrower and sufficient: the mechanism was built,
 * deployed and observed to change nothing, and the case that matters is precisely the cold load,
 * where the client does not re-run the initial match's `beforeLoad` during hydration. A
 * context-fed gate would therefore read nothing exactly when it is needed.
 *
 * `staticData` is static route configuration, so it survives to the client. Measured on one
 * route before being applied to the rest: `sales` on `/accounting/treasury` (carrying
 * `staticData`) saw the denial; `sales` on `/accounting/payment-vouchers` (without it, as the
 * control) still saw the page; `accountant` saw the page on both.
 *
 * ## The cost, stated plainly
 *
 * One line per route. That is why this mission applies it to the thirteen accounting routes
 * only and leaves the other 136 guarded routes alone — a repo-wide rollout is a decision the
 * owner has not taken, and it is recorded as an Owner-Gate rather than assumed here.
 *
 * **UPDATE, wave 2 (2026-09-06): that Owner-Gate was opened, partly.** The owner took the
 * decision for the routes the wave-2 investigation classified as **tier 1** — money, credit,
 * roles/permissions, API keys, PII, or a destructive control — and 36 of them were gated
 * (docs/missions/security2/CONTRACTS.md §1 decision 1 and §10). Tier 2 (62 routes) and tier 3
 * (47) were explicitly NOT taken and are carried forward as a named backlog with their exposure
 * lines and live role sets already written, in
 * docs/research/security2-investigation-20260906.md. So a route with a guard and no gate is still
 * an open item rather than a settled exemption.
 *
 * ## Where `allowed` comes from — the one thing that is easy to get wrong
 *
 * `allowed` mirrors the LIVE `role_permissions` table. Read the module's row out of the database
 * before writing a gate.
 *
 * **UPDATE, wave 6 (X-3): the static table this paragraph warned about is GONE.** It used to
 * disagree with the database on 13 modules — worst on `pricing`, where live grants view to admin,
 * manager, accountant, **sales and purchase_specialist** while the static copy named three, so a
 * gate copied from `roles.ts` denied every real salesperson on ~15 routes. `src/lib/rbac/roles.ts`
 * no longer holds a permission matrix at all, so that particular way of writing a wrong gate is
 * now impossible. The instruction stands: the database is the source.
 *
 * The role list still lives in one place per route, on the line above the `beforeLoad` call it
 * mirrors, so the two cannot drift apart without both being visible in the same three lines.
 */

/**
 * NO `permission` KIND, DELIBERATELY. An earlier draft mirrored `requirePermission` here with a
 * direct `hasPermissionEx(...)` call, and a reviewer found that it silently diverges from the
 * guard it claims to mirror: `requirePermission` does `await loadRolePermissions()` FIRST, while
 * a React render cannot await, so an unpopulated dynamic cache made `hasPermissionEx` fall
 * through to the STATIC permission table. The two would then disagree for any role whose
 * `role_permissions` row differs from the static default.
 *
 * **UPDATE, wave 6 (X-3): the divergence described above no longer exists**, and half of the
 * "render cannot await" problem is now solved. The static table is deleted, so there is nothing
 * left to fall through TO, and this component holds on `permissionsLoading` until the table has
 * been read — which is the render-time equivalent of the `await` a render cannot perform. A
 * `permission` kind is therefore no longer blocked on the cache-load problem.
 *
 * It is still NOT added here, because no route uses one and adopting the 74 `requirePermission`
 * routes is OG-41's scope, not X-3's. Shipping an unused branch remains the thing this comment
 * was written to prevent.
 */
export type RouteGate = { kind: "anyRole"; allowed: readonly AppRole[] } | { kind: "admin" };

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    gate?: RouteGate;
  }
}

const ROLE_FA: Record<string, string> = {
  admin: "مدیر کل",
  manager: "مدیر",
  accountant: "حسابدار",
  sales: "فروشنده",
  viewer: "بازدیدکننده",
};

function describe(gate: RouteGate): string {
  if (gate.kind === "admin") return "این بخش فقط برای مدیر کل است.";
  return `این بخش فقط برای ${gate.allowed.map((r) => ROLE_FA[r] ?? r).join("، ")} است.`;
}

/**
 * Written positively on purpose: each branch enumerates what is ALLOWED. A guard phrased as a
 * negation (`branch !== "payment"`) fails open for a case nobody has added yet — a reviewer
 * caught that exact shape in the phase-6 remediation.
 */
function passes(gate: RouteGate, roles: AppRole[]): boolean {
  if (gate.kind === "admin") return roles.includes("admin");
  return gate.allowed.some((allowed) => roles.includes(allowed));
}

export function RouteRoleGate({ children }: { children: ReactNode }) {
  const matches = useMatches();
  const { roles, rolesLoading, profileLoading, loading, permissionsLoading, rolesError } =
    useAuth();

  // Every gate on the matched chain has to pass — a nested layout may carry one of its own.
  const gates = matches
    .map((m) => (m.staticData as { gate?: RouteGate } | undefined)?.gate)
    .filter((g): g is RouteGate => Boolean(g));

  if (gates.length === 0) return <>{children}</>;

  // 1. The answer is not known yet. Hold. Never render the page, and never call this a denial.
  //
  //    `permissionsLoading` joins this list in wave 6 (X-3). The gates themselves are only
  //    `anyRole` / `admin` and do not read `role_permissions` — but the PAGE this component
  //    wraps does, through `hasPermissionEx`, and X-3 removed the static matrix that used to
  //    answer while the table was in flight. Without holding here, a permitted user's controls
  //    render absent and then appear: the flash of the wrong one. Holding for the whole subtree
  //    fixes it in one place instead of at every call site.
  //
  //    This cannot hang: `permissionsLoading` tracks "finished trying", not "has rows", so a
  //    failed fetch falls through to the denial path rather than spinning forever.
  if (rolesLoading || profileLoading || loading || permissionsLoading) {
    return (
      <div className="p-6 text-muted-foreground" data-testid="route-gate-checking">
        در حال بررسی دسترسی…
      </div>
    );
  }

  // 2. The roles could not be loaded at all. This is NOT a denial and must not read like one:
  //    reporting it as «دسترسی ندارید» is a confident, wrong diagnosis that sends an
  //    administrator to the wrong person for help.
  if (rolesError) {
    return (
      <div className="p-6 text-destructive" data-testid="route-gate-roles-error">
        بارگذاری نقش‌های شما ناموفق بود، بنابراین دسترسی قابل بررسی نیست. صفحه را دوباره بارگذاری
        کنید؛ اگر تکرار شد این خطا مربوط به دسترسی شما نیست و باید به پشتیبانی اطلاع دهید.
      </div>
    );
  }

  const failed = gates.find((g) => !passes(g, roles as AppRole[]));
  if (failed) {
    return (
      <div className="p-6 text-muted-foreground" data-testid="route-gate-denied">
        دسترسی ندارید. {describe(failed)}
      </div>
    );
  }

  return <>{children}</>;
}
