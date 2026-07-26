import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Loader2, Pencil, Upload } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { useDebounce } from "@/hooks/use-debounce";
import { normalizeSearchText } from "@/lib/i18n/search-normalizer";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
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
import { toFaDigits } from "@/lib/i18n/formatters";
import {
  PERSON_KINDS,
  PERSON_VISIBILITY_SCOPES,
  type PersonKind,
  type PersonVisibilityScope,
} from "@/lib/persons/schemas";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/_app/persons")({
  beforeLoad: async () => {
    await requirePermission("persons", "view");
  },
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

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | PersonKind>("all");
  const [page, setPage] = useState(0);
  const debouncedRaw = useDebounce(search, 350);
  const debounced = normalizeSearchText(debouncedRaw);
  const term = debounced.length >= 2 ? debounced : "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["persons", { q: term, kind, page }],
    queryFn: async () => {
      let q = supabase
        .from("persons")
        .select("id, kind, display_name, legal_name, visibility_scope, is_active, created_at", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (kind !== "all") q = q.eq("kind", kind);
      if (term.trim()) {
        const t = `%${term.trim()}%`;
        q = q.or(`display_name.ilike.${t},legal_name.ilike.${t}`);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as PersonRow[], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        title="اشخاص"
        description="مدیریت پرونده یکپارچه اشخاص (حقیقی و حقوقی)"
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/persons/import">
                  <Upload className="ml-2 h-4 w-4" /> ایمپورت اکسل
                </Link>
              </Button>
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
                placeholder="جستجو در نام نمایشی یا نام رسمی..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pr-10"
              />
            </div>
            <Select
              value={kind}
              onValueChange={(v) => {
                setKind(v as typeof kind);
                setPage(0);
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

          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری...
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              بارگذاری فهرست با خطا مواجه شد. لطفاً دوباره تلاش کنید.
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">هیچ شخصی ثبت نشده است.</div>
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
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/persons/$personId/edit" params={{ personId: r.id }}>
                            <Pencil className="ml-1 h-3 w-3" /> {canManage ? "ویرایش" : "مشاهده"}
                          </Link>
                        </Button>
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
                onClick={() => setPage((p) => Math.max(0, p - 1))}
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
                onClick={() => setPage((p) => p + 1)}
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
