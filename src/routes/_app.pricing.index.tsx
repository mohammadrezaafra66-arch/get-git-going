import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  TrendingUp,
  Tag,
  FileText,
  Calculator,
  Truck,
  AlertCircle,
  ArrowLeft,
  Layers,
  ListChecks,
  Zap,
  Wallet,
  Monitor,
  BarChart3,
  Sparkles,
  RefreshCw,
  Coins,
} from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber, formatDateFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/pricing/")({
  beforeLoad: async () => {
    await requirePermission("pricing", "view");
  },
  component: PricingHubPage,
});

function PricingHubPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["pricing-overview"],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const [
        productsTotal,
        productsWithPrice,
        usdRate,
        aedRate,
        activeRules,
        saleListsTotal,
        saleListsPublished,
      ] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase
          .from("purchase_prices")
          .select("product_id", { count: "exact", head: true })
          .eq("is_active", true),
        supabase
          .from("currency_rates")
          .select("rate_to_toman, effective_at")
          .eq("currency", "usd")
          .eq("is_active", true)
          .lte("effective_at", nowIso)
          .order("effective_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("currency_rates")
          .select("rate_to_toman, effective_at")
          .eq("currency", "aed")
          .eq("is_active", true)
          .lte("effective_at", nowIso)
          .order("effective_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("pricing_rules")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
        supabase.from("sale_lists").select("id", { count: "exact", head: true }),
        supabase
          .from("sale_lists")
          .select("id", { count: "exact", head: true })
          .eq("status", "published"),
      ]);
      return {
        productsTotal: productsTotal.count ?? 0,
        productsWithPrice: productsWithPrice.count ?? 0,
        usd: usdRate.data,
        aed: aedRate.data,
        activeRules: activeRules.count ?? 0,
        saleListsTotal: saleListsTotal.count ?? 0,
        saleListsPublished: saleListsPublished.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  const productsWithoutPrice = Math.max(
    0,
    (data?.productsTotal ?? 0) - (data?.productsWithPrice ?? 0),
  );

  const tiles = [
    {
      to: "/pricing/currency-rates",
      label: "نرخ ارز",
      icon: TrendingUp,
      desc: "ثبت نرخ روز دلار و درهم",
      enabled: true,
    },
    {
      to: "/pricing/market-rates-workshop",
      label: "کارگاه نرخ ارز و طلا",
      icon: Coins,
      desc: "پایش نرخ‌های مهم بازار (ادمین/مدیر/حسابدار: ثبت و مشاهده کامل، فروشنده: مشاهده عمومی)",
      enabled: true,
    },
    {
      to: "/pricing/purchase-prices",
      label: "قیمت خرید",
      icon: Tag,
      desc: "ثبت و مشاهده قیمت‌های خرید",
      enabled: true,
    },
    {
      to: "/pricing/sale-price-types",
      label: "انواع قیمت فروش",
      icon: Layers,
      desc: "تعریف نقدی، چکی، همکار و ...",
      enabled: true,
    },
    {
      to: "/pricing/settlement-types",
      label: "انواع تسویه",
      icon: Wallet,
      desc: "روش‌های تسویه (نقدی، چکی، همکار)",
      enabled: true,
    },
    {
      to: "/pricing/rules",
      label: "قوانین قیمت‌گذاری",
      icon: FileText,
      desc: "تعریف قوانین حاشیه سود",
      enabled: true,
    },
    {
      to: "/pricing/shipping-rules",
      label: "قوانین حمل",
      icon: Truck,
      desc: "هزینه حمل بر اساس شرایط",
      enabled: true,
    },
    {
      to: "/pricing/change-reasons",
      label: "دلایل تغییر قیمت",
      icon: AlertCircle,
      desc: "مدیریت دلایل ثبت قیمت",
      enabled: true,
    },
    {
      to: "/pricing/calculator",
      label: "تست محاسبه قیمت",
      icon: Calculator,
      desc: "اجرای موتور قیمت‌گذاری",
      enabled: true,
    },
    {
      to: "/pricing/live-price-list",
      label: "لیست قیمت زنده",
      icon: ListChecks,
      desc: "مشاهده آخرین قیمت فروش محصولات",
      enabled: true,
    },
    {
      to: "/pricing/amin-hozoor-board",
      label: "تابلوی قیمت فروش امین حضور",
      icon: Monitor,
      desc: "نمایش زنده قیمت‌های منتخب برای همکاران عمده‌فروش",
      enabled: true,
    },
    {
      to: "/pricing/market-intelligence",
      label: "داشبورد هوشمند بازار",
      icon: BarChart3,
      desc: "محصولات داغ، تغییرات قیمت و شاخص بازار افراکالا",
      enabled: true,
    },
    {
      to: "/pricing/price-alerts",
      label: "مرکز هشدار قیمت",
      icon: AlertCircle,
      desc: "ساخت شرط هشدار سفارشی برای تغییرات قیمت محصولات",
      enabled: true,
    },
    {
      to: "/pricing/product-recommendations",
      label: "مدیریت پیشنهاد محصولات",
      icon: Sparkles,
      desc: "پین/حذف/اولویت پیشنهادهای خودکار سیستم برای هر محصول (admin/manager)",
      enabled: true,
    },
    {
      to: "/pricing/quick-price",
      label: "محاسبه سریع قیمت",
      icon: Zap,
      desc: "محاسبه قیمت فروش برای کالای خارج از لیست",
      enabled: true,
    },
    {
      to: "/pricing/recompute-prices",
      label: "انتشار قیمت فروش (دسته‌ای)",
      icon: RefreshCw,
      desc: "محاسبه و ذخیرهٔ قیمت فروش برای همهٔ محصولات تا در /sales/search دیده شود",
      enabled: true,
    },
    {
      to: "/pricing/sale-lists",
      label: "لیست‌های فروش",
      icon: FileText,
      desc: `مدیریت و انتشار لیست‌های رسمی فروش${data ? ` — ${formatNumber(data.saleListsTotal)} لیست (${formatNumber(data.saleListsPublished)} منتشرشده)` : ""}`,
      enabled: true,
    },
    {
      to: "/pricing/owner-attention",
      label: "گزارش رسیدگی مسئولان",
      icon: AlertCircle,
      desc: "محصولات مسئول‌دار بدون قیمت خرید، ناموجود، یا بیش از ۲ روز آپدیت‌نشده",
      enabled: true,
    },
  ] as const;

  return (
    <div className="space-y-5">
      <PageHeader
        title="موتور قیمت‌گذاری افراکالا"
        description="مدیریت نرخ ارز، قیمت خرید، قوانین قیمت‌گذاری و محاسبه قیمت فروش"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          label="محصولات با قیمت خرید"
          value={isLoading ? "..." : formatNumber(data?.productsWithPrice ?? 0)}
        />
        <SummaryCard
          label="محصولات بدون قیمت خرید"
          value={isLoading ? "..." : formatNumber(productsWithoutPrice)}
          variant={productsWithoutPrice > 0 ? "warning" : "default"}
        />
        <SummaryCard
          label="آخرین نرخ دلار"
          value={data?.usd ? `${formatNumber(Number(data.usd.rate_to_toman))} ت` : "—"}
          hint={data?.usd ? formatDateFa(data.usd.effective_at) : "ثبت نشده"}
        />
        <SummaryCard
          label="آخرین نرخ درهم"
          value={data?.aed ? `${formatNumber(Number(data.aed.rate_to_toman))} ت` : "—"}
          hint={data?.aed ? formatDateFa(data.aed.effective_at) : "ثبت نشده"}
        />
        <SummaryCard
          label="قوانین فعال"
          value={isLoading ? "..." : formatNumber(data?.activeRules ?? 0)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const inner = (
            <Card
              className={`h-full transition-colors ${t.enabled ? "hover:border-primary/40 hover:bg-muted/30" : "opacity-60"}`}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <t.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">{t.label}</span>
                    {t.enabled ? (
                      <ArrowLeft className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
                    ) : (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        به‌زودی
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
                </div>
              </CardContent>
            </Card>
          );
          return t.enabled ? (
            <Link key={t.to} to={t.to} className="group">
              {inner}
            </Link>
          ) : (
            <div key={t.to} className="cursor-not-allowed">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  variant = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  variant?: "default" | "warning";
}) {
  return (
    <Card className={variant === "warning" ? "border-amber-500/40" : undefined}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <DollarSign className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
