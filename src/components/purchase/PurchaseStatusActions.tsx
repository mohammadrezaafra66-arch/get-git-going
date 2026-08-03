import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { nextStatuses, PURCHASE_STATUS_FA, type PurchaseStatus } from "@/lib/purchase/labels";
import { useUpdatePurchaseStatus, type PurchaseRequestRow } from "@/hooks/purchase/usePurchase";
import { PurchaseForRequestDrawer } from "./PurchaseForRequestDrawer";

const STATUS_BUTTON_VARIANT: Record<PurchaseStatus, "default" | "destructive" | "outline"> = {
  pending: "outline",
  approved: "default",
  partially_purchased: "default",
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
  // Issue 219 / C3 — «خرید انجام شد» now opens the real purchase form.
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const mutation = useUpdatePurchaseStatus();

  if (!isManager && !isAssignee) return null;

  /*
    Issue 219 / C5 — a legacy request is read-only.

    It has no document history, so neither route is honest for it: the purchase
    form would invent a document it never had, and the old manual dialog would
    let someone declare it purchased with a typed number — exactly the thing
    this issue exists to remove. The backend refuses both (REQUEST_LEGACY_UNKNOWN
    and PURCHASE_STATUS_DERIVED), so offering the buttons would only produce
    errors. Deciding what to do with legacy rows is its own future feature.
  */
  if (request.legacy_no_fulfillment) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="legacy-readonly">
        این درخواست از دورهٔ پیش از ثبت سند خرید است و فقط قابل مشاهده است.
      </p>
    );
  }

  const allowed = nextStatuses(request.status);
  if (allowed.length === 0) {
    return <p className="text-sm text-muted-foreground">وضعیت نهایی است و قابل تغییر نیست.</p>;
  }

  const onConfirm = async () => {
    if (!target) return;
    // C5: no final_price is ever sent. It is derived from the purchase
    // documents by create_purchase, and update_purchase_status now rejects the
    // parameter outright rather than letting a typed number overwrite it.
    await mutation.mutateAsync({
      request_id: request.id,
      new_status: target,
      note: note.trim() || null,
    });
    setTarget(null);
    setNote("");
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
              /*
                Issue 219 / C3 + C5 — the whole point of this issue.

                «خرید انجام شد» used to open a dialog that typed in a final price
                and flipped the status, so a request could read "purchased"
                while no purchase document existed anywhere. It opens the real
                purchase form instead, and the status moves only because a
                document was committed.

                C5 removed the escape hatch: there is no longer any branch that
                falls back to the manual dialog. Legacy requests returned early
                above, and the backend refuses a hand-set `purchased` from every
                direction — RPC, PostgREST, or a direct UPDATE.
              */
              if (s === "purchased") {
                setPurchaseOpen(true);
                return;
              }
              setTarget(s);
              setNote("");
            }}
          >
            {PURCHASE_STATUS_FA[s]}
          </Button>
        ))}
      </div>

      <PurchaseForRequestDrawer
        request={request}
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
      />

      <AlertDialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأیید تغییر وضعیت</AlertDialogTitle>
            <AlertDialogDescription>
              وضعیت درخواست به «{target ? PURCHASE_STATUS_FA[target] : ""}» تغییر می‌کند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/*
            The «قیمت نهایی» input that used to live here is gone. It was the
            manual source of truth for a figure that is now computed from the
            purchase documents, and it only ever appeared for the `purchased`
            target — which is no longer reachable from this dialog at all.
          */}
          <div className="space-y-3">
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
              disabled={mutation.isPending}
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
