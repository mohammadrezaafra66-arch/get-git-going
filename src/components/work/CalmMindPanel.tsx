import { Link } from "@tanstack/react-router";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  WorkDecisionBucket,
  WorkImpactLevel,
  WorkMode,
  WorkTopic,
} from "@/lib/work";
import {
  ALL_BUCKETS,
  ALL_IMPACTS,
  ALL_MODES,
  BUCKET_LABELS,
  IMPACT_LABELS,
  MODE_LABELS,
} from "./labels";
import { JalaliDateTimeInput } from "./JalaliDateTimeInput";

const NONE = "__none__";

export type CalmMindDraft = {
  decision_bucket: WorkDecisionBucket | null;
  work_mode: WorkMode;
  impact_level: WorkImpactLevel;
  impact_if_missed: string;
  topic_id: string | null;
  claimed_due_at: string;
};

export function CalmMindPanel({
  draft,
  topics,
  onChange,
}: {
  draft: CalmMindDraft;
  topics: WorkTopic[];
  onChange: (patch: Partial<CalmMindDraft>) => void;
}) {
  return (
    <section
      className="space-y-4 rounded-2xl border border-teal-200/70 bg-gradient-to-br from-teal-50/40 via-white to-sky-50/40 p-4"
      dir="rtl"
    >
      <div>
        <h2 className="text-sm font-semibold text-slate-800">آرامش ذهن</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          سطل تصمیم، حالت کار، اثر و موعد ادعا‌شده را اینجا تنظیم کنید.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>سطل تصمیم</Label>
          <Select
            value={draft.decision_bucket ?? NONE}
            onValueChange={(v) =>
              onChange({
                decision_bucket:
                  v === NONE ? null : (v as WorkDecisionBucket),
              })
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
            value={draft.work_mode}
            onValueChange={(v) => onChange({ work_mode: v as WorkMode })}
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

        <div className="space-y-1.5">
          <Label>سطح اثر</Label>
          <Select
            value={draft.impact_level}
            onValueChange={(v) =>
              onChange({ impact_level: v as WorkImpactLevel })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_IMPACTS.map((i) => (
                <SelectItem key={i} value={i}>
                  {IMPACT_LABELS[i]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>موضوع مرتبط</Label>
          <Select
            value={draft.topic_id ?? NONE}
            onValueChange={(v) =>
              onChange({ topic_id: v === NONE ? null : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="بدون موضوع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>بدون موضوع</SelectItem>
              {topics.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {draft.topic_id && (
            <Link
              to="/operations/work/topics/$topicId"
              params={{ topicId: draft.topic_id }}
              className="text-xs text-teal-700 hover:underline"
            >
              مشاهدهٔ موضوع
            </Link>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="claimed_due_at">موعد ادعا‌شده (برای شروع کار الزامی است)</Label>
          <JalaliDateTimeInput
            id="claimed_due_at"
            value={draft.claimed_due_at}
            onChange={(local) => onChange({ claimed_due_at: local })}
          />
          <p className="text-xs text-slate-500">
            تاریخ شمسی + ساعت. برای وضعیت «در حال انجام» باید موعد مشخص باشد.
          </p>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="impact_if_missed">اگر از دست برود چه می‌شود؟</Label>
          <Textarea
            id="impact_if_missed"
            rows={3}
            value={draft.impact_if_missed}
            onChange={(e) => onChange({ impact_if_missed: e.target.value })}
            placeholder="پیامد کوتاه و شفاف…"
          />
        </div>
      </div>
    </section>
  );
}
