/**
 * D3 — mark done / result note / revert / create-another for an existing activity.
 * Only owner (salesperson_id === auth.uid()) can mutate; others read-only.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  markActivityDone,
  postponeActivityDue,
  revertActivityDone,
  type SalesActivityRow,
} from "@/lib/sales-desk/activities";
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import {
  PersianFollowUpFields,
  combineTehranFollowUpIso,
} from "./PersianFollowUpFields";

type Props = {
  activity: SalesActivityRow;
  onUpdated?: () => void;
  onCreateAnother?: (ctx: {
    personId: string;
    customerId: string | null;
    dealId: string | null;
  }) => void;
};

export function ActivityDoneControls({
  activity,
  onUpdated,
  onCreateAnother,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isOwner = !!user?.id && activity.salesperson_id === user.id;
  const isDone = !!activity.done_at;

  const [wantDone, setWantDone] = useState(false);
  const [resultNote, setResultNote] = useState(activity.result_note ?? "");
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [newTime, setNewTime] = useState("09:00");
  const [timeUnknown, setTimeUnknown] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sales-desk"] });
    onUpdated?.();
  };

  const doneMut = useMutation({
    mutationFn: async (andAnother: boolean) => {
      await markActivityDone({
        id: activity.id,
        resultNote,
        actorId: user!.id,
        ownerId: activity.salesperson_id,
      });
      return andAnother;
    },
    onSuccess: (andAnother) => {
      toast.success("این فعالیت انجام شد");
      setWantDone(false);
      invalidate();
      if (andAnother) {
        onCreateAnother?.({
          personId: activity.person_id,
          customerId: activity.customer_id,
          dealId: activity.deal_id,
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revertMut = useMutation({
    mutationFn: () =>
      revertActivityDone({
        id: activity.id,
        actorId: user!.id,
        ownerId: activity.salesperson_id,
      }),
    onSuccess: () => {
      toast.success("فعالیت به انجام‌نشده برگشت");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const postponeMut = useMutation({
    mutationFn: async () => {
      if (!newDate) throw new Error("تاریخ را انتخاب کنید");
      const dueHasTime = !timeUnknown;
      const newDueAt = timeUnknown
        ? new Date(`${newDate}T00:00:00+03:30`).toISOString()
        : combineTehranFollowUpIso(newDate, newTime);
      if (!newDueAt) throw new Error("موعد نامعتبر است");
      await postponeActivityDue({
        id: activity.id,
        newDueAt,
        dueHasTime,
        actorId: user!.id,
        ownerId: activity.salesperson_id,
        currentOriginalDueAt: activity.original_due_at,
        currentDueAt: activity.due_at,
      });
    },
    onSuccess: () => {
      toast.success("به تعویق انداختن انجام شد");
      setPostponeOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isDone) {
    return (
      <div className="mt-2 space-y-2 rounded-md border border-border/50 bg-muted/20 p-2 text-sm" dir="rtl">
        <p className="text-xs text-muted-foreground">
          انجام شده {activity.done_at ? formatDateTimeFa(activity.done_at) : ""}
          {activity.original_due_at ? (
            <> · موعد اصلی: {formatDateTimeFa(activity.original_due_at)}</>
          ) : null}
        </p>
        {activity.result_note ? (
          <p className="whitespace-pre-wrap text-sm">{activity.result_note}</p>
        ) : null}
        {isOwner ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={revertMut.isPending}
            onClick={() => revertMut.mutate()}
          >
            {revertMut.isPending ? (
              <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            بازگردانی به انجام نشده
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">فقط مشاهده</p>
        )}
      </div>
    );
  }

  if (!isOwner) {
    return (
      <p className="mt-1 text-xs text-muted-foreground" dir="rtl">
        انجام نشده — فقط مسئول می‌تواند نتیجه ثبت کند
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2" dir="rtl">
      {activity.due_at ? (
        <p className="text-xs text-muted-foreground">
          موعد: {formatDateTimeFa(activity.due_at)}
          {activity.due_has_time ? "" : " (ساعت مشخص نیست)"}
          {activity.original_due_at &&
          activity.original_due_at !== activity.due_at ? (
            <> · موعد اصلی: {formatDateTimeFa(activity.original_due_at)}</>
          ) : null}
        </p>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={wantDone}
          onCheckedChange={(v) => setWantDone(Boolean(v))}
        />
        این فعالیت انجام شده
      </label>

      {wantDone ? (
        <div className="space-y-2 rounded-md border p-2">
          <Label>نتیجه‌ی فعالیت خود را یادداشت کنید</Label>
          <Textarea
            value={resultNote}
            onChange={(e) => setResultNote(e.target.value)}
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={doneMut.isPending}
              onClick={() => doneMut.mutate(false)}
            >
              {doneMut.isPending ? (
                <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              این فعالیت انجام شد
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={doneMut.isPending}
              onClick={() => doneMut.mutate(true)}
            >
              ذخیره و ایجاد فعالیت دیگر
            </Button>
          </div>
        </div>
      ) : null}

      <div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setPostponeOpen((o) => !o)}
        >
          به تعویق انداختن
        </Button>
        {postponeOpen ? (
          <div className="mt-2 space-y-2 rounded-md border p-2">
            <PersianFollowUpFields
              idPrefix={`sd-post-${activity.id}`}
              label="تاریخ"
              dateIso={newDate}
              timeHm={newTime}
              onDateChange={setNewDate}
              onTimeChange={setNewTime}
              timeDisabled={timeUnknown}
              timeLabel="ساعت"
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={timeUnknown}
                onCheckedChange={(v) => setTimeUnknown(Boolean(v))}
              />
              ساعت مشخص نیست
            </label>
            <Button
              type="button"
              size="sm"
              disabled={postponeMut.isPending}
              onClick={() => postponeMut.mutate()}
            >
              {postponeMut.isPending ? (
                <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              تأیید تعویق
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
