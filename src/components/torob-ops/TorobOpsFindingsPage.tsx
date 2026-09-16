import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { withOpsSession } from "@/lib/torob-ops/client-session";
import {
  FINDING_STATUS_LABELS_FA,
  FINDING_STATUSES,
  type FindingStatus,
} from "@/lib/torob-ops/types";
import {
  torobOpsListFindings,
  torobOpsLogReport,
  torobOpsReviewFinding,
} from "@/lib/torob-ops/functions";
import { formatNumber, toFaDigits } from "@/lib/i18n/formatters";
import { TorobOpsGate } from "./TorobOpsGate";

type FindingRow = {
  id: string;
  product_name_snapshot: string | null;
  torob_url: string | null;
  seller_name: string | null;
  seller_domain: string | null;
  our_price_toman: number | null;
  their_price_toman: number | null;
  status: FindingStatus;
  evidence: Record<string, unknown> | null;
  review_note: string | null;
};

function FindingsInner() {
  const qc = useQueryClient();
  const listFn = useServerFn(torobOpsListFindings);
  const reviewFn = useServerFn(torobOpsReviewFinding);
  const reportFn = useServerFn(torobOpsLogReport);

  const [statusFilter, setStatusFilter] = useState<string>("manual_review");
  const [reportFor, setReportFor] = useState<FindingRow | null>(null);
  const [reportText, setReportText] = useState("");
  const [reportNotes, setReportNotes] = useState("");

  const findingsQ = useQuery({
    queryKey: ["torob-ops-findings", statusFilter],
    queryFn: () =>
      listFn({
        data: withOpsSession({
          status: statusFilter === "all" ? undefined : (statusFilter as FindingStatus),
          limit: 100,
        }),
      }),
  });

  const reviewMut = useMutation({
    mutationFn: (payload: { findingId: string; status: FindingStatus; reviewNote?: string }) =>
      reviewFn({ data: withOpsSession(payload) }),
    onSuccess: () => {
      toast.success("وضعیت به‌روز شد.");
      qc.invalidateQueries({ queryKey: ["torob-ops-findings"] });
      qc.invalidateQueries({ queryKey: ["torob-ops-dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reportMut = useMutation({
    mutationFn: () =>
      reportFn({
        data: withOpsSession({
          findingId: reportFor!.id,
          reportText: reportText.trim() || undefined,
          notes: reportNotes.trim() || undefined,
          result: "submitted",
        }),
      }),
    onSuccess: () => {
      toast.success("نتیجه گزارش ثبت شد.");
      setReportFor(null);
      setReportText("");
      setReportNotes("");
      qc.invalidateQueries({ queryKey: ["torob-ops-findings"] });
      qc.invalidateQueries({ queryKey: ["torob-ops-dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="صف بررسی یافته‌های ترب"
        description="مسیر ب: تأیید طعمه، رد رقیب سالم، و ثبت دستی گزارش پس از تأیید."
      />

      <div className="max-w-xs">
        <Label className="mb-1 block">فیلتر وضعیت</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه</SelectItem>
            {FINDING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {FINDING_STATUS_LABELS_FA[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {((findingsQ.data ?? []) as FindingRow[]).map((row) => (
          <Card key={row.id}>
            <CardContent className="space-y-3 py-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{FINDING_STATUS_LABELS_FA[row.status] ?? row.status}</Badge>
                <span className="font-medium">{row.product_name_snapshot ?? "—"}</span>
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                <div>
                  قیمت ما:{" "}
                  {row.our_price_toman != null
                    ? toFaDigits(formatNumber(Number(row.our_price_toman)))
                    : "—"}
                </div>
                <div>
                  کمینه ترب:{" "}
                  {row.their_price_toman != null
                    ? toFaDigits(formatNumber(Number(row.their_price_toman)))
                    : "—"}
                </div>
                <div>فروشنده: {row.seller_name ?? "نامشخص (min کلی)"}</div>
                <div>دامنه: {row.seller_domain ?? "—"}</div>
              </div>
              {row.torob_url ? (
                <a
                  href={row.torob_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline"
                >
                  باز کردن ترب
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={reviewMut.isPending}
                  onClick={() => reviewMut.mutate({ findingId: row.id, status: "confirmed_bait" })}
                >
                  تأیید طعمه
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={reviewMut.isPending}
                  onClick={() =>
                    reviewMut.mutate({ findingId: row.id, status: "legitimate_competitor" })
                  }
                >
                  رقیب سالم
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={reviewMut.isPending}
                  onClick={() =>
                    reviewMut.mutate({
                      findingId: row.id,
                      status: "manual_review",
                      reviewNote: "نیاز به تماس تلفنی",
                    })
                  }
                >
                  نیاز به تماس
                </Button>
                {row.status === "confirmed_bait" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={() => setReportFor(row)}
                  >
                    ثبت نتیجه گزارش
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
        {findingsQ.isSuccess && (findingsQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">موردی در این فیلتر نیست.</p>
        ) : null}
      </div>

      <Dialog open={Boolean(reportFor)} onOpenChange={(o) => !o && setReportFor(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>ثبت نتیجه گزارش دستی</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            لینک ترب را در پنل ترب باز کنید، گزارش را دستی بگذارید، سپس اینجا نتیجه را ثبت کنید.
          </p>
          {reportFor?.torob_url ? (
            <a
              href={reportFor.torob_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline"
            >
              باز کردن صفحه ترب
            </a>
          ) : null}
          <div className="space-y-2">
            <Label>متن/دلیل گزارش</Label>
            <Textarea value={reportText} onChange={(e) => setReportText(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>یادداشت داخلی</Label>
            <Textarea
              value={reportNotes}
              onChange={(e) => setReportNotes(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setReportFor(null)}>
              انصراف
            </Button>
            <Button type="button" disabled={reportMut.isPending} onClick={() => reportMut.mutate()}>
              ثبت به‌عنوان ارسال‌شده
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function TorobOpsFindingsPage() {
  return (
    <TorobOpsGate>
      <FindingsInner />
    </TorobOpsGate>
  );
}
