"use client";

import { usePathname } from "next/navigation";
import { SignOutButton } from "./SignOutButton";

// Inside a business (/portal/<id>/...) the sidebar footer shows the account, so the
// header only shows it on the pages that have no sidebar (business picker, upgrade).
export function HeaderAccount({ email }: { email: string }) {
  const segment = usePathname().split("/")[2];
  if (segment && !["login", "signup", "upgrade"].includes(segment)) return null;
  return (
    <div className="flex items-center gap-4">
      <span className="hidden text-sm text-muted sm:inline">{email}</span>
      <SignOutButton />
    </div>
  );
}
