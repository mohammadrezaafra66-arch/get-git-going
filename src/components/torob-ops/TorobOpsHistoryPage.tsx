import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { TorobOpsGate } from "./TorobOpsGate";

type Snap = {
  fetched_at: string;
  seller_name: string | null;
  price_toman: number | null;
};

function HistoryInner() {
  const initial =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("product") ?? ""
      : "";
  const [productId, setProductId] = useState(initial);
  const q = useQuery({
    queryKey: ["torob-offer-snapshots", productId],
    enabled: productId.length === 36,
    queryFn: async (): Promise<Snap[]> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const base = import.meta.env.VITE_SUPABASE_URL as string;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const url =
        `${base}/rest/v1/torob_offer_snapshots` +
        `?product_id=eq.${productId}` +
        `&select=fetched_at,seller_name,price_toman` +
        `&order=fetched_at.asc&limit=500`;
      const res = await fetch(url, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${token ?? key}`,
        },
      });
      if (!res.ok) throw new Error(`history ${res.status}`);
      return (await res.json()) as Snap[];
    },
  });

  const chart = useMemo(() => {
    return (q.data ?? []).map((r) => ({
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
