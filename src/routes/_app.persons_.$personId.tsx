import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, Merge, Pencil } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PersonIdentifiersForm } from "@/components/persons/PersonIdentifiersForm";
import { PersonAliasesManager } from "@/components/persons/PersonAliasesManager";
import { PersonCustomFields } from "@/components/persons/PersonCustomFields";
import { PersonDeepLinks } from "@/components/persons/PersonDeepLinks";
import { PersonMergePanel } from "@/components/persons/PersonMergePanel";
import { PersonCollisionPanel } from "@/components/persons/PersonCollisionPanel";
import { PersonAuditSummary } from "@/components/persons/PersonAuditSummary";
import { getPerson } from "@/lib/persons/functions";
import { toError } from "@/lib/server-fn-error";
import type { PersonIdentifierDTO } from "@/lib/persons/identifiers.functions";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole, hasPermissionEx } from "@/lib/rbac/roles";
import { requirePermission } from "@/lib/rbac/route-guards";
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import type { PersonKind, PersonVisibilityScope } from "@/lib/persons/schemas";

/**
 * Phase 5 — person identity dossier (read-only profile expansion).
 *
 * Requires persons.view. Writes gated by persons.update.
 * Merge/collision/audit sections follow existing RLS + route permissions.
 */
export const Route = createFileRoute("/_app/persons_/$personId")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requirePermission("persons", "view"). `allowed` is the LIVE
  // role_permissions.persons.can_view set read from the database on 2026-09-06 —
  // NOT src/lib/rbac/roles.ts, whose static table disagrees for several modules.
  staticData: {
    gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales", "viewer"] },
  },
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

async function authHeaders(): Promise<{ Authorization: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("نشست کاربری معتبر نیست. لطفاً دوباره وارد شوید.");
  }
  return { Authorization: `Bearer ${token}` };
}

