/**
 * Zod schemas for sales-desk deal create (C2 — UI + zod + trigger).
 * Pattern mirrors src/lib/sales/quote-status.schemas.ts.
 */
import { z } from "zod";

const RESPONSIBLE_MSG = "مسئول معامله الزامی است";

/**
 * Payload for kind=request («افزودن معامله»).
 * `salespersonId` must be a non-empty UUID — empty "" fails before RPC/trigger.
 */
export const createDealInteractionSchema = z.object({
  personId: z.string().uuid({ message: "شناسه شخص نامعتبر است" }),
  kind: z.literal("request"),
  body: z.string().trim().min(1, "متن درخواست الزامی است"),
  title: z.string().max(120).nullable().optional(),
  customerId: z.string().uuid().nullable().optional().or(z.literal("").transform(() => null)),
  salespersonId: z
    .string({ error: RESPONSIBLE_MSG })
    .trim()
    .min(1, RESPONSIBLE_MSG)
    .uuid({ error: RESPONSIBLE_MSG }),
  callLogId: z.string().uuid().nullable().optional(),
  nextFollowUpAt: z.string().nullable().optional(),
  source: z.string().optional(),
  status: z.enum(["open", "won", "lost", "cancelled", "done"]).optional(),
  dealId: z.string().uuid().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive().optional(),
        note: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

export type CreateDealInteractionParsed = z.infer<typeof createDealInteractionSchema>;

/** Parse deal create; throw Error with Persian message on failure. */
export function parseCreateDealInteraction(
  input: unknown,
): CreateDealInteractionParsed {
  const result = createDealInteractionSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    if (issue?.path[0] === "salespersonId") {
      throw new Error(RESPONSIBLE_MSG);
    }
    throw new Error(issue?.message || RESPONSIBLE_MSG);
  }
  return result.data;
}
