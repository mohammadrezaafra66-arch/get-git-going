/**
 * Dialog on «ناموفق شد»: reason select + note; «سایر» requires other text.
 * Pattern mirrors quote-rejection dialog.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  listDealLostReasons,
  LOST_REASON_OTHER_TITLE,
} from "@/lib/sales-desk";

export type LostReasonSubmit = {
  lostReasonId: string;
  lostReasonNote: string | null;
  lostReasonOther: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: LostReasonSubmit) => void;
  pending?: boolean;
};

export function LostReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: Props) {
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const [other, setOther] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const reasonsQ = useQuery({
    queryKey: ["sales-desk", "deal-lost-reasons-active"],
    enabled: open,
    queryFn: () => listDealLostReasons({ activeOnly: true }),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) {
      setReasonId("");
      setNote("");
      setOther("");
      setLocalError(null);
    }
  }, [open]);

  const selected = (reasonsQ.data ?? []).find((r) => r.id === reasonId);
  const isOther = selected?.title === LOST_REASON_OTHER_TITLE;

  const submit = () => {
    if (!reasonId) {
      setLocalError("دلیل شکست را انتخاب کنید");
      return;
    }
    if (isOther && !other.trim()) {
      setLocalError("دلیل شکست را انتخاب کنید");
      return;
    }
    setLocalError(null);
    onConfirm({
      lostReasonId: reasonId,
      lostReasonNote: note.trim() || null,
      lostReasonOther: isOther ? other.trim() : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>دلیل شکست را انتخاب کنید</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>دلیل شکست</Label>
            {reasonsQ.isLoading ? (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> …
              </p>
            ) : (
              <Select value={reasonId || undefined} onValueChange={setReasonId}>
                <SelectTrigger>
                  <SelectValue placeholder="دلیل شکست را انتخاب کنید" />
                </SelectTrigger>
                <SelectContent>
                  {(reasonsQ.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lost-reason-note">توضیح دلیل شکست</Label>
            <Textarea
              id="lost-reason-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          {isOther ? (
            <div className="space-y-1.5">
              <Label htmlFor="lost-reason-other">سایر</Label>
              <Textarea
                id="lost-reason-other"
                value={other}
                onChange={(e) => setOther(e.target.value)}
                rows={2}
                placeholder="توضیح الزامی برای «سایر»"
              />
            </div>
          ) : null}

          {localError ? (
            <p className="text-sm text-destructive">{localError}</p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
            این معامله موفق نشد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
