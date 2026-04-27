import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { requirePermission } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { CustomerForm } from "@/shared/components/CustomerForm";

export const Route = createFileRoute("/_app/sales_/customers_/$customerId/edit")({
  beforeLoad: async () => { await requirePermission("sales", "update"); },
  component: EditCustomerPage,
});

function EditCustomerPage() {
  const { customerId } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, city, notes")
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
      {data && (
        <CustomerForm
          customerId={customerId}
          defaultValues={{
            name: data.name ?? "",
            phone: data.phone ?? "",
            city: (data as { city?: string | null }).city ?? "",
            notes: (data as { notes?: string | null }).notes ?? "",
          }}
        />
      )}
    </div>
  );
}