import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Loader2, Pencil, Eye, Filter, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole, type AppRole } from "@/lib/rbac/roles";
import { useDebounce } from "@/hooks/use-debounce";
import {
  findPersonIdsByFieldValue,
  listPersonFieldDefinitions,
} from "@/lib/persons/field-definitions";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { getPageTitle } from "@/config/branding";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toFaDigits } from "@/lib/i18n/formatters";
import {
  PERSON_KINDS,
  type PersonKind,
  type PersonVisibilityScope,
} from "@/lib/persons/schemas";

const PAGE_SIZE = 20;

/** Filter tokens sent as p_context_kinds (DB values + no_context sentinel). */
const CONTEXT_FILTER_OPTIONS = [
  { value: "customer", label: "مشتری" },
  { value: "supplier", label: "تأمین‌کننده" },
  { value: "staff_link", label: "کارمند" },
  { value: "accounting_party", label: "طرف حساب خارجی" },
  { value: "no_context", label: "بدون ارتباط" },
] as const;

type ContextFilter = (typeof CONTEXT_FILTER_OPTIONS)[number]["value"];
const CONTEXT_VALUES = CONTEXT_FILTER_OPTIONS.map((o) => o.value);

const MISSING_FILTER_OPTIONS = [
  { value: "mobile_e164", label: "بدون موبایل" },
  { value: "national_id_ir", label: "بدون کد ملی" },
  { value: "asan_person_code", label: "بدون کد آسان" },
] as const;

type MissingFilter = (typeof MISSING_FILTER_OPTIONS)[number]["value"];
const MISSING_VALUES = MISSING_FILTER_OPTIONS.map((o) => o.value);

type ActiveStatus = "all" | "active" | "inactive";

/** URL search — arrays stored as comma-separated strings. */
type PersonsSearch = {
  q?: string;
  kind?: PersonKind | "all";
  /** CSV of ContextFilter */
  contexts?: string;
  active?: ActiveStatus;
  /** CSV of MissingFilter */
  missing?: string;
  /** Wave 6 B-4 — person_field_definitions.id to filter on. */
  fieldId?: string;
  /** Wave 6 B-4 — substring matched against that field's stored value. */
  fieldValue?: string;
  /** 1-based page */
  page?: number;
};

