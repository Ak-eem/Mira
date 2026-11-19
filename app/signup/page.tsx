import SignupForm from "./SignupForm";
import { safeInvitePath } from "@/lib/inviteNext";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { email, next } = await searchParams;
  const initialEmail = typeof email === "string" ? email.slice(0, 320) : "";

  // A team invite sends people here to make an account; once they have one they go back to
  // the invite instead of setting up a business of their own.
  return <SignupForm initialEmail={initialEmail} inviteNext={safeInvitePath(next)} />;
}
