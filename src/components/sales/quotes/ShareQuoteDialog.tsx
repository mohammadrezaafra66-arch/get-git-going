import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  QUOTE_SHARE_CHANNELS, QUOTE_SHARE_CHANNEL_LABELS, defaultShareMessage,
  type QuoteShareChannel,
} from "@/lib/sales/quote-share";

export interface ShareQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  quoteNumber: string;
  defaultRecipient?: string | null;
}

export function ShareQuoteDialog({
  open, onOpenChange, quoteId, quoteNumber, defaultRecipient,
}: ShareQuoteDialogProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [channel, setChannel] = useState<QuoteShareChannel>("whatsapp");
  const [recipient, setRecipient] = useState<string>(defaultRecipient ?? "");
  const [message, setMessage] = useState<string>(defaultShareMessage(quoteNumber));
  const [pdfAttached, setPdfAttached] = useState<boolean>(true);

  useEffect(() => {
    if (open) {
      setChannel("whatsapp");
      setRecipient(defaultRecipient ?? "");
      setMessage(defaultShareMessage(quoteNumber));
      setPdfAttached(true);
    }
  }, [open, quoteNumber, defaultRecipient]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("ابتدا وارد حساب شوید.");
      if (!recipient.trim()) throw new Error("گیرنده الزامی است.");
      const { error } = await supabase.from("sales_quote_share_logs").insert({
        quote_id: quoteId,
        channel,
        recipient: recipient.trim(),
        status: "draft",
        message_text: message.trim() || null,
        pdf_attached: pdfAttached,
        attempted_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("پیش‌نویس ارسال ثبت شد.");
      qc.invalidateQueries({ queryKey: ["sales-quote-share-logs"] });
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "خطا در ثبت پیش‌نویس ارسال."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">آماده‌سازی ارسال پیش‌فاکتور</DialogTitle>
          <DialogDescription className="text-right">
            ارسال واقعی به پیام‌رسان‌ها در فاز بعدی فعال می‌شود. اکنون فقط پیش‌نویس ثبت می‌گردد.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">کانال ارسال</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as QuoteShareChannel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUOTE_SHARE_CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>{QUOTE_SHARE_CHANNEL_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">گیرنده (شماره یا شناسه)</Label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="مثلاً 09120000000"
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">پیش‌نمایش پیام</Label>
            <Textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={pdfAttached}
              onCheckedChange={(v) => setPdfAttached(Boolean(v))}
            />
            <span>پیوست فایل PDF پیش‌فاکتور</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            انصراف
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />}
            ثبت پیش‌نویس ارسال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}