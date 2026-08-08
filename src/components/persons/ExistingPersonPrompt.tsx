import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  addRoleToPerson,
  CONTEXT_KIND_LABELS,
  findPersonByPhone,
  usePersonByPhone,
  type ExistingPersonMatch,
  type MirroredContextKind,
} from "@/lib/persons/find-by-phone";

const PERSON_KIND_LABELS: Record<string, string> = {
  individual: "حقیقی",
  organization: "حقوقی",
};

/** Same shape the rest of the persons UI uses (PersonContextLinksForm:107). */
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fa-IR");
  } catch {
    return "—";
  }
}

interface Props {
  /** The number currently typed into the form. */
  phone: string | undefined;
  /** The role this form is trying to create. */
  targetRole: MirroredContextKind;
  /** Only look while creating — editing an existing record must not prompt. */
  enabled?: boolean;
  /**
   * Called once the person holds the target role, with the mirror row's id and
   * the person behind it, so the form can use the real record instead of
   * creating a second one.
   */
  onUseExisting: (mirrorId: string, person: ExistingPersonMatch) => void;
}

/**
 * UNIFY P1.2 — offers an existing person instead of a duplicate.
 *
 * A mobile number is unique across `person_identifiers`, so re-entering one
 * could only ever end in «این شناسه قبلاً در سیستم ثبت شده است». The number is
 * the identity key, so a match almost always means "same human, second role" —
 * which is the whole point of dual role. This asks, rather than failing.
 */
export function ExistingPersonPrompt({ phone, targetRole, enabled = true, onUseExisting }: Props) {
  const queryClient = useQueryClient();
  const { data: match, isLoading } = usePersonByPhone(phone, enabled);

  const roleLabel = CONTEXT_KIND_LABELS[targetRole] ?? targetRole;
  const alreadyHasRole = Boolean(match?.roles.includes(targetRole));
  const existingMirrorId = targetRole === "supplier" ? match?.supplier_id : match?.customer_id;

  const addRole = useMutation({
    mutationFn: async () => {
      if (!match) throw new Error("شخصی برای افزودن نقش انتخاب نشده است");
      await addRoleToPerson(match.person_id, targetRole);
    },
    onSuccess: async () => {
      toast.success(`نقش «${roleLabel}» به این شخص اضافه شد`);
      queryClient.invalidateQueries({ queryKey: ["persons"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      // The mirror row is created by a database trigger, so its id is only
      // knowable after the write — re-read rather than guess.
      const refreshed = await queryClient.fetchQuery({
        queryKey: ["person-by-phone", (phone ?? "").trim()],
        queryFn: () => findPersonByPhone((phone ?? "").trim()),
        staleTime: 0,
      });
      const mirrorId = targetRole === "supplier" ? refreshed?.supplier_id : refreshed?.customer_id;
      if (mirrorId && refreshed) {
        onUseExisting(mirrorId, refreshed);
      } else {
        // The role landed but the mirror is not readable by this user — say so
        // rather than silently doing nothing.
        toast.info("نقش اضافه شد، ولی دسترسی خواندن رکورد آن را ندارید.");
      }
    },
    onError: (err: unknown) => {
      const raw = err instanceof Error ? err.message : "";
      if (raw.toLowerCase().includes("row-level security") || raw.includes("42501")) {
        toast.error(`اجازهٔ افزودن نقش «${roleLabel}» را ندارید.`);
        return;
      }
      toast.error(`افزودن نقش ناموفق بود: ${raw || "خطای ناشناخته"}`);
    },
  });

  if (!enabled) return null;

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground" dir="rtl">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        بررسی اینکه این شماره از قبل ثبت شده یا نه…
      </p>
    );
  }

  if (!match) return null;

  return (
    <Alert dir="rtl" className="border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20">
      <AlertCircle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-sm">این شماره از قبل ثبت شده است</AlertTitle>
      <AlertDescription className="space-y-3">
        <div className="space-y-1.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{match.display_name}</span>
            <Badge variant="secondary" className="text-[10px]">
              {PERSON_KIND_LABELS[match.kind] ?? match.kind}
            </Badge>
            {!match.is_active && (
              <Badge variant="outline" className="text-[10px]">
                غیرفعال
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">نقش‌های فعلی:</span>
            {match.roles.length === 0 ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : (
              match.roles.map((r) => (
                <Badge key={r} variant="outline" className="text-[10px]">
                  {CONTEXT_KIND_LABELS[r] ?? r}
                </Badge>
              ))
            )}
          </div>

          {match.city && <div className="text-xs text-muted-foreground">شهر: {match.city}</div>}
          {match.updated_at && (
            <div className="text-xs text-muted-foreground">
              آخرین به‌روزرسانی پرونده: {formatDate(match.updated_at)}
            </div>
          )}
        </div>

        {alreadyHasRole ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">
              این شخص از قبل «{roleLabel}» است. رکورد تازه‌ای لازم نیست.
            </span>
            {existingMirrorId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onUseExisting(existingMirrorId, match)}
              >
                <ArrowLeft className="ml-2 h-4 w-4" />
                رفتن به همان رکورد
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">
              همین شخص است؟ به‌جای ساخت پروندهٔ تکراری، نقش «{roleLabel}» به او اضافه می‌شود.
            </span>
            <Button
              type="button"
              size="sm"
              disabled={addRole.isPending}
              onClick={() => addRole.mutate()}
            >
              {addRole.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="ml-2 h-4 w-4" />
              )}
              بله، نقش «{roleLabel}» اضافه شود
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          اگر واقعاً شخص دیگری است، شمارهٔ درست او را وارد کنید — یک شماره نمی‌تواند به دو پرونده
          تعلق داشته باشد.{" "}
          <Link
            to="/persons/$personId"
            params={{ personId: match.person_id }}
            className="underline underline-offset-2"
          >
            مشاهدهٔ پرونده
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  );
}
