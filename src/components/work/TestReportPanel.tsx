import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  createWorkItem,
  listTestReports,
  submitTestReport,
  type WorkItem,
  type WorkTestReport,
  type WorkTestVerdict,
} from "@/lib/work";

const VERDICT_LABELS: Record<WorkTestVerdict, string> = {
  approve: "تأیید",
  reject_existing_bug: "رد — باگ موجود",
  reject_new_bug: "رد — باگ جدید",
};

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(local: string): string | null {
  const v = local.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatFaDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fa-IR");
  } catch {
    return iso;
  }
}

export function TestReportPanel({
  item,
  onSubmitted,
}: {
  item: WorkItem;
  onSubmitted?: () => void;
}) {
  const { user, roles } = useAuth();
  const canSubmit =
    Boolean(user?.id) &&
    (roles.includes("admin") ||
      roles.includes("manager") ||
      user?.id === item.creator_id);

  const [reports, setReports] = useState<WorkTestReport[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<WorkTestVerdict | null>(null);

  const [notes, setNotes] = useState("");
  const [linkedBugItemId, setLinkedBugItemId] = useState("");
  const [claimedDueLocal, setClaimedDueLocal] = useState(
    toDatetimeLocalValue(item.claimed_due_at),
  );
  const [createBugOnReject, setCreateBugOnReject] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const needsEtaGate = !item.claimed_due_at;

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const rows = await listTestReports(item.id);
      setReports(rows);
    } catch (e: unknown) {
      setHistoryError(
        e instanceof Error ? e.message : "بارگذاری تاریخچه گزارش تست ناموفق بود.",
      );
    } finally {
      setLoadingHistory(false);
    }
  }, [item.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    setClaimedDueLocal(toDatetimeLocalValue(item.claimed_due_at));
  }, [item.claimed_due_at]);

  const submitDisabled = useMemo(
    () => !canSubmit || submitting !== null,
    [canSubmit, submitting],
  );

  async function runSubmit(verdict: WorkTestVerdict) {
    if (!canSubmit) {
      toast.error("فقط سازندهٔ کار یا مدیر/ادمین می‌تواند گزارش تست بفرستد.");
      return;
    }

    setFormError(null);

    const isReject =
      verdict === "reject_existing_bug" || verdict === "reject_new_bug";

    let claimedDueAt: string | null = null;
    if (isReject && needsEtaGate) {
      claimedDueAt = fromDatetimeLocalValue(claimedDueLocal);
      if (!claimedDueAt) {
        setFormError(
          "برای رد تست و بازگشت به «در حال انجام» وارد کردن موعد ادعا‌شده الزامی است.",
        );
        toast.error("موعد ادعا‌شده را مشخص کنید.");
        return;
      }
    } else if (isReject && claimedDueLocal.trim()) {
      claimedDueAt = fromDatetimeLocalValue(claimedDueLocal);
    }

    let linkedId = linkedBugItemId.trim() || null;
    let effectiveNotes = notes.trim() || null;

    setSubmitting(verdict);
    try {
      if (verdict === "reject_new_bug" && createBugOnReject && !linkedId) {
        const bugTitle = `باگ از تست: ${item.title}`.slice(0, 200);
        const bug = await createWorkItem({
          title: bugTitle,
          body: effectiveNotes
            ? `ارجاع از کار تست‌شده (${item.id}).\n\n${effectiveNotes}`
            : `ارجاع از کار تست‌شده (${item.id}).`,
          kind: "bug",
          priority: item.priority,
          group_name: item.group_name,
          section: item.section,
          topic_id: item.topic_id,
        });
        linkedId = bug.id;
        const linkNote = `باگ جدید ساخته شد: ${bug.id}`;
        effectiveNotes = effectiveNotes
          ? `${effectiveNotes}\n${linkNote}`
          : linkNote;
      }

      await submitTestReport({
        workItemId: item.id,
        verdict,
        notes: effectiveNotes,
        linkedBugItemId: linkedId,
        claimedDueAt,
      });

      toast.success(
        verdict === "approve"
          ? "تست تأیید شد؛ وضعیت به انجام‌شده رفت."
          : "تست رد شد؛ وضعیت به در حال انجام برگشت.",
      );
      setNotes("");
      setLinkedBugItemId("");
      await loadHistory();
      onSubmitted?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "ارسال گزارش تست ناموفق بود.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <section
      className="space-y-4 rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50/40 via-white to-slate-50/50 p-4 shadow-sm"
      dir="rtl"
      data-testid="work-test-report-panel"
    >
      <div>
        <h2 className="text-sm font-semibold text-slate-800">تحویل تست</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          تأیید تست وضعیت را به انجام‌شده می‌برد؛ رد، کار را با حفظ گیت موعد به
          در حال انجام برمی‌گرداند.
        </p>
      </div>

      {!canSubmit && (
        <Alert className="border-slate-200 bg-slate-50 text-slate-700">
          <AlertDescription>
            فقط سازندهٔ کار یا نقش ادمین/مدیر می‌تواند گزارش تست ثبت کند.
          </AlertDescription>
        </Alert>
      )}

      {formError && (
        <Alert className="border-rose-300 bg-rose-50 text-rose-950">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="test-report-notes">یادداشت (اختیاری)</Label>
        <Textarea
          id="test-report-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!canSubmit || submitting !== null}
          placeholder="توضیح کوتاه دربارهٔ نتیجهٔ تست…"
        />
      </div>

      {(needsEtaGate || claimedDueLocal) && (
        <div className="space-y-1.5">
          <Label htmlFor="test-report-eta">
            موعد ادعا‌شده
            {needsEtaGate ? " (برای رد الزامی)" : " (اختیاری برای به‌روزرسانی)"}
          </Label>
          <Input
            id="test-report-eta"
            type="datetime-local"
            dir="ltr"
            className="text-start"
            value={claimedDueLocal}
            onChange={(e) => setClaimedDueLocal(e.target.value)}
            disabled={!canSubmit || submitting !== null}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="test-report-linked-bug">
          شناسهٔ باگ مرتبط (UUID اختیاری)
        </Label>
        <Input
          id="test-report-linked-bug"
          value={linkedBugItemId}
          onChange={(e) => setLinkedBugItemId(e.target.value)}
          disabled={!canSubmit || submitting !== null}
          placeholder="مثلاً برای رد با باگ موجود"
          dir="ltr"
          className="font-mono text-xs"
        />
      </div>

      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={createBugOnReject}
          onChange={(e) => setCreateBugOnReject(e.target.checked)}
          disabled={!canSubmit || submitting !== null}
        />
        <span>
          هنگام «رد — باگ جدید»، اگر شناسهٔ باگ خالی باشد یک کار باگ جدید بساز و
          به گزارش وصل کن.
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={submitDisabled}
          data-testid="work-test-approve"
          onClick={() => void runSubmit("approve")}
        >
          {submitting === "approve" ? (
            <Loader2 className="ms-0 me-1.5 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="ms-0 me-1.5 h-4 w-4" />
          )}
          تأیید تست
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={submitDisabled}
          data-testid="work-test-reject-existing"
          onClick={() => void runSubmit("reject_existing_bug")}
        >
          {submitting === "reject_existing_bug" ? (
            <Loader2 className="ms-0 me-1.5 h-4 w-4 animate-spin" />
          ) : (
            <XCircle className="ms-0 me-1.5 h-4 w-4" />
          )}
          رد — باگ موجود
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={submitDisabled}
          data-testid="work-test-reject-new"
          onClick={() => void runSubmit("reject_new_bug")}
        >
          {submitting === "reject_new_bug" ? (
            <Loader2 className="ms-0 me-1.5 h-4 w-4 animate-spin" />
          ) : (
            <XCircle className="ms-0 me-1.5 h-4 w-4" />
          )}
          رد — باگ جدید
        </Button>
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <h3 className="text-xs font-semibold text-slate-700">
          تاریخچهٔ گزارش‌های تست
        </h3>
        {loadingHistory ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            در حال بارگذاری…
          </div>
        ) : historyError ? (
          <p className="text-xs text-rose-700">{historyError}</p>
        ) : reports.length === 0 ? (
          <p className="text-xs text-slate-500">هنوز گزارشی ثبت نشده است.</p>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-slate-100 bg-white/80 px-3 py-2 text-xs text-slate-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {VERDICT_LABELS[r.verdict] ?? r.verdict}
                  </span>
                  <time className="text-slate-400" dateTime={r.created_at}>
                    {formatFaDate(r.created_at)}
                  </time>
                </div>
                {r.notes && (
                  <p className="mt-1 whitespace-pre-wrap text-slate-600">
                    {r.notes}
                  </p>
                )}
                {r.linked_bug_item_id && (
                  <p className="mt-1 font-mono text-[11px] text-slate-500" dir="ltr">
                    bug: {r.linked_bug_item_id}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
