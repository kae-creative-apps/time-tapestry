import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BrandArtwork } from "@/components/BrandArtwork";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-6 sm:px-10">
        <Logo className="[&_svg]:h-11 sm:[&_svg]:h-14" />
        <nav aria-label="Main navigation" className="flex items-center gap-6 text-sm font-medium">
          <Link href="#how-it-works" className="hidden items-center sm:inline-flex">How it works</Link>
          <Link href="/share" className="inline-flex items-center whitespace-nowrap rounded-md bg-espresso px-4 py-3 text-white transition-colors hover:bg-espresso-700">Share my story</Link>
        </nav>
      </header>
      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-10 px-6 pb-12 pt-5 sm:px-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:pb-20 lg:pt-10">
          <div className="max-w-xl py-4 lg:py-12">
            <p className="mb-6 text-sm font-medium tracking-wide text-taupe-600">Stories woven together</p>
            <h1 className="font-display text-5xl font-semibold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">What you gave lives on.</h1>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-ink-500 sm:text-xl">Share the stories, faith and generosity behind your life. Give someone you love a personal collection they can return to, with encouragement in the mail throughout the year.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/share" className="inline-flex min-h-14 items-center justify-center rounded-md bg-espresso px-6 py-4 font-medium text-white transition-colors hover:bg-espresso-700">Share my story <span aria-hidden="true" className="ml-4">↗</span></Link>
              <Link href="/request" className="inline-flex min-h-14 items-center justify-center rounded-md border border-warmgray-300 bg-white px-6 py-4 font-medium transition-colors hover:bg-paper-100">Request someone’s story</Link>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-ink-400">A hackathon pilot. You review everything before sharing.</p>
          </div>
          <figure className="relative overflow-hidden rounded-2xl bg-sage-100">
            <Image src="/brand/story-exchange.png" alt="Illustration of two generations passing a postcard across a table." width={1536} height={1024} priority sizes="(min-width: 1024px) 50vw, 100vw" className="aspect-[5/4] w-full object-cover lg:aspect-[4/5]" />
            <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-5 bg-espresso/95 px-7 py-6 text-white">
              <BrandArtwork variant="mark" className="h-12 w-12 shrink-0" />
              <span className="font-display text-xl font-medium leading-snug">A little of your story.<br />A lasting part of theirs.</span>
            </figcaption>
          </figure>
        </section>
        <section id="how-it-works" className="scroll-mt-8 border-y border-warmgray-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-14 sm:px-10 sm:py-20">
            <div className="mb-10 max-w-2xl">
              <p className="mb-3 text-sm font-medium text-taupe-600">From one conversation to a gift worth keeping</p>
              <h2 className="font-display text-3xl font-semibold sm:text-4xl">Your story, in your own words.</h2>
            </div>
            <ol className="grid gap-9 md:grid-cols-3 md:gap-12">
              {[
                ["01", "Take your time.", "A guided conversation helps you share the moments that shaped your life and your walk with Jesus. Speak, type or record video."],
                ["02", "Make it yours.", "Review your four stories, choose your recordings and add encouragement or Scripture you want to pass on."],
                ["03", "Keep the connection going.", "The first postcard opens the whole collection. Three more follow at months 3, 6 and 9, each inviting them back to a story."],
              ].map(([number, title, description]) => <li key={number}>
                <span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-sage-100 text-sm font-semibold text-espresso">{number}</span>
                <h3 className="mb-3 font-display text-2xl font-semibold">{title}</h3>
                <p className="max-w-sm leading-relaxed text-ink-500">{description}</p>
              </li>)}
            </ol>
          </div>
        </section>
        <section className="mx-auto grid max-w-7xl gap-8 px-6 py-14 sm:px-10 sm:py-20 md:grid-cols-[.75fr_1.25fr] md:items-center">
          <div className="flex min-h-56 items-center justify-center rounded-2xl bg-sage p-12"><BrandArtwork variant="mark" className="h-36 w-36 text-white" /></div>
          <div className="max-w-xl md:pl-10"><h2 className="font-display text-3xl font-semibold sm:text-4xl">Leave a legacy you’re proud to share.</h2><p className="mt-5 text-lg leading-relaxed text-ink-500">The kindness you received. The faith you lived. The things you hope they carry forward. There is room for all of it here.</p><Link href="/about" className="mt-5 inline-flex items-center font-medium underline decoration-clay underline-offset-4">Why we’re building Time Tapestry <span aria-hidden="true" className="ml-3">↗</span></Link></div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
