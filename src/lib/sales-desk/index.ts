/**
 * Sales-desk server/client helpers for UI (feature/sales-desk).
 *
 * Prefer these wrappers from React; staff RPCs use browser supabase (auth.uid()).
 * No public API routes invented — Issabel import already has service_role hooks.
 */
export {
  createSalesInteraction,
  linkSalesInteractionDeal,
  isMissingDealIdColumnError,
  updateSalesInteractionStatus,
  setSalesInteractionFollowUp,
  loadDealById,
  type CreateSalesInteractionInput,
  type SalesInteractionKind,
  type SalesInteractionStatus,
} from "./interactions";

export { salesDeskErrorMessage } from "./errors";

export {
  createDealInteractionSchema,
  parseCreateDealInteraction,
  type CreateDealInteractionParsed,
} from "./schema";

export {
  searchDealProducts,
  type DealProductSearchHit,
} from "./product-search";

export {
  insertSalesInteractionItems,
  listSalesInteractionItems,
  type SalesInteractionItemInput,
  type SalesInteractionItemRow,
} from "./items";

export {
  listDealLostReasons,
  createDealLostReason,
  setDealLostReasonActive,
  LOST_REASON_OTHER_TITLE,
  type DealLostReason,
} from "./lost-reasons";

export { fetchMyMonthStats, type SalesMyMonthStats } from "./stats";

export {
  listExtensionsForUser,
  fetchRecentInboundForPopup,
  fetchRecentRingEventsForPopup,
  fetchInboundPopupFeed,
  RECENT_CALLS_WINDOW_MS,
  RING_EVENTS_WINDOW_MS,
  RECENT_RING_EVENTS_WINDOW_MS,
  RECENT_CALLS_LIMIT,
  type RecentInboundCall,
} from "./recent-calls";

export {
  loadPerson,
  loadCustomersWithResponsible,
  loadRecentQuotesForPerson,
  loadInteractionsTimeline,
  loadCallLogsForPerson,
  loadSalesDossier,
  type DossierPerson,
  type DossierCustomerResponsible,
  type DossierQuote,
  type DossierInteraction,
  type DossierCallLog,
  type SalesDossierBundle,
} from "./dossier";

export {
  listSalesActivityTypes,
  createSalesActivity,
  markActivityDone,
  revertActivityDone,
  postponeActivityDue,
  setActivityReminder,
  listActivities,
  listOpenDueTodayOrOverdue,
  countOpenDueTodayOrOverdue,
  followUpLightsForDeals,
  dealIdsWithNoOpenActivity,
  listActivitiesForDeal,
  fetchTehranToday,
  bucketForDueAt,
  materializeDueActivityReminders,
  kindForActivitySortOrder,
  type SalesActivityType,
  type SalesActivityRow,
  type ActivityDoneFilter,
  type ActivityBucket,
  type FollowUpTrafficLight,
  type CreateSalesActivityInput,
} from "./activities";
