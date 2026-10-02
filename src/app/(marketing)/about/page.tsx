import { Card } from '@/components/ui/Card';
import Link from 'next/link';

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <Card className="mb-10 text-center">
        <h1 className="mb-4 font-serif text-4xl leading-tight text-ink sm:text-5xl">
          Why Time Tapestry
        </h1>
        <p className="font-serif text-xl text-ink-500">
          Generosity is a story before it is a gift.
        </p>
      </Card>

      <div className="space-y-8">
        <Card>
          <h2 className="mb-3 font-serif text-2xl text-ink">The problem</h2>
          <div className="space-y-3 font-serif text-lg leading-relaxed text-ink-500">
            <p>Generosity is declining. Connections between generations are breaking down.</p>
            <p>
              Families grow up scattered. Stories stay in the room where they were told, then disappear. The values and causes that shaped a lifetime are reduced to a name in a ledger.
            </p>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-serif text-2xl text-ink">The insight</h2>
          <p className="font-serif text-2xl leading-relaxed text-oxblood">
            Generosity is a story before it is a gift.
          </p>
          <p className="mt-3 text-ink-500">
            A person gives because they were shaped by moments, people, and convictions. When we capture the story, the giving makes sense for generations.
          </p>
        </Card>

        <Card>
          <h2 className="mb-3 font-serif text-2xl text-ink">The research</h2>
          <ul className="space-y-3 text-ink-500">
            <li className="flex gap-3">
              <span className="text-oxblood">{'//'}</span>
              <span>
                Women Give 2013 found that when children hear parents talk about giving, they are significantly more likely to give themselves.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-oxblood">{'//'}</span>
              <span>
                Barna research shows younger adults want to inherit values and purpose, not just assets.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-oxblood">{'//'}</span>
              <span>
                Most legacy tools preserve objects. Time Tapestry preserves the meaning behind them.
              </span>
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 font-serif text-2xl text-ink">The team</h2>
          <p className="mb-4 text-ink-500">
            Time Tapestry was founded by Kaelyn Brooks and Tayloe [last name], with one conviction: the stories that shape a family deserve better than a shelf.
          </p>
          <p className="text-ink-500">
            We are building tools that treat memory like what it is — a thread that can still weave people together, even after the storyteller is gone.
          </p>
        </Card>

        <Card className="bg-oxblood text-paper">
          <h2 className="mb-3 font-serif text-2xl text-paper">The mission</h2>
          <p className="font-serif text-2xl leading-relaxed">
            We weave the stories that matter.
          </p>
        </Card>
      </div>

      <div className="mt-10 text-center">
        <Link href="/" className="font-sans text-sm text-oxblood hover:underline">
          Return home
        </Link>
      </div>
    </main>
  );
}
