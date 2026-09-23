import { supabase } from "@/integrations/supabase/client";
import { salesDeskErrorMessage } from "./errors";

export type SalesPipeline = {
  id: string;
  title: string;
  is_active: boolean;
  sort_order: number;
};

export type SalesPipelineStage = {
  id: string;
  pipeline_id: string;
  title: string;
  sort_order: number;
  is_active: boolean;
  auto_event: "quote_created" | "quote_sent" | null;
};

type UntypedRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

function rpc(): UntypedRpc {
  return supabase.rpc.bind(supabase) as unknown as UntypedRpc;
}

export async function listSalesPipelines(opts?: {
  activeOnly?: boolean;
}): Promise<SalesPipeline[]> {
  let q = supabase
    .from("sales_pipelines" as never)
    .select("id, title, is_active, sort_order" as never)
    .order("sort_order" as never, { ascending: true } as never);
  if (opts?.activeOnly) q = q.eq("is_active" as never, true as never);
  const { data, error } = await q;
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  return (data ?? []) as unknown as SalesPipeline[];
}

export async function listSalesPipelineStages(opts?: {
  pipelineId?: string;
  activeOnly?: boolean;
}): Promise<SalesPipelineStage[]> {
  let q = supabase
    .from("sales_pipeline_stages" as never)
    .select("id, pipeline_id, title, sort_order, is_active, auto_event" as never)
    .order("sort_order" as never, { ascending: true } as never);
  if (opts?.pipelineId) q = q.eq("pipeline_id" as never, opts.pipelineId as never);
  if (opts?.activeOnly) q = q.eq("is_active" as never, true as never);
  const { data, error } = await q;
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  return (data ?? []) as unknown as SalesPipelineStage[];
}

export async function upsertSalesPipeline(input: {
  id?: string;
  title: string;
  is_active?: boolean;
  sort_order?: number;
}): Promise<string> {
  if (input.id) {
    const { error } = await supabase
      .from("sales_pipelines" as never)
      .update({
        title: input.title,
        is_active: input.is_active ?? true,
        sort_order: input.sort_order ?? 0,
      } as never)
      .eq("id" as never, input.id as never);
    if (error) throw new Error(salesDeskErrorMessage(error.message));
    return input.id;
  }
  const { data, error } = await supabase
    .from("sales_pipelines" as never)
    .insert({
      title: input.title,
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 0,
    } as never)
    .select("id" as never)
    .single();
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  return (data as { id: string }).id;
}

export async function upsertSalesPipelineStage(input: {
  id?: string;
  pipeline_id: string;
  title: string;
  sort_order: number;
  is_active?: boolean;
  auto_event?: "quote_created" | "quote_sent" | null;
}): Promise<string> {
  const payload = {
    pipeline_id: input.pipeline_id,
    title: input.title,
    sort_order: input.sort_order,
    is_active: input.is_active ?? true,
    auto_event: input.auto_event ?? null,
  };
  if (input.id) {
    const { error } = await supabase
      .from("sales_pipeline_stages" as never)
      .update(payload as never)
      .eq("id" as never, input.id as never);
    if (error) throw new Error(salesDeskErrorMessage(error.message));
    return input.id;
  }
  const { data, error } = await supabase
    .from("sales_pipeline_stages" as never)
    .insert(payload as never)
    .select("id" as never)
    .single();
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  return (data as { id: string }).id;
}

export async function moveSalesDeal(input: {
  id: string;
  pipelineId: string;
  stageId: string;
}): Promise<string> {
  const { data, error } = await rpc()("sales_deal_move", {
    p_id: input.id,
    p_pipeline_id: input.pipelineId,
    p_stage_id: input.stageId,
  });
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  return typeof data === "string" ? data : input.id;
}

export async function deleteSalesDeal(id: string): Promise<string> {
  const { data, error } = await rpc()("sales_deal_delete", { p_id: id });
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  return typeof data === "string" ? data : id;
}

export async function restoreSalesDeal(id: string): Promise<string> {
  const { data, error } = await rpc()("sales_deal_restore", { p_id: id });
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  return typeof data === "string" ? data : id;
}

export function autoEventLabel(ev: SalesPipelineStage["auto_event"]): string {
  if (ev === "quote_created") return "ساخت پیش‌فاکتور";
  if (ev === "quote_sent") return "ارسال پیش‌فاکتور";
  return "—";
}
