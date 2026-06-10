import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Filter,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  PackageX,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/EmptyState";
import { useDebounce } from "@/hooks/use-debounce";
import { supabase } from "@/integrations/supabase/client";
import { fetchSalePriceTypes } from "@/lib/pricing/queries";
import { AMIN_HOZOOR_BOARD_KEY, fetchBoardSetting } from "@/lib/pricing/board-settings";
import { formatDateTimeFa, formatNumber, toFaDigits } from "@/lib/i18n/formatters";
import { BoardSettingsSelector } from "./BoardSettingsSelector";
import { BoardPriceTable } from "./BoardPriceTable";
import { BoardProductDetailsDrawer } from "./BoardProductDetailsDrawer";
import { useAminHozoorBoardPrices } from "@/hooks/pricing/useAminHozoorBoardPrices";
import { trackProductInteraction } from "@/lib/analytics/product-interactions";
import { usePricingBoardAccess } from "@/hooks/pricing/usePricingBoardAccess";
import { usePricingBoardPresence } from "@/hooks/pricing/usePricingBoardPresence";
import { BoardAccessPendingState } from "./BoardAccessPendingState";
import { BoardAccessRequestsCard } from "./BoardAccessRequestsCard";
import { BoardOnlineUsersCard } from "./BoardOnlineUsersCard";

const REFETCH_INTERVAL_MS = 20_000;
const DEFAULT_PAGE_SIZE = 50;
const KIOSK_PAGE_SIZE = 100;

