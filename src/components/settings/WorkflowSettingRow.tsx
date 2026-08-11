import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import {
  PENALTY_FOR_OPTIONS,
  formatMinutes,
  toPersianDigits,
} from "@/lib/settings/labels";
import { useAllRoles } from "@/lib/rbac/roles";
import {
  useUpdateWorkflowSetting,
  type WorkflowSetting,
} from "@/hooks/settings/useWorkflowSettings";

const NONE = "__none__";

interface Draft {
  uploader_role: string | null;
  reviewer_role: string | null;
  timer_minutes: number;
  penalty_enabled: boolean;
  penalty_for: "uploader" | "reviewer" | "both";
  is_active: boolean;
}

function toDraft(s: WorkflowSetting): Draft {
  const pf = (s.penalty_for ?? "uploader") as Draft["penalty_for"];
  return {
    uploader_role: s.uploader_role,
    reviewer_role: s.reviewer_role,
    timer_minutes: s.timer_minutes,
    penalty_enabled: s.penalty_enabled,
    penalty_for: pf,
    is_active: s.is_active,
  };
}

function isDirty(a: Draft, b: Draft): boolean {
  return (
    a.uploader_role !== b.uploader_role ||
    a.reviewer_role !== b.reviewer_role ||
    a.timer_minutes !== b.timer_minutes ||
    a.penalty_enabled !== b.penalty_enabled ||
    a.penalty_for !== b.penalty_for ||
    a.is_active !== b.is_active
  );
}

interface Props {
  setting: WorkflowSetting;
  /** نمایش به‌صورت کارت (موبایل) یا سطر جدول (دسکتاپ). */
  variant?: "row" | "card";
}

export function WorkflowSettingRow({ setting, variant = "row" }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(setting));
  const update = useUpdateWorkflowSetting();
  const { data: roleOptions } = useAllRoles();
  const roles = useMemo(
    () => (roleOptions ?? []).map((r) => ({ value: r.name, label: r.label })),
    [roleOptions],
  );

  useEffect(() => {
    setDraft(toDraft(setting));
  }, [setting]);

  const original = useMemo(() => toDraft(setting), [setting]);
  const dirty = isDirty(draft, original);

  function handleSave() {
    update.mutate({
      process_key: setting.process_key,
      uploader_role: draft.uploader_role,
      reviewer_role: draft.reviewer_role,
      timer_minutes: draft.timer_minutes,
      penalty_enabled: draft.penalty_enabled,
      penalty_for: draft.penalty_enabled ? draft.penalty_for : undefined,
      is_active: draft.is_active,
    });
  }

  const uploaderSelect = (
    <Select
      value={draft.uploader_role ?? NONE}
      onValueChange={(v) => setDraft((d) => ({ ...d, uploader_role: v === NONE ? null : v }))}
    >
      <SelectTrigger className="h-9 w-full min-w-[8rem]">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>—</SelectItem>
        {roles.map((r) => (
          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const reviewerSelect = (
    <Select
      value={draft.reviewer_role ?? NONE}
      onValueChange={(v) => setDraft((d) => ({ ...d, reviewer_role: v === NONE ? null : v }))}
    >
      <SelectTrigger className="h-9 w-full min-w-[8rem]">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>—</SelectItem>
        {roles.map((r) => (
          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const timerInput = (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={1}
        className="h-9 w-24 text-center"
        value={draft.timer_minutes}
        onChange={(e) => {
          const v = Number(e.target.value);
          setDraft((d) => ({ ...d, timer_minutes: Number.isFinite(v) && v > 0 ? Math.floor(v) : 1 }));
        }}
      />
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {toPersianDigits(draft.timer_minutes)} دقیقه = {formatMinutes(draft.timer_minutes)}
      </span>
    </div>
  );

  const penaltyToggle = (
    <div className="flex items-center gap-2">
      <Switch
        checked={draft.penalty_enabled}
        onCheckedChange={(v) => setDraft((d) => ({ ...d, penalty_enabled: v }))}
        aria-label="فعال‌سازی کارت قرمز"
      />
      <Select
        value={draft.penalty_for}
        onValueChange={(v) => setDraft((d) => ({ ...d, penalty_for: v as Draft["penalty_for"] }))}
        disabled={!draft.penalty_enabled}
      >
        <SelectTrigger className="h-9 w-full min-w-[7rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PENALTY_FOR_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const activeToggle = (
    <Switch
      checked={draft.is_active}
      onCheckedChange={(v) => setDraft((d) => ({ ...d, is_active: v }))}
      aria-label="فعال بودن فرایند"
    />
  );

  const saveBtn = (
    <Button
      size="sm"
      onClick={handleSave}
      disabled={!dirty || update.isPending}
      className="gap-1"
    >
      {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      ذخیره
    </Button>
  );

  const lastUpdated = (
    <div className="text-xs text-muted-foreground">
      آخرین تغییر: {formatJalaliDateTime(setting.updated_at)}
    </div>
  );

  if (variant === "card") {
    return (
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-foreground">{setting.process_name_fa}</div>
          {activeToggle}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1">نقش آپلودکننده</div>
            {uploaderSelect}
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">نقش تأییدکننده</div>
            {reviewerSelect}
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs text-muted-foreground mb-1">تایمر</div>
            {timerInput}
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs text-muted-foreground mb-1">کارت قرمز</div>
            {penaltyToggle}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          {lastUpdated}
          {saveBtn}
        </div>
      </div>
    );
  }

  return (
    <tr className="border-b border-border align-top">
      <td className="py-3 px-2">
        <div className="font-medium text-foreground">{setting.process_name_fa}</div>
        {lastUpdated}
      </td>
      <td className="py-3 px-2">{uploaderSelect}</td>
      <td className="py-3 px-2">{reviewerSelect}</td>
      <td className="py-3 px-2">{timerInput}</td>
      <td className="py-3 px-2">{penaltyToggle}</td>
      <td className="py-3 px-2 text-center">{activeToggle}</td>
      <td className="py-3 px-2 text-end">{saveBtn}</td>
    </tr>
  );
}