import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { DocumentWizard } from "@/features/ledger-wizard/DocumentWizard";

/** OG-13: create is admin, accountant, manager. Sales is not on that list. */
const CREATE_ROLES = ["admin", "accountant", "manager"] as const;

export const Route = createFileRoute("/_app/accounting/receipts/create")({
  // M6/OG-24 — mirrors the requireAnyRole call below. The shared guard cannot decide
  // during SSR or while roles load, so RouteRoleGate in _app enforces this on the client.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "accountant", "manager"] } },
  beforeLoad: async () => {
    await requireAnyRole([...CREATE_ROLES]);
  },
  component: CreateReceiptPage,
});

function CreateReceiptPage() {
  const { roles, rolesLoading, rolesError } = useAuth();

  // Phase-6 Gate A, P6-B2. `beforeLoad` alone does not hold on a full page load.
  // Measured on 2026-08-22 with a session whose only role is `sales`:
  //
  //   full page load    -> /accounting/payment-vouchers   denied = false
  //   client-side nav   -> /unauthorized                  denied = true
  //
  // The reason is that the guard's `resolveAuthWithRetry` starts with
  // `if (typeof window === "undefined") return null`, and every guard then
  // returns `{ user: null, roles: [] }` without throwing — so the server-rendered
  // page is delivered and the initial route is never re-checked on the client.
  // The server cannot do better on its own: `ensureAuthReady` reads the session
  // from browser storage, so a server-side deny would redirect every legitimate
  // user to /login on their first load.
  //
  // This check runs after hydration, when the roles are known, which is exactly
  // where the SSR pass is blind. It is the pattern this repository already uses
  // in `_app.admin.asan-export.tsx` and five other routes, not a new invention.
  //
  // The shared guard's SSR fail-open affects 150 route files (62 `requireAnyRole`,
  // 73 `requirePermission`, 15 `requireAdmin`) and is recorded as an Owner-Gate;
  // fixing it there is a separate, scoped mission.
  const allowed = roles.some((r) => (CREATE_ROLES as readonly string[]).includes(r));

  if (rolesLoading) {
    // Hold, never render. A wizard shown while the answer is unknown is the
    // failure this check exists to prevent.
    return <div className="p-6 text-muted-foreground">در حال بررسی دسترسی…</div>;
  }

  // A failed role load leaves `roles` empty with `rolesLoading` false, which would
  // otherwise be reported to the user as «دسترسی ندارید» — a confident, wrong
  // diagnosis that sends an admin to the wrong person for help. The shared guard
  // already distinguishes these two; this check must too. Raised by the final
  // independent review.
  if (rolesError) {
    return (
      <div className="p-6 text-destructive" data-testid="create-roles-error">
        بارگذاری نقش‌های شما ناموفق بود، بنابراین دسترسی قابل بررسی نیست. صفحه را دوباره بارگذاری
        کنید؛ اگر تکرار شد این خطا مربوط به دسترسی شما نیست و باید به پشتیبانی اطلاع دهید.
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-6 text-muted-foreground" data-testid="create-denied">
        دسترسی ندارید. ثبت سند حسابداری فقط برای مدیر کل، حسابدار و مدیر است.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="ثبت سند حسابداری"
        description="دریافت، پرداخت یا سند دوبل — هر شاخه فقط فیلدهای مربوط به خودش را می‌پرسد"
        actions={
          <Button variant="outline" asChild>
            <Link to="/accounting/receipts">
              <ArrowRight className="ml-2 h-4 w-4" />
              بازگشت به لیست
            </Link>
          </Button>
        }
      />
      <DocumentWizard />
    </div>
  );
}
