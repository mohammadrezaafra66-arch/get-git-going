import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  ArrowRight,
  Loader2,
  Save,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  Search,
  FileText,
  Download,
  Send,
  Link2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertTriangle,
  RefreshCw,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { formatNumber, formatCurrency, formatDateTimeFa } from "@/lib/i18n/formatters";
import { fetchBrandsLite, fetchCategoriesLite } from "@/lib/products/queries";
import { fetchSalePriceTypes, fetchSettlementTypes } from "@/lib/pricing/queries";
import {
  STOCK_STATUS_LABELS,
  STOCK_STATUS_VARIANTS,
  PRODUCT_TYPE_LABELS,
  type StockStatus,
  type ProductType,
} from "@/lib/products/constants";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import {
  previewSaleListPdf,
  downloadSaleListPdf,
  type SaleListPdfInput,
  type SaleListPdfColumn,
  NO_BRAND_KEY,
  brandKey as toBrandKey,
  brandLabel as toBrandLabel,
} from "@/lib/pdf/sale-list-pdf";
import { fetchShopSettings } from "@/lib/shop/settings";
import { publishProductPrices } from "@/lib/pricing/publish-prices";
import {
  fetchObservatoryPdfHintsForProducts,
  type ObservatoryPdfHintMap,
} from "@/lib/sales/observatory-snippets";
import { buildFromSaleList } from "@/lib/price-list/builders";
import { formatForPlainText } from "@/lib/price-list/formatters/plain-text";
import { formatForTelegram } from "@/lib/price-list/formatters/telegram";
import { formatForWhatsApp } from "@/lib/price-list/formatters/whatsapp";
import { formatForRubika } from "@/lib/price-list/formatters/rubika";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/_app/pricing/sale-lists_/$listId")({
  beforeLoad: async () => {
    await requirePermission("pricing", "view");
  },
  component: SaleListDetailPage,
});

type ColumnKey =
  | "name"
  | "brand"
  | "category"
  | "sale_price"
  | "previous_price"
  | "change"
  | "stock_status"
  | "product_type"
  | "labels"
  | "description"
  | "observatory_price_advantage";

const COLUMN_OPTIONS: { key: ColumnKey; label: string; locked?: boolean }[] = [
  { key: "name", label: "نام محصول", locked: true },
  { key: "brand", label: "برند" },
  { key: "category", label: "دسته‌بندی" },
  { key: "sale_price", label: "قیمت فروش" },
  { key: "previous_price", label: "قیمت قبلی" },
  { key: "change", label: "میزان تغییرات" },
  { key: "stock_status", label: "وضعیت موجودی" },
  { key: "product_type", label: "نوع کالا" },
  { key: "labels", label: "برچسب‌ها" },
  { key: "description", label: "توضیحات" },
  // Customer-safe Observatory hint. NOT included in the default-on
  // fallback set so existing lists are unaffected — only shows up when
  // the manager explicitly checks it.
  { key: "observatory_price_advantage", label: "مزیت قیمت" },
];

interface SaleListDetail {
  id: string;
  name: string;
  description: string | null;
  terms_text: string | null;
  seller_info?: string | null;
  status: string;
  version_number: number;
  sale_price_type_id: string;
  settlement_type_id: string | null;
  selected_columns: string[] | null;
  created_at: string;
  sale_price_type: { id: string; title: string } | null;
  settlement_type: { id: string; title: string } | null;
  pdf_brand_order: string[] | null;
  pdf_product_order_by_brand: Record<string, string[]> | null;
  pdf_font_size: number | null;
  pdf_row_padding_y: number | null;
  pdf_cell_padding_x: number | null;
}

interface SaleListItemRow {
  id: string;
  product_id: string;
  current_price: number;
  previous_price: number | null;
  change_amount: number | null;
  change_percent: number | null;
  stock_status: string | null;
  sort_order: number;
  product: {
    id: string;
    name: string;
    sku: string | null;
    model: string | null;
    description: string | null;
    brand: { name: string } | null;
    category: { name: string } | null;
  } | null;
}

interface VersionRow {
  id: string;
  version_number: number;
  created_at: string;
  created_by: string | null;
  snapshot_data: any;
}

