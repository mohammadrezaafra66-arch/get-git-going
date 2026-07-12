import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search,
  Filter,
  Loader2,
  BellRing,
  ChevronRight,
  ChevronLeft,
  PhoneCall,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/alert-dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber, formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
import {
  StockAlertStatusBadge,
  StockAlertPriorityBadge,
} from "@/components/sales/StockAlertStatusBadge";
import {
  updateStockAlertStatus,
  type StockAlertStatus,
  type StockAlertPriority,
} from "@/lib/sales/stock-alerts";

export const Route = createFileRoute("/_app/sales/stock-alerts")({
  beforeLoad: async () => {
    await requirePermission("sales", "view");
  },
  component: StockAlertsPage,
});

const PAGE_SIZE = 20;

interface AlertRow {
  id: string;
  product_id: string;
  customer_name: string;
  customer_phone: string;
  salesperson_id: string | null;
  note: string | null;
  status: StockAlertStatus;
  priority: StockAlertPriority;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  product?: { id: string; name: string; sku: string | null } | null;
  salesperson?: { id: string; full_name: string | null } | null;
}

function StockAlertsPage() {
  const { user, roles } = useAuth();
  const isPrivileged =
    roles.includes("admin") || roles.includes("manager") || roles.includes("accountant");
  const isSalesOnly = !isPrivileged && roles.includes("sales");

  const [search, setSearch] = useState("");
  const dSearch = useDebounce(search, 350);
  const [status, setStatus] = useState<string>("__all");
  const [priority, setPriority] = useState<string>("__all");
  const [salespersonId, setSalespersonId] = useState<string>("__all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [page, setPage] = useState(1);

  // reset page on filter changes
  useMemo(() => {
    setPage(1);
  }, [dSearch, status, priority, salespersonId, dateFrom, dateTo]);

  // salesperson list (privileged only — sales user can't filter by others)
  const { data: salespeople = [] } = useQuery({
    enabled: isPrivileged,
    queryKey: ["stock-alerts-salespeople"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  // step 1: fetch matching alerts (with optional product-related search applied client-side via product_id pre-filter)
  // For text search across product name / SKU, we look up product_ids first when search is set.
  const term = dSearch.trim();
  const productSearchEnabled = term.length >= 2;

  const productIdsQuery = useQuery({
    enabled: productSearchEnabled,
    queryKey: ["stock-alerts-product-search", term],
    queryFn: async () => {
      const safe = term.replace(/[%_]/g, "");
      const { data: idsData, error: idsErr } = await supabase.rpc("search_product_ids", {
        p_term: safe,
        p_limit: 200,
      });
      if (!idsErr) {
        return (idsData ?? []).map((r: { id: string }) => r.id);
      }
      const { data, error } = await supabase
        .from("products")
        .select("id")
        .or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`)
        .limit(200);
      if (error) throw error;
      return (data ?? []).map((r) => r.id as string);
    },
    staleTime: 30_000,
  });

  const matchedProductIds = productIdsQuery.data ?? [];

  const listQuery = useQuery({
    queryKey: [
      "stock-alerts",
      {
        term,
        status,
        priority,
        salespersonId,
        dateFrom,
        dateTo,
        page,
        matchedProductIds: productSearchEnabled ? matchedProductIds : null,
        userId: user?.id,
        isSalesOnly,
      },
    ],
    enabled: !!user && (!productSearchEnabled || !productIdsQuery.isLoading),
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("stock_alert_requests")
        .select(
          "id, product_id, customer_name, customer_phone, salesperson_id, note, status, priority, requested_at, resolved_at, resolved_by",
          { count: "exact" },
        )
        .order("requested_at", { ascending: false })
        .range(from, to);
      if (isSalesOnly && user) q = q.eq("salesperson_id", user.id);
      if (status !== "__all") q = q.eq("status", status as StockAlertStatus);
      if (priority !== "__all") q = q.eq("priority", priority as StockAlertPriority);
      if (isPrivileged && salespersonId !== "__all") q = q.eq("salesperson_id", salespersonId);
      if (dateFrom) q = q.gte("requested_at", new Date(dateFrom).toISOString());
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        q = q.lte("requested_at", d.toISOString());
      }
      // text search
      if (term.length >= 2) {
        const safe = term.replace(/[%_]/g, "");
        if (matchedProductIds.length > 0) {
          q = q.or(
            `customer_name.ilike.%${safe}%,customer_phone.ilike.%${safe}%,product_id.in.(${matchedProductIds.join(",")})`,
          );
        } else {
          q = q.or(`customer_name.ilike.%${safe}%,customer_phone.ilike.%${safe}%`);
        }
      }
      const { data, error, count } = await q;
      if (error) throw error;
      const baseRows = (data ?? []) as Array<Omit<AlertRow, "product" | "salesperson">>;
      // hydrate products
      const pIds = Array.from(new Set(baseRows.map((r) => r.product_id)));
      let pMap = new Map<string, { id: string; name: string; sku: string | null }>();
      if (pIds.length > 0) {
        const pr = await supabase.from("products").select("id, name, sku").in("id", pIds);
        if (!pr.error) {
          pMap = new Map(
            (pr.data ?? []).map((p) => [
              p.id as string,
              { id: p.id as string, name: p.name as string, sku: (p.sku as string | null) ?? null },
            ]),
          );
        }
      }
      // hydrate salespeople
      const sIds = Array.from(
        new Set(baseRows.map((r) => r.salesperson_id).filter((x): x is string => !!x)),
      );
      let sMap = new Map<string, string | null>();
      if (sIds.length > 0) {
        const sr = await supabase.from("profiles").select("id, full_name").in("id", sIds);
        if (!sr.error)
          sMap = new Map(
            (sr.data ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]),
          );
      }
      const rows: AlertRow[] = baseRows.map((r) => ({
        ...r,
        product: pMap.get(r.product_id) ?? null,
        salesperson: r.salesperson_id
          ? { id: r.salesperson_id, full_name: sMap.get(r.salesperson_id) ?? null }
          : null,
      }));
      return { rows, total: count ?? 0 };
    },
    staleTime: 30_000,
  });

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = listQuery.data?.rows ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="درخواست‌های موجودی"
        description="پیگیری مشتریانی که منتظر موجود شدن کالا هستند"
      />

      {/* filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="h-4 w-4" /> فیلترها
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2 lg:col-span-2">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="نام مشتری، شماره تماس، نام محصول یا SKU"
                className="pr-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="وضعیت" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه وضعیت‌ها</SelectItem>
                <SelectItem value="open">باز</SelectItem>
                <SelectItem value="contacted">تماس گرفته شد</SelectItem>
                <SelectItem value="closed">بسته شد</SelectItem>
                <SelectItem value="canceled">لغو شد</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue placeholder="اولویت" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه اولویت‌ها</SelectItem>
                <SelectItem value="high">بالا</SelectItem>
                <SelectItem value="normal">عادی</SelectItem>
                <SelectItem value="low">کم</SelectItem>
              </SelectContent>
            </Select>
            {isPrivileged && (
              <Select value={salespersonId} onValueChange={setSalespersonId}>
                <SelectTrigger>
                  <SelectValue placeholder="فروشنده" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">همه فروشنده‌ها</SelectItem>
                  {salespeople.map((p: { id: string; full_name: string | null }) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <PersianDatePicker
              value={dateFrom || null}
              onChange={(v) => setDateFrom(v ?? "")}
              placeholder="از تاریخ"
            />
            <PersianDatePicker
              value={dateTo || null}
              onChange={(v) => setDateTo(v ?? "")}
              placeholder="تا تاریخ"
            />
          </div>
        </CardContent>
      </Card>

      {/* content */}
      {listQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="درخواستی برای پیگیری موجودی ثبت نشده است."
          description="با کلیک روی «موجود شد خبرم کن» در جستجوی فروش یا لیست قیمت زنده، اولین درخواست را ثبت کنید."
        />
      ) : (
        <>
          {/* desktop */}
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="p-3 text-right font-medium">محصول</th>
                        <th className="p-3 text-right font-medium">مشتری</th>
                        <th className="p-3 text-right font-medium">فروشنده</th>
                        <th className="p-3 text-right font-medium">اولویت</th>
                        <th className="p-3 text-right font-medium">وضعیت</th>
                        <th className="p-3 text-right font-medium">زمان ثبت</th>
                        <th className="p-3 text-right font-medium">عملیات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((r) => (
                        <AlertRowDesktop
                          key={r.id}
                          row={r}
                          isPrivileged={isPrivileged}
                          isOwner={r.salesperson_id === user?.id}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
          {/* mobile */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <AlertCardMobile
                key={r.id}
                row={r}
                isPrivileged={isPrivileged}
                isOwner={r.salesperson_id === user?.id}
              />
            ))}
          </div>

          {/* pagination */}
          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="text-xs text-muted-foreground">
              صفحه {toFaDigits(page)} از {toFaDigits(totalPages)} — مجموع {formatNumber(total)}{" "}
              درخواست
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronRight className="h-4 w-4" /> قبلی
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                بعدی <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface RowProps {
  row: AlertRow;
  isPrivileged: boolean;
  isOwner: boolean;
}

function useStatusActions(row: AlertRow, isPrivileged: boolean, isOwner: boolean) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (next: StockAlertStatus) => updateStockAlertStatus(row.id, next),
    onSuccess: () => {
      toast.success("وضعیت درخواست به‌روزرسانی شد.");
      qc.invalidateQueries({ queryKey: ["stock-alerts"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "خطا در تغییر وضعیت."),
  });

  const canContact = (isPrivileged || isOwner) && row.status === "open";
  const canClose = isPrivileged && (row.status === "open" || row.status === "contacted");
  const canCancel =
    (isPrivileged || isOwner) && (row.status === "open" || row.status === "contacted");

  return { mutation, canContact, canClose, canCancel };
}

function AlertRowDesktop({ row, isPrivileged, isOwner }: RowProps) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="p-3 align-top">
        <div className="font-medium text-foreground">{row.product?.name ?? "—"}</div>
        <div className="text-[11px] text-muted-foreground font-mono">{row.product?.sku ?? "—"}</div>
      </td>
      <td className="p-3 align-top">
        <div className="font-medium">{row.customer_name}</div>
        <div className="text-xs text-muted-foreground" dir="ltr">
          {row.customer_phone}
        </div>
        {row.note && <div className="mt-1 text-[11px] text-muted-foreground">{row.note}</div>}
      </td>
      <td className="p-3 align-top text-xs text-muted-foreground">
        {row.salesperson?.full_name ?? "—"}
      </td>
      <td className="p-3 align-top">
        <StockAlertPriorityBadge priority={row.priority} />
      </td>
      <td className="p-3 align-top">
        <StockAlertStatusBadge status={row.status} />
        {row.resolved_at && (
          <div className="mt-1 text-[10px] text-muted-foreground">
            {formatDateTimeFa(row.resolved_at)}
          </div>
        )}
      </td>
      <td className="p-3 align-top text-[11px] text-muted-foreground">
        {formatDateTimeFa(row.requested_at)}
      </td>
      <td className="p-3 align-top">
        <RowActions row={row} isPrivileged={isPrivileged} isOwner={isOwner} />
      </td>
    </tr>
  );
}

function AlertCardMobile({ row, isPrivileged, isOwner }: RowProps) {
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{row.product?.name ?? "—"}</div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {row.product?.sku ?? "—"}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StockAlertStatusBadge status={row.status} />
            <StockAlertPriorityBadge priority={row.priority} />
          </div>
        </div>
        <div className="rounded-md border border-border p-2 text-xs">
          <div className="font-medium">{row.customer_name}</div>
          <div className="text-muted-foreground" dir="ltr">
            {row.customer_phone}
          </div>
          {row.note && <div className="mt-1 text-muted-foreground">{row.note}</div>}
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{row.salesperson?.full_name ?? "—"}</span>
          <span>{formatDateTimeFa(row.requested_at)}</span>
        </div>
        <RowActions row={row} isPrivileged={isPrivileged} isOwner={isOwner} />
      </CardContent>
    </Card>
  );
}

function RowActions({ row, isPrivileged, isOwner }: RowProps) {
  const { mutation, canContact, canClose, canCancel } = useStatusActions(
    row,
    isPrivileged,
    isOwner,
  );
  const [confirm, setConfirm] = useState<null | { next: StockAlertStatus; label: string }>(null);

  if (!canContact && !canClose && !canCancel) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canContact && (
        <Button
          size="sm"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => setConfirm({ next: "contacted", label: "تماس گرفته شد" })}
        >
          <PhoneCall className="ml-1 h-3.5 w-3.5" /> تماس گرفته شد
        </Button>
      )}
      {canClose && (
        <Button
          size="sm"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => setConfirm({ next: "closed", label: "بسته شد" })}
        >
          <CheckCircle2 className="ml-1 h-3.5 w-3.5" /> بسته شد
        </Button>
      )}
      {canCancel && (
        <Button
          size="sm"
          variant="ghost"
          disabled={mutation.isPending}
          onClick={() => setConfirm({ next: "canceled", label: "لغو شد" })}
        >
          <XCircle className="ml-1 h-3.5 w-3.5" /> لغو
        </Button>
      )}
      <AlertDialog
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v) setConfirm(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تغییر وضعیت درخواست</AlertDialogTitle>
            <AlertDialogDescription>
              وضعیت درخواست به «{confirm?.label}» تغییر کند؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) {
                  mutation.mutate(confirm.next);
                  setConfirm(null);
                }
              }}
            >
              تأیید
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
