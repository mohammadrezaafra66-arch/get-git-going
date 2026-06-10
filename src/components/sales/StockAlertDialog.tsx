import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  validateStockAlertInput, findOpenStockAlert, createStockAlertRequest,
  type StockAlertPriority,
} from "@/lib/sales/stock-alerts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string;
  productName: string;
  productSku?: string | null;
}

export function StockAlertDialog({ open, onOpenChange, productId, productName, productSku }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [priority, setPriority] = useState<StockAlertPriority>("normal");
  const [note, setNote] = useState("");

  const reset = () => { setName(""); setPhone(""); setPriority("normal"); setNote(""); };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("ابتدا وارد شوید.");
      const input = {
        product_id: productId,
        customer_name: name,
        customer_phone: phone,
        priority,
        note: note || null,
      };
      const err = validateStockAlertInput(input);
      if (err) throw new Error(err);
      const dup = await findOpenStockAlert(productId, phone);
      if (dup) throw new Error("برای این مشتری و محصول قبلاً درخواست باز ثبت شده است.");
      await createStockAlertRequest(input, user.id);
    },
    onSuccess: () => {
      toast.success("درخواست اطلاع‌رسانی موجودی ثبت شد.");
      qc.invalidateQueries({ queryKey: ["stock-alerts"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "خطا در ثبت درخواست.";
      toast.error(msg);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!mutation.isPending) onOpenChange(v); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>موجود شد خبرم کن</DialogTitle>
          <DialogDescription>
            ثبت درخواست مشتری برای اطلاع‌رسانی هنگام موجود شدن «{productName}»
            {productSku ? ` (${productSku})` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sa-name">نام مشتری <span className="text-destructive">*</span></Label>
            <Input id="sa-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="مثلاً علی رضایی" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sa-phone">شماره تماس <span className="text-destructive">*</span></Label>
            <Input
              id="sa-phone" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={40}
              dir="ltr"
              inputMode="tel"
              placeholder="مثلاً 09120000000"
            />
            <p className="text-[11px] text-muted-foreground">فقط عدد، +، فاصله یا خط تیره مجاز است.</p>
          </div>
          <div className="space-y-1.5">
            <Label>اولویت</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as StockAlertPriority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">کم</SelectItem>
                <SelectItem value="normal">عادی</SelectItem>
                <SelectItem value="high">بالا</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sa-note">توضیحات (اختیاری)</Label>
            <Textarea
              id="sa-note" value={note} onChange={(e) => setNote(e.target.value)}
              maxLength={500} rows={3}
              placeholder="مثلاً: تماس بعد از ساعت ۱۸"
            />
            <p className="text-[11px] text-muted-foreground">{note.length}/۵۰۰</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            انصراف
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            ثبت درخواست
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}