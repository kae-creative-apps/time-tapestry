import type { Metadata } from "next";
import { Quicksand, Inter } from "next/font/google";
import "./globals.css";
import { DemoBanner } from "@/components/DemoBanner";

const display = Quicksand({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://timetapestry.app"),
  title: "Time Tapestry | Stories woven together",
  description:
    "Share the stories, faith and values behind your life through a personal collection and four postcards.",
  referrer: "no-referrer",
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-paper-texture font-sans text-ink antialiased">
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