function parseCsvEnum<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  const set = new Set(allowed);
  const out: T[] = [];
  for (const part of raw.split(",")) {
    const v = part.trim() as T;
    if (set.has(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

function toCsv(values: string[]): string | undefined {
  return values.length ? values.join(",") : undefined;
}

function isViewerOnly(roles: AppRole[]): boolean {
  return roles.length > 0 && roles.every((r) => r === "viewer");
}

export const Route = createFileRoute("/_app/persons")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requirePermission("persons", "view"). `allowed` is the LIVE
  // role_permissions.persons.can_view set read from the database on 2026-09-06 —
  // NOT src/lib/rbac/roles.ts, whose static table disagrees for several modules.
  staticData: {
    gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales", "viewer"] },
  },
  validateSearch: (s: Record<string, unknown>): PersonsSearch => {
    const kindRaw = typeof s.kind === "string" ? s.kind : undefined;
    const kind =
      kindRaw === "individual" || kindRaw === "organization" || kindRaw === "all"
        ? kindRaw
        : undefined;
    const activeRaw = typeof s.active === "string" ? s.active : undefined;
    const active =
      activeRaw === "all" || activeRaw === "active" || activeRaw === "inactive"
        ? activeRaw
        : undefined;
    const pageRaw =
      typeof s.page === "string"
        ? Number(s.page)
        : typeof s.page === "number"
          ? s.page
          : undefined;
    const page =
      typeof pageRaw === "number" && Number.isFinite(pageRaw) && pageRaw >= 1
        ? Math.floor(pageRaw)
        : undefined;
    const contextsCsv = toCsv(parseCsvEnum(s.contexts, CONTEXT_VALUES));
    const missingCsv = toCsv(parseCsvEnum(s.missing, MISSING_VALUES));
    return {
      q: typeof s.q === "string" && s.q.length <= 80 ? s.q : undefined,
      kind,
      contexts: contextsCsv,
      active,
      missing: missingCsv,
      fieldId:
        typeof s.fieldId === "string" && /^[0-9a-fA-F-]{36}$/.test(s.fieldId)
          ? s.fieldId
          : undefined,
      fieldValue:
        typeof s.fieldValue === "string" && s.fieldValue.length <= 80 ? s.fieldValue : undefined,
      page,
    };
  },
  beforeLoad: async () => {
    await requirePermission("persons", "view");
  },
  head: () => ({ meta: [{ title: getPageTitle("اشخاص") }] }),
  component: PersonsListPage,
});

interface PersonRow {
  id: string;
  kind: PersonKind;
  display_name: string;
  legal_name: string | null;
  visibility_scope: PersonVisibilityScope;
  is_active: boolean;
  created_at: string;
  total_count?: number | string;
}

const KIND_LABEL: Record<PersonKind, string> = {
  individual: "حقیقی",
  organization: "حقوقی",
};
const SCOPE_LABEL: Record<PersonVisibilityScope, string> = {
  internal_general: "داخلی",
  restricted_finance: "محدود-مالی",
  restricted_executive: "محدود-مدیریتی",
};

function PersonsListPage() {
  const { roles } = useAuth();
  const canManage = hasAnyRole(roles, ["admin", "manager"]);
  const viewerOnly = isViewerOnly(roles);
  const navigate = useNavigate({ from: "/persons" });
  const searchParams = Route.useSearch();

  const search = searchParams.q ?? "";
  const kind = searchParams.kind ?? "all";
  const contexts = parseCsvEnum(searchParams.contexts, CONTEXT_VALUES);
  const active = searchParams.active ?? "all";
  const missing = viewerOnly ? [] : parseCsvEnum(searchParams.missing, MISSING_VALUES);
  const fieldId = searchParams.fieldId ?? "";
  const fieldValue = searchParams.fieldValue ?? "";
  const page = Math.max(0, (searchParams.page ?? 1) - 1);

  const debouncedRaw = useDebounce(search, 350);
  const term = debouncedRaw.trim();

  const patchSearch = (patch: Partial<PersonsSearch>, resetPage = true) => {
    void navigate({
      search: (prev: PersonsSearch) => {
        const next: PersonsSearch = { ...prev, ...patch };
        if (resetPage && patch.page === undefined) next.page = 1;
        if (!next.q) delete next.q;
        if (!next.kind || next.kind === "all") delete next.kind;
        if (!next.contexts) delete next.contexts;
        if (!next.active || next.active === "all") delete next.active;
        if (!next.missing || viewerOnly) delete next.missing;
        if (!next.fieldId) {
          delete next.fieldId;
          delete next.fieldValue;
        }
        if (!next.fieldValue) delete next.fieldValue;
        if (!next.page || next.page <= 1) delete next.page;
        return next;
      },
      replace: true,
    });
  };

  // The custom-field filter (wave 6 B-4) needs its own query path, and that is deliberate.
  // `search_visible_persons` computes `total_count` inside the function, before any filter a
  // caller could add, so an extra `.in("id", …)` on the RPC would return a correct page with a
  // WRONG total and silently break paging. Adding a `p_person_ids` parameter to the RPC would
  // mean a backend change, which B-4 is explicitly not allowed to make without proving a
  // column missing — and nothing is missing here.
  //
  // So when the field filter is on, the list is built from `person_field_values` -> `persons`
  // instead. That is not a visibility hole: `pfv_select_via_person` already restricts the id
  // set by the person's `visibility_scope`, and `persons` has its own RLS on top, so both ends
  // are enforced by the database exactly as the RPC path is.
  const { data, isLoading, error } = useQuery({
    queryKey: ["persons", { q: term, kind, contexts, active, missing, fieldId, fieldValue, page }],
    queryFn: async () => {
      if (fieldId) {
        const ids = await findPersonIdsByFieldValue(fieldId, fieldValue);
        if (ids.length === 0) return { rows: [] as PersonRow[], count: 0 };

        let q = supabase
          .from("persons")
          .select("id, kind, display_name, legal_name, visibility_scope, is_active, created_at", {
            count: "exact",
          })
          .in("id", ids)
          .order("display_name", { ascending: true })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        if (kind !== "all") q = q.eq("kind", kind);
        if (active !== "all") q = q.eq("is_active", active === "active");
        if (term) q = q.ilike("display_name", `%${term}%`);

        const { data, error, count } = await q;
        if (error) throw error;
        return { rows: (data ?? []) as unknown as PersonRow[], count: count ?? 0 };
      }

      const { data, error } = await supabase.rpc("search_visible_persons", {
        p_query: term,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
        p_kind: kind === "all" ? null : kind,
        p_context_kinds: contexts.length ? [...contexts] : null,
        p_active_status: active,
        p_missing_identifier_kinds: missing.length ? [...missing] : null,
      });
      if (error) throw error;
      const rows = (data ?? []) as PersonRow[];
      const count = rows.length > 0 ? Number(rows[0].total_count ?? rows.length) : 0;
      return { rows, count };
    },
  });

  // Only the ACTIVE definitions are offered as a filter; a deactivated field is not something
  // to search the whole directory by.
  const fieldDefsQuery = useQuery({
    queryKey: ["person-field-definitions"],
    queryFn: listPersonFieldDefinitions,
  });
  const filterableFields = (fieldDefsQuery.data ?? []).filter((d) => d.is_active);

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const activeFilterCount =
    (kind !== "all" ? 1 : 0) +
    contexts.length +
    (active !== "all" ? 1 : 0) +
    missing.length +
    (fieldId ? 1 : 0);

  const toggleContext = (value: ContextFilter) => {
    const next = contexts.includes(value)
      ? contexts.filter((c) => c !== value)
      : [...contexts, value];
    patchSearch({ contexts: toCsv(next) });
  };

  const toggleMissing = (value: MissingFilter) => {
    if (viewerOnly) return;
    const next = missing.includes(value)
      ? missing.filter((m) => m !== value)
      : [...missing, value];
    patchSearch({ missing: toCsv(next) });
  };

  const clearAll = () => {
    void navigate({ search: {}, replace: true });
  };

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        title="اشخاص"
        description="مدیریت پرونده یکپارچه اشخاص (حقیقی و حقوقی)"
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              {/* A-6 — the Excel importer here was retired; /admin/asan-import is the one
                  import surface, and it is the only one the rules in migration 430 guard. */}
              <Button asChild>
                <Link to="/persons/create">
                  <Plus className="ml-2 h-4 w-4" /> شخص جدید
                </Link>
              </Button>
            </div>
          ) : null
        }
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="جستجو با نام، نام دیگر، موبایل، کد ملی یا کد آسان"
                value={search}
                onChange={(e) => {
                  patchSearch({ q: e.target.value || undefined });
                }}
                className="pr-10"
              />
              {search.trim() ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute left-1 top-1/2 h-7 -translate-y-1/2 px-2 text-xs"
                  onClick={() => patchSearch({ q: undefined })}
                >
                  پاک کردن
                </Button>
              ) : null}
            </div>
            <Select
              value={kind}
              onValueChange={(v) => {
                patchSearch({ kind: v as PersonKind | "all" });
              }}
            >
              <SelectTrigger className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه انواع</SelectItem>
                {PERSON_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>فیلترها</span>
              {activeFilterCount > 0 ? (
                <Badge variant="secondary">{toFaDigits(activeFilterCount)}</Badge>
              ) : null}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-between sm:w-48"
                  aria-label="نوع ارتباط"
                >
                  نوع ارتباط
                  {contexts.length ? (
                    <Badge variant="secondary" className="mr-2">
                      {toFaDigits(contexts.length)}
                    </Badge>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>نوع ارتباط</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {CONTEXT_FILTER_OPTIONS.map((opt) => (
                  <DropdownMenuCheckboxItem
                    key={opt.value}
                    checked={contexts.includes(opt.value)}
                    onCheckedChange={() => toggleContext(opt.value)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {opt.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Select
              value={active}
              onValueChange={(v) => patchSearch({ active: v as ActiveStatus })}
            >
              <SelectTrigger className="sm:w-40" aria-label="وضعیت">
                <SelectValue placeholder="وضعیت" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                <SelectItem value="active">فعال</SelectItem>
                <SelectItem value="inactive">غیرفعال</SelectItem>
              </SelectContent>
            </Select>

            {!viewerOnly ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-between sm:w-48"
                    aria-label="اطلاعات ناقص"
                  >
                    اطلاعات ناقص
                    {missing.length ? (
                      <Badge variant="secondary" className="mr-2">
                        {toFaDigits(missing.length)}
                      </Badge>
                    ) : null}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>اطلاعات ناقص</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {MISSING_FILTER_OPTIONS.map((opt) => (
                    <DropdownMenuCheckboxItem
                      key={opt.value}
                      checked={missing.includes(opt.value)}
                      onCheckedChange={() => toggleMissing(opt.value)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {opt.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {/* Wave 6 B-4 — filter by a custom field's value. Only rendered once at least one
                active definition exists, so the row stays clean on an installation that has
                never defined one. */}
            {filterableFields.length > 0 ? (
              <>
                <Select
                  value={fieldId || "none"}
                  onValueChange={(v) => patchSearch({ fieldId: v === "none" ? undefined : v })}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="فیلد سفارشی" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">فیلد سفارشی</SelectItem>
                    {filterableFields.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldId ? (
                  <Input
                    className="w-40"
                    value={fieldValue}
                    placeholder="مقدار دقیق (خالی = دارای مقدار)"
                    onChange={(e) => patchSearch({ fieldValue: e.target.value || undefined })}
                  />
                ) : null}
              </>
            ) : null}

            {activeFilterCount > 0 || search.trim() ? (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <X className="ml-1 h-3 w-3" />
                پاک کردن فیلترها
              </Button>
            ) : null}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری...
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              بارگذاری فهرست با خطا مواجه شد. لطفاً دوباره تلاش کنید.
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">هیچ شخصی یافت نشد.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام نمایشی</TableHead>
                    <TableHead>نام رسمی</TableHead>
                    <TableHead>نوع</TableHead>
                    <TableHead>سطح دسترسی</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.display_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.legal_name ?? "—"}</TableCell>
                      <TableCell>{KIND_LABEL[r.kind]}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {SCOPE_LABEL[r.visibility_scope]}
                      </TableCell>
                      <TableCell>
                        {r.is_active ? (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                            فعال
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            غیرفعال
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link to="/persons/$personId" params={{ personId: r.id }}>
                              <Eye className="ml-1 h-3 w-3" /> مشاهده
                            </Link>
                          </Button>
                          {canManage ? (
                            <Button variant="outline" size="sm" asChild>
                              <Link to="/persons/$personId/edit" params={{ personId: r.id }}>
                                <Pencil className="ml-1 h-3 w-3" /> ویرایش
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div>مجموع: {toFaDigits(total)} مورد</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => patchSearch({ page }, false)}
              >
                قبلی
              </Button>
              <span>
                صفحه {toFaDigits(page + 1)} از {toFaDigits(totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages}
                onClick={() => patchSearch({ page: page + 2 }, false)}
              >
                بعدی
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
