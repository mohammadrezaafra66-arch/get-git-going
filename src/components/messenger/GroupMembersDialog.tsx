import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";

type AssignableRole = "member" | "viewer" | "purchaser";
type MemberRole = "admin" | AssignableRole;

type MemberRow = {
  user_id: string;
  role: MemberRole;
  full_name: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
};

const ROLE_LABEL: Record<MemberRole, string> = {
  admin: "مدیر",
  member: "عضو",
  viewer: "بیننده",
  purchaser: "مسئول خرید",
};

const ROLE_BADGE_CLASS: Record<MemberRole, string> = {
  admin: "bg-amber-100 text-amber-900 border-amber-200",
  member: "bg-sky-100 text-sky-900 border-sky-200",
  viewer: "bg-slate-100 text-slate-700 border-slate-200",
  purchaser: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function GroupMembersDialog({
  open,
  onOpenChange,
  groupId,
  currentUserId,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groupId: string;
  currentUserId: string | null;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [newRole, setNewRole] = useState<AssignableRole>("member");

  const membersKey = ["messenger-group-members", groupId];

  const membersQuery = useQuery({
    queryKey: membersKey,
    enabled: open && !!groupId,
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error } = await supabase
        .from("messenger_group_members")
        .select("user_id, role")
        .eq("group_id", groupId);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ user_id: string; role: MemberRole }>;
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      let names = new Map<string, string | null>();
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        names = new Map((profs ?? []).map((p) => [p.id, p.full_name ?? null]));
      }
      return rows.map((r) => ({
        user_id: r.user_id,
        role: r.role,
        full_name: names.get(r.user_id) ?? null,
      }));
    },
  });

  const searchQuery = useQuery({
    queryKey: ["messenger-add-member-search", groupId, debounced],
    enabled: open && isAdmin,
    queryFn: async (): Promise<ProfileRow[]> => {
      const term = debounced.trim();
      let query = supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name", { ascending: true })
        .limit(50);
      if (term.length >= 2) {
        query = query.ilike("full_name", `%${term}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      const existingIds = new Set((membersQuery.data ?? []).map((m) => m.user_id));
      return (data ?? []).filter((p) => !existingIds.has(p.id));
    },
  });

  const invalidateMembers = () => {
    qc.invalidateQueries({ queryKey: membersKey });
    qc.invalidateQueries({ queryKey: ["messenger-group-purchasers", groupId] });
    qc.invalidateQueries({ queryKey: ["messenger-group-role", groupId] });
  };

  const addMember = useMutation({
    mutationFn: async (vars: { userId: string; role: AssignableRole }) => {
      const { error } = await supabase.rpc("add_messenger_group_member", {
        p_group_id: groupId,
        p_user_id: vars.userId,
        p_role: vars.role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("عضو افزوده شد");
      setSearch("");
      invalidateMembers();
    },
    onError: (err) => toast.error(errMsg(err, "خطا در افزودن عضو")),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("messenger_group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("عضو حذف شد");
      invalidateMembers();
    },
    onError: (err) => toast.error(errMsg(err, "خطا در حذف عضو")),
  });

  const updateRole = useMutation({
    mutationFn: async (vars: { userId: string; role: MemberRole }) => {
      const { data, error } = await supabase
        .from("messenger_group_members")
        .update({ role: vars.role })
        .eq("group_id", groupId)
        .eq("user_id", vars.userId)
        .select("user_id, role");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("شما دسترسی تغییر نقش را ندارید یا عضو یافت نشد");
      }
    },
    onSuccess: () => {
      toast.success("نقش به‌روزرسانی شد");
      invalidateMembers();
    },
    onError: (err) => toast.error(errMsg(err, "خطا در تغییر نقش")),
  });

  const members = membersQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>مدیریت اعضا</DialogTitle>
          <DialogDescription>اعضای گروه را مشاهده، اضافه یا حذف کنید.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">اعضای فعلی</h3>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-2">
              {membersQuery.isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : members.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">عضوی یافت نشد</p>
              ) : (
                members.map((m) => {
                  const isSelf = m.user_id === currentUserId;
                  const canEdit = isAdmin && !isSelf;
                  return (
                    <div
                      key={m.user_id}
                      className="flex items-center justify-between gap-2 rounded-md border bg-card p-2"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {m.full_name ?? "بدون نام"}
                        </span>
                        {isSelf && <span className="text-xs text-muted-foreground">(شما)</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {canEdit ? (
                          <Select
                            value={m.role}
                            onValueChange={(v) =>
                              updateRole.mutate({ userId: m.user_id, role: v as MemberRole })
                            }
                            disabled={updateRole.isPending}
                          >
                            <SelectTrigger className="h-8 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
                              <SelectItem value="member">{ROLE_LABEL.member}</SelectItem>
                              <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                              <SelectItem value="purchaser">{ROLE_LABEL.purchaser}</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className={ROLE_BADGE_CLASS[m.role]}>
                            {ROLE_LABEL[m.role]}
                          </Badge>
                        )}
                        {canEdit && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => removeMember.mutate(m.user_id)}
                            disabled={removeMember.isPending}
                            aria-label="حذف عضو"
                            title="حذف عضو"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {isAdmin && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">افزودن عضو جدید</h3>
              <div className="flex items-center gap-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="جست‌وجوی نام کاربر..."
                  className="flex-1"
                />
                <Select value={newRole} onValueChange={(v) => setNewRole(v as AssignableRole)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">{ROLE_LABEL.member}</SelectItem>
                    <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                    <SelectItem value="purchaser">{ROLE_LABEL.purchaser}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border">
                {searchQuery.isLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (searchQuery.data ?? []).length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">کاربری یافت نشد</p>
                ) : (
                  (searchQuery.data ?? []).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 border-b p-2 last:border-b-0"
                    >
                      <span className="truncate text-sm">{p.full_name ?? "بدون نام"}</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1"
                        onClick={() => addMember.mutate({ userId: p.id, role: newRole })}
                        disabled={addMember.isPending}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        افزودن
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
