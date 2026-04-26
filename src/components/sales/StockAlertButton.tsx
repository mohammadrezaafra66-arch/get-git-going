import { useState } from "react";
import { BellPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { STOCK_ALERT_TRIGGER_STATUSES } from "@/lib/sales/stock-alerts";
import { StockAlertDialog } from "./StockAlertDialog";

interface Props {
  productId: string;
  productName: string;
  productSku?: string | null;
  stockStatus: string;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
}

export function StockAlertButton({
  productId, productName, productSku, stockStatus,
  size = "sm", variant = "outline", className,
}: Props) {
  const { roles } = useAuth();
  const [open, setOpen] = useState(false);

  if (!STOCK_ALERT_TRIGGER_STATUSES.has(stockStatus)) return null;
  if (!hasAnyRole(roles, ["admin", "manager", "accountant", "sales"])) return null;

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
      >
        <BellPlus className="ml-1 h-3.5 w-3.5" />
        موجود شد خبرم کن
      </Button>
      <StockAlertDialog
        open={open}
        onOpenChange={setOpen}
        productId={productId}
        productName={productName}
        productSku={productSku}
      />
    </>
  );
}