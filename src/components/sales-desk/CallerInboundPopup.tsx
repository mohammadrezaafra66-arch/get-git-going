import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PhoneIncoming, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuickAddCustomerDialog } from "@/shared/components/QuickAddCustomerDialog";
import { useAuth } from "@/lib/auth/AuthProvider";
import { usePopupCenter } from "@/lib/popups/PopupCenterProvider";
import {
  fetchRecentInboundForPopup,
  type RecentInboundCall,
} from "@/lib/sales-desk";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
import { CallNoteForm } from "./CallNoteForm";
import { QuickRequestForm } from "./QuickRequestForm";

const POLL_MS = 10_000;
const TOAST_MS = 8_000;

type CallContext = {
  call: RecentInboundCall;
  displayName: string;
  responsibleName: string | null;
  personId: string | null;
  customerId: string | null;
  phoneHint: string | null;
  isUnknown: boolean;
};

async function resolveCallContext(call: RecentInboundCall): Promise<CallContext> {
  const meta = call.metadata ?? {};
  const phoneHint =
    (typeof meta.raw_number === "string" && meta.raw_number) ||
    (typeof meta.stripped_number === "string" && meta.stripped_number) ||
    null;
  const unknownFlag = meta.unknown_number === true;

  // call_logs.customer_id پس از ایمپورت ایزابل = persons.id
  const linkedPersonId = call.customer_id;

  if (!linkedPersonId) {
    return {
      call,
      displayName: phoneHint ? `شماره ناشناس ${toFaDigits(phoneHint)}` : "تماس‌گیرنده ناشناس",
      responsibleName: null,
      personId: null,
      customerId: null,
      phoneHint,
      isUnknown: true,
    };
  }

  const [{ data: person }, { data: customers }] = await Promise.all([
    supabase
      .from("persons")
      .select("id, display_name")
      .eq("id", linkedPersonId)
      .maybeSingle(),
    supabase
      .from("customers")
      .select(
        "id, name, responsible_id, responsible:profiles!customers_responsible_id_fkey(id, full_name)",
      )
      .eq("person_id", linkedPersonId)
      .limit(5),
  ]);

  const firstCustomer = (customers ?? [])[0] as
    | {
        id: string;
        name: string | null;
        responsible: { full_name: string | null } | null;
      }
    | undefined;

  return {
    call,
    displayName:
      person?.display_name ||
      firstCustomer?.name ||
      (phoneHint ? toFaDigits(phoneHint) : "تماس‌گیرنده"),
    responsibleName: firstCustomer?.responsible?.full_name ?? null,
    personId: person?.id ?? linkedPersonId,
    customerId: firstCustomer?.id ?? null,
    phoneHint,
    isUnknown: unknownFlag || !person,
  };
}

/**
 * Listener سراسری: تماس‌های ورودی اخیر را poll می‌کند و دیالوگ/toast نشان می‌دهد.
 * بدون Issabel هم بی‌ضرر است (لیست خالی می‌ماند).
 */
