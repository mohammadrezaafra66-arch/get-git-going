import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plug, KeyRound, RefreshCw, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatJalaliDateTime } from "@/lib/messenger/format";

export const Route = createFileRoute("/_app/integrations/didar")({
  component: DidarIntegrationPage,
});

type EntityType = "contact" | "activity" | "preinvoice";

const ENTITY_LABELS: Record<EntityType, string> = {
  contact: "مخاطبین",
  activity: "فعالیت‌ها",
  preinvoice: "پیش‌فاکتورها",
};

const ENTITY_ROW_LABELS: Record<EntityType, string> = {
  contact: "مخاطب",
  activity: "فعالیت",
  preinvoice: "پیش‌فاکتور",
};

const ACTION_LABELS: Record<string, string> = {
  created: "ایجاد",
  updated: "بروزرسانی",
  skipped: "رد شد",
  error: "خطا",
};

const ACTION_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  created: "default",
  updated: "secondary",
  skipped: "outline",
  error: "destructive",
};

function DidarIntegrationPage() {
  const connectionQuery = useQuery({
    queryKey: ["didar", "connection-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_api_keys")
        .select("id, name, is_active")
        .ilike("name", "%didar%")
        .eq("is_active", true)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });

  const syncStatsQuery = useQuery({
    queryKey: ["didar", "sync-stats"],
    queryFn: async () => {
      const entities: EntityType[] = ["contact", "activity", "preinvoice"];
      const results = await Promise.all(
        entities.map(async (entity) => {
          const { count } = await supabase
            .from("didar_import_log")
            .select("id", { count: "exact", head: true })
            .eq("entity_type", entity);
          const { data: latest } = await supabase
            .from("didar_import_log")
            .select("imported_at")
            .eq("entity_type", entity)
            .order("imported_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          return {
            entity,
            count: count ?? 0,
            lastSyncedAt: latest?.imported_at ?? null,
          };
        }),
      );
      return results;
    },
  });

  const historyQuery = useQuery({
    queryKey: ["didar", "import-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("didar_import_log")
        .select("id, entity_type, didar_id, action, imported_at, error_message")
        .order("imported_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [syncingEntity, setSyncingEntity] = useState<EntityType | null>(null);

  const handleSync = async (entity: EntityType) => {
    setSyncingEntity(entity);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      toast.info("همگام‌سازی در حال آماده‌سازی — به‌زودی فعال می‌شود", {
        description: `موجودیت: ${ENTITY_LABELS[entity]}`,
      });
    } finally {
      setSyncingEntity(null);
    }
  };

  const isConnected = connectionQuery.data === true;

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <PageHeader title="یکپارچه‌سازی دیدار CRM" description="دریافت داده‌ها از سامانه دیدار" />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          این یکپارچه‌سازی فقط داده‌ها را از دیدار دریافت می‌کند و هیچ تغییری در دیدار ایجاد نمی‌کند.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="h-4 w-4" />
            وضعیت اتصال
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">وضعیت کلید API دیدار:</span>
            {connectionQuery.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isConnected ? (
              <Badge variant="default">متصل ✅</Badge>
            ) : (
              <Badge variant="destructive">متصل نیست ❌</Badge>
            )}
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/bot-api-keys">
              <KeyRound className="ml-2 h-4 w-4" />
              تنظیم کلید API دیدار
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="sync" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sync">همگام‌سازی</TabsTrigger>
          <TabsTrigger value="history">تاریخچه واردسازی</TabsTrigger>
        </TabsList>

        <TabsContent value="sync">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">کنترل همگام‌سازی</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>موجودیت</TableHead>
                      <TableHead>آخرین همگام‌سازی</TableHead>
                      <TableHead>تعداد رکوردها</TableHead>
                      <TableHead className="text-left">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncStatsQuery.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center">
                          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                        </TableCell>
                      </TableRow>
                    ) : (
                      (syncStatsQuery.data ?? []).map((row) => (
                        <TableRow key={row.entity}>
                          <TableCell className="font-medium">
                            {ENTITY_LABELS[row.entity as EntityType]}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.lastSyncedAt ? formatJalaliDateTime(row.lastSyncedAt) : "—"}
                          </TableCell>
                          <TableCell>{row.count.toLocaleString("fa-IR")}</TableCell>
                          <TableCell className="text-left">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!isConnected || syncingEntity === row.entity}
                              onClick={() => handleSync(row.entity as EntityType)}
                            >
                              {syncingEntity === row.entity ? (
                                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="ml-2 h-4 w-4" />
                              )}
                              همگام‌سازی
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {!isConnected && !connectionQuery.isLoading ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  برای فعال‌سازی همگام‌سازی ابتدا کلید API دیدار را تنظیم کنید.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">آخرین ۱۰۰ رکورد واردسازی</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>موجودیت</TableHead>
                      <TableHead>شناسه دیدار</TableHead>
                      <TableHead>عملیات</TableHead>
                      <TableHead>زمان</TableHead>
                      <TableHead>پیام خطا</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyQuery.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center">
                          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                        </TableCell>
                      </TableRow>
                    ) : (historyQuery.data ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                          هنوز رکوردی واردسازی نشده است.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (historyQuery.data ?? []).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            {ENTITY_ROW_LABELS[row.entity_type as EntityType] ?? row.entity_type}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.didar_id}</TableCell>
                          <TableCell>
                            <Badge variant={(row.action && ACTION_VARIANTS[row.action]) ?? "outline"}>
                              {(row.action && ACTION_LABELS[row.action]) ?? row.action ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatJalaliDateTime(row.imported_at)}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-destructive">
                            {row.error_message ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}