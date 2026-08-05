import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, Merge, Pencil, PhoneOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PersonIdentifiersForm } from "@/components/persons/PersonIdentifiersForm";
import { PersonContextLinksForm } from "@/components/persons/PersonContextLinksForm";
import { getPerson } from "@/lib/persons/functions";
import { toError } from "@/lib/server-fn-error";
import type { PersonIdentifierDTO } from "@/lib/persons/identifiers.functions";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { requirePermission } from "@/lib/rbac/route-guards";
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import type { PersonKind, PersonVisibilityScope } from "@/lib/persons/schemas";

/**
 * Phase 1 P0 — read-only person profile.
 *
 * Requires persons.view (not update). Never mutates. Edit / merge CTAs are
 * conditional on the same role gates the write routes already use.
 */
export const Route = createFileRoute("/_app/persons_/$personId")({
  beforeLoad: async () => {
    await requirePermission("persons", "view");
  },
  component: PersonProfilePage,
});

const KIND_LABEL: Record<PersonKind, string> = {
  individual: "حقیقی",
  organization: "حقوقی",
};

const SCOPE_LABEL: Record<PersonVisibilityScope, string> = {
  internal_general: "داخلی",
  restricted_finance: "محدود-مالی",
  restricted_executive: "محدود-مدیریتی",
};

interface PersonAliasRow {
  id: string;
  alias: string;
  alias_kind: string;
}

interface MergeCandidateRow {
  id: string;
  reason: string;
  detail: string | null;
  status: string;
}

async function authHeaders(): Promise<{ Authorization: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("نشست کاربری معتبر نیست. لطفاً دوباره وارد شوید.");
  }
  return { Authorization: `Bearer ${token}` };
}

function e164ToLocalMobile(value: string): string | null {
  const v = value.trim();
  if (/^\+98\d{10}$/.test(v)) return `0${v.slice(3)}`;
  if (/^09\d{9}$/.test(v)) return v;
  return null;
}