function TimestampWithTooltip({ iso, label }: { iso: string; label: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help border-b border-dotted border-muted-foreground/50">
              {formatDateTimeFa(iso)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="font-mono text-xs" dir="ltr">
            {iso}
          </TooltipContent>
        </Tooltip>
      </dd>
    </div>
  );
}

function PersonProfilePage() {
  const { personId } = Route.useParams();
  const { roles } = useAuth();
  const canUpdate = hasPermissionEx(roles, "persons", "update");
  const canMerge = hasAnyRole(roles, ["admin", "manager"]);
  const canSeeCollisions = hasAnyRole(roles, ["admin", "manager", "accountant"]);
  const canOpenStaff = hasAnyRole(roles, ["admin"]);
  const canOpenAccounting = hasAnyRole(roles, ["admin", "manager", "accountant"]);
  const canViewAudit = hasPermissionEx(roles, "audit-logs", "view");
  const isViewerOnly = hasAnyRole(roles, ["viewer"]) && !canUpdate;

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

  const createdByQuery = useQuery({
    queryKey: ["person", personId, "created-by", personQuery.data?.created_by],
    enabled: !!personQuery.data?.created_by,
    queryFn: async (): Promise<string | null> => {
      const id = personQuery.data!.created_by!;
      const { data } = await supabase.from("profiles").select("full_name").eq("id", id).maybeSingle();
      return data?.full_name?.trim() || null;
    },
  });

  if (personQuery.isLoading) {
    return (
      <div className="space-y-4" dir="rtl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری...
        </div>
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

  const identifiers = identifiersQuery.data ?? [];
  const identifiersHiddenForViewer =
    isViewerOnly && !identifiersQuery.isLoading && !identifiersQuery.error && identifiers.length === 0;

  return (
    <TooltipProvider>
      <div className="min-w-0 space-y-4 overflow-x-hidden" dir="rtl">
        <nav className="text-sm text-muted-foreground" aria-label="مسیر صفحه">
          <Link to="/persons" className="hover:text-foreground hover:underline">
            اشخاص
          </Link>
          <span className="mx-2">/</span>
          <span className="break-words text-foreground">{person.display_name}</span>
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

        {/* 1. Identity summary */}
        <Card>
          <CardHeader>
            <CardTitle>خلاصه هویت</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">نام نمایشی</dt>
                <dd className="break-words font-medium">{person.display_name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">نام حقوقی</dt>
                <dd className="break-words">{person.legal_name?.trim() ? person.legal_name : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">نوع شخص</dt>
                <dd>{KIND_LABEL[person.kind as PersonKind] ?? person.kind}</dd>
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
                <dt className="text-xs text-muted-foreground">سطح دسترسی</dt>
                <dd>
                  {SCOPE_LABEL[person.visibility_scope as PersonVisibilityScope] ??
                    person.visibility_scope}
                </dd>
              </div>
              <TimestampWithTooltip iso={person.created_at} label="تاریخ ایجاد" />
              <TimestampWithTooltip iso={person.updated_at} label="آخرین تغییر" />
              {person.created_by ? (
                <div>
                  <dt className="text-xs text-muted-foreground">ایجادکننده</dt>
                  <dd>{createdByQuery.data ?? "—"}</dd>
                </div>
              ) : null}
              {person.notes?.trim() ? (
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-xs text-muted-foreground">یادداشت</dt>
                  <dd className="whitespace-pre-wrap">{person.notes}</dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        {/* 2. Roles / deep links */}
        <Card>
          <CardHeader>
            <CardTitle>نقش‌ها و پرونده‌های مرتبط</CardTitle>
          </CardHeader>
          <CardContent>
            <PersonDeepLinks
              personId={personId}
              canOpenStaff={canOpenStaff}
              canOpenAccounting={canOpenAccounting}
            />
          </CardContent>
        </Card>

        {/* 3. Identifiers */}
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
            ) : identifiersHiddenForViewer ? (
              <p className="text-sm text-muted-foreground">
                اطلاعات شناسه برای این نقش قابل نمایش نیست
              </p>
            ) : (
              <PersonIdentifiersForm
                personId={personId}
                identifiers={identifiers}
                canManage={false}
              />
            )}
          </CardContent>
        </Card>

        {/* 4. Aliases */}
        <Card>
          <CardContent className="pt-6">
            <PersonAliasesManager personId={personId} canManage={canUpdate} />
          </CardContent>
        </Card>

        {/* 4b. Custom fields (wave 6 B-4). person_field_definitions, person_field_values, their
            RLS, validation triggers and audit triggers have all existed for months with no UI
            reading them at all. Renders itself away when no definition applies to this person. */}
        <PersonCustomFields personId={personId} personKind={person.kind} />

        {/* 5–6. Alerts: merge + collision */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>وضعیت ادغام</CardTitle>
            </CardHeader>
            <CardContent>
              <PersonMergePanel personId={personId} canReview={canMerge} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>تداخل شماره تلفن</CardTitle>
            </CardHeader>
            <CardContent>
              <PersonCollisionPanel
                personId={personId}
                identifiers={identifiersQuery.data}
                canSee={canSeeCollisions}
                canReviewQueue={canMerge}
              />
            </CardContent>
          </Card>
        </div>

        {/* 7. Recent audit */}
        {canViewAudit ? (
          <Card>
            <CardHeader>
              <CardTitle>فعالیت اخیر</CardTitle>
            </CardHeader>
            <CardContent>
              <PersonAuditSummary personId={personId} canView={canViewAudit} />
            </CardContent>
          </Card>
        ) : null}

        {/* 8. Metadata */}
        <Card>
          <CardHeader>
            <CardTitle>فراداده</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">شناسه شخص</dt>
                <dd className="break-all font-mono text-xs" dir="ltr">
                  {person.id}
                </dd>
              </div>
              <TimestampWithTooltip iso={person.created_at} label="تاریخ ایجاد" />
              <TimestampWithTooltip iso={person.updated_at} label="آخرین تغییر" />
              {person.created_by ? (
                <div>
                  <dt className="text-xs text-muted-foreground">شناسه ایجادکننده</dt>
                  <dd className="break-all font-mono text-xs" dir="ltr">
                    {person.created_by}
                  </dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
