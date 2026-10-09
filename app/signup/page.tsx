import SignupForm from "./SignupForm";

// Server component so the form is rendered with the page (no blank flash) and the
// ?email= prefill can be read without a client-side effect.
export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { email } = await searchParams;
  const initialEmail = typeof email === "string" ? email.slice(0, 320) : "";
  return <SignupForm initialEmail={initialEmail} />;
}
