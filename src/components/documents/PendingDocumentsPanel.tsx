import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardCheck } from "lucide-react";
import { usePendingDocuments } from "@/hooks/documents/useDocuments";
import { DocumentCard } from "./DocumentCard";
import { DocumentReviewActions } from "./DocumentReviewActions";

export function PendingDocumentsPanel() {
  const { data = [], isLoading, error } = usePendingDocuments();

  if (isLoading) {
    return (
      <div className="space-y-3" dir="rtl">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-destructive" dir="rtl">
          خطا در بارگذاری: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent
          className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground"
          dir="rtl"
        >
          <ClipboardCheck className="h-8 w-8" />
          هیچ سندی در انتظار تأیید نیست.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      {data.map((doc) => (
        <div key={doc.id} className="space-y-2">
          <DocumentCard document={doc} />
          <DocumentReviewActions document={doc} />
        </div>
      ))}
    </div>
  );
}