import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { TorobOpsGate } from "./TorobOpsGate";

function HistoryInner() {
  const [productId, setProductId] = useState("");
  const q = useQuery({
    queryKey: ["torob-offer-snapshots", productId],
    enabled: productId.length === 36,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        from: (table: string) => ReturnType<typeof supabase.from>;
      })
        .from("torob_offer_snapshots")
        .select("fetched_at, seller_name, price_toman, is_own_shop")
        .eq("product_id", productId)
        .order("fetched_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const chart = useMemo(() => {
    const rows = q.data ?? [];
    return rows.map((r) => ({
      t: r.fetched_at,
      price: r.price_toman,
      seller: r.seller_name,
    }));
  }, [q.data]);

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="تاریخچه قیمت ترب" description="نمودار قیمت فروشنده‌ها از عکس‌های چشم ترب." />
      <Card>
        <CardContent className="space-y-3 py-4">
          <Input
            placeholder="شناسه محصول"
            value={productId}
            onChange={(e) => setProductId(e.target.value.trim())}
          />
          {chart.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <XAxis dataKey="t" hide />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="price" stroke="#2563eb" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">هنوز عکسی برای این محصول نیست.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function TorobOpsHistoryPage() {
  return (
    <TorobOpsGate>
      <HistoryInner />
    </TorobOpsGate>
  );
}
