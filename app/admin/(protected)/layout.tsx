import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";
import { AdminSidebar } from "./AdminSidebar";

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
    <div className="mira-wash min-h-screen">
      <header className="glass-panel-strong sticky top-0 z-10 px-6 py-4">
        <Link href="/" className="font-semibold text-slate-900" aria-label="Mira home">
          Mira <span className="font-normal text-accent">Admin</span>
        </Link>
        <span className="ml-4 text-sm text-slate-400">{admin.email}</span>
      </header>
      <div className="flex w-full flex-col px-4 py-6 md:flex-row md:gap-6 md:px-6 md:py-8 lg:px-8">
        <AdminSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
