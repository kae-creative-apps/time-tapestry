import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Link from 'next/link';

const tiers = [
  {
    name: 'Free',
    price: 'Free',
    description: 'For one story, completed once.',
    audience: 'A family trying Time Tapestry for the first time.',
    cta: 'Start free',
    href: '/demo',
    features: [
      'Digital story keptake page',
      'Web keepsake to share or download',
      '1 postcard preview'
    ]
  },
  {
    name: 'Family',
    price: '$149',
    description: 'For a season of stories across one family.',
    audience: 'Families who want to keep one or more stories over time.',
    cta: 'Start a family story',
    href: '/request',
    features: [
      '5 postcards over 5 weeks',
      'Full digital keepsake',
      'Family tree access',
      'Private share links',
      'Reply and action prompts'
    ]
  },
  {
    name: 'Sponsor',
    price: 'Custom',
    description: 'For nonprofits and donor programs.',
    audience: 'Nonprofits stewarding major donors through legacy storytelling.',
    cta: 'See the org view',
    href: '/org',
    features: [
      'Nonprofit-branded experience',
      'Aggregated engagement dashboard',
      'No access to personal story content',
      'Pilot pricing available'
    ]
  }
];

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <div className="mb-10 text-center">
        <h1 className="mb-4 font-serif text-4xl leading-tight text-ink sm:text-5xl">
          Simple pricing for families and the nonprofits who serve them.
        </h1>
        <p className="font-serif text-xl text-ink-500">
          Start free. Grow into a Family story. Partner with us as a Sponsor.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {tiers.map((tier) => (
          <Card key={tier.name} className="flex flex-col">
            <div className="mb-6 text-center">
              <h2 className="mb-2 font-serif text-2xl text-ink">{tier.name}</h2>
              <p className="font-serif text-3xl text-oxblood">{tier.price}</p>
              <p className="mt-2 font-sans text-sm text-ink-400">{tier.description}</p>
            </div>
            <div className="flex-1">
              <p className="mb-3 font-sans text-sm font-medium text-ink-500">What&apos;s included</p>
              <ul className="mb-6 space-y-2 text-ink-500">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="text-oxblood">{'//'}</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <p className="mb-6 font-sans text-sm text-ink-400">{tier.audience}</p>
            </div>
            <Link href={tier.href} className="mt-auto block w-full">
              <Button className="w-full">{tier.cta}</Button>
            </Link>
          </Card>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Link href="/org" className="font-sans text-sm text-oxblood hover:underline">
          Learn more about nonprofit sponsorships
        </Link>
      </div>
    </main>
  );
}