export function AminHozoorPriceBoard() {
  const access = usePricingBoardAccess(AMIN_HOZOOR_BOARD_KEY);
  const [search, setSearch] = useState("");
  const dSearch = useDebounce(search, 350);
  const [brandId, setBrandId] = useState<string>("__all");
  const [categoryId, setCategoryId] = useState<string>("__all");
  const [stockFilter, setStockFilter] = useState<"both" | "available" | "limited">("both");
  const [changedTodayOnly, setChangedTodayOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [kioskMode, setKioskMode] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  // reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [dSearch, brandId, categoryId, stockFilter, changedTodayOnly]);

  const settingQuery = useQuery({
    queryKey: ["pricing-board-setting", AMIN_HOZOOR_BOARD_KEY],
    queryFn: () => fetchBoardSetting(AMIN_HOZOOR_BOARD_KEY),
    staleTime: 30_000,
  });
  const sptQuery = useQuery({
    queryKey: ["sale-price-types-active"],
    queryFn: () => fetchSalePriceTypes(true),
    staleTime: 5 * 60_000,
  });

  const salePriceTypeId = settingQuery.data?.sale_price_type_id ?? null;
  const salePriceTypeTitle =
    sptQuery.data?.find((t: any) => t.id === salePriceTypeId)?.title ?? "—";

  // presence فقط برای کاربر approved
  usePricingBoardPresence({
    boardKey: AMIN_HOZOOR_BOARD_KEY,
    enabled: access.isApproved,
    salePriceTypeId,
  });

  const { data: brands = [] } = useQuery({
    queryKey: ["brands-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name")
        .eq("is_active", true)
        .order("name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("is_active", true)
        .order("name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const pageSize = kioskMode ? KIOSK_PAGE_SIZE : DEFAULT_PAGE_SIZE;

  const { items, total, isLoading, isFetching, lastFetchedAt, refetch } = useAminHozoorBoardPrices({
    salePriceTypeId,
    page,
    pageSize,
    search: dSearch,
    brandId: brandId === "__all" ? null : brandId,
    categoryId: categoryId === "__all" ? null : categoryId,
    stockStatus: stockFilter === "both" ? null : stockFilter,
    changedTodayOnly,
    refetchInterval: REFETCH_INTERVAL_MS,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize + 1;

  // analytics: board_price_viewed for currently rendered items
  useEffect(() => {
    if (!salePriceTypeId) return;
    for (const it of items as any[]) {
      const pid = it?.product?.id ?? it?.product_id ?? it?.id;
      if (!pid) continue;
      trackProductInteraction({
        productId: pid,
        eventType: "board_price_viewed",
        source: "amin_hozoor_board",
        salePriceTypeId,
      });
    }
  }, [items, salePriceTypeId]);

  // ESC برای خروج از حالت نمایشگر
  useEffect(() => {
    if (!kioskMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setKioskMode(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [kioskMode]);

  const containerCls = kioskMode
    ? "fixed inset-0 z-50 overflow-y-auto bg-background p-6"
    : "space-y-5";

  // gating: اگر کاربر approved نیست، صفحه تابلو را نمایش نده
  if (!access.isApproved) {
    return (
      <div className="space-y-5" dir="rtl">
        <h1 className="text-2xl font-bold">تابلوی قیمت فروش امین حضور</h1>
        <BoardAccessPendingState
          status={
            access.status === "rejected"
              ? "rejected"
              : access.status === "loading" || access.status === "unauthenticated"
                ? "loading"
                : "pending"
          }
        />
      </div>
    );
  }

  return (
    <div className={containerCls} dir="rtl">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className={kioskMode ? "text-3xl font-extrabold" : "text-2xl font-bold"}>
            تابلوی قیمت فروش امین حضور
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              آخرین به‌روزرسانی: {formatDateTimeFa(lastFetchedAt ? new Date(lastFetchedAt) : null)}
            </span>
            <span>•</span>
            <span>به‌روزرسانی خودکار هر {toFaDigits(REFETCH_INTERVAL_MS / 1000)} ثانیه</span>
            {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          <div className="mt-1 text-sm">
            نوع قیمت نمایش‌داده‌شده:{" "}
            <Badge variant="outline" className="text-sm">
              {salePriceTypeTitle}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`ml-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            تازه‌سازی
          </Button>
          <Button
            variant={kioskMode ? "secondary" : "default"}
            size="sm"
            onClick={() => setKioskMode((v) => !v)}
          >
            {kioskMode ? (
              <Minimize2 className="ml-2 h-4 w-4" />
            ) : (
              <Maximize2 className="ml-2 h-4 w-4" />
            )}
            {kioskMode ? "خروج از حالت نمایشگر" : "حالت نمایشگر"}
          </Button>
        </div>
      </div>

      {!kioskMode && (
        <Card>
          <CardContent className="p-4">
            <BoardSettingsSelector />
          </CardContent>
        </Card>
      )}

      {!kioskMode && access.canManage && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BoardAccessRequestsCard />
          <BoardOnlineUsersCard />
        </div>
      )}

      {/* Filters (در حالت کیوسک نمایش ندهیم) */}
      {!kioskMode && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4" /> فیلترها
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative sm:col-span-2 lg:col-span-2">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="جستجو بر اساس نام یا SKU (حداقل ۲ کاراکتر)"
                  className="pr-9"
                />
              </div>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger>
                  <SelectValue placeholder="برند" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">همه برندها</SelectItem>
                  {brands.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="دسته" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">همه دسته‌ها</SelectItem>
                  {categories.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="موجودی" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">موجود + محدود</SelectItem>
                  <SelectItem value="available">فقط موجود</SelectItem>
                  <SelectItem value="limited">فقط محدود</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={changedTodayOnly ? "yes" : "no"}
                onValueChange={(v) => setChangedTodayOnly(v === "yes")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="تغییر امروز" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">همه محصولات</SelectItem>
                  <SelectItem value="yes">فقط تغییرکرده امروز</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {!salePriceTypeId ? (
        <EmptyState
          icon={PackageX}
          title="نوع قیمت فروش انتخاب نشده"
          description="ابتدا نوع قیمت فروش تابلو را انتخاب کنید."
        />
      ) : isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری قیمت‌ها...
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={PackageX}
          title="محصولی برای نمایش وجود ندارد"
          description="با این فیلتر هیچ محصول موجودی برای نوع قیمت فعلی پیدا نشد."
        />
      ) : (
        <>
          <BoardPriceTable
            items={items}
            kioskMode={kioskMode}
            onOpenDetails={(id: string) => {
              trackProductInteraction({
                productId: id,
                eventType: "product_details_opened",
                source: "amin_hozoor_board",
                salePriceTypeId,
              });
              setDetailsId(id);
            }}
            startIndex={startIndex}
          />

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              نمایش {toFaDigits(items.length)} از {formatNumber(total)} محصول
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-xs">
                صفحه {toFaDigits(page)} از {toFaDigits(totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <BoardProductDetailsDrawer
        open={!!detailsId}
        onOpenChange={(v) => !v && setDetailsId(null)}
        productId={detailsId}
        salePriceTypeId={salePriceTypeId}
        salePriceTypeTitle={salePriceTypeTitle}
      />
    </div>
  );
}
