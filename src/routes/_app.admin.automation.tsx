import { useState } from "react";
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
import type { EnqueueDummyJobResult } from "@/lib/automation/enqueue-dummy-job.server";

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
  { label: "Live evidence", value: "در انتظار لینک محصول واقعی" },
];

const GUARDRAILS = [
  "فقط خواندن اطلاعات عمومی",
  "بدون ورود، نشست، کوکی یا رمز",
  "بدون مرورگر خودکار و بدون زمان‌بندی",
  "حداکثر ۳ محصول در اجرای کنترل‌شده",
  "حداکثر ۱۰ درخواست و هم‌زمانی ۱",
  "خطای HTTP باید باعث توقف کنترل‌شده شود",
];

function AdminAutomationPage() {
  const enqueueFn = useServerFn(enqueueDummyAutomationJobFn);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<EnqueueDummyJobResult | null>(null);

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

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="مرکز اتوماسیون و ربات‌ها"
        description="نمای کنترل فاز صفر و آمادگی محدود ترب؛ اجرای واقعی از UI هنوز قفل است."
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          این صفحه فعلاً برای مشاهده وضعیت، کنترل گاردها و اجرای dummy فاز صفر است. اجرای واقعی ترب از UI
          فعال نشده و باید در مسیر کنترل‌شده worker و evidence انجام شود.
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
            <p>اجرای واقعی ترب از داخل پنل هنوز فعال نیست.</p>
            <p>گام بعدی باید ثبت evidence با لینک واقعی محصول و سپس طراحی API کنترل‌شده باشد.</p>
            <Button type="button" variant="outline" className="w-full gap-2" disabled>
              <Lock className="h-4 w-4" />
              اجرای ترب از UI قفل است
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
