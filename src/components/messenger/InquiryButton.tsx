import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Tag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { InquiryProductPicker, type PickedProduct } from "./InquiryProductPicker";
import { useGroupPurchasers } from "@/hooks/messenger/useGroupRole";
import { createInquiry } from "@/lib/messenger/inquiries.functions";

export function InquiryButton({ groupId, disabled }: { groupId: string; disabled?: boolean }) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assignee, setAssignee] = useState<string | null>(null);
  const { data: purchasers, isLoading } = useGroupPurchasers(groupId);
  const create = useServerFn(createInquiry);

  const submit = useMutation({
    mutationFn: async () => {
      if (!product || !assignee) throw new Error("اطلاعات استعلام ناقص است.");
      const res = await create({
        data: { group_id: groupId, product_id: product.id, assigned_to: assignee },
      });
      if (!res.ok) throw new Error(res.error || "ثبت استعلام ناموفق بود.");
    },
    onSuccess: () => {
      toast.success("کارت استعلام در گروه ثبت شد.");
      qc.invalidateQueries({ queryKey: ["messenger-messages", groupId] });
      qc.invalidateQueries({ queryKey: ["inquiries", groupId] });
      setAssigneeOpen(false);
      setProduct(null);
      setAssignee(null);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "خطا در ثبت استعلام.");
    },
  });

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled}
        onClick={() => setPickerOpen(true)}
        aria-label="استعلام قیمت"
        title="استعلام قیمت"
      >
        <Tag className="h-4 w-4" />
      </Button>

      <InquiryProductPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(p) => {
          setProduct(p);
          setPickerOpen(false);
          setAssignee(null);
          setAssigneeOpen(true);
        }}
      />

      <Dialog open={assigneeOpen} onOpenChange={setAssigneeOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>انتخاب مسئول خرید</DialogTitle>
          </DialogHeader>
          {product && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div className="font-medium">{product.name}</div>
              {product.sku && (
                <div className="text-xs text-muted-foreground" dir="ltr">SKU: {product.sku}</div>
              )}
            </div>
          )}
          <div className="space-y-2">
            {isLoading && (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری…
              </div>
            )}
            {!isLoading && (purchasers?.length ?? 0) === 0 && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                در این گروه مسئول خریدی تعیین نشده است.
              </div>
            )}
            {!isLoading &&
              (purchasers ?? []).map((p) => (
                <button
                  key={p.user_id}
                  type="button"
                  onClick={() => setAssignee(p.user_id)}
                  className={`block w-full rounded-md border px-3 py-2 text-right text-sm hover:bg-muted ${
                    assignee === p.user_id ? "border-primary bg-primary/10" : ""
                  }`}
                >
                  {p.full_name || "بدون نام"}
                </button>
              ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setAssigneeOpen(false)} disabled={submit.isPending}>
              انصراف
            </Button>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending || !assignee}>
              {submit.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
              ثبت استعلام
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}