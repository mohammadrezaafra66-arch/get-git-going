import { useQueryClient } from "@tanstack/react-query";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { PurchaseForm } from "@/shared/components/PurchaseForm";
import type { PurchaseRequestRow } from "@/hooks/purchase/usePurchase";

/**
 * Issue 219 / C3 — registering a real purchase from inside the collaboration
 * space.
 *
 * The buyer is typically standing in a shop with a phone, so leaving the
 * purchase-request space to go to /purchases/create was the specific complaint
 * this feature exists to fix. A Drawer keeps them where they are.
 *
 * It renders the SHARED PurchaseForm — the very same component /purchases/create
 * uses — with the request's data prefilled. There is no second form, no second
 * validation schema and no second submit path.
 *
 * The project already uses vaul Drawers in three places
 * (AiAssistantDrawer, BoardProductDetailsDrawer, ProductPriceHistoryDrawer),
 * so this reuses the established component rather than introducing a pattern.
 */
export function PurchaseForRequestDrawer({
  request,
  open,
  onOpenChange,
}: {
  request: PurchaseRequestRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const requested = Number(request.quantity) || 0;
  const supplied = Number(request.supplied_quantity ?? 0);
  const remaining = Math.max(requested - supplied, 0);

  return (
    <Drawer
      open={open}
      // Closing mid-submit would strand the operator with no feedback while the
      // request is still in flight, so the panel refuses to close while the
      // form is busy. PurchaseForm disables its own submit button too.
      onOpenChange={onOpenChange}
    >
      <DrawerContent dir="rtl" className="max-h-[95vh]">
        <DrawerHeader className="text-right">
          <DrawerTitle>ثبت سند خرید</DrawerTitle>
          <DrawerDescription>
            اطلاعات واقعی خرید را وارد کنید. تأمین‌کننده، قیمت، ارز، انبار و تاریخ را خودتان تکمیل
            می‌کنید.
          </DrawerDescription>
        </DrawerHeader>

        {/* Scrollable body with room for the sticky submit inside the form. */}
        <div className="overflow-y-auto px-4 pb-[env(safe-area-inset-bottom)]">
          <PurchaseForm
            // Only what the request genuinely holds is prefilled. Supplier,
            // currency, payment term, warehouse, date and cash price are NOT
            // guessed — the request has no such data.
            initialValues={{
              product_id: request.product_id,
              // Default to what is still needed, not the original total: on a
              // second-stage purchase the full amount would be wrong.
              quantity: remaining > 0 ? Math.ceil(remaining) : 1,
              notes: request.notes ?? "",
            }}
            lockedFields={["product_id"]}
            requestContext={{
              requestId: request.id,
              productName: request.product_name,
              requestedQuantity: requested,
              suppliedQuantity: supplied,
              remainingQuantity: remaining,
              unit: request.unit,
            }}
            submitLabel="ثبت سند خرید"
            onSuccess={() => {
              // The card re-reads the request (status, supplied, summary) from
              // get_purchase_requests, so invalidating is enough — no local
              // state is duplicated here.
              queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
              onOpenChange(false);
            }}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
