import type { Metadata } from 'next';
import { MarketingNav } from '@/components/MarketingNav';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Time Tapestry — Weaving the stories that matter',
  description: 'Stories passed down. Make them woven across time.',
  metadataBase: new URL('https://timetapestry.app'),
  openGraph: {
    title: 'Time Tapestry — Weaving the stories that matter',
    description: 'Stories passed down. Make them woven across time.',
    url: 'https://timetapestry.app',
    siteName: 'Time Tapestry',
    locale: 'en_US',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Time Tapestry — Weaving the stories that matter',
    description: 'Stories passed down. Make them woven across time.'
  },
  alternates: {
    canonical: 'https://timetapestry.app'
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function MarketingLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MarketingNav />
      <div className="pt-24">
        {children}
      </div>
      <Footer />
    </>
  );
}
