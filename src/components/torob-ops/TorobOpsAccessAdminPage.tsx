import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  torobOpsAdminListActiveUsers,
  torobOpsAdminListCredentials,
  torobOpsAdminRevokeSessions,
  torobOpsAdminSetCredentialActive,
  torobOpsAdminUpsertCredential,
} from "@/lib/torob-ops/functions";
import { formatDateFa } from "@/lib/i18n/formatters";

type UserOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  isSelf?: boolean;
};

function userLabel(u: {
  full_name: string | null;
  email?: string | null;
  isSelf?: boolean;
  id: string;
}) {
  const name = u.full_name?.trim() || "بدون نام";
  const email = u.email?.trim();
  const base = email ? `${name} — ${email}` : `${name} (${u.id.slice(0, 8)})`;
  return u.isSelf ? `${base} (شما)` : base;
}

export function TorobOpsAccessAdminPage() {
  const qc = useQueryClient();
  const listCredsFn = useServerFn(torobOpsAdminListCredentials);
  const listUsersFn = useServerFn(torobOpsAdminListActiveUsers);
  const upsertFn = useServerFn(torobOpsAdminUpsertCredential);
  const setActiveFn = useServerFn(torobOpsAdminSetCredentialActive);
  const revokeFn = useServerFn(torobOpsAdminRevokeSessions);

  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [userFilter, setUserFilter] = useState("");

  const credsQ = useQuery({
    queryKey: ["torob-ops-admin-creds"],
    queryFn: () => listCredsFn({ data: {} }),
  });
  const usersQ = useQuery({
    queryKey: ["torob-ops-admin-users"],
    queryFn: () => listUsersFn({ data: {} }),
  });

  const userOptions = useMemo(() => {
    const rows = (usersQ.data ?? []) as UserOption[];
    const q = userFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) => {
      const hay = `${u.full_name ?? ""} ${u.email ?? ""} ${u.phone ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [usersQ.data, userFilter]);

  const upsertMut = useMutation({
    mutationFn: () => upsertFn({ data: { userId, password, isActive: true } }),
    onSuccess: () => {
      toast.success("رمز ماژول ذخیره شد.");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["torob-ops-admin-creds"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMut = useMutation({
    mutationFn: (payload: { userId: string; isActive: boolean }) => setActiveFn({ data: payload }),
    onSuccess: () => {
      toast.success("وضعیت دسترسی به‌روز شد.");
      qc.invalidateQueries({ queryKey: ["torob-ops-admin-creds"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const revokeMut = useMutation({
    mutationFn: (uid: string) => revokeFn({ data: { userId: uid } }),
    onSuccess: (res) => {
      toast.success(`${res.revoked} نشست باطل شد.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <PageHeader
        title="دسترسی عملیات ترب"
        description="ساخت، تمدید، فعال/غیرفعال و ابطال فوری رمز جداگانهٔ هر کاربر برای ماژول ترب."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">تعریف / تمدید رمز</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="ops-user-filter">جست‌وجوی کاربر (نام یا ایمیل)</Label>
            <Input
              id="ops-user-filter"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              placeholder="مثلاً بخشی از ایمیل خودتان"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label>کاربر</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب کاربر" />
              </SelectTrigger>
              <SelectContent>
                {userOptions.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">نتیجه‌ای نیست</div>
                ) : (
                  userOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {userLabel(u)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              در محیط تست ممکن است نام نمایشی «کاربر آزمایشی» باشد؛ با ایمیل تشخیص دهید. حساب خودتان با
              برچسب «(شما)» اول لیست است.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ops-pw">رمز جدید (حداقل ۸ کاراکتر)</Label>
            <Input
              id="ops-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button
            type="button"
            disabled={!userId || password.length < 8 || upsertMut.isPending}
            onClick={() => upsertMut.mutate()}
          >
            ذخیره رمز
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {(credsQ.data ?? []).map(
          (row: {
            user_id: string;
            full_name: string | null;
            email: string | null;
            is_active: boolean;
            updated_at: string;
          }) => (
            <Card key={row.user_id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
                <div className="space-y-1">
                  <div className="font-medium">
                    {userLabel({
                      id: row.user_id,
                      full_name: row.full_name,
                      email: row.email,
                    })}
                  </div>
                  <div className="text-muted-foreground">
                    به‌روزرسانی: {formatDateFa(row.updated_at)}
                  </div>
                  <Badge variant={row.is_active ? "default" : "secondary"}>
                    {row.is_active ? "فعال" : "غیرفعال"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={toggleMut.isPending}
                    onClick={() =>
                      toggleMut.mutate({ userId: row.user_id, isActive: !row.is_active })
                    }
                  >
                    {row.is_active ? "غیرفعال" : "فعال"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={revokeMut.isPending}
                    onClick={() => revokeMut.mutate(row.user_id)}
                  >
                    ابطال فوری نشست‌ها
                  </Button>
                </div>
              </CardContent>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
