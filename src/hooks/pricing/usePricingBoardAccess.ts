import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  fetchMyBoardAccess,
  requestBoardAccess,
  type BoardAccessRequest,
} from "@/lib/pricing/board-access";
import { hasPermissionEx } from "@/lib/rbac/roles";

/**
 * بررسی وضعیت دسترسی کاربر به board، و اگر وجود ندارد و کاربر مدیر نیست،
 * یک درخواست pending خودکار ایجاد می‌کند.
 */
export function usePricingBoardAccess(boardKey: string) {
  const { user, roles } = useAuth();
  const qc = useQueryClient();

  const isManager =
    roles?.includes("admin") || roles?.includes("manager") || roles?.includes("accountant");

  const accessQuery = useQuery({
    enabled: !!user?.id,
    queryKey: ["pricing-board-access", boardKey, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      return fetchMyBoardAccess(boardKey, user.id);
    },
    staleTime: 30_000,
  });

  // اگر هیچ درخواستی نیست و کاربر مدیر هم نیست، خودکار درخواست ثبت کن
  useEffect(() => {
    if (!user?.id) return;
    if (isManager) return;
    if (accessQuery.isLoading) return;
    if (accessQuery.data) return;
    // ایجاد درخواست
    requestBoardAccess(boardKey, user.id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["pricing-board-access", boardKey, user.id] });
      })
      .catch(() => {
        // عمداً silent — با invalidate دوباره تلاش می‌شود
      });
  }, [user?.id, isManager, accessQuery.isLoading, accessQuery.data, boardKey, qc]);

  let effectiveStatus: "loading" | "approved" | "pending" | "rejected" | "unauthenticated";
  if (!user?.id) effectiveStatus = "unauthenticated";
  else if (accessQuery.isLoading) effectiveStatus = "loading";
  else if (isManager) effectiveStatus = "approved";
  else if (!accessQuery.data) effectiveStatus = "pending"; // در حال ساخت/در انتظار
  else effectiveStatus = (accessQuery.data as BoardAccessRequest).status as any;

  const canManage = hasPermissionEx(roles ?? [], "pricing", "update");

  return {
    status: effectiveStatus,
    isApproved: effectiveStatus === "approved",
    isManager: !!isManager,
    canManage,
    request: accessQuery.data ?? null,
    refetch: accessQuery.refetch,
  };
}