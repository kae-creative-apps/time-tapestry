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

const title = "Time Tapestry | A donor’s legacy of generosity";
const description =
  "For ministries, nonprofits, foundations, and advancement teams. Time Tapestry helps a major donor pass the story of their generosity — why they give, what it meant, and what they hope their family carries — to their children and grandchildren.";

export const metadata: Metadata = {
  metadataBase: new URL("https://timetapestry.app"),
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "Time Tapestry",
    type: "website",
    url: "https://timetapestry.app",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
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
