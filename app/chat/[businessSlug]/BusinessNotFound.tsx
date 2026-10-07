"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// How long "Business not found" stays readable before the next step happens.
const NOTICE_MS = 2500;

// Shown when a business is missing, inactive or cancelled.
//
// Standalone chat page (a shared link): message, then send the visitor to the
// Mira home page.
//
// Embedded in a customer's website (iframe): message, then ask the embed script
// to remove the chat bubble. It deliberately NEVER navigates the page: the
// owner's website belongs to the owner and their customers, and redirecting
// it to Mira's landing page would send those customers away from their site.
export function BusinessNotFound({ embed }: { embed: boolean }) {
  const pathname = usePathname();
  // On the home page itself (the live demo widget) there is nowhere to go.
  const goesHome = !embed && pathname !== "/";

  useEffect(() => {
    const framed = window.self !== window.top;

    const timer = window.setTimeout(() => {
      if (embed || framed) {
        // No data in the message, so the open target origin is safe.
        window.parent.postMessage({ type: "mira:unavailable" }, "*");
      } else if (goesHome) {
        window.location.replace("/");
      }
    }, NOTICE_MS);

    return () => window.clearTimeout(timer);
  }, [embed, goesHome]);

  return (
    <div className={embed ? "flex h-full items-center justify-center p-6" : "flex min-h-screen items-center justify-center p-6"}>
      <div role="alert" className="text-center">
        <p className="text-base font-semibold text-slate-900">Business not found</p>
        <p className="mt-1 text-sm text-slate-500">
          {goesHome ? "Taking you to the Mira home page…" : "This business is no longer available."}
        </p>
      </div>
    </div>
  );
}
