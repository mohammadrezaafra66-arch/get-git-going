import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/AuthProvider";
import { toFaDigits } from "@/lib/i18n/formatters";
import { supabase } from "@/integrations/supabase/client";
import {
  INTAKE_ALL_QUESTIONS,
  buildIntakeTranscript,
  classifyWorkItem,
  createWorkItem,
  listActiveTaxonomies,
  listMergeSuggestions,
  summarizeIntake,
  type ClassifyWorkResult,
  type IntakeAnswer,
  type WorkDecisionBucket,
  type WorkItemKind,
  type WorkItemPriority,
  type WorkMode,
} from "@/lib/work";
import {
  ALL_BUCKETS,
  ALL_KINDS,
  ALL_MODES,
  ALL_PRIORITIES,
  BUCKET_LABELS,
  KIND_LABELS,
  MODE_LABELS,
  PRIORITY_LABELS,
} from "./labels";
import { TaxonomySelect } from "./TaxonomySelect";

const NONE = "__none__";
const CLASSIFY_DEBOUNCE_MS = 300;
/** Texts shorter than this (trimmed) count as vague for intake gating. */
const SHORT_TEXT_CHARS = 40;

type WizardStep = "describe" | "intake" | "confirm";

/**
 * Intake step rule (document in code per Phase B FE brief):
 * Show intake when kind is not `note` OR free-text is short/vague
 * (trimmed length < SHORT_TEXT_CHARS) OR classify confidence < 0.6.
 */
export function needsIntakeStep(
  kind: WorkItemKind,
  text: string,
  confidence: number,
): boolean {
  if (kind !== "note") return true;
  if (confidence < 0.6) return true;
  if (text.trim().length < SHORT_TEXT_CHARS) return true;
  return false;
}

async function fetchAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function postIntakeSummary(args: {
  answers: IntakeAnswer[];
  description?: string;
  title?: string;
}): Promise<{ summary: string; transcript: string } | null> {
  try {
    const token = await fetchAuthToken();
    if (!token) return null;
    const res = await fetch("/api/work/intake-summary", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        answers: args.answers,
        description: args.description,
        title: args.title,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      summary?: string;
      transcript?: string;
    };
    if (!json.summary?.trim()) return null;
    return {
      summary: json.summary.trim(),
      transcript: json.transcript?.trim() || buildIntakeTranscript(args.answers),
    };
  } catch {
    return null;
  }
}

function stepLabel(step: WizardStep): string {
  switch (step) {
    case "describe":
      return "شرح";
    case "intake":
      return "پرسش‌نامه";
    case "confirm":
      return "تأیید";
  }
}

