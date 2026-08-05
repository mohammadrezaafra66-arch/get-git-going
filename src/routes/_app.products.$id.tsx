import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Pencil, ArrowRight, UserPlus, Trash2, Loader2, History } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductFieldHistoryDialog } from "@/components/products/ProductFieldHistoryDialog";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermission } from "@/lib/rbac/roles";
import {
  PRODUCT_TYPE_LABELS,
  BASE_CURRENCY_LABELS,
  STOCK_STATUS_LABELS,
  STOCK_STATUS_VARIANTS,
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUS_VARIANTS,
} from "@/lib/products/constants";
import { formatDateFa, formatNumber } from "@/lib/i18n/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import { OwnerAssignDialog } from "@/components/products/OwnerAssignDialog";
import { ProductSupplierManager } from "@/shared/components/ProductSupplierManager";
import { ProductStockByWarehouse } from "@/components/warehouses/ProductStockByWarehouse";
import { ProductPublishPricesCard } from "@/components/products/ProductPublishPricesCard";
import { ProductForm } from "@/components/products/ProductForm";
import { RecentPurchaseBadge } from "@/components/products/RecentPurchaseBadge";
import { AdCopyGenerator } from "@/components/products/AdCopyGenerator";
import type { ProductFormValues } from "@/lib/products/schemas";
import {
  fetchProductDynamicValues,
  saveProductDynamicValues,
  deleteAllDynamicValuesForProduct,
} from "@/lib/products/category-attrs";
import {
  diffProductFields,
  diffLabels,
  diffDynamicValues,
  logProductUpdate,
  type ProductAuditDiff,
} from "@/lib/products/audit";

