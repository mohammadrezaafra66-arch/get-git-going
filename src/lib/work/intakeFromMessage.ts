import type { CreateWorkItemInput, WorkItemKind } from "./types";

export interface ChatIntakeAnswers {
  kind?: WorkItemKind;
  priority?: CreateWorkItemInput["priority"];
  group_name?: string | null;
  section?: string | null;
  impact_if_missed?: string | null;
  acceptance_criteria?: string | null;
  /** Extra clarifying replies joined into intake_summary. */
  clarifications?: string[];
}

/**
 * Thin mapper for UI action «ثبت کار از این پیام».
 * Does not call the network — returns CreateWorkItemInput for createWorkItem.
 */
export function buildCreatePayloadFromChat(input: {
  messageText: string;
  optionalAnswers?: ChatIntakeAnswers;
}): CreateWorkItemInput {
  const text = String(input.messageText ?? "").trim();
  if (!text) throw new Error("متن پیام خالی است.");

  const answers = input.optionalAnswers ?? {};
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? text;
  const title =
    firstLine.length > 80 ? `${firstLine.slice(0, 77).trimEnd()}…` : firstLine;

  const clarifications = (answers.clarifications ?? [])
    .map((c) => c.trim())
    .filter(Boolean);
  const intake_summary = [text.slice(0, 500), ...clarifications]
    .filter(Boolean)
    .join("\n—\n");

  return {
    title,
    body: text,
    kind: answers.kind ?? "note",
    priority: answers.priority ?? "normal",
    group_name: answers.group_name ?? null,
    section: answers.section ?? null,
    intake_summary,
    intake_transcript: text,
    acceptance_criteria: answers.acceptance_criteria ?? null,
    impact_if_missed: answers.impact_if_missed ?? null,
    work_mode: "request",
    impact_level: "none",
  };
}
