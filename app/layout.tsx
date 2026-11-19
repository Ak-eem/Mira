import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#f3ecdd",
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://miraapp.com.ng";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Mira | Customer service for your business, day and night",
  description: "A 24/7 assistant on your website, WhatsApp and email that answers from your own products, policies and orders.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      <body className="bg-slate-50 text-slate-900">
        {children}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </body>
    </html>
  );
}
