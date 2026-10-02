import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { DemoBanner } from '@/components/DemoBanner';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap'
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap'
});

export const metadata: Metadata = {
  metadataBase: new URL('https://timetapestry.app'),
  title: 'Time Tapestry — Stories woven together',
  description: 'A quiet, guided interview that turns your memories into a keepsake for the people you love.',
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-paper-texture font-sans text-ink antialiased">
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
