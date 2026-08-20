import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

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
    <html lang="en" className={`${inter.variable} ${geistSans.variable}`}>
      <head>
        <link rel="icon" href="/rudra-logo.png" type="image/png" />
        <link rel="shortcut icon" href="/rudra-logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/rudra-logo.png" />
      </head>
      <body className="antialiased bg-slate-100 text-slate-900 min-h-screen font-sans" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

