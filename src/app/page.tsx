import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import Link from "next/link";
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10 sm:py-16">
        <Logo />
        <div className="max-w-3xl pb-12 pt-16 sm:pt-24">
          <p className="mb-5 text-sm uppercase tracking-widest text-oxblood">
            Stories, faith and encouragement, passed on
          </p>
          <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-6xl">
            Leave a legacy you’re proud to share.
          </h1>
          <p className="my-7 max-w-2xl text-xl leading-relaxed text-ink-500">
            Share the moments that shaped your life and your walk with Jesus.
            Give someone you love four personal stories, with optional videos and
            postcards they can return to for encouragement.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/share"
              className="inline-flex min-h-14 items-center justify-center rounded-md bg-oxblood px-7 py-4 font-medium text-white"
            >
              Share my story
            </Link>
            <Link
              href="/request"
              className="inline-flex min-h-14 items-center justify-center rounded-md border border-warmgray-300 px-7 py-4 font-medium"
            >
              Request someone’s story
            </Link>
          </div>
          <p className="mt-5 text-sm text-ink-500">
            A hackathon pilot. You review everything before sharing.
          </p>
        </div>
        <ol className="grid gap-8 border-t border-warmgray-300 py-10 md:grid-cols-3">
          {[
            [
              "01",
              "Tell it in your own way.",
              "Speak, type or record video. Four questions help you remember specific moments and the values behind them.",
            ],
            [
              "02",
              "Make the story yours.",
              "Choose your recordings, review each story and add encouragement or Scripture you want to share.",
            ],
            [
              "03",
              "Give them reasons to return.",
              "The first postcard opens all four stories. Three more follow at months 3, 6 and 9, each returning to a different story.",
            ],
          ].map(([n, title, text]) => (
            <li key={n}>
              <p className="mb-3 text-sm text-oxblood">{n}</p>
              <h2 className="mb-3 font-serif text-2xl">{title}</h2>
              <p className="leading-relaxed text-ink-500">{text}</p>
            </li>
          ))}
        </ol>
      </main>
      <Footer />
    </div>
  );
}
