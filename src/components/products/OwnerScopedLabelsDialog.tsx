import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { useAuth } from "@/lib/auth/AuthProvider";
import { OWNER_LABEL_STALE_TIME_MS } from "@/lib/products/owner-label-config";
import { fetchOwnerAssignableLabels } from "@/lib/products/owner-label-queries";
import {
  assertQuotaAllowsAdd,
  canPersistOwnerLabels,
  fetchProductOwnerLabelLinks,
  saveOwnerLabelLinks,
} from "@/lib/products/owner-label-mutations";

export interface OwnerScopedLabelsDialogProps {
  productId: string | null;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: {
    taggedCount: number;
    quota: number;
    remaining: number;
    isMet: boolean;
  };
  onMutated?: () => void;
}

export function OwnerScopedLabelsDialog({
  productId,
  productName,
  open,
  onOpenChange,
  summary,
  onMutated,
}: OwnerScopedLabelsDialogProps) {
  const { roles } = useAuth();
  const canWrite = canPersistOwnerLabels(roles ?? []);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const labelsQ = useQuery({
    queryKey: ["owner-assignable-labels"],
    queryFn: fetchOwnerAssignableLabels,
    enabled: open,
    staleTime: OWNER_LABEL_STALE_TIME_MS,
  });

  const assignableLabelIds = useMemo(
    () => (labelsQ.data ?? []).map((l) => l.id),
    [labelsQ.data],
  );

  const linksQ = useQuery({
    queryKey: ["product-owner-label-links", productId],
    queryFn: () => fetchProductOwnerLabelLinks(productId!, assignableLabelIds),
    enabled: open && !!productId && labelsQ.isSuccess && assignableLabelIds.length > 0,
    staleTime: OWNER_LABEL_STALE_TIME_MS,
  });

  // sync selected with loaded links
  useEffect(() => {
    if (open && linksQ.data) setSelected(new Set(linksQ.data));
  }, [open, linksQ.data]);

  // reset on close
  useEffect(() => {
    if (!open) setSelected(new Set());
  }, [open]);

  const prevSelected = linksQ.data ?? [];
  const wasTaggedAtOpen = (linksQ.data ?? []).length > 0;
  const willBeTagged = selected.size > 0;
  const quotaFull = summary.remaining <= 0;
  const blockedByQuota = canWrite && !wasTaggedAtOpen && quotaFull;

  // تشخیص تغییر واقعی بین selected و prevSelected
  const prevSet = new Set(prevSelected);
  let hasChanges = prevSet.size !== selected.size;
  if (!hasChanges) {
    for (const id of selected) {
      if (!prevSet.has(id)) {
        hasChanges = true;
        break;
      }
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("محصولی برای ذخیره مشخص نشده است.");
      if (!canWrite) {
        throw new Error("برای نقش شما امکان ثبت برچسب فعال نیست.");
      }
      const becomingNewlyTagged = !wasTaggedAtOpen && selected.size > 0;
      assertQuotaAllowsAdd({
        taggedCount: summary.taggedCount,
        quota: summary.quota,
        becomingNewlyTagged,
      });
      return saveOwnerLabelLinks({
        productId,
        assignableLabelIds,
        prevSelected,
        nextSelected: Array.from(selected),
      });
    },
    onMutate: async () => {
      // optimistic: فقط linkهای داخلی/assignable.
      const key = ["product-owner-label-links", productId] as const;
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<string[]>(key);
      queryClient.setQueryData<string[]>(key, Array.from(selected));
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot !== undefined) {
        queryClient.setQueryData(
          ["product-owner-label-links", productId],
          ctx.snapshot,
        );
      }
      const msg = err instanceof Error ? err.message : "ذخیره برچسب‌ها ناموفق بود.";
      toast.error(msg);
    },
    onSuccess: () => {
      const isTaggedNow = selected.size > 0;
      if (!wasTaggedAtOpen && isTaggedNow) {
        toast.success("محصول به سبد تمرکز شما اضافه شد.");
      } else if (wasTaggedAtOpen && !isTaggedNow) {
        toast.success("محصول از سبد تمرکز خارج شد.");
      } else {
        toast.success("برچسب‌های داخلی محصول ذخیره شد.");
      }
      queryClient.invalidateQueries({ queryKey: ["owner-label-summary"] });
      queryClient.invalidateQueries({ queryKey: ["owner-label-products"] });
      queryClient.invalidateQueries({
        queryKey: ["product-owner-label-links", productId],
      });
      queryClient.invalidateQueries({ queryKey: ["product-label-links"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onMutated?.();
      onOpenChange(false);
    },
  });

  function toggle(id: string) {
    if (!canWrite) return;
    if (blockedByQuota) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const loading = labelsQ.isLoading || (!!productId && linksQ.isLoading);
  const labels = labelsQ.data ?? [];
  const checkboxesDisabled = !canWrite || mutation.isPending || blockedByQuota;

  let saveTitle = "ذخیره برچسب‌های داخلی";
  if (!canWrite) saveTitle = "برای نقش شما امکان ثبت برچسب فعال نیست";
  else if (blockedByQuota) saveTitle = "سهمیه شما پر است";
  else if (!hasChanges) saveTitle = "تغییری برای ذخیره وجود ندارد";

  const saveDisabled =
    !canWrite ||
    mutation.isPending ||
    loading ||
    !productId ||
    blockedByQuota ||
    !hasChanges;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>مدیریت برچسب‌های داخلی</DialogTitle>
          <DialogDescription>
            برای این محصول فقط برچسب‌هایی را انتخاب کنید که در سهمیه مسئول محصول حساب می‌شوند.
          </DialogDescription>
          {productName && (
            <div className="mt-1 truncate text-sm text-muted-foreground">
              محصول: {productName}
            </div>
          )}
        </DialogHeader>

        {!canWrite && (
          <div className="rounded-md border border-amber-400/60 bg-amber-50 p-3 text-xs leading-6 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            برای نقش شما ثبت نهایی برچسب‌ها هنوز فعال نشده است. در این نسخه می‌توانید برچسب‌های داخلی محصول را مشاهده کنید، اما امکان ذخیره ندارید.
          </div>
        )}

        {canWrite && productId && !labelsQ.isLoading && !linksQ.isLoading && (
          <div
            className={
              "rounded-md border p-3 text-xs leading-6 " +
              (wasTaggedAtOpen
                ? "border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                : blockedByQuota
                  ? "border-amber-500/60 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                  : "border-sky-500/40 bg-sky-50 text-sky-900 dark:bg-sky-950/30 dark:text-sky-200")
            }
          >
            {wasTaggedAtOpen
              ? "این محصول در حال حاضر داخل سبد تمرکز شماست. ویرایش یا حذف برچسب‌های داخلی آن مجاز است."
              : blockedByQuota
                ? "سهمیه شما پر است. برای افزودن این محصول، ابتدا باید یکی از محصولات قبلی را از سبد تمرکز خارج کنید."
                : "با انتخاب برچسب برای این محصول، یکی از جای خالی‌های سبد تمرکز شما استفاده می‌شود."}
          </div>
        )}

        <div className="max-h-80 overflow-y-auto rounded-md border border-border p-2">
          {!productId ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              محصولی برای مدیریت انتخاب نشده است.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {labelsQ.isLoading
                ? "در حال دریافت برچسب‌ها..."
                : "در حال دریافت برچسب‌های فعلی محصول..."}
            </div>
          ) : labelsQ.error ? (
            <div className="py-6 text-center text-sm text-destructive">
              خطا در دریافت برچسب‌ها
            </div>
          ) : linksQ.error ? (
            <div className="py-6 text-center text-sm text-destructive">
              خطا در دریافت برچسب‌های فعلی محصول
            </div>
          ) : labels.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              هنوز برچسب داخلی فعالی برای انتخاب وجود ندارد.
            </div>
          ) : (
            <ul className="space-y-1">
              {labels.map((l) => {
                const checked = selected.has(l.id);
                const color = l.color || "#64748b";
                return (
                  <li key={l.id}>
                    <label
                      className={
                        "flex items-center gap-2 rounded-md px-2 py-1.5 " +
                        (canWrite && !blockedByQuota
                          ? "cursor-pointer hover:bg-muted"
                          : "cursor-not-allowed opacity-80")
                      }
                    >
                      <Checkbox
                        checked={checked}
                        disabled={checkboxesDisabled}
                        onCheckedChange={() => toggle(l.id)}
                      />
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ backgroundColor: `${color}22`, color }}
                      >
                        {l.title}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            بستن
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={saveDisabled}
            title={saveTitle}
          >
            {mutation.isPending
              ? "در حال ذخیره..."
              : canWrite
                ? "ذخیره برچسب‌ها"
                : "فقط مشاهده"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OwnerScopedLabelsDialog;