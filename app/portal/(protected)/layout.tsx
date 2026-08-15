import { redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";

// Same reasoning as app/admin/(protected)/layout.tsx: app/portal/login/
// deliberately sits outside this route group so a logged-out visitor
// doesn't get bounced to a login page that bounces them right back.
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const owner = await getCurrentBusinessOwner();

  if (!owner) {
    redirect("/portal/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <span className="font-medium">Mira for Business</span>
        <span className="ml-4 text-sm text-slate-500">{owner.email}</span>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  );
}
