/**
 * Sales-desk server/client helpers for UI (feature/sales-desk).
 *
 * Prefer these wrappers from React; staff RPCs use browser supabase (auth.uid()).
 * No public API routes invented — Issabel import already has service_role hooks.
 */
export {
  createSalesInteraction,
  linkSalesInteractionDeal,
  updateSalesInteractionStatus,
  setSalesInteractionFollowUp,
  type CreateSalesInteractionInput,
  type SalesInteractionKind,
  type SalesInteractionStatus,
} from "./interactions";

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
