import type { ComponentType } from "react";
import type { AppRole, ExtendedAction, ModuleKey } from "@/lib/rbac/roles";

export type NavigationPrimaryModule =
  | "dashboard"
  | "assistant"
  | "catalog"
  | "sales"
  | "finance"
  | "analytics"
  | "admin";

export type NavigationGroupKey =
  | "main"
  | "products-pricing"
  | "purchasing"
  | "sales-customers"
  | "finance"
  | "operations"
  | "reports"
  | "knowledge-comms"
  | "admin";

export type NavigationSubgroupKey =
  | "pp-catalog"
  | "pp-pricing"
  | "pp-publish"
  | "sc-sales"
  | "sc-customers"
  | "adm-users"
  | "adm-settings"
  | "adm-gamification"
  | "adm-tools";

export interface NavigationPermission {
  module: ModuleKey;
  action: ExtendedAction;
}

export interface NavigationBreadcrumb {
  title: string;
  parentId?: string;
}

export interface NavigationBadgeSource {
  id: "pending-users" | "pricing-recompute-queue";
}

export interface NavigationEntrySeed {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  module: ModuleKey;
  group: NavigationGroupKey;
  subgroup?: NavigationSubgroupKey;
  adminOnly?: boolean;
  allowedRoles?: AppRole[];
}

export interface NavigationEntry {
  id: string;
  title: string;
  route: string;
  module: ModuleKey;
  primaryModule: NavigationPrimaryModule;
  group: NavigationGroupKey;
  subgroup?: NavigationSubgroupKey;
  description: string;
  keywords: string[];
  icon: ComponentType<{ className?: string }>;
  permission: NavigationPermission;
  adminOnly?: boolean;
  allowedRoles?: AppRole[];
  pinnable: boolean;
  primaryForRoles: AppRole[];
  badgeSource?: NavigationBadgeSource;
  breadcrumb: NavigationBreadcrumb;
  mobileVisible: boolean;
  mobilePriority?: number;
  recentEligible: boolean;
  analyticsKey: string;
}

export interface NavigationSearchResult {
  entry: NavigationEntry;
  score: number;
  reason: "title-exact" | "title-prefix" | "title-contains" | "keyword" | "description" | "route";
}
