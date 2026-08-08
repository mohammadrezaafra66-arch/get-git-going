import { Link } from "@tanstack/react-router";
import { ArrowLeft, Repeat2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { usePersonMirrors } from "@/lib/persons/dual-role";

interface Props {
  /** The person behind the record being viewed. */
  personId: string | null | undefined;
  /** Which side the user is looking at right now. */
  currentSide: "supplier" | "customer";
}

/**
 * UNIFY P1.3 — "this person is also your customer →" and the reverse.
 *
 * One person can be both a supplier and a customer. Without this the two sides
 * of the same human are invisible to each other: you can be looking at a
 * supplier record while an unrelated-looking customer record for the same
 * person sits one table away. Renders nothing at all for a single-role person,
 * so it never adds noise to the common case.
 */
export function PersonRoleCrossLinks({ personId, currentSide }: Props) {
  const { data: mirrors } = usePersonMirrors(personId);

  if (!personId || !mirrors) return null;

  const otherId = currentSide === "supplier" ? mirrors.customer_id : mirrors.supplier_id;
  const otherName = currentSide === "supplier" ? mirrors.customer_name : mirrors.supplier_name;
  if (!otherId) return null;

  const otherLabel = currentSide === "supplier" ? "مشتری" : "تأمین‌کننده";

  return (
    <Alert dir="rtl" className="border-sky-500/40 bg-sky-50/60 dark:bg-sky-950/20">
      <Repeat2 className="h-4 w-4 text-sky-600" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          این شخص «{otherLabel}» شما هم هست
          {otherName ? ` — ${otherName}` : ""}.
        </span>
        <div className="flex flex-wrap gap-2">
          {currentSide === "supplier" ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/sales/customers/$customerId/edit" params={{ customerId: otherId }}>
                <ArrowLeft className="ml-2 h-4 w-4" />
                رفتن به پروندهٔ مشتری
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link to="/suppliers/$supplierId" params={{ supplierId: otherId }}>
                <ArrowLeft className="ml-2 h-4 w-4" />
                رفتن به پروندهٔ تأمین‌کننده
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link to="/persons/$personId" params={{ personId }}>
              پروندهٔ شخص
            </Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
