import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Loader2, Check, X, Pencil, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { requirePermission } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";
import { useDebounce } from "@/hooks/use-debounce";
import { normalizeSearchText } from "@/lib/i18n/search-normalizer";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toFaDigits } from "@/lib/i18n/formatters";

const PAGE_SIZE = 20;
type StatusFilter = "all" | "pending" | "active" | "rejected";

export const Route = createFileRoute("/_app/suppliers")({
  beforeLoad: async () => {
    await requirePermission("suppliers", "view");
  },
  component: SuppliersListPage,
});

interface SupplierRow {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  city: string | null;
  trust_level: "low" | "medium" | "high";
  status: "pending" | "active" | "rejected";
}

function trustBadge(level: SupplierRow["trust_level"]) {
  if (level === "high")
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">بالا</Badge>;
  if (level === "low")
    return (
      <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">
        پایین
      </Badge>
    );
  return <Badge className="bg-amber-500 text-white hover:bg-amber-500">متوسط</Badge>;
}

function statusBadge(status: SupplierRow["status"]) {
  if (status === "active")
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">فعال</Badge>;
  if (status === "rejected")
    return (
      <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">
        رد شده
      </Badge>
    );
  return <Badge className="bg-amber-500 text-white hover:bg-amber-500">در انتظار</Badge>;
}