function PersonProfilePage() {
  const { personId } = Route.useParams();
  const { roles } = useAuth();
  // Mirrors /persons/$id/edit and /persons/merge — not a new permission model.
  const canUpdate = hasAnyRole(roles, ["admin", "manager"]);
  const canMerge = hasAnyRole(roles, ["admin", "manager"]);

  const getFn = useServerFn(getPerson);

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

  // person_aliases exists since migration 228; generated Database types omit it.
  const aliasesQuery = useQuery({
    queryKey: ["person", personId, "aliases"],
    queryFn: async (): Promise<PersonAliasRow[]> => {
      const { data, error } = await supabase
        .from("person_aliases" as never)
        .select("id, alias, alias_kind")
        .eq("person_id", personId)
        .order("alias", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PersonAliasRow[];
    },
  });

  // Pending merge suspicion — RLS already limits this to admin/manager.
  const mergeCandidateQuery = useQuery({
    queryKey: ["person", personId, "merge-candidate"],
    enabled: canMerge,
    queryFn: async (): Promise<MergeCandidateRow | null> => {
      const { data, error } = await supabase
        .from("person_merge_candidates" as never)
        .select("id, reason, detail, status")
        .eq("status", "pending")
        .or(`person_id_a.eq.${personId},person_id_b.eq.${personId}`)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as MergeCandidateRow | null) ?? null;
    },
  });

  const phoneCollisionQuery = useQuery({
    queryKey: ["person", personId, "phone-collision", identifiersQuery.data],
    enabled: canMerge && !!identifiersQuery.data,
    queryFn: async (): Promise<{ id: string; normalized_phone: string } | null> => {
      const locals = (identifiersQuery.data ?? [])
        .filter((i) => i.kind === "mobile_e164" && i.status !== "revoked")
        .map((i) => e164ToLocalMobile(i.value_normalized))
        .filter((v): v is string => !!v);
      if (locals.length === 0) return null;
      const { data, error } = await supabase
        .from("phone_collisions")
        .select("id, normalized_phone")
        .eq("status", "pending")
        .in("normalized_phone", locals)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
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
        <PageHeader title="پرونده شخص" />
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
        <PageHeader title="پرونده شخص" />
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

  const aliases = aliasesQuery.data ?? [];
  const pendingMerge = mergeCandidateQuery.data;
  const collision = phoneCollisionQuery.data;

  return (
    <div className="space-y-4" dir="rtl">
      <nav className="text-sm text-muted-foreground" aria-label="مسیر صفحه">
        <Link to="/persons" className="hover:text-foreground hover:underline">
          اشخاص
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{person.display_name}</span>
      </nav>

      <PageHeader
        title={person.display_name}
        description="پروندهٔ فقط‌خواندنی شخص"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/persons">
                <ArrowRight className="ml-2 h-4 w-4" /> بازگشت به فهرست
              </Link>
            </Button>
            {canUpdate ? (
              <Button asChild>
                <Link to="/persons/$personId/edit" params={{ personId }}>
                  <Pencil className="ml-2 h-4 w-4" /> ویرایش
                </Link>
              </Button>
            ) : null}
            {canMerge ? (
              <Button asChild variant="outline">
                <Link to="/persons/merge">
                  <Merge className="ml-2 h-4 w-4" /> اشخاص تکراری
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      {(pendingMerge || collision) && (
        <div className="flex flex-col gap-2">
          {pendingMerge ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <Badge className="bg-amber-500 text-white hover:bg-amber-500">نامزد ادغام</Badge>
              <span className="text-muted-foreground">
                این شخص در صف بررسی اشخاص تکراری است
                {pendingMerge.detail ? ` — ${pendingMerge.detail}` : ""}.
              </span>
            </div>
          ) : null}
          {collision ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <PhoneOff className="h-4 w-4 text-destructive" />
              <span>
                تداخل شماره تلفن برای {collision.normalized_phone} ثبت شده است.
              </span>
              <Button asChild variant="link" className="h-auto p-0">
                <Link to="/admin/phone-collisions">مشاهدهٔ صف تداخل</Link>
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>اطلاعات اصلی</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">نام نمایشی</dt>
              <dd className="font-medium">{person.display_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">نام رسمی / قانونی</dt>
              <dd>{person.legal_name?.trim() ? person.legal_name : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">نوع</dt>
              <dd>{KIND_LABEL[person.kind as PersonKind] ?? person.kind}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">سطح دسترسی</dt>
              <dd>
                {SCOPE_LABEL[person.visibility_scope as PersonVisibilityScope] ??
                  person.visibility_scope}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">وضعیت</dt>
              <dd>
                {person.is_active ? (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">فعال</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    غیرفعال
                  </Badge>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">یادداشت</dt>
              <dd className="whitespace-pre-wrap">{person.notes?.trim() ? person.notes : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">ایجاد</dt>
              <dd>{formatDateTimeFa(person.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">آخرین به‌روزرسانی</dt>
              <dd>{formatDateTimeFa(person.updated_at)}</dd>
            </div>
          </dl>
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
              canManage={false}
            />
          )}
        </CardContent>
      </Card>

      {(aliasesQuery.isLoading || aliases.length > 0 || aliasesQuery.error) && (
        <Card>
          <CardHeader>
            <CardTitle>نام‌های مستعار</CardTitle>
          </CardHeader>
          <CardContent>
            {aliasesQuery.isLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری...
              </div>
            ) : aliasesQuery.error ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                بارگذاری نام‌های مستعار با خطا مواجه شد.
              </div>
            ) : aliases.length === 0 ? (
              <p className="text-sm text-muted-foreground">نام مستعاری ثبت نشده است.</p>
            ) : (
              <ul className="list-inside list-disc space-y-1 text-sm">
                {aliases.map((a) => (
                  <li key={a.id}>
                    {a.alias}
                    {a.alias_kind ? (
                      <span className="mr-2 text-muted-foreground">({a.alias_kind})</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ارتباط‌های شخص</CardTitle>
        </CardHeader>
        <CardContent>
          <PersonContextLinksForm personId={personId} canManage={false} />
        </CardContent>
      </Card>
    </div>
  );
}
