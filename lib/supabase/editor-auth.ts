import { cache } from "react";
import { getCurrentAdmin } from "./admin-auth";
import { getCurrentBusinessOwner } from "./portal-auth";

export type CurrentEditor = { email: string };

// Who may use the shared knowledge editors (products, services, FAQs, policies,
// hours): a platform admin, or a business owner with the 'owner' role. This is a UX
// gate. The boundary is Row Level Security, which scopes every write to the
// caller's own business (see migration 0060), so an owner cannot touch another
// business even if they call these actions directly.
export const getCurrentEditor = cache(async (): Promise<CurrentEditor | null> => {
  const admin = await getCurrentAdmin();
  if (admin) return { email: admin.email };
  const owner = await getCurrentBusinessOwner();
  if (owner?.businesses.some((b) => b.role === "owner")) return { email: owner.email };
  return null;
});
