import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { requirePermission } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { CustomerForm } from "@/shared/components/CustomerForm";
import { CustomerPersonLink } from "@/components/customers/CustomerPersonLink";
import { PersonRoleCrossLinks } from "@/components/persons/PersonRoleCrossLinks";

export const Route = createFileRoute("/_app/sales_/customers_/$customerId/edit")({
  beforeLoad: async () => {
    await requirePermission("sales", "update");
  },
  component: EditCustomerPage,
});

function EditCustomerPage() {
  const { customerId } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id, name, phone, city, notes, accounting_code, link_group, birth_date, person_id, responsible_id, responsible:profiles!customers_responsible_id_fkey(id, full_name)",
        )
        .eq("id", customerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader title="ویرایش مشتری" description="به‌روزرسانی اطلاعات مشتری" />
      {isLoading && (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری...
        </div>
      )}
      {error && <p className="text-destructive">{(error as Error).message}</p>}
      {/* P1.3 — the mirror of the link on the supplier page. */}
      {data && (
        <PersonRoleCrossLinks
          personId={(data as { person_id?: string | null }).person_id ?? null}
          currentSide="customer"
        />
      )}
      {data && (
        <CustomerPersonLink
          customerId={customerId}
          personId={(data as { person_id?: string | null }).person_id ?? null}
        />
      )}
      {data && (
        <CustomerForm
          customerId={customerId}
          defaultValues={{
            name: data.name ?? "",
            phone: data.phone ?? "",
            city: (data as { city?: string | null }).city ?? "",
            notes: (data as { notes?: string | null }).notes ?? "",
            accounting_code: (data as { accounting_code?: string | null }).accounting_code ?? "",
            link_group: (data as { link_group?: string | null }).link_group ?? "",
            birth_date: (data as { birth_date?: string | null }).birth_date ?? null,
            responsible_id: (data as { responsible_id?: string | null }).responsible_id ?? null,
            responsible:
              (data as { responsible?: { id: string; full_name: string | null } | null })
                .responsible ?? null,
          }}
        />
      )}
    </div>
  );
}
