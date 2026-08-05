import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Loader2, Pencil, Eye, Upload } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { useDebounce } from "@/hooks/use-debounce";
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

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | PersonKind>("all");
  const [page, setPage] = useState(0);
  const debouncedRaw = useDebounce(search, 350);
  // Pass the trimmed raw query to the RPC — DB owns digit/phone/fa normalization.
  // Do not strip spaces here (normalizeSearchText would); phones with spaces still work
  // because normalize_identifier digits-only, and names use normalize_fa_text.
  const term = debouncedRaw.trim();

  const { data, isLoading, error } = useQuery({
    queryKey: ["persons", { q: term, kind, page }],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_visible_persons", {
        p_query: term,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
        p_kind: kind === "all" ? null : kind,
      });
      if (error) throw error;
      const rows = (data ?? []) as PersonRow[];
      const count = rows.length > 0 ? Number(rows[0].total_count ?? rows.length) : 0;
      return { rows, count };
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
                placeholder="جستجو با نام، نام دیگر، موبایل، کد ملی یا کد آسان"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pr-10"
              />
              {search.trim() ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute left-1 top-1/2 h-7 -translate-y-1/2 px-2 text-xs"
                  onClick={() => {
                    setSearch("");
                    setPage(0);
                  }}
                >
                  پاک کردن
                </Button>
              ) : null}
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
