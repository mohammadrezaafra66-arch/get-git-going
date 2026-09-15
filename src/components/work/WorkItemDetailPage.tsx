import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getWorkItem,
  listWorkTopics,
  updateWorkItem,
  type WorkItem,
  type WorkItemKind,
  type WorkItemPriority,
  type WorkItemStatus,
  type WorkTopic,
} from "@/lib/work";
import { CalmMindPanel, type CalmMindDraft } from "./CalmMindPanel";
import {
  ALL_KINDS,
  ALL_PRIORITIES,
  ALL_STATUSES,
  KIND_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from "./labels";

function toDatetimeLocalValue(iso: string | null): string {
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

export function WorkItemDetailPage({ itemId }: { itemId: string }) {
  const [item, setItem] = useState<WorkItem | null>(null);
  const [topics, setTopics] = useState<WorkTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<WorkItemStatus>("pending");
  const [kind, setKind] = useState<WorkItemKind>("note");
  const [priority, setPriority] = useState<WorkItemPriority>("normal");
  const [groupName, setGroupName] = useState("");
  const [section, setSection] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [intakeSummary, setIntakeSummary] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [closeLoopHint, setCloseLoopHint] = useState(false);

  const [calm, setCalm] = useState<CalmMindDraft>({
    decision_bucket: null,
    work_mode: "request",
    impact_level: "none",
    impact_if_missed: "",
    topic_id: null,
    claimed_due_at: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [row, topicRows] = await Promise.all([
        getWorkItem(itemId),
        listWorkTopics({ limit: 100 }),
      ]);
      if (!row) {
        setError("این کار پیدا نشد یا دسترسی ندارید.");
        setItem(null);
        return;
      }
      setItem(row);
      setTopics(topicRows);
      setTitle(row.title);
      setBody(row.body ?? "");
      setStatus(row.status);
      setKind(row.kind);
      setPriority(row.priority);
      setGroupName(row.group_name ?? "");
      setSection(row.section ?? "");
      setAcceptance(row.acceptance_criteria ?? "");
      setIntakeSummary(row.intake_summary ?? "");
      setCalm({
        decision_bucket: row.decision_bucket,
        work_mode: row.work_mode,
        impact_level: row.impact_level,
        impact_if_missed: row.impact_if_missed ?? "",
        topic_id: row.topic_id,
        claimed_due_at: toDatetimeLocalValue(row.claimed_due_at),
      });
      setCloseLoopHint(false);
      setValidationError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  function onStatusChange(next: WorkItemStatus) {
    setStatus(next);
    setValidationError(null);
    if (next === "in_progress" && !calm.claimed_due_at.trim()) {
      setValidationError(
        "برای شروع کار (در حال انجام) باید موعد ادعا‌شده را در بخش آرامش ذهن مشخص کنید.",
      );
    }
    if (next === "done" && calm.work_mode === "request") {
      setCloseLoopHint(true);
    } else {
      setCloseLoopHint(false);
    }
  }

  async function save() {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("عنوان الزامی است.");
      return;
    }
    if (status === "in_progress" && !calm.claimed_due_at.trim()) {
      setValidationError(
        "برای وضعیت «در حال انجام» وارد کردن موعد ادعا‌شده الزامی است.",
      );
      toast.error("موعد ادعا‌شده را مشخص کنید.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateWorkItem(itemId, {
        title: trimmed,
        body: body.trim() || null,
        status,
        kind,
        priority,
        group_name: groupName.trim() || null,
        section: section.trim() || null,
        acceptance_criteria: acceptance.trim() || null,
        intake_summary: intakeSummary.trim() || null,
        decision_bucket: calm.decision_bucket,
        work_mode: calm.work_mode,
        impact_level: calm.impact_level,
        impact_if_missed: calm.impact_if_missed.trim() || null,
        topic_id: calm.topic_id,
        claimed_due_at: fromDatetimeLocalValue(calm.claimed_due_at),
      });
      setItem(updated);
      toast.success("تغییرات ذخیره شد.");
      if (updated.status === "done" && updated.work_mode === "request") {
        setCloseLoopHint(true);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "ذخیره ناموفق بود.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="container max-w-3xl space-y-4 py-8" dir="rtl">
        <p className="text-sm text-rose-700">{error ?? "کار یافت نشد."}</p>
        <Button variant="outline" asChild>
          <Link to="/operations/work">
            <ArrowRight className="ml-1.5 h-4 w-4" />
            بازگشت به تابلو
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className="min-h-[70vh] bg-[linear-gradient(180deg,#f8fafc_0%,#ecfeff_100%)]"
      dir="rtl"
    >
      <div className="container max-w-3xl space-y-5 py-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/operations/work">
              <ArrowRight className="ml-1 h-4 w-4" />
              تابلو
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/operations/work/topics">موضوع‌ها</Link>
          </Button>
        </div>

        <PageHeader
          title={title || "جزئیات کار"}
          description="ویرایش کامل فیلدها و تنظیم آرامش ذهن"
          actions={
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              {saving ? (
                <Loader2 className="ml-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="ml-1.5 h-4 w-4" />
              )}
              ذخیره
            </Button>
          }
        />

        {validationError && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-950">
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        )}

        {closeLoopHint && (
          <Alert className="border-teal-300 bg-teal-50 text-teal-950">
            <AlertDescription>
              این کار هنوز در حالت «درخواست» است. برای بستن حلقه، نتیجه را ثبت
              کنید یا حالت را به «اجرایی» تغییر دهید تا مشخص شود درخواست به عمل
              تبدیل شده است.
            </AlertDescription>
          </Alert>
        )}

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="detail-title">عنوان</Label>
            <Input
              id="detail-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="detail-body">شرح</Label>
            <Textarea
              id="detail-body"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>وضعیت</Label>
              <Select
                value={status}
                onValueChange={(v) => onStatusChange(v as WorkItemStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>نوع</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as WorkItemKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>اولویت</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as WorkItemPriority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="detail-group">گروه</Label>
              <Input
                id="detail-group"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="detail-section">بخش</Label>
              <Input
                id="detail-section"
                value={section}
                onChange={(e) => setSection(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="detail-acceptance">معیار پذیرش</Label>
            <Textarea
              id="detail-acceptance"
              rows={3}
              value={acceptance}
              onChange={(e) => setAcceptance(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="detail-intake">خلاصهٔ پذیرش اولیه</Label>
            <Textarea
              id="detail-intake"
              rows={3}
              value={intakeSummary}
              onChange={(e) => setIntakeSummary(e.target.value)}
            />
          </div>
        </section>

        <CalmMindPanel
          draft={calm}
          topics={topics}
          onChange={(patch) => {
            setCalm((prev) => {
              const next = { ...prev, ...patch };
              if (
                status === "in_progress" &&
                !next.claimed_due_at.trim()
              ) {
                setValidationError(
                  "برای وضعیت «در حال انجام» وارد کردن موعد ادعا‌شده الزامی است.",
                );
              } else if (status === "in_progress") {
                setValidationError(null);
              }
              if (status === "done" && next.work_mode === "request") {
                setCloseLoopHint(true);
              } else if (next.work_mode === "executable") {
                setCloseLoopHint(false);
              }
              return next;
            });
          }}
        />
      </div>
    </div>
  );
}
