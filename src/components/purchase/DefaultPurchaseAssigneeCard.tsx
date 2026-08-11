import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_FA } from "@/lib/settings/labels";
import {
  usePurchaseAssigneeOptions,
  useSetDefaultPurchaseAssignee,
} from "@/hooks/purchase/useAssignPurchaseRequest";

/**
 * Issue 219 / C4 — the default purchase assignee.
 *
 * Lives on /admin/purchase rather than /admin/settings: the shop-settings page
 * is `requireAdmin`, and C4 requires managers to be able to set this. It is
 * also where someone thinking about purchasing already is.
 *
 * The value is written through set_default_purchase_assignee, not through the
 * generic shop-settings save path. That RPC validates the user, restricts the
 * write to this one key, and audits the change; the generic path would happily
 * store any text at all.
 */
const NONE = "__none__";

export function DefaultPurchaseAssigneeCard() {
  const { data: options = [], isLoading } = usePurchaseAssigneeOptions(true);
  const mutation = useSetDefaultPurchaseAssignee();
  const [value, setValue] = useState<string>(NONE);

  // The server marks the current default in the options list, so there is no
  // second request to read it and nothing to keep in sync.
  const current = options.find((o) => o.is_default)?.user_id ?? null;
  useEffect(() => {
    setValue(current ?? NONE);
  }, [current]);

  const dirty = (current ?? NONE) !== value;

  return (
    <Card>
      <CardContent className="space-y-3 p-4" dir="rtl">
        <div className="space-y-1">
          <Label htmlFor="default-purchase-assignee">مسئول پیش‌فرض خرید</Label>
          <p className="text-xs text-muted-foreground">
            اگر مسئول پیش‌فرض انتخاب نشود، سیستم ابتدا یک مسئول خرید فعال را بررسی می‌کند و در صورت
            نبودن، درخواست بدون مسئول ثبت می‌شود.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={value} onValueChange={setValue} disabled={isLoading}>
            <SelectTrigger id="default-purchase-assignee" className="min-w-[14rem] flex-1">
              <SelectValue placeholder="انتخاب کنید" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>بدون مسئول پیش‌فرض</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.user_id} value={o.user_id}>
                  {o.full_name}
                  {o.roles.length > 0 && (
                    <span className="text-muted-foreground">
                      {" — "}
                      {o.roles.map((r) => ROLE_FA[r] ?? r).join("، ")}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            onClick={() => mutation.mutate(value === NONE ? null : value)}
            disabled={!dirty || mutation.isPending}
            className="gap-2"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            ذخیره
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          تغییر این تنظیم روی درخواست‌های قبلی اثری ندارد و فقط درخواست‌های جدید را تحت تأثیر قرار
          می‌دهد.
        </p>
      </CardContent>
    </Card>
  );
}
