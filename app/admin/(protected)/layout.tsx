import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { AdminSidebar } from "./AdminSidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
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
    <ThemeProvider>
      <FeedbackProvider>
      <div className="mira-wash min-h-screen">
        <AdminSidebar email={admin.email} />
        <main className="min-w-0 overflow-x-clip px-5 py-6 min-[900px]:ml-[240px] min-[900px]:px-11 min-[900px]:py-9">{children}</main>
      </div>
      </FeedbackProvider>
    </ThemeProvider>
  );
}
