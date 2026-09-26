import { createFileRoute } from "@tanstack/react-router";
import { DealPipelineBoard } from "@/components/sales-desk/DealPipelineBoard";

export const Route = createFileRoute("/_app/deal/")({
  component: DealKanbanPage,
});

function DealKanbanPage() {
  return (
    <div className="deal-surface p-4">
      <DealPipelineBoard />
    </div>
  );
}
