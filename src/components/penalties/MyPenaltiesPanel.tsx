import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import {
  penaltyTypeLabel,
  severityLabel,
  appealStatusLabel,
  SEVERITY_CLASS,
  APPEAL_STATUS_CLASS,
} from "@/lib/penalties/labels";
import { useMyPenalties, type UserPenalty } from "@/hooks/penalties/usePenalties";
import { AppealForm } from "./AppealForm";

export function MyPenaltiesPanel() {
  const { data, isLoading, error } = useMyPenalties();
  const [target, setTarget] = useState<UserPenalty | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="ms-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
        خطا در بارگذاری: {(error as Error).message}
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
          <div>هیچ کارت قرمزی برای شما ثبت نشده است.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div dir="rtl" className="space-y-3">
      {data.map((p) => (
        <Card key={p.id} className={!p.is_active ? "opacity-60" : ""}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-600" />
                <span className="font-medium">{penaltyTypeLabel(p.type)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={SEVERITY_CLASS[p.severity]}>
                  {severityLabel(p.severity)}
                </Badge>
                {p.is_active ? (
                  <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
                    فعال
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-gray-300 bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
                    غیرفعال
                  </Badge>
                )}
                {p.has_appeal && p.appeal_status && (
                  <Badge variant="outline" className={APPEAL_STATUS_CLASS[p.appeal_status]}>
                    اعتراض: {appealStatusLabel(p.appeal_status)}
                  </Badge>
                )}
              </div>
            </div>
            {p.description && <div className="text-sm text-muted-foreground">{p.description}</div>}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>تاریخ: {formatJalaliDateTime(p.created_at)}</span>
              {p.can_appeal ? (
                <Button size="sm" onClick={() => setTarget(p)}>
                  ثبت اعتراض
                </Button>
              ) : !p.has_appeal && p.is_active ? (
                <span className="text-amber-700 dark:text-amber-300">مهلت اعتراض ۲۴ ساعته منقضی شده است</span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
      <AppealForm penalty={target} open={!!target} onOpenChange={(o) => !o && setTarget(null)} />
    </div>
  );
}