export function CreateWorkWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (itemId: string, pendingMerges: number) => void;
}) {
  const { roles } = useAuth();
  const canAssign =
    roles.includes("admin") || roles.includes("manager");

  const [step, setStep] = useState<WizardStep>("describe");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<ClassifyWorkResult | null>(null);

  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<WorkItemKind>("note");
  const [priority, setPriority] = useState<WorkItemPriority>("normal");
  const [decisionBucket, setDecisionBucket] = useState<WorkDecisionBucket | null>(
    null,
  );
  const [workMode, setWorkMode] = useState<WorkMode>("request");
  const [groupName, setGroupName] = useState("");
  const [section, setSection] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [intakeSummary, setIntakeSummary] = useState("");
  const [intakeTranscript, setIntakeTranscript] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [preparingConfirm, setPreparingConfirm] = useState(false);

  const { data: taxonomyGroups = [] } = useQuery({
    queryKey: ["work-taxonomies", "group", "active"],
    queryFn: () => listActiveTaxonomies("group"),
    enabled: open,
    staleTime: 60_000,
  });
  const { data: taxonomySections = [] } = useQuery({
    queryKey: ["work-taxonomies", "section", "active"],
    queryFn: () => listActiveTaxonomies("section"),
    enabled: open,
    staleTime: 60_000,
  });
  const groupOptions = useMemo(
    () => taxonomyGroups.map((t) => t.name),
    [taxonomyGroups],
  );
  const sectionOptions = useMemo(
    () => taxonomySections.map((t) => t.name),
    [taxonomySections],
  );

  const { data: staffProfiles = [] } = useQuery({
    queryKey: ["work-create-staff-profiles"],
    enabled: open && canAssign,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name", { ascending: true })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string | null }>;
    },
  });

  const intakeNeeded = useMemo(() => {
    const p = preview ?? classifyWorkItem({ text: description });
    return needsIntakeStep(p.kind, description, p.confidence);
  }, [preview, description]);

  const visibleSteps = useMemo((): WizardStep[] => {
    return intakeNeeded
      ? ["describe", "intake", "confirm"]
      : ["describe", "confirm"];
  }, [intakeNeeded]);

  // Live classify preview (client-side pure function, debounce ~300ms).
  useEffect(() => {
    if (!open || step !== "describe") return;
    const handle = window.setTimeout(() => {
      setPreview(classifyWorkItem({ text: description }));
    }, CLASSIFY_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [description, open, step]);

  function reset() {
    setStep("describe");
    setDescription("");
    setPreview(null);
    setAnswers({});
    setTitle("");
    setBody("");
    setKind("note");
    setPriority("normal");
    setDecisionBucket(null);
    setWorkMode("request");
    setGroupName("");
    setSection("");
    setAcceptanceCriteria("");
    setIntakeSummary("");
    setIntakeTranscript("");
    setAssigneeId(null);
    setSaving(false);
    setPreparingConfirm(false);
  }

  function applyClassifyToForm(result: ClassifyWorkResult, text: string) {
    setTitle(result.suggestedTitle);
    setBody(text.trim());
    setKind(result.kind);
    setPriority(result.priority);
    setGroupName(result.group ?? "");
  }

  const buildAnswerList = useCallback((): IntakeAnswer[] => {
    return INTAKE_ALL_QUESTIONS.map((q) => {
      const raw = (answers[q.id] ?? "").trim();
      if (!raw) return null;
      if (q.type === "mcq") {
        const opt = q.options?.find((o) => o.id === raw);
        return {
          questionId: q.id,
          value: raw,
          label: opt?.label,
        } satisfies IntakeAnswer;
      }
      return { questionId: q.id, value: raw } satisfies IntakeAnswer;
    }).filter(Boolean) as IntakeAnswer[];
  }, [answers]);

  async function goToConfirm(fromIntake: boolean) {
    const classified =
      preview ?? classifyWorkItem({ text: description });
    applyClassifyToForm(classified, description);

    if (!fromIntake) {
      setIntakeSummary("");
      setIntakeTranscript("");
      setStep("confirm");
      return;
    }

    setPreparingConfirm(true);
    try {
      const answerList = buildAnswerList();
      const localSummary = summarizeIntake(answerList, {
        description: description.trim() || undefined,
        title: classified.suggestedTitle,
      });
      const localTranscript = buildIntakeTranscript(answerList);

      const remote = await postIntakeSummary({
        answers: answerList,
        description: description.trim() || undefined,
        title: classified.suggestedTitle,
      });

      setIntakeSummary(remote?.summary ?? localSummary);
      setIntakeTranscript(remote?.transcript ?? localTranscript);

      // Prefer acceptance criteria from open_done if answered.
      const done = answerList.find((a) => a.questionId === "open_done");
      if (done?.value?.trim()) {
        setAcceptanceCriteria(done.label?.trim() || done.value.trim());
      }

      setStep("confirm");
    } finally {
      setPreparingConfirm(false);
    }
  }

  async function goNext() {
    if (step === "describe") {
      const trimmed = description.trim();
      if (!trimmed) {
        toast.error("لطفاً شرح کار را بنویسید.");
        return;
      }
      const classified = classifyWorkItem({ text: trimmed });
      setPreview(classified);
      if (needsIntakeStep(classified.kind, trimmed, classified.confidence)) {
        setStep("intake");
      } else {
        await goToConfirm(false);
      }
      return;
    }
    if (step === "intake") {
      await goToConfirm(true);
    }
  }

  function goBack() {
    if (step === "confirm") {
      setStep(intakeNeeded ? "intake" : "describe");
      return;
    }
    if (step === "intake") {
      setStep("describe");
    }
  }

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("عنوان کار الزامی است.");
      return;
    }
    setSaving(true);
    try {
      const item = await createWorkItem({
        title: trimmed,
        body: body.trim() || null,
        kind,
        priority,
        decision_bucket: decisionBucket,
        work_mode: workMode,
        group_name: groupName.trim() || null,
        section: section.trim() || null,
        acceptance_criteria: acceptanceCriteria.trim() || null,
        intake_summary: intakeSummary.trim() || null,
        intake_transcript: intakeTranscript.trim() || null,
        assignee_id: canAssign ? assigneeId : null,
      });
      const pending = await listMergeSuggestions({
        status: "pending",
        itemId: item.id,
        limit: 20,
      });
      toast.success("کار ثبت شد.");
      onCreated?.(item.id, pending.length);
      reset();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "ثبت کار ناموفق بود.");
    } finally {
      setSaving(false);
    }
  }

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  const busy = saving || preparingConfirm;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent
        dir="rtl"
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        data-testid="create-work-wizard"
      >
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>ثبت کار جدید</DialogTitle>
        </DialogHeader>

        <nav
          className="flex items-center gap-2 text-xs text-muted-foreground"
          aria-label="مراحل ثبت کار"
          data-testid="create-work-steps"
        >
          {visibleSteps.map((s, i) => {
            const active = s === step;
            const idx = visibleSteps.indexOf(step);
            const done = i < idx;
            return (
              <span key={s} className="flex items-center gap-2">
                {i > 0 ? <span aria-hidden="true">‹</span> : null}
                <span
                  data-testid={`create-work-step-${s}`}
                  data-active={active ? "true" : "false"}
                  className={
                    active
                      ? "font-medium text-foreground"
                      : done
                        ? "text-foreground/70"
                        : undefined
                  }
                >
                  {toFaDigits(i + 1)}. {stepLabel(s)}
                </span>
              </span>
            );
          })}
        </nav>

        {step === "describe" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="work-wizard-describe">شرح آزاد کار</Label>
              <Textarea
                id="work-wizard-describe"
                data-testid="create-work-describe"
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="مثلاً: باگ فوری در ثبت فاکتور مالی — یا سؤال دربارهٔ گزارش ماهانه…"
              />
            </div>
            <div
              data-testid="classify-preview"
              className="rounded-md border bg-muted/40 px-3 py-2 text-sm space-y-1.5 text-right"
              aria-live="polite"
            >
              {preview && description.trim() ? (
                <>
                  <p>
                    <span className="text-muted-foreground">نوع: </span>
                    {KIND_LABELS[preview.kind]}
                  </p>
                  <p>
                    <span className="text-muted-foreground">عنوان پیشنهادی: </span>
                    {preview.suggestedTitle}
                  </p>
                  <p>
                    <span className="text-muted-foreground">گروه: </span>
                    {preview.group ?? "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">اولویت: </span>
                    {PRIORITY_LABELS[preview.priority]}
                  </p>
                  <p>
                    <span className="text-muted-foreground">اطمینان: </span>
                    {toFaDigits(Math.round(preview.confidence * 100))}٪
                  </p>
                  {intakeNeeded ? (
                    <p className="text-xs text-muted-foreground pt-1">
                      در مرحله بعد چند سؤال کوتاه برای تکمیل ثبت می‌آید.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground pt-1">
                      متن کافی به‌نظر می‌رسد؛ مستقیماً به تأیید می‌روید.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-xs">
                  با نوشتن شرح، پیش‌نمایش طبقه‌بندی اینجا ظاهر می‌شود.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {step === "intake" ? (
          <div className="space-y-4" data-testid="create-work-intake">
            {INTAKE_ALL_QUESTIONS.map((q) => (
              <div key={q.id} className="space-y-1.5">
                <Label htmlFor={`intake-${q.id}`}>{q.prompt}</Label>
                {q.type === "open" ? (
                  <Textarea
                    id={`intake-${q.id}`}
                    rows={2}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                  />
                ) : (
                  <Select
                    value={answers[q.id] || NONE}
                    onValueChange={(v) =>
                      setAnswer(q.id, v === NONE ? "" : v)
                    }
                  >
                    <SelectTrigger id={`intake-${q.id}`}>
                      <SelectValue placeholder="انتخاب کنید" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>بدون پاسخ</SelectItem>
                      {(q.options ?? []).map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {step === "confirm" ? (
          <div className="space-y-3" data-testid="create-work-confirm">
            <div className="space-y-1.5">
              <Label htmlFor="work-wizard-title">عنوان</Label>
              <Input
                id="work-wizard-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="عنوان کوتاه و روشن"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="work-wizard-body">شرح</Label>
              <Textarea
                id="work-wizard-body"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="جزئیات، زمینه، یا لینک‌ها…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-1.5">
                <Label>سطل تصمیم</Label>
                <Select
                  value={decisionBucket ?? NONE}
                  onValueChange={(v) =>
                    setDecisionBucket(
                      v === NONE ? null : (v as WorkDecisionBucket),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="بدون سطل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>بدون سطل</SelectItem>
                    {ALL_BUCKETS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {BUCKET_LABELS[b]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>حالت کار</Label>
                <Select
                  value={workMode}
                  onValueChange={(v) => setWorkMode(v as WorkMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_MODES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {MODE_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TaxonomySelect
                id="work-wizard-group"
                label="گروه"
                value={groupName}
                onChange={setGroupName}
                options={groupOptions}
                placeholder="مثلاً فروش یا انبار"
                emptyLabel="بدون گروه"
                otherPlaceholder="گروه دلخواه"
                data-testid="work-wizard-group"
              />
              <TaxonomySelect
                id="work-wizard-section"
                label="بخش"
                value={section}
                onChange={setSection}
                options={sectionOptions}
                placeholder="اختیاری"
                emptyLabel="بدون بخش"
                otherPlaceholder="بخش دلخواه"
                data-testid="work-wizard-section"
              />
            </div>
            {canAssign ? (
              <div className="space-y-1.5">
                <Label>مسئول</Label>
                <Select
                  value={assigneeId ?? NONE}
                  onValueChange={(v) =>
                    setAssigneeId(v === NONE ? null : v)
                  }
                >
                  <SelectTrigger data-testid="create-work-assignee">
                    <SelectValue placeholder="بدون مسئول" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>بدون مسئول</SelectItem>
                    {staffProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name?.trim() || p.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="work-wizard-accept">معیار پذیرش</Label>
              <Textarea
                id="work-wizard-accept"
                rows={2}
                value={acceptanceCriteria}
                onChange={(e) => setAcceptanceCriteria(e.target.value)}
                placeholder="چه چیزی این کار را تمام‌شده می‌کند؟"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="work-wizard-intake-summary">خلاصهٔ ثبت</Label>
              <Textarea
                id="work-wizard-intake-summary"
                rows={4}
                value={intakeSummary}
                onChange={(e) => setIntakeSummary(e.target.value)}
                placeholder="خلاصهٔ پرسش‌نامه یا شرح (قابل ویرایش)"
              />
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2 sm:space-x-0">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (step === "describe") onOpenChange(false);
              else goBack();
            }}
          >
            {step === "describe" ? "انصراف" : "قبلی"}
          </Button>
          {step !== "confirm" ? (
            <Button disabled={busy} onClick={() => void goNext()}>
              {preparingConfirm ? (
                <Loader2 className="h-4 w-4 animate-spin me-1" />
              ) : null}
              بعدی
            </Button>
          ) : (
            <Button
              disabled={busy}
              onClick={() => void submit()}
              data-testid="create-work-submit"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin me-1" />
              ) : null}
              ثبت کار
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
