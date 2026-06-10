import { useState } from "react";
import { BellPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PriceAlertDialog } from "./PriceAlertDialog";

interface Props {
  productId: string;
  productName?: string | null;
  salePriceTypeId?: string | null;
  variant?: "outline" | "ghost" | "default" | "secondary";
  size?: "sm" | "default" | "icon";
  label?: string;
}

export function CreatePriceAlertButton({
  productId,
  productName,
  salePriceTypeId,
  variant = "ghost",
  size = "sm",
  label = "هشدار قیمت",
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="ایجاد هشدار قیمت"
      >
        <BellPlus className="ms-1 h-4 w-4" />
        {size !== "icon" && label}
      </Button>
      <PriceAlertDialog
        open={open}
        onOpenChange={setOpen}
        prefill={{
          productId,
          productName: productName ?? undefined,
          salePriceTypeId: salePriceTypeId ?? null,
        }}
      />
    </>
  );
}
