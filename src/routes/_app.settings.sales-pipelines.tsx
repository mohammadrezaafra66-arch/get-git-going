import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { requirePermission } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  autoEventLabel,
  listSalesPipelineStages,
  listSalesPipelines,
  upsertSalesPipeline,
  upsertSalesPipelineStage,
  type SalesPipeline,
  type SalesPipelineStage,
} from "@/lib/sales-desk/pipelines";
import { salesDeskErrorMessage } from "@/lib/sales-desk";

export const Route = createFileRoute("/_app/settings/sales-pipelines")({
  staticData: {
    gate: { kind: "anyRole", allowed: ["admin", "manager", "sales"] },
  },
  beforeLoad: async () => {
    await requirePermission("sales-pipelines", "view");
  },
  component: SalesPipelinesSettingsPage,
});

function SalesPipelinesSettingsPage() {
  const { roles } = useAuth();
  const canEdit = hasPermissionEx(roles, "sales-pipelines", "update");
  const qc = useQueryClient();
  const [newPipe, setNewPipe] = useState("");
  const [newStage, setNewStage] = useState("");
  const [selectedPipe, setSelectedPipe] = useState<string>("");

  const pipesQ = useQuery({
    queryKey: ["settings", "sales-pipelines"],
    queryFn: () => listSalesPipelines(),
  });
  const pipeId = selectedPipe || pipesQ.data?.[0]?.id || "";
  const stagesQ = useQuery({
    queryKey: ["settings", "sales-pipeline-stages", pipeId],
    enabled: !!pipeId,
    queryFn: () => listSalesPipelineStages({ pipelineId: pipeId }),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["settings", "sales-pipelines"] });
    void qc.invalidateQueries({ queryKey: ["settings", "sales-pipeline-stages"] });
    void qc.invalidateQueries({ queryKey: ["sales-desk"] });
  };

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader title="کاریزهای فروش" description="ساخت و ویرایش کاریز و مراحل فروش" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">کاریزها</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Input
                value={newPipe}
                onChange={(e) => setNewPipe(e.target.value)}
                placeholder="عنوان کاریز جدید"
                className="max-w-xs"
              />
              <Button
                type="button"
                size="sm"
                disabled={!newPipe.trim()}
                onClick={() =>
                  upsertSalesPipeline({
                    title: newPipe.trim(),
                    sort_order: (pipesQ.data?.length ?? 0) + 1,
                  })
                    .then((id) => {
                      toast.success("کاریز ساخته شد");
                      setNewPipe("");
                      setSelectedPipe(id);
                      refresh();
                    })
                    .catch((e: Error) => toast.error(salesDeskErrorMessage(e.message)))
                }
              >
                <Plus className="ml-1 h-4 w-4" />
                کاریز جدید
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">فقط مشاهده.</p>
          )}
          <ul className="space-y-2">
            {(pipesQ.data ?? []).map((p) => (
              <PipelineRow
                key={p.id}
                pipe={p}
                selected={p.id === pipeId}
                canEdit={canEdit}
                onSelect={() => setSelectedPipe(p.id)}
                onSaved={refresh}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">مراحل</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {canEdit && pipeId ? (
            <div className="flex flex-wrap gap-2">
              <Input
                value={newStage}
                onChange={(e) => setNewStage(e.target.value)}
                placeholder="عنوان مرحله جدید"
                className="max-w-xs"
              />
              <Button
                type="button"
                size="sm"
                disabled={!newStage.trim()}
                onClick={() =>
                  upsertSalesPipelineStage({
                    pipeline_id: pipeId,
                    title: newStage.trim(),
                    sort_order: (stagesQ.data?.length ?? 0) + 1,
                  })
                    .then(() => {
                      toast.success("مرحله اضافه شد");
                      setNewStage("");
                      refresh();
                    })
                    .catch((e: Error) => toast.error(salesDeskErrorMessage(e.message)))
                }
              >
                افزودن مرحله
              </Button>
            </div>
          ) : null}
          <ul className="space-y-2">
            {(stagesQ.data ?? []).map((s) => (
              <StageRow key={s.id} stage={s} canEdit={canEdit} onSaved={refresh} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function PipelineRow(props: {
  pipe: SalesPipeline;
  selected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(props.pipe.title);
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
      <Button
        type="button"
        size="sm"
        variant={props.selected ? "default" : "outline"}
        onClick={props.onSelect}
      >
        انتخاب
      </Button>
      <Input
        value={title}
        disabled={!props.canEdit}
        onChange={(e) => setTitle(e.target.value)}
        className="max-w-xs"
      />
      {!props.pipe.is_active ? <Badge variant="secondary">غیرفعال</Badge> : null}
      {props.canEdit ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              upsertSalesPipeline({ id: props.pipe.id, title: title.trim(), sort_order: props.pipe.sort_order, is_active: props.pipe.is_active })
                .then(() => {
                  toast.success("ذخیره شد");
                  props.onSaved();
                })
                .catch((e: Error) => toast.error(salesDeskErrorMessage(e.message)))
            }
          >
            ذخیره نام
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              upsertSalesPipeline({
                id: props.pipe.id,
                title: props.pipe.title,
                sort_order: props.pipe.sort_order,
                is_active: !props.pipe.is_active,
              })
                .then(props.onSaved)
                .catch((e: Error) => toast.error(salesDeskErrorMessage(e.message)))
            }
          >
            {props.pipe.is_active ? "غیرفعال" : "فعال"}
          </Button>
        </>
      ) : null}
    </li>
  );
}

function StageRow(props: { stage: SalesPipelineStage; canEdit: boolean; onSaved: () => void }) {
  const [title, setTitle] = useState(props.stage.title);
  const [order, setOrder] = useState(String(props.stage.sort_order));
  const [autoEvent, setAutoEvent] = useState<string>(props.stage.auto_event ?? "none");
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
      <Input
        value={title}
        disabled={!props.canEdit}
        onChange={(e) => setTitle(e.target.value)}
        className="max-w-xs"
      />
      <Input
        value={order}
        disabled={!props.canEdit}
        onChange={(e) => setOrder(e.target.value)}
        className="w-20"
        inputMode="numeric"
      />
      <Select
        value={autoEvent}
        disabled={!props.canEdit}
        onValueChange={setAutoEvent}
      >
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">بدون رویداد خودکار</SelectItem>
          <SelectItem value="quote_created">ساخت پیش‌فاکتور</SelectItem>
          <SelectItem value="quote_sent">ارسال پیش‌فاکتور</SelectItem>
        </SelectContent>
      </Select>
      {!props.stage.is_active ? <Badge variant="secondary">غیرفعال</Badge> : (
        <span className="text-xs text-muted-foreground">{autoEventLabel(props.stage.auto_event)}</span>
      )}
      {props.canEdit ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              upsertSalesPipelineStage({
                id: props.stage.id,
                pipeline_id: props.stage.pipeline_id,
                title: title.trim(),
                sort_order: Number(order) || props.stage.sort_order,
                is_active: props.stage.is_active,
                auto_event:
                  autoEvent === "quote_created" || autoEvent === "quote_sent"
                    ? autoEvent
                    : null,
              })
                .then(() => {
                  toast.success("ذخیره شد");
                  props.onSaved();
                })
                .catch((e: Error) => toast.error(salesDeskErrorMessage(e.message)))
            }
          >
            ذخیره
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              upsertSalesPipelineStage({
                id: props.stage.id,
                pipeline_id: props.stage.pipeline_id,
                title: props.stage.title,
                sort_order: props.stage.sort_order,
                is_active: !props.stage.is_active,
                auto_event: props.stage.auto_event,
              })
                .then(props.onSaved)
                .catch((e: Error) => toast.error(salesDeskErrorMessage(e.message)))
            }
          >
            {props.stage.is_active ? "غیرفعال" : "فعال"}
          </Button>
        </>
      ) : null}
    </li>
  );
}
