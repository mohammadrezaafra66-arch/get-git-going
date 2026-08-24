import { useMatches } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";
import type { AppRole, ModuleKey, ExtendedAction } from "@/lib/rbac/roles";

/**
 * M6 / OG-24 — enforce, on the client, the check `beforeLoad` could not make.
 *
 * ## What is broken
 *
 * `requireAnyRole` / `requirePermission` / `requireAdmin` each return WITHOUT throwing in two
 * situations, and both are fail-open:
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
 * `beforeLoad`'s return value is not carried across SSR into the hydrated client, so a gate
 * reading it would silently never fire — a dead check that looks like a live one, which is
 * worse than no check at all. That code was removed rather than left in place.
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
 * The role list still lives in one place per route, on the line above the `beforeLoad` call it
 * mirrors, so the two cannot drift apart without both being visible in the same three lines.
 */

export type RouteGate =
  | { kind: "anyRole"; allowed: readonly AppRole[] }
  | { kind: "admin" }
  | { kind: "permission"; module: ModuleKey; action: ExtendedAction };

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
  if (gate.kind === "anyRole") {
    return `این بخش فقط برای ${gate.allowed.map((r) => ROLE_FA[r] ?? r).join("، ")} است.`;
  }
  return "شما اجازه دسترسی به این بخش را ندارید.";
}

/**
 * Written positively on purpose: each branch enumerates what is ALLOWED. A guard phrased as a
 * negation (`branch !== "payment"`) fails open for a case nobody has added yet — a reviewer
 * caught that exact shape in the phase-6 remediation.
 */
function passes(gate: RouteGate, roles: AppRole[]): boolean {
  if (gate.kind === "admin") return roles.includes("admin");
  if (gate.kind === "anyRole") return roles.some((r) => gate.allowed.includes(r));
  return hasPermissionEx(roles, gate.module, gate.action);
}

export function RouteRoleGate({ children }: { children: ReactNode }) {
  const matches = useMatches();
  const { roles, rolesLoading, profileLoading, loading, rolesError } = useAuth();

  // Every gate on the matched chain has to pass — a nested layout may carry one of its own.
  const gates = matches
    .map((m) => (m.staticData as { gate?: RouteGate } | undefined)?.gate)
    .filter((g): g is RouteGate => Boolean(g));

  if (gates.length === 0) return <>{children}</>;

  // 1. The answer is not known yet. Hold. Never render the page, and never call this a denial.
  if (rolesLoading || profileLoading || loading) {
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
