import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PersonForm, type PersonFormValues } from "@/components/persons/PersonForm";
import { createPerson } from "@/lib/persons/functions";
import { toError } from "@/lib/server-fn-error";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";

export const Route = createFileRoute("/_app/persons_/create")({
  component: PersonCreatePage,
});

function PersonCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canManage = hasAnyRole(roles, ["admin", "manager"]);
  const createFn = useServerFn(createPerson);

  const mut = useMutation({
    mutationFn: async (values: PersonFormValues) => {
      const person = await toError(
        createFn({
          data: {
            kind: values.kind,
            display_name: values.display_name.trim(),
            legal_name: values.legal_name.trim() ? values.legal_name.trim() : null,
            visibility_scope: values.visibility_scope,
            is_active: values.is_active,
            notes: values.notes.trim() ? values.notes.trim() : null,
            field_values: [],
          },
        }),
      );
      // `toError` already converts any TanStack "unhandled" envelope into a
      // proper Error. Reaching here means the server returned a real DTO; a
      // missing id at this point is a true contract violation worth flagging.
      if (
        !person ||
        typeof person !== "object" ||
        typeof (person as { id?: unknown }).id !== "string"
      ) {
        throw new Error("ایجاد شخص ناموفق بود — پاسخ سرور نامعتبر بود");
      }
      return person;
    },
    onSuccess: (person) => {
      qc.invalidateQueries({ queryKey: ["persons"] });
      toast.success("شخص با موفقیت ایجاد شد");
      navigate({
        to: "/persons/$personId/edit",
        params: { personId: person.id },
      });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "ایجاد شخص ناموفق بود");
    },
  });

  if (!canManage) {
    return (
      <div className="space-y-4" dir="rtl">
        <PageHeader title="شخص جدید" />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            دسترسی لازم برای ایجاد شخص جدید را ندارید.
            <div className="mt-4">
              <Button asChild variant="outline">
                <Link to="/persons">
                  <ArrowRight className="ml-2 h-4 w-4" /> بازگشت به فهرست
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        title="شخص جدید"
        description="ایجاد پرونده‌ی یکپارچه برای شخص حقیقی یا حقوقی"
        actions={
          <Button asChild variant="outline">
            <Link to="/persons">
              <ArrowRight className="ml-2 h-4 w-4" /> بازگشت به فهرست
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <PersonForm
            submitLabel="ایجاد شخص"
            submitting={mut.isPending}
            onSubmit={(values) => mut.mutate(values)}
            onCancel={() => navigate({ to: "/persons" })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
