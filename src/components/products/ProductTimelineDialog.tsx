import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProductTimeline } from "./ProductTimeline";

interface Props {
  productId: string | null;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductTimelineDialog({ productId, productName, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>تاریخچه محصول: {productName}</DialogTitle>
        </DialogHeader>
        {productId && <ProductTimeline productId={productId} productName={productName} />}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              بستن
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
