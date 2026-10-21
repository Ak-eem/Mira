// What to call a customer in the owner's dashboard. The conversation's session token is an internal id
// ("web_c97c..."), never something to show a business owner.
export function customerLabel(sessionToken: string | null | undefined): string {
  if (!sessionToken) return "Website visitor";
  if (sessionToken.startsWith("email_")) return sessionToken.slice(6);
  if (sessionToken.startsWith("wa_")) return `+${sessionToken.slice(3)}`;
  return "Website visitor";
}