function SaleListDetailPage() {
  const { listId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles } = useAuth();

  const listQ = useQuery({
    queryKey: ["sale-list", listId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_lists")
        .select(
          "id, name, description, terms_text, seller_info, status, version_number, sale_price_type_id, settlement_type_id, selected_columns, created_at, pdf_brand_order, pdf_product_order_by_brand, pdf_font_size, pdf_row_padding_y, pdf_cell_padding_x, sale_price_type:sale_price_types(id, title), settlement_type:settlement_types(id, title)",
        )
        .eq("id", listId)
        .single();
      if (error) throw error;
      return data as unknown as SaleListDetail;
    },
  });

  const itemsQ = useQuery({
    queryKey: ["sale-list-items", listId],
    queryFn: async () => {
      // Refresh prices from latest history before reading (live pricing).
      await supabase.rpc("refresh_sale_list_prices", { p_list_id: listId });
      const { data, error } = await supabase
        .from("sale_list_items")
        .select(
          "id, product_id, current_price, previous_price, change_amount, change_percent, stock_status, sort_order, product:products(id, name, sku, model, description, brand:brands(name), category:categories(name))",
        )
        .eq("sale_list_id", listId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SaleListItemRow[];
    },
  });

  const versionsQ = useQuery({
    queryKey: ["sale-list-versions", listId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_list_versions")
        .select("id, version_number, created_at, created_by, snapshot_data")
        .eq("sale_list_id", listId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VersionRow[];
    },
  });

  const shopSettingsQ = useQuery({
    queryKey: ["shop-settings"],
    queryFn: fetchShopSettings,
    staleTime: 300_000,
  });

  const discountSalePriceTypesQ = useQuery({
    queryKey: ["sale-price-types-active-for-discount"],
    queryFn: () => fetchSalePriceTypes(true),
  });
  const [discountPdfTermId, setDiscountPdfTermId] = useState<string>("");
  const [discountBaseTermId, setDiscountBaseTermId] = useState<string>("");
  const [discountSelectedIds, setDiscountSelectedIds] = useState<string[]>([]);
  const [discountText, setDiscountText] = useState<string>("");
  const [discountBusy, setDiscountBusy] = useState(false);

  // Category-specific product attributes for items, used only inside PDF "description" column.

  const productIdsForAttrs = useMemo(() => {
    const ids = new Set<string>();
    for (const it of itemsQ.data ?? []) {
      if (it.product?.id) ids.add(it.product.id);
    }
    return Array.from(ids).sort();
  }, [itemsQ.data]);

  const productAttrsQ = useQuery({
    queryKey: ["sale-list-product-attrs", listId, productIdsForAttrs],
    enabled: productIdsForAttrs.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_category_attribute_values")
        .select(
          "product_id, value, def:category_product_attributes(id, label_fa, sort_order, is_active)",
        )
        .in("product_id", productIdsForAttrs);
      if (error) throw error;
      type Row = {
        product_id: string;
        value: string | null;
        def: {
          id: string;
          label_fa: string;
          sort_order: number | null;
          is_active: boolean | null;
        } | null;
      };
      const rows = (data ?? []) as unknown as Row[];
      const byProduct = new Map<string, { label: string; value: string; sort: number }[]>();
      for (const r of rows) {
        const v = (r.value ?? "").trim();
        if (!v) continue;
        if (!r.def) continue;
        if (r.def.is_active === false) continue;
        const label = (r.def.label_fa ?? "").trim();
        if (!label) continue;
        const arr = byProduct.get(r.product_id) ?? [];
        arr.push({ label, value: v, sort: r.def.sort_order ?? 0 });
        byProduct.set(r.product_id, arr);
      }
      const formatted: Record<string, string> = {};
      for (const [pid, arr] of byProduct) {
        arr.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "fa"));
        formatted[pid] = arr.map((a) => a.value).join(" - ");
      }
      return formatted;
    },
  });

  // PDF density / font controls
  const [pdfFontSize, setPdfFontSize] = useState<number>(10);
  const [pdfRowPadY, setPdfRowPadY] = useState<number>(2);
  const [pdfCellPadX, setPdfCellPadX] = useState<number>(4);

  // Sync PDF appearance state from DB when listQ.data loads/changes.
  useEffect(() => {
    const d = listQ.data;
    if (!d) return;
    setPdfFontSize(d.pdf_font_size ?? 10);
    setPdfRowPadY(d.pdf_row_padding_y ?? 2);
    setPdfCellPadX(d.pdf_cell_padding_x ?? 4);
  }, [
    listQ.data?.id,
    listQ.data?.pdf_font_size,
    listQ.data?.pdf_row_padding_y,
    listQ.data?.pdf_cell_padding_x,
  ]);

  // PDF order settings dialog state (brand keys + per-brand product UUIDs).
  // Brand keys use the same convention as the PDF (NO_BRAND_KEY for no-brand).
  const [pdfOrderOpen, setPdfOrderOpen] = useState(false);
  const [brandOrder, setBrandOrder] = useState<string[]>([]);
  const [productOrderByBrand, setProductOrderByBrand] = useState<Record<string, string[]>>({});
  const [savingOrder, setSavingOrder] = useState(false);
  const [runningPdf, setRunningPdf] = useState<"preview" | "download" | null>(null);

  // Distinct brand keys in items (first-appearance order).
  const distinctBrandKeys = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const it of itemsQ.data ?? []) {
      const k = toBrandKey(it.product?.brand?.name);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
    return out;
  }, [itemsQ.data]);

  // Map brand key -> product list (first-appearance order from items).
  const productsByBrandKey = useMemo(() => {
    const m = new Map<string, { id: string; name: string }[]>();
    for (const it of itemsQ.data ?? []) {
      const k = toBrandKey(it.product?.brand?.name);
      const pid = it.product?.id;
      if (!pid) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push({ id: pid, name: it.product?.name ?? "—" });
    }
    return m;
  }, [itemsQ.data]);

  // Realtime: refresh items when sale_list_items changes (trigger on price history),
  // and proactively refresh when product_sale_price_history changes for our price type.
  useEffect(() => {
    if (!listId) return;
    const ch = supabase
      .channel(`sale-list-${listId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sale_list_items",
          filter: `sale_list_id=eq.${listId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["sale-list-items", listId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "product_sale_price_history" },
        async () => {
          await supabase.rpc("refresh_sale_list_prices", { p_list_id: listId });
          qc.invalidateQueries({ queryKey: ["sale-list-items", listId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [listId, qc]);

  if (listQ.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (listQ.isError || !listQ.data) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        لیست فروش یافت نشد یا دسترسی ندارید.
      </div>
    );
  }

  const list = listQ.data;
  const items = itemsQ.data ?? [];
  const versions = versionsQ.data ?? [];

  const canPublish = hasAnyRole(roles, ["admin", "manager", "accountant"]);
  const canSavePdfOrder = canPublish;

  const buildPdfInput = (
    overrideBrandOrder?: string[],
    overrideProductOrder?: Record<string, string[]>,
    livePrices?: Map<string, number>,
    observatoryHints?: ObservatoryPdfHintMap,
    usdRate?: number | null,
  ): SaleListPdfInput => {
    // Default-on column set for legacy lists with NULL selected_columns.
    // `observatory_price_advantage` is intentionally excluded so existing
    // lists never start exposing Observatory hints without an explicit opt-in.
    const cols = (list.selected_columns as SaleListPdfColumn[] | null) ?? [
      "name",
      "brand",
      "category",
      "sale_price",
      "previous_price",
      "change",
      "stock_status",
    ];
    const shop = shopSettingsQ.data;
    const attrsMap = productAttrsQ.data ?? {};
    const combineDescAndAttrs = (
      desc: string | null | undefined,
      attrs: string | undefined,
    ): string | null => {
      const d = (desc ?? "").trim();
      const a = (attrs ?? "").trim();
      if (d && a) return `${d}\n${a}`;
      if (d) return d;
      if (a) return a;
      return null;
    };
    return {
      listName: list.name,
      versionNumber: list.version_number,
      createdByName: "—",
      salePriceTypeTitle: list.sale_price_type?.title ?? "—",
      // Metadata only — never feeds into price calculation.
      settlementTypeTitle: list.settlement_type?.title ?? null,
      termsText: list.terms_text,
      usdRate: usdRate ?? null,
      sellerInfo: list.seller_info ?? null,
      shopInfo: shop
        ? {
            name: shop.shop_name,
            address: shop.shop_address,
            phone: shop.shop_phone,
            website: shop.shop_website,
            rubika: shop.shop_rubika,
            whatsapp: shop.shop_whatsapp,
            eitaa: shop.shop_eitaa,
            baleh: shop.shop_baleh,
          }
        : null,
      selectedColumns: cols,
      brandOrder: overrideBrandOrder ?? brandOrder,
      productOrderByBrand: overrideProductOrder ?? productOrderByBrand,
      items: items.map((it) => {
        const snapshotCurrent = Number(it.current_price);
        const live = livePrices?.get(it.product?.id ?? "");
        // Prefer live price when available; fall back to snapshot.
        const current = live !== undefined && live > 0 ? live : snapshotCurrent;
        const previous = it.previous_price !== null ? Number(it.previous_price) : null;
        const change_amount =
          previous !== null && current > 0
            ? current - previous
            : it.change_amount !== null
              ? Number(it.change_amount)
              : null;
        const change_percent =
          previous && previous !== 0 && current > 0
            ? Number((((current - previous) / previous) * 100).toFixed(2))
            : it.change_percent !== null
              ? Number(it.change_percent)
              : null;
        return {
          product_id: it.product?.id ?? null,
          product_name: it.product?.name ?? "—",
          brand_name: it.product?.brand?.name ?? null,
          category_name: it.product?.category?.name ?? null,
          model: it.product?.model ?? null,
          current_price: current,
          previous_price: previous,
          change_amount,
          change_percent,
          stock_status: it.stock_status,
          description: combineDescAndAttrs(
            it.product?.description ?? null,
            it.product?.id ? attrsMap[it.product.id] : undefined,
          ),
          observatory_has_price_advantage: it.product?.id
            ? observatoryHints?.[it.product.id] === true
            : false,
        };
      }),
      options: {
        fontSize: pdfFontSize,
        rowPaddingY: pdfRowPadY,
        cellPaddingX: pdfCellPadX,
      },
    };
  };

  /**
   * Merge saved order from DB with current data:
   *  - keep saved entries that still exist (in order)
   *  - append new entries at the end
   *  - drop missing entries silently
   */
  const mergeBrandOrder = (saved: string[] | null | undefined, current: string[]): string[] => {
    const validSaved = (saved ?? []).filter((k) => current.includes(k));
    const seen = new Set(validSaved);
    return [...validSaved, ...current.filter((k) => !seen.has(k))];
  };
  const mergeProductOrder = (
    saved: Record<string, string[]> | null | undefined,
    productsByKey: Map<string, { id: string; name: string }[]>,
  ): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const [k, list] of productsByKey.entries()) {
      const ids = list.map((p) => p.id);
      const idSet = new Set(ids);
      const validSaved = (saved?.[k] ?? []).filter((pid) => idSet.has(pid));
      const seen = new Set(validSaved);
      out[k] = [...validSaved, ...ids.filter((pid) => !seen.has(pid))];
    }
    return out;
  };

  const openPdfOrderDialog = () => {
    if (items.length === 0) {
      toast.error("لیست خالی است.");
      return;
    }
    const mergedBrands = mergeBrandOrder(list.pdf_brand_order, distinctBrandKeys);
    const mergedProducts = mergeProductOrder(list.pdf_product_order_by_brand, productsByBrandKey);
    setBrandOrder(mergedBrands);
    setProductOrderByBrand(mergedProducts);
    setPdfOrderOpen(true);
  };
  const moveBrand = (idx: number, dir: -1 | 1) => {
    setBrandOrder((prev) => {
      const next = prev.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };
  const moveProduct = (brandK: string, idx: number, dir: -1 | 1) => {
    setProductOrderByBrand((prev) => {
      const list = prev[brandK]?.slice() ?? [];
      const j = idx + dir;
      if (j < 0 || j >= list.length) return prev;
      [list[idx], list[j]] = [list[j], list[idx]];
      return { ...prev, [brandK]: list };
    });
  };

  const persistPdfOrder = async (): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("sale_lists")
        .update({
          pdf_brand_order: brandOrder,
          pdf_product_order_by_brand: productOrderByBrand,
        })
        .eq("id", listId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["sale-list", listId] });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ذخیره ترتیب ناموفق بود.");
      return false;
    }
  };

  const persistPdfAppearance = async (
    fontSize: number = pdfFontSize,
    rowPadY: number = pdfRowPadY,
    cellPadX: number = pdfCellPadX,
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("sale_lists")
        .update({
          pdf_font_size: fontSize,
          pdf_row_padding_y: rowPadY,
          pdf_cell_padding_x: cellPadX,
        })
        .eq("id", listId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["sale-list", listId] });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ذخیره تنظیمات ظاهر PDF ناموفق بود.");
      return false;
    }
  };

  const handleSaveOrder = async () => {
    setSavingOrder(true);
    try {
      const ok = await persistPdfOrder();
      if (ok) {
        toast.success("ترتیب نمایش PDF ذخیره شد.");
        setPdfOrderOpen(false);
      }
    } finally {
      setSavingOrder(false);
    }
  };

  const runPdfAction = async (action: "preview" | "download") => {
    setRunningPdf(action);
    try {
      // Save the current ordering first (best-effort; do not block PDF on failure).
      if (canSavePdfOrder) {
        const orderOk = await persistPdfOrder();
        if (!orderOk) return;
      }
      const appearanceOk = await persistPdfAppearance();
      if (!appearanceOk) return;
      // Ensure category-specific product attributes are loaded if "description"
      // column will be rendered (PDF combines product.description + attributes).
      const selectedCols = (list.selected_columns as SaleListPdfColumn[] | null) ?? [];
      if (
        selectedCols.includes("description") &&
        productIdsForAttrs.length > 0 &&
        !productAttrsQ.data
      ) {
        try {
          await productAttrsQ.refetch();
        } catch (err) {
          console.warn(
            "fetch product attributes for PDF failed; description will omit attributes",
            err,
          );
        }
      }
      // Fetch latest live sale prices for items that may have stale/zero snapshots
      let livePrices: Map<string, number> | undefined;
      try {
        const productIds = items.map((it) => it.product?.id).filter((x): x is string => !!x);
        if (productIds.length > 0 && list.sale_price_type_id) {
          // Canonical source: product_computed_prices (same as sales search & workshop).
          const { data: priceRows } = await (supabase as any)
            .from("product_computed_prices_public")
            .select("product_id, rounded_sale_price, computed_at")
            .eq("sale_price_type_id", list.sale_price_type_id)
            .in("product_id", productIds)
            .order("computed_at", { ascending: false });
          const map = new Map<string, number>();
          for (const row of (priceRows ?? []) as Array<{
            product_id: string;
            rounded_sale_price: number | string | null;
          }>) {
            if (!map.has(row.product_id)) {
              map.set(row.product_id, Number(row.rounded_sale_price ?? 0) || 0);
            }
          }
          livePrices = map;
        }
      } catch (err) {
        console.warn("fetch live prices for PDF failed; using snapshot", err);
      }
      // Observatory PDF hints — opt-in only. Skip entirely (zero overhead)
      // when the "مزیت قیمت" column is not selected. Degrade gracefully on
      // any error so the PDF still renders.
      let observatoryHints: ObservatoryPdfHintMap | undefined;
      if (selectedCols.includes("observatory_price_advantage")) {
        try {
          const productIds = items.map((it) => it.product?.id).filter((x): x is string => !!x);
          if (productIds.length > 0) {
            observatoryHints = await fetchObservatoryPdfHintsForProducts(productIds);
          }
        } catch (err) {
          console.warn(
            "fetch observatory PDF hints failed; price-advantage column will be empty",
            err,
          );
        }
      }
      // نرخ دلار مؤثر در لحظهٔ صدور PDF (best-effort؛ در صورت خطا PDF بدون نرخ تولید می‌شود).
      let usdRateForPdf: number | null = null;
      try {
        const { data: rateRow } = await (supabase as any)
          .from("currency_rates")
          .select("rate_to_toman, effective_at")
          .eq("currency", "usd")
          .eq("is_active", true)
          .lte("effective_at", new Date().toISOString())
          .order("effective_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        usdRateForPdf = rateRow ? Number(rateRow.rate_to_toman) : null;
      } catch (err) {
        console.warn("fetch USD rate for PDF failed; PDF will omit rate", err);
      }
      const input = buildPdfInput(
        brandOrder,
        productOrderByBrand,
        livePrices,
        observatoryHints,
        usdRateForPdf,
      );
      if (action === "preview") await previewSaleListPdf(input);
      else await downloadSaleListPdf(input);
      setPdfOrderOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ساخت PDF.");
      console.error(e);
    } finally {
      setRunningPdf(null);
    }
  };
  const handlePreview = () => openPdfOrderDialog();
  const handleDownload = () => openPdfOrderDialog();

  const copyShareText = async (
    channel: "plain" | "telegram" | "whatsapp" | "rubika",
    label: string,
  ) => {
    if (items.length === 0) {
      toast.error("لیست خالی است.");
      return;
    }
    try {
      const model = buildFromSaleList({
        list,
        items,
        shop: shopSettingsQ.data ?? null,
      });
      let text = "";
      if (channel === "plain") text = formatForPlainText(model);
      else if (channel === "telegram") text = formatForTelegram(model)[0] ?? "";
      else if (channel === "whatsapp") text = formatForWhatsApp(model);
      else text = formatForRubika(model);
      await navigator.clipboard.writeText(text);
      toast.success(`${label} در کلیپ‌بورد کپی شد.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "کپی ناموفق بود.");
    }
  };

  const buildDiscountText = async () => {
    const pdfTermId = discountPdfTermId || list.sale_price_type_id;
    const baseTermId = discountBaseTermId;
    if (!baseTermId) {
      toast.error("ترمِ مبنا برای مقایسه را انتخاب کنید.");
      return;
    }
    if (pdfTermId === baseTermId) {
      toast.error("ترمِ PDF و ترمِ مبنا نباید یکسان باشند.");
      return;
    }
    if (discountSelectedIds.length === 0) {
      toast.error("حداقل یک محصول انتخاب کنید.");
      return;
    }
    setDiscountBusy(true);
    try {
      const fetchTermPrices = async (typeId: string): Promise<Map<string, number>> => {
        const map = new Map<string, number>();
        const CHUNK = 200;
        for (let i = 0; i < discountSelectedIds.length; i += CHUNK) {
          const chunk = discountSelectedIds.slice(i, i + CHUNK);
          const { data, error } = await (supabase as any)
            .from("product_computed_prices")
            .select("product_id, rounded_sale_price, computed_at")
            .eq("sale_price_type_id", typeId)
            // Baseline rows only — preserve exact pre-settlement behavior.
            .is("settlement_type_id", null)
            .in("product_id", chunk)
            .order("computed_at", { ascending: false });
          if (error) throw error;
          for (const row of (data ?? []) as Array<{
            product_id: string;
            rounded_sale_price: number | string | null;
          }>) {
            if (!map.has(row.product_id)) {
              map.set(row.product_id, Number(row.rounded_sale_price ?? 0) || 0);
            }
          }
        }
        return map;
      };
      const [pdfPrices, basePrices] = await Promise.all([
        fetchTermPrices(pdfTermId),
        fetchTermPrices(baseTermId),
      ]);
      const lines: string[] = [];
      let missing = 0;
      for (const it of items) {
        const pid = it.product?.id;
        if (!pid || !discountSelectedIds.includes(pid)) continue;
        const pPdf = pdfPrices.get(pid);
        const pBase = basePrices.get(pid);
        if (!pPdf || !pBase) {
          missing++;
          continue;
        }
        const diff = Math.abs(pPdf - pBase);
        lines.push(`${it.product?.name ?? "—"} ${formatNumber(diff)} تومان`);
      }
      if (lines.length === 0) {
        setDiscountText("");
        const termTitle = (tid: string) =>
          discountSalePriceTypesQ.data?.find((t: { id: string; title: string }) => t.id === tid)
            ?.title ?? tid;
        const pdfMissing = discountSelectedIds.filter((id) => !pdfPrices.has(id)).length;
        const baseMissing = discountSelectedIds.filter((id) => !basePrices.has(id)).length;
        toast.error(
          `قیمتی برای محاسبه پیدا نشد. از ${discountSelectedIds.length} محصول، برای ترمِ «${termTitle(pdfTermId)}» ${pdfMissing} مورد و برای ترمِ «${termTitle(baseTermId)}» ${baseMissing} مورد قیمت ندارند.`,
        );
        return;
      }
      let text = `تفاوت قیمت — ${formatDateTimeFa(new Date())}\n\n${lines.join("\n")}`;
      if (missing > 0) {
        text += `\n\n(${formatNumber(missing)} محصول به‌دلیل نبودِ قیمت محاسبه نشد)`;
      }
      setDiscountText(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در محاسبهٔ تفاوت.");
      console.error(e);
    } finally {
      setDiscountBusy(false);
    }
  };

  const copyDiscountText = async () => {
    if (!discountText) return;
    try {
      await navigator.clipboard.writeText(discountText);
      toast.success("متن تفاوت کپی شد.");
    } catch {
      toast.error("کپی ناموفق بود.");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={list.name}
        description={`نسخه ${formatNumber(list.version_number)} • ${list.sale_price_type?.title ?? "—"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={list.status === "published" ? "default" : "secondary"}>
              {list.status === "published" ? "منتشرشده" : "پیش‌نویس"}
            </Badge>
            <Button variant="outline" size="sm" className="gap-1" onClick={handlePreview}>
              <FileText className="h-4 w-4" /> پیش‌نمایش PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={handleDownload}>
              <Download className="h-4 w-4" /> دانلود PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => copyShareText("plain", "متن ساده")}
            >
              <Copy className="h-4 w-4" /> کپی متن ساده
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => copyShareText("telegram", "متن تلگرام")}
            >
              <Copy className="h-4 w-4" /> تلگرام
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => copyShareText("whatsapp", "متن واتساپ")}
            >
              <Copy className="h-4 w-4" /> واتساپ
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => copyShareText("rubika", "متن روبیکا")}
            >
              <Copy className="h-4 w-4" /> روبیکا
            </Button>
            {canPublish && (
              <Button asChild size="sm" className="gap-1">
                <Link to="/pricing/sale-lists/$listId/publish" params={{ listId: list.id }}>
                  <Send className="h-4 w-4" />
                  {list.status === "published" ? "بازنشر" : "انتشار"}
                </Link>
              </Button>
            )}
            {list.status === "published" && (
              <>
                <Button asChild variant="outline" size="sm" className="gap-1">
                  <a
                    href={`/public/sale-lists/${list.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Link2 className="h-4 w-4" /> مشاهده نسخه عمومی
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={async () => {
                    const url = `${window.location.origin}/public/sale-lists/${list.id}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      toast.success("لینک عمومی کپی شد.");
                    } catch {
                      toast.error("کپی لینک ناموفق بود.");
                    }
                  }}
                >
                  کپی لینک عمومی
                </Button>
              </>
            )}
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link to="/pricing/sale-lists">
                <ArrowRight className="h-4 w-4" />
                بازگشت
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-3 text-xs">
          <div className="text-muted-foreground">تنظیمات ظاهر PDF:</div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">اندازه فونت ({pdfFontSize})</Label>
            <input
              type="range"
              min={7}
              max={16}
              step={1}
              value={pdfFontSize}
              onChange={(e) => setPdfFontSize(Number(e.target.value))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">فاصله ردیف‌ها ({pdfRowPadY})</Label>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={pdfRowPadY}
              onChange={(e) => setPdfRowPadY(Number(e.target.value))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">فاصله ستون‌ها ({pdfCellPadX})</Label>
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={pdfCellPadX}
              onChange={(e) => setPdfCellPadX(Number(e.target.value))}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const nextFontSize = 10;
              const nextRowPadY = 2;
              const nextCellPadX = 4;
              setPdfFontSize(nextFontSize);
              setPdfRowPadY(nextRowPadY);
              setPdfCellPadX(nextCellPadX);
              const ok = await persistPdfAppearance(nextFontSize, nextRowPadY, nextCellPadX);
              if (ok) toast.success("تنظیمات ظاهر PDF بازنشانی شد.");
            }}
          >
            بازنشانی
          </Button>
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
          <div className="flex min-w-0 items-start gap-2">
            <Badge variant="secondary" className="shrink-0">
              ترتیب PDF
            </Badge>
            <div className="space-y-0.5">
              <div className="font-semibold">ترتیب نمایش برندها و محصولات در PDF</div>
              <div className="text-xs text-muted-foreground">
                می‌توانید ترتیب برندها و ترتیب محصولات داخل هر برند را برای فایل PDF تنظیم کنید.
                تنظیمات ذخیره و در دفعات بعد استفاده می‌شود.
              </div>
            </div>
          </div>
          <Button variant="default" size="sm" className="gap-1" onClick={openPdfOrderDialog}>
            <ArrowUpDown className="h-4 w-4" /> تنظیم ترتیب نمایش در PDF
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="items" dir="rtl">
        <TabsList>
          <TabsTrigger value="items">اقلام لیست</TabsTrigger>
          <TabsTrigger value="versions">نسخه‌ها و تاریخچه</TabsTrigger>
          <TabsTrigger value="settings">تنظیمات و ویرایش</TabsTrigger>
          <TabsTrigger value="discount">تفاوت تسویه</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="pt-4">
          <ZeroPriceWarning
            items={items}
            salePriceTypeId={list.sale_price_type_id}
            canPublish={canPublish}
            onPublished={() => {
              qc.invalidateQueries({ queryKey: ["sale-list-items", listId] });
              qc.invalidateQueries({ queryKey: ["zero-price-audit", listId] });
            }}
          />
          <ItemsTab items={items} loading={itemsQ.isLoading} />
        </TabsContent>

        <TabsContent value="versions" className="pt-4">
          <VersionsTab
            versions={versions}
            loading={versionsQ.isLoading}
            currentVersion={list.version_number}
          />
        </TabsContent>

        <TabsContent value="settings" className="pt-4">
          <SettingsTab
            list={list}
            items={items}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["sale-list", listId] });
              qc.invalidateQueries({ queryKey: ["sale-list-items", listId] });
              qc.invalidateQueries({ queryKey: ["sale-list-versions", listId] });
              qc.invalidateQueries({ queryKey: ["sale-lists"] });
            }}
            onDeleted={() => navigate({ to: "/pricing/sale-lists" })}
          />
        </TabsContent>

        <TabsContent value="discount" className="pt-4">
          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <div className="text-sm font-semibold">تفاوت تسویه (برای ارسال به مشتری)</div>
              <div className="text-xs text-muted-foreground">
                مبلغ تفاوت بین ترمِ تسویهٔ PDF و ترمِ مبنا را برای محصولات انتخابی محاسبه و به‌صورت
                متنِ قابل‌کپی تولید می‌کند. این اطلاعات فقط در همین صفحه نمایش داده می‌شود و هرگز
                وارد PDF نمی‌شود.
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>ترمِ تسویهٔ نمایش‌داده‌شده در PDF</Label>
                <Select
                  value={discountPdfTermId || list.sale_price_type_id}
                  onValueChange={setDiscountPdfTermId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب ترم" />
                  </SelectTrigger>
                  <SelectContent>
                    {(discountSalePriceTypesQ.data ?? []).map(
                      (t: { id: string; title: string }) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.title}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>ترمِ مبنا برای مقایسه (مثلاً پیش‌واریز)</Label>
                <Select value={discountBaseTermId} onValueChange={setDiscountBaseTermId}>
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب ترم مبنا" />
                  </SelectTrigger>
                  <SelectContent>
                    {(discountSalePriceTypesQ.data ?? []).map(
                      (t: { id: string; title: string }) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.title}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>محصولات موردنظر برای محاسبهٔ تفاوت</Label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() =>
                      setDiscountSelectedIds(
                        items.map((it) => it.product?.id).filter((x): x is string => !!x),
                      )
                    }
                  >
                    انتخاب همه
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setDiscountSelectedIds([])}
                  >
                    حذف همه
                  </button>
                </div>
              </div>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
                {items.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">این لیست محصولی ندارد.</div>
                ) : (
                  items.map((it) => {
                    const pid = it.product?.id;
                    if (!pid) return null;
                    const checked = discountSelectedIds.includes(pid);
                    return (
                      <label
                        key={pid}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setDiscountSelectedIds((prev) =>
                              v === true ? [...prev, pid] : prev.filter((id) => id !== pid),
                            )
                          }
                        />
                        <span className="text-sm">
                          {it.product?.name ?? "—"}
                          {it.product?.sku ? (
                            <span className="ms-2 text-xs text-muted-foreground">
                              {it.product.sku}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {discountSelectedIds.length.toLocaleString("fa-IR")} محصول انتخاب شده
              </div>
            </div>
            <div className="space-y-2">
              <Button
                type="button"
                size="sm"
                onClick={buildDiscountText}
                disabled={discountBusy || discountSelectedIds.length === 0}
                className="gap-1"
              >
                {discountBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                محاسبه و تولید متن
              </Button>
              {discountText ? (
                <div className="space-y-2">
                  <Textarea
                    value={discountText}
                    readOnly
                    rows={Math.min(20, discountText.split("\n").length + 1)}
                    className="font-mono text-sm"
                    dir="rtl"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyDiscountText}
                    className="gap-1"
                  >
                    <Copy className="h-4 w-4" />
                    کپی متن
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={pdfOrderOpen}
        onOpenChange={(o) => {
          if (!o && !runningPdf && !savingOrder) setPdfOrderOpen(false);
        }}
      >
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>تنظیم ترتیب نمایش در PDF</DialogTitle>
            <DialogDescription>
              ترتیب برندها و محصولات داخل هر برند را مشخص کنید. تنظیمات شما برای دفعات بعد ذخیره
              می‌شود. محصولات فقط درون برند خودشان قابل جابجایی هستند.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto rounded-md border p-2">
            {brandOrder.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                برندی برای نمایش وجود ندارد.
              </div>
            ) : (
              brandOrder.map((bk, bi) => {
                const productIds = productOrderByBrand[bk] ?? [];
                const productsList = productsByBrandKey.get(bk) ?? [];
                const nameById = new Map(productsList.map((p) => [p.id, p.name]));
                return (
                  <div key={bk} className="rounded-md border bg-card">
                    <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-primary/10 px-1.5 text-xs">
                          {formatNumber(bi + 1)}
                        </span>
                        <span>{toBrandLabel(bk)}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          ({formatNumber(productIds.length)} محصول)
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={bi === 0}
                          onClick={() => moveBrand(bi, -1)}
                          aria-label="بالا بردن برند"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={bi === brandOrder.length - 1}
                          onClick={() => moveBrand(bi, 1)}
                          aria-label="پایین بردن برند"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <ul className="divide-y">
                      {productIds.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-muted-foreground">
                          محصولی در این برند نیست.
                        </li>
                      ) : (
                        productIds.map((pid, pi) => (
                          <li
                            key={pid}
                            className="flex items-center justify-between gap-2 px-3 py-1.5"
                          >
                            <div className="flex min-w-0 items-center gap-2 text-sm">
                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 text-[10px] tabular-nums">
                                {formatNumber(pi + 1)}
                              </span>
                              <span className="truncate">{nameById.get(pid) ?? "—"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                disabled={pi === 0}
                                onClick={() => moveProduct(bk, pi, -1)}
                                aria-label="بالا بردن محصول"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                disabled={pi === productIds.length - 1}
                                onClick={() => moveProduct(bk, pi, 1)}
                                aria-label="پایین بردن محصول"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setPdfOrderOpen(false)}
              disabled={savingOrder || runningPdf !== null}
            >
              انصراف
            </Button>
            {canSavePdfOrder && (
              <Button
                variant="secondary"
                onClick={handleSaveOrder}
                disabled={savingOrder || runningPdf !== null || brandOrder.length === 0}
                className="gap-1"
              >
                {savingOrder ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                ذخیره تنظیمات
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => runPdfAction("preview")}
              disabled={savingOrder || runningPdf !== null || brandOrder.length === 0}
              className="gap-1"
            >
              {runningPdf === "preview" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              پیش‌نمایش PDF
            </Button>
            <Button
              onClick={() => runPdfAction("download")}
              disabled={savingOrder || runningPdf !== null || brandOrder.length === 0}
              className="gap-1"
            >
              {runningPdf === "download" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              دانلود PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Zero-price warning ---------- */
function ZeroPriceWarning({
  items,
  salePriceTypeId,
  canPublish,
  onPublished,
}: {
  items: SaleListItemRow[];
  salePriceTypeId: string;
  canPublish: boolean;
  onPublished: () => void;
}) {
  const zeroItems = useMemo(
    () => items.filter((it) => !it.current_price || Number(it.current_price) <= 0),
    [items],
  );
  const productIds = useMemo(
    () => zeroItems.map((it) => it.product?.id).filter((x): x is string => !!x),
    [zeroItems],
  );

  const auditQ = useQuery({
    enabled: productIds.length > 0,
    queryKey: ["zero-price-audit", salePriceTypeId, productIds.join(",")],
    queryFn: async () => {
      const [historyRes, computedRes] = await Promise.all([
        supabase
          .from("product_sale_price_history")
          .select("product_id, new_sale_price, created_at")
          .eq("sale_price_type_id", salePriceTypeId)
          .in("product_id", productIds)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("product_computed_prices_public")
          .select("product_id, rounded_sale_price")
          .eq("sale_price_type_id", salePriceTypeId)
          .in("product_id", productIds),
      ]);
      const latestHistory = new Map<string, number>();
      for (const r of historyRes.data ?? []) {
        if (!latestHistory.has(r.product_id)) {
          latestHistory.set(r.product_id, Number(r.new_sale_price ?? 0) || 0);
        }
      }
      const computed = new Map<string, number>();
      for (const r of (computedRes.data ?? []) as Array<{
        product_id: string;
        rounded_sale_price: number | string | null;
      }>) {
        computed.set(r.product_id, Number(r.rounded_sale_price ?? 0) || 0);
      }
      return { latestHistory, computed };
    },
  });

  const [publishingId, setPublishingId] = useState<string | null>(null);

  if (zeroItems.length === 0) return null;

  const handlePublish = async (productId: string) => {
    setPublishingId(productId);
    try {
      const r = await publishProductPrices({ productId, source: "sale_list_zero_fix" });
      if (r.succeeded > 0) {
        toast.success("قیمت محاسبه و منتشر شد. لیست به‌صورت خودکار به‌روزرسانی می‌شود.");
        onPublished();
      } else {
        const firstErr = r.results.find((x) => !x.ok)?.error ?? "خطای ناشناخته";
        toast.error(`انتشار ناموفق بود: ${firstErr}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در انتشار قیمت");
    } finally {
      setPublishingId(null);
    }
  };

  return (
    <Card className="mb-3 border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30">
      <CardContent className="space-y-2 p-3 text-sm">
        <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          {formatNumber(zeroItems.length)} محصول بدون قیمت معتبر در این لیست
        </div>
        <div className="text-xs text-amber-800/80 dark:text-amber-200/80">
          این محصولات در PDF و صفحه عمومی با قیمت صفر نمایش داده می‌شوند. در صورتی که قیمت
          محاسبه‌شده موجود است، با دکمه «انتشار» آن را در تاریخچه قیمت ثبت کنید تا لیست خودکار
          به‌روزرسانی شود.
        </div>
        <ul className="divide-y divide-amber-200/60 dark:divide-amber-800/40">
          {zeroItems.map((it) => {
            const pid = it.product?.id ?? "";
            const computed = auditQ.data?.computed.get(pid) ?? 0;
            const hasComputed = computed > 0;
            return (
              <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="font-medium">{it.product?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {it.product?.sku ?? "—"}
                    {hasComputed && (
                      <span className="mr-2">
                        • قیمت محاسبه‌شده: {formatCurrency(computed, "تومان")}
                      </span>
                    )}
                    {!hasComputed && auditQ.isFetched && (
                      <span className="mr-2 text-rose-600 dark:text-rose-400">
                        • قیمت پایه/قانون قیمت‌گذاری ثبت نشده
                      </span>
                    )}
                  </div>
                </div>
                {canPublish && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={publishingId === pid}
                    onClick={() => handlePublish(pid)}
                  >
                    {publishingId === pid ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    انتشار قیمت
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ---------- Tab 1: Items ---------- */
function ItemsTab({ items, loading }: { items: SaleListItemRow[]; loading: boolean }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const slice = useMemo(() => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [items, page]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        هیچ آیتمی در این لیست وجود ندارد.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">مجموع: {formatNumber(items.length)} محصول</div>

      {/* Desktop */}
      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">ردیف</TableHead>
              <TableHead className="text-right">نام محصول</TableHead>
              <TableHead className="text-right">SKU</TableHead>
              <TableHead className="text-right">برند</TableHead>
              <TableHead className="text-right">دسته</TableHead>
              <TableHead className="text-right">موجودی</TableHead>
              <TableHead className="text-right">قیمت قبلی</TableHead>
              <TableHead className="text-right">قیمت فعلی</TableHead>
              <TableHead className="text-right">تغییر</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((it, idx) => (
              <TableRow key={it.id}>
                <TableCell className="text-xs">
                  {formatNumber((page - 1) * PAGE_SIZE + idx + 1)}
                </TableCell>
                <TableCell className="font-medium">
                  {it.product ? (
                    <Link
                      to="/products/$id"
                      params={{ id: it.product.id }}
                      className="hover:underline"
                    >
                      {it.product.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {it.product?.sku ?? "—"}
                </TableCell>
                <TableCell>{it.product?.brand?.name ?? "—"}</TableCell>
                <TableCell>{it.product?.category?.name ?? "—"}</TableCell>
                <TableCell>
                  {it.stock_status ? (
                    <Badge
                      variant={STOCK_STATUS_VARIANTS[it.stock_status as StockStatus] ?? "secondary"}
                    >
                      {STOCK_STATUS_LABELS[it.stock_status as StockStatus] ?? it.stock_status}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {it.previous_price !== null
                    ? formatCurrency(Number(it.previous_price), "تومان")
                    : "—"}
                </TableCell>
                <TableCell className="font-semibold">
                  {formatCurrency(Number(it.current_price), "تومان")}
                </TableCell>
                <TableCell>
                  <ChangeCell amount={it.change_amount} percent={it.change_percent} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <div className="space-y-2 md:hidden">
        {slice.map((it, idx) => (
          <Card key={it.id}>
            <CardContent className="space-y-2 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">
                    ردیف {formatNumber((page - 1) * PAGE_SIZE + idx + 1)}
                  </div>
                  <div className="font-semibold">
                    {it.product ? (
                      <Link
                        to="/products/$id"
                        params={{ id: it.product.id }}
                        className="hover:underline"
                      >
                        {it.product.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {it.product?.sku ?? "—"} • {it.product?.brand?.name ?? "بدون برند"}
                  </div>
                </div>
                {it.stock_status && (
                  <Badge
                    variant={STOCK_STATUS_VARIANTS[it.stock_status as StockStatus] ?? "secondary"}
                  >
                    {STOCK_STATUS_LABELS[it.stock_status as StockStatus] ?? it.stock_status}
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <div className="text-xs">
                  <div>
                    قبلی:{" "}
                    {it.previous_price !== null
                      ? formatCurrency(Number(it.previous_price), "تومان")
                      : "—"}
                  </div>
                  <div className="font-semibold">
                    فعلی: {formatCurrency(Number(it.current_price), "تومان")}
                  </div>
                </div>
                <ChangeCell amount={it.change_amount} percent={it.change_percent} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="text-xs text-muted-foreground">
            صفحه {formatNumber(page)} از {formatNumber(totalPages)}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronRight className="h-4 w-4" /> قبلی
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              بعدی <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeCell({ amount, percent }: { amount: number | null; percent: number | null }) {
  if (amount === null || amount === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const n = Number(amount);
  if (n === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> بدون تغییر
      </span>
    );
  }
  if (n > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400">
        <TrendingUp className="h-3 w-3" />+{formatCurrency(n, "تومان")}
        {percent !== null && <span>({formatNumber(Number(percent))}٪)</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
      <TrendingDown className="h-3 w-3" />
      {formatCurrency(n, "تومان")}
      {percent !== null && <span>({formatNumber(Number(percent))}٪)</span>}
    </span>
  );
}

/* ---------- Tab 2: Versions ---------- */
interface SnapshotItem {
  product_id: string;
  product_name: string;
  current_price: number;
}
function VersionsTab({
  versions,
  loading,
  currentVersion,
}: {
  versions: VersionRow[];
  loading: boolean;
  currentVersion: number;
}) {
  const [aId, setAId] = useState<string>("");
  const [bId, setBId] = useState<string>("");
  const [viewVersion, setViewVersion] = useState<VersionRow | null>(null);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        هنوز نسخه‌ای از این لیست ثبت نشده است.
        <div className="mt-1 text-xs">با اولین ویرایش، نسخه‌بندی فعال می‌شود.</div>
      </div>
    );
  }

  const a = versions.find((v) => v.id === aId) ?? null;
  const b = versions.find((v) => v.id === bId) ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="text-sm font-semibold">مقایسه دو نسخه</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">نسخه قدیم</Label>
              <Select value={aId} onValueChange={setAId}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب نسخه قدیم" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      نسخه {formatNumber(v.version_number)} — {formatDateTimeFa(v.created_at)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">نسخه جدید</Label>
              <Select value={bId} onValueChange={setBId}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب نسخه جدید" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      نسخه {formatNumber(v.version_number)} — {formatDateTimeFa(v.created_at)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {a && b && a.id !== b.id ? (
            <DiffView a={a} b={b} />
          ) : (
            <div className="text-xs text-muted-foreground">
              دو نسخه متفاوت برای مقایسه انتخاب کنید.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">شماره نسخه</TableHead>
              <TableHead className="text-right">تاریخ ایجاد</TableHead>
              <TableHead className="text-right">تعداد آیتم‌ها</TableHead>
              <TableHead className="text-right">عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((v) => {
              const itemsCount = Array.isArray(v.snapshot_data?.items)
                ? v.snapshot_data.items.length
                : 0;
              return (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">
                    v{formatNumber(v.version_number)}
                    {v.version_number === currentVersion && (
                      <Badge variant="outline" className="mr-2 text-[10px]">
                        فعلی
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{formatDateTimeFa(v.created_at)}</TableCell>
                  <TableCell>{formatNumber(itemsCount)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewVersion(v)}
                      className="gap-1"
                    >
                      <Eye className="h-4 w-4" /> مشاهده
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!viewVersion} onOpenChange={(o) => !o && setViewVersion(null)}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              مشاهده نسخه {viewVersion ? formatNumber(viewVersion.version_number) : ""}
            </DialogTitle>
            <DialogDescription>
              {viewVersion ? formatDateTimeFa(viewVersion.created_at) : ""}
            </DialogDescription>
          </DialogHeader>
          {viewVersion && <SnapshotPreview snapshot={viewVersion.snapshot_data} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SnapshotPreview({ snapshot }: { snapshot: any }) {
  const items: SnapshotItem[] = Array.isArray(snapshot?.items) ? snapshot.items : [];
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground">نام:</span> {snapshot?.name ?? "—"}
        </div>
        <div>
          <span className="text-muted-foreground">تعداد آیتم:</span> {formatNumber(items.length)}
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">نام محصول</TableHead>
              <TableHead className="text-right">قیمت فعلی</TableHead>
              <TableHead className="text-right">قیمت قبلی</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it: any, idx: number) => (
              <TableRow key={`${it.product_id}-${idx}`}>
                <TableCell>{it.product_name ?? "—"}</TableCell>
                <TableCell>{formatCurrency(Number(it.current_price ?? 0), "تومان")}</TableCell>
                <TableCell>
                  {it.previous_price !== null && it.previous_price !== undefined
                    ? formatCurrency(Number(it.previous_price), "تومان")
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DiffView({ a, b }: { a: VersionRow; b: VersionRow }) {
  const aItems: any[] = Array.isArray(a.snapshot_data?.items) ? a.snapshot_data.items : [];
  const bItems: any[] = Array.isArray(b.snapshot_data?.items) ? b.snapshot_data.items : [];
  const aMap = new Map<string, any>(aItems.map((it: any) => [it.product_id, it]));
  const bMap = new Map<string, any>(bItems.map((it: any) => [it.product_id, it]));
  const allIds = Array.from(new Set([...aMap.keys(), ...bMap.keys()]));

  const rows = allIds.map((pid) => {
    const oldIt = aMap.get(pid);
    const newIt = bMap.get(pid);
    return {
      pid,
      name: newIt?.product_name ?? oldIt?.product_name ?? "—",
      oldPrice: oldIt ? Number(oldIt.current_price ?? 0) : null,
      newPrice: newIt ? Number(newIt.current_price ?? 0) : null,
    };
  });

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">محصول</TableHead>
            <TableHead className="text-right">نسخه قدیم</TableHead>
            <TableHead className="text-right">نسخه جدید</TableHead>
            <TableHead className="text-right">تغییر</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            let cls = "text-muted-foreground";
            let label = "بدون تغییر";
            let amount: number | null = null;
            if (r.oldPrice === null && r.newPrice !== null) {
              cls = "text-emerald-600 dark:text-emerald-400";
              label = "افزوده شد";
            } else if (r.newPrice === null && r.oldPrice !== null) {
              cls = "text-rose-600 dark:text-rose-400";
              label = "حذف شد";
            } else if (r.oldPrice !== null && r.newPrice !== null) {
              amount = r.newPrice - r.oldPrice;
              if (amount > 0) {
                cls = "text-rose-600 dark:text-rose-400";
                label = `+${formatCurrency(amount, "تومان")}`;
              } else if (amount < 0) {
                cls = "text-emerald-600 dark:text-emerald-400";
                label = formatCurrency(amount, "تومان");
              }
            }
            return (
              <TableRow key={r.pid}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>
                  {r.oldPrice !== null ? formatCurrency(r.oldPrice, "تومان") : "—"}
                </TableCell>
                <TableCell>
                  {r.newPrice !== null ? formatCurrency(r.newPrice, "تومان") : "—"}
                </TableCell>
                <TableCell className={cls}>{label}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/* ---------- Tab 3: Settings / Edit ---------- */
function SettingsTab({
  list,
  items,
  onSaved,
  onDeleted,
}: {
  list: SaleListDetail;
  items: SaleListItemRow[];
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");
  const [termsText, setTermsText] = useState(list.terms_text ?? "");
  const [sellerInfo, setSellerInfo] = useState(list.seller_info ?? "");
  // Settlement type is PDF/header metadata only — it never recalculates
  // product prices. Persisted on the sale_lists row so it survives reload.
  const [settlementTypeId, setSettlementTypeId] = useState<string>(
    list.settlement_type_id ?? "__none",
  );
  const settlementTypesQ = useQuery({
    queryKey: ["settlement-types-active"],
    queryFn: () => fetchSettlementTypes(true),
    staleTime: 60_000,
  });
  const sellerDefaultQ = useQuery({
    queryKey: ["shop-settings"],
    queryFn: fetchShopSettings,
    staleTime: 300_000,
  });
  const initialColumns =
    (list.selected_columns as ColumnKey[] | null) ?? COLUMN_OPTIONS.map((c) => c.key);
  const [selectedColumns, setSelectedColumns] = useState<ColumnKey[]>(initialColumns);
  const [productIds, setProductIds] = useState<string[]>(items.map((it) => it.product_id));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Keep state in sync if items prop changes (e.g. after refetch)
  const initialProductIdsKey = items.map((it) => it.product_id).join(",");
  useMemo(() => {
    setProductIds(items.map((it) => it.product_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProductIdsKey]);

  const toggleColumn = (key: ColumnKey) => {
    const opt = COLUMN_OPTIONS.find((c) => c.key === key);
    if (opt?.locked) return;
    setSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
    );
  };

  const hasChanges = useMemo(() => {
    if (name.trim() !== list.name) return true;
    if ((description.trim() || null) !== (list.description ?? null)) return true;
    if ((termsText.trim() || null) !== (list.terms_text ?? null)) return true;
    if ((sellerInfo.trim() || null) !== (list.seller_info ?? null)) return true;
    const settlementSaved = list.settlement_type_id ?? null;
    const settlementCurrent = settlementTypeId === "__none" ? null : settlementTypeId;
    if (settlementSaved !== settlementCurrent) return true;
    const a = [...selectedColumns].sort().join(",");
    const b = [...initialColumns].sort().join(",");
    if (a !== b) return true;
    const p1 = [...productIds].sort().join(",");
    const p2 = [...items.map((it) => it.product_id)].sort().join(",");
    if (p1 !== p2) return true;
    return false;
  }, [
    name,
    description,
    termsText,
    sellerInfo,
    settlementTypeId,
    selectedColumns,
    productIds,
    items,
    list,
    initialColumns,
  ]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("نام لیست الزامی است.");
      return;
    }
    if (productIds.length === 0) {
      toast.error("حداقل یک محصول لازم است.");
      return;
    }
    if (selectedColumns.length === 0) {
      toast.error("حداقل یک ستون باید انتخاب شود.");
      return;
    }
    if (!hasChanges) {
      toast.message("تغییری برای ذخیره وجود ندارد.");
      return;
    }

    setSaving(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("کاربر شناسایی نشد.");

      // Fetch latest sale prices for all selected products
      const { data: priceRows, error: priceErr } = await supabase
        .from("product_sale_price_history")
        .select("product_id, new_sale_price, old_sale_price, created_at")
        .eq("sale_price_type_id", list.sale_price_type_id)
        .in("product_id", productIds)
        .order("created_at", { ascending: false });
      if (priceErr) throw priceErr;

      const priceMap = new Map<string, { current: number; previous: number | null }>();
      for (const row of priceRows ?? []) {
        if (!priceMap.has(row.product_id)) {
          priceMap.set(row.product_id, {
            current: Number(row.new_sale_price ?? 0) || 0,
            previous:
              row.old_sale_price === null || row.old_sale_price === undefined
                ? null
                : Number(row.old_sale_price),
          });
        }
      }

      // Fetch product info for snapshot
      const { data: prodRows, error: prodErr } = await supabase
        .from("products")
        .select("id, name, sku, stock_status, brand:brands(name), category:categories(name)")
        .in("id", productIds);
      if (prodErr) throw prodErr;
      const prodMap = new Map<string, any>((prodRows ?? []).map((p: any) => [p.id, p]));

      const newVersionNumber = list.version_number + 1;

      // Build snapshot
      const snapItems = productIds.map((pid) => {
        const pe = priceMap.get(pid);
        const p = prodMap.get(pid);
        const current = pe?.current ?? 0;
        const previous = pe?.previous ?? null;
        const change_amount = previous !== null ? current - previous : null;
        const change_percent =
          previous && previous !== 0
            ? Number((((current - previous) / previous) * 100).toFixed(2))
            : null;
        return {
          product_id: pid,
          product_name: p?.name ?? "",
          sku: p?.sku ?? null,
          brand_name: p?.brand?.name ?? null,
          category_name: p?.category?.name ?? null,
          current_price: current,
          previous_price: previous,
          change_amount,
          change_percent,
          stock_status: p?.stock_status ?? null,
        };
      });

      const snapshot = {
        name: trimmed,
        description: description.trim() || null,
        terms_text: termsText.trim() || null,
        seller_info: sellerInfo.trim() || null,
        sale_price_type_id: list.sale_price_type_id,
        settlement_type_id: settlementTypeId === "__none" ? null : settlementTypeId,
        selected_columns: selectedColumns,
        items: snapItems,
      };

      // Insert version snapshot
      const { error: vErr } = await supabase.from("sale_list_versions").insert({
        sale_list_id: list.id,
        version_number: newVersionNumber,
        snapshot_data: snapshot,
        created_by: userData.user.id,
      });
      if (vErr) throw vErr;

      // Delete old items, insert new
      const { error: delErr } = await supabase
        .from("sale_list_items")
        .delete()
        .eq("sale_list_id", list.id);
      if (delErr) throw delErr;

      const newItems = productIds.map((pid, idx) => {
        const pe = priceMap.get(pid);
        const p = prodMap.get(pid);
        const current = pe?.current ?? 0;
        const previous = pe?.previous ?? null;
        const change_amount = previous !== null ? current - previous : null;
        const change_percent =
          previous && previous !== 0
            ? Number((((current - previous) / previous) * 100).toFixed(2))
            : null;
        return {
          sale_list_id: list.id,
          product_id: pid,
          current_price: current,
          previous_price: previous,
          change_amount,
          change_percent,
          stock_status: p?.stock_status ?? null,
          sort_order: idx,
        };
      });
      if (newItems.length > 0) {
        const { error: iErr } = await supabase.from("sale_list_items").insert(newItems);
        if (iErr) throw iErr;
      }

      // Update list metadata + version_number
      const { error: uErr } = await supabase
        .from("sale_lists")
        .update({
          name: trimmed,
          description: description.trim() || null,
          terms_text: termsText.trim() || null,
          seller_info: sellerInfo.trim() || null,
          settlement_type_id: settlementTypeId === "__none" ? null : settlementTypeId,
          selected_columns: selectedColumns,
          version_number: newVersionNumber,
        })
        .eq("id", list.id);
      if (uErr) throw uErr;

      toast.success(`تغییرات ذخیره شد. نسخه ${formatNumber(newVersionNumber)} ایجاد شد.`);
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطا در ذخیره تغییرات.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1">
            <Label htmlFor="ed-name">نام لیست *</Label>
            <Input
              id="ed-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ed-desc">توضیحات</Label>
            <Textarea
              id="ed-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ed-terms">شرایط فروش</Label>
            <Textarea
              id="ed-terms"
              value={termsText}
              onChange={(e) => setTermsText(e.target.value)}
              rows={4}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ed-seller">اطلاعات فروشنده (درج‌شده در PDF)</Label>
              {sellerDefaultQ.data?.default_seller_info ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSellerInfo(sellerDefaultQ.data!.default_seller_info)}
                >
                  استفاده از مقدار پیش‌فرض
                </Button>
              ) : null}
            </div>
            <Textarea
              id="ed-seller"
              value={sellerInfo}
              onChange={(e) => setSellerInfo(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="نام، شماره تماس و سمت فروشنده (اختیاری، حداکثر ۵۰۰ کاراکتر)"
              dir="rtl"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ed-settlement">نوع تسویه (نمایش در PDF)</Label>
            <Select
              value={settlementTypeId}
              onValueChange={(v) => setSettlementTypeId(v)}
              dir="rtl"
            >
              <SelectTrigger id="ed-settlement">
                <SelectValue placeholder="انتخاب نوع تسویه" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— بدون نوع تسویه —</SelectItem>
                {(settlementTypesQ.data ?? []).map((s: { id: string; title: string }) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-[11px] text-muted-foreground">
              این مقدار فقط در سربرگ PDF لیست فروش نمایش داده می‌شود و در محاسبه قیمت محصولات تأثیری
              ندارد.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="text-sm font-semibold">ستون‌های نمایشی</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {COLUMN_OPTIONS.map((opt) => {
              const checked = selectedColumns.includes(opt.key);
              return (
                <label
                  key={opt.key}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border border-border p-3 text-sm ${opt.locked ? "opacity-70" : ""}`}
                >
                  <Checkbox
                    checked={checked}
                    disabled={opt.locked}
                    onCheckedChange={() => toggleColumn(opt.key)}
                  />
                  <span>{opt.label}</span>
                  {opt.locked && (
                    <span className="mr-auto text-[10px] text-muted-foreground">(الزامی)</span>
                  )}
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">محصولات لیست</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
              className="gap-1"
            >
              <Plus className="h-4 w-4" /> ویرایش محصولات
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            تعداد فعلی: {formatNumber(productIds.length)} محصول
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button onClick={handleSave} disabled={saving || !hasChanges} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          ذخیره تغییرات (نسخه جدید)
        </Button>
      </div>

      <ProductPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        salePriceTypeId={list.sale_price_type_id}
        initialSelectedIds={productIds}
        onConfirm={(ids) => {
          setProductIds(ids);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

/* ---------- Product picker (Sheet) — wizard-like single step ---------- */
function ProductPickerSheet({
  open,
  onOpenChange,
  salePriceTypeId,
  initialSelectedIds,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  salePriceTypeId: string;
  initialSelectedIds: string[];
  onConfirm: (ids: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 350);
  const [brandId, setBrandId] = useState<string>("__all");
  const [categoryId, setCategoryId] = useState<string>("__all");
  const [stockStatus, setStockStatus] = useState<string>("__all");
  const [productType, setProductType] = useState<string>("__all");
  const [page, setPage] = useState(1);

  // Re-sync selected when sheet opens
  useMemo(() => {
    if (open) setSelectedIds(initialSelectedIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const brandsQ = useQuery({
    queryKey: ["brands-lite"],
    queryFn: fetchBrandsLite,
    staleTime: 60_000,
  });
  const categoriesQ = useQuery({
    queryKey: ["categories-lite"],
    queryFn: fetchCategoriesLite,
    staleTime: 60_000,
  });

  const productsQ = useQuery({
    queryKey: [
      "sale-list-edit-products",
      search,
      brandId,
      categoryId,
      stockStatus,
      productType,
      page,
    ],
    enabled: open,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("products")
        .select(
          "id, name, sku, product_type, stock_status, brand:brands(id, name), category:categories(id, name)",
          { count: "exact" },
        )
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .range(from, to);
      if (search) {
        const safe = search.replace(/[%_]/g, "");
        q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`);
      }
      if (brandId !== "__all") q = q.eq("brand_id", brandId);
      if (categoryId !== "__all") q = q.eq("category_id", categoryId);
      if (stockStatus !== "__all") q = q.eq("stock_status", stockStatus as StockStatus);
      if (productType !== "__all") q = q.eq("product_type", productType as ProductType);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as any[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const rows = productsQ.data?.rows ?? [];
  const total = productsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const visiblePricesQ = useQuery({
    queryKey: ["edit-prices", salePriceTypeId, rows.map((r: any) => r.id).join(",")],
    enabled: open && !!salePriceTypeId && rows.length > 0,
    queryFn: async () => {
      const ids = rows.map((r: any) => r.id);
      const { data, error } = await supabase
        .from("product_sale_price_history")
        .select("product_id, new_sale_price, created_at")
        .eq("sale_price_type_id", salePriceTypeId)
        .in("product_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of data ?? []) {
        if (!map.has(row.product_id)) map.set(row.product_id, Number(row.new_sale_price ?? 0));
      }
      return map;
    },
    staleTime: 10_000,
  });

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const removeAll = () => setSelectedIds([]);
  const allVisibleSelected = rows.length > 0 && rows.every((r: any) => selectedIds.includes(r.id));
  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !rows.some((r: any) => r.id === id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...rows.map((r: any) => r.id)])));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-full flex-col gap-3 sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>ویرایش محصولات لیست</SheetTitle>
          <SheetDescription>
            محصولات را اضافه یا حذف کنید. در صورت تغییر، با ذخیره، نسخه جدیدی ساخته می‌شود.
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              placeholder="جستجو نام / SKU"
              className="pr-9"
            />
          </div>
          <Select
            value={brandId}
            onValueChange={(v) => {
              setBrandId(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="برند" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">همه برندها</SelectItem>
              {(brandsQ.data ?? [])
                .filter((b: any) => b.is_active)
                .map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select
            value={categoryId}
            onValueChange={(v) => {
              setCategoryId(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="دسته" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">همه دسته‌ها</SelectItem>
              {(categoriesQ.data ?? [])
                .filter((c: any) => c.is_active)
                .map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select
            value={stockStatus}
            onValueChange={(v) => {
              setStockStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="موجودی" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">همه</SelectItem>
              {Object.entries(STOCK_STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={productType}
            onValueChange={(v) => {
              setProductType(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="نوع کالا" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">همه</SelectItem>
              {Object.entries(PRODUCT_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-xs">
          <span>
            <strong>{formatNumber(selectedIds.length)}</strong> محصول انتخاب‌شده
          </span>
          {selectedIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={removeAll}
              className="gap-1 text-destructive"
            >
              <Trash2 className="h-3 w-3" /> حذف همه
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto rounded-md border border-border">
          {productsQ.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">محصولی یافت نشد.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} />
                  </TableHead>
                  <TableHead className="text-right">محصول</TableHead>
                  <TableHead className="text-right">قیمت روز</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => {
                  const checked = selectedIds.includes(r.id);
                  const price = visiblePricesQ.data?.get(r.id);
                  return (
                    <TableRow key={r.id} className={checked ? "bg-muted/30" : ""}>
                      <TableCell>
                        <Checkbox checked={checked} onCheckedChange={() => toggleOne(r.id)} />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {r.sku ?? "—"} • {r.brand?.name ?? "بدون برند"}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {price ? formatCurrency(price, "تومان") : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            صفحه {formatNumber(page)} از {formatNumber(totalPages)}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={() => onConfirm(selectedIds)} disabled={selectedIds.length === 0}>
            تأیید انتخاب
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
