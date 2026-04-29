import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

/**
 * F-4 placeholder. Real validation, deposit calc (≥30%) and commitment
 * checkbox wiring will be implemented in F-5.
 */
export function AdvancePaymentSection() {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">تعهد فروشنده (پیش‌واریزی)</div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center text-xs text-muted-foreground gap-1">
                <Info className="h-3.5 w-3.5" /> در نسخه بعدی
              </span>
            </TooltipTrigger>
            <TooltipContent>این بخش در فاز F-5 فعال می‌شود</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">مبلغ بیعانه (ریال)</Label>
          <Input type="text" inputMode="numeric" disabled placeholder="در فاز بعد" />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Checkbox id="commitment" disabled />
          <Label htmlFor="commitment" className="text-xs text-muted-foreground cursor-not-allowed">
            تأیید تعهد فروشنده
          </Label>
        </div>
      </div>
    </div>
  );
}