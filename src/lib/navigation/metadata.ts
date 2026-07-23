import { NAVIGATION_REGISTRY } from "./registry";
import type { NavigationEntry, NavigationGroupKey, NavigationPrimaryModule } from "./types";

export interface NavigationBreadcrumbNode {
  title: string;
  route?: string;
}

export interface NavigationRouteMetadata {
  title: string;
  shortTitle: string;
  description: string;
  route?: string;
  module: NavigationPrimaryModule;
  group: NavigationGroupKey;
  analyticsKey: string;
  entry?: NavigationEntry;
  breadcrumbs: NavigationBreadcrumbNode[];
  dynamic: boolean;
}

function bestPrefixEntry(pathname: string): NavigationEntry | undefined {
  return NAVIGATION_REGISTRY.filter(
    (entry) => pathname === entry.route || pathname.startsWith(entry.route + "/"),
  ).sort((a, b) => b.route.length - a.route.length)[0];
}

export function resolveNavigationMetadata(pathname: string): NavigationRouteMetadata {
  const cleanPath = pathname.split("?")[0]?.replace(/\/$/, "") || "/";
  const exact = NAVIGATION_REGISTRY.find((entry) => entry.route === cleanPath);
  const entry = exact ?? bestPrefixEntry(cleanPath);
  const dynamic = Boolean(entry && entry.route !== cleanPath);

  if (entry) {
    const breadcrumbs: NavigationBreadcrumbNode[] = dynamic
      ? [{ title: entry.title, route: entry.route }, { title: "جزئیات" }]
      : [{ title: entry.title, route: entry.route }];

    return {
      title: dynamic ? `${entry.title} - جزئیات` : entry.title,
      shortTitle: dynamic ? "جزئیات" : entry.title,
      description: entry.description,
      route: entry.route,
      module: entry.primaryModule,
      group: entry.group,
      analyticsKey: entry.analyticsKey,
      entry,
      breadcrumbs,
      dynamic,
    };
  }

  return {
    title: "صفحه",
    shortTitle: "صفحه",
    description: "Unknown application page",
    module: "dashboard",
    group: "main",
    analyticsKey: "nav.unknown",
    breadcrumbs: [{ title: "صفحه" }],
    dynamic: true,
  };
}
