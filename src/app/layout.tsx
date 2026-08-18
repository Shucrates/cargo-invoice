import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Rudra Cargo - Digital LR & Billing System",
  description: "Digital Lorry Receipt (LR) & GST Tax Invoice Management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-100 text-slate-900 min-h-screen" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
