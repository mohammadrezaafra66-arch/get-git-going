import { Link, useLocation } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { resolveNavigationMetadata } from "@/lib/navigation/metadata";

export function NavigationBreadcrumbs() {
  const location = useLocation();
  const metadata = resolveNavigationMetadata(location.pathname);
  if (metadata.breadcrumbs.length === 0) return null;

  return (
    <Breadcrumb className="mb-3 text-xs">
      <BreadcrumbList>
        {metadata.breadcrumbs.map((item, index) => {
          const isLast = index === metadata.breadcrumbs.length - 1;
          return (
            <BreadcrumbItem key={`${item.title}-${index}`}>
              {isLast || !item.route ? (
                <BreadcrumbPage className="text-xs">{item.title}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild className="text-xs">
                  <Link to={item.route}>{item.title}</Link>
                </BreadcrumbLink>
              )}
              {!isLast && <BreadcrumbSeparator />}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
