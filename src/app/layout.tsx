import "./globals.css";
import { Inter } from "next/font/google";
import { Providers } from "@/components/Providers";
import type { Metadata } from "next";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

const metadataBase = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "https://acel.app";

export const metadata: Metadata = {
  title: "AceL — Intelligent Learning Platform",
  description: "AceL — Intelligent Learning Platform",
  metadataBase: new URL(metadataBase),
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen min-h-[100dvh] font-sans antialiased bg-cream text-deep-charcoal leading-body">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