export const Route = createFileRoute("/_app/products/$id")({
  beforeLoad: async () => {
    await requirePermission("products", "view");
  },
  validateSearch: (search: Record<string, unknown>): { edit?: 1 } => {
    const edit = search.edit === 1 || search.edit === "1" || search.edit === true ? 1 : undefined;
    return edit ? { edit } : {};
  },
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles, user } = useAuth();
  const canUpdate = hasPermission(roles, "products", "update");
  const canDelete = hasPermission(roles, "products", "delete");
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState(!!search.edit && canUpdate);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  // وقتی «ذخیره و خروج» انتخاب شود، بعد از پایان موفق ذخیره این callback اجرا می‌شود.
  const pendingProceedRef = useRef<(() => void) | null>(null);

  // Warn before tab close/reload while editing if an unsaved draft exists.
  useEffect(() => {
    if (!editMode) return;
    const handler = (e: BeforeUnloadEvent) => {
      try {
        const raw = window.sessionStorage.getItem(`afrakala_product_draft_${id}`);
        if (!raw) return;
      } catch {
        return;
      }
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editMode, id]);

  // SPA navigation guard: فقط در حالت ویرایش با تغییرات ذخیره‌نشده.
  const blocker = useBlocker({
    shouldBlockFn: () => editMode && isDirty,
    withResolver: true,
    enableBeforeUnload: false,
  });

  const clearDraft = () => {
    try {
      window.sessionStorage.removeItem(`afrakala_product_draft_${id}`);
    } catch {
      /* ignore */
    }
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data: p, error } = await supabase
        .from("products")
        .select(
          `
          id, name, sku, description, technical_notes, unit, color, capacity, model, primary_spec,
          product_type, base_currency, stock_status, status, barcode, accounting_code, torob_url, promotion_weight,
          created_at, updated_at,
          brand:brands(id,name), category:categories(id,name,primary_spec_label),
          product_label_links(label:product_labels(id,title,color))
        `,
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!p) return null;

      const { data: owners } = await supabase
        .from("product_owner_assignments")
        .select("user_id, created_at")
        .eq("product_id", id);

      const userIds = (owners ?? []).map((o) => o.user_id);
      let profiles: { id: string; full_name: string | null }[] = [];
      if (userIds.length > 0) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        profiles = prof ?? [];
      }
      return {
        product: p,
        owners: (owners ?? []).map((o) => ({
          user_id: o.user_id,
          full_name: profiles.find((x) => x.id === o.user_id)?.full_name ?? "—",
          created_at: o.created_at,
        })),
      };
    },
  });

  const editDataQ = useQuery({
    queryKey: ["product-edit-extras", id],
    enabled: editMode,
    queryFn: async () => {
      const { data: links } = await supabase
        .from("product_label_links")
        .select("label_id")
        .eq("product_id", id);
      const dynamicValues = await fetchProductDynamicValues(id);
      return { labelIds: (links ?? []).map((l) => l.label_id), dynamicValues };
    },
  });

  const dynamicQ = useQuery({
    queryKey: ["product-dynamic-attrs", id],
    queryFn: async () => {
      const { data: vals, error } = await supabase
        .from("product_category_attribute_values")
        .select(
          "value, category_attribute_id, def:category_product_attributes(id, label_fa, sort_order, is_active)",
        )
        .eq("product_id", id);
      if (error) throw error;
      const rows = (vals ?? [])
        .map((r: any) => ({
          id: r.def?.id ?? r.category_attribute_id,
          label: r.def?.label_fa ?? "—",
          sort_order: r.def?.sort_order ?? 0,
          value: r.value ?? "",
          is_active: r.def?.is_active ?? true,
        }))
        .filter((r) => r.value !== "");
      rows.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "fa"));
      return rows;
    },
  });

  const adjustedPriceQ = useQuery({
    queryKey: ["product-adjusted-price", id],
    enabled: !editMode,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("calculate_adjusted_price", {
        _product_id: id,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  if (isLoading)
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
    );
  if (!data?.product)
    return <div className="py-10 text-center text-sm text-muted-foreground">محصول یافت نشد.</div>;

  const p = data.product as any;
  const labels = (p.product_label_links ?? []).map((x: any) => x.label).filter(Boolean);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      toast.success("محصول حذف شد");
      navigate({ to: "/products" });
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در حذف محصول");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleSave = async (
    v: ProductFormValues,
    dynamic: { values: Record<string, string>; defs: any[]; categoryChanged: boolean },
  ) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({
          name: v.name,
          brand_id: v.brand_id || null,
          category_id: v.category_id || null,
          product_type: v.product_type,
          base_currency: v.base_currency,
          stock_status: v.stock_status,
          status: v.status,
          unit: v.unit || null,
          color: v.color || null,
          capacity: v.capacity || null,
          model: v.model || null,
          primary_spec: v.primary_spec || null,
          description: v.description || null,
          technical_notes: v.technical_notes || null,
          barcode: v.barcode?.trim() ? v.barcode.trim() : null,
          // کد کالای آسان — پاک‌کردن فیلد یعنی NULL، نه رشتهٔ خالی (تریگر ۲۸۹ هم همین را
          // تضمین می‌کند تا PATCH مستقیم PostgREST از قاعده جا نماند).
          accounting_code: v.accounting_code?.trim() ? v.accounting_code.trim() : null,
          torob_url: v.torob_url?.trim() ? v.torob_url.trim() : null,
          // Item 166 — standalone promotion weight (1 = neutral).
          promotion_weight: v.promotion_weight ?? 1,
        })
        .eq("id", id);
      if (error) throw error;

      const existingIds = new Set(editDataQ.data?.labelIds ?? []);
      const nextIds = new Set(v.label_ids);
      const toAdd = [...nextIds].filter((x) => !existingIds.has(x));
      const toRemove = [...existingIds].filter((x) => !nextIds.has(x));
      if (toAdd.length > 0) {
        const rows = toAdd.map((label_id) => ({ product_id: id, label_id }));
        const { error: addErr } = await supabase.from("product_label_links").insert(rows);
        if (addErr) throw addErr;
      }
      if (toRemove.length > 0) {
        const { error: rmErr } = await supabase
          .from("product_label_links")
          .delete()
          .eq("product_id", id)
          .in("label_id", toRemove);
        if (rmErr) throw rmErr;
      }

      if (dynamic.categoryChanged) await deleteAllDynamicValuesForProduct(id);
      if (v.category_id && dynamic.defs.length > 0) {
        await saveProductDynamicValues(id, dynamic.defs, dynamic.values);
      } else if (!v.category_id) {
        await deleteAllDynamicValuesForProduct(id);
      }

      // Build audit diff and log it
      try {
        if (user?.id) {
          const prevValues = {
            name: p.name,
            brand_id: p.brand?.id ?? null,
            category_id: p.category?.id ?? null,
            product_type: p.product_type,
            base_currency: p.base_currency,
            stock_status: p.stock_status,
            status: p.status,
            unit: p.unit ?? null,
            color: p.color ?? null,
            capacity: p.capacity ?? null,
            model: p.model ?? null,
            primary_spec: p.primary_spec ?? null,
            description: p.description ?? null,
            technical_notes: p.technical_notes ?? null,
            accounting_code: p.accounting_code ?? null,
            torob_url: p.torob_url ?? null,
          };
          const nextValues = {
            name: v.name,
            brand_id: v.brand_id || null,
            category_id: v.category_id || null,
            product_type: v.product_type,
            base_currency: v.base_currency,
            stock_status: v.stock_status,
            status: v.status,
            unit: v.unit || null,
            color: v.color || null,
            capacity: v.capacity || null,
            model: v.model || null,
            primary_spec: v.primary_spec || null,
            description: v.description || null,
            technical_notes: v.technical_notes || null,
            accounting_code: v.accounting_code?.trim() || null,
            torob_url: v.torob_url?.trim() || null,
          };
          // brand/category name lookup
          const brandIds = [prevValues.brand_id, nextValues.brand_id].filter(Boolean) as string[];
          const catIds = [prevValues.category_id, nextValues.category_id].filter(
            Boolean,
          ) as string[];
          const [brandsRes, catsRes] = await Promise.all([
            brandIds.length
              ? supabase.from("brands").select("id,name").in("id", brandIds)
              : Promise.resolve({ data: [] as any[] }),
            catIds.length
              ? supabase.from("categories").select("id,name").in("id", catIds)
              : Promise.resolve({ data: [] as any[] }),
          ]);
          const brandMap: Record<string, string> = {};
          (brandsRes.data ?? []).forEach((b: any) => {
            brandMap[b.id] = b.name;
          });
          const catMap: Record<string, string> = {};
          (catsRes.data ?? []).forEach((c: any) => {
            catMap[c.id] = c.name;
          });

          const changes = diffProductFields(prevValues, nextValues, brandMap, catMap);

          // labels diff
          const prevLabelIds = editDataQ.data?.labelIds ?? [];
          const labelTitleMap: Record<string, string> = {};
          (p.product_label_links ?? []).forEach((x: any) => {
            if (x.label) labelTitleMap[x.label.id] = x.label.title;
          });
          const newLabelIds = v.label_ids.filter((id) => !labelTitleMap[id]);
          if (newLabelIds.length > 0) {
            const { data: lbls } = await supabase
              .from("product_labels")
              .select("id,title")
              .in("id", newLabelIds);
            (lbls ?? []).forEach((l: any) => {
              labelTitleMap[l.id] = l.title;
            });
          }
          const labels = diffLabels(prevLabelIds, v.label_ids, labelTitleMap);

          // dynamic attribute diff
          const prevDyn = editDataQ.data?.dynamicValues ?? {};
          const nextDyn = dynamic.values ?? {};
          const attributes = diffDynamicValues(prevDyn, nextDyn, dynamic.defs ?? []);

          const fullDiff: ProductAuditDiff = {
            changes: Object.keys(changes).length ? changes : undefined,
            labels: labels.added.length || labels.removed.length ? labels : undefined,
            attributes: Object.keys(attributes).length ? attributes : undefined,
          };
          await logProductUpdate(id, user.id, fullDiff);
        }
      } catch (logErr) {
        console.warn("[product-history] log failed", logErr);
      }

      toast.success("تغییرات ذخیره شد");
      clearDraft();
      setIsDirty(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["product", id] }),
        queryClient.invalidateQueries({ queryKey: ["product-edit-extras", id] }),
        queryClient.invalidateQueries({ queryKey: ["product-dynamic-attrs", id] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["product-history", id] }),
      ]);
      setEditMode(false);
      // اگر navigation در حال انتظار بوده، بعد از ذخیره موفق ادامه بده.
      if (pendingProceedRef.current) {
        const proceed = pendingProceedRef.current;
        pendingProceedRef.current = null;
        proceed();
      }
    } catch (e: any) {
      const code = e?.code ?? "";
      const msg = String(e?.message ?? "");
      if (code === "23505" && /products_dedup_key_unique/i.test(msg)) {
        toast.error("محصول تکراری است: ترکیب «برند + دسته + مدل + رنگ + ظرفیت» قبلاً ثبت شده است.");
      } else if (code === "23505" && /products_accounting_code_unique/i.test(msg)) {
        toast.error("این «کد کالا در آسان» قبلاً برای محصول دیگری ثبت شده است.");
      } else if (code === "23514" && /products_torob_url_http_chk/i.test(msg)) {
        toast.error("لینک ترب نامعتبر است؛ باید با http:// یا https:// شروع شود.");
      } else if (code === "23505" || /duplicate key|sku/i.test(msg)) {
        toast.error("محصولی با این مشخصات (SKU) قبلاً ثبت شده است.");
      } else {
        toast.error(msg || "خطا در ذخیره");
      }
      // در صورت خطا، navigation در انتظار را لغو می‌کنیم تا کاربر در صفحه بماند.
      pendingProceedRef.current = null;
    } finally {
      setSaving(false);
    }
  };

  const initialFormValues: Partial<ProductFormValues> = {
    name: p.name,
    brand_id: p.brand?.id ?? null,
    category_id: p.category?.id ?? null,
    product_type: p.product_type,
    base_currency: p.base_currency,
    stock_status: p.stock_status,
    status: p.status,
    unit: p.unit ?? "",
    color: p.color ?? "",
    capacity: p.capacity ?? "",
    model: p.model ?? "",
    primary_spec: p.primary_spec ?? "",
    description: p.description ?? "",
    technical_notes: p.technical_notes ?? "",
    barcode: p.barcode ?? "",
    accounting_code: p.accounting_code ?? "",
    torob_url: p.torob_url ?? "",
    promotion_weight: Number((p as { promotion_weight?: number | null }).promotion_weight ?? 1),
    label_ids: editDataQ.data?.labelIds ?? labels.map((l: any) => l.id),
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={p.name}
        description={p.sku ? `SKU: ${p.sku}` : "بدون SKU"}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/products">
                <ArrowRight className="ms-1 h-4 w-4" />
                بازگشت
              </Link>
            </Button>
            {canUpdate && !editMode && (
              <Button size="sm" onClick={() => setEditMode(true)}>
                <Pencil className="ms-1 h-4 w-4" />
                ویرایش
              </Button>
            )}
            {canDelete && (
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="ms-1 h-4 w-4" />
                حذف
              </Button>
            )}
          </>
        }
      />
      <div>
        <RecentPurchaseBadge productId={p.id} />
      </div>

      {editMode ? (
        editDataQ.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            در حال بارگذاری فرم...
          </div>
        ) : (
          <Card>
            <CardContent className="p-4">
              <ProductForm
                initial={initialFormValues}
                existingSku={p.sku ?? null}
                isEdit
                productId={p.id}
                initialDynamicValues={editDataQ.data?.dynamicValues ?? {}}
                initialCategoryId={p.category?.id ?? null}
                onSubmit={handleSave}
                loading={saving}
                submitLabel="ذخیره تغییرات"
                onCancel={() => {
                  setEditMode(false);
                  setIsDirty(false);
                }}
                onDirtyChange={setIsDirty}
                formRef={formRef}
              />
            </CardContent>
          </Card>
        )
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-3 border-primary/30 bg-primary/5">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="text-sm text-muted-foreground">قیمت پیشنهادی بر اساس مدت نگهداری</div>
              <div className="text-base font-semibold tabular-nums">
                {adjustedPriceQ.isLoading ? (
                  <Skeleton className="h-5 w-28" />
                ) : adjustedPriceQ.data && adjustedPriceQ.data > 0 ? (
                  `${formatNumber(adjustedPriceQ.data)} تومان`
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardContent className="grid gap-3 p-4 md:grid-cols-2">
              <Info label="برند" value={p.brand?.name ?? "—"} />
              <Info label="دسته" value={p.category?.name ?? "—"} />
              <Info label="SKU" value={p.sku ?? "—"} />
              <Info label="کد کالا در آسان" value={p.accounting_code ?? "—"} />
              <Info label="لینک ترب">
                {p.torob_url ? (
                  <a
                    href={p.torob_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-primary underline-offset-2 hover:underline"
                    dir="ltr"
                  >
                    {p.torob_url}
                  </a>
                ) : (
                  "—"
                )}
              </Info>
              <Info label="رنگ" value={p.color ?? "—"} />
              <Info label="ظرفیت" value={p.capacity ?? "—"} />
              <Info label="مدل" value={p.model ?? "—"} />
              {(() => {
                const lbl = ((p.category as any)?.primary_spec_label ?? "").toString().trim();
                // اگر برچسب با یکی از فیلدهای استاندارد یکی است، ردیف تکراری را نشان نده
                if (lbl === "ظرفیت" || lbl === "رنگ" || lbl === "مدل") return null;
                return <Info label={lbl || "مشخصه اصلی"} value={p.primary_spec ?? "—"} />;
              })()}
              <Info
                label="نوع"
                value={PRODUCT_TYPE_LABELS[p.product_type as keyof typeof PRODUCT_TYPE_LABELS]}
              />
              <Info
                label="ارز مبنا"
                value={
                  (BASE_CURRENCY_LABELS as Record<string, string>)[p.base_currency as string] ??
                  String(p.base_currency).toUpperCase()
                }
              />
              <Info label="وضعیت موجودی">
                <Badge
                  variant={
                    STOCK_STATUS_VARIANTS[p.stock_status as keyof typeof STOCK_STATUS_VARIANTS]
                  }
                >
                  {STOCK_STATUS_LABELS[p.stock_status as keyof typeof STOCK_STATUS_LABELS]}
                </Badge>
              </Info>
              <Info label="وضعیت محصول">
                <Badge
                  variant={
                    PRODUCT_STATUS_VARIANTS[p.status as keyof typeof PRODUCT_STATUS_VARIANTS]
                  }
                >
                  {PRODUCT_STATUS_LABELS[p.status as keyof typeof PRODUCT_STATUS_LABELS]}
                </Badge>
              </Info>
              <Info label="واحد" value={p.unit ?? "—"} />
              <Info label="آخرین به‌روزرسانی" value={formatDateFa(p.updated_at)} />

              {p.description && (
                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-muted-foreground">توضیحات</div>
                  <div className="whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm">
                    {p.description}
                  </div>
                </div>
              )}
              {p.technical_notes && (
                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-muted-foreground">یادداشت فنی</div>
                  <div className="whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm">
                    {p.technical_notes}
                  </div>
                </div>
              )}

              {labels.length > 0 && (
                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-muted-foreground">برچسب‌ها</div>
                  <div className="flex flex-wrap gap-2">
                    {labels.map((l: any) => (
                      <span
                        key={l.id}
                        className="rounded-full px-3 py-1 text-xs"
                        style={{ backgroundColor: `${l.color}22`, color: l.color }}
                      >
                        {l.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">مسئولان محصول</h3>
                {canUpdate && (
                  <Button size="sm" variant="outline" onClick={() => setOwnerOpen(true)}>
                    <UserPlus className="ms-1 h-4 w-4" />
                    انتساب
                  </Button>
                )}
              </div>
              {data.owners.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  هنوز مسئولی برای این محصول تعیین نشده.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.owners.map((o) => (
                    <li
                      key={o.user_id}
                      className="flex items-center justify-between rounded-md border border-border bg-background p-2 text-sm"
                    >
                      <span>{o.full_name}</span>
                      {canUpdate && (
                        <RemoveOwnerButton productId={id} userId={o.user_id} onDone={refetch} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <OwnerAssignDialog
        productId={id}
        open={ownerOpen}
        onOpenChange={setOwnerOpen}
        existingUserIds={data.owners.map((o) => o.user_id)}
        onAssigned={refetch}
      />

      {/* Item 176 / 8.6 — per-warehouse stock. Renders nothing until the product
          has warehouse_stock rows. */}
      <ProductStockByWarehouse productId={id} />

      <ProductSupplierManager productId={id} />

      <ProductPublishPricesCard productId={id} />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h3 className="text-sm font-semibold">ابزارهای هوش مصنوعی</h3>
            <p className="text-xs text-muted-foreground">تولید سریع متن تبلیغاتی برای این محصول</p>
          </div>
          <AdCopyGenerator
            productId={id}
            productName={p.name}
            category={p.category?.name ?? null}
            brand={p.brand?.name ?? null}
            price={adjustedPriceQ.data ?? null}
            description={p.description ?? null}
          />
        </CardContent>
      </Card>

      <ProductHistoryCard productId={id} />

      <ProductStatsCard productId={id} />
      <ProductTimelineCard productId={id} />

      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">ویژگی‌های اختصاصی</h3>
          {dynamicQ.isLoading ? (
            <p className="text-xs text-muted-foreground">در حال بارگذاری...</p>
          ) : (dynamicQ.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">ویژگی اختصاصی ثبت نشده است.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {(dynamicQ.data ?? []).map((r) => (
                <Info key={r.id} label={r.label} value={r.value} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف محصول؟</AlertDialogTitle>
            <AlertDialogDescription>
              این عملیات قابل بازگشت نیست. محصول و اتصالات آن حذف خواهد شد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}حذف کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تغییرات ذخیره‌نشده دارید</AlertDialogTitle>
            <AlertDialogDescription>
              تغییراتی که در فرم محصول واردکرده‌اید هنوز ذخیره نشده است. می‌خواهید چه کاری انجام
              دهید؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => blocker.reset?.()} disabled={saving}>
              بازگشت به ویرایش
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                // ذخیره و در ادامه navigation
                pendingProceedRef.current = blocker.proceed ?? null;
                formRef.current?.requestSubmit();
              }}
              disabled={saving}
            >
              {saving && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
              ذخیره و خروج
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearDraft();
                setIsDirty(false);
                blocker.proceed?.();
              }}
              disabled={saving}
            >
              خروج بدون ذخیره
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Info({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{children ?? value ?? "—"}</div>
    </div>
  );
}

function RemoveOwnerButton({
  productId,
  userId,
  onDone,
}: {
  productId: string;
  userId: string;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const remove = async () => {
    setLoading(true);
    const { error } = await supabase
      .from("product_owner_assignments")
      .delete()
      .eq("product_id", productId)
      .eq("user_id", userId);
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success("مسئول حذف شد");
      onDone();
    }
  };
  return (
    <Button variant="ghost" size="sm" onClick={remove} disabled={loading}>
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      )}
    </Button>
  );
}

function ProductHistoryCard({ productId }: { productId: string }) {
  // مورد ۱۳۲.۲ — کارت خلاصهٔ فعلی حفظ می‌شود؛ dialog تاریخچهٔ دقیق کنارش اضافه شد.
  const [fieldHistoryOpen, setFieldHistoryOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["product-history", productId],
    queryFn: async () => {
      const { data: logs, error } = await supabase
        .from("audit_logs")
        .select("id, action, actor_id, diff, created_at")
        .eq("entity_type", "product")
        .eq("entity_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const actorIds = Array.from(
        new Set((logs ?? []).map((l: any) => l.actor_id).filter(Boolean)),
      );
      let profiles: { id: string; full_name: string | null }[] = [];
      if (actorIds.length > 0) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", actorIds);
        profiles = prof ?? [];
      }
      const nameMap = new Map(profiles.map((p) => [p.id, p.full_name ?? "—"]));
      return (logs ?? []).map((l: any) => ({
        ...l,
        actor_name: nameMap.get(l.actor_id) ?? "—",
      }));
    },
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">تاریخچه تغییرات</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFieldHistoryOpen(true)}
          >
            <History className="ms-1 h-3.5 w-3.5" />
            تاریخچه دقیق تغییرات
          </Button>
        </div>
        <ProductFieldHistoryDialog
          productId={productId}
          open={fieldHistoryOpen}
          onOpenChange={setFieldHistoryOpen}
        />
        {isLoading ? (
          <p className="text-xs text-muted-foreground">در حال بارگذاری...</p>
        ) : (data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">تغییری ثبت نشده است.</p>
        ) : (
          <ul className="space-y-3">
            {(data ?? []).map((row: any) => {
              const d = (row.diff ?? {}) as any;
              const changes = d.changes ?? {};
              const labels = d.labels ?? {};
              const attrs = d.attributes ?? {};
              return (
                <li
                  key={row.id}
                  className="rounded-md border border-border bg-background p-3 text-sm"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{row.actor_name}</span>
                    <span>{formatDateFa(row.created_at)}</span>
                  </div>
                  <ul className="space-y-1">
                    {Object.entries(changes).map(([k, c]: [string, any]) => (
                      <li key={k} className="text-xs">
                        <span className="font-medium">{c.label}:</span>{" "}
                        <span className="text-muted-foreground line-through">{c.from ?? "—"}</span>
                        {" → "}
                        <span className="text-foreground">{c.to ?? "—"}</span>
                      </li>
                    ))}
                    {(labels.added ?? []).map((l: any) => (
                      <li key={`la-${l.id}`} className="text-xs">
                        <span className="font-medium">برچسب افزوده شد:</span> {l.title}
                      </li>
                    ))}
                    {(labels.removed ?? []).map((l: any) => (
                      <li key={`lr-${l.id}`} className="text-xs">
                        <span className="font-medium">برچسب حذف شد:</span> {l.title}
                      </li>
                    ))}
                    {Object.entries(attrs).map(([k, c]: [string, any]) => (
                      <li key={`a-${k}`} className="text-xs">
                        <span className="font-medium">{c.label}:</span>{" "}
                        <span className="text-muted-foreground line-through">{c.from ?? "—"}</span>
                        {" → "}
                        <span className="text-foreground">{c.to ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ProductStatsCard({ productId }: { productId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["product-stats", productId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_product_stats", {
        p_product_id: productId,
      });
      if (error) throw error;
      return (data ?? {}) as {
        avg_price: number | null;
        last_price: number | null;
        purchase_count: number | null;
        last_purchase_date: string | null;
        inquiry_count_month: number | null;
        inquiry_count_total: number | null;
      };
    },
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h3 className="text-sm font-semibold">آمار محصول</h3>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">در حال بارگذاری...</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatBox
              label="میانگین قیمت استعلام"
              value={
                data?.avg_price != null ? `${formatNumber(Number(data.avg_price))} تومان` : "—"
              }
            />
            <StatBox
              label="آخرین قیمت استعلام"
              value={
                data?.last_price != null ? `${formatNumber(Number(data.last_price))} تومان` : "—"
              }
            />
            <StatBox
              label="تعداد استعلام (کل)"
              value={formatNumber(data?.inquiry_count_total ?? 0)}
            />
            <StatBox
              label="تعداد استعلام (۳۰ روز)"
              value={formatNumber(data?.inquiry_count_month ?? 0)}
            />
            <StatBox label="تعداد خرید" value={formatNumber(data?.purchase_count ?? 0)} />
            <StatBox
              label="آخرین تاریخ خرید"
              value={data?.last_purchase_date ? formatDateFa(data.last_purchase_date) : "—"}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

const TIMELINE_EVENT_LABELS: Record<string, string> = {
  purchase_request: "درخواست خرید",
  purchase: "خرید",
  inquiry: "استعلام قیمت",
  invoice: "فاکتور",
  price_change: "تغییر قیمت",
  sale: "فروش",
};

function ProductTimelineCard({ productId }: { productId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["product-timeline", productId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_product_timeline", {
        p_product_id: productId,
        p_limit: 30,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        event_time: string;
        event_type: string;
        actor_id: string | null;
        actor_name: string | null;
        description: string | null;
        amount: number | null;
        reference_id: string | null;
        reference_type: string | null;
      }>;
    },
    staleTime: 30_000,
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h3 className="text-sm font-semibold">تایم‌لاین محصول</h3>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">در حال بارگذاری...</p>
        ) : (data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">رویدادی برای این محصول ثبت نشده است.</p>
        ) : (
          <ul className="space-y-2">
            {(data ?? []).map((row, i) => (
              <li
                key={`${row.event_time}-${i}`}
                className="rounded-md border border-border bg-background p-3 text-sm"
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {TIMELINE_EVENT_LABELS[row.event_type] ?? row.event_type}
                    </Badge>
                    <span>{row.actor_name ?? "—"}</span>
                  </span>
                  <span>{formatDateFa(row.event_time)}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{row.description ?? "—"}</span>
                  {row.amount != null && (
                    <span className="text-xs font-semibold">
                      {formatNumber(Number(row.amount))} تومان
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
