import { Alert, AlertDescription } from "@/components/ui/alert";

import { missingAsanMessage } from "./lookup";

export function MissingAsanMessage({ name }: { name: string }) {
  return (
    <Alert variant="destructive" data-testid="wizard-missing-asan">
      <AlertDescription>{missingAsanMessage(name)}</AlertDescription>
    </Alert>
  );
}
