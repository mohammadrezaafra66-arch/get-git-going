import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  clearCallDraft,
  loadCallDraft,
  saveCallDraft,
  type CallNoteDraft,
} from "@/lib/calls/call-drafts";
import {
  createSalesInteraction,
  type SalesInteractionKind,
} from "@/lib/sales-desk";
import {
  PersianFollowUpFields,
  combineTehranFollowUpIso,
} from "./PersianFollowUpFields";

type Props = {
  personId: string;
  personName?: string | null;
  customerId?: string | null;
  callLogId?: string | null;
  defaultKind?: "call" | "note";
  compact?: boolean;
  onCreated?: (id: string) => void;
  /** B1/B4 call-card key — drafts keyed in localStorage */
  draftKey?: string | null;
  /** Linked deal id from «افزودن معامله» (B5) */
  dealId?: string | null;
  onDealIdChange?: (dealId: string | null) => void;
  /** Opens deal form without discarding note draft */
  onAddDeal?: () => void;
  showAddDeal?: boolean;
};

/**
 * فرم خلاصه تماس یا یادداشت دستی (بدون نیاز به Issabel).
 */
export function CallNoteForm({
  personId,
  personName,
  customerId = null,
  callLogId = null,
  defaultKind = "call",
  compact = false,
  onCreated,
  draftKey = null,
  dealId = null,
  onDealIdChange,
  onAddDeal,
  showAddDeal = false,
}: Props) {
  const qc = useQueryClient();
  const stored = draftKey ? loadCallDraft(draftKey) : null;

  const [kind, setKind] = useState<"call" | "note">(
    stored?.kind ?? defaultKind,
  );
  const [body, setBody] = useState(stored?.body ?? "");
  const [title, setTitle] = useState(stored?.title ?? "");
  const [followUpDate, setFollowUpDate] = useState<string | null>(
    stored?.followUpDate ?? null,
  );
  const [followUpTime, setFollowUpTime] = useState(
    stored?.followUpTime ?? "09:00",
  );
  const [linkedDealId, setLinkedDealId] = useState<string | null>(
    dealId ?? stored?.dealId ?? null,
  );

  // Reload when switching active call (draftKey change)
  useEffect(() => {
    if (!draftKey) return;
    const d = loadCallDraft(draftKey);
    setKind(d?.kind ?? defaultKind);
    setBody(d?.body ?? "");
    setTitle(d?.title ?? "");
    setFollowUpDate(d?.followUpDate ?? null);
    setFollowUpTime(d?.followUpTime ?? "09:00");
    setLinkedDealId(dealId ?? d?.dealId ?? null);
  }, [draftKey, defaultKind, dealId]);

  useEffect(() => {
    if (dealId !== undefined && dealId !== null) {
      setLinkedDealId(dealId);
    }
  }, [dealId]);

  // Persist draft while typing
  useEffect(() => {
    if (!draftKey) return;
    const payload: Omit<CallNoteDraft, "updatedAt"> = {
      kind,
      body,
      title,
      followUpDate,
      followUpTime,
      dealId: linkedDealId,
    };
    const hasContent =
      body.trim() ||
      title.trim() ||
      followUpDate ||
      linkedDealId ||
      kind !== defaultKind;
    if (!hasContent) return;
    saveCallDraft(draftKey, payload);
  }, [
    draftKey,
    kind,
    body,
    title,
    followUpDate,
    followUpTime,
    linkedDealId,
    defaultKind,
  ]);

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error("متن خلاصه الزامی است");
      const nextFollowUpAt = combineTehranFollowUpIso(followUpDate, followUpTime);
      return createSalesInteraction({
        personId,
        kind: kind as SalesInteractionKind,
        body: trimmed,
        title: title.trim() || null,
        customerId,
        callLogId,
        nextFollowUpAt,
        source: callLogId ? "caller_popup" : "manual",
        status: "open",
        dealId: linkedDealId,
      });
    },
    onSuccess: (id) => {
      toast.success(kind === "call" ? "خلاصه تماس ثبت شد" : "یادداشت ثبت شد");
      setBody("");
      setTitle("");
      setFollowUpDate(null);
      setFollowUpTime("09:00");
      setLinkedDealId(null);
      onDealIdChange?.(null);
      if (draftKey) clearCallDraft(draftKey);
      qc.invalidateQueries({ queryKey: ["sales-desk"] });
      onCreated?.(id);
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
        <Label>نوع</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as "call" | "note")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="call">خلاصه تماس</SelectItem>
            <SelectItem value="note">یادداشت</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sd-note-title">عنوان (اختیاری)</Label>
        <Input
          id="sd-note-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sd-note-body">متن</Label>
        <Textarea
          id="sd-note-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={compact ? 3 : 4}
          placeholder="خلاصه مکالمه یا یادداشت…"
        />
      </div>

      <PersianFollowUpFields
        idPrefix="sd-note-fu"
        label="پیگیری بعدی (اختیاری)"
        dateIso={followUpDate}
        timeHm={followUpTime}
        onDateChange={setFollowUpDate}
        onTimeChange={setFollowUpTime}
      />

      {linkedDealId ? (
        <p className="text-xs text-muted-foreground" dir="ltr">
          معامله مرتبط: {linkedDealId.slice(0, 8)}…
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
          ) : null}
          ثبت
        </Button>
        {showAddDeal && onAddDeal ? (
          <Button type="button" variant="outline" onClick={onAddDeal}>
            افزودن معامله
          </Button>
        ) : null}
      </div>
    </div>
  );

  if (compact) return form;

  return (
    <Card dir="rtl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">خلاصه تماس / یادداشت</CardTitle>
      </CardHeader>
      <CardContent>{form}</CardContent>
    </Card>
  );
}
