import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Info, Loader2, Lock, PlayCircle, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { enqueueDummyAutomationJobFn } from "@/lib/automation/enqueue-dummy-job.functions";
import { enqueueTorobReadonlyAutomationJobFn } from "@/lib/automation/enqueue-torob-readonly-job.functions";
import type { EnqueueDummyJobResult } from "@/lib/automation/enqueue-dummy-job.server";
import type { EnqueueTorobReadonlyJobResult } from "@/lib/automation/enqueue-torob-readonly-job.server";

export const Route = createFileRoute("/_app/admin/automation")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: AdminAutomationPage,
});

const TOROB_STATUS = [
  { label: "Skeleton", value: "پذیرفته شده" },
  { label: "Guarded readiness", value: "مرج شده" },
  { label: "Local tests", value: "115 passed" },
  { label: "Queue enqueue", value: "در حال آماده‌سازی" },
];

const GUARDRAILS = [
  "فقط خواندن اطلاعات عمومی",
  "بدون ورود، نشست، کوکی یا رمز",
  "بدون مرورگر خودکار و بدون زمان‌بندی",
  "حداکثر ۳ محصول در اجرای کنترل‌شده",
  "حداکثر ۱۰ درخواست و هم‌زمانی ۱",
  "خطای HTTP باید باعث توقف کنترل‌شده شود",
];

const PRODUCT_URL_PATTERN = /^https:\/\/(www\.)?torob\.com\/p\//;

function AdminAutomationPage() {
  const enqueueFn = useServerFn(enqueueDummyAutomationJobFn);
  const enqueueTorobFn = useServerFn(enqueueTorobReadonlyAutomationJobFn);
  const [loading, setLoading] = useState(false);
  const [torobLoading, setTorobLoading] = useState(false);
  const [productUrl, setProductUrl] = useState("");
  const [lastResult, setLastResult] = useState<EnqueueDummyJobResult | null>(null);
  const [lastTorobResult, setLastTorobResult] = useState<EnqueueTorobReadonlyJobResult | null>(null);

  const productUrlState = useMemo(() => {
    const value = productUrl.trim();
    if (!value) return { ok: false, label: "لینک محصول وارد نشده است" };
    if (value.includes("REPLACE_WITH_REAL_PRODUCT")) {
      return { ok: false, label: "placeholder قابل قبول نیست" };
    }
    if (!PRODUCT_URL_PATTERN.test(value)) {
      return { ok: false, label: "فقط لینک عمومی محصول ترب با قالب https://torob.com/p/... مجاز است" };
    }
    return { ok: true, label: "فرمت لینک قابل قبول است؛ فقط job در صف ساخته می‌شود" };
  }, [productUrl]);

  async function handleEnqueue() {
    setLoading(true);
    try {
      const result = await enqueueFn();
      setLastResult(result);
      toast.success("دستور dummy با موفقیت در صف قرار گرفت.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "خطا در ایجاد دستور dummy.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleTorobEnqueue() {
    if (!productUrlState.ok) {
      toast.error(productUrlState.label);
      return;
    }
    setTorobLoading(true);
    try {
      const result = await enqueueTorobFn({ data: { productUrl: productUrl.trim() } });
      setLastTorobResult(result);
      toast.success("دستور ترب در صف کنترل‌شده ثبت شد.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "خطا در ثبت دستور ترب.";
      toast.error(msg);
    } finally {
      setTorobLoading(false);
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="مرکز اتوماسیون و ربات‌ها"
        description="نمای کنترل فاز صفر و صف کنترل‌شده ترب؛ اجرای مستقیم از مرورگر انجام نمی‌شود."
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          این صفحه برای مشاهده وضعیت، کنترل گاردها، اجرای dummy فاز صفر و ثبت job کنترل‌شده ترب در صف است.
          درخواست ترب فقط به صورت PENDING در صف ذخیره می‌شود و اجرای آن با worker و evidence انجام می‌شود.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              وضعیت مسیر ترب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {TOROB_STATUS.map((item) => (
                <div key={item.label} className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="mt-2 text-sm font-semibold text-foreground">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-dashed bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-primary" />
                گاردهای فعال
              </div>
              <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                {GUARDRAILS.map((rule) => (
                  <li key={rule} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border bg-background p-4">
              <div className="mb-2 text-sm font-medium">ثبت job کنترل‌شده ترب در صف</div>
              <input
                dir="ltr"
                value={productUrl}
                onChange={(event) => setProductUrl(event.target.value)}
                placeholder="https://torob.com/p/..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className={`mt-2 text-xs ${productUrlState.ok ? "text-emerald-700" : "text-amber-700"}`}>
                {productUrlState.label}
              </div>
              <Button
                type="button"
                className="mt-3 gap-2"
                onClick={handleTorobEnqueue}
                disabled={torobLoading || !productUrlState.ok}
              >
                {torobLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                ثبت job ترب در صف
              </Button>

              {lastTorobResult && (
                <div className="mt-4 rounded-md border bg-muted/30 p-4 text-sm space-y-2">
                  <p className="font-medium">job ترب در صف ثبت شد</p>
                  <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">شناسه job</dt>
                      <dd className="font-mono text-xs break-all">{lastTorobResult.job.id}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">وضعیت</dt>
                      <dd>{lastTorobResult.job.status}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">نوع job</dt>
                      <dd>{lastTorobResult.job.job_type}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">اجرای مستقیم UI</dt>
                      <dd>{lastTorobResult.direct_ui_execution ? "بله" : "خیر"}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4 text-primary" />
              وضعیت اجرای UI
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>اجرای مستقیم ترب از داخل مرورگر فعال نیست.</p>
            <p>پنل فقط job کنترل‌شده می‌سازد؛ اجرای واقعی و ثبت evidence با worker انجام می‌شود.</p>
            <Button type="button" variant="outline" className="w-full gap-2" disabled>
              <Lock className="h-4 w-4" />
              اجرای مستقیم ترب از UI قفل است
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PlayCircle className="h-4 w-4 text-primary" />
            دستور dummy فاز صفر
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            با کلیک روی دکمه زیر، یک ردیف <code className="text-xs">PENDING</code> از نوع{" "}
            <code className="text-xs">DUMMY_RUN</code> برای ماژول <code className="text-xs">dummy_worker</code> در
            جدول <code className="text-xs">automation_jobs</code> ایجاد می‌شود.
          </p>

          <Button onClick={handleEnqueue} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            ایجاد دستور dummy
          </Button>

          {lastResult && (
            <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-2">
              <p className="font-medium">تأیید ایجاد دستور</p>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">شناسه دستور</dt>
                  <dd className="font-mono text-xs break-all">{lastResult.job.id}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">وضعیت</dt>
                  <dd>{lastResult.job.status}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">زمان ایجاد</dt>
                  <dd>{lastResult.job.created_at}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">ماژول</dt>
                  <dd>{lastResult.module_key}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">نوع دستور</dt>
                  <dd>{lastResult.job.job_type}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">ربات واقعی</dt>
                  <dd>{lastResult.real_bot_scope ? "بله" : "خیر"}</dd>
                </div>
              </dl>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
