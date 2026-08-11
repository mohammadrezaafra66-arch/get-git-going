import { Loader2 } from "lucide-react";
import { useWorkflowSettings } from "@/hooks/settings/useWorkflowSettings";
import { WorkflowSettingRow } from "./WorkflowSettingRow";

export function WorkflowSettingsTable() {
  const { data, isLoading, isError } = useWorkflowSettings();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        در حال بارگذاری تنظیمات…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive text-center">
        خطا در بارگذاری تنظیمات
      </div>
    );
  }

  const settings = data ?? [];
  if (settings.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground text-center">
        تنظیماتی یافت نشد
      </div>
    );
  }

  return (
    <>
      {/* موبایل: کارت */}
      <div className="space-y-3 md:hidden">
        {settings.map((s) => (
          <WorkflowSettingRow key={s.id} setting={s} variant="card" />
        ))}
      </div>

      {/* دسکتاپ: جدول */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="py-3 px-2 text-start font-medium">فرایند</th>
              <th className="py-3 px-2 text-start font-medium">آپلودکننده</th>
              <th className="py-3 px-2 text-start font-medium">تأییدکننده</th>
              <th className="py-3 px-2 text-start font-medium">تایمر</th>
              <th className="py-3 px-2 text-start font-medium">کارت قرمز</th>
              <th className="py-3 px-2 text-center font-medium">وضعیت</th>
              <th className="py-3 px-2 text-end font-medium">اقدام</th>
            </tr>
          </thead>
          <tbody>
            {settings.map((s) => (
              <WorkflowSettingRow key={s.id} setting={s} variant="row" />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}