import SignupForm from "./SignupForm";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { email } = await searchParams;
  const initialEmail = typeof email === "string" ? email.slice(0, 320) : "";

  return <SignupForm initialEmail={initialEmail} />;
}
