"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AdminSignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={handleSignOut} className="glass-hover rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700">
      Sign out
    </button>
  );
}
