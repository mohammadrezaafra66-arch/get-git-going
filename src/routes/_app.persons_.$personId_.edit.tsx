import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PersonForm, type PersonFormValues } from "@/components/persons/PersonForm";
import { PersonIdentifiersForm } from "@/components/persons/PersonIdentifiersForm";
import { PersonContextLinksForm } from "@/components/persons/PersonContextLinksForm";
import { PersonAliasesManager } from "@/components/persons/PersonAliasesManager";
import { getPerson, updatePerson } from "@/lib/persons/functions";
import { toError } from "@/lib/server-fn-error";
import type { PersonIdentifierDTO } from "@/lib/persons/identifiers.functions";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";
import { requirePermission } from "@/lib/rbac/route-guards";

export const Route = createFileRoute("/_app/persons_/$personId_/edit")({
  beforeLoad: async () => {
    await requirePermission("persons", "update");
  },
  component: PersonEditPage,
});

function PersonEditPage() {
  const { personId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canManage = hasPermissionEx(roles, "persons", "update");

  const getFn = useServerFn(getPerson);
  const updateFn = useServerFn(updatePerson);

  // Belt-and-suspenders: explicitly attach the bearer token at the call site.
  // The global `attachSupabaseAuth` functionMiddleware does this too, but if
  // it fails to run (hydration timing, bundler quirk), `requireSupabaseAuth`
  // sees no Authorization header and the UI surfaces «نشست کاربری معتبر نیست».
  // Mirrors the pattern used in /persons/create.
  async function authHeaders(): Promise<{ Authorization: string }> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      throw new Error("نشست کاربری معتبر نیست. لطفاً دوباره وارد شوید.");
    }
    return { Authorization: `Bearer ${token}` };
  }

  const personQuery = useQuery({
    queryKey: ["person", personId],
    queryFn: async () => {
      const headers = await authHeaders();
      return toError(getFn({ headers, data: { id: personId } }));
    },
  });

  const identifiersQuery = useQuery({
    queryKey: ["person", personId, "identifiers"],
    queryFn: async (): Promise<PersonIdentifierDTO[]> => {
      const { data, error } = await supabase
        .from("person_identifiers")
        .select(
          "id, person_id, kind, value_normalized, status, is_primary, verified_at, created_at, updated_at",
        )
        .eq("person_id", personId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PersonIdentifierDTO[];
    },
  });

  const updateMut = useMutation({
    mutationFn: async (values: PersonFormValues) => {
      const headers = await authHeaders();
      return toError(
        updateFn({
          headers,
          data: {
            id: personId,
            kind: values.kind,
            display_name: values.display_name.trim(),
            legal_name: values.legal_name.trim() ? values.legal_name.trim() : null,
            visibility_scope: values.visibility_scope,
            is_active: values.is_active,
            notes: values.notes.trim() ? values.notes.trim() : null,
          },
        }),
      );
    },
    onSuccess: () => {
      toast.success("تغییرات ذخیره شد");
      qc.invalidateQueries({ queryKey: ["person", personId] });
      qc.invalidateQueries({ queryKey: ["persons"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "ذخیره تغییرات ناموفق بود");
    },
  });

  if (personQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground" dir="rtl">
        <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری...
      </div>
    );
  }

  if (personQuery.error) {
    return (
      <div className="space-y-4" dir="rtl">
        <PageHeader title="ویرایش شخص" />
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-destructive">بارگذاری اطلاعات شخص با خطا مواجه شد.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/persons">
                <ArrowRight className="ml-2 h-4 w-4" /> بازگشت به فهرست
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const person = personQuery.data;
  if (!person) {
    return (
      <div className="space-y-4" dir="rtl">
        <PageHeader title="ویرایش شخص" />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            شخصی با این شناسه یافت نشد یا به آن دسترسی ندارید.
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
        title={canManage ? "ویرایش شخص" : "مشاهده شخص"}
        description={person.display_name}
        actions={
          <Button asChild variant="outline">
            <Link to="/persons">
              <ArrowRight className="ml-2 h-4 w-4" /> بازگشت به فهرست
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>اطلاعات اصلی</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!canManage} className="space-y-4">
            <PersonForm
              initial={{
                kind: person.kind,
                display_name: person.display_name,
                legal_name: person.legal_name ?? "",
                visibility_scope: person.visibility_scope,
                is_active: person.is_active,
                notes: person.notes ?? "",
              }}
              submitLabel="ذخیره تغییرات"
              submitting={updateMut.isPending}
              onSubmit={(values) => updateMut.mutate(values)}
            />
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>شناسه‌ها</CardTitle>
        </CardHeader>
        <CardContent>
          {identifiersQuery.isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری شناسه‌ها...
            </div>
          ) : identifiersQuery.error ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              بارگذاری شناسه‌ها با خطا مواجه شد.
            </div>
          ) : (
            <PersonIdentifiersForm
              personId={personId}
              identifiers={identifiersQuery.data ?? []}
              canManage={canManage}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <PersonAliasesManager personId={personId} canManage={canManage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ارتباط‌های شخص</CardTitle>
        </CardHeader>
        <CardContent>
          <PersonContextLinksForm personId={personId} canManage={canManage} />
        </CardContent>
      </Card>
    </div>
  );
}
