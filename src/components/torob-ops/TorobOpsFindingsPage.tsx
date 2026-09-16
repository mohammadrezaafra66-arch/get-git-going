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
  torobOpsQueueForReport,
  torobOpsReportPreview,
  torobOpsReviewFinding,
} from "@/lib/torob-ops/functions";
import { formatNumber, toFaDigits } from "@/lib/i18n/formatters";
import { TorobOpsGate } from "./TorobOpsGate";

const PAGE_SIZE = 25;

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
  const previewFn = useServerFn(torobOpsReportPreview);
  const queueFn = useServerFn(torobOpsQueueForReport);

  const [statusFilter, setStatusFilter] = useState<string>("manual_review");
  const [page, setPage] = useState(0);
  const [reportFor, setReportFor] = useState<FindingRow | null>(null);
  const [reportText, setReportText] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [previewBlocked, setPreviewBlocked] = useState<string | null>(null);

  const findingsQ = useQuery({
    queryKey: ["torob-ops-findings", statusFilter, page],
    queryFn: () =>
      listFn({
        data: withOpsSession({
          status: statusFilter === "all" ? undefined : (statusFilter as FindingStatus),
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        }),
      }),
  });

  const rows = (findingsQ.data?.rows ?? []) as FindingRow[];
  const total = findingsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

  const previewMut = useMutation({
    mutationFn: (findingId: string) =>
      previewFn({ data: withOpsSession({ findingId }) }),
    onSuccess: (data) => {
      setPreviewText(data.reportText);
      setPreviewBlocked(data.blockedReason);
      setPreviewOpen(true);
      if (data.blockedReason) toast.error(data.blockedReason);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const queueMut = useMutation({
    mutationFn: (findingId: string) =>
      queueFn({ data: withOpsSession({ findingId }) }),
    onSuccess: () => {
      toast.success("به صف گزارش خودکار اضافه شد.");
      qc.invalidateQueries({ queryKey: ["torob-ops-findings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="صف بررسی یافته‌های ترب"
        description="مسیر الف: تأیید طعمه، پیش‌نمایش گزارش، صف خودکار، و ثبت دستی."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-xs flex-1">
          <Label htmlFor="torob-ops-status-filter" className="mb-1 block">
            فیلتر وضعیت
          </Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger id="torob-ops-status-filter">
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
        <p className="text-sm text-muted-foreground">
          {toFaDigits(String(total))} مورد · صفحه {toFaDigits(String(page + 1))} از{" "}
          {toFaDigits(String(totalPages))}
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const enriched = Boolean(row.evidence?.seller_enriched);
          const phones = Array.isArray(row.evidence?.phones)
            ? (row.evidence!.phones as string[])
            : [];
          return (
            <Card key={row.id}>
              <CardContent className="space-y-3 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{FINDING_STATUS_LABELS_FA[row.status] ?? row.status}</Badge>
                  {enriched ? <Badge variant="secondary">غنی‌شده</Badge> : null}
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
                  {phones.length > 0 ? (
                    <div className="sm:col-span-2">تلفن: {phones.join(" · ")}</div>
                  ) : null}
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
                    onClick={() =>
                      reviewMut.mutate({ findingId: row.id, status: "confirmed_bait" })
                    }
                  >
                    تأیید طعمه
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={reviewMut.isPending}
                    onClick={() =>
                      reviewMut.mutate({
                        findingId: row.id,
                        status: "legitimate_competitor",
                      })
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
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={previewMut.isPending}
                    onClick={() => previewMut.mutate(row.id)}
                  >
                    پیش‌نمایش گزارش
                  </Button>
                  {row.status === "confirmed_bait" || row.status === "report_failed" ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={queueMut.isPending}
                        onClick={() => queueMut.mutate(row.id)}
                      >
                        صف گزارش خودکار
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        onClick={() => setReportFor(row)}
                      >
                        ثبت نتیجه گزارش
                      </Button>
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {findingsQ.isSuccess && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">موردی در این فیلتر نیست.</p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          قبلی
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page + 1 >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          بعدی
        </Button>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>پیش‌نمایش گزارش (dry-run)</DialogTitle>
          </DialogHeader>
          {previewBlocked ? (
            <p className="text-sm text-destructive">{previewBlocked}</p>
          ) : (
            <>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border p-3 text-sm">
                {previewText}
              </pre>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(previewText);
                  toast.success("متن کپی شد.");
                }}
              >
                کپی متن
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reportFor)} onOpenChange={(o) => !o && setReportFor(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>ثبت نتیجه گزارش دستی</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            لینک ترب را باز کنید، گزارش را دستی بگذارید، سپس اینجا نتیجه را ثبت کنید.
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
