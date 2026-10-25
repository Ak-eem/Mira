// Where the "Mira" logo in a header should go: the dashboard you are working in, not the marketing site.
// Inside a business it is that business's dashboard; elsewhere it is the area's home.
export type DashboardScope = "admin" | "portal";

export function dashboardHref(scope: DashboardScope, businessId?: string | string[] | null): string {
  const id = Array.isArray(businessId) ? businessId[0] : businessId;
  if (scope === "admin") return id ? `/admin/businesses/${id}` : "/admin";
  return id ? `/portal/${id}` : "/portal";
}
