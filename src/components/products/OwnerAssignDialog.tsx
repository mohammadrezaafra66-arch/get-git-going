import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";

interface Props {
  productId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existingUserIds: string[];
  onAssigned: () => void;
}

export function OwnerAssignDialog({
  productId,
  open,
  onOpenChange,
  existingUserIds,
  onAssigned,
}: Props) {
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 300);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["profiles-search", dq],
    enabled: open,
    queryFn: async () => {
      let query = supabase.from("profiles").select("id, full_name, phone").limit(20);
      if (dq.trim()) {
        const term = dq.trim().replace(/[%_]/g, "");
        query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).filter((u) => !existingUserIds.includes(u.id));
    },
  });

  const assign = async (userId: string) => {
    setSubmitting(userId);
    const { error } = await supabase
      .from("product_owner_assignments")
      .insert({ product_id: productId, user_id: userId });
    setSubmitting(null);
    if (error) toast.error(error.message);
    else {
      toast.success("مسئول اضافه شد");
      onAssigned();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>انتساب مسئول محصول</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجو در نام یا تلفن..."
          />
          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">در حال جستجو...</div>
            ) : (data ?? []).length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">کاربری یافت نشد.</div>
            ) : (
              <ul>
                {(data ?? []).map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between border-b border-border p-3 last:border-0"
                  >
                    <div>
                      <div className="text-sm font-medium">{u.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {u.phone ?? ""}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={submitting === u.id}
                      onClick={() => assign(u.id)}
                    >
                      {submitting === u.id ? (
                        <Loader2 className="ms-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="ms-1 h-3.5 w-3.5" />
                      )}
                      افزودن
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            بستن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
