import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Rudra Cargo - Digital LR & Billing System",
  description: "Digital Lorry Receipt (LR) & GST Tax Invoice Management",
  icons: {
    icon: [
      { url: '/rudra-logo.png', sizes: 'any' },
      { url: '/rudra-logo.png', type: 'image/png' },
    ],
    shortcut: '/rudra-logo.png',
    apple: '/rudra-logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/rudra-logo.png" type="image/png" />
        <link rel="shortcut icon" href="/rudra-logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/rudra-logo.png" />
      </head>
      <body className="antialiased bg-slate-100 text-slate-900 min-h-screen" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