function SuppliersListPage() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  // P1.5b — see SupplierForm: role_permissions is the source of truth.
  const canManage = hasPermissionEx(roles, "suppliers", "update");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [onlyMissingCode, setOnlyMissingCode] = useState(false);
  const [page, setPage] = useState(0);
  const debouncedRaw = useDebounce(search, 350);
  const debouncedNorm = normalizeSearchText(debouncedRaw);
  const debounced = debouncedNorm.length >= 2 ? debouncedNorm : "";

  // How many suppliers still lack an Asan code. Counted live and never written
  // as a literal: the mission file said 15, it was 13 the day after migration
  // 303, and it moves again on every add or removal. `head: true` fetches the
  // count without the rows.
  const { data: missingCodeCount = 0 } = useQuery({
    queryKey: ["suppliers", "missing-asan-code"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("suppliers")
        .select("id", { count: "exact", head: true })
        .is("accounting_code", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers", { q: debounced, status, page, onlyMissingCode }],
    queryFn: async () => {
      let q = supabase
        .from("suppliers")
        .select("id, name, contact_name, phone, city, trust_level, status", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (status !== "all") q = q.eq("status", status);
      if (onlyMissingCode) q = q.is("accounting_code", null);
      if (debounced.trim()) {
        const term = `%${debounced.trim()}%`;
        // W-1 — accounting_code is ADDED to the four criteria that were already
        // here (name, contact person, phone, city); none of them is replaced.
        //
        // Which side of the Asan code this searches, and why: the code is stored
        // on person_identifiers (kind = 'asan_person_code') and MIRRORED onto
        // suppliers.accounting_code by the triggers in migrations 308/309. This
        // list is one PostgREST request over `suppliers`, and the identifier
        // lives on another table reachable only through person_id — PostgREST
        // cannot OR a nested-table filter together with top-level columns in a
        // single `.or()`, so matching the identifier would mean a second round
        // trip or a new RPC for every keystroke. The mirror is the right trade
        // for a list query, and it is the same column the "بدون کد" filter above
        // already uses.
        //
        // The consequence, stated rather than hidden: if the mirror ever drifts
        // from the identifier — migration 310 documents one real supplier that
        // carried a stale test code — this search finds the supplier by the
        // STALE value, while the edit form (which reads the identifier) shows the
        // live one. Checked 2026-09-05: both suppliers that have a code agree.
        //
        // normalizeSearchText has already folded Persian/Arabic digits to ASCII,
        // so a user typing ۶۰۱۷۰۲ matches the ASCII 601702 that is actually
        // stored. That is why this reuses the existing normaliser instead of
        // adding a second one.
        q = q.or(
          `name.ilike.${term},contact_name.ilike.${term},phone.ilike.${term},city.ilike.${term},accounting_code.ilike.${term}`,
        );
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as SupplierRow[], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const setStatusMut = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: "active" | "rejected" }) => {
      const { error } = await supabase
        .from("suppliers")
        .update({ status: newStatus } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.newStatus === "active" ? "تأمین‌کننده تأیید شد" : "تأمین‌کننده رد شد");
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`عملیات ناموفق بود: ${msg}`);
    },
  });

  const headerActions = useMemo(
    () =>
      canManage ? (
        <Button asChild>
          <Link to="/suppliers/$supplierId" params={{ supplierId: "new" }}>
            <Plus className="ml-2 h-4 w-4" /> تأمین‌کننده جدید
          </Link>
        </Button>
      ) : null,
    [canManage],
  );

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        title="تأمین‌کنندگان"
        description="مدیریت لیست تأمین‌کنندگان، تأیید و سطح اعتماد"
        actions={headerActions}
      />

      {/* P2.3 — the count is live. When every supplier has a code it reaches 0
          and the banner disappears on its own, with nothing to remember to
          remove. Clicking filters this same list rather than navigating away. */}
      {missingCodeCount > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="leading-6">
              <span className="font-medium">
                {toFaDigits(missingCodeCount)} تأمین‌کننده هنوز کد آسان ندارند
              </span>
              <p className="text-xs text-muted-foreground">
                تا وقتی کد آسان ثبت نشود، خروجی آسانِ خرید برای این تأمین‌کننده‌ها کار نمی‌کند.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setOnlyMissingCode((v) => !v);
              setPage(0);
            }}
          >
            {onlyMissingCode ? "نمایش همه" : "نمایش بدون کد"}
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="جستجو در نام، شخص تماس، تلفن، شهر یا کد آسان..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pr-10"
              />
            </div>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as StatusFilter);
                setPage(0);
              }}
            >
              <SelectTrigger className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                <SelectItem value="pending">در انتظار تأیید</SelectItem>
                <SelectItem value="active">فعال</SelectItem>
                <SelectItem value="rejected">رد شده</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری...
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">موردی یافت نشد.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام</TableHead>
                    <TableHead>شخص تماس</TableHead>
                    <TableHead>تلفن</TableHead>
                    <TableHead>شهر</TableHead>
                    <TableHead>اعتماد</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.contact_name ?? "—"}
                      </TableCell>
                      <TableCell dir="ltr" className="text-muted-foreground">
                        {r.phone ? toFaDigits(r.phone) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.city ?? "—"}</TableCell>
                      <TableCell>{trustBadge(r.trust_level)}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Button variant="outline" size="sm" asChild>
                            <Link to="/suppliers/$supplierId" params={{ supplierId: r.id }}>
                              <Pencil className="ml-1 h-3 w-3" /> {canManage ? "ویرایش" : "مشاهده"}
                            </Link>
                          </Button>
                          {canManage && r.status === "pending" && (
                            <>
                              <ConfirmAction
                                title="تأیید تأمین‌کننده"
                                description={`آیا از تأیید «${r.name}» اطمینان دارید؟`}
                                actionLabel="تأیید"
                                onConfirm={() =>
                                  setStatusMut.mutate({ id: r.id, newStatus: "active" })
                                }
                                trigger={
                                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                                    <Check className="ml-1 h-3 w-3" /> تأیید
                                  </Button>
                                }
                              />
                              <ConfirmAction
                                title="رد تأمین‌کننده"
                                description={`آیا از رد «${r.name}» اطمینان دارید؟`}
                                actionLabel="رد"
                                onConfirm={() =>
                                  setStatusMut.mutate({ id: r.id, newStatus: "rejected" })
                                }
                                trigger={
                                  <Button size="sm" variant="destructive">
                                    <X className="ml-1 h-3 w-3" /> رد
                                  </Button>
                                }
                              />
                            </>
                          )}
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

function ConfirmAction({
  title,
  description,
  actionLabel,
  onConfirm,
  trigger,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void;
  trigger: React.ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>انصراف</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
