import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PlayCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
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
        title="اتوماسیون فاز صفر"
        description="ایجاد دستور dummy برای worker — فقط ماژول dummy_worker (بدون ربات واقعی)"
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          این صفحه فقط برای پذیرش فاز صفر (E1) است. هیچ اتصال خارجی، ربات واقعی، یا سرویس موازی
          ایجاد نمی‌شود. ایجاد دستور از طریق سرور انجام می‌شود.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            با کلیک روی دکمه زیر، یک ردیف <code className="text-xs">PENDING</code> از نوع{" "}
            <code className="text-xs">DUMMY_RUN</code> برای ماژول{" "}
            <code className="text-xs">dummy_worker</code> در جدول{" "}
            <code className="text-xs">automation_jobs</code> ایجاد می‌شود.
          </p>

          <Button onClick={handleEnqueue} disabled={loading} className="gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
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
