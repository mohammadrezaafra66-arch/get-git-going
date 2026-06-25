import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle, Gavel } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import { useReviewerAppeals, useVoteOnAppeal } from "@/hooks/penalties/usePenalties";
import {
  penaltyTypeLabel,
  severityLabel,
  SEVERITY_CLASS,
} from "@/lib/penalties/labels";

function toPersianDigits(s: string | number): string {
  const map = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(s).replace(/[0-9]/g, (d) => map[Number(d)]);
}

export function AppealReviewPanel() {
  const { user } = useAuth();
  const { data, isLoading, error } = useReviewerAppeals(user?.id ?? null);
  const mutation = useVoteOnAppeal();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
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
        <CardContent className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <Gavel className="h-7 w-7" />
          <div>اعتراضی برای بررسی شما وجود ندارد.</div>
        </CardContent>
      </Card>
    );
  }

  const handleVote = (appealId: string, vote: "accept" | "reject") => {
    setActiveId(appealId);
    mutation.mutate(
      { appealId, vote, note: notes[appealId]?.trim() || undefined },
      {
        onSettled: () => setActiveId(null),
      },
    );
  };

  return (
    <div dir="rtl" className="space-y-3">
      {data.map((a) => {
        const pending = mutation.isPending && activeId === a.appeal_id;
        return (
          <Card key={a.appeal_id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Gavel className="h-4 w-4 text-primary" />
                  <span className="font-medium">
                    اعتراض از: {a.appellant_name ?? "کاربر نامشخص"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={SEVERITY_CLASS[a.penalty_severity]}>
                    {severityLabel(a.penalty_severity)}
                  </Badge>
                  <Badge variant="outline">{penaltyTypeLabel(a.penalty_type)}</Badge>
                </div>
              </div>

              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">دلیل کاربر:</div>
                <div className="whitespace-pre-wrap">{a.reason}</div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>تاریخ تخلف: {formatJalaliDateTime(a.penalty_created_at)}</span>
                <span>تاریخ اعتراض: {formatJalaliDateTime(a.appeal_created_at)}</span>
                <span>
                  آراء: موافق {toPersianDigits(a.votes.accept)} / مخالف {toPersianDigits(a.votes.reject)} / بدون رأی{" "}
                  {toPersianDigits(a.votes.pending)}
                </span>
              </div>

              <Textarea
                placeholder="یادداشت اختیاری برای رأی شما..."
                rows={2}
                value={notes[a.appeal_id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [a.appeal_id]: e.target.value }))}
                disabled={pending}
                dir="rtl"
              />

              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                  onClick={() => handleVote(a.appeal_id, "reject")}
                  disabled={pending}
                >
                  {pending ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : <XCircle className="ms-2 h-4 w-4" />}
                  رد کردن
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 text-white hover:bg-green-700"
                  onClick={() => handleVote(a.appeal_id, "accept")}
                  disabled={pending}
                >
                  {pending ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ms-2 h-4 w-4" />}
                  پذیرفتن
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}