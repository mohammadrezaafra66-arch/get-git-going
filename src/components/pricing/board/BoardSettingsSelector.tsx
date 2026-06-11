import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Tag } from "lucide-react";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";
import { fetchSalePriceTypes } from "@/lib/pricing/queries";
import {
  AMIN_HOZOOR_BOARD_KEY,
  fetchBoardSetting,
  updateBoardSalePriceType,
} from "@/lib/pricing/board-settings";

interface Props {
  onChange?: (salePriceTypeId: string | null, title: string) => void;
}

export function BoardSettingsSelector({ onChange }: Props) {
  const { user, roles } = useAuth();
  const canEdit = hasPermissionEx(roles, "pricing", "update");
  const qc = useQueryClient();

  const settingQuery = useQuery({
    queryKey: ["pricing-board-setting", AMIN_HOZOOR_BOARD_KEY],
    queryFn: () => fetchBoardSetting(AMIN_HOZOOR_BOARD_KEY),
    staleTime: 30_000,
  });

  const sptQuery = useQuery({
    queryKey: ["sale-price-types-active"],
    queryFn: () => fetchSalePriceTypes(true),
    staleTime: 5 * 60_000,
  });

  const currentTitle = sptQuery.data?.find((t: any) => t.id === settingQuery.data?.sale_price_type_id)?.title ?? "—";

  const [pending, setPending] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (newId: string) => {
      if (!user?.id) throw new Error("کاربر احراز نشده است.");
      return updateBoardSalePriceType({
        boardKey: AMIN_HOZOOR_BOARD_KEY,
        newSalePriceTypeId: newId,
        actorId: user.id,
      });
    },
    onSuccess: (data) => {
      toast.success("نوع قیمت فروش تابلو به‌روزرسانی شد.");
      qc.invalidateQueries({ queryKey: ["pricing-board-setting", AMIN_HOZOOR_BOARD_KEY] });
      qc.invalidateQueries({ queryKey: ["amin-board-computed"] });
      qc.invalidateQueries({ queryKey: ["amin-board-history"] });
      const title = sptQuery.data?.find((t: any) => t.id === data.sale_price_type_id)?.title ?? "";
      onChange?.(data.sale_price_type_id, title);
      setPending(null);
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "خطا در به‌روزرسانی نوع قیمت فروش");
      setPending(null);
    },
  });

  const handleChange = (val: string) => {
    setPending(val);
    mutation.mutate(val);
  };

  if (settingQuery.isLoading || sptQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        بارگذاری تنظیمات تابلو...
      </div>
    );
  }

  const currentId = settingQuery.data?.sale_price_type_id ?? "";

  if (!canEdit) {
    return (
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">نوع قیمت نمایش‌داده‌شده:</span>
        <Badge variant="secondary" className="text-sm">{currentTitle}</Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Tag className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">نوع قیمت تابلو:</span>
      <div className="min-w-[200px]">
        <Select
          value={pending ?? currentId}
          onValueChange={handleChange}
          disabled={mutation.isPending}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="انتخاب نوع قیمت" />
          </SelectTrigger>
          <SelectContent>
            {(sptQuery.data ?? []).map((t: any) => (
              <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}