export function CallerInboundPopup() {
  const { user } = useAuth();
  const { add } = usePopupCenter();
  const userId = user?.id ?? null;
  const shownRef = useRef<Set<string>>(new Set());
  const [active, setActive] = useState<CallContext | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const inboundQ = useQuery({
    enabled: !!userId,
    queryKey: ["sales-desk", "inbound-popup", userId],
    queryFn: () => fetchRecentInboundForPopup({ userId }),
    refetchInterval: POLL_MS,
    staleTime: POLL_MS,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const rows = inboundQ.data ?? [];
    let cancelled = false;

    (async () => {
      for (const call of rows) {
        if (shownRef.current.has(call.id)) continue;
        shownRef.current.add(call.id);
        try {
          const ctx = await resolveCallContext(call);
          if (cancelled) return;

          const title = "تماس ورودی";
          const bodyParts = [ctx.displayName];
          if (ctx.responsibleName) bodyParts.push(`مسئول: ${ctx.responsibleName}`);
          if (ctx.isUnknown) bodyParts.push("شناسایی نشده");
          const body = bodyParts.join(" · ");

          let acknowledged = false;
          toast(title, {
            id: `inbound-${call.id}`,
            description: body,
            duration: TOAST_MS,
            icon: <PhoneIncoming className="h-4 w-4" />,
            action: {
              label: "باز کردن",
              onClick: () => {
                acknowledged = true;
                setActive(ctx);
                setDialogOpen(true);
              },
            },
            onDismiss: () => {
              if (!acknowledged) {
                add({
                  id: `inbound-${call.id}`,
                  title,
                  body,
                  type: "sales-inbound-call",
                  createdAt: Date.now(),
                });
              }
            },
            onAutoClose: () => {
              if (!acknowledged) {
                add({
                  id: `inbound-${call.id}`,
                  title,
                  body,
                  type: "sales-inbound-call",
                  createdAt: Date.now(),
                });
              }
            },
          });

          // اولین تماس جدید را فوراً دیالوگ کن
          setActive(ctx);
          setDialogOpen(true);
          break;
        } catch {
          // ignore resolve errors; still mark shown to avoid spam
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inboundQ.data, add]);

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneIncoming className="h-5 w-5" />
            تماس ورودی
          </DialogTitle>
          <DialogDescription>
            {active ? (
              <>
                <span className="block text-foreground">
                  {active.displayName}
                  {active.isUnknown ? (
                    <span className="mr-2 text-xs text-amber-700 dark:text-amber-400">
                      (ناشناس)
                    </span>
                  ) : null}
                </span>
                {active.responsibleName ? (
                  <span className="mt-1 flex items-center gap-1 text-xs">
                    <UserRound className="h-3 w-3" />
                    مسئول: {active.responsibleName}
                  </span>
                ) : null}
                {active.phoneHint ? (
                  <span className="mt-1 block text-xs">
                    شماره:{" "}
                    <span dir="ltr" className="inline-block tabular-nums">
                      {toFaDigits(active.phoneHint)}
                    </span>
                  </span>
                ) : null}
                {active.call.started_at ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    زمان تماس: {formatDateTimeFa(active.call.started_at)}
                  </span>
                ) : null}
              </>
            ) : (
              "تماس جدید"
            )}
          </DialogDescription>
        </DialogHeader>

        {active ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <QuickAddCustomerDialog
                buttonLabel="ثبت شخص"
                buttonSize="sm"
                onCreated={(c) => {
                  // person_create_inline برمی‌گرداند customers.id — person را از customers می‌خوانیم
                  void (async () => {
                    const { data } = await supabase
                      .from("customers")
                      .select("id, person_id, name")
                      .eq("id", c.id)
                      .maybeSingle();
                    setActive((prev) =>
                      prev
                        ? {
                            ...prev,
                            customerId: data?.id ?? c.id,
                            personId: data?.person_id ?? prev.personId,
                            displayName: data?.name ?? c.name,
                            isUnknown: false,
                          }
                        : prev,
                    );
                  })();
                }}
              />
              {active.customerId ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    to="/sales/customers/$customerId/dossier"
                    params={{ customerId: active.customerId }}
                  >
                    پرونده مشتری
                  </Link>
                </Button>
              ) : null}
            </div>

            {active.personId ? (
              <Tabs defaultValue="request">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="request">ثبت درخواست</TabsTrigger>
                  <TabsTrigger value="note">خلاصه تماس</TabsTrigger>
                </TabsList>
                <TabsContent value="request" className="mt-3">
                  <QuickRequestForm
                    compact
                    initialPersonId={active.personId}
                    initialPersonName={active.displayName}
                    customerId={active.customerId}
                    callLogId={active.call.id}
                    onCreated={() => setDialogOpen(false)}
                  />
                </TabsContent>
                <TabsContent value="note" className="mt-3">
                  <CallNoteForm
                    compact
                    personId={active.personId}
                    personName={active.displayName}
                    customerId={active.customerId}
                    callLogId={active.call.id}
                    defaultKind="call"
                    onCreated={() => setDialogOpen(false)}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <p className="text-sm text-muted-foreground">
                ابتدا «ثبت شخص» را بزنید تا بتوانید درخواست یا خلاصه تماس ثبت کنید.
                بدون ایزابل هم می‌توانید از میز فروش درخواست دستی بسازید.
              </p>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** نام سازگار با الگوی OwnerRemindersListener در AppShell */
export const CallerInboundListener = CallerInboundPopup;
