// The public footer belongs on marketing and account pages, not inside the app shells or the customer chat
// (the chat is also embedded in an iframe on other people's websites, where a footer would be clutter).
const HIDDEN_PREFIXES = ["/chat", "/admin", "/portal"];

export function shouldShowFooter(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  return !HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
