import { Card } from '@/components/ui/Card';
import Link from 'next/link';

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <Card className="mb-8 text-center">
        <p className="mb-3 font-sans text-xs uppercase tracking-[0.14em] text-oxblood-400">
          About us
        </p>
        <h1 className="mb-4 font-serif text-3xl leading-tight text-ink sm:text-4xl">
          Why Time Tapestry
        </h1>
        <p className="font-serif text-lg leading-relaxed text-ink-500">
          Generosity is a story before it is a gift.
        </p>
      </Card>

      <div className="space-y-6">
        <Card className="border-l-4 border-l-oxblood">
          <h2 className="mb-3 font-serif text-xl text-ink">The problem</h2>
          <div className="space-y-3 leading-relaxed text-ink-500">
            <p>Generosity is declining. Connections between generations are breaking down.</p>
            <p>
              Families grow up scattered. Stories stay in the room where they were told, then disappear. The values and causes that shaped a lifetime are reduced to a name in a ledger.
            </p>
          </div>
        </Card>

        <Card className="border-l-4 border-l-oxblood">
          <h2 className="mb-3 font-serif text-xl text-ink">The insight</h2>
          <p className="font-serif text-lg leading-relaxed text-oxblood">
            Generosity is a story before it is a gift.
          </p>
          <p className="mt-3 leading-relaxed text-ink-500">
            A person gives because they were shaped by moments, people, and convictions. When we capture the story, the giving makes sense for generations.
          </p>
        </Card>

        <Card>
          <h2 className="mb-3 font-serif text-xl text-ink">The research</h2>
          <ul className="space-y-3 text-ink-500">
            <li className="flex gap-3">
              <span className="mt-1 text-oxblood">{'//'}</span>
              <span className="leading-relaxed">
                Women Give 2013 found that when children hear parents talk about giving, they are significantly more likely to give themselves.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 text-oxblood">{'//'}</span>
              <span className="leading-relaxed">
                Barna research shows younger adults want to inherit values and purpose, not just assets.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 text-oxblood">{'//'}</span>
              <span className="leading-relaxed">
                Most legacy tools preserve objects. Time Tapestry preserves the meaning behind them.
              </span>
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 font-serif text-xl text-ink">The team</h2>
          <div className="space-y-3 leading-relaxed text-ink-500">
            <p>
              Time Tapestry was founded by Kaelyn Brooks and Tayloe [last name], with one conviction: the stories that shape a family deserve better than a shelf.
            </p>
            <p>
              We are building tools that treat memory like what it is — a thread that can still weave people together, even after the storyteller is gone.
            </p>
          </div>
        </Card>

        <Card className="bg-oxblood text-paper">
          <p className="mb-3 font-sans text-[10px] uppercase tracking-[0.14em] opacity-80">
            Our mission
          </p>
          <p className="font-serif text-xl leading-relaxed text-paper sm:text-2xl">
            We weave the stories that matter.
          </p>
        </Card>
      </div>

      <div className="mt-10 text-center">
        <Link href="/" className="font-sans text-sm text-oxblood transition hover:text-oxblood-600">
          Return home
        </Link>
      </div>
    </main>
  );
}
