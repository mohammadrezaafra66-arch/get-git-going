/**
 * D3/D6 — create activity form with Didar Persian labels (verbatim).
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  createSalesActivity,
  listSalesActivityTypes,
} from "@/lib/sales-desk/activities";
import { supabase } from "@/integrations/supabase/client";
import {
  PersianFollowUpFields,
  combineTehranFollowUpIso,
} from "./PersianFollowUpFields";

type Props = {
  personId: string;
  personName?: string | null;
  customerId?: string | null;
  dealId?: string | null;
  relatedDeals?: Array<{ id: string; label: string }>;
  compact?: boolean;
  onCreated?: (id: string) => void;
  resetKey?: number;
};

export function ActivityForm({
  personId,
  personName,
  customerId = null,
  dealId = null,
  relatedDeals = [],
  compact = false,
  onCreated,
  resetKey = 0,
}: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [activityTypeId, setActivityTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [salespersonId, setSalespersonId] = useState(user?.id ?? "");
  const [linkedDealId, setLinkedDealId] = useState<string | null>(dealId);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueTime, setDueTime] = useState("09:00");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [durationMin, setDurationMin] = useState("");
  const [markDone, setMarkDone] = useState(false);
  const [resultNote, setResultNote] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);

  useEffect(() => {
    setLinkedDealId(dealId);
  }, [dealId]);

  useEffect(() => {
    if (user?.id && !salespersonId) setSalespersonId(user.id);
  }, [user?.id, salespersonId]);

  useEffect(() => {
    if (resetKey > 0) {
      setTitle("");
      setBody("");
      setDueDate(null);
      setDueTime("09:00");
      setTimeUnknown(false);
      setDurationMin("");
      setMarkDone(false);
      setResultNote("");
      setReminderEnabled(false);
    }
  }, [resetKey]);

  const typesQ = useQuery({
    queryKey: ["sales-desk", "activity-types"],
    queryFn: listSalesActivityTypes,
    staleTime: 5 * 60_000,
  });

  const staffQ = useQuery({
    queryKey: ["sales-desk", "staff-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name")
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const dueHasTime = Boolean(dueDate && !timeUnknown);
  const canRemind = dueHasTime;

  const resetForm = (clearType: boolean) => {
    setTitle("");
    setBody("");
    setDueDate(null);
    setDueTime("09:00");
    setTimeUnknown(false);
    setDurationMin("");
    setMarkDone(false);
    setResultNote("");
    setReminderEnabled(false);
    if (clearType) setActivityTypeId("");
  };

  const mutation = useMutation({
    mutationFn: async (andCreateAnother: boolean) => {
      if (!activityTypeId) throw new Error("نوع فعالیت را انتخاب کنید");
      if (!salespersonId) throw new Error("مسئول انجام این فعالیت را انتخاب کنید");
      if (markDone && !resultNote.trim()) {
        throw new Error("نتیجه‌ی فعالیت خود را یادداشت کنید");
      }
      const dueAt = dueDate
        ? timeUnknown
          ? new Date(`${dueDate}T00:00:00+03:30`).toISOString()
          : combineTehranFollowUpIso(dueDate, dueTime)
        : null;
      const durationMinutes = durationMin.trim() ? Number(durationMin) : null;
      if (
        durationMinutes != null &&
        (!Number.isFinite(durationMinutes) || durationMinutes < 0)
      ) {
        throw new Error("مدت انجام فعالیت (دقیقه) نامعتبر است");
      }
      const id = await createSalesActivity({
        personId,
        customerId,
        dealId: linkedDealId,
        activityTypeId,
        title: title.trim() || null,
        body,
        salespersonId,
        dueAt,
        dueHasTime,
        durationMinutes,
        reminderEnabled: canRemind && reminderEnabled,
        markDone,
        resultNote: markDone ? resultNote : null,
      });
      return { id, andCreateAnother };
    },
    onSuccess: ({ id, andCreateAnother }) => {
      toast.success("فعالیت ذخیره شد");
      qc.invalidateQueries({ queryKey: ["sales-desk"] });
      onCreated?.(id);
      resetForm(!andCreateAnother);
    },
    onError: (e: Error) => toast.error(e.message || "ثبت ناموفق بود"),
  });

  const form = (
    <div className="space-y-3" dir="rtl">
      {personName ? (
        <p className="text-sm text-muted-foreground">
          برای: <strong className="text-foreground">{personName}</strong>
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label>نوع فعالیت</Label>
        <Select value={activityTypeId || undefined} onValueChange={setActivityTypeId}>
          <SelectTrigger>
            <SelectValue placeholder="انتخاب نوع…" />
          </SelectTrigger>
          <SelectContent>
            {(typesQ.data ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sd-act-title">عنوان فعالیت</Label>
        <Input
          id="sd-act-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sd-act-body">متن</Label>
        <Textarea
          id="sd-act-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={compact ? 2 : 3}
        />
      </div>

      <PersianFollowUpFields
        idPrefix="sd-act-due"
        label="تاریخ"
        dateIso={dueDate}
        timeHm={dueTime}
        onDateChange={setDueDate}
        onTimeChange={setDueTime}
        timeDisabled={timeUnknown}
        timeLabel="ساعت"
      />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={timeUnknown}
          onCheckedChange={(v) => {
            setTimeUnknown(Boolean(v));
            if (v) setReminderEnabled(false);
          }}
        />
        ساعت مشخص نیست
      </label>

      <div className="space-y-1.5">
        <Label htmlFor="sd-act-dur">مدت انجام فعالیت (دقیقه)</Label>
        <Input
          id="sd-act-dur"
          type="number"
          min={0}
          dir="ltr"
          className="text-left"
          value={durationMin}
          onChange={(e) => setDurationMin(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>مسئول انجام این فعالیت</Label>
        <Select value={salespersonId || undefined} onValueChange={setSalespersonId}>
          <SelectTrigger>
            <SelectValue placeholder="انتخاب…" />
          </SelectTrigger>
          <SelectContent>
            {(staffQ.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name?.trim() || p.id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>این فعالیت مرتبط است با</Label>
        <Select
          value={linkedDealId ?? "none"}
          onValueChange={(v) => setLinkedDealId(v === "none" ? null : v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {dealId ? <SelectItem value={dealId}>معامله جاری</SelectItem> : null}
            {relatedDeals
              .filter((d) => d.id !== dealId)
              .map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {canRemind ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={reminderEnabled}
            onCheckedChange={(v) => setReminderEnabled(Boolean(v))}
          />
          افزودن یادآور برای فعالیت
        </label>
      ) : null}

      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={markDone}
          onCheckedChange={(v) => setMarkDone(Boolean(v))}
        />
        این فعالیت انجام شده
      </label>

      {markDone ? (
        <div className="space-y-1.5">
          <Label htmlFor="sd-act-result">نتیجه‌ی فعالیت خود را یادداشت کنید</Label>
          <Textarea
            id="sd-act-result"
            value={resultNote}
            onChange={(e) => setResultNote(e.target.value)}
            rows={3}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(false)}
        >
          {mutation.isPending ? (
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
          ) : null}
          {markDone ? "این فعالیت انجام شد" : "ذخیره"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(true)}
        >
          ذخیره و ایجاد فعالیت دیگر
        </Button>
      </div>
    </div>
  );

  if (compact) return form;

  return (
    <Card dir="rtl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">فعالیت‌ها</CardTitle>
      </CardHeader>
      <CardContent>{form}</CardContent>
    </Card>
  );
}
