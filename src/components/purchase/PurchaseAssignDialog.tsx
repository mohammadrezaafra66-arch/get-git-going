import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, UserX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROLE_FA } from "@/lib/settings/labels";
import type { PurchaseRequestRow } from "@/hooks/purchase/usePurchase";
import {
  useAssignPurchaseRequest,
  usePurchaseAssigneeOptions,
  assignErrorMessage,
  isAssignmentConflict,
} from "@/hooks/purchase/useAssignPurchaseRequest";

/**
 * Issue 219 / C4 — choose who is responsible for a purchase request.
 *
 * The list comes from the server (`get_purchase_assignee_options`), which only
 * returns active, approved users holding purchase_specialist / manager / admin.
 * The dialog therefore cannot offer an ineligible person, and if a tampered
 * payload tried to name one anyway the RPC refuses it.
 */
export function PurchaseAssignDialog({
  request,
  open,
  onOpenChange,
}: {
  request: PurchaseRequestRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(request.assigned_to ?? null);
  const [note, setNote] = useState("");
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Who owned the request at the moment this dialog opened — frozen, not re-read
   * from props at submit time.
   *
   * This is the whole optimistic-concurrency mechanism. Sending the CURRENT prop
   * instead would defeat it: a background refetch (TanStack Query refetches on
   * window focus) can quietly replace `request.assigned_to` with whatever
   * another user just set, and the expectation would then always match reality.
   * The stale write would sail through and silently overwrite them — the exact
   * lost update this check exists to prevent.
   */
  const [expectedAtOpen, setExpectedAtOpen] = useState<string | null>(request.assigned_to ?? null);

  const { data: options = [], isLoading } = usePurchaseAssigneeOptions(open);
  const mutation = useAssignPurchaseRequest();

  // Reset on open only. Deliberately NOT keyed on request.assigned_to: a
  // refetch landing while the operator is choosing must not wipe their
  // selection or move the expectation out from under them.
  useEffect(() => {
    if (open) {
      setSelected(request.assigned_to ?? null);
      setExpectedAtOpen(request.assigned_to ?? null);
      setNote("");
      setSearch("");
      setConflict(false);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request.id]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => (o.full_name ?? "").toLowerCase().includes(term));
  }, [options, search]);

  const currentName =
    options.find((o) => o.user_id === request.assigned_to)?.full_name ??
    request.assignee_name ??
    null;

  const submit = async () => {
    setError(null);
    try {
      await mutation.mutateAsync({
        request_id: request.id,
        assignee_id: selected,
        note: note.trim() || null,
        // What this dialog believed when it opened. If someone else has moved
        // the request since, the server refuses rather than overwriting them.
        expected_current_assignee_id: expectedAtOpen,
        expect_provided: true,
      });
      onOpenChange(false);
    } catch (err) {
      if (isAssignmentConflict(err)) {
        // Deliberately stays open: the operator needs to see the new owner and
        // decide again, not lose their note and start over.
        setConflict(true);
      }
      setError(assignErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <DialogHeader className="text-right">
          <DialogTitle>مسئول خرید</DialogTitle>
          <DialogDescription>
            {currentName ? `مسئول فعلی: ${currentName}` : "این درخواست هنوز مسئول خرید ندارد."}
          </DialogDescription>
        </DialogHeader>

        {conflict && (
          <div
            className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
            data-testid="assign-conflict"
          >
            مسئول این درخواست هم‌زمان توسط کاربر دیگری تغییر کرده است. فهرست را ببندید و دوباره باز
            کنید تا آخرین وضعیت را ببینید.
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="assignee_search">جست‌وجوی کاربر</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="assignee_search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="نام کاربر"
                className="pr-8"
              />
            </div>
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto" data-testid="assignee-list">
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="ms-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                کاربری با این نام پیدا نشد.
              </p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.user_id}
                  type="button"
                  onClick={() => setSelected(o.user_id)}
                  data-testid="assignee-option"
                  data-user-id={o.user_id}
                  className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-md border p-2 text-right text-sm ${
                    selected === o.user_id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-1">
                    <span className="truncate font-medium">{o.full_name}</span>
                    {o.roles.map((r) => (
                      <Badge key={r} variant="outline" className="text-[10px]">
                        {ROLE_FA[r] ?? r}
                      </Badge>
                    ))}
                    {o.is_default && (
                      <Badge variant="secondary" className="text-[10px]">
                        پیش‌فرض
                      </Badge>
                    )}
                  </span>
                  {selected === o.user_id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              ))
            )}
          </div>

          {/* Unassigning is a real, deliberate action, so it is its own control
              rather than an empty selection the operator could reach by accident. */}
          <button
            type="button"
            onClick={() => setSelected(null)}
            data-testid="assignee-none"
            className={`flex min-h-11 w-full items-center gap-2 rounded-md border p-2 text-right text-sm ${
              selected === null ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            }`}
          >
            <UserX className="h-4 w-4" />
            بدون مسئول
          </button>

          <div className="space-y-1">
            <Label htmlFor="assign_note">
              یادداشت {selected === null || request.assigned_to ? "(توصیه می‌شود)" : "(اختیاری)"}
            </Label>
            <Textarea
              id="assign_note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="دلیل تغییر مسئول"
            />
          </div>

          {error && !conflict && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button type="button" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            ثبت مسئول
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
