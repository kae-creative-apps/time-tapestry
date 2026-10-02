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
  }
];

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <div className="mb-10 text-center">
        <p className="mb-3 font-sans text-xs uppercase tracking-[0.14em] text-oxblood-400">
          Pricing
        </p>
        <h1 className="mb-4 font-serif text-3xl leading-tight text-ink sm:text-4xl">
          Simple pricing for families.
        </h1>
        <p className="font-serif text-lg leading-relaxed text-ink-500">
          Start free. Grow into a Family story.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {tiers.map((tier) => (
          <Card key={tier.name} className="flex flex-col">
            <div className="mb-6 text-center">
              <h2 className="mb-2 font-serif text-xl text-ink">{tier.name}</h2>
              <p className="font-serif text-3xl text-oxblood">{tier.price}</p>
              <p className="mt-2 font-sans text-sm text-ink-400">{tier.description}</p>
            </div>
            <div className="flex-1">
              <p className="mb-3 font-sans text-xs font-medium uppercase tracking-[0.1em] text-ink-500">What&apos;s included</p>
              <ul className="mb-6 space-y-2 text-sm leading-relaxed text-ink-500">
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

    </main>
  );
}
