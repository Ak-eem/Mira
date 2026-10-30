import { DashboardLink } from "@/components/DashboardLink";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { AdminSidebar } from "./AdminSidebar";
import { AdminSignOutButton } from "./AdminSignOutButton";
import { FeedbackProvider } from "@/components/ui/Feedback";

// Per-page titles: each page exports { title: "Businesses" } and the tab reads "Businesses | Mira Admin".
export const metadata = { title: { default: "Admin | Mira", template: "%s | Mira Admin" } };

// Everything under app/admin/(protected)/ goes through this gate.
// app/admin/login/ deliberately sits OUTSIDE this route group — if login
// were inside it, a logged-out visitor would be redirected to a login
// page that redirects them right back to login. Route groups (parens)
// don't affect the URL, so /admin still resolves to this group's page.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    redirect("/admin/login");
  }

  return (
    <FeedbackProvider>
    <div className="mira-wash min-h-screen">
      <header className="glass-panel-strong sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <DashboardLink scope="admin" className="font-semibold text-slate-900">
            Mira <span className="font-normal text-accent">Admin</span>
          </DashboardLink>
          <span className="truncate text-sm text-slate-500">{admin.email}</span>
        </div>
        <AdminSignOutButton />
      </header>
      <div className="flex w-full flex-col px-4 py-6 md:flex-row md:gap-6 md:px-6 md:py-8 lg:px-8">
        <AdminSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
    </FeedbackProvider>
  );
}
