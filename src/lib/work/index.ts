/**
 * Calm Mind work domain — client helpers over work_* tables/RPCs.
 * Does not touch public.tasks.
 */

export type {
  WorkItem,
  WorkTopic,
  WorkMergeSuggestion,
  WorkMorningSummary,
  WorkItemStatus,
  WorkItemKind,
  WorkItemPriority,
  WorkDecisionBucket,
  WorkMode,
  WorkImpactLevel,
  WorkTopicStatus,
  WorkMergeSuggestionStatus,
  CreateWorkItemInput,
  UpdateWorkItemPatch,
  ListWorkItemsFilters,
  CreateWorkTopicInput,
  UpdateWorkTopicPatch,
} from "./types";

export { WORK_MERGE_SIMILARITY_THRESHOLD } from "./types";

export {
  listWorkItems,
  getWorkItem,
  createWorkItem,
  updateWorkItem,
} from "./items";

export {
  submitTestReport,
  listTestReports,
  type WorkTestVerdict,
  type WorkTestReport,
  type SubmitTestReportInput,
} from "./testReports";

export { getMorningSummary } from "./summary";

export { setDecisionBucket } from "./decision";

export {
  listMergeSuggestions,
  scanMergeSuggestions,
  enrichMergeSuggestionsWithBody,
  acceptMerge,
  dismissMerge,
} from "./merge";

export {
  listWorkTopics,
  getWorkTopic,
  createWorkTopic,
  updateWorkTopic,
  linkItemToTopic,
  unlinkItemFromTopic,
  unlinkItem,
} from "./topics";

export {
  normalizeWorkTokens,
  jaccardSimilarity,
  workItemSimilarityText,
  scoreWorkItems,
  meetsMergeThreshold,
} from "./similarity";

export {
  buildCreatePayloadFromChat,
  type ChatIntakeAnswers,
} from "./intakeFromMessage";

export { suggestTopicTitle } from "./suggestTopic";

export {
  classifyWorkItem,
  suggestTitleFromText,
  type ClassifyWorkInput,
  type ClassifyWorkResult,
} from "./classify";

export {
  INTAKE_OPEN_QUESTIONS,
  INTAKE_MCQ_QUESTIONS,
  INTAKE_ALL_QUESTIONS,
  localIntakeQuestionsForKind,
  buildIntakeTranscript,
  summarizeIntake,
  type IntakeQuestion,
  type IntakeQuestionOption,
  type IntakeQuestionType,
  type IntakeAnswer,
  type SummarizeIntakeOptions,
} from "./intake";

export { postIntakeQuestions } from "./intakeQuestionsPost";

export {
  listActiveTaxonomies,
  listTaxonomies,
  createTaxonomy,
  updateTaxonomy,
  softDeleteTaxonomy,
  type WorkTaxonomyKind,
  type WorkTaxonomy,
  type CreateWorkTaxonomyInput,
  type UpdateWorkTaxonomyPatch,
} from "./taxonomies";
