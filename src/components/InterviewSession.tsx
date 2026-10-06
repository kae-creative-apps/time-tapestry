import Link from "next/link";

export function InterviewSession({ sessionId }: { sessionId: string }) {
  return (
    <section aria-labelledby="historical-interview-heading">
      <h1
        id="historical-interview-heading"
        className="font-serif text-3xl leading-tight text-ink"
      >
        This is an earlier interview.
      </h1>
      <p className="mt-5 text-lg leading-8 text-ink-500">
        This interview is closed to new answers. Your saved session is kept, and
        its review page still requires team access.
      </p>
      <p className="mt-4 text-lg leading-8 text-ink-500">
        Start a new story to record video with sound or audio only. Your films
        will use your own recorded voice.
      </p>
      <nav
        aria-label="Saved session and new recording"
        className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
      >
        <Link
          href={`/review/${encodeURIComponent(sessionId)}`}
          className="inline-flex min-h-12 items-center justify-center rounded-md border border-warmgray-300 px-5 py-3 font-medium text-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-oxblood"
        >
          View saved session
        </Link>
        <Link
          href="/share"
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-oxblood px-5 py-3 font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-oxblood"
        >
          Start a new recording
        </Link>
      </nav>
    </section>
  );
}
