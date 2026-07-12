import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  nextStatuses,
  PURCHASE_STATUS_FA,
  type PurchaseStatus,
} from "@/lib/purchase/labels";
import {
  useUpdatePurchaseStatus,
  type PurchaseRequestRow,
} from "@/hooks/purchase/usePurchase";

const STATUS_BUTTON_VARIANT: Record<PurchaseStatus, "default" | "destructive" | "outline"> = {
  pending: "outline",
  approved: "default",
  purchased: "default",
  delivered: "default",
  cancelled: "destructive",
};

export function PurchaseStatusActions({ request }: { request: PurchaseRequestRow }) {
  const { user, roles } = useAuth();
  const isManager = roles.includes("admin") || roles.includes("manager");
  const isAssignee = !!user && request.assigned_to === user.id;

  const [target, setTarget] = useState<PurchaseStatus | null>(null);
  const [note, setNote] = useState("");
  const [finalPrice, setFinalPrice] = useState<string>("");
  const mutation = useUpdatePurchaseStatus();

  if (!isManager && !isAssignee) return null;

  const allowed = nextStatuses(request.status);
  if (allowed.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        وضعیت نهایی است و قابل تغییر نیست.
      </p>
    );
  }

  const requireFinalPrice = target === "purchased";

  const onConfirm = async () => {
    if (!target) return;
    if (requireFinalPrice) {
      const v = Number(finalPrice);
      if (!Number.isFinite(v) || v <= 0) {
        return;
      }
      await mutation.mutateAsync({
        request_id: request.id,
        new_status: target,
        note: note.trim() || null,
        final_price: v,
      });
    } else {
      await mutation.mutateAsync({
        request_id: request.id,
        new_status: target,
        note: note.trim() || null,
      });
    }
    setTarget(null);
    setNote("");
    setFinalPrice("");
  };

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex flex-wrap gap-2">
        {allowed.map((s) => (
          <Button
            key={s}
            type="button"
            size="sm"
            variant={STATUS_BUTTON_VARIANT[s]}
            disabled={mutation.isPending}
            onClick={() => {
              setTarget(s);
              setNote("");
              setFinalPrice("");
            }}
          >
            {PURCHASE_STATUS_FA[s]}
          </Button>
        ))}
      </div>

      <AlertDialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأیید تغییر وضعیت</AlertDialogTitle>
            <AlertDialogDescription>
              وضعیت درخواست به «{target ? PURCHASE_STATUS_FA[target] : ""}» تغییر می‌کند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            {requireFinalPrice && (
              <div className="space-y-1">
                <Label htmlFor="final_price">
                  قیمت نهایی <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="final_price"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={finalPrice}
                  onChange={(e) => setFinalPrice(e.target.value)}
                  placeholder="تومان"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="status_note">یادداشت (اختیاری)</Label>
              <Textarea
                id="status_note"
                rows={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                mutation.isPending ||
                (requireFinalPrice && (!finalPrice || Number(finalPrice) <= 0))
              }
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
            >
              {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              تأیید و ثبت
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}