import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/supabase/admin-auth";

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
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <span className="font-medium">Mira Admin</span>
        <span className="ml-4 text-sm text-slate-500">{admin.email}</span>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  );
}
