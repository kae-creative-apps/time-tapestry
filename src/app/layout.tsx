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
  title: 'Time Tapestry — Tell your story. Leave it for someone you love.',
  description: 'A guided interview that turns your memories into a keepsake for the next generation.',
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
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
