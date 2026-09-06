import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PersonForm, type PersonFormValues } from "@/components/persons/PersonForm";
import { createPerson } from "@/lib/persons/functions";
import { toError } from "@/lib/server-fn-error";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { requirePermission } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/persons_/create")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requirePermission("persons", "create"). `allowed` is the LIVE
  // role_permissions.persons.can_create set read from the database on 2026-09-06 —
  // NOT src/lib/rbac/roles.ts, whose static table disagrees for several modules.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager"] } },
  beforeLoad: async () => {
    await requirePermission("persons", "create");
  },
  component: PersonCreatePage,
});

function PersonCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canManage = hasAnyRole(roles, ["admin", "manager"]);
  const createFn = useServerFn(createPerson);

  const mut = useMutation({
    mutationFn: async (values: PersonFormValues) => {
      // Belt-and-suspenders: explicitly fetch a fresh session and attach the
      // bearer token at the call site. The global `attachSupabaseAuth`
      // functionMiddleware also does this, but if the global middleware fails
      // to run for any reason (hydration timing, bundler quirk), the request
      // would reach `requireSupabaseAuth` with no Authorization header and
      // surface as «نشست کاربری معتبر نیست». Reading the session here +
      // passing `headers` via the per-call option guarantees the header is
      // present.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error("نشست کاربری معتبر نیست. لطفاً دوباره وارد شوید.");
      }
      const person = await toError(
        createFn({
          headers: { Authorization: `Bearer ${token}` },
          data: {
            kind: values.kind,
            display_name: values.display_name.trim(),
            legal_name: values.legal_name.trim() ? values.legal_name.trim() : null,
            visibility_scope: values.visibility_scope,
            is_active: values.is_active,
            notes: values.notes.trim() ? values.notes.trim() : null,
            field_values: [],
            // Phase 6.4 — identifiers collected on this page are created and
            // normalized inside person_create_full's transaction, so there is
            // no window where the person exists without them.
            identifiers: values.identifiers,
          },
        }),
      );
      // `toError` already converts any TanStack "unhandled" envelope into a
      // proper Error. Reaching here means the server returned a real DTO; a
      // missing id at this point is a true contract violation worth flagging.
      if (
        !person ||
        typeof person !== "object" ||
        typeof (person as { id?: unknown }).id !== "string"
      ) {
        throw new Error("ایجاد شخص ناموفق بود — پاسخ سرور نامعتبر بود");
      }
      return person;
    },
    onSuccess: (person) => {
      qc.invalidateQueries({ queryKey: ["persons"] });
      toast.success("شخص با موفقیت ایجاد شد");
      navigate({
        to: "/persons/$personId/edit",
        params: { personId: person.id },
      });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "ایجاد شخص ناموفق بود");
    },
  });

  if (!canManage) {
    return (
      <div className="space-y-4" dir="rtl">
        <PageHeader title="شخص جدید" />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            دسترسی لازم برای ایجاد شخص جدید را ندارید.
            <div className="mt-4">
              <Button asChild variant="outline">
                <Link to="/persons">
                  <ArrowRight className="ml-2 h-4 w-4" /> بازگشت به فهرست
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        title="شخص جدید"
        description="ایجاد پرونده‌ی یکپارچه برای شخص حقیقی یا حقوقی"
        actions={
          <Button asChild variant="outline">
            <Link to="/persons">
              <ArrowRight className="ml-2 h-4 w-4" /> بازگشت به فهرست
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <PersonForm
            submitLabel="ایجاد شخص"
            submitting={mut.isPending}
            allowIdentifiers
            onSubmit={(values) => mut.mutate(values)}
            onCancel={() => navigate({ to: "/persons" })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
