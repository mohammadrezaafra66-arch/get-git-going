import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { ALL_ROLES } from "@/lib/rbac/roles";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useMyDocuments } from "@/hooks/documents/useDocuments";
import { DocumentCard } from "@/components/documents/DocumentCard";
import { DocumentUploadForm } from "@/components/documents/DocumentUploadForm";
import { PendingDocumentsPanel } from "@/components/documents/PendingDocumentsPanel";
import { DOCUMENT_TYPE_FA, DOCUMENT_STATUS_FA } from "@/lib/documents/labels";

export const Route = createFileRoute("/_app/documents")({
  beforeLoad: async () => {
    await requireAnyRole(ALL_ROLES);
  },
  component: DocumentsPage,
});

const ALL = "__all__";

function DocumentsPage() {
  const { roles } = useAuth();
  const canUpload =
    roles.includes("admin") || roles.includes("manager") || roles.includes("accountant");
  const canReview =
    roles.includes("admin") ||
    roles.includes("manager") ||
    roles.includes("accountant");

  const [type, setType] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [tab, setTab] = useState("list");

  const {
    data: rows = [],
    isLoading,
    error,
  } = useMyDocuments(type === ALL ? null : type, status === ALL ? null : status);

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader title="اسناد" description="بیجک، فاکتور و حواله" />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">اسناد من</TabsTrigger>
          <TabsTrigger value="new">آپلود سند جدید</TabsTrigger>
          {canReview && <TabsTrigger value="pending">در انتظار تأیید</TabsTrigger>}
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>نوع</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>همه</SelectItem>
                    {Object.entries(DOCUMENT_TYPE_FA).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>وضعیت</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>همه</SelectItem>
                    {Object.entries(DOCUMENT_STATUS_FA).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : error ? (
            <Card>
              <CardContent className="p-4 text-sm text-destructive">
                خطا: {(error as Error).message}
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <FileText className="h-8 w-8" />
                سندی برای نمایش وجود ندارد.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {rows.map((d) => (
                <DocumentCard key={d.id} document={d} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="new">
          <Card>
            <CardContent className="p-4">
              {canUpload ? (
                <DocumentUploadForm onSuccess={() => setTab("list")} />
              ) : (
                <div className="text-sm text-muted-foreground">
                  شما دسترسی آپلود سند را ندارید.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canReview && (
          <TabsContent value="pending">
            <PendingDocumentsPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}