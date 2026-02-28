import "./globals.css";
import { Quicksand } from "next/font/google";
import { Providers } from "@/components/Providers";

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-quicksand",
});

export const metadata = {
  title: "aceL — Adaptive Learning",
  description: "AI-powered adaptive learning for students. Stuck with study? Let aceL help you.",
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
    <html lang="en" className={quicksand.variable}>
      <body className="min-h-screen min-h-[100dvh] font-sans antialiased bg-cream text-deep-charcoal leading-body">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
