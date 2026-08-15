import { redirect } from "next/navigation";
import { getCurrentBusinessOwner } from "@/lib/supabase/portal-auth";
import { SignOutButton } from "./SignOutButton";

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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <span className="text-base font-semibold tracking-tight text-slate-900">
            Mira <span className="font-normal text-accent">for Business</span>
          </span>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-400 sm:inline">{owner.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  );
}
