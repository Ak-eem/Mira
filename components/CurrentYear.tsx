"use client";

// The year is read in the browser so a page that was built last year does not keep showing last year.
export function CurrentYear() {
  return <span suppressHydrationWarning>{new Date().getFullYear()}</span>;
}
