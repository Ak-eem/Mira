import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

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
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
