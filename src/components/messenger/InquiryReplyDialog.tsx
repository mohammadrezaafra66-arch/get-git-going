import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { replyInquiry } from "@/lib/messenger/inquiries.functions";

export function InquiryReplyDialog({
  open,
  onOpenChange,
  inquiryId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiryId: string;
}) {
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const reply = useServerFn(replyInquiry);

  const submit = useMutation({
    mutationFn: async () => {
      const num = Number(price.replace(/[^\d]/g, ""));
      if (!Number.isFinite(num) || num <= 0) throw new Error("قیمت معتبر وارد کنید.");
      const res = await reply({
        data: { inquiry_id: inquiryId, price: num, note: note.trim() || null },
      });
      if (!res.ok) throw new Error(res.error || "ثبت قیمت ناموفق بود.");
    },
    onSuccess: () => {
      toast.success("قیمت با موفقیت ثبت شد.");
      setPrice("");
      setNote("");
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "خطا در ثبت قیمت.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>ثبت قیمت استعلام</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="inquiry-price">قیمت (تومان)</Label>
            <Input
              id="inquiry-price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
              placeholder="مثلاً 12500000"
              dir="ltr"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inquiry-note">یادداشت (اختیاری)</Label>
            <Textarea
              id="inquiry-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="توضیح کوتاه دربارهٔ قیمت…"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
            انصراف
          </Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
            ثبت قیمت
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}