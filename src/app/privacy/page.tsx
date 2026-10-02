import { Card } from '@/components/ui/Card';
import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <Card className="mb-8">
        <h1 className="mb-6 font-serif text-3xl text-ink">
          Your family&apos;s stories belong to your family.
        </h1>
        <p className="text-ink-500">
          We built Time Tapestry around one promise: the stories you record here are yours. Not ours. Not a data broker&apos;s.
        </p>
      </Card>

      <div className="space-y-6">
        <Card>
          <h2 className="mb-3 font-serif text-xl text-ink">What we collect</h2>
          <p className="text-ink-500">
            Names, emails, interview audio, generated stories, and any replies or actions. That is it.
          </p>
        </Card>

        <Card>
          <h2 className="mb-3 font-serif text-xl text-ink">What we don&apos;t do</h2>
          <ul className="list-disc space-y-2 pl-5 text-ink-500">
            <li>We never sell your data.</li>
            <li>We never share your stories with third parties.</li>
            <li>We never use your stories to train AI models.</li>
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 font-serif text-xl text-ink">Your control</h2>
          <p className="text-ink-500">
            You can edit, delete, or download your data at any time. You can revoke access for family members. You can take your story down.
          </p>
        </Card>

        <Card>
          <h2 className="mb-3 font-serif text-xl text-ink">How we store data</h2>
          <p className="text-ink-500">
            Encrypted at rest. Stored with our hosting provider. Never shared with third parties.
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
