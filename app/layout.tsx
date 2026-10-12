import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { FooterGate } from "@/components/FooterGate";
import { SiteFooter } from "@/components/SiteFooter";

export const viewport: Viewport = {
  themeColor: "#f3ecdd",
};

export const metadata: Metadata = {
  title: "Mira | Customer service for your business, day and night",
  description: "A 24/7 assistant on your website, WhatsApp and email that answers from your own products, policies and orders.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body className="bg-slate-50 text-slate-900">
        {children}
        <FooterGate>
          <SiteFooter />
        </FooterGate>
      </body>
    </html>
  );
}
