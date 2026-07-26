import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DynamicScoringSection } from "@/components/credit/DynamicScoringSection";
import { listAssignableUsers } from "@/lib/products/assignable-users.functions";
import { requireAnyRole } from "@/lib/rbac/route-guards";

export const Route = createFileRoute("/_app/accounting/salesperson-scoring")({
  beforeLoad: async () => {
    // accounting module is not seeded in role_permissions, so use requireAnyRole
    // directly rather than a permission check that would hit the open fallback.
    await requireAnyRole(["admin", "accountant"]);
  },
  component: SalespersonScoringPage,
});

function SalespersonScoringPage() {
  const listUsers = useServerFn(listAssignableUsers);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const usersQ = useQuery({
    queryKey: ["assignable-users", "salesperson-scoring"],
    queryFn: () => listUsers({ data: {} }),
    staleTime: 5 * 60_000,
  });

  const users = usersQ.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="امتیازدهی کارشناسان فروش"
        description="امتیاز ماهانهٔ هر کارشناس را وارد کنید. این امتیاز پایهٔ محاسبهٔ سهم کارشناس از سرمایهٔ روز و سپس سقف اعتبار مشتریان اوست."
      />

      <Card>
        <CardHeader>
          <CardTitle>انتخاب کارشناس فروش</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedId ?? undefined} onValueChange={(v) => setSelectedId(v)}>
            <SelectTrigger className="w-full sm:w-96">
              <SelectValue placeholder={usersQ.isLoading ? "در حال بارگذاری…" : "یک کارشناس را انتخاب کنید"} />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name || u.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedId ? (
        <DynamicScoringSection entityType="salesperson" entityId={selectedId} canEdit={true} />
      ) : (
        <p className="text-sm text-muted-foreground">
          برای ثبت امتیاز، ابتدا یک کارشناس فروش را از فهرست بالا انتخاب کنید.
        </p>
      )}
    </div>
  );
}
