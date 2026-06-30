import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  ArrowRight,
  Loader2,
  Pencil,
  Power,
  ChevronRight,
  ChevronLeft,
  X,
} from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { useDebounce } from "@/hooks/use-debounce";
import { pricingRuleSchema, type PricingRuleFormValues } from "@/lib/pricing/schemas";
import { fetchSettlementTypes, fetchSalePriceTypes } from "@/lib/pricing/queries";
import { formatNumber } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/pricing/rules")({
  beforeLoad: async () => {
    await requirePermission("pricing", "view");
  },
  component: PricingRulesPage,
});

const PAGE_SIZE = 20;

interface PRule {
  id: string;
  rule_name: string | null;
  name: string;
  margin_type: "fixed" | "percent" | "mixed";
  margin_value: number | null;
  fixed_margin_value: number | null;
  settlement_type_id: string | null;
  sale_price_type_id: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  is_system_default: boolean;
}

type Filters = {
  search: string;
  settlement: string;
  saleType: string;
  status: "all" | "active" | "inactive";
};

const DEFAULT_FILTERS: Filters = { search: "", settlement: "all", saleType: "all", status: "all" };

function PricingRulesPage() {
  const { roles } = useAuth();
  const canWrite = hasAnyRole(roles, ["admin", "manager"]);
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PRule | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const search = useDebounce(filters.search, 350);

  const settlementsQ = useQuery({
    queryKey: ["settlement-types"],
    queryFn: () => fetchSettlementTypes(true),
    staleTime: 60_000,
  });
  const saleTypesQ = useQuery({
    queryKey: ["sale-price-types", "active"],
    queryFn: () => fetchSalePriceTypes(true),
    staleTime: 60_000,
  });

  const settlementMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of settlementsQ.data ?? []) m[s.id] = s.title;
    return m;
  }, [settlementsQ.data]);
  const saleTypeMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of saleTypesQ.data ?? []) m[s.id] = s.title;
    return m;
  }, [saleTypesQ.data]);

  const listQ = useQuery({
    queryKey: [
      "pricing-rules",
      "list",
      search,
      filters.settlement,
      filters.saleType,
      filters.status,
      page,
    ],
    queryFn: async () => {
      let q = supabase
        .from("pricing_rules")
        .select(
          "id, rule_name, name, margin_type, margin_value, fixed_margin_value, settlement_type_id, sale_price_type_id, priority, is_active, created_at, is_system_default",
          { count: "exact" },
        )
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (search.trim()) {
        const safe = search.trim().replace(/[%_]/g, "");
        q = q.or(`rule_name.ilike.%${safe}%,name.ilike.%${safe}%`);
      }
      if (filters.settlement !== "all") q = q.eq("settlement_type_id", filters.settlement);
      if (filters.saleType !== "all") q = q.eq("sale_price_type_id", filters.saleType);
      if (filters.status === "active") q = q.eq("is_active", true);
      if (filters.status === "inactive") q = q.eq("is_active", false);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as PRule[], total: count ?? 0 };
    },
  });

  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pricing-rules"] });
    qc.invalidateQueries({ queryKey: ["pricing-overview"] });
  };

  const disable = async (r: PRule) => {
    if (!canWrite) return;
    if (!confirm(`قانون "${r.rule_name ?? r.name}" غیرفعال شود؟`)) return;
    const { error } = await supabase
      .from("pricing_rules")
      .update({ is_active: false })
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("قانون غیرفعال شد");
    refresh();
  };

  const enable = async (r: PRule) => {
    if (!canWrite) return;
    const { error } = await supabase
      .from("pricing_rules")
      .update({ is_active: true })
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("قانون فعال شد");
    refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="قوانین قیمت‌گذاری"
        description="تعریف نحوه محاسبه قیمت فروش بر مبنای حاشیه سود، نوع تسویه و قانون حمل"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/pricing">
                <ArrowRight className="ms-1 h-4 w-4" />
                بازگشت
              </Link>
            </Button>
            {canWrite && (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="ms-1 h-4 w-4" />
                قانون جدید
              </Button>
            )}
          </>
        }
      />

      {/* فیلترها */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Label className="text-xs text-muted-foreground">جستجو در نام قانون</Label>
            <Input
              value={filters.search}
              onChange={(e) => {
                setFilters((f) => ({ ...f, search: e.target.value }));
                setPage(0);
              }}
              placeholder="نام قانون..."
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">نوع تسویه</Label>
            <Select
              value={filters.settlement}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, settlement: v }));
                setPage(0);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                {(settlementsQ.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">نوع قیمت فروش</Label>
            <Select
              value={filters.saleType}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, saleType: v }));
                setPage(0);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                {(saleTypesQ.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">وضعیت</Label>
            <Select
              value={filters.status}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, status: v as Filters["status"] }));
                setPage(0);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                <SelectItem value="active">فعال</SelectItem>
                <SelectItem value="inactive">غیرفعال</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-4">
            <span className="text-xs text-muted-foreground">
              مجموع: {formatNumber(total)} قانون
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setPage(0);
              }}
            >
              <X className="ms-1 h-3 w-3" />
              پاک‌سازی فیلترها
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* لیست */}
      <Card>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              قانونی ثبت نشده است.
            </div>
          ) : (
            <>
              {/* موبایل */}
              <ul className="divide-y md:hidden">
                {rows.map((r) => (
                  <li key={r.id} className="space-y-1.5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1 truncate font-semibold">
                          <span className="truncate">{r.rule_name ?? r.name}</span>
                          {r.is_system_default && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-700"
                            >
                              قانون پیش‌فرض سیستم
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          اولویت: {formatNumber(r.priority)}
                          {r.settlement_type_id && settlementMap[r.settlement_type_id]
                            ? ` · تسویه: ${settlementMap[r.settlement_type_id]}`
                            : ""}
                          {r.sale_price_type_id && saleTypeMap[r.sale_price_type_id]
                            ? ` · قیمت: ${saleTypeMap[r.sale_price_type_id]}`
                            : ""}
                        </div>
                      </div>
                      {r.is_active ? <Badge>فعال</Badge> : <Badge variant="outline">غیرفعال</Badge>}
                    </div>
                    <div className="text-sm">
                      <span className="text-xs text-muted-foreground">سود: </span>
                      <span className="font-semibold">{formatMargin(r)}</span>
                    </div>
                    {canWrite && (
                      <div className="flex gap-1 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setEditing(r);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="ms-1 h-3 w-3" />
                          ویرایش
                        </Button>
                        {r.is_active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => disable(r)}
                          >
                            <Power className="ms-1 h-3 w-3" />
                            غیرفعال‌سازی
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => enable(r)}
                          >
                            <Power className="ms-1 h-3 w-3" />
                            فعال‌سازی
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {/* دسکتاپ */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">نام قانون</th>
                      <th className="p-3 font-medium">نوع قیمت فروش</th>
                      <th className="p-3 font-medium">نوع تسویه</th>
                      <th className="p-3 font-medium">حاشیه سود</th>
                      <th className="p-3 font-medium">اولویت</th>
                      <th className="p-3 font-medium">وضعیت</th>
                      <th className="p-3 font-medium">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">
                          <div className="flex flex-wrap items-center gap-1">
                            <span>{r.rule_name ?? r.name}</span>
                            {r.is_system_default && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-700"
                              >
                                قانون پیش‌فرض سیستم
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {r.sale_price_type_id ? (saleTypeMap[r.sale_price_type_id] ?? "—") : "—"}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {r.settlement_type_id
                            ? (settlementMap[r.settlement_type_id] ?? "—")
                            : "—"}
                        </td>
                        <td className="p-3 font-semibold">{formatMargin(r)}</td>
                        <td className="p-3 text-xs">{formatNumber(r.priority)}</td>
                        <td className="p-3">
                          {r.is_active ? (
                            <Badge>فعال</Badge>
                          ) : (
                            <Badge variant="outline">غیرفعال</Badge>
                          )}
                        </td>
                        <td className="p-3">
                          {canWrite && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  setEditing(r);
                                  setOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {r.is_active ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => disable(r)}
                                >
                                  <Power className="h-4 w-4 text-destructive" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => enable(r)}
                                >
                                  <Power className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t p-3 text-xs">
                  <span className="text-muted-foreground">
                    صفحه {formatNumber(page + 1)} از {formatNumber(totalPages)}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <RuleDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        settlements={settlementsQ.data ?? []}
        saleTypes={saleTypesQ.data ?? []}
        onSaved={refresh}
      />
    </div>
  );
}

function formatMargin(r: PRule): string {
  const v = Number(r.margin_value ?? 0);
  if (r.margin_type === "percent") return `%${formatNumber(v)}`;
  if (r.margin_type === "fixed") return `${formatNumber(v)} ت`;
  // mixed
  const fx = Number(r.fixed_margin_value ?? 0);
  return `%${formatNumber(v)} + ${formatNumber(fx)} ت`;
}

function RuleDialog({
  open,
  onOpenChange,
  editing,
  settlements,
  saleTypes,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: PRule | null;
  settlements: { id: string; title: string }[];
  saleTypes: { id: string; title: string }[];
  onSaved: () => void;
}) {
  const emptyValues: PricingRuleFormValues = {
    rule_name: "",
    product_type: null,
    category_id: null,
    brand_id: null,
    min_purchase_price_toman: null,
    max_purchase_price_toman: null,
    settlement_type_id: null,
    sale_price_type_id: null,
    margin_type: "percent",
    margin_value: 0,
    fixed_margin_value: null,
    priority: 100,
    is_active: true,
  };
  const [values, setValues] = useState<PricingRuleFormValues>(emptyValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleOpenChange = (v: boolean) => {
    if (v) {
      setValues(
        editing
          ? {
              rule_name: editing.rule_name ?? editing.name,
              product_type: null,
              category_id: null,
              brand_id: null,
              min_purchase_price_toman: null,
              max_purchase_price_toman: null,
              settlement_type_id: editing.settlement_type_id,
              sale_price_type_id: editing.sale_price_type_id,
              margin_type: editing.margin_type,
              margin_value: Number(editing.margin_value ?? 0),
              fixed_margin_value:
                editing.fixed_margin_value != null ? Number(editing.fixed_margin_value) : null,
              priority: editing.priority,
              is_active: editing.is_active,
            }
          : emptyValues,
      );
      setErrors({});
    }
    onOpenChange(v);
  };

  const submit = async () => {
    const parsed = pricingRuleSchema.safeParse(values);
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[i.path.join(".")] = i.message;
      setErrors(f);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const d = parsed.data;
      const payload = {
        rule_name: d.rule_name,
        name: d.rule_name, // ستون legacy NOT NULL
        settlement_type_id: d.settlement_type_id,
        sale_price_type_id: d.sale_price_type_id,
        margin_type: d.margin_type,
        margin_value: d.margin_value,
        fixed_margin_value: d.margin_type === "mixed" ? d.fixed_margin_value : null,
        priority: d.priority,
        is_active: d.is_active,
      };
      if (editing) {
        const { error } = await supabase.from("pricing_rules").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("قانون به‌روزرسانی شد");
      } else {
        const { error } = await supabase.from("pricing_rules").insert(payload);
        if (error) throw error;
        toast.success("قانون ثبت شد");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "ویرایش قانون قیمت‌گذاری" : "قانون قیمت‌گذاری جدید"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>نام قانون *</Label>
            <Input
              value={values.rule_name}
              onChange={(e) => setValues((s) => ({ ...s, rule_name: e.target.value }))}
            />
            {errors.rule_name && (
              <p className="mt-1 text-xs text-destructive">{errors.rule_name}</p>
            )}
          </div>

          <div>
            <Label>نوع تسویه</Label>
            <Select
              value={values.settlement_type_id ?? "none"}
              onValueChange={(v) =>
                setValues((s) => ({ ...s, settlement_type_id: v === "none" ? null : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {settlements.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>نوع قیمت فروش</Label>
            <Select
              value={values.sale_price_type_id ?? "none"}
              onValueChange={(v) =>
                setValues((s) => ({ ...s, sale_price_type_id: v === "none" ? null : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {saleTypes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              مشخص می‌کند این قانون برای کدام نوع قیمت فروش (نقدی/چکی/همکار/...) است.
            </p>
          </div>

          <div>
            <Label>نوع حاشیه سود *</Label>
            <Select
              value={values.margin_type}
              onValueChange={(v) =>
                setValues((s) => ({ ...s, margin_type: v as "fixed" | "percent" | "mixed" }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">درصدی</SelectItem>
                <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                <SelectItem value="mixed">ترکیبی</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{values.margin_type === "fixed" ? "مبلغ سود (تومان) *" : "درصد سود *"}</Label>
            <Input
              type="number"
              inputMode="numeric"
              dir="ltr"
              value={values.margin_value || ""}
              onChange={(e) => setValues((s) => ({ ...s, margin_value: Number(e.target.value) }))}
            />
            {errors.margin_value && (
              <p className="mt-1 text-xs text-destructive">{errors.margin_value}</p>
            )}
          </div>

          {values.margin_type === "mixed" && (
            <div className="sm:col-span-2">
              <Label>مبلغ ثابت تکمیلی (تومان)</Label>
              <Input
                type="number"
                inputMode="numeric"
                dir="ltr"
                value={values.fixed_margin_value ?? ""}
                onChange={(e) =>
                  setValues((s) => ({
                    ...s,
                    fixed_margin_value: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
              />
            </div>
          )}

          <div>
            <Label>اولویت</Label>
            <Input
              type="number"
              dir="ltr"
              value={values.priority}
              onChange={(e) => setValues((s) => ({ ...s, priority: Number(e.target.value) }))}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">عدد کوچکتر = اولویت بالاتر</p>
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch
              checked={values.is_active}
              onCheckedChange={(v) => setValues((s) => ({ ...s, is_active: v }))}
            />
            <Label>فعال</Label>
          </div>

          <p className="rounded bg-muted/50 p-2 text-[11px] text-muted-foreground sm:col-span-2">
            گرد کردن قیمت فروش به‌صورت متمرکز توسط موتور قیمت‌گذاری انجام می‌شود (زیر ۱م → ۱۰٬۰۰۰ ·
            ۱م تا ۱۰م → ۵۰٬۰۰۰ · بالای ۱۰م → ۱۰۰٬۰۰۰).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
