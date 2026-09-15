import { useState } from "react";
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
  createSalesInteraction,
  type SalesInteractionKind,
} from "@/lib/sales-desk";

type Props = {
  personId: string;
  personName?: string | null;
  customerId?: string | null;
  callLogId?: string | null;
  defaultKind?: "call" | "note";
  compact?: boolean;
  onCreated?: (id: string) => void;
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
}: Props) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"call" | "note">(defaultKind);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [followUpLocal, setFollowUpLocal] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error("متن خلاصه الزامی است");
      const nextFollowUpAt = followUpLocal
        ? new Date(followUpLocal).toISOString()
        : null;
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
      });
    },
    onSuccess: (id) => {
      toast.success(kind === "call" ? "خلاصه تماس ثبت شد" : "یادداشت ثبت شد");
      setBody("");
      setTitle("");
      setFollowUpLocal("");
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

      <div className="space-y-1.5">
        <Label htmlFor="sd-note-fu">پیگیری بعدی (اختیاری)</Label>
        <Input
          id="sd-note-fu"
          type="datetime-local"
          dir="ltr"
          className="text-left"
          value={followUpLocal}
          onChange={(e) => setFollowUpLocal(e.target.value)}
        />
      </div>

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
