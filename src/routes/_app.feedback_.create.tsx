import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { FeedbackForm } from "@/shared/components/FeedbackForm";

export const Route = createFileRoute("/_app/feedback_/create")({
  beforeLoad: async () => {
    await requirePermission("feedback", "create");
  },
  component: FeedbackCreatePage,
});

function FeedbackCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="space-y-5">
      <PageHeader title="ثبت بازخورد جدید" description="مشکل، پیشنهاد یا ایده خود را ثبت کنید" />
      <Card>
        <CardContent className="pt-6">
          <FeedbackForm
            userId={user?.id ?? ""}
            submitting={submitting}
            onCancel={() => navigate({ to: "/feedback" })}
            onSubmit={async (v) => {
              if (!user?.id) {
                toast.error("ابتدا وارد شوید");
                return;
              }
              setSubmitting(true);
              try {
                const { data, error } = await supabase
                  .from("feedback_items")
                  .insert({
                    title: v.title,
                    type: v.type,
                    description: v.description,
                    where_occurred: v.where_occurred,
                    impact: v.impact,
                    suggestion: v.suggestion,
                    attachment_urls: v.attachment_urls,
                    submitted_by: user.id,
                  })
                  .select("id")
                  .single();
                if (error) throw error;

                await supabase.from("audit_logs").insert({
                  actor_id: user.id,
                  action: "feedback_created",
                  entity_type: "feedback_item",
                  entity_id: data.id,
                  diff: { title: v.title, type: v.type } as never,
                });

                toast.success("بازخورد با موفقیت ثبت شد");
                navigate({ to: "/feedback/$feedbackId", params: { feedbackId: data.id } });
              } catch (e) {
                console.error(e);
                toast.error("ثبت بازخورد ناموفق بود");
              } finally {
                setSubmitting(false);
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
