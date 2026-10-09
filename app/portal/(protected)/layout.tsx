import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/site/ui";
import { SignOutButton } from "./SignOutButton";

// This layout only guards authentication. Business ownership is handled by the
// page below so authenticated users without a linked business get a useful
// empty state instead of being sent back to login in a loop.
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/login?next=/portal");
  }

  return (
    <div className="mira-wash min-h-screen">
      <header className="glass-panel-strong sticky top-0 z-10">
        <div className="flex w-full items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 text-ink" aria-label="Mira home">
            <Logo />
            <span className="text-sm text-muted">for Business</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-400 sